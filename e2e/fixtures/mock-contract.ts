import type { Page } from '@playwright/test';
import {
  Keypair,
  nativeToScVal,
  Networks,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

const SOROBAN_RPC =
  process.env.NEXT_PUBLIC_SOROBAN_RPC || 'https://soroban-testnet.stellar.org';
const HORIZON =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const LATEST_LEDGER = 1_000;

/** A contract method's mocked return value, or a function computing it per call. */
export type ContractReturn = xdr.ScVal | ((args: xdr.ScVal[]) => xdr.ScVal);

export interface SimulateOptions {
  isValidator?: boolean;
  isPaused?: boolean;
  /** Accumulated platform fees in stroops. */
  platformFees?: number;
  player?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  /** Native balance Horizon reports for any account (default 1000 XLM). */
  xlmBalance?: string;
  /** Per-method overrides, merged over the defaults above. */
  returns?: Record<string, ContractReturn>;
}

export interface SorobanRpcMock {
  /** Contract methods simulated so far, in call order. */
  readonly simulated: string[];
  /** Contract methods submitted via sendTransaction, in call order. */
  readonly submitted: string[];
}

/**
 * A player in the shape lib/contract.ts's getPlayer hands to the UI (it
 * returns the contract value as-is, so the mock uses the app's `Player`).
 */
export const DEFAULT_PLAYER = {
  id: 'P12345',
  wallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  vitals: {
    name: 'Test Player',
    age: 25,
    position: 'ST',
    region: 'Nigeria',
    nationality: 'Nigeria',
  },
  ipfsHash: '',
  progressLevel: 1,
  milestones: [],
  createdAt: 1_700_000_000,
};

/** Plain JS → ScVal, with integers as u32 so scValToNative hands back numbers. */
export function scv(value: unknown): xdr.ScVal {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return nativeToScVal(value, { type: 'u32' });
  }
  if (Array.isArray(value)) return xdr.ScVal.scvVec(value.map(scv));
  if (value && typeof value === 'object') {
    return xdr.ScVal.scvMap(
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol(key),
              val: scv((value as Record<string, unknown>)[key]),
            }),
        ),
    );
  }
  return nativeToScVal(value);
}

/** The contract function a transaction envelope invokes, or null. */
function invokedMethod(envelopeXdr: string): string | null {
  try {
    const tx = TransactionBuilder.fromXDR(envelopeXdr, NETWORK_PASSPHRASE);
    const op = (tx as { operations?: Array<{ func?: xdr.HostFunction }> })
      .operations?.[0];
    return op?.func?.invokeContract().functionName().toString() ?? null;
  } catch {
    return null;
  }
}

function invokedArgs(envelopeXdr: string): xdr.ScVal[] {
  try {
    const tx = TransactionBuilder.fromXDR(envelopeXdr, NETWORK_PASSPHRASE);
    const op = (tx as { operations?: Array<{ func?: xdr.HostFunction }> })
      .operations?.[0];
    return op?.func?.invokeContract().args() ?? [];
  } catch {
    return [];
  }
}

function accountEntry(publicKey: string): xdr.LedgerEntryData {
  return xdr.LedgerEntryData.account(
    new xdr.AccountEntry({
      accountId: Keypair.fromPublicKey(publicKey).xdrAccountId(),
      balance: xdr.Int64.fromString('10000000000'),
      seqNum: xdr.SequenceNumber.fromString('1'),
      numSubEntries: 0,
      inflationDest: null,
      flags: 0,
      homeDomain: '',
      thresholds: Buffer.from([1, 0, 0, 0]),
      signers: [],
      ext: new xdr.AccountEntryExt(0),
    }),
  );
}

function successResultXdr(): string {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString('100'),
    result: xdr.TransactionResultResult.txSuccess([]),
    ext: new xdr.TransactionResultExt(0),
  }).toXDR('base64');
}

function successMetaXdr(returnValue: xdr.ScVal): string {
  return new xdr.TransactionMeta(
    3,
    new xdr.TransactionMetaV3({
      ext: new xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: new xdr.SorobanTransactionMetaExt(0),
        events: [],
        returnValue,
        diagnosticEvents: [],
      }),
    }),
  ).toXDR('base64');
}

/**
 * Stands in for the Soroban RPC server the browser talks to: answers the
 * JSON-RPC methods @stellar/stellar-sdk's `rpc.Server` actually calls
 * (simulateTransaction, getLedgerEntries, sendTransaction, getTransaction,
 * getLatestLedger, getNetwork, getHealth) with real XDR, so the app's own
 * decoding runs unmodified. Contract reads/writes return the per-method
 * values below. Only browser-side calls are intercepted — server routes
 * talking to RPC are unaffected.
 */
