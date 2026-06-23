import {
  Contract,
  nativeToScVal,
  scValToNative,
  xdr,
  TransactionBuilder as TB,
  Account,
} from '@stellar/stellar-sdk';
import { rpc, NETWORK, BASE_FEE, signAndSubmitTx } from './stellar';
import type {
  PlayerVitals,
  ValidatorInfo,
  ContactDetails,
  SubscriptionTier,
} from '@/types';

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID!;
const contract = new Contract(CONTRACT_ID);

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
  const prepared = await rpc.prepareTransaction(tx);
  return prepared.toXDR();
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

export async function getPlayer(playerId: string) {
  return simulateTx('get_player', [
    nativeToScVal(playerId, { type: 'string' }),
  ]);
}

// ── Validator ─────────────────────────────────────────────────────────────────
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

export async function checkIsValidator(address: string) {
  return simulateTx('is_validator', [
    nativeToScVal(address, { type: 'address' }),
  ]);
}

export async function getMilestoneHistory(playerId: string) {
  return simulateTx('get_milestone_history', [
    nativeToScVal(playerId, { type: 'string' }),
  ]);
}

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

export async function getSubscription(scout: string) {
  return simulateTx('get_subscription', [
    nativeToScVal(scout, { type: 'address' }),
  ]);
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export async function getPlatformFees(): Promise<number> {
  return simulateTx('get_platform_fees', []);
}

export async function buildWithdrawFees(adminKey: string) {
  return buildTx(
    'withdraw_fees',
    [nativeToScVal(adminKey, { type: 'address' })],
    adminKey,
  );
}

export async function buildPauseContract(adminKey: string) {
  return buildTx('pause_contract', [], adminKey);
}

export async function buildUnpauseContract(adminKey: string) {
  return buildTx('unpause_contract', [], adminKey);
}

export async function getContractPaused(): Promise<boolean> {
  return simulateTx('is_paused', []);
}
