/**
 * Unit tests for client-side SEP-10 challenge validation.
 *
 * Builds real challenge XDRs with @stellar/stellar-sdk's WebAuth.buildChallengeTx
 * (same parameters as app/api/auth/sep10/route.ts) and adversarial forgeries
 * via TransactionBuilder.
 */

import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  WebAuth,
} from '@stellar/stellar-sdk';
import {
  CLOCK_SKEW_ALLOWANCE_SEC,
  MAX_CHALLENGE_TIMEBOUNDS_SEC,
  validateSep10Challenge,
} from '@/lib/sep10Validation';

const NETWORK = Networks.TESTNET;
const HOME_DOMAIN = 'localhost:3000';

const serverKeypair = Keypair.random();
const clientKeypair = Keypair.random();
const otherKeypair = Keypair.random();

const SERVER_ACCOUNT = serverKeypair.publicKey();
const CLIENT_ACCOUNT = clientKeypair.publicKey();

function buildLegitimateChallenge(
  overrides: {
    clientAccount?: string;
    homeDomain?: string;
    webAuthDomain?: string;
    timeoutSec?: number;
    server?: Keypair;
  } = {},
): string {
  return WebAuth.buildChallengeTx(
    overrides.server ?? serverKeypair,
    overrides.clientAccount ?? CLIENT_ACCOUNT,
    overrides.homeDomain ?? HOME_DOMAIN,
    overrides.timeoutSec ?? 300,
    NETWORK,
    overrides.webAuthDomain ?? overrides.homeDomain ?? HOME_DOMAIN,
  );
}

function validate(
  xdr: string,
  overrides: Partial<{
    clientAccount: string;
    serverAccount: string;
    homeDomain: string;
    nowSec: number;
  }> = {},
) {
  return validateSep10Challenge({
    challengeXdr: xdr,
    clientAccount: overrides.clientAccount ?? CLIENT_ACCOUNT,
    serverAccount: overrides.serverAccount ?? SERVER_ACCOUNT,
    homeDomain: overrides.homeDomain ?? HOME_DOMAIN,
    networkPassphrase: NETWORK,
    nowSec: overrides.nowSec,
  });
}

function buildAuthShapedTx(opts: {
  sequence?: string;
  minTime: number;
  maxTime: number;
  fee?: string;
  firstOpSource?: string;
  authName?: string;
  includeWebAuth?: boolean;
  extraOps?: ReturnType<typeof Operation.payment>[];
}): string {
  const account = new Account(SERVER_ACCOUNT, opts.sequence ?? '-1');
  let builder = new TransactionBuilder(account, {
    fee: opts.fee ?? BASE_FEE,
    networkPassphrase: NETWORK,
    timebounds: { minTime: opts.minTime, maxTime: opts.maxTime },
  }).addOperation(
    Operation.manageData({
      source: opts.firstOpSource ?? CLIENT_ACCOUNT,
      name: opts.authName ?? `${HOME_DOMAIN} auth`,
      value: 'test-nonce',
    }),
  );

  if (opts.includeWebAuth !== false) {
    builder = builder.addOperation(
      Operation.manageData({
        source: SERVER_ACCOUNT,
        name: 'web_auth_domain',
        value: HOME_DOMAIN,
      }),
    );
  }

  for (const op of opts.extraOps ?? []) {
    builder = builder.addOperation(op);
  }

  const tx = builder.build();
  tx.sign(serverKeypair);
  return tx.toXDR();
}

describe('validateSep10Challenge', () => {
  it('accepts a legitimate challenge from buildChallengeTx (same params as route.ts)', () => {
    const xdr = buildLegitimateChallenge();
    expect(validate(xdr)).toEqual({ valid: true });
  });

  it('rejects a challenge with the wrong source (server) account', () => {
    const xdr = buildLegitimateChallenge();
    const result = validate(xdr, {
      serverAccount: otherKeypair.publicKey(),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/source account/i);
    }
  });

  it('rejects a challenge with a non-zero sequence number', () => {
    const now = Math.floor(Date.now() / 1000);
    // Account seq "100" → transaction sequence is 101.
    const xdr = buildAuthShapedTx({
      sequence: '100',
      minTime: now,
      maxTime: now + 300,
    });
    const result = validate(xdr);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/sequence/i);
    }
  });

  it('rejects a challenge with unbounded time bounds (maxTime = 0)', () => {
    const xdr = buildAuthShapedTx({
      minTime: 0,
      maxTime: 0,
    });
    const result = validate(xdr);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/unbounded|time bounds/i);
    }
  });

  it('rejects a challenge whose time bounds window exceeds the cap', () => {
    const now = Math.floor(Date.now() / 1000);
    const window = MAX_CHALLENGE_TIMEBOUNDS_SEC + 1;
    const xdr = buildAuthShapedTx({
      minTime: now,
      maxTime: now + window,
    });
    const result = validate(xdr, { nowSec: now });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/time bounds window/i);
    }
  });

  it('rejects a challenge whose minTime is too far in the future', () => {
    const now = Math.floor(Date.now() / 1000);
    const minTime = now + CLOCK_SKEW_ALLOWANCE_SEC + 120;
    const xdr = buildAuthShapedTx({
      minTime,
      maxTime: minTime + 300,
    });
    const result = validate(xdr, { nowSec: now });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/minTime|future/i);
    }
  });

  it('rejects a challenge with the wrong manageData home-domain key', () => {
    const xdr = buildLegitimateChallenge({ homeDomain: 'evil.example' });
    const result = validate(xdr);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/manageData name|home/i);
    }
  });

  it('rejects a challenge whose manageData source is not the connecting wallet', () => {
    const xdr = buildLegitimateChallenge({
      clientAccount: otherKeypair.publicKey(),
    });
    const result = validate(xdr);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/source must equal the connecting wallet/i);
    }
  });

  it('rejects a forged challenge that embeds a payment alongside manageData', () => {
    const now = Math.floor(Date.now() / 1000);
    const xdr = buildAuthShapedTx({
      minTime: now,
      maxTime: now + 300,
      includeWebAuth: false,
      extraOps: [
        Operation.payment({
          destination: otherKeypair.publicKey(),
          asset: Asset.native(),
          amount: '100',
        }),
      ],
    });
    const result = validate(xdr);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/manageData|web_auth_domain|operation/i);
    }
  });

  it('does not call a wallet adapter signTransaction when a forged payment challenge is rejected', async () => {
    const now = Math.floor(Date.now() / 1000);
    const forgedXdr = buildAuthShapedTx({
      minTime: now,
      maxTime: now + 300,
      includeWebAuth: false,
      extraOps: [
        Operation.payment({
          destination: otherKeypair.publicKey(),
          asset: Asset.native(),
          amount: '100',
        }),
      ],
    });

    const signTransaction = jest.fn(
      async (_xdr: string, _network: string) => 'signed',
    );
    const validation = validate(forgedXdr);
    expect(validation.valid).toBe(false);

    // Mirror WalletContext's gate: never sign on failure.
    if (validation.valid) {
      await signTransaction(forgedXdr, NETWORK);
    }

    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('rejects a challenge with an excessive fee', () => {
    const now = Math.floor(Date.now() / 1000);
    const xdr = buildAuthShapedTx({
      minTime: now,
      maxTime: now + 300,
      fee: '100000',
    });
    const result = validate(xdr, { nowSec: now });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/fee/i);
    }
  });

  it('rejects unparseable XDR', () => {
    const result = validate('not-valid-xdr');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/decode|Failed/i);
    }
  });
});
