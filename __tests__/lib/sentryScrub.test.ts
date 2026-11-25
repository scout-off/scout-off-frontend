import { scrubBreadcrumb, scrubEvent, scrubString } from '@/lib/sentryScrub';

const G = 'G' + 'A'.repeat(55);
const M = 'M' + 'B'.repeat(68);
const S = 'S' + 'C'.repeat(55);

describe('sentryScrub', () => {
  it('redacts wallet addresses, seeds, emails and phone numbers', () => {
    expect(scrubString(`${G} ${M} ${S} kofi@example.com +233201234567`)).toBe(
      '[wallet_address] [wallet_address] [secret_seed] [email] [phone]',
    );
  });

  it('scrubs transactions including URLs with wallet query params', () => {
    const transaction = {
      type: 'transaction',
      transaction: `/api/watchlist?wallet=${G}`,
      request: {
        url: `https://scoutoff.app/api/watchlist?wallet=${G}&phone=%2B233201234567`,
        cookies: { session: 'abc' },
        headers: { Cookie: 'session=abc', 'user-agent': 'jest' },
      },
      spans: [
        { description: `GET /api/players/${G}`, data: { email: 'a@b.co' } },
      ],
    };

    const out = scrubEvent(transaction)!;
    const json = JSON.stringify(out);
    expect(json).not.toContain(G);
    expect(json).not.toContain('a@b.co');
    expect(json).not.toContain('233201234567');
    expect(out.transaction).toBe('/api/watchlist?wallet=[wallet_address]');
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request.headers).toEqual({ 'user-agent': 'jest' });
    // Original event is not mutated.
    expect(transaction.request.cookies).toEqual({ session: 'abc' });
  });

  it('scrubs error events with breadcrumbs', () => {
    const event = {
      exception: { values: [{ value: `Wallet ${G} not found` }] },
      breadcrumbs: [
        { category: 'console', message: `contact kofi@example.com` },
      ],
    };
    const out = scrubEvent(event)!;
    expect(out.exception.values[0].value).toBe(
      'Wallet [wallet_address] not found',
    );
    expect(out.breadcrumbs[0].message).toBe('contact [email]');
  });

  it('scrubs fetch breadcrumbs', () => {
    const crumb = {
      category: 'fetch',
      data: { url: `/api/contact?wallet=${G}`, method: 'GET' },
    };
    expect(scrubBreadcrumb(crumb)!.data.url).toBe(
      '/api/contact?wallet=[wallet_address]',
    );
  });

  it('handles circular references without throwing', () => {
    const event: Record<string, unknown> = { message: G };
    event.self = event;
    expect(scrubEvent(event)).toEqual({
      message: '[wallet_address]',
      self: '[circular]',
    });
  });
});
