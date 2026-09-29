import { render, screen, fireEvent, act } from '@testing-library/react';
import ScrollToTop from '@/components/ui/ScrollToTop';

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
}

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', {
      value: y,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(window);
  });
}

describe('ScrollToTop', () => {
  beforeEach(() => {
    mockReducedMotion(false);
    window.scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it('is hidden at the top of the page', () => {
    render(<ScrollToTop />);
    expect(
      screen.queryByRole('button', { name: /scroll to top/i }),
    ).not.toBeInTheDocument();
  });

  it('becomes visible after scrolling past the threshold and hides again', () => {
    render(<ScrollToTop />);
    scrollTo(301);
    expect(
      screen.getByRole('button', { name: 'Scroll to top' }),
    ).toBeInTheDocument();
    scrollTo(100);
    expect(
      screen.queryByRole('button', { name: /scroll to top/i }),
    ).not.toBeInTheDocument();
  });

  it('scrolls smoothly to the top on click', () => {
    render(<ScrollToTop />);
    scrollTo(500);
    fireEvent.click(screen.getByRole('button', { name: /scroll to top/i }));
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });

  it('scrolls instantly under reduced motion', () => {
    mockReducedMotion(true);
    render(<ScrollToTop />);
    scrollTo(500);
    fireEvent.click(screen.getByRole('button', { name: /scroll to top/i }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
