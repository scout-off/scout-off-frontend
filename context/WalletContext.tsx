'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { mutate } from 'swr';
import { walletAdapters } from '@/lib/walletAdapters';
import type { WalletProvider as WalletProviderAlias } from '@/lib/walletAdapters';
import { purgeAllContactDetails } from '@/lib/contactDetailsCache';
import { getServerSession, refreshSession } from '@/lib/sessionClient';
import { clearUserCaches } from '@/lib/pwaCacheConfig';
import {
  WALLET_SESSION_KEY,
  REMEMBERED_ADDRESSES_KEY,
  SESSION_EXPIRY_KEY,
  SESSION_INVALIDATED_KEY,
} from '@/lib/storageKeys';
import { removeWalletScopedKeys, setActiveWallet } from '@/lib/activeWallet';
import { BLOCKED_USERS_KEY } from '@/lib/messaging/moderation';
import { isMainnet } from '@/lib/network';

// @stellar/stellar-sdk and lib/stellar.ts (which also pulls it in) are
// dynamically imported inside the functions below that actually need them
// (loadBalance, doConnect, signAndSubmit, signOnly) rather than statically
// here — WalletProvider is mounted at the root layout, so a static import
// would put the whole SDK (and its sodium-native/crypto deps) on every
// page's critical path just to compute a couple of constants and support
// features most visitors never touch. lib/network.ts is SDK-free, so it is
// safe to import here.
const CURRENT_NETWORK_TYPE: 'testnet' | 'public' = isMainnet()
  ? 'public'
  : 'testnet';

// ── Wallet provider types ─────────────────────────────────────────────────────

export type WalletProvider = WalletProviderAlias;

/** Stored wallet provider info used by WalletButton etc. */
export interface WalletProviderInfo {
  provider: WalletProvider;
  label: string;
  icon: string;
  /**
   * Set when the provider is listed but not yet backed by a working
   * adapter (see lib/walletAdapters.ts). The UI must render these as
   * disabled/"coming soon" rather than wiring them up to connect —
   * their adapter throws unconditionally if invoked.
   */
  comingSoon?: boolean;
}

/**
 * WalletConnect is only offered when a project ID is configured (see
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.example). Without it the
 * adapter cannot reach the relay, so the entry is hidden entirely rather
 * than shown as "coming soon".
 */
const WALLETCONNECT_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
);

export const WALLET_PROVIDERS: WalletProviderInfo[] = [
  { provider: 'freighter', label: 'Freighter', icon: '🔶' },
  { provider: 'albedo', label: 'Albedo', icon: '✨' },
  { provider: 'lobstr', label: 'LOBSTR', icon: '🌐', comingSoon: true },
  { provider: 'ledger', label: 'Ledger', icon: '💎' },
  ...(WALLETCONNECT_ENABLED
    ? [
        {
          provider: 'walletconnect' as WalletProvider,
          label: 'Mobile wallet (WalletConnect)',
          icon: '📱',
        },
      ]
    : []),
];

/** Official install page for each wallet provider, used by the "Install" prompt. */
export const WALLET_INSTALL_URLS: Record<WalletProvider, string> = {
  freighter: 'https://freighter.app',
  albedo: 'https://albedo.link',
  lobstr: 'https://lobstr.co',
  ledger: 'https://www.ledger.com/stellar-wallet',
  walletconnect: 'https://walletconnect.com/explorer?search=stellar',
};

/** Checks whether a given wallet provider's extension/app is installed/available. */
export async function isWalletInstalled(
  provider: WalletProvider,
): Promise<boolean> {
  if (provider === 'ledger') {
    try {
      const { default: TransportWebHID } =
        await import('@ledgerhq/hw-transport-webhid');
      return TransportWebHID.isSupported();
    } catch {
      return false;
    }
  }
  if (provider === 'albedo') {
    // Albedo is a web-based wallet (https://albedo.link) — it always works
    // as long as popups are allowed. Probing `getPublicKey()` here would
    // trigger an unexpected Albedo popup on page load, so we just claim
    // it's installed. Per-wallet popup-block / user-cancel errors are
    // surfaced as friendly toasts in lib/walletAdapters.ts's
    // `mapAlbedoError` on the actual connect attempt.
    return true;
  }
  if (provider === 'walletconnect') {
    // WalletConnect is transport-agnostic: any WC-compatible Stellar mobile
    // wallet can pair via QR/deep link, so there is nothing to probe here.
    // The adapter itself rejects when the project ID is unset.
    return WALLETCONNECT_ENABLED;
  }
  try {
    await walletAdapters[provider].getPublicKey();
    return true;
  } catch {
    return false;
  }
}

