import { Contract, nativeToScVal, scValToNative, xdr, TransactionBuilder as TB, Account } from "@stellar/stellar-sdk";
import { rpc, NETWORK, BASE_FEE } from "./stellar";
import type { PlayerVitals, Subscription } from "@/types";

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
