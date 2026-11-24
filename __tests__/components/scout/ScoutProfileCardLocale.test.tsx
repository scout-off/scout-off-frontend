import { render, screen } from '@testing-library/react';
import type { Scout } from '@/types';
import ScoutProfileCard from '@/components/scout/ScoutProfileCard';

jest.mock('next-intl', () => ({
  ...jest.requireActual('next-intl'),
  useTranslations: () => (key: string) => key,
  useLocale: () => 'fr',
}));
jest.mock('@/lib/api', () => ({
  fetchScoutStats: jest.fn(() => new Promise(() => {})),
}));

describe('ScoutProfileCard locale formatting', () => {
  it('formats the subscription expiry with the app locale', () => {
    const scout = {
      id: 'scout-1',
      subscriptionTier: 'pro',
      // Midday UTC so the calendar day is the same in any test timezone.
      subscriptionExpiry: Date.UTC(2099, 9, 16, 12) / 1000,
    } as unknown as Scout;

    render(<ScoutProfileCard scout={scout} />);

    expect(screen.getByText('16 oct. 2099')).toBeInTheDocument();
  });
});
