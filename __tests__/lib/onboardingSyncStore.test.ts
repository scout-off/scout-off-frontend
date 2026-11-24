/**
 * Unit tests for lib/onboardingSyncStore.ts
 *
 * Same approach as __tests__/lib/offlineQueue.test.ts: jsdom does not
 * implement IndexedDB, so `fake-indexeddb/auto` installs an in-memory
 * implementation before the module under test is imported.
 */
import 'fake-indexeddb/auto';

if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (value: unknown) =>
    JSON.parse(JSON.stringify(value));
}

import {
  saveOnboardingSubmission,
  getOnboardingSubmission,
  getSyncableSubmissions,
  updateOnboardingSubmission,
  deleteOnboardingSubmission,
  isIndexedDbAvailable,
  MAX_ONBOARDING_SYNC_RETRIES,
} from '@/lib/onboardingSyncStore';
import type { PlayerVitals } from '@/types';

const VITALS: PlayerVitals = {
  name: 'John Doe',
  age: 22,
  position: 'ST',
  region: 'nigeria',
  nationality: 'Nigerian',
};

describe('onboardingSyncStore', () => {
  it('reports IndexedDB as available in this test environment', () => {
    expect(isIndexedDbAvailable()).toBe(true);
  });

  it('returns null for a wallet with no queued submission', async () => {
    expect(await getOnboardingSubmission('GNOBODY')).toBeNull();
  });

  it('saves a submission as pending with retryCount 0', async () => {
    const record = await saveOnboardingSubmission({
      wallet: 'GALICE',
      vitals: VITALS,
      ipfsHash: 'QmTestCID',
      signedXdr: 'SIGNED_XDR',
    });

    expect(record.status).toBe('pending');
    expect(record.retryCount).toBe(0);
    expect(record.wallet).toBe('GALICE');

    const fetched = await getOnboardingSubmission('GALICE');
    expect(fetched).toEqual(record);
  });

  it('overwrites a wallet’s existing queued submission on a second save', async () => {
    await saveOnboardingSubmission({
      wallet: 'GBOB',
      vitals: VITALS,
      ipfsHash: 'QmFirst',
      signedXdr: 'FIRST_XDR',
    });
    await saveOnboardingSubmission({
      wallet: 'GBOB',
      vitals: VITALS,
      ipfsHash: 'QmSecond',
      signedXdr: 'SECOND_XDR',
    });

    const fetched = await getOnboardingSubmission('GBOB');
    expect(fetched?.ipfsHash).toBe('QmSecond');
    expect(fetched?.signedXdr).toBe('SECOND_XDR');
  });

  it('updateOnboardingSubmission patches fields and bumps updatedAt', async () => {
    const record = await saveOnboardingSubmission({
      wallet: 'GCAROL',
      vitals: VITALS,
      ipfsHash: 'QmCarol',
      signedXdr: 'CAROL_XDR',
    });

    const updated = await updateOnboardingSubmission('GCAROL', {
      status: 'complete',
      txHash: 'tx-hash-abc',
    });

    expect(updated?.status).toBe('complete');
    expect(updated?.txHash).toBe('tx-hash-abc');
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(record.updatedAt);

    const fetched = await getOnboardingSubmission('GCAROL');
    expect(fetched?.status).toBe('complete');
  });

  it('updateOnboardingSubmission is a no-op for a wallet with nothing queued', async () => {
    const result = await updateOnboardingSubmission('GNOTHING', {
      status: 'failed',
    });
    expect(result).toBeNull();
  });

  it('deleteOnboardingSubmission removes the record', async () => {
    await saveOnboardingSubmission({
      wallet: 'GDAVE',
      vitals: VITALS,
      ipfsHash: 'QmDave',
      signedXdr: 'DAVE_XDR',
    });
    await deleteOnboardingSubmission('GDAVE');
    expect(await getOnboardingSubmission('GDAVE')).toBeNull();
  });

  describe('getSyncableSubmissions', () => {
    it('includes pending and syncing submissions, excludes complete and failed', async () => {
      await saveOnboardingSubmission({
        wallet: 'GPENDING',
        vitals: VITALS,
        ipfsHash: 'Qm1',
        signedXdr: 'XDR1',
      });
      await saveOnboardingSubmission({
        wallet: 'GSYNCING',
        vitals: VITALS,
        ipfsHash: 'Qm2',
        signedXdr: 'XDR2',
      });
      await updateOnboardingSubmission('GSYNCING', { status: 'syncing' });

      await saveOnboardingSubmission({
        wallet: 'GCOMPLETE',
        vitals: VITALS,
        ipfsHash: 'Qm3',
        signedXdr: 'XDR3',
      });
      await updateOnboardingSubmission('GCOMPLETE', { status: 'complete' });

      await saveOnboardingSubmission({
        wallet: 'GFAILED',
        vitals: VITALS,
        ipfsHash: 'Qm4',
        signedXdr: 'XDR4',
      });
      await updateOnboardingSubmission('GFAILED', { status: 'failed' });

      const wallets = (await getSyncableSubmissions()).map((s) => s.wallet);
      expect(wallets).toEqual(expect.arrayContaining(['GPENDING', 'GSYNCING']));
      expect(wallets).not.toEqual(expect.arrayContaining(['GCOMPLETE']));
      expect(wallets).not.toEqual(expect.arrayContaining(['GFAILED']));
    });

    it('excludes a submission that has exhausted its retry budget', async () => {
      await saveOnboardingSubmission({
        wallet: 'GEXHAUSTED',
        vitals: VITALS,
        ipfsHash: 'Qm5',
        signedXdr: 'XDR5',
      });
      await updateOnboardingSubmission('GEXHAUSTED', {
        status: 'pending',
        retryCount: MAX_ONBOARDING_SYNC_RETRIES,
      });

      const syncable = await getSyncableSubmissions();
      expect(syncable.some((s) => s.wallet === 'GEXHAUSTED')).toBe(false);
    });
  });
});
