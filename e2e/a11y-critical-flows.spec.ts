import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Returns only axe violations serious enough to fail the "critical flows"
// accessibility gate (we intentionally allow minor/cosmetic findings).
function seriousViolations(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact ?? "")
  );
}

test("home page has no serious/critical axe violations (en)", async ({ page }) => {
  await page.goto("/en");
  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolations(results)).toEqual([]);
});

test("localized not-found is axe-clean (fr)", async ({ page }) => {
  await page.goto("/fr/does-not-exist");
  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolations(results)).toEqual([]);
});

test("localized not-found is axe-clean (sw)", async ({ page }) => {
  await page.goto("/sw/does-not-exist");
  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolations(results)).toEqual([]);
});
