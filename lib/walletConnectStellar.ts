/**
 * WalletConnect v2 transport for Stellar mobile wallets (issue #1673).
 *
 * Uses `@walletconnect/universal-provider`, which supports non-EVM
 * namespaces, with the Stellar namespace defined by the WalletConnect
 * Stellar spec:
 *
 *   - chains:  `stellar:pubnet` / `stellar:testnet`
 *   - methods: `stellar_signXDR` (returns `{ signedXDR }`)
 *   - account: `stellar:<chain>:<G... address>` in the session namespace
 *
 * The SDK is dynamically imported on first use so the root bundle never pays
 * for it unless a user actually picks the WalletConnect option. While a
 * pairing is pending, the pairing URI is shown as a QR code in a minimal
 * overlay (no extra modal dependency).
 */
import type UniversalProviderType from '@walletconnect/universal-provider';

type Provider = InstanceType<typeof UniversalProviderType>;

const STELLAR_METHODS = ['stellar_signXDR'];

let providerPromise: Promise<Provider> | null = null;

export function walletConnectProjectId(): string | undefined {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined;
}

export function stellarChainFor(networkPassphrase: string): string {
  // Pubnet passphrase is "Public Global Stellar Network ; September 2015".
  return networkPassphrase.includes('Public Global')
    ? 'stellar:pubnet'
    : 'stellar:testnet';
}

async function getProvider(): Promise<Provider> {
  const projectId = walletConnectProjectId();
  if (!projectId) {
    throw new Error(
      'WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable mobile wallets.',
    );
  }
  if (!providerPromise) {
    providerPromise = (async () => {
      const { default: UniversalProvider } =
        await import('@walletconnect/universal-provider');
      const provider = await UniversalProvider.init({
        projectId,
        metadata: {
          name: 'ScoutOff',
          description: 'ScoutOff player and scout wallet',
          url: typeof window !== 'undefined' ? window.location.origin : '',
          icons: [],
        },
      });
      provider.on('display_uri', (uri: string) => {
        void showPairingQr(uri);
      });
      provider.on('session_delete', () => {
        hidePairingQr();
      });
      return provider;
    })().catch((err) => {
      providerPromise = null;
      throw err;
    });
  }
  return providerPromise;
}

/** Returns the G-address for `chain` from the live session, if any. */
function sessionAddress(provider: Provider, chain: string): string | null {
  const accounts = provider.session?.namespaces?.stellar?.accounts ?? [];
  const prefix = `${chain}:`;
  const match = accounts.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

/**
 * Connects (pairing via QR when there is no session) and returns the
 * Stellar address the wallet approved for `networkPassphrase`.
 */
export async function connectWalletConnect(
  networkPassphrase: string,
): Promise<string> {
  const provider = await getProvider();
  const chain = stellarChainFor(networkPassphrase);

  let address = provider.session ? sessionAddress(provider, chain) : null;
  if (!address) {
    if (provider.session) {
      // Existing session is for the other network — start over.
      await provider.disconnect().catch(() => undefined);
    }
    try {
      await provider.connect({
        namespaces: {
          stellar: { chains: [chain], methods: STELLAR_METHODS, events: [] },
        },
      });
    } finally {
      hidePairingQr();
    }
    address = sessionAddress(provider, chain);
  }
  if (!address) {
    throw new Error(
      'WalletConnect did not return a Stellar account for this network.',
    );
  }
  return address;
}

/** Signs `xdr` with the connected wallet and returns the signed envelope. */
export async function signWithWalletConnect(
  xdr: string,
  networkPassphrase: string,
): Promise<string> {
  const provider = await getProvider();
  const chain = stellarChainFor(networkPassphrase);
  if (!provider.session) {
    throw new Error('WalletConnect is not connected. Please reconnect.');
  }
  if (!sessionAddress(provider, chain)) {
    throw new Error(
      `WalletConnect session is on the wrong network. Please reconnect on ${chain}.`,
    );
  }
  const result = await provider.request<
    { signedXDR?: string } | string | undefined
  >({ method: 'stellar_signXDR', params: { xdr } }, chain);
  const signed = typeof result === 'string' ? result : result?.signedXDR;
  if (!signed) {
    throw new Error(
      'WalletConnect did not return a signed transaction. Please try again.',
    );
  }
  return signed;
}

/** Returns the address of a persisted session after a reload, or null. */
export async function restoreWalletConnect(
  networkPassphrase: string,
): Promise<string | null> {
  if (!walletConnectProjectId()) return null;
  try {
    const provider = await getProvider();
    if (!provider.session) return null;
    return sessionAddress(provider, stellarChainFor(networkPassphrase));
  } catch {
    return null;
  }
}

/** Ends the WalletConnect session so the pairing does not linger. */
export async function disconnectWalletConnectSession(): Promise<void> {
  if (!providerPromise) return;
  try {
    const provider = await providerPromise;
    if (provider.session) await provider.disconnect();
  } catch {
    // Best-effort: the relay may already be gone.
  } finally {
    hidePairingQr();
  }
}

// ── Pairing QR overlay ───────────────────────────────────────────────────────

const OVERLAY_ID = 'scoutoff-walletconnect-qr';

async function showPairingQr(uri: string): Promise<void> {
  if (typeof document === 'undefined') return;
  hidePairingQr();

  const { toDataURL } = await import('qrcode');
  const dataUrl = await toDataURL(uri, { margin: 1, width: 280 });

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Scan with your Stellar mobile wallet');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7)';

  const panel = document.createElement('div');
  panel.style.cssText =
    'background:#fff;color:#111;border-radius:12px;padding:20px;max-width:320px;text-align:center;font:14px system-ui,sans-serif';

  const heading = document.createElement('p');
  heading.textContent = 'Scan with your Stellar mobile wallet';
  heading.style.cssText = 'margin:0 0 12px;font-weight:600';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'WalletConnect pairing QR code';
  img.width = 280;
  img.height = 280;

  const link = document.createElement('a');
  link.href = uri;
  link.textContent = 'Open wallet app';
  link.style.cssText = 'display:block;margin-top:12px;color:#0a7';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Cancel';
  close.style.cssText =
    'margin-top:12px;padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer';
  close.addEventListener('click', () => {
    hidePairingQr();
    void providerPromise?.then((p) => p.abortPairingAttempt());
  });

  panel.append(heading, img, link, close);
  overlay.append(panel);
  document.body.append(overlay);
}

function hidePairingQr(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(OVERLAY_ID)?.remove();
}
