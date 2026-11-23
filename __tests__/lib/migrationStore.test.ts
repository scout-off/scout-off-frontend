/** @jest-environment node */
import { COOLING_OFF_MS, MigrationStore } from '@/lib/migrationStore';

const FROM = 'GFROM';
const TO = 'GTO';

let store: MigrationStore;

beforeEach(() => {
  MigrationStore.resetInstance();
  store = MigrationStore.getInstance();
});

afterEach(() => {
  jest.restoreAllMocks();
  MigrationStore.resetInstance();
});

describe('MigrationStore', () => {
  it('is a process-wide singleton', () => {
    expect(MigrationStore.getInstance()).toBe(store);
  });

  it('creates a pending request with a 72h cooling-off window', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const req = store.create('m1', FROM, TO);

    expect(req).toEqual({
      id: 'm1',
      fromWallet: FROM,
      toWallet: TO,
      status: 'pending',
      requestedAt: 1_000,
      executeAfter: 1_000 + COOLING_OFF_MS,
      completedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      failureReason: null,
    });
    expect(store.get('m1')).toEqual(req);
  });

  it('rejects a second open request from the same wallet', () => {
    store.create('m1', FROM, TO);
    expect(() => store.create('m2', FROM, 'GOTHER')).toThrow(/m1/);
  });

  it('returns null for an unknown id', () => {
    expect(store.get('missing')).toBeNull();
  });

  it('lists requests touching a wallet on either side, newest first', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    store.create('older', FROM, TO);
    store.cancel('older', FROM);
    now.mockReturnValue(2_000);
    store.create('newer', 'GELSE', FROM);

    expect(store.listForWallet(FROM).map((r) => r.id)).toEqual([
      'newer',
      'older',
    ]);
    expect(store.listForWallet('GNOBODY')).toEqual([]);
  });

  it('cancels a pending request and records who cancelled it', () => {
    store.create('m1', FROM, TO);
    jest.spyOn(Date, 'now').mockReturnValue(5_000);

    const cancelled = store.cancel('m1', TO);

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledAt: 5_000,
      cancelledBy: TO,
    });
    // A cancelled request no longer blocks a new one.
    expect(() => store.create('m2', FROM, TO)).not.toThrow();
  });

  it('refuses to cancel an unknown or non-pending request', () => {
    expect(() => store.cancel('missing', FROM)).toThrow(/not found/);
    store.create('m1', FROM, TO);
    store.markCompleted('m1');
    expect(() => store.cancel('m1', FROM)).toThrow(/status 'completed'/);
  });

  it('only returns pending requests past their cooling-off window as ready', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(0);
    store.create('ready', FROM, TO);
    now.mockReturnValue(COOLING_OFF_MS - 1);
    store.create('cooling', 'GFROM2', TO);

    now.mockReturnValue(COOLING_OFF_MS);
    expect(store.listReadyToExecute().map((r) => r.id)).toEqual(['ready']);
  });

  it('approves only pending requests', () => {
    store.create('m1', FROM, TO);
    expect(store.approve('m1').status).toBe('approved');

    store.create('m2', 'GFROM2', TO);
    store.cancel('m2', 'GFROM2');
    expect(store.approve('m2').status).toBe('cancelled');
  });

  it('marks requests completed or failed', () => {
    jest.spyOn(Date, 'now').mockReturnValue(9_000);
    store.create('ok', FROM, TO);
    store.create('bad', 'GFROM2', TO);

    expect(store.markCompleted('ok')).toMatchObject({
      status: 'completed',
      completedAt: 9_000,
    });
    expect(store.markFailed('bad', 'rollback')).toMatchObject({
      status: 'failed',
      failureReason: 'rollback',
      completedAt: 9_000,
    });
  });
});
