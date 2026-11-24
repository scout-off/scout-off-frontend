/**
 * @jest-environment node
 */
import { UploadTrackingStore } from '@/lib/uploadTrackingStore';

let store: UploadTrackingStore;

beforeEach(() => {
  UploadTrackingStore.resetInstance();
  store = UploadTrackingStore.getInstance();
});

afterEach(() => {
  UploadTrackingStore.resetInstance();
});

describe('UploadTrackingStore', () => {
  it('is a singleton', () => {
    expect(UploadTrackingStore.getInstance()).toBe(store);
  });

  it('records an upload as unmatched', () => {
    const record = store.recordUpload({
      cid: 'QmABC',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
    });
    expect(record.matchedAt).toBeNull();
    expect(record.cleanedAt).toBeNull();
  });

  it('marks the most recent unmatched record for a CID as matched', () => {
    store.recordUpload({
      cid: 'QmABC',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: 1_000,
    });
    const matched = store.markMatched('QmABC', 'tx-hash-1', 2_000);

    expect(matched).not.toBeNull();
    expect(matched?.matchedAt).toBe(2_000);
    expect(matched?.matchedTxHash).toBe('tx-hash-1');
  });

  it('returns null when marking a CID with no pending record as matched', () => {
    expect(store.markMatched('QmNoSuchCid', 'tx-hash')).toBeNull();
  });

  it('does not re-match an already-matched record for the same CID', () => {
    store.recordUpload({
      cid: 'QmABC',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: 1_000,
    });
    store.markMatched('QmABC', 'tx-hash-1', 2_000);

    // A second upload reusing the same CID (unlikely but possible) creates
    // a second pending record; matching again should hit that new one, not
    // the already-matched one.
    store.recordUpload({
      cid: 'QmABC',
      wallet: 'GWALLET2',
      context: 'player_onboarding_highlight_reel',
      createdAt: 3_000,
    });
    const secondMatch = store.markMatched('QmABC', 'tx-hash-2', 4_000);
    expect(secondMatch?.matchedTxHash).toBe('tx-hash-2');

    const all = store.getByCid('QmABC');
    expect(all).toHaveLength(2);
    expect(all.filter((r) => r.matchedAt !== null)).toHaveLength(2);
  });

  it('lists unmatched records older than the grace period as orphan candidates', () => {
    store.recordUpload({
      cid: 'QmOld',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: 1_000,
    });
    store.recordUpload({
      cid: 'QmRecent',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: 9_000,
    });

    const now = 10_000;
    const graceMs = 5_000; // cutoff = 5_000
    const candidates = store.getOrphanCandidates(graceMs, now);

    expect(candidates.map((c) => c.cid)).toEqual(['QmOld']);
  });

  it('excludes matched records from orphan candidates', () => {
    store.recordUpload({
      cid: 'QmMatched',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: 1_000,
    });
    store.markMatched('QmMatched', 'tx-hash', 1_500);

    expect(store.getOrphanCandidates(5_000, 10_000)).toEqual([]);
  });

  it('excludes already-cleaned records from orphan candidates', () => {
    const record = store.recordUpload({
      cid: 'QmOrphan',
      wallet: 'GWALLET1',
      context: 'player_onboarding_highlight_reel',
      createdAt: 1_000,
    });

    expect(store.getOrphanCandidates(5_000, 10_000)).toHaveLength(1);

    store.markCleaned(record.id, 10_500);

    expect(store.getOrphanCandidates(5_000, 11_000)).toEqual([]);
  });
});
