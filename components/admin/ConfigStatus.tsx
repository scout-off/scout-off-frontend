import React, { useEffect, useState } from 'react';
import DataTable from '@/components/ui/DataTable';

type ConfigEntry = {
  name: string;
  required: boolean;
  present: boolean;
  turnstile?: { configured: boolean; mismatched: boolean };
};

export default function ConfigStatus() {
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
    return <p className="text-sm text-gray-400">Loading config status…</p>;
  }

  if (unauthorized) {
    return (
      <p className="text-sm text-gray-400">
        Admin session required to view config status.
      </p>
    );
  }

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">
        Runtime Configuration Status
      </h2>
      <DataTable
        caption="Runtime configuration variables"
        captionHidden
        sortParam="configSort"
        className="w-full table-auto text-sm text-left"
        headerRowClassName="text-left text-gray-400"
        bodyClassName=""
        rowClassName="border-t border-gray-700"
        rows={config ?? []}
        rowKey={(c) => c.name}
        columns={[
          {
            key: 'name',
            header: 'Variable',
            sortable: true,
            headerClassName: 'pr-4',
            className: 'py-2 text-gray-300',
            render: (c) => c.name,
          },
          {
            key: 'required',
            header: 'Required',
            sortable: true,
            sortValue: (c) => (c.required ? 1 : 0),
            headerClassName: 'pr-4',
            className: 'py-2 text-gray-300',
            render: (c) => (c.required ? 'Yes' : 'No'),
          },
          {
            key: 'present',
            header: 'Present',
            sortable: true,
            sortValue: (c) => (c.present ? 1 : 0),
            headerClassName: 'pr-4',
            className: 'py-2',
            render: (c) =>
              c.turnstile ? (
                c.turnstile.mismatched ? (
                  <span className="text-red-400 font-medium">
                    Mismatched (site key / secret)
                  </span>
                ) : c.turnstile.configured ? (
                  <span className="text-green-400 font-medium">Configured</span>
                ) : (
                  <span className="text-gray-400 font-medium">
                    Unconfigured
                  </span>
                )
              ) : c.present ? (
                <span className="text-green-400 font-medium">Present</span>
              ) : (
                <span className="text-red-400 font-medium">Missing</span>
              ),
          },
        ]}
      />
    </section>
  );
}
