export type WalletProvider = 'freighter' | 'albedo' | 'lobstr' | 'ledger';

const STANDARD_LEDGER_PATH = "44'/148'/0'";

let _ledgerPublicKey: string | null = null;

export const walletAdapters: Record<
  WalletProvider,
  {
    getPublicKey(): Promise<string>;
    signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
  }
> = {
  // Freighter's SDK is dynamically imported on first use — like Albedo below
  // — so the extension-detection code isn't pulled into every page's initial
  // bundle just because WalletProvider is mounted at the root layout.
  //
  // freighter-api v3+ (issue #1515): `getPublicKey()` was replaced by
  // `getAddress()` which returns `{ address, error? }`, and `isConnected()`
  // now returns `{ isConnected: boolean }` instead of a bare boolean.
  freighter: {
    async getPublicKey() {
      const { getAddress, isConnected } =
        await import('@stellar/freighter-api');
      const connected = await isConnected();
      if (!connected?.isConnected) throw new Error('Freighter not installed');
      const result = await getAddress();
      if (result?.error) {
        const e = result.error as string | { message?: string };
        throw new Error(typeof e === 'string' ? e : e.message ?? 'Freighter access failed');
      }
      if (!result?.address) throw new Error('Freighter did not return an address');
      return result.address;
    },
    async signTransaction(xdr, networkPassphrase) {
      const { signTransaction } = await import('@stellar/freighter-api');
      const result: unknown = await signTransaction(xdr, { networkPassphrase });
      // v2 returned the XDR string directly.
      if (typeof result === 'string') return result;
      // v6 returns { signedTxXdr, signerAddress, error? }; earlier v3+ builds
      // used `signedTransaction`. An empty XDR means the user declined.
      const r = (result ?? {}) as {
        signedTxXdr?: string;
        signedTransaction?: string;
        error?: string | { message?: string };
      };
      if (r.error) {
        throw new Error(typeof r.error === 'string' ? r.error : r.error.message ?? 'Freighter signing failed');
      }
      const signed = r.signedTxXdr || r.signedTransaction;
      if (!signed) throw new Error('Freighter did not return a signed transaction');
      return signed;
    },
  },
  // Albedo is web-based — there's no extension to inject `window.albedo`,
  // it always pops up to https://albedo.link/. The adapter is dynamically
  // imported on first use so SSR / Node test processes never touch the
  // `window`-coupled SDK at module-load time.
  albedo: {
    async getPublicKey() {
      try {
        const { default: albedo } = await import('@albedo-link/intent');
        // Albedo SDK requires `publicKey(params)` per @albedo-link/intent@0.13
        // types; passing an empty options object selects the default signer.
        const result = await albedo.publicKey({});
        if (!result?.pubkey) {
          throw new Error(
            'Albedo did not return a public key. Please try again.',
          );
        }
        return result.pubkey;
      } catch (err) {
        throw mapAlbedoError(err, 'Failed to get public key from Albedo');
      }
    },
    async signTransaction(xdr, networkPassphrase) {
      try {
        const { default: albedo } = await import('@albedo-link/intent');
        // Albedo's `tx({ network })` accepts the network passphrase string;
        // pass it through verbatim and let Albedo handle unrecognized values.
        const result = await albedo.tx({ xdr, network: networkPassphrase });
        const signed = result?.signed_envelope_xdr;
        if (!signed) {
          throw new Error(
            'Albedo did not return a signed envelope. Please try again.',
          );
        }
        return signed;
      } catch (err) {
        throw mapAlbedoError(err, 'Failed to sign transaction with Albedo');
      }
    },
  },
  lobstr: {
    async getPublicKey() {
      throw new Error('LOBSTR adapter not configured');
    },
    async signTransaction(_xdr, _networkPassphrase) {
      throw new Error('LOBSTR adapter not configured');
    },
  },
  // hw-transport-webhid/hw-app-str (WebHID + Stellar app protocol) and
  // stellar-sdk's TransactionBuilder/StrKey are dynamically imported on
  // first use for the same reason as Freighter above — a Ledger is a rare,
  // deliberate connection path, not something every page load should pay
  // the parse/eval cost for.
  ledger: {
    async getPublicKey() {
      let transport;
      try {
        const [{ default: TransportWebHID }, { default: Str }, { StrKey }] =
          await Promise.all([
            import('@ledgerhq/hw-transport-webhid'),
            import('@ledgerhq/hw-app-str'),
            import('@stellar/stellar-sdk'),
          ]);
        transport = await TransportWebHID.create();
        const str = new Str(transport);
        const { rawPublicKey } = await str.getPublicKey(
          STANDARD_LEDGER_PATH,
          false,
        );
        const pk = StrKey.encodeEd25519PublicKey(rawPublicKey);
        _ledgerPublicKey = pk;
        return pk;
      } catch (err: unknown) {
        throw mapLedgerError(err, 'Failed to get public key from Ledger');
      } finally {
        if (transport) await transport.close().catch(() => {});
      }
    },
    async signTransaction(xdr, networkPassphrase) {
      let transport;
      try {
        const [{ default: TransportWebHID }, { default: Str }, sdk] =
          await Promise.all([
            import('@ledgerhq/hw-transport-webhid'),
            import('@ledgerhq/hw-app-str'),
            import('@stellar/stellar-sdk'),
          ]);
        const { TransactionBuilder, StrKey } = sdk;
        transport = await TransportWebHID.create();
        const str = new Str(transport);
        const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
        const signatureBase = tx.signatureBase();
        const { signature } = await str.signTransaction(
          STANDARD_LEDGER_PATH,
          signatureBase,
        );
        const pk =
          _ledgerPublicKey ??
          StrKey.encodeEd25519PublicKey(
            (await str.getPublicKey(STANDARD_LEDGER_PATH, false)).rawPublicKey,
          );
        tx.addSignature(pk, signature.toString('hex'));
        return tx.toXDR();
      } catch (err: unknown) {
        throw mapLedgerError(err, 'Failed to sign transaction with Ledger');
      } finally {
        if (transport) await transport.close().catch(() => {});
      }
    },
  },
};

