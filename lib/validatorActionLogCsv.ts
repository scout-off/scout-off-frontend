import type { ValidatorActionEntry } from '@/hooks/useValidatorActionLog';

const CSV_HEADERS = ['timestamp', 'action', 'validator', 'player', 'milestone'];

const ACTION_LABELS: Record<ValidatorActionEntry['action'], string> = {
  approved: 'Milestone Approved',
  revoked: 'Milestone Revoked',
};

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Mirrors lib/auditLogCsv.ts's build<Thing>Csv(data) => string convention. */
export function buildValidatorActionLogCsv(
  entries: ValidatorActionEntry[],
): string {
  const rows = entries.map((entry) =>
    [
      new Date(entry.timestamp * 1000).toISOString(),
      ACTION_LABELS[entry.action],
      entry.validator ?? '',
      entry.playerId ?? '',
      entry.milestoneId ?? '',
    ]
      .map(escapeCsvValue)
      .join(','),
  );

  return [CSV_HEADERS.join(','), ...rows].join('\n') + '\n';
}