// Storage keys (incl. the cross-tab session-invalidation signal key, whose
// set-then-remove fires `storage` events in other tabs) live in
// lib/storageKeys.ts.

// ── Periodic session reconciliation cadence ───────────────────────────────────
// GET /api/auth/session is rate-limited to 30 requests per IP per 10 seconds
// (app/api/auth/session/route.ts:19-20).  With a 60-second polling interval
// and at most ~5 tabs open simultaneously, the worst-case burst is 5 req/60s
// ≈ 0.83 req/10s — well under the 30/10s ceiling.  The tab-refocus
// (visibilitychange) check is instant and doesn't count toward this cadence
// since it's a one-off, not a recurring timer.
const RECONCILIATION_INTERVAL_MS = 60_000; // 60 seconds

// ── Session types ─────────────────────────────────────────────────────────────

interface StoredSession {
  publicKey: string;
  provider: WalletProvider;
  networkType: 'testnet' | 'public';
}

/** A previously-used wallet address, stored for the account switcher. */
export interface RememberedAddress {
  publicKey: string;
  provider: WalletProvider;
  /** When this address was last used (ISO string). */
  lastUsed: string;
}

// ── Session persistence helpers ───────────────────────────────────────────────

function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(WALLET_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function setStoredSession(
  publicKey: string,
  provider: WalletProvider,
  networkType: 'testnet' | 'public',
) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      WALLET_SESSION_KEY,
      JSON.stringify({ publicKey, provider, networkType }),
    );
  }
}

function removeStoredSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(WALLET_SESSION_KEY);
  }
}

// ── Session expiry helpers ────────────────────────────────────────────────────

function getSessionExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (!val) return null;
    const ts = parseInt(val, 10);
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

function setSessionExpiry(expiresAtMs: number) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAtMs));
  }
}

function removeSessionExpiry() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  }
}

// ── Account-switch mismatch sentinel ─────────────────────────────────────────
//
// Thrown by doConnect/connectWithProvider when the caller provided an
// expectedPublicKey that does not match the key actually returned by the wallet
// adapter.  AccountSwitcher (and any future caller with a specific target address)
// can `instanceof`-check this to distinguish a mismatch from a generic failure
// and surface an actionable "switch your wallet's active account" message.
//
// The class is exported so tests and UI can import it without pulling in the
// full WalletContext bundle.
export class WalletAccountMismatchError extends Error {
  /** The address the user intended to switch to. */
  readonly expectedPublicKey: string;
  /** The address the wallet extension actually returned. */
  readonly actualPublicKey: string;

  constructor(expectedPublicKey: string, actualPublicKey: string) {
    super(
      `Wallet account mismatch: expected ${expectedPublicKey}, got ${actualPublicKey}. ` +
        'Please switch the active account inside your wallet extension and try again.',
    );
    this.name = 'WalletAccountMismatchError';
    this.expectedPublicKey = expectedPublicKey;
    this.actualPublicKey = actualPublicKey;
    // Maintain proper prototype chain in transpiled environments.
    Object.setPrototypeOf(this, WalletAccountMismatchError.prototype);
  }
}

// ── Remembered addresses helpers ──────────────────────────────────────────────

export function getRememberedAddresses(): RememberedAddress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REMEMBERED_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is RememberedAddress =>
        a && typeof a.publicKey === 'string' && typeof a.provider === 'string',
    );
  } catch {
    return [];
  }
}

