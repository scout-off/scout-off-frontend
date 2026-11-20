'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useSavedSearchAlertPreferences } from '@/hooks/useSavedSearchAlertPreferences';
import Select from '@/components/ui/Select';
import type { NotificationPreferences } from '@/types';

// `messageKey` indexes `notifications.preferences.<messageKey>_label` and
// `_description` in messages/*.json.
const CATEGORIES: {
  key: Exclude<keyof NotificationPreferences, 'version'>;
  messageKey: 'milestone_approvals' | 'contact_unlocks';
}[] = [
  { key: 'milestoneApprovals', messageKey: 'milestone_approvals' },
  { key: 'contactUnlocks', messageKey: 'contact_unlocks' },
];

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green ${
        checked ? 'bg-brand-green' : 'bg-gray-700'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/**
 * Settings panel letting a wallet toggle which event types generate in-app
 * notifications (issue #560). Categories map 1:1 to what the notification
 * center (issue #557) actually produces — milestone approvals and contact
 * unlocks; there's no push-notification system in this app yet, so
 * disabling a category only affects the in-app bell/panel.
 */
export default function NotificationPreferencesPanel() {
  const { publicKey, isAuthenticated } = useWallet();
  const { preferences, loading, update } = useNotificationPreferences(
    isAuthenticated ? publicKey : null,
  );
  const savedSearchAlerts = useSavedSearchAlertPreferences(
    isAuthenticated ? publicKey : null,
  );
  const [saving, setSaving] = useState<
    keyof NotificationPreferences | 'savedSearchMatches' | null
  >(null);
  const t = useTranslations('notifications.preferences');

  async function toggle(key: keyof NotificationPreferences) {
    setSaving(key);
    try {
      await update({ ...preferences, [key]: !preferences[key] });
    } finally {
      setSaving(null);
    }
  }

  async function updateSavedSearchAlerts(
    next: typeof savedSearchAlerts.preferences,
  ) {
    setSaving('savedSearchMatches');
    try {
      await savedSearchAlerts.update(next);
    } finally {
      setSaving(null);
    }
  }

  if (!isAuthenticated) {
    return <p className="text-xs text-gray-500">{t('connect_prompt')}</p>;
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-gray-800">
        {CATEGORIES.map(({ key, messageKey }) => {
          const label = t(`${messageKey}_label`);
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-gray-400">
                  {t(`${messageKey}_description`)}
                </p>
              </div>
              <Toggle
                checked={preferences[key]}
                onChange={() => toggle(key)}
                label={label}
              />
            </li>
          );
        })}
        <li className="flex flex-col gap-3 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">
                {t('saved_search_matches_label')}
              </p>
              <p className="text-xs text-gray-400">
                {t('saved_search_matches_description')}
              </p>
            </div>
            <Toggle
              checked={savedSearchAlerts.preferences.enabled}
              onChange={() =>
                updateSavedSearchAlerts({
                  ...savedSearchAlerts.preferences,
                  enabled: !savedSearchAlerts.preferences.enabled,
                })
              }
              label={t('saved_search_matches_label')}
            />
          </div>
          {savedSearchAlerts.preferences.enabled && (
            <Select
              id="saved-search-alert-delivery"
              label={t('saved_search_delivery_label')}
              value={savedSearchAlerts.preferences.delivery}
              onChange={(e) =>
                updateSavedSearchAlerts({
                  ...savedSearchAlerts.preferences,
                  delivery: e.target.value === 'daily' ? 'daily' : 'instant',
                })
              }
            >
              <option value="instant">
                {t('saved_search_delivery_instant')}
              </option>
              <option value="daily">{t('saved_search_delivery_daily')}</option>
            </Select>
          )}
        </li>
      </ul>
      {(loading || savedSearchAlerts.loading) && (
        <p className="pt-3 text-xs text-gray-500">{t('loading')}</p>
      )}
      {saving && (
        <p className="pt-3 text-xs text-gray-500" role="status">
          {t('saving')}
        </p>
      )}
    </div>
  );
}
