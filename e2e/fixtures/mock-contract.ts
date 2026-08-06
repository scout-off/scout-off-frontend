import type { Page } from '@playwright/test';

const SOROBAN_RPC =
  process.env.NEXT_PUBLIC_SOROBAN_RPC ?? 'https://soroban-testnet.stellar.org';

function xdrBool(value: boolean): string {
  const buf = Buffer.alloc(2);
  buf.writeUInt8(1, 0);
  buf.writeUInt8(value ? 1 : 0, 1);
  return buf.toString('base64');
}

function xdrString(value: string): string {
  const strBuf = Buffer.from(value, 'utf-8');
  const buf = Buffer.alloc(5 + strBuf.length);
  buf.writeUInt8(3, 0);
  buf.writeUInt32BE(strBuf.length, 1);
  strBuf.copy(buf, 5);
  return buf.toString('base64');
}

function xdrU32(value: number): string {
  const buf = Buffer.alloc(5);
  buf.writeUInt8(4, 0);
  buf.writeUInt32BE(value, 1);
  return buf.toString('base64');
}

function xdrStruct(fields: string[]): string {
  const fieldBufs = fields.map((f) => Buffer.from(f, 'base64'));
  const totalLen =
    1 + fieldBufs.length * 4 + fieldBufs.reduce((s, b) => s + b.length, 0);
  const buf = Buffer.alloc(totalLen);
  buf.writeUInt8(16, 0);
  buf.writeUInt32BE(fieldBufs.length, 1);
  let offset = 5;
  for (const fBuf of fieldBufs) {
    buf.writeUInt32BE(fBuf.length, offset);
    offset += 4;
    fBuf.copy(buf, offset);
    offset += fBuf.length;
  }
  return buf.toString('base64');
}

function tryExtractMethod(xdrBase64: string): string | null {
  try {
    const decoded = Buffer.from(xdrBase64, 'base64');
    const text = decoded.toString('utf-8');
    const methodNames = [
      'is_validator',
      'get_player',
      'get_subscription',
      'register_player',
      'approve_milestone',
      'revoke_milestone',
      'pay_to_contact',
      'log_trial_offer',
    ];
    for (const name of methodNames) {
      if (text.includes(name)) {
        return name;
      }
    }
  } catch {
    // ignore decode errors
  }
  return null;
}

interface SimulateOptions {
  isValidator?: boolean;
  player?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
}

export function mockSorobanRpc(page: Page, opts: SimulateOptions = {}): void {
  const {
    isValidator = true,
    player = {
      id: 'P12345',
      wallet: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      vitals: {
        name: 'Test Player',
        age: 25,
        position: 'Striker',
        region: 'Nigeria',
        nationality: 'Nigeria',
      },
      progressLevel: 1,
      milestones: [],
      ipfsHash: '',
      stats: {
        matchesPlayed: 10,
        goalsScored: 5,
        assists: 3,
        yellowCards: 1,
        redCards: 0,
        averageRating: 7.5,
      },
    },
    subscription = {
      tier: 'pro',
      expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
    },
  } = opts;

  page.route(`**/${new URL(SOROBAN_RPC).host}/**`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    let body: Record<string, unknown> | null = null;
    try {
      body = await route.request().json();
    } catch {
      await route.continue();
      return;
    }

    const method = body?.method as string | undefined;
    const id = body?.id ?? 1;

    switch (method) {
      case 'simulateTransaction': {
        const params = body?.params as [string] | undefined;
        const xdr = params?.[0] as string | undefined;
        const contractMethod = xdr ? tryExtractMethod(xdr) : null;
        let retval: string;
        switch (contractMethod) {
          case 'is_validator':
            retval = xdrBool(isValidator);
            break;
          case 'get_player':
            retval = xdrStruct([xdrString('P12345')]);
            break;
          case 'get_subscription':
            retval = xdrBool(true);
            break;
          default:
            retval = xdrBool(true);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { result: { retval } },
          }),
        });
        return;
      }

      case 'sendTransaction': {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { hash: 'test-tx-hash-' + Date.now(), status: 'PENDING' },
          }),
        });
        return;
      }

      case 'getTransaction': {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              status: 'SUCCESS',
              result: { results: [{ result: { code: 0, results: [] } }] },
            },
          }),
        });
        return;
      }

      case 'getAccount': {
        const params = body?.params as [string] | undefined;
        const accountId = (params?.[0] as string) ?? '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              account_id: accountId,
              sequence: '1',
              subentry_count: 0,
              thresholds: {
                master_weight: 1,
                low_threshold: 0,
                medium_threshold: 0,
                high_threshold: 0,
              },
              flags: {
                auth_required: false,
                auth_revocable: true,
                auth_immutable: false,
              },
              balances: [{ asset_type: 'native', balance: '1000000000' }],
            },
          }),
        });
        return;
      }

      case 'prepareTransaction': {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              envelope_xdr: 'test-prepared-xdr',
              source: '',
              fee_bump: false,
            },
          }),
        });
        return;
      }

      default:
        await route.continue();
        return;
    }
  });
}