function rememberAddress(publicKey: string, provider: WalletProvider) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRememberedAddresses().filter(
      (a) => a.publicKey !== publicKey,
    );
    const next: RememberedAddress[] = [
      { publicKey, provider, lastUsed: new Date().toISOString() },
      ...existing,
    ].slice(0, 10);
    localStorage.setItem(REMEMBERED_ADDRESSES_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / serialization errors
  }
}

// ── WalletConnect session restore ─────────────────────────────────────────────
//
// WalletConnect sessions live in the SDK's own storage (localStorage by
// default), so after a reload the pairing survives even though our React
// state does not.  On mount we ask the adapter to rehydrate any existing
// session and, if the restored account matches the stored session, keep the
// user signed in.  The adapter is dynamically imported so the WC SDK stays
// out of the shared runtime chunk unless the user actually used it.
async function restoreWalletConnectSession(
  stored: StoredSession,
): Promise<string | null> {
  if (stored.provider !== 'walletconnect') return null;
  try {
    const adapter = walletAdapters.walletconnect;
    const publicKey = await adapter.getPublicKey();
    if (!publicKey) return null;
    // Reject sessions that were restored on the wrong chain — the adapter
    // throws on a namespace mismatch, but guard here too so a stale stored
    // session can never silently authenticate against the wrong network.
    if (publicKey !== stored.publicKey) return null;
    return publicKey;
  } catch {
    return null;
  }
}

// ── Context shape ─────────────────────────────────────────────────────────────

export interface WalletContextValue {
  publicKey: string | null;
  provider: WalletProvider | null;
  networkType: 'testnet' | 'public';
  connecting: boolean;
  error: string | null;
  connect: (provider: WalletProvider) => Promise<string | null>;
  connectWithProvider: (
    provider: WalletProvider,
    expectedPublicKey?: string,
  ) => Promise<string | null>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
  signAuthEntry: (entryXdr: string) => Promise<string>;
  signOnly: (xdr: string) => Promise<string>;
  signAndSubmit: (xdr: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
  balance: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}

// ── Provider component ────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const stored = getStoredSession();
    if (!stored) return;

    // Reject sessions stored for a different network than the one this build
    // targets (e.g. a testnet session after switching to mainnet).
    if (stored.networkType !== CURRENT_NETWORK_TYPE) {
      removeStoredSession();
      removeSessionExpiry();
      return;
    }

    // Expired sessions are dropped without touching the wallet.
    const expiry = getSessionExpiry();
    if (expiry !== null && Date.now() > expiry) {
      removeStoredSession();
      removeSessionExpiry();
      return;
    }

    if (stored.provider === 'walletconnect') {
      // WalletConnect sessions persist in the SDK's storage; rehydrate them
      // asynchronously and only then mark the user as connected.
      void restoreWalletConnectSession(stored).then((restoredKey) => {
        if (restoredKey) {
          setPublicKey(restoredKey);
          setProvider('walletconnect');
          setActiveWallet(restoredKey);
        } else {
          removeStoredSession();
          removeSessionExpiry();
        }
      });
      return;
    }

