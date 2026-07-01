// Mock stellar-sdk to avoid real SDK/network calls.
jest.mock('@stellar/stellar-sdk', () => ({
  Contract: jest.fn().mockImplementation(() => ({
    call: jest.fn().mockReturnValue({}),
  })),
  nativeToScVal: jest.fn().mockReturnValue({}),
  scValToNative: jest.fn().mockReturnValue({}),
  xdr: {},
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest
      .fn()
      .mockReturnValue({ toXDR: jest.fn().mockReturnValue('mock-xdr') }),
  })),
  Account: jest.fn(),
}));

// Mock lib/stellar — rpc never gets called for invalid addresses.
// isValidStellarAddress uses a simple structural check matching real Ed25519 key rules.
jest.mock('../../lib/stellar', () => ({
  rpc: {
    getAccount: jest.fn().mockResolvedValue({}),
    prepareTransaction: jest
      .fn()
      .mockResolvedValue({ toXDR: () => 'prepared-xdr' }),
    simulateTransaction: jest
      .fn()
      .mockResolvedValue({ result: { retval: {} } }),
  },
  NETWORK: 'Test SDF Network ; September 2015',
  BASE_FEE: '100',
  isValidStellarAddress: jest.fn(
    (key: string) => typeof key === 'string' && /^G[A-Z2-7]{55}$/.test(key),
  ),
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
}));

import {
  buildRegisterPlayer,
  buildApproveMilestone,
  buildPayToContact,
  filterPlayers,
} from '../../lib/contract';
import { ValidationError } from '../../lib/errors';
import { rpc } from '../../lib/stellar';

const VALID_ADDRESS =
  'GBR6LYRKEFYV3MG322FYLED6PLOTEV77KCX6AZSR7V4RV7EJLIWOZJWQ';
const mockRpc = rpc as jest.Mocked<typeof rpc>;

beforeEach(() => jest.clearAllMocks());

describe('contract configuration', () => {
  test('does not crash on import when NEXT_PUBLIC_CONTRACT_ID is missing and fails on use with a clear error', async () => {
    const previousContractId = process.env.NEXT_PUBLIC_CONTRACT_ID;

    delete process.env.NEXT_PUBLIC_CONTRACT_ID;
    jest.resetModules();

    const { getPlayer } = require('../../lib/contract');

    await expect(getPlayer('player_1')).rejects.toThrow(
      /NEXT_PUBLIC_CONTRACT_ID/,
    );

    process.env.NEXT_PUBLIC_CONTRACT_ID = previousContractId;
  });
});

// ── buildRegisterPlayer ───────────────────────────────────────────────────────

