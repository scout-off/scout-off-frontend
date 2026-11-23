/**
 * Feature-flag utility — reads from NEXT_PUBLIC_ env vars at runtime.
 *
 * All flags are scoped under `NEXT_PUBLIC_FEATURE_*` so they are
 * (a) visible to the browser bundle and (b) clearly distinguishable
 * from required configuration vars.
 *
 * Usage:
 *   import { isFeatureEnabled } from '@/lib/featureFlags';
 *   if (isFeatureEnabled('DATA_EXPORT')) { ... }
 *
 * Tree-shaking: because this is a tiny named export that references
 * `process.env` at the module level, bundlers can inline the constant
 * and DCE the dead branch when the flag is disabled.
 */

// Normalise truthy values: "1", "true", "yes" → true; everything else → false
function normaliseFlag(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'yes';
}

const FLAG_CACHE = new Map<string, boolean>();

/**
 * Checks whether a named feature flag is enabled.
 *
 * @param flag - The feature name, e.g. `'DATA_EXPORT'`. The lookup key is
 *               `NEXT_PUBLIC_FEATURE_${flag}`.
 * @returns `true` when the env var is set to `"1"`, `"true"`, or `"yes"`.
 */
export function isFeatureEnabled(flag: string): boolean {
  const cacheKey = `NEXT_PUBLIC_FEATURE_${flag}`;

  if (FLAG_CACHE.has(cacheKey)) {
    return FLAG_CACHE.get(cacheKey)!;
  }

  const value = process.env[cacheKey];
  const result = normaliseFlag(value);
  FLAG_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Clears the internal flag cache. Useful in tests or when env vars change
 * at runtime (e.g. after HMR in development).
 */
export function clearFeatureFlagCache(): void {
  FLAG_CACHE.clear();
}
