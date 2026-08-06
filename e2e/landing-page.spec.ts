import { test, expect } from '@playwright/test';

test.describe('landing page smoke', () => {
  test('shows the hero heading and dashboard nav links', async ({ page }) => {
    await page.goto('/en');

    await expect(
      page.getByRole('heading', {
        name: /Discover Football Talent\s+On-Chain/i,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole('link', { name: /Player Dashboard/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Scout Dashboard/i }),
    ).toBeVisible();
  });

  test('Scout Dashboard link navigates to the scout route', async ({
    page,
  }) => {
    await page.goto('/en');

    await page
      .getByRole('link', { name: /Scout Dashboard/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/scout/);
  });
});
