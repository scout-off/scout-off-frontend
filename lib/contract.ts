import {
  Contract,
  nativeToScVal,
  scValToNative,
  xdr,
  TransactionBuilder as TB,
  Account,
} from '@stellar/stellar-sdk';
import { rpc, NETWORK, BASE_FEE, signAndSubmitTx } from './stellar';
import { ContractPausedError } from './errors';
import type {
  PlayerVitals,
  ValidatorInfo,
  ContactDetails,
  SubscriptionTier,
  TrialOfferDetails,
} from '@/types';

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID!;
const contract = new Contract(CONTRACT_ID);

/** XLM required to unlock a player's contact details via pay_to_contact. */
export const PLATFORM_CONTACT_FEE_XLM = 1;

/** Lazily import Sentry so it is never loaded in test/development environments. */
async function captureContractError(
  error: unknown,
  context: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development')
    return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.withScope((scope) => {
    scope.setContext('contract', context);
    Sentry.captureException(error);
  });
}

// ── Write helper (requires a real funded account) ─────────────────────────────
async function buildTx(
  method: string,
  args: xdr.ScVal[],
  sourcePublicKey: string,
) {
  const account = await rpc.getAccount(sourcePublicKey);
  const tx = new TB(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  try {
    const prepared = await rpc.prepareTransaction(tx);
    return prepared.toXDR();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Error(Contract, #9)') || msg.includes('ContractPaused')) {
      throw new ContractPausedError();
    }
    throw err;
  }
}

// ── Read-only helper (uses a dummy account — no ledger lookup needed) ─────────
async function simulateTx(method: string, args: xdr.ScVal[]) {
  const dummyAccount = new Account(
    'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    '0',
  );
  const tx = new TB(dummyAccount, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const result = await rpc.simulateTransaction(tx);
  if ('result' in result) return scValToNative(result.result!.retval);
  throw new Error(`Simulation failed: ${JSON.stringify(result)}`);
}

// ── Player ────────────────────────────────────────────────────────────────────

/**
 * Builds a `register_player` transaction XDR without signing or submitting it.
 *
 * Use this when you need the raw XDR for a multi-step signing flow. For the
 * common case of building, signing, and waiting for confirmation in a single
 * call, prefer {@link registerPlayer} instead.
 *
 * @param wallet   - The player's Stellar public key. Used as both the fee-payer
 *                   source account and the on-chain owner address for the new record.
 * @param vitals   - Player vital statistics (name, age, position, region, nationality).
 * @param ipfsHash - IPFS CID of the player's initial highlight-reel video.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} AlreadyInitialized (1) — A player record already exists for this wallet.
 * @throws {ContractError} NotInitialized (2)     — The contract has not been deployed or initialized.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildRegisterPlayer(
  wallet: string,
  vitals: PlayerVitals,
  ipfsHash: string,
) {
  return buildTx(
    'register_player',
    [
      nativeToScVal(wallet, { type: 'address' }),
      nativeToScVal(vitals),
      nativeToScVal(ipfsHash, { type: 'string' }),
    ],
    wallet,
  );
}

/**
 * Builds a transaction to update a player's IPFS media hash.
 *
 * @param wallet - The caller's wallet public key. Must match the player's registered wallet address.
 *                 Authorization is enforced on-chain; transactions from mismatched wallets will fail.
 * @param playerId - The unique identifier of the player to update.
 * @param ipfsHash - The new IPFS hash for the player's media content.
 * @returns A Promise that resolves to the XDR-encoded transaction string.
 *
 * @throws {ContractError} Throws error code 10 (Unauthorized) if the caller's wallet does not match
 *                         the player's registered wallet address. This check is performed on-chain
 *                         when the transaction is executed.
 */
export async function buildUpdateProfile(
  wallet: string,
  playerId: string,
  ipfsHash: string,
) {
  return buildTx(
    'update_profile',
    [
      nativeToScVal(playerId, { type: 'string' }),
      nativeToScVal(ipfsHash, { type: 'string' }),
    ],
    wallet,
  );
}

/**
 * Fetches a single player record from the contract by its unique ID.
 *
 * Player IDs are opaque strings assigned by the contract at registration time
 * (returned by {@link registerPlayer}). They are distinct from the player's
 * Stellar wallet address.
 *
 * The returned object is deserialized from the on-chain Soroban value and
 * conforms to the {@link Player} interface:
 * - `id`            — The player's unique contract identifier.
 * - `wallet`        — The player's registered Stellar public key.
 * - `vitals`        — Name, age, position, region, and nationality.
 * - `ipfsHash`      — IPFS CID of the most recently uploaded highlight reel.
 * - `progressLevel` — Current level (0 = Unverified … 3 = Elite Tier).
 * - `milestones`    — Ordered array of approved {@link Milestone} records.
 * - `createdAt`     — Unix timestamp (seconds) of the registration ledger close.
 *
 * @param playerId - The unique player identifier string, as returned by
 *                   {@link registerPlayer} or stored in a `Player.id` field.
 * @returns A Promise resolving to the full {@link Player} record.
 *
 * @throws {ContractError} PlayerNotFound (3) — No player exists with the given `playerId`.
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function getPlayer(playerId: string) {
  return simulateTx('get_player', [
    nativeToScVal(playerId, { type: 'string' }),
  ]);
}

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Builds an `approve_milestone` transaction XDR without signing or submitting it.
 *
 * The transaction increments the target player's `progressLevel` by one step and
 * records the milestone description and the approving validator's address on-chain.
 * Authorization is enforced by the contract: the caller must be listed as an active
 * validator at the time the signed transaction is executed.
 *
 * @param validatorKey - Stellar public key of the validator approving the milestone.
 *                       Must be registered in the contract via {@link buildAddValidator}.
 * @param playerId     - Unique identifier of the player whose milestone is being approved.
 * @param milestone    - Description string for the milestone (e.g. `"Professional contract signed"`).
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} UnauthorizedValidator (4) — The `validatorKey` is not an authorized validator.
 * @throws {ContractError} PlayerNotFound (3)        — No player exists with the given `playerId`.
 * @throws {ContractError} AlreadyAtLevel (6)        — The player has already reached the maximum progress level.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildApproveMilestone(
  validatorKey: string,
  playerId: string,
  milestone: string,
) {
  return buildTx(
    'approve_milestone',
    [
      nativeToScVal(playerId, { type: 'string' }),
      nativeToScVal(milestone, { type: 'string' }),
      nativeToScVal(validatorKey, { type: 'address' }),
    ],
    validatorKey,
  );
}

/**
 * Checks whether a Stellar address is currently registered as an authorized validator.
 *
 * This is a read-only simulation — no transaction is built or submitted.
 * Prefer this over filtering the result of {@link getValidators} when you only
 * need to test a single address, as it avoids fetching the full validator list.
 *
 * @param address - The Stellar public key to check.
 * @returns A Promise resolving to `true` if the address is an active validator,
 *          `false` otherwise.
 *
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function checkIsValidator(address: string) {
  return simulateTx('is_validator', [
    nativeToScVal(address, { type: 'address' }),
  ]);
}

/**
 * Retrieves the full milestone history for a player.
 *
 * Returns all approved {@link Milestone} records in ascending chronological order
 * (oldest first, sorted by `timestamp`). The array is empty for players with no
 * approved milestones yet.
 *
 * @param playerId - Unique identifier of the player whose milestone history is requested.
 * @returns A Promise resolving to an ordered array of {@link Milestone} records.
 *          Each entry includes `id`, `description`, `evidenceHash`, `validator`, and
 *          `timestamp` fields.
 *
 * @throws {ContractError} PlayerNotFound (3) — No player exists with the given `playerId`.
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function getMilestoneHistory(playerId: string) {
  return simulateTx('get_milestone_history', [
    nativeToScVal(playerId, { type: 'string' }),
  ]);
}

/**
 * Retrieves the contract's self-reported health status.
 *
 * Executes the `health` read-only contract method via simulation. The returned
 * value is the raw deserialized Soroban response — a truthy result indicates the
 * contract is live and responding normally. Callers should treat a falsy or thrown
 * result as a signal that the contract may be degraded or unreachable.
 *
 * This function does not check the paused state; use {@link getContractPaused}
 * to determine whether write operations are currently blocked.
 *
 * @returns A Promise resolving to the health status value reported by the contract.
 *          A truthy result indicates normal operation.
 *
 * @throws {Error} If the RPC simulation request fails, the contract is not deployed,
 *                 or the response cannot be deserialized.
 */
export async function getContractHealth() {
  return simulateTx('health', []);
}

/**
 * Build and sign a `register_player` transaction, submit it, and wait for confirmation.
 *
 * @param wallet - The player's Stellar public key (source + auth).
 * @param vitals - Player vitals: name, age, position, region, nationality.
 * @param ipfsHash - IPFS CID of the player's initial highlight reel.
 * @param signFn - Wallet-agnostic signing callback; receives the unsigned XDR and returns the signed XDR.
 * @returns The new player ID string assigned by the contract.
 * @throws {ContractError} AlreadyInitialized (1) if the player is already registered.
 * @throws {ContractError} NotInitialized (2) if the contract has not been set up.
 */
export async function registerPlayer(
  wallet: string,
  vitals: PlayerVitals,
  ipfsHash: string,
  signFn: (xdr: string) => Promise<string>,
): Promise<string> {
  const xdrTx = await buildTx(
    'register_player',
    [
      nativeToScVal(wallet, { type: 'address' }),
      nativeToScVal(vitals),
      nativeToScVal(ipfsHash, { type: 'string' }),
    ],
    wallet,
  );
  const result = await signAndSubmitTx(xdrTx, signFn);
  if ('returnValue' in result)
    return scValToNative(result.returnValue!) as string;
  throw new Error(`ContractError: transaction did not return a value`);
}

/**
 * Build and sign an `update_profile` transaction, submit it, and wait for confirmation.
 *
 * @param wallet - The caller's wallet public key (must match the player's registered address).
 * @param playerId - The unique identifier of the player to update.
 * @param ipfsHash - The new IPFS hash for the player's media content.
 * @param signFn - Wallet-agnostic signing callback; receives the unsigned XDR and returns the signed XDR.
 */
export async function updateProfile(
  wallet: string,
  playerId: string,
  ipfsHash: string,
  signFn: (xdr: string) => Promise<string>,
): Promise<void> {
  const xdrTx = await buildTx(
    'update_profile',
    [
      nativeToScVal(playerId, { type: 'string' }),
      nativeToScVal(ipfsHash, { type: 'string' }),
    ],
    wallet,
  );
  await signAndSubmitTx(xdrTx, signFn);
}

// ── Milestones ────────────────────────────────────────────────────────────────
export async function getMilestoneHistory(playerId: string) {
  return simulateTx("get_milestone_history", [nativeToScVal(playerId, { type: "string" })]);
}

// ── Scout ─────────────────────────────────────────────────────────────────────

/**
 * Contract error codes for scout payment flows.
 *
 * | Code | Name                | Description                                              |
 * |------|---------------------|----------------------------------------------------------|
 * |  7   | InsufficientFee     | The XLM fee sent is below the required amount for the    |
 * |      |                     | requested subscription tier or pay-to-contact action.    |
 * |  8   | SubscriptionExpired | The scout's active subscription has passed its expiry    |
 * |      |                     | timestamp and must be renewed before further access.     |
 * |  9   | ContractPaused      | The contract has been administratively paused; all write |
 * |      |                     | operations are blocked until it is unpaused.             |
 */
export const SCOUT_ERROR_CODES = {
  InsufficientFee: 7,
  SubscriptionExpired: 8,
  ContractPaused: 9,
} as const;

/**
 * Builds a `pay_to_contact` transaction XDR without signing or submitting it.
 *
 * Use this when you need the raw XDR for a multi-step signing flow. For the
 * common case of building, signing, waiting for confirmation, and receiving
 * the contact details in one call, prefer {@link payToContact} instead.
 *
 * @param scoutKey - The scout's Stellar public key. Used as both the fee-payer
 *                   source account and the on-chain authorization signer.
 * @param playerId - Unique identifier of the player whose contact details should be unlocked.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} InsufficientFee (7)     — The XLM amount attached during preparation
 *                                                    is below the required fee for this action.
 * @throws {ContractError} SubscriptionExpired (8) — The scout's active subscription has expired
 *                                                    and must be renewed before contacting players.
 * @throws {ContractError} ContractPaused (9)      — All write operations are blocked while the
 *                                                    contract is administratively paused.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildPayToContact(scoutKey: string, playerId: string) {
  return buildTx(
    'pay_to_contact',
    [
      nativeToScVal(scoutKey, { type: 'address' }),
      nativeToScVal(playerId, { type: 'string' }),
    ],
    scoutKey,
  );
}

/**
 * Builds a `log_trial_offer` transaction XDR without signing or submitting it.
 *
 * Records a scout's trial, loan, or transfer offer against a player on-chain,
 * creating an immutable offer log entry visible to both parties. The scout must
 * hold an active, non-expired subscription at the time the signed transaction
 * is executed.
 *
 * @param scoutKey - The scout's Stellar public key (source account + auth signer).
 * @param playerId - Unique identifier of the player receiving the offer.
 * @param details  - Offer details including `clubName`, `offerType` (`"trial"` | `"loan"` | `"transfer"`),
 *                   and an optional `message`.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} PlayerNotFound (3)      — No player exists with the given `playerId`.
 * @throws {ContractError} SubscriptionExpired (8) — The scout's subscription has expired and
 *                                                    must be renewed before logging offers.
 * @throws {ContractError} ContractPaused (9)      — All write operations are blocked while the
 *                                                    contract is administratively paused.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildLogTrialOffer(
  scoutKey: string,
  playerId: string,
  details: TrialOfferDetails,
) {
  return buildTx(
    'log_trial_offer',
    [
      nativeToScVal(scoutKey, { type: 'address' }),
      nativeToScVal(playerId, { type: 'string' }),
      nativeToScVal(details),
    ],
    scoutKey,
  );
}

/**
 * Subscribe a scout to a tier by signing and submitting the transaction.
 *
 * The function handles XLM fee approval by preparing the transaction through the RPC
 * node (which attaches the required fee footprint) before signing. The signed transaction
 * is then submitted to the network and polled until confirmed.
 *
 * @param scout - The scout's Stellar public key (source account + auth signer).
 * @param tier  - The subscription tier to purchase: `"basic"`, `"pro"`, or `"elite"`.
 * @param signFn - Wallet-agnostic signing callback; receives the unsigned XDR and returns the signed XDR.
 * @returns A Promise that resolves when the subscription transaction is confirmed.
 *
 * @throws {ContractError} InsufficientFee (7)     — The XLM amount attached is below the
 *                                                    required fee for the chosen tier.
 * @throws {ContractError} SubscriptionExpired (8) — An existing subscription has expired;
 *                                                    the contract requires a fresh purchase.
 * @throws {ContractError} ContractPaused (9)      — All write operations are blocked while
 *                                                    the contract is administratively paused.
 */
export async function subscribe(
  scout: string,
  tier: SubscriptionTier,
  signFn: (xdr: string) => Promise<string>,
): Promise<void> {
  const xdrTx = await buildTx(
    'subscribe',
    [
      nativeToScVal(scout, { type: 'address' }),
      nativeToScVal(tier, { type: 'string' }),
    ],
    scout,
  );
  await signAndSubmitTx(xdrTx, signFn);
}

/**
 * Pay to unlock a player's contact details, signing and submitting the transaction.
 *
 * The function handles XLM fee approval by preparing the transaction through the RPC
 * node before signing. On success the contract returns the player's `ContactDetails` object.
 *
 * @param scout    - The scout's Stellar public key (source account + auth signer).
 * @param playerID - The unique player ID whose contact details should be unlocked.
 * @param signFn   - Wallet-agnostic signing callback; receives the unsigned XDR and returns the signed XDR.
 * @returns A Promise resolving to the player's {@link ContactDetails} (email, phone, telegram).
 *
 * @throws {ContractError} InsufficientFee (7)     — The XLM fee attached is below the
 *                                                    required amount for this action.
 * @throws {ContractError} SubscriptionExpired (8) — The scout's subscription has expired
 *                                                    and must be renewed before contacting players.
 * @throws {ContractError} ContractPaused (9)      — All write operations are blocked while
 *                                                    the contract is administratively paused.
 */
export async function payToContact(
  scout: string,
  playerID: string,
  signFn: (xdr: string) => Promise<string>,
): Promise<ContactDetails> {
  const xdrTx = await buildTx(
    'pay_to_contact',
    [
      nativeToScVal(scout, { type: 'address' }),
      nativeToScVal(playerID, { type: 'string' }),
    ],
    scout,
  );
  const result = await signAndSubmitTx(xdrTx, signFn);
  if ('returnValue' in result) {
    return scValToNative(result.returnValue!) as ContactDetails;
  }
  throw new Error(`ContractError: payToContact did not return contact details`);
}

/**
 * Queries the contract for players matching all supplied filter criteria.
 *
 * All three parameters are required by the contract ABI. Pass an empty string
 * for `region` or `position` to match players regardless of that field. Pass
 * `0` for `minLevel` to include players at every progress level.
 *
 * This is a read-only simulation — no transaction is built or submitted.
 *
 * @param region   - Geographic region to filter by (e.g. `"West Africa"`).
 *                   Pass `""` to include players from all regions.
 * @param position - Playing position to filter by (e.g. `"Forward"`).
 *                   Pass `""` to include players of all positions.
 * @param minLevel - Minimum {@link ProgressLevel} a player must have reached
 *                   (0 = Unverified, 1 = Verified Identity, 2 = Performance Milestones,
 *                   3 = Elite Tier). Pass `0` to return players at all levels.
 * @returns A Promise resolving to an array of {@link Player} records that satisfy
 *          all three criteria. Returns an empty array when no players match.
 *
 * @throws {ContractError} ContractPaused (9) — All operations are blocked while the
 *                                               contract is administratively paused.
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function filterPlayers(
  region: string,
  position: string,
  minLevel: number,
) {
  return simulateTx('filter_players', [
    nativeToScVal(region, { type: 'string' }),
    nativeToScVal(position, { type: 'string' }),
    nativeToScVal(minLevel, { type: 'u32' }),
  ]);
}

/**
 * Retrieve all validators currently authorized in the contract.
 *
 * @returns An array of ValidatorInfo objects containing validator address and join timestamp.
 */
export async function getValidators(): Promise<ValidatorInfo[]> {
  return simulateTx('get_validators', []);
}

/**
 * Build a transaction to add a new validator to the contract.
 * Only callable by the contract admin wallet.
 *
 * @param adminKey - The admin wallet's Stellar public key.
 * @param address - The Stellar public key of the validator to add.
 * @returns The prepared transaction XDR for signing.
 * @throws {ContractError} Unauthorized (10) if called by a non-admin wallet.
 */
export async function buildAddValidator(adminKey: string, address: string) {
  return buildTx(
    'add_validator',
    [nativeToScVal(address, { type: 'address' })],
    adminKey,
  );
}

/**
 * Build a transaction to remove a validator from the contract.
 * Only callable by the contract admin wallet.
 *
 * @param adminKey - The admin wallet's Stellar public key.
 * @param address - The Stellar public key of the validator to remove.
 * @returns The prepared transaction XDR for signing.
 * @throws {ContractError} Unauthorized (10) if called by a non-admin wallet.
 */
export async function buildRemoveValidator(adminKey: string, address: string) {
  return buildTx(
    'remove_validator',
    [nativeToScVal(address, { type: 'address' })],
    adminKey,
  );
}

/**
 * Builds a `revoke_milestone` transaction XDR without signing or submitting it.
 *
 * Revoking a milestone removes the milestone record from the player's history and
 * decrements their `progressLevel` by one step. This operation requires validator
 * or admin authorization; the contract rejects the signed transaction if the caller
 * is neither an active validator nor the contract admin.
 *
 * @param validatorKey - Stellar public key of the validator or admin initiating the
 *                       revocation. Must be registered via {@link buildAddValidator}
 *                       or be the contract's admin wallet.
 * @param playerId     - Unique identifier of the player whose milestone is being revoked.
 * @param milestoneId  - The `id` field of the {@link Milestone} record to revoke.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} UnauthorizedValidator (4) — The `validatorKey` is neither an
 *                                                      authorized validator nor the contract admin.
 * @throws {ContractError} PlayerNotFound (3)        — No player exists with the given `playerId`.
 * @throws {ContractError} InvalidMilestone (5)      — No milestone with `milestoneId` exists
 *                                                      on the player's record.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildRevokeMilestone(
  validatorKey: string,
  playerId: string,
  milestoneId: string,
) {
  return buildTx(
    'revoke_milestone',
    [
      nativeToScVal(playerId, { type: 'string' }),
      nativeToScVal(milestoneId, { type: 'string' }),
    ],
    validatorKey,
  );
}

/**
 * Fetches the active subscription record for a scout.
 *
 * Returns `null` (via the `??` guard in callers) when the scout has never
 * subscribed or when their record has been cleared from contract storage.
 * Callers should compare `expiresAt` against `Date.now() / 1000` to determine
 * whether the subscription is still valid.
 *
 * This is a read-only simulation — no transaction is built or submitted.
 *
 * @param scout - The scout's Stellar public key.
 * @returns A Promise resolving to the scout's {@link Subscription} record
 *          (`{ scout, tier, expiresAt }`) or `null` if no record exists.
 *
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function getSubscription(scout: string) {
  return simulateTx('get_subscription', [
    nativeToScVal(scout, { type: 'address' }),
  ]);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * Retrieves the total platform fees accumulated in the contract treasury.
 *
 * Fees are collected in XLM stroops (1 XLM = 10,000,000 stroops) every time a
 * scout completes a `pay_to_contact` or `subscribe` transaction. Only the admin
 * wallet can withdraw them via {@link buildWithdrawFees}.
 *
 * This is a read-only simulation — no transaction is built or submitted.
 *
 * @returns A Promise resolving to the total accumulated fees as a number (in stroops).
 *          Returns `0` when no fees have been collected yet.
 *
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function getPlatformFees(): Promise<number> {
  return simulateTx('get_platform_fees', []);
}

/**
 * Builds a `withdraw_fees` transaction XDR without signing or submitting it.
 *
 * Admin-only operation. Transfers all accumulated platform fees from the contract
 * treasury to the admin wallet. The contract rejects the signed transaction if
 * the caller is not the registered admin or if there are no fees to withdraw.
 *
 * @param adminKey - The admin wallet's Stellar public key. Used as both the
 *                   fee-payer source account and the on-chain authorization signer.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} Unauthorized (10)     — The `adminKey` does not match the contract's
 *                                                  registered admin wallet.
 * @throws {ContractError} NoFeesToWithdraw (11) — The contract treasury balance is zero;
 *                                                  there are no fees available to withdraw.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildWithdrawFees(adminKey: string) {
  return buildTx(
    'withdraw_fees',
    [nativeToScVal(adminKey, { type: 'address' })],
    adminKey,
  );
}

/**
 * Builds a `pause_contract` transaction XDR without signing or submitting it.
 *
 * Admin-only operation. When the signed transaction is executed, all write
 * operations on the contract (subscriptions, pay-to-contact, milestone approvals,
 * and revocations) are blocked until the contract is unpaused via
 * {@link buildUnpauseContract}. Read-only calls such as {@link getPlayer} and
 * {@link filterPlayers} remain available while the contract is paused.
 *
 * @param adminKey - The admin wallet's Stellar public key. Used as both the
 *                   fee-payer source account and the on-chain authorization signer.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} Unauthorized (10)  — The `adminKey` does not match the contract's
 *                                               registered admin wallet.
 * @throws {ContractError} ContractPaused (9) — The contract is already paused; calling pause
 *                                               again is a no-op error.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildPauseContract(adminKey: string) {
  return buildTx('pause_contract', [], adminKey);
}

/**
 * Builds an `unpause_contract` transaction XDR without signing or submitting it.
 *
 * Admin-only operation. Reverses a previous {@link buildPauseContract} call,
 * re-enabling all write operations on the contract. If the contract is not
 * currently paused, the signed transaction will be rejected by the contract.
 *
 * @param adminKey - The admin wallet's Stellar public key. Used as both the
 *                   fee-payer source account and the on-chain authorization signer.
 * @returns A Promise resolving to the XDR-encoded transaction string, ready for wallet signing.
 *
 * @throws {ContractError} Unauthorized (10) — The `adminKey` does not match the contract's
 *                                              registered admin wallet.
 * @throws {Error} If the RPC node cannot fetch the source account or prepare the transaction.
 */
export async function buildUnpauseContract(adminKey: string) {
  return buildTx('unpause_contract', [], adminKey);
}

/**
 * Checks whether the contract is currently in a paused state.
 *
 * When the contract is paused all write operations are blocked and any attempt
 * to execute a write transaction will throw {@link ContractError} ContractPaused (9).
 * Read-only operations (e.g. {@link getPlayer}, {@link filterPlayers}) continue
 * to work normally while the contract is paused.
 *
 * Use this alongside {@link getContractHealth} when deciding whether to show
 * the maintenance banner or disable write-action buttons in the UI.
 *
 * This is a read-only simulation — no transaction is built or submitted.
 *
 * @returns A Promise resolving to `true` if the contract is paused and write
 *          operations are blocked, or `false` if the contract is operating normally.
 *
 * @throws {Error} If the RPC simulation request fails or returns an unexpected result.
 */
export async function getContractPaused(): Promise<boolean> {
  return simulateTx('is_paused', []);
}
