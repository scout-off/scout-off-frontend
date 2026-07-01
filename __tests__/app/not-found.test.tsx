import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotFound, { metadata } from '@/app/not-found';

jest.mock('@/components/Navbar', () => ({
  __esModule: true,
  default: () => <nav data-testid="navbar">Navbar</nav>,
}));

describe('NotFound', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Rendering a top-level <html>/<body> tree via RTL's render() (which
    // mounts into a <div>) triggers a benign DOM-nesting warning; silence it.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders the 404 message, navbar, and a link back home', () => {
    render(<NotFound />);

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The page you are looking for does not exist or has been moved.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('exposes the expected page title metadata', () => {
    expect(metadata.title).toBe('Page Not Found – ScoutOff');
  });
});
