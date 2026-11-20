/**
 * onChainDataCollection — a readable snapshot of what the platform's
 * contract and indexer hold about a wallet, for the GDPR data export
 * (issue #1715). Public-ledger data: it is included for portability only
 * and can never be modified or deleted (see docs/contact-details-privacy.md).
 *
 * Best-effort by design: every part is collected independently, and an RPC
 * or indexer failure yields `{ status: 'unavailable', reason }` for that part
 * instead of failing the export. Indexer reads are paginated and capped per
 * event group (MAX_EVENTS_PER_GROUP) so one export cannot fan out into an
 * unbounded number of indexer requests; the route's POLICIES.dataExport rate
 * limit bounds how often this runs per client.
 */

import { getMilestoneHistory, getPlayer, getSubscription } from './contract';
import {
  fetchEvents,
  fetchPlayerEvents,
  fetchValidatorEvents,
  type EventQueryParams,
  type IndexedEvent,
  type IndexedEventsPage,
  type IndexedEventType,
} from './indexerClient';
import {
  NETWORK,
  getExplorerAccountUrl,
  getExplorerLedgerUrl,
  getExplorerTxUrl,
  type StellarNetwork,
} from './network';
import type { Milestone, Player, Subscription } from '@/types';

export const PAGE_SIZE = 200;
export const MAX_EVENTS_PER_GROUP = 500;

/** Scout-side activity has no per-scout indexer route, so it is read by type. */
const SCOUT_EVENT_TYPES: IndexedEventType[] = [
  'scout_subscribed',
  'player_contacted',
  'trial_offer_logged',
];

export type Collected<T> =
  | { status: 'ok'; data: T; truncated?: boolean; note?: string }
  | { status: 'unavailable'; reason: string };

export interface OnChainEvent {
  type: IndexedEventType;
  ledger: number;
  /** Unix timestamp (seconds) of the ledger close. */
  timestamp: number;
  playerId: string | null;
  scout: string | null;
  validator: string | null;
  data: Record<string, unknown>;
  /** Transaction hash, when the indexer recorded one for this event. */
  txHash: string | null;
  /** Explorer link to the transaction, or to the ledger when no hash is known. */
  explorerUrl: string;
}

export interface OnChainMilestone {
  id: string;
  description: string;
  evidenceHash: string;
  validator: string;
  timestamp: number;
  /** From the matching indexed `milestone_approved` event, when available. */
  txHash: string | null;
  explorerUrl: string | null;
}

export interface OnChainSection {
  /** Always true — this section is a copy of public Stellar ledger data. */
  publicLedgerData: true;
  notice: string;
  network: StellarNetwork;
  accountExplorerUrl: string;
  /** null when the wallet is not a registered player. */
  player: Collected<Omit<Player, 'milestones'> | null>;
  milestones: Collected<OnChainMilestone[]>;
  /** null when the wallet has no scout subscription record. */
  subscription: Collected<Subscription | null>;
  events: {
    asPlayer: Collected<OnChainEvent[]>;
    asValidator: Collected<OnChainEvent[]>;
    asScout: Collected<OnChainEvent[]>;
  };
}

export interface OnChainDeps {
  getPlayer: (wallet: string) => Promise<unknown>;
  getMilestoneHistory: (playerId: string) => Promise<unknown>;
  getSubscription: (wallet: string) => Promise<unknown>;
  fetchPlayerEvents: (
    playerId: string,
    params: EventQueryParams,
  ) => Promise<IndexedEventsPage>;
  fetchValidatorEvents: (
    wallet: string,
    params: EventQueryParams,
  ) => Promise<IndexedEventsPage>;
  fetchEvents: (params: EventQueryParams) => Promise<IndexedEventsPage>;
}

const defaultDeps: OnChainDeps = {
  getPlayer,
  getMilestoneHistory,
  getSubscription,
  fetchPlayerEvents,
  fetchValidatorEvents,
  fetchEvents,
};

export const ON_CHAIN_NOTICE =
  'This section is a read-only copy of public data recorded on the Stellar network by the ScoutOff contract. It is provided for portability; it cannot be modified or deleted by anyone, including ScoutOff, and is not affected by a data-deletion request.';

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isPlayerNotFound(err: unknown): boolean {
  return /player not found|Error\(Contract,\s*#3\)|ContractError\(3\)/i.test(
    reasonOf(err),
  );
}

async function settle<T>(
  fn: () => Promise<Collected<T>>,
): Promise<Collected<T>> {
  try {
    return await fn();
  } catch (err) {
    return { status: 'unavailable', reason: reasonOf(err) };
  }
}

function txHashOf(event: IndexedEvent): string | null {
  const hash = event.data?.txHash ?? event.data?.tx_hash;
  return typeof hash === 'string' && hash ? hash : null;
}

function toOnChainEvent(event: IndexedEvent): OnChainEvent {
  const txHash = txHashOf(event);
  return {
    type: event.type,
    ledger: event.ledger,
    timestamp: event.timestamp,
    playerId: event.playerId,
    scout: event.scout,
    validator: event.validator,
    data: event.data,
    txHash,
    explorerUrl: txHash
      ? getExplorerTxUrl(txHash)
      : getExplorerLedgerUrl(event.ledger),
  };
}

