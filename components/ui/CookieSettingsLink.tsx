'use client';

import { reopenConsentBanner } from '@/components/ui/CookieConsentBanner';

interface CookieSettingsLinkProps {
  label: string;
}

/**
 * Client component wrapper for the footer "Cookie Settings" link.
 * Calls reopenConsentBanner() instead of doing a full page reload.
 */
export default function CookieSettingsLink({ label }: CookieSettingsLinkProps) {
  return (
    <button
      type="button"
      onClick={() => reopenConsentBanner()}
      className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition"
    >
      {label}
    </button>
  );
}