function mapAlbedoError(err: unknown, fallbackMessage: string): Error {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('user declined') || msg.includes('rejected')) {
      return new Error(
        'Albedo signing was cancelled. Please try again to continue.',
      );
    }
    if (msg.includes('popup') || msg.includes('blocked')) {
      return new Error(
        'Albedo popup was blocked by your browser. Please allow popups for this site and try again.',
      );
    }
  }
  return err instanceof Error ? err : new Error(fallbackMessage);
}

function mapLedgerError(err: unknown, fallbackMessage: string): Error {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (
      msg.includes('no device') ||
      msg.includes('device not found') ||
      msg.includes('no_webhid') ||
      msg.includes('no webhid') ||
      msg.includes('failed to open') ||
      msg.includes('access denied')
    ) {
      return new Error(
        'Ledger device not detected. Please connect your Ledger and open the Stellar app, then try again.',
      );
    }

    if (
      msg.includes('user refused') ||
      msg.includes('denied') ||
      msg.includes('app does not seem to be open')
    ) {
      return new Error(
        'Request cancelled. Make sure the Stellar app is open on your Ledger device and try again.',
      );
    }

    if (
      msg.includes('not supported') ||
      msg.includes('webhid is not supported')
    ) {
      return new Error(
        'WebHID is not supported in your browser. Please use Chrome, Edge, or Opera.',
      );
    }

    if (msg.includes('stellar app') || msg.includes('0x6985')) {
      return new Error(
        'Stellar app is not open on your Ledger device. Please open it and try again.',
      );
    }
  }
  return err instanceof Error ? err : new Error(fallbackMessage);
}
