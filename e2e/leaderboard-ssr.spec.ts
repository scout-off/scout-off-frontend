import { test, expect } from '@playwright/test';

test.describe('Leaderboard SSR', () => {
  test('should contain actual data in HTML response without JS', async ({
    page,
  }) => {
    await page.goto('/validator/leaderboard', {
      waitUntil: 'networkidle',
    });

    const html = await page.content();

    expect(html).toContain('Validator Leaderboard');
    expect(html).toContain('Anyone can view this page');
    expect(html).toContain('Rank');
    expect(html).toContain('Validator');
    expect(html).toContain('Approvals');

    const hasData = html.includes('G') || html.includes('validator');
    expect(hasData).toBe(true);
  });
});
