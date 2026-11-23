import { test, expect } from '@playwright/test';

/**
 * Baseline smoke test for the Playwright harness (#525): the app boots, the
 * root redirects to a locale, and the main navigation renders. Feature flows
 * live in their own specs; this one only proves the stack is up.
 */
test.describe('smoke', () => {
  test('the home page loads and renders the main navigation', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);

    await expect(page).toHaveURL(/\/(en|fr|sw)(\/|$)/);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeVisible();
  });
});
