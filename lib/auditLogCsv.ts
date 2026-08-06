import {
  ADMIN_AUDIT_ACTION_LABELS,
  type AdminAuditEntry,
} from '@/lib/adminAudit';

const CSV_HEADERS = [
  'timestamp',
  'action',
  'admin wallet',
  'target',
  'amount (XLM)',
  'tx hash',
  'status',
];

const STROOPS_PER_XLM = 10_000_000;

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Mirrors lib/referralCsv.ts's build<Thing>Csv(data) => string convention. */
export function buildAuditLogCsv(entries: AdminAuditEntry[]): string {
  const rows = entries.map((entry) => {
    const amountXlm =
      entry.amountStroops !== null
        ? (entry.amountStroops / STROOPS_PER_XLM).toString()
        : '';

    return [
      new Date(entry.timestamp * 1000).toISOString(),
      ADMIN_AUDIT_ACTION_LABELS[entry.actionType],
      entry.adminWallet,
      entry.target ?? '',
      amountXlm,
      entry.txHash ?? '',
      entry.status,
    ]
      .map(escapeCsvValue)
      .join(',');
  });

  return [CSV_HEADERS.join(','), ...rows].join('\n') + '\n';
}
