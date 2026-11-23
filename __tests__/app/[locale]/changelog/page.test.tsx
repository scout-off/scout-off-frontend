import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import ChangelogPage from '@/app/[locale]/changelog/page';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    readFileSync: jest.fn(actualFs.readFileSync),
  };
});

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(
    async ({ namespace }: { namespace?: string } = {}) => {
      return (key: string) => {
        if (namespace === 'changelog') {
          const translations: Record<string, string> = {
            page_title: 'Changelog',
            page_description: 'Recent platform updates and improvements.',
            eyebrow: 'Platform updates',
            english_notice:
              'This changelog is currently available in English only.',
            added: 'Added',
            improved: 'Improved',
            fixed: 'Fixed',
            back_to_home: 'Back to home',
            empty_title: 'Changelog unavailable',
            empty_description:
              "We couldn't load the changelog right now. Please check back later.",
          };
          return translations[key] ?? key;
        }
        return key;
      };
    },
  ),
}));

describe('ChangelogPage', () => {
  it('renders the localized heading, notice, back link, and repository-backed entries in descending order', async () => {
    const Page = await ChangelogPage({ params: { locale: 'en' } });
    render(Page);

    expect(
      screen.getByRole('heading', { level: 1, name: /Changelog/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/English only/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute(
      'href',
      '/en',
    );

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings[0]).toHaveTextContent(
      'Scout ContactModal — unlocked contact details display',
    );
    expect(headings[1]).toHaveTextContent('Pull-to-refresh gesture support');
    expect(headings[2]).toHaveTextContent('Scout referral/invite system');

    expect(screen.getByText('2026-07-28')).toBeInTheDocument();
    expect(screen.getAllByText('2026-07-17').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2026-06-30')).toBeInTheDocument();
  });

  it('renders an EmptyState fallback when the changelog file fails to load', async () => {
    (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const Page = await ChangelogPage({ params: { locale: 'en' } });
    render(Page);

    expect(screen.getByText('Changelog unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't load the changelog right now. Please check back later.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('renders an EmptyState fallback when the changelog file has no parseable entries', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(
      'this is not a valid changelog format',
    );

    const Page = await ChangelogPage({ params: { locale: 'en' } });
    render(Page);

    expect(screen.getByText('Changelog unavailable')).toBeInTheDocument();
  });
});