/** Pages through `fetchPage` until exhausted or `MAX_EVENTS_PER_GROUP` is hit. */
async function readCapped(
  fetchPage: (params: EventQueryParams) => Promise<IndexedEventsPage>,
  keep: (event: IndexedEvent) => boolean = () => true,
): Promise<Collected<OnChainEvent[]>> {
  const kept: IndexedEvent[] = [];
  let before: number | undefined;
  const maxPages = Math.ceil(MAX_EVENTS_PER_GROUP / PAGE_SIZE);

  for (let page = 0; page < maxPages; page++) {
    const { events, nextCursor } = await fetchPage({
      limit: PAGE_SIZE,
      ...(before !== undefined ? { before } : {}),
    });
    kept.push(...events.filter(keep));
    if (kept.length >= MAX_EVENTS_PER_GROUP || nextCursor === null) {
      const truncated =
        kept.length > MAX_EVENTS_PER_GROUP || nextCursor !== null;
      return {
        status: 'ok',
        data: kept.slice(0, MAX_EVENTS_PER_GROUP).map(toOnChainEvent),
        ...(truncated ? truncatedNote() : {}),
      };
    }
    before = nextCursor;
  }
  return {
    status: 'ok',
    data: kept.map(toOnChainEvent),
    ...truncatedNote(),
  };
}

function truncatedNote() {
  return {
    truncated: true,
    note: `Only the most recent events were included (cap ${MAX_EVENTS_PER_GROUP}). The full history is available from the account explorer link.`,
  };
}

function toOnChainMilestones(
  milestones: Milestone[],
  playerEvents: Collected<OnChainEvent[]>,
): OnChainMilestone[] {
  const approvals =
    playerEvents.status === 'ok'
      ? playerEvents.data.filter((e) => e.type === 'milestone_approved')
      : [];
  return milestones.map((m) => {
    const match = approvals.find(
      (e) => e.timestamp === m.timestamp && e.validator === m.validator,
    );
    return {
      id: m.id,
      description: m.description,
      evidenceHash: m.evidenceHash,
      validator: m.validator,
      timestamp: m.timestamp,
      txHash: match?.txHash ?? null,
      explorerUrl: match?.explorerUrl ?? null,
    };
  });
}

/**
 * Assembles the `onChain` export section for `wallet`. Never throws.
 */
export async function collectOnChainData(
  wallet: string,
  deps: OnChainDeps = defaultDeps,
): Promise<OnChainSection> {
  const [player, subscription, asPlayer, asValidator, asScout] =
    await Promise.all([
      settle<Omit<Player, 'milestones'> | null>(async () => {
        try {
          const record = (await deps.getPlayer(wallet)) as Player | null;
          if (!record) return { status: 'ok', data: null };
          // Milestones are reported separately below.
          const rest: Partial<Pick<Player, 'milestones'>> &
            Omit<Player, 'milestones'> = { ...record };
          delete rest.milestones;
          return { status: 'ok', data: rest };
        } catch (err) {
          if (isPlayerNotFound(err)) return { status: 'ok', data: null };
          throw err;
        }
      }),
      settle<Subscription | null>(async () => ({
        status: 'ok',
        data: ((await deps.getSubscription(wallet)) as Subscription) ?? null,
      })),
      settle(() =>
        readCapped((params) => deps.fetchPlayerEvents(wallet, params)),
      ),
      settle(() =>
        readCapped((params) => deps.fetchValidatorEvents(wallet, params)),
      ),
      settle(async () => {
        const groups = await Promise.all(
          SCOUT_EVENT_TYPES.map((type) =>
            readCapped(
              (params) => deps.fetchEvents({ ...params, type }),
              (e) => e.scout === wallet,
            ),
          ),
        );
        const data = groups
          .flatMap((g) => (g.status === 'ok' ? g.data : []))
          .sort((a, b) => b.ledger - a.ledger);
        const truncated = groups.some((g) => g.status === 'ok' && g.truncated);
        return {
          status: 'ok' as const,
          data,
          ...(truncated ? truncatedNote() : {}),
        };
      }),
    ]);

  let milestones: Collected<OnChainMilestone[]>;
  if (player.status === 'unavailable') {
    milestones = {
      status: 'unavailable',
      reason: `Player record unavailable: ${player.reason}`,
    };
  } else if (player.data === null) {
    milestones = { status: 'ok', data: [] };
  } else {
    const playerId = player.data.id ?? wallet;
    milestones = await settle(async () => ({
      status: 'ok',
      data: toOnChainMilestones(
        ((await deps.getMilestoneHistory(playerId)) as Milestone[]) ?? [],
        asPlayer,
      ),
    }));
  }

  return {
    publicLedgerData: true,
    notice: ON_CHAIN_NOTICE,
    network: NETWORK,
    accountExplorerUrl: getExplorerAccountUrl(wallet),
    player,
    milestones,
    subscription,
    events: { asPlayer, asValidator, asScout },
  };
}
