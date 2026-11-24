import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LegalPageLayout from '@/components/ui/LegalPageLayout';

function renderLayout(lastUpdated?: string) {
  return render(
    <LegalPageLayout
      locale="en"
      backToHomeLabel="Back to home"
      eyebrow="Legal"
      title="Terms of Service"
      description="Please read these terms."
      lastUpdated={lastUpdated}
    >
      <h2 id="acceptance">Acceptance</h2>
      <p>Body content</p>
      <a href="#acceptance">Jump to acceptance</a>
    </LegalPageLayout>,
  );
}

describe('LegalPageLayout', () => {
  it('renders the title and last-updated date', () => {
    renderLayout('Last updated: January 1, 2026');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Last updated: January 1, 2026'),
    ).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Please read these terms.')).toBeInTheDocument();
  });

  it('omits the last-updated line when not provided', () => {
    renderLayout();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it('renders children', () => {
    renderLayout();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('keeps in-page anchors pointing at section ids', () => {
    const { container } = renderLayout();
    const anchor = screen.getByRole('link', { name: 'Jump to acceptance' });
    const id = anchor.getAttribute('href')!.slice(1);
    expect(container.querySelector(`#${id}`)).toHaveTextContent('Acceptance');
  });

  it('starts the heading hierarchy at h1', () => {
    renderLayout();
    const headings = screen.getAllByRole('heading');
    expect(headings[0].tagName).toBe('H1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('links back to the localized home page', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/en',
    );
  });
});
