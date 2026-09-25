/**
 * offChainDataCollection — the single source of truth for "what off-chain
 * data does this platform hold for a given wallet". Both the GDPR-style data
 * *export* and the (separately-tracked) data *deletion* cascade consume these
 * functions so the two features can never drift apart about what exists for a
 * user: when a new store is added here, both export and deletion pick it up.
 *
 * In scope (wallet-keyed, server-persisted):
 *   - watchlistStore
 *   - savedSearchStore
 *   - notificationPreferencesStore
 *   - notificationReadStore
 *   - milestoneDisputeStore
 *   - chunkedUploadStore (sessions tagged with the owner wallet)
 *
 * Deliberately excluded, with reasons surfaced in the payload's `excluded`
 * section:
 *   - contactDetailsCache: never persisted server-side by design (see
 *     docs/contact-details-privacy.md) — it's an in-memory, 15-minute-TTL
 *     SWR cache that only ever exists in a scout's own browser tab, so
 *     there is nothing for a server route to export or delete. It's still
 *     explicitly purged as part of the deletion *request* itself, just
 *     client-side: DataDeletionModal calls
 *     lib/contactDetailsCache.ts's purgeAllContactDetails() on success,
 *     the same immediate wipe wallet-disconnect already triggers.
 *   - messaging (lib/messaging/* + the external chat service): message
 *     history lives in a separate Node chat service behind its own API, not
 *     in this repo's stores. It is documented as excluded so the registry
 *     can be extended to cover it later without touching export/deletion.
 *
 * deleteUserData additionally anonymizes (does not delete) admin audit log
 * rows that reference the wallet — see AdminAuditStore.anonymizeWallet's
 * doc comment for why that record must be retained.
 */

import { WatchlistStore } from './watchlistStore';
import { SavedSearchStore } from './savedSearchStore';
import { NotificationPreferencesStore } from './notificationPreferencesStore';
import { NotificationReadStore } from './notificationReadStore';
import { MilestoneDisputeStore } from './milestoneDisputeStore';
import { AdminAuditStore } from './adminAuditStore';
import {
  deleteBackendUserData,
  fetchBackendUserData,
  isBackendUserDataConfigured,
  type BackendUserData,
} from './backendUserData';
import {
  listSessionsForWallet,
  clearSessionsForWallet,
} from './chunkedUploadStore';
import type {
  WatchlistEntry,
  SavedSearch,
  NotificationPreferences,
  MilestoneDispute,
} from '@/types';

const SCHEMA_VERSION = 2;

export interface ActiveUploadSummary {
  sessionId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: number;
  createdAt: number;
}

export interface ExcludedSection {
  name: string;
  reason: string;
}

export interface CollectedUserData {
  /** Schema version — bump when adding/removing sections. */
  schemaVersion: number;
  /** The wallet this export covers. */
  wallet: string;
  /** ISO 8601 timestamp of when this export was generated. */
  exportedAt: string;
  /** Per-store off-chain records referencing this wallet. */
  sections: {
    watchlist: WatchlistEntry[];
    savedSearches: SavedSearch[];
    notificationPreferences: NotificationPreferences;
    notificationReadIds: number[];
    milestoneDisputes: MilestoneDispute[];
    activeUploadSessions: ActiveUploadSummary[];
    /** Express backend records (referrals, academies, milestone submissions). */
    backend: BackendUserData | null;
  };
  /**
   * On-chain data is explicitly NOT part of this export (it is immutable and
   * lives on the Stellar network). This explains where to find it.
   */
  onChainExcluded: {
    explanation: string;
    explorerUrl: string;
  };
  /** Data we intentionally did not collect, and why. */
  excluded: ExcludedSection[];
}

function explorerUrlFor(wallet: string): string {
  const network =
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://stellar.expert/explorer/${network}/account/${wallet}`;
}

/**
 * Compiles every off-chain record referencing `wallet` across the in-scope
 * stores. Each section is collected independently so a failure in one store
 * surfaces as an `error` marker rather than aborting the whole export.
 */
