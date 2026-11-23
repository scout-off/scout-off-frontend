import { buildReferralCodesCsv } from '@/lib/referralCsv';
import type { ReferralCode } from '@/types';

describe('buildReferralCodesCsv', () => {
  it('exports headers, invite URLs, dates, statuses, and escaped values', () => {
    const createdAt = new Date('2024-03-07T00:00:00.000Z').getTime();
    const redeemedAt = new Date('2024-03-07T00:00:02.000Z').getTime();

    const codes: ReferralCode[] = [
      {
        code: 'ABC123',
        scoutWallet: 'GSCOUT',
        createdAt,
        usedBy: null,
        usedAt: null,
      },
      {
        code: 'CODE, "quoted"',
        scoutWallet: 'GSCOUT',
        createdAt: createdAt + 1000,
        usedBy: 'GUSER',
        usedAt: redeemedAt,
      },
    ];

    const csv = buildReferralCodesCsv(codes, 'https://example.com');

    expect(csv).toContain(
      'code,invite URL,created date,redeemed status,redeemed date\n',
    );
    expect(csv).toContain(
      `ABC123,https://example.com/scout/subscribe?ref=ABC123,${new Date(createdAt).toISOString()},Not redeemed,\n`,
    );
    expect(csv).toContain(
      `"CODE, ""quoted""","https://example.com/scout/subscribe?ref=CODE, ""quoted""",${new Date(createdAt + 1000).toISOString()},Redeemed,${new Date(redeemedAt).toISOString()}\n`,
    );
  });

  it('formats Unix timestamps expressed in seconds as ISO dates', () => {
    const createdAtSeconds = Math.floor(
      new Date('2024-03-07T00:00:00.000Z').getTime() / 1000,
    );
    const redeemedAtSeconds = Math.floor(
      new Date('2024-03-07T00:00:02.000Z').getTime() / 1000,
    );

    const csv = buildReferralCodesCsv(
      [
        {
          code: 'SECONDS123',
          scoutWallet: 'GSCOUT',
          createdAt: createdAtSeconds,
          usedBy: 'GUSER',
          usedAt: redeemedAtSeconds,
        },
      ],
      'https://example.com',
    );

    expect(csv).toContain(
      `${new Date(createdAtSeconds * 1000).toISOString()},Redeemed,${new Date(redeemedAtSeconds * 1000).toISOString()}\n`,
    );
  });
});
