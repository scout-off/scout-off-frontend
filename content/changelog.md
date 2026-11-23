<!-- Maintainers: add new release entries above older ones using the supported format: ## Release title - YYYY-MM-DD followed by ### Added / ### Improved / ### Fixed sections. -->

# Changelog

Notable updates and improvements to the platform.

## Scout ContactModal — unlocked contact details display - 2026-07-28

### Added

- After paying the XLM contact fee, scouts can view unlocked email, phone, and Telegram contact details for a player directly in the ContactModal component (`components/scout/ContactModal.tsx`, powered by the `usePayToContact` hook).

## Scout referral/invite system - 2026-07-17

### Added

- Players can now invite friends to the scout dashboard through a referral system. Generate personalized invite links, track referral counts, and redeem rewards when friends join.

## Pull-to-refresh gesture support - 2026-07-17

### Added

- Mobile dashboard views now support pull-to-refresh gestures for quick content updates.

## Accessibility and discovery updates - 2026-06-30

### Added

- Player cards now show a clear level badge so scouting decisions are easier to scan quickly.

### Improved

- Scout region filters are grouped by sub-region for clearer discovery and less clutter.

### Fixed

- Wallet selection and milestone timeline interactions now use stronger accessibility support, including focus handling and clearer ARIA labeling.

## Player onboarding and search improvements - 2026-06-29

### Added

- Scout dashboard search now includes player-name lookup for faster discovery.

### Improved

- Player profile forms now validate fields inline, and registration flows feel more responsive with optimistic updates.

### Fixed

- Video upload and profile update flows now validate files client-side before submission.

## Scout dashboard and public profile improvements - 2026-06-28

### Added

- The scout dashboard now supports endless scrolling with a pagination fallback, and the player public profile includes an IPFS media gallery.

### Improved

- The player public profile now includes a back action, and the pay-to-contact experience has a dedicated contact modal.