export async function collectUserData(
  wallet: string,
): Promise<CollectedUserData> {
  const sections: CollectedUserData['sections'] = {
    watchlist: [],
    savedSearches: [],
    notificationPreferences: { milestoneApprovals: true, contactUnlocks: true },
    notificationReadIds: [],
    milestoneDisputes: [],
    activeUploadSessions: [],
    backend: null,
  };

  const errors: string[] = [];

  try {
    sections.watchlist = WatchlistStore.getInstance().list(wallet);
  } catch (err) {
    errors.push(
      `watchlist: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    sections.savedSearches = SavedSearchStore.getInstance().list(wallet);
  } catch (err) {
    errors.push(
      `savedSearches: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    sections.notificationPreferences =
      NotificationPreferencesStore.getInstance().get(wallet);
  } catch (err) {
    errors.push(
      `notificationPreferences: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    sections.notificationReadIds =
      NotificationReadStore.getInstance().getReadIds(wallet);
  } catch (err) {
    errors.push(
      `notificationReadIds: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    sections.milestoneDisputes =
      MilestoneDisputeStore.getInstance().listForWallet(wallet);
  } catch (err) {
    errors.push(
      `milestoneDisputes: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    sections.activeUploadSessions = await listSessionsForWallet(wallet);
  } catch (err) {
    errors.push(
      `activeUploadSessions: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (isBackendUserDataConfigured()) {
    try {
      sections.backend = await fetchBackendUserData(wallet);
    } catch (err) {
      errors.push(
        `backend: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const excluded: ExcludedSection[] = [
    {
      name: 'contactDetailsCache',
      reason:
        'Contact details are never persisted (in-memory SWR cache, 15-minute TTL) per docs/contact-details-privacy.md — there is nothing stored to export.',
    },
    {
      name: 'messaging',
      reason:
        'Chat message history is held by a separate off-chain chat service (lib/messaging/* proxies to it) and is not part of this platform’s stores. Out of scope for this export; extend the registry if that service gains a wallet-scoped export.',
    },
  ];

  if (!isBackendUserDataConfigured()) {
    excluded.push({
      name: 'backend',
      reason:
        'The backend data service (referrals, academies, milestone submissions) is not configured on this deployment (BACKEND_SERVICE_TOKEN is unset).',
    });
  }
  excluded.push({
    name: 'sponsorshipWaitlist',
    reason:
      'Sponsorship waitlist signups are keyed by email, not wallet, so they cannot be matched to this export. Contact support from the email you signed up with to export or delete that entry.',
  });

  if (errors.length > 0) {
    excluded.push({
      name: 'collectionErrors',
      reason: `One or more stores failed to read: ${errors.join('; ')}`,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    wallet,
    exportedAt: new Date().toISOString(),
    sections,
    onChainExcluded: {
      explanation:
        'On-chain data (your Stellar public key, transaction history, player registration, and payments) is stored permanently on the blockchain and is not included in this off-chain export. No one — including ScoutOff — can modify or delete it.',
      explorerUrl: explorerUrlFor(wallet),
    },
    excluded,
  };
}

/**
 * Deletes every off-chain record referencing `wallet` across the in-scope
 * stores, and anonymizes (rather than deletes) admin audit log rows that
 * reference it. This is the deletion-cascade counterpart to
 * {@link collectUserData} — both iterate the same stores so what is
 * exported is exactly what is deletable/anonymizable. Throws if any store
 * fails, so a partial deletion is never reported as success — callers
 * (app/api/data-deletion/request/route.ts) must await this and only confirm
 * success to the user once it resolves.
 *
 * The Express backend is called last, after every local store is cleared.
 * If it fails (or is unconfigured in production) the local deletion still
 * stands and the failure is returned in `failed`, so the route can report a
 * partial deletion instead of silently claiming success. Retrying is safe:
 * every step is idempotent.
 */
export async function deleteUserData(wallet: string): Promise<{
  removed: Record<string, number>;
  anonymized: Record<string, number>;
  failed: Record<string, string>;
}> {
  const removed: Record<string, number> = {};
  const anonymized: Record<string, number> = {};
  const failed: Record<string, string> = {};

  removed.watchlist = WatchlistStore.getInstance().clearForWallet(wallet);
  removed.savedSearches = SavedSearchStore.getInstance().clearForWallet(wallet);
  removed.notificationPreferences =
    NotificationPreferencesStore.getInstance().clearForWallet(wallet);
  removed.notificationReadIds =
    NotificationReadStore.getInstance().clearForWallet(wallet);
  removed.milestoneDisputes =
    MilestoneDisputeStore.getInstance().deleteForWallet(wallet);
  removed.activeUploadSessions = await clearSessionsForWallet(wallet);

  // Retained-not-deleted: see AdminAuditStore.anonymizeWallet's doc comment.
  anonymized.adminAuditLog =
    AdminAuditStore.getInstance().anonymizeWallet(wallet);

  if (isBackendUserDataConfigured()) {
    try {
      const backend = await deleteBackendUserData(wallet);
      for (const [k, v] of Object.entries(backend.removed)) {
        removed[`backend.${k}`] = v;
      }
      for (const [k, v] of Object.entries(backend.anonymized)) {
        anonymized[`backend.${k}`] = v;
      }
    } catch (err) {
      failed.backend = err instanceof Error ? err.message : String(err);
    }
  } else if (process.env.NODE_ENV === 'production') {
    failed.backend = 'Backend data service is not configured';
  }

  return { removed, anonymized, failed };
}
