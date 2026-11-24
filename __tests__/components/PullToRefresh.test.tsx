import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PullToRefresh from '@/components/ui/PullToRefresh';

// Movement is damped by 0.4 and the threshold is 70px.
const PAST_THRESHOLD = 200; // 80px damped
const BELOW_THRESHOLD = 100; // 40px damped

function renderPull(props: { isLoading?: boolean; onRefresh?: jest.Mock }) {
  const onRefresh = props.onRefresh ?? jest.fn();
  const utils = render(
    <PullToRefresh onRefresh={onRefresh} isLoading={props.isLoading ?? false}>
      <p>Content</p>
    </PullToRefresh>,
  );
  const container = utils.container.firstChild as HTMLElement;
  return { ...utils, container, onRefresh };
}

function pull(el: HTMLElement, distance: number) {
  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: distance }] });
  fireEvent.touchEnd(el);
}

const spinner = (root: HTMLElement) => root.querySelector('.animate-spin');

describe('PullToRefresh', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    document.documentElement.scrollTop = 0;
  });

  it('renders children', () => {
    renderPull({});
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('calls onRefresh when pulled past the threshold', () => {
    const { container, onRefresh } = renderPull({});
    pull(container, PAST_THRESHOLD);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not call onRefresh when pulled less than the threshold', () => {
    const { container, onRefresh } = renderPull({});
    pull(container, BELOW_THRESHOLD);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(spinner(container)).not.toBeInTheDocument();
  });

  it('does not trigger while already refreshing', () => {
    const { container, onRefresh } = renderPull({ isLoading: true });
    pull(container, PAST_THRESHOLD);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('shows the refresh indicator while refreshing', async () => {
    let finish!: () => void;
    const onRefresh = jest.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const { container } = renderPull({ onRefresh });

    pull(container, PAST_THRESHOLD);
    expect(spinner(container)).toBeInTheDocument();

    await act(async () => finish());
    expect(spinner(container)).not.toBeInTheDocument();
  });

  it('shows the indicator when isLoading is true', () => {
    const { container } = renderPull({ isLoading: true });
    expect(spinner(container)).toBeInTheDocument();
  });

  it('does nothing when the page is not scrolled to the top', () => {
    Object.defineProperty(window, 'scrollY', { value: 300, writable: true });
    document.documentElement.scrollTop = 300;
    const { container, onRefresh } = renderPull({});
    pull(container, PAST_THRESHOLD);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
