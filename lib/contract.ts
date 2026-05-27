import { Contract, nativeToScVal, scValToNative, xdr, TransactionBuilder as TB, Account } from "@stellar/stellar-sdk";
import { rpc, NETWORK, BASE_FEE } from "./stellar";
import type { PlayerVitals, Subscription, Player } from "@/types";
import { ContractError, ContractErrorCode } from "@/types";

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

/** Maps a raw contract error message to a typed {@link ContractError}, or re-throws unknown errors. */
function parseContractError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("UnauthorizedValidator") || msg.includes(`(${ContractErrorCode.UnauthorizedValidator})`))
    throw new ContractError(ContractErrorCode.UnauthorizedValidator, "Caller is not an approved validator");
  if (msg.includes("InvalidMilestone") || msg.includes(`(${ContractErrorCode.InvalidMilestone})`))
    throw new ContractError(ContractErrorCode.InvalidMilestone, "Milestone data is empty or malformed");
  if (msg.includes("PlayerNotFound") || msg.includes(`(${ContractErrorCode.PlayerNotFound})`))
    throw new ContractError(ContractErrorCode.PlayerNotFound, "Player ID does not exist");
  throw err;
}

/**
 * Approves a milestone for a player and returns the updated player profile.
 *
 * Builds and submits the `approve_milestone` transaction signed by the validator,
 * then fetches and returns the updated {@link Player} including the new milestone
 * and any progress level advancement.
 *
 * @param playerId - The ID of the player receiving the milestone.
 * @param milestone - The milestone description to record on-chain.
 * @param validator - The Stellar address of the approving validator.
 * @param signAndSubmit - Wallet callback that signs and submits the XDR transaction.
 * @returns The updated {@link Player} object after milestone approval.
 * @throws {@link ContractError} with code `UnauthorizedValidator (4)` if the caller is not an approved validator.
 * @throws {@link ContractError} with code `InvalidMilestone (5)` if the milestone data is empty or malformed.
 * @throws {@link ContractError} with code `PlayerNotFound (3)` if the player ID does not exist.
 */
export async function approveMilestone(
  playerId: string,
  milestone: string,
  validator: string,
  signAndSubmit: (xdr: string) => Promise<unknown>,
): Promise<Player> {
  try {
    const xdr = await buildApproveMilestone(validator, playerId, milestone);
    await signAndSubmit(xdr);
    return getPlayer(playerId) as Promise<Player>;
  } catch (err) {
    parseContractError(err);
  }
}

/**
 * Revokes a previously approved milestone from a player's profile.
 *
 * Builds and submits the `revoke_milestone` transaction signed by the validator or admin.
 *
 * @param playerId - The ID of the player whose milestone is being revoked.
 * @param milestoneId - The ID of the milestone to revoke.
 * @param callerKey - The Stellar address of the validator or admin performing the revocation.
 * @param signAndSubmit - Wallet callback that signs and submits the XDR transaction.
 * @returns Resolves when the revocation transaction is confirmed.
 * @throws {@link ContractError} with code `UnauthorizedValidator (4)` if the caller is not authorized.
 * @throws {@link ContractError} with code `InvalidMilestone (5)` if the milestone ID is invalid.
 * @throws {@link ContractError} with code `PlayerNotFound (3)` if the player ID does not exist.
 */
export async function revokeMilestone(
  playerId: string,
  milestoneId: string,
  callerKey: string,
  signAndSubmit: (xdr: string) => Promise<unknown>,
): Promise<void> {
  try {
    const xdr = await buildTx("revoke_milestone", [
      nativeToScVal(playerId, { type: "string" }),
      nativeToScVal(milestoneId, { type: "string" }),
    ], callerKey);
    await signAndSubmit(xdr);
  } catch (err) {
    parseContractError(err);
  }
}


// ── Scout ─────────────────────────────────────────────────────────────────────
export async function buildPayToContact(scoutKey: string, playerId: string) {
  return buildTx("pay_to_contact", [
    nativeToScVal(scoutKey, { type: "address" }),
    nativeToScVal(playerId, { type: "string" }),
  ], scoutKey);
}

export async function filterPlayers(region: string, position: string, minLevel: number) {
  return simulateTx("filter_players", [
    nativeToScVal(region, { type: "string" }),
    nativeToScVal(position, { type: "string" }),
    nativeToScVal(minLevel, { type: "u32" }),
  ]);
}

/**
 * Retrieves the active subscription for a scout.
 *
 * @param scout - The Stellar address of the scout.
 * @returns The scout's active {@link Subscription}, or `null` if none exists.
 */
export async function getSubscription(scout: string): Promise<Subscription | null> {
  const raw = await simulateTx("get_subscription", [nativeToScVal(scout, { type: "address" })]);
  if (!raw) return null;
  return {
    scout: raw.scout as string,
    tier: raw.tier as Subscription["tier"],
    expiry: raw.expiry as number,
  };
}
