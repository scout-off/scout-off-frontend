import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LocaleLayout, { generateStaticParams } from '@/app/[locale]/layout';

const setRequestLocale = jest.fn();

jest.mock('next-intl/server', () => ({
  setRequestLocale: (...args: unknown[]) => setRequestLocale(...args),
}));

describe('LocaleLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders its children unchanged', () => {
    render(
      <LocaleLayout params={{ locale: 'fr' }}>
        <p>Locale-scoped content</p>
      </LocaleLayout>,
    );

    expect(screen.getByText('Locale-scoped content')).toBeInTheDocument();
  });

  it('sets the request locale from params', () => {
    render(
      <LocaleLayout params={{ locale: 'sw' }}>
        <p>content</p>
      </LocaleLayout>,
    );

    expect(setRequestLocale).toHaveBeenCalledWith('sw');
  });

  it('generates static params for every supported locale', () => {
    expect(generateStaticParams()).toEqual([
      { locale: 'en' },
      { locale: 'fr' },
      { locale: 'sw' },
    ]);
  });
});
