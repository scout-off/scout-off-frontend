import { useCallback } from 'react';
import { useTranslations, type Messages } from 'next-intl';
import { parseApiError } from '@/lib/apiErrorCodes';

/**
 * Returns a function mapping an API error response body (see
 * lib/apiErrors.ts) to a localized message from the `apiErrors` namespace,
 * falling back to `apiErrors.UNKNOWN` for unknown codes or uncoded bodies.
 */
export function useApiErrorMessage(): (body: unknown) => string {
  const t = useTranslations('apiErrors');
  return useCallback(
    (body: unknown) => {
      const parsed = parseApiError(body);
      // Codes come from the server, so `t.has` is the runtime guard that
      // narrows them to keys of the `apiErrors` namespace.
      const code = parsed?.code as keyof Messages['apiErrors'] | undefined;
      if (code && t.has(code)) {
        return t(code, parsed?.params);
      }
      return t('UNKNOWN');
    },
    [t],
  );
}
