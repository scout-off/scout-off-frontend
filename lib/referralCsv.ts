import { escapeCsvValue } from '@/lib/csvSafe';
import type { ReferralCode } from '@/types';

const CSV_HEADERS = [
  'code',
  'invite URL',
  'created date',
  'redeemed status',
  'redeemed date',
];

function normalizeTimestamp(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  const absValue = Math.abs(value);
  if (absValue >= 1e12) {
    return value;
  }

  return value * 1000;
}

function formatReferralDate(value: number | null | undefined): string {
  const normalized = normalizeTimestamp(value);
  if (normalized === null) return '';

  return new Date(normalized).toISOString();
}

export function buildReferralCodesCsv(codes: ReferralCode[], baseUrl: string) {
  const rows = codes.map((referral) => {
    const inviteUrl = `${baseUrl}/scout/subscribe?ref=${referral.code}`;
    const redeemedStatus =
      referral.usedBy !== null ? 'Redeemed' : 'Not redeemed';
    const redeemedDate =
      referral.usedBy !== null ? formatReferralDate(referral.usedAt) : '';

    return [
      escapeCsvValue(referral.code),
      escapeCsvValue(inviteUrl),
      escapeCsvValue(formatReferralDate(referral.createdAt)),
      escapeCsvValue(redeemedStatus),
      escapeCsvValue(redeemedDate),
    ].join(',');
  });

  return [CSV_HEADERS.join(','), ...rows].join('\n') + '\n';
}
