import type { Page } from '@playwright/test';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

export type WalletBehavior = 'approve' | 'reject' | 'uninstalled';

export interface MockWalletOptions {
  /** Stellar secret seed (S...) for the deterministic test keypair this mock signs with. */
  secret: string;
  /** How the mock responds to connection/signing requests until `setBehavior` changes it. */
  behavior?: WalletBehavior;
}

export interface MockWallet {
  publicKey: string;
  keypair: Keypair;
  /** Change how the mock answers *subsequent* connect/sign requests on this page. */
  setBehavior(behavior: WalletBehavior): Promise<void>;
}

const SIGN_FN = '__e2eFreighterSign';
const BEHAVIOR_FLAG = '__e2eFreighterBehavior';

/**
 * Installs a mock of the Freighter browser-extension surface that
 * `lib/walletAdapters.ts` (via `@stellar/freighter-api`) talks to.
 *
 * This replicates the real extension's actual wire protocol rather than
 * stubbing `lib/walletAdapters.ts` itself, so the app code under test is
 * completely unmodified: a `window.freighter` flag for the isConnected()
 * fast path, plus a `window.postMessage` request/response pair
 * (`FREIGHTER_EXTERNAL_MSG_REQUEST` / `_RESPONSE`, `REQUEST_PUBLIC_KEY`,
 * `REQUEST_CONNECTION_STATUS`, `SUBMIT_TRANSACTION`) reverse-engineered from
 * `@stellar/freighter-api`'s bundled build. The `messagedId` (sic) field name
 * below is not a typo — it matches the real package's response-matching code.
 *
 * Signing itself is not faked: the exposed `__e2eFreighterSign` binding runs
 * in Node and signs with a real `Keypair`, so a genuinely valid signature is
 * produced against the deterministic test account for every request.
 */
export async function installMockFreighter(
  page: Page,
  options: MockWalletOptions,
): Promise<MockWallet> {
  const keypair = Keypair.fromSecret(options.secret);
  const publicKey = keypair.publicKey();
  const initialBehavior: WalletBehavior = options.behavior ?? 'approve';

  await page.exposeFunction(
    SIGN_FN,
    (transactionXdr: string, networkPassphrase: string) => {
      const tx = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  );

  await page.addInitScript(
    ({
      publicKey,
      behaviorFlag,
      signFn,
      initialBehavior,
    }: {
      publicKey: string;
      behaviorFlag: string;
      signFn: string;
      initialBehavior: WalletBehavior;
    }) => {
      (window as unknown as Record<string, unknown>)[behaviorFlag] =
        initialBehavior;

      Object.defineProperty(window, 'freighter', {
        configurable: true,
        get() {
          return (
            (window as unknown as Record<string, unknown>)[behaviorFlag] !==
            'uninstalled'
          );
        },
      });

      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as
          | {
              source?: string;
              messageId?: number;
              type?: string;
              transactionXdr?: string;
              networkPassphrase?: string;
            }
          | undefined;
        if (
          !data ||
          event.source !== window ||
          data.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST'
        ) {
          return;
        }

        const behavior = (window as unknown as Record<string, unknown>)[
          behaviorFlag
        ] as WalletBehavior;

        const respond = (payload: Record<string, unknown>) => {
          window.postMessage(
            {
              source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE',
              messagedId: data.messageId,
              ...payload,
            },
            window.location.origin,
          );
        };

        switch (data.type) {
          case 'REQUEST_CONNECTION_STATUS':
            respond({ isConnected: behavior !== 'uninstalled' });
            return;
          case 'REQUEST_PUBLIC_KEY':
            if (behavior === 'reject') {
              respond({ publicKey: '', error: 'User declined access' });
            } else {
              respond({ publicKey, error: '' });
            }
            return;
          case 'SUBMIT_TRANSACTION':
            if (behavior === 'reject') {
              respond({
                signedTransaction: '',
                error: 'User declined access',
              });
              return;
            }
            (
              (window as unknown as Record<string, unknown>)[signFn] as (
                xdr: string,
                passphrase?: string,
              ) => Promise<string>
            )(data.transactionXdr ?? '', data.networkPassphrase).then(
              (signedTransaction: string) =>
                respond({ signedTransaction, error: '' }),
              (err: unknown) =>
                respond({
                  signedTransaction: '',
                  error: err instanceof Error ? err.message : String(err),
                }),
            );
            return;
          default:
            return;
        }
      });
    },
    {
      publicKey,
      behaviorFlag: BEHAVIOR_FLAG,
      signFn: SIGN_FN,
      initialBehavior,
    },
  );

  return {
    publicKey,
    keypair,
    async setBehavior(behavior) {
      await page.evaluate(
        ({ flag, behavior }) => {
          (window as unknown as Record<string, unknown>)[flag] = behavior;
        },
        { flag: BEHAVIOR_FLAG, behavior },
      );
    },
  };
}
