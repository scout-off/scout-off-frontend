import { test, expect } from "@playwright/test";

// The catch-all `app/[locale]/[...rest]/page.tsx` calls `notFound()`, which
// renders the localized `app/[locale]/not-found.tsx` with a real 404 status.
// For each locale we verify the status, <html lang>, the translated heading,
// the translated document title, and that the CTAs keep the current locale.
const cases = [
  {
    locale: "en",
    heading: "Page not found",
    title: "Page Not Found — ScoutOff",
    backToHome: "Back to home",
    browsePlayers: "Browse players",
  },
  {
    locale: "fr",
    heading: "Page introuvable",
    title: "Page introuvable — ScoutOff",
    backToHome: "Retour à l'accueil",
    browsePlayers: "Parcourir les joueurs",
  },
  {
    locale: "sw",
    heading: "Ukurasa haujapatikana",
    title: "Ukurasa Haujapatikana — ScoutOff",
    backToHome: "Rudi kwenye ukurasa wa nyumbani",
    browsePlayers: "Tafuta wachezaji",
  },
];

for (const { locale, heading, title, backToHome, browsePlayers } of cases) {
  test(`${locale}: unknown sub-path returns 404 with a localized not-found`, async ({
    page,
  }) => {
    const response = await page.goto(`/${locale}/does-not-exist`);
    expect(response?.status()).toBe(404);

    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page).toHaveTitle(title);

    // The two CTAs keep the current locale in their href.
    await expect(
      page.getByRole("link", { name: backToHome, exact: true })
    ).toHaveAttribute("href", `/${locale}`);
    await expect(
      page.getByRole("link", { name: browsePlayers, exact: true })
    ).toHaveAttribute("href", `/${locale}/scout`);
  });
}

// A missing player (the contract read returns no player, e.g. the
// `PlayerNotFound` case) must render the same localized not-found via the
// server-side `notFound()` in `app/[locale]/player/[id]/page.tsx`, with a real
// 404 status — not an inline English message or a 200 "Loading…" shell.
for (const { locale, heading, title } of cases) {
  test(`${locale}: missing player returns 404 with a localized not-found`, async ({
    page,
  }) => {
    const response = await page.goto(`/${locale}/player/does-not-exist-player`);
    expect(response?.status()).toBe(404);

    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page).toHaveTitle(title);
  });
}