describe('buildRegisterPlayer', () => {
  const vitals = {
    name: 'Ada',
    age: 22,
    position: 'MF',
    region: 'EU',
    nationality: 'DE',
  };

  test('throws ValidationError for invalid wallet', async () => {
    await expect(
      buildRegisterPlayer('not-a-key', vitals, 'QmHash'),
    ).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test('throws ValidationError for empty wallet', async () => {
    await expect(buildRegisterPlayer('', vitals, 'QmHash')).rejects.toThrow(
      ValidationError,
    );
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test('error message identifies the bad value and parameter', async () => {
    const err = await buildRegisterPlayer('bad', vitals, 'QmHash').catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toMatch(/wallet/);
    expect(err.message).toMatch(/not a valid Stellar address/);
  });

  test('proceeds to RPC for a valid wallet address', async () => {
    await buildRegisterPlayer(VALID_ADDRESS, vitals, 'QmHash');
    expect(mockRpc.getAccount).toHaveBeenCalledWith(VALID_ADDRESS);
  });
});

// ── buildApproveMilestone ─────────────────────────────────────────────────────

describe('buildApproveMilestone', () => {
  test('throws ValidationError for invalid validatorKey', async () => {
    await expect(
      buildApproveMilestone('bad-key', 'player_1', 'milestone_1'),
    ).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test('throws ValidationError for empty validatorKey', async () => {
    await expect(
      buildApproveMilestone('', 'player_1', 'milestone_1'),
    ).rejects.toThrow(ValidationError);
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test('error message identifies the parameter name', async () => {
    const err = await buildApproveMilestone('bad', 'player_1', 'ms').catch(
      (e) => e,
    );
    expect(err.message).toMatch(/validatorKey/);
  });

  test('proceeds to RPC for a valid validatorKey', async () => {
    await buildApproveMilestone(VALID_ADDRESS, 'player_1', 'milestone_1');
    expect(mockRpc.getAccount).toHaveBeenCalledWith(VALID_ADDRESS);
  });
});

// ── buildPayToContact ─────────────────────────────────────────────────────────

describe('buildPayToContact', () => {
  test('throws ValidationError for invalid scoutKey', async () => {
    await expect(buildPayToContact('//evil.com', 'player_1')).rejects.toThrow(
      ValidationError,
    );
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test('throws ValidationError for empty scoutKey', async () => {
    await expect(buildPayToContact('', 'player_1')).rejects.toThrow(
      ValidationError,
    );
    expect(mockRpc.getAccount).not.toHaveBeenCalled();
  });

  test('error message identifies the parameter name', async () => {
    const err = await buildPayToContact('oops', 'player_1').catch((e) => e);
    expect(err.message).toMatch(/scoutKey/);
  });

  test('proceeds to RPC for a valid scoutKey', async () => {
    await buildPayToContact(VALID_ADDRESS, 'player_1');
    expect(mockRpc.getAccount).toHaveBeenCalledWith(VALID_ADDRESS);
  });
});

// ── filterPlayers (no address params — must never throw ValidationError) ──────

describe('filterPlayers', () => {
  test('does not throw for any string arguments', async () => {
    await expect(filterPlayers('EU', 'MF', 1)).resolves.not.toThrow();
    expect(mockRpc.simulateTransaction).toHaveBeenCalled();
  });
});

// ── ValidationError shape ─────────────────────────────────────────────────────

describe('ValidationError', () => {
  test('has name ValidationError', () => {
    const err = new ValidationError('bad input');
    expect(err.name).toBe('ValidationError');
  });

  test('extends Error', () => {
    expect(new ValidationError('x')).toBeInstanceOf(Error);
  });

  test('preserves the message', () => {
    expect(new ValidationError('bad input').message).toBe('bad input');
  });
});

// ── parseContractError ────────────────────────────────────────────────────────

import { parseContractError, CONTRACT_ERRORS } from '../../lib/contract';

describe('parseContractError', () => {
  test('maps known Error(Contract, #N) pattern to human-readable message', () => {
    expect(parseContractError('Error(Contract, #9)').message).toBe(
      CONTRACT_ERRORS[9],
    );
  });

  test('maps known ContractError(N) pattern to human-readable message', () => {
    expect(parseContractError('ContractError(3)').message).toBe(
      CONTRACT_ERRORS[3],
    );
  });

  test.each(Object.entries(CONTRACT_ERRORS))(
    'code %s -> "%s"',
    (code, expected) => {
      expect(parseContractError(`Error(Contract, #${code})`).message).toBe(
        expected,
      );
    },
  );

  test('unknown code includes the numeric code for debugging', () => {
    const err = parseContractError('Error(Contract, #99)');
    expect(err.message).toMatch(/99/);
    expect(err.message).not.toContain('{');
  });

  test('plain message with no code is returned as-is', () => {
    expect(parseContractError('network timeout').message).toBe(
      'network timeout',
    );
  });

  test('returns an Error instance in all cases', () => {
    expect(parseContractError('Error(Contract, #1)')).toBeInstanceOf(Error);
    expect(parseContractError('something else')).toBeInstanceOf(Error);
  });
});

// ── simulateTx error surfacing ────────────────────────────────────────────────

describe('simulateTx — human-readable errors', () => {
  test('maps contract error code in simulation result to readable message', async () => {
    mockRpc.simulateTransaction.mockResolvedValueOnce({
      error: 'Error(Contract, #3)',
    } as any);

    await expect(filterPlayers('', '', 0)).rejects.toThrow(CONTRACT_ERRORS[3]);
  });

  test('unknown contract code surfaces the code number, not raw JSON', async () => {
    mockRpc.simulateTransaction.mockResolvedValueOnce({
      error: 'Error(Contract, #42)',
    } as any);

    const err = await filterPlayers('', '', 0).catch((e) => e);
    expect(err.message).toMatch(/42/);
    expect(err.message).not.toContain('"error"');
  });

  test('no raw JSON in error message when error field is absent', async () => {
    mockRpc.simulateTransaction.mockResolvedValueOnce({ events: [] } as any);

    const err = await filterPlayers('', '', 0).catch((e) => e);
    expect(err.message).not.toMatch(/\{/); // no JSON object literals
    expect(err.message).not.toMatch(/"events"/);
  });
});

// ── buildTx error surfacing ───────────────────────────────────────────────────

describe('buildTx — human-readable errors', () => {
  test('maps Error(Contract, #9) to "Contract is paused"', async () => {
    mockRpc.prepareTransaction.mockRejectedValueOnce(
      new Error('Error(Contract, #9)'),
    );

    await expect(
      buildRegisterPlayer(
        VALID_ADDRESS,
        { name: 'A', age: 20, position: 'ST', region: 'AF', nationality: 'NG' },
        'QmHash',
      ),
    ).rejects.toThrow(CONTRACT_ERRORS[9]);
  });

  test('maps any known code to its human-readable string', async () => {
    mockRpc.prepareTransaction.mockRejectedValueOnce(
      new Error('Error(Contract, #7)'),
    );

    await expect(
      buildRegisterPlayer(
        VALID_ADDRESS,
        { name: 'A', age: 20, position: 'ST', region: 'AF', nationality: 'NG' },
        'QmHash',
      ),
    ).rejects.toThrow(CONTRACT_ERRORS[7]);
  });

  test('unknown code includes the numeric code, not raw error object', async () => {
    mockRpc.prepareTransaction.mockRejectedValueOnce(
      new Error('Error(Contract, #55)'),
    );

    const err = await buildRegisterPlayer(
      VALID_ADDRESS,
      { name: 'A', age: 20, position: 'ST', region: 'AF', nationality: 'NG' },
      'QmHash',
    ).catch((e) => e);

    expect(err.message).toMatch(/55/);
    expect(err.message).not.toContain('[object');
  });
});