    setPublicKey(stored.publicKey);
    setProvider(stored.provider);
    setActiveWallet(stored.publicKey);
  }, []);

  // ── Balance loading ─────────────────────────────────────────────────────────
  const loadBalance = useCallback(async (key: string) => {
    try {
      const { fetchBalance } = await import('@/lib/stellar');
      const bal = await fetchBalance(key);
      setBalance(bal);
    } catch {
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    if (publicKey) void loadBalance(publicKey);
    else setBalance(null);
  }, [publicKey, loadBalance]);

  // ── Connect ─────────────────────────────────────────────────────────────────
  const doConnect = useCallback(
    async (
      targetProvider: WalletProvider,
      expectedPublicKey?: string,
    ): Promise<string | null> => {
      setConnecting(true);
      setError(null);
      try {
        const adapter = walletAdapters[targetProvider];
        if (!adapter) throw new Error(`Unknown wallet provider: ${targetProvider}`);
        const key = await adapter.connect();
        if (!key) throw new Error('Wallet did not return a public key');
        if (expectedPublicKey && key !== expectedPublicKey) {
          throw new WalletAccountMismatchError(expectedPublicKey, key);
        }
        setPublicKey(key);
        setProvider(targetProvider);
        setStoredSession(key, targetProvider, CURRENT_NETWORK_TYPE);
        setActiveWallet(key);
        rememberAddress(key, targetProvider);
        return key;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to connect wallet';
        setError(message);
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const connect = useCallback(
    (targetProvider: WalletProvider) => doConnect(targetProvider),
    [doConnect],
  );

  const connectWithProvider = useCallback(
    (targetProvider: WalletProvider, expectedPublicKey?: string) =>
      doConnect(targetProvider, expectedPublicKey),
    [doConnect],
  );

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    const currentProvider = provider;
    try {
      if (currentProvider) {
        // WalletConnect keeps its pairing in the SDK's own storage, so a
        // plain state reset would leave the session alive and rehydrate it
        // on the next reload.  Always tear the WC session down explicitly.
        await walletAdapters[currentProvider]?.disconnect?.();
      }
    } catch {
      // Best-effort: a failed wallet-side disconnect must not block sign-out.
    }
    setPublicKey(null);
    setProvider(null);
    setBalance(null);
    setError(null);
    removeStoredSession();
    removeSessionExpiry();
    removeWalletScopedKeys();
    purgeAllContactDetails();
    try {
      localStorage.removeItem(BLOCKED_USERS_KEY);
    } catch {
      // ignore
    }
    try {
      await clearUserCaches();
    } catch {
      // ignore
    }
    void mutate(() => true, undefined, { revalidate: false });
  }, [provider]);

  // ── Signing ─────────────────────────────────────────────────────────────────
  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!provider) throw new Error('No wallet connected');
      return walletAdapters[provider].signTransaction(xdr);
    },
    [provider],
  );

  const signAuthEntry = useCallback(
    async (entryXdr: string): Promise<string> => {
      if (!provider) throw new Error('No wallet connected');
      const adapter = walletAdapters[provider];
      if (!adapter.signAuthEntry) {
        throw new Error('This wallet does not support signing auth entries');
      }
      return adapter.signAuthEntry(entryXdr);
    },
    [provider],
  );

  const signOnly = useCallback(
    async (xdr: string): Promise<string> => {
      if (!provider) throw new Error('No wallet connected');
      return walletAdapters[provider].signTransaction(xdr);
    },
    [provider],
  );

  const signAndSubmit = useCallback(
    async (xdr: string): Promise<string> => {
      if (!provider) throw new Error('No wallet connected');
      const signed = await walletAdapters[provider].signTransaction(xdr);
      const { submitTransaction } = await import('@/lib/stellar');
      return submitTransaction(signed);
    },
    [provider],
  );

  const refreshBalance = useCallback(async () => {
    if (publicKey) await loadBalance(publicKey);
  }, [publicKey, loadBalance]);

  // ── Periodic session reconciliation ─────────────────────────────────────────
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;

    const reconcile = async () => {
      try {
        const session = await getServerSession();
        if (cancelled) return;
        if (!session) {
          // Server session gone — try a silent refresh before giving up.
          const refreshed = await refreshSession();
          if (cancelled) return;
          if (!refreshed) {
            await disconnect();
          }
        }
      } catch {
        // Network hiccup — keep the local session and retry next tick.
      }
    };

    const interval = setInterval(reconcile, RECONCILIATION_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [publicKey, disconnect]);

  // ── Cross-tab invalidation ──────────────────────────────────────────────────
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_INVALIDATED_KEY) {
        void disconnect();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [disconnect]);

  const value = useMemo<WalletContextValue>(
    () => ({
      publicKey,
      provider,
      networkType: CURRENT_NETWORK_TYPE,
      connecting,
      error,
      connect,
      connectWithProvider,
      disconnect,
      signTransaction,
      signAuthEntry,
      signOnly,
      signAndSubmit,
      refreshBalance,
      balance,
    }),
    [
      publicKey,
      provider,
      connecting,
      error,
      connect,
      connectWithProvider,
      disconnect,
      signTransaction,
      signAuthEntry,
      signOnly,
      signAndSubmit,
      refreshBalance,
      balance,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
