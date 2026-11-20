/**
 * Compile-time checks for typed next-intl messages (#1709). Never executed:
 * `tsc` fails if any `@ts-expect-error` below stops being an error, i.e. if
 * unknown keys or unknown namespaces type-check again.
 *
 * ICU argument checking is not enabled: it needs next-intl's generated
 * `messages/en.d.json.ts`, which types every plain `{arg}` as `string` and
 * rejects the numbers this codebase passes to them.
 */
import { useTranslations } from 'next-intl';

export function translationKeyTypeTests(): void {
  const t = useTranslations('session');
  t('dismiss');
  t('expiringSoonMessage', { minutes: 5 });

  // @ts-expect-error -- misspelled key
  t('dismis');

  // @ts-expect-error -- unknown namespace
  useTranslations('sesion');

  const tRoot = useTranslations();
  tRoot('nav.scout_dashboard');

  // @ts-expect-error -- misspelled nested key
  tRoot('nav.scout_dashbaord');
}
