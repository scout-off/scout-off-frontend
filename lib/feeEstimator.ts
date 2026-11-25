/**
 * Dynamic inclusion-fee estimation for classic and Soroban transactions.
 *
 * Under network surge pricing the static `BASE_FEE` (100 stroops) is far below
 * the market inclusion fee, so transactions sit in the queue until they expire.
 * This module derives a per-operation inclusion fee from live fee statistics:
 *
 *   - classic transactions: Horizon `/fee_stats`
 *   - Soroban transactions: Soroban RPC `getFeeStats`
 *
 * A percentile (p70 by default, p90 for "fast") is selected and clamped to
 * `MAX_INCLUSION_FEE_STROOPS`. Results are cached for ~10 s with single-flight
 * dedupe so concurrent builders share one network round-trip.
 */
import { Horizon, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { BASE_FEE, NETWORK } from './stellar';

/** Hard ceiling for any inclusion fee we are willing to pay, in stroops. */
export const MAX_INCLUSION_FEE_STROOPS = 10_000;

/** How long a fee estimate is trusted before being re-fetched. */
const FEE_CACHE_TTL_MS = 10_000;

/** Fee percentile to target. `p70` is the default, `p90` is "fast". */
export type FeeSpeed = 'p70' | 'p90';

export interface FeeEstimate {
  /** Inclusion fee per operation, in stroops, clamped to the ceiling. */
  fee: number;
  /** True when the estimate exceeds 10× the base fee (surge conditions). */
  surge: boolean;
}

interface CacheEntry {
  estimate: FeeEstimate;
  fetchedAt: number;
}

const cache = new Map<FeeSpeed, CacheEntry>();
const inFlight = new Map<FeeSpeed, Promise<FeeEstimate>>();

function clampFee(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return BASE_FEE;
  return Math.min(Math.max(Math.ceil(raw), BASE_FEE), MAX_INCLUSION_FEE_STROOPS);
}

function toEstimate(raw: number): FeeEstimate {
  const fee = clampFee(raw);
  return { fee, surge: fee > BASE_FEE * 10 };
}

function pickPercentile(
  stats: { p70?: string; p90?: string } | undefined,
  speed: FeeSpeed,
): number {
  const value = stats?.[speed];
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : BASE_FEE;
}

async function fetchClassicFee(speed: FeeSpeed): Promise<FeeEstimate> {
  const server = new Horizon.Server(NETWORK.horizonUrl);
  const stats = await server.feeStats();
  return toEstimate(pickPercentile(stats.max_fee, speed));
}

async function fetchSorobanFee(speed: FeeSpeed): Promise<FeeEstimate> {
  const server = new SorobanRpc.Server(NETWORK.sorobanRpcUrl);
  const stats = await server.getFeeStats();
  return toEstimate(pickPercentile(stats.inclusionFee, speed));
}

/**
 * Returns the inclusion fee (per operation, in stroops) to use for a new
 * transaction, clamped to {@link MAX_INCLUSION_FEE_STROOPS}.
 *
 * @param kind  - `'classic'` (Horizon fee stats) or `'soroban'` (RPC fee stats).
 * @param speed - Percentile to target; defaults to `p70`.
 */
export async function estimateInclusionFee(
  kind: 'classic' | 'soroban',
  speed: FeeSpeed = 'p70',
): Promise<FeeEstimate> {
  const now = Date.now();
  const cached = cache.get(speed);
  if (cached && now - cached.fetchedAt < FEE_CACHE_TTL_MS) {
    return cached.estimate;
  }

  const pending = inFlight.get(speed);
  if (pending) return pending;

  const request = (async () => {
    try {
      const estimate =
        kind === 'soroban'
          ? await fetchSorobanFee(speed)
          : await fetchClassicFee(speed);
      cache.set(speed, { estimate, fetchedAt: Date.now() });
      return estimate;
    } catch {
      // On failure fall back to the base fee rather than blocking the build.
      return toEstimate(BASE_FEE);
    } finally {
      inFlight.delete(speed);
    }
  })();

  inFlight.set(speed, request);
  return request;
}

/** Clears the fee cache. Exposed for tests. */
export function clearFeeCache(): void {
  cache.clear();
  inFlight.clear();
}
