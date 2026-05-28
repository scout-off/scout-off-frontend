import { Contract, nativeToScVal, scValToNative, xdr, TransactionBuilder as TB, Account } from "@stellar/stellar-sdk";
import { rpc, NETWORK, BASE_FEE } from "./stellar";
import type { PlayerVitals, ValidatorInfo, ContactDetails } from "@/types";

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID!;
const contract = new Contract(CONTRACT_ID);

// ── Write helper (requires a real funded account) ─────────────────────────────
async function buildTx(method: string, args: xdr.ScVal[], sourcePublicKey: string) {
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
  const dummyAccount = new Account("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN", "0");
  const tx = new TB(dummyAccount, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const result = await rpc.simulateTransaction(tx);
  if ("result" in result) return scValToNative(result.result!.retval);
  throw new Error(`Simulation failed: ${JSON.stringify(result)}`);
}

// ── Player ────────────────────────────────────────────────────────────────────
export async function buildRegisterPlayer(wallet: string, vitals: PlayerVitals, ipfsHash: string) {
  return buildTx("register_player", [
    nativeToScVal(wallet, { type: "address" }),
    nativeToScVal(vitals),
    nativeToScVal(ipfsHash, { type: "string" }),
  ], wallet);
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
export async function buildUpdateProfile(wallet: string, playerId: string, ipfsHash: string) {
  return buildTx("update_profile", [
    nativeToScVal(playerId, { type: "string" }),
    nativeToScVal(ipfsHash, { type: "string" }),
  ], wallet);
}

export async function getPlayer(playerId: string) {
  return simulateTx("get_player", [nativeToScVal(playerId, { type: "string" })]);
}

// ── Validator ─────────────────────────────────────────────────────────────────
export async function buildApproveMilestone(validatorKey: string, playerId: string, milestone: string) {
  return buildTx("approve_milestone", [
    nativeToScVal(playerId, { type: "string" }),
    nativeToScVal(milestone, { type: "string" }),
    nativeToScVal(validatorKey, { type: "address" }),
  ], validatorKey);
}

export async function checkIsValidator(address: string) {
  return simulateTx("is_validator", [nativeToScVal(address, { type: "address" })]);
}

export async function getMilestoneHistory(playerId: string) {
  return simulateTx("get_milestone_history", [nativeToScVal(playerId, { type: "string" })]);
}

export async function getContractHealth() {
  return simulateTx("health", []);
}

/**
 * Build a signed `register_player` transaction via Freighter and submit it.
 *
 * @param wallet - The player's Stellar public key (source + auth).
 * @param vitals - Player vitals: name, age, position, region, nationality.
 * @param ipfsHash - IPFS CID of the player's initial highlight reel.
 * @returns The new player ID string assigned by the contract.
 * @throws {ContractError} AlreadyInitialized (1) if the player is already registered.
 * @throws {ContractError} NotInitialized (2) if the contract has not been set up.
 */
export async function registerPlayer(
  wallet: string,
  vitals: PlayerVitals,
  ipfsHash: string
): Promise<string> {
  const { signTransaction } = await import("@stellar/freighter-api");
  const xdrTx = await buildTx(
    "register_player",
    [
      nativeToScVal(wallet, { type: "address" }),
      nativeToScVal(vitals),
      nativeToScVal(ipfsHash, { type: "string" }),
    ],
    wallet
  );
  const signedTxXdr = await signTransaction(xdrTx, { networkPassphrase: NETWORK });
  const { Transaction } = await import("@stellar/stellar-sdk");
  const result = await rpc.sendTransaction(new Transaction(signedTxXdr, NETWORK));
  if (result.status === "ERROR") throw new Error(`ContractError: ${JSON.stringify(result)}`);
  const getResult = await rpc.getTransaction(result.hash);
  if ("returnValue" in getResult) return scValToNative(getResult.returnValue!) as string;
  throw new Error(`ContractError: transaction did not return a value`);
}

export async function updateProfile(wallet: string, playerId: string, ipfsHash: string) {
  const { signTransaction } = await import("@stellar/freighter-api");
  const xdrTx = await buildTx(
    "update_profile",
    [
      nativeToScVal(playerId, { type: "string" }),
      nativeToScVal(ipfsHash, { type: "string" }),
    ],
    wallet
  );
  const signedTxXdr = await signTransaction(xdrTx, { networkPassphrase: NETWORK });
  const { Transaction } = await import("@stellar/stellar-sdk");
  const result = await rpc.sendTransaction(new Transaction(signedTxXdr, NETWORK));
  if (result.status === "ERROR") throw new Error(`ContractError: ${JSON.stringify(result)}`);
  return result;
}

// ── Scout ─────────────────────────────────────────────────────────────────────
export async function buildPayToContact(scoutKey: string, playerId: string) {
  return buildTx("pay_to_contact", [
    nativeToScVal(scoutKey, { type: "address" }),
    nativeToScVal(playerId, { type: "string" }),
  ], scoutKey);
}

/**
 * Execute a pay-to-contact transaction via Freighter and retrieve contact details.
 *
 * @param scoutKey - The scout's Stellar public key (source + auth).
 * @param playerId - The player ID to unlock contact details for.
 * @returns The ContactDetails (email, phone, telegram) for the player.
 * @throws {ContractError} SubscriptionExpired (11) if the scout's subscription is not active.
 * @throws {ContractError} InsufficientFee (3) if the subscription tier does not cover this action.
 * @throws {ContractError} NotInitialized (2) if the contract is not set up.
 */
export async function payToContact(scoutKey: string, playerId: string): Promise<ContactDetails> {
  const { signTransaction } = await import("@stellar/freighter-api");
  const xdrTx = await buildTx("pay_to_contact", [
    nativeToScVal(scoutKey, { type: "address" }),
    nativeToScVal(playerId, { type: "string" }),
  ], scoutKey);
  const signedTxXdr = await signTransaction(xdrTx, { networkPassphrase: NETWORK });
  const { Transaction } = await import("@stellar/stellar-sdk");
  const result = await rpc.sendTransaction(new Transaction(signedTxXdr, NETWORK));
  if (result.status === "ERROR") throw new Error(`ContractError: ${JSON.stringify(result)}`);
  const getResult = await rpc.getTransaction(result.hash);
  if ("returnValue" in getResult) return scValToNative(getResult.returnValue!) as ContactDetails;
  throw new Error(`ContractError: transaction did not return contact details`);
}

export async function filterPlayers(region: string, position: string, minLevel: number) {
  return simulateTx("filter_players", [
    nativeToScVal(region, { type: "string" }),
    nativeToScVal(position, { type: "string" }),
    nativeToScVal(minLevel, { type: "u32" }),
  ]);
}

/**
 * Retrieve all validators currently authorized in the contract.
 *
 * @returns An array of ValidatorInfo objects containing validator address and join timestamp.
 */
export async function getValidators(): Promise<ValidatorInfo[]> {
  return simulateTx("get_validators", []);
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
  return buildTx("add_validator", [
    nativeToScVal(address, { type: "address" }),
  ], adminKey);
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
  return buildTx("remove_validator", [
    nativeToScVal(address, { type: "address" }),
  ], adminKey);
}

export async function buildRevokeMilestone(validatorKey: string, playerId: string, milestoneId: string) {
  return buildTx("revoke_milestone", [
    nativeToScVal(playerId, { type: "string" }),
    nativeToScVal(milestoneId, { type: "string" }),
  ], validatorKey);
}

export async function getSubscription(scout: string) {
  return simulateTx("get_subscription", [nativeToScVal(scout, { type: "address" })]);
}

export async function buildSubscribe(scoutKey: string, tier: string) {
  return buildTx("subscribe", [
    nativeToScVal(scoutKey, { type: "address" }),
    nativeToScVal(tier, { type: "string" }),
  ], scoutKey);
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export async function getPlatformFees(): Promise<number> {
  return simulateTx("get_platform_fees", []);
}

export async function buildWithdrawFees(adminKey: string) {
  return buildTx("withdraw_fees", [
    nativeToScVal(adminKey, { type: "address" }),
  ], adminKey);
}

export async function buildPauseContract(adminKey: string) {
  return buildTx("pause_contract", [], adminKey);
}

export async function buildUnpauseContract(adminKey: string) {
  return buildTx("unpause_contract", [], adminKey);
}

export async function getContractPaused(): Promise<boolean> {
  return simulateTx("is_paused", []);
}
