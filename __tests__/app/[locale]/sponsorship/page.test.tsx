import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SponsorshipPage from '@/app/[locale]/sponsorship/page';

describe('SponsorshipPage', () => {
  it('renders the translated sponsorship copy', () => {
    render(<SponsorshipPage />);

    // The global next-intl mock falls back to returning the translation key
    // itself for keys not explicitly stubbed, so we assert those keys render.
    expect(screen.getByText('badge')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'howItWorksTitle' }),
    ).toBeInTheDocument();
    expect(screen.getByText('howItWorksDescription')).toBeInTheDocument();
    expect(screen.getByText('notice')).toBeInTheDocument();
  });
});
