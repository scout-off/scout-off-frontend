import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerFilterForm from '@/components/scout/PlayerFilterForm';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/lib/positions';

// ── Next.js navigation mocks ──────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockSearchParamsGet = jest.fn().mockReturnValue(null);
const mockSearchParamsToString = jest.fn().mockReturnValue('');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
    toString: mockSearchParamsToString,
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderForm(onSearch = jest.fn()) {
  return { onSearch, ...render(<PlayerFilterForm onSearch={onSearch} />) };
}

function getRegionSelect() {
  return screen.getByLabelText(/^region$/i);
}
function getPositionSelect() {
  return screen.getByLabelText(/^position$/i);
}
function getLevelSelect() {
  return screen.getByLabelText(/^min level$/i);
}
function getResetButton() {
  return screen.getByRole('button', { name: /reset filters/i });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlayerFilterForm', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── Option rendering ───────────────────────────────────────────────────────

  it('renders the region select with all AFRICAN_REGIONS options', () => {
    renderForm();
    const region = getRegionSelect();
    AFRICAN_REGIONS.forEach(({ label }) => {
      expect(region).toContainElement(
        screen.getByRole('option', { name: label }),
      );
    });
  });

  it('renders the position select with all FOOTBALL_POSITIONS options', () => {
    renderForm();
    const position = getPositionSelect();
    FOOTBALL_POSITIONS.forEach(({ label }) => {
      expect(position).toContainElement(
        screen.getByRole('option', { name: label }),
      );
    });
  });

  it('renders the level select with All, Verified, Performance, and Elite options', () => {
    renderForm();
    const level = getLevelSelect();
    ['All', 'Verified', 'Performance', 'Elite'].forEach((label) => {
      expect(level).toContainElement(
        screen.getByRole('option', { name: label }),
      );
    });
  });

  it('renders all three selects and the Reset Filters button', () => {
    renderForm();
    expect(getRegionSelect()).toBeInTheDocument();
    expect(getPositionSelect()).toBeInTheDocument();
    expect(getLevelSelect()).toBeInTheDocument();
    expect(getResetButton()).toBeInTheDocument();
  });

  // ── Default values ─────────────────────────────────────────────────────────

  it('starts with empty region and position and level 0 by default', () => {
    renderForm();
    expect(getRegionSelect()).toHaveValue('');
    expect(getPositionSelect()).toHaveValue('');
    expect(getLevelSelect()).toHaveValue('0');
  });

  // ── Initial search on mount ────────────────────────────────────────────────

  it('fires an initial onSearch call on mount with empty defaults', () => {
    const onSearch = jest.fn();
    render(<PlayerFilterForm onSearch={onSearch} />);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith({
      region: undefined,
      position: undefined,
      minLevel: 0,
    });
  });

  // ── Debounced contract calls ───────────────────────────────────────────────

  it('does not call onSearch before 300 ms when region changes', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear(); // ignore mount call

    fireEvent.change(getRegionSelect(), {
      target: { value: 'nigeria' },
    });

    act(() => jest.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('calls onSearch with correct filter after 300 ms when region changes', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getRegionSelect(), {
      target: { value: 'nigeria' },
    });

    act(() => jest.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith({
      region: 'nigeria',
      position: undefined,
      minLevel: 0,
    });
  });

  it('calls onSearch with correct filter after 300 ms when position changes', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getPositionSelect(), { target: { value: 'ST' } });

    act(() => jest.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledWith({
      region: undefined,
      position: 'ST',
      minLevel: 0,
    });
  });

  it('calls onSearch with correct minLevel after 300 ms when level changes', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getLevelSelect(), { target: { value: '2' } });

    act(() => jest.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledWith({
      region: undefined,
      position: undefined,
      minLevel: 2,
    });
  });

  it('resets the debounce timer on rapid successive changes (only last value wins)', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getRegionSelect(), { target: { value: 'ghana' } });
    act(() => jest.advanceTimersByTime(100));

    fireEvent.change(getRegionSelect(), { target: { value: 'kenya' } });
    act(() => jest.advanceTimersByTime(100));

    fireEvent.change(getRegionSelect(), { target: { value: 'nigeria' } });
    act(() => jest.advanceTimersByTime(100));

    // 300 ms hasn't elapsed since the last change — should not have called yet
    expect(onSearch).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'nigeria' }),
    );
  });

  it('includes all three filter values in a single onSearch call', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getRegionSelect(), { target: { value: 'ghana' } });
    act(() => jest.advanceTimersByTime(300));
    onSearch.mockClear();

    fireEvent.change(getPositionSelect(), { target: { value: 'GK' } });
    act(() => jest.advanceTimersByTime(300));
    onSearch.mockClear();

    fireEvent.change(getLevelSelect(), { target: { value: '3' } });
    act(() => jest.advanceTimersByTime(300));

    expect(onSearch).toHaveBeenCalledWith({
      region: 'ghana',
      position: 'GK',
      minLevel: 3,
    });
  });

  // ── Reset functionality ────────────────────────────────────────────────────

  it('resets all selects to defaults when Reset Filters is clicked', () => {
    renderForm();
    fireEvent.change(getRegionSelect(), { target: { value: 'ghana' } });
    fireEvent.change(getPositionSelect(), { target: { value: 'CM' } });
    fireEvent.change(getLevelSelect(), { target: { value: '1' } });

    fireEvent.click(getResetButton());

    expect(getRegionSelect()).toHaveValue('');
    expect(getPositionSelect()).toHaveValue('');
    expect(getLevelSelect()).toHaveValue('0');
  });

  it('calls onSearch immediately with empty defaults on reset (no debounce)', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getRegionSelect(), { target: { value: 'ghana' } });
    fireEvent.click(getResetButton());

    // No timer advance needed — reset is immediate
    expect(onSearch).toHaveBeenCalledWith({
      region: undefined,
      position: undefined,
      minLevel: 0,
    });
  });

  it('cancels any pending debounce when Reset Filters is clicked', () => {
    const { onSearch } = renderForm();
    onSearch.mockClear();

    fireEvent.change(getRegionSelect(), { target: { value: 'ghana' } });
    // Reset before the 300 ms debounce fires
    fireEvent.click(getResetButton());

    act(() => jest.advanceTimersByTime(300));

    // Only the reset call should have fired, not the debounced filter call
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith({
      region: undefined,
      position: undefined,
      minLevel: 0,
    });
  });

  // ── URL synchronisation ────────────────────────────────────────────────────

  it('updates the URL when region changes', () => {
    renderForm();
    fireEvent.change(getRegionSelect(), { target: { value: 'nigeria' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('region=nigeria'),
      expect.anything(),
    );
  });

  it('updates the URL when position changes', () => {
    renderForm();
    fireEvent.change(getPositionSelect(), { target: { value: 'ST' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('position=ST'),
      expect.anything(),
    );
  });

  it('updates the URL when level changes', () => {
    renderForm();
    fireEvent.change(getLevelSelect(), { target: { value: '2' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('level=2'),
      expect.anything(),
    );
  });

  it('omits level from the URL when it is 0 (default)', () => {
    renderForm();
    // Level starts at 0 — set to something, then reset to verify omission
    fireEvent.change(getLevelSelect(), { target: { value: '2' } });
    fireEvent.change(getLevelSelect(), { target: { value: '0' } });
    // The last call should have no level param
    const lastCall =
      mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
    expect(lastCall).not.toContain('level=');
  });

  it('clears all filter params from the URL on reset', () => {
    renderForm();
    fireEvent.change(getRegionSelect(), { target: { value: 'ghana' } });
    mockReplace.mockClear();

    fireEvent.click(getResetButton());

    expect(mockReplace).toHaveBeenCalledWith('?', expect.anything());
  });

  // ── URL initialisation ────────────────────────────────────────────────────

  it('initialises selects from URL query parameters on mount', () => {
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'region') return 'nigeria';
      if (key === 'position') return 'ST';
      if (key === 'level') return '2';
      return null;
    });

    render(<PlayerFilterForm onSearch={jest.fn()} />);

    expect(getRegionSelect()).toHaveValue('nigeria');
    expect(getPositionSelect()).toHaveValue('ST');
    expect(getLevelSelect()).toHaveValue('2');
  });

  it('fires onSearch with URL param values on mount when params are present', () => {
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'region') return 'ghana';
      if (key === 'position') return 'GK';
      if (key === 'level') return '1';
      return null;
    });

    const onSearch = jest.fn();
    render(<PlayerFilterForm onSearch={onSearch} />);

    expect(onSearch).toHaveBeenCalledWith({
      region: 'ghana',
      position: 'GK',
      minLevel: 1,
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('has an accessible search landmark with a label', () => {
    renderForm();
    expect(
      screen.getByRole('search', { name: /filter players/i }),
    ).toBeInTheDocument();
  });

  it('associates each select with its visible label via htmlFor', () => {
    renderForm();
    expect(getRegionSelect()).toHaveAttribute('id', 'filter-region');
    expect(getPositionSelect()).toHaveAttribute('id', 'filter-position');
    expect(getLevelSelect()).toHaveAttribute('id', 'filter-level');
  });

  // ── resetKey prop ─────────────────────────────────────────────────────────

  it('does not fire an extra onSearch on initial render when resetKey is 0', () => {
    const onSearch = jest.fn();
    render(<PlayerFilterForm onSearch={onSearch} resetKey={0} />);
    // Only the single mount-time call should have fired
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('does not fire an extra onSearch on initial render when resetKey is omitted', () => {
    const onSearch = jest.fn();
    render(<PlayerFilterForm onSearch={onSearch} />);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('resets all selects to defaults and calls onSearch when resetKey increments', () => {
    const onSearch = jest.fn();
    const { rerender } = render(
      <PlayerFilterForm onSearch={onSearch} resetKey={0} />,
    );
    onSearch.mockClear();

    // Put the form into a non-default state
    fireEvent.change(getRegionSelect(), { target: { value: 'nigeria' } });
    fireEvent.change(getPositionSelect(), { target: { value: 'ST' } });
    fireEvent.change(getLevelSelect(), { target: { value: '2' } });
    act(() => jest.advanceTimersByTime(300));
    onSearch.mockClear();

    // Increment resetKey as the parent would do when "Clear Filters" is clicked
    act(() => {
      rerender(<PlayerFilterForm onSearch={onSearch} resetKey={1} />);
    });

    expect(getRegionSelect()).toHaveValue('');
    expect(getPositionSelect()).toHaveValue('');
    expect(getLevelSelect()).toHaveValue('0');
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith({
      region: undefined,
      position: undefined,
      minLevel: 0,
    });
  });

  it('does not call onSearch again when rerendered with the same resetKey', () => {
    const onSearch = jest.fn();
    const { rerender } = render(
      <PlayerFilterForm onSearch={onSearch} resetKey={1} />,
    );
    onSearch.mockClear();

    rerender(<PlayerFilterForm onSearch={onSearch} resetKey={1} />);

    expect(onSearch).not.toHaveBeenCalled();
  });

  it('fires onSearch each time resetKey increments (supports multiple clears)', () => {
    const onSearch = jest.fn();
    const { rerender } = render(
      <PlayerFilterForm onSearch={onSearch} resetKey={0} />,
    );
    onSearch.mockClear();

    act(() => {
      rerender(<PlayerFilterForm onSearch={onSearch} resetKey={1} />);
    });
    act(() => {
      rerender(<PlayerFilterForm onSearch={onSearch} resetKey={2} />);
    });

    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenNthCalledWith(1, {
      region: undefined,
      position: undefined,
      minLevel: 0,
    });
    expect(onSearch).toHaveBeenNthCalledWith(2, {
      region: undefined,
      position: undefined,
      minLevel: 0,
    });
  });
});