export function mockSorobanRpc(
  page: Page,
  opts: SimulateOptions = {},
): SorobanRpcMock {
  const {
    isValidator = true,
    isPaused = false,
    platformFees = 0,
    player = DEFAULT_PLAYER,
    subscription = {
      tier: 'pro',
      expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
    },
    xlmBalance = '1000.0000000',
  } = opts;

  const returns: Record<string, ContractReturn> = {
    get_contract_version: scv(1),
    is_validator: xdr.ScVal.scvBool(isValidator),
    is_paused: xdr.ScVal.scvBool(isPaused),
    get_validators: scv([]),
    get_platform_fees: scv(platformFees),
    get_player: scv(player),
    get_subscription: scv(subscription),
    get_milestone_history: scv([]),
    ...opts.returns,
  };

  const valueFor = (method: string | null, args: xdr.ScVal[]) => {
    const r = method ? returns[method] : undefined;
    if (!r) return xdr.ScVal.scvVoid();
    return typeof r === 'function' ? r(args) : r;
  };

  const simulated: string[] = [];
  const submitted: string[] = [];
  const sent = new Map<string, string>();
  const rpcHost = new URL(SOROBAN_RPC).host;

  void page.route(
    (url) => url.host === rpcHost,
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      let body: { id?: unknown; method?: string; params?: unknown } | null;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = null;
      }
      if (!body?.method) {
        await route.continue();
        return;
      }

      const params = (body.params ?? {}) as Record<string, unknown> & unknown[];
      const param = (name: string, index = 0) =>
        Array.isArray(params) ? params[index] : params[name];

      let result: unknown;
      switch (body.method) {
        case 'simulateTransaction': {
          const txXdr = String(param('transaction'));
          const method = invokedMethod(txXdr);
          if (method) simulated.push(method);
          result = {
            latestLedger: LATEST_LEDGER,
            minResourceFee: '100',
            transactionData: new SorobanDataBuilder().build().toXDR('base64'),
            results: [
              {
                auth: [],
                xdr: valueFor(method, invokedArgs(txXdr)).toXDR('base64'),
              },
            ],
            cost: { cpuInsns: '0', memBytes: '0' },
          };
          break;
        }
        case 'getLedgerEntries': {
          const keys = (param('keys') as string[] | undefined) ?? [];
          const entries = keys.flatMap((keyXdr) => {
            const key = xdr.LedgerKey.fromXDR(keyXdr, 'base64');
            if (key.switch().name !== 'account') return [];
            const publicKey = StrKey.encodeEd25519PublicKey(
              key.account().accountId().ed25519(),
            );
            return [
              {
                key: keyXdr,
                xdr: accountEntry(publicKey).toXDR('base64'),
                lastModifiedLedgerSeq: LATEST_LEDGER,
              },
            ];
          });
          result = { entries, latestLedger: LATEST_LEDGER };
          break;
        }
        case 'sendTransaction': {
          const txXdr = String(param('transaction'));
          const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
          const hash = tx.hash().toString('hex');
          const method = invokedMethod(txXdr);
          if (method) submitted.push(method);
          sent.set(hash, txXdr);
          result = {
            status: 'PENDING',
            hash,
            latestLedger: LATEST_LEDGER,
            latestLedgerCloseTime: String(Math.floor(Date.now() / 1000)),
          };
          break;
        }
        case 'getTransaction': {
          const hash = String(param('hash'));
          const txXdr = sent.get(hash);
          if (!txXdr) {
            result = { status: 'NOT_FOUND', latestLedger: LATEST_LEDGER };
            break;
          }
          const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
          result = {
            status: 'SUCCESS',
            latestLedger: LATEST_LEDGER,
            ledger: LATEST_LEDGER,
            createdAt: Math.floor(Date.now() / 1000),
            applicationOrder: 1,
            feeBump: false,
            envelopeXdr: tx.toEnvelope().toXDR('base64'),
            resultXdr: successResultXdr(),
            resultMetaXdr: successMetaXdr(
              valueFor(invokedMethod(txXdr), invokedArgs(txXdr)),
            ),
          };
          break;
        }
        case 'getLatestLedger':
          result = {
            id: 'e2e',
            protocolVersion: 21,
            sequence: LATEST_LEDGER,
          };
          break;
        case 'getNetwork':
          result = { passphrase: NETWORK_PASSPHRASE, protocolVersion: 21 };
          break;
        case 'getHealth':
          result = { status: 'healthy' };
          break;
        default:
          await route.continue();
          return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      });
    },
  );

  // Horizon account lookups (lib/stellar.ts getXLMBalance, pathPayment):
  // report every account as funded so fee/balance checks pass.
  const horizonHost = new URL(HORIZON).host;
  void page.route(
    (url) => url.host === horizonHost && url.pathname.startsWith('/accounts/'),
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[2];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id,
          account_id: id,
          sequence: '1',
          balances: [{ asset_type: 'native', balance: xlmBalance }],
        }),
      });
    },
  );

  return { simulated, submitted };
}
