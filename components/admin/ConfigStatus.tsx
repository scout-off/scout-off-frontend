import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type ConfigEntry = {
  name: string;
  required: boolean;
  present: boolean;
  turnstile?: { configured: boolean; mismatched: boolean };
};

export default function ConfigStatus() {
  const t = useTranslations('admin.config');
  const [config, setConfig] = useState<ConfigEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config-status')
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          setUnauthorized(true);
          return [];
        }
        return res.json();
      })
      .then((data) => {
        setConfig(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setConfig([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400">{t('loading')}</p>;
  }

  if (unauthorized) {
    return <p className="text-sm text-gray-400">{t('unauthorized')}</p>;
  }

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
      <table className="w-full table-auto text-sm">
        <thead className="text-left text-gray-400">
          <tr>
            <th className="pr-4">{t('variable')}</th>
            <th className="pr-4">{t('required')}</th>
            <th className="pr-4">{t('present_header')}</th>
          </tr>
        </thead>
        <tbody>
          {config &&
            config.map((c) => (
              <tr key={c.name} className="border-t border-gray-700">
                <td className="py-2 text-gray-300">{c.name}</td>
                <td className="py-2 text-gray-300">
                  {c.required ? t('yes') : t('no')}
                </td>
                <td className="py-2">
                  {c.turnstile ? (
                    c.turnstile.mismatched ? (
                      <span className="text-red-400 font-medium">
                        {t('mismatched')}
                      </span>
                    ) : c.turnstile.configured ? (
                      <span className="text-green-400 font-medium">
                        {t('configured')}
                      </span>
                    ) : (
                      <span className="text-gray-400 font-medium">
                        {t('unconfigured')}
                      </span>
                    )
                  ) : c.present ? (
                    <span className="text-green-400 font-medium">
                      {t('present')}
                    </span>
                  ) : (
                    <span className="text-red-400 font-medium">
                      {t('missing')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
