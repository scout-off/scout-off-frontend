import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MilestoneList from '@/components/player/MilestoneList';
import type { Milestone } from '@/types';

// Mock next-intl so the component can resolve translations without loading
// its ESM runtime. Resolved against messages/en.json so DOM queries match
// rendered English strings rather than i18n key paths.
jest.mock('next-intl', () => {
  const en = require('@/messages/en.json');
  function lookup(obj: any, parts: string[]): string {
    let cur = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return parts.join('.');
    }
    return typeof cur === 'string' ? cur : parts.join('.');
  }
  return {
    __esModule: true,
    useTranslations:
      (namespace = '') =>
      (key: string): string => {
        const parts = namespace
          ? [...namespace.split('.'), ...key.split('.')]
          : key.split('.');
        return lookup(en, parts);
      },
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

// Mock useToast so the clipboard click path can be observed. We also expose
// `ToastProvider` as a passthrough so any component in the render tree that
// reaches into the Toast module (e.g. deeper tooling in Badge / Tooltip)
// doesn't trip the "useToast must be used within a ToastProvider" check.
const showMock = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  __esModule: true,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ show: showMock }),
}));

// Mock navigator.clipboard so the click handler can be driven.
const writeTextMock = jest.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: writeTextMock },
});

function makeMilestone(
  id: string,
  description: string,
  timestamp: number,
  validator = 'GABC123XYZVALIDATOR',
): Milestone {
  return {
    id,
    description,
    evidenceHash: 'Qmtest',
    validator,
    timestamp,
  };
}

beforeEach(() => {
  showMock.mockClear();
  writeTextMock.mockClear();
});

describe('MilestoneList — rich rendering', () => {
  it('renders EmptyState with localized title + description when milestones is empty', () => {
    render(<MilestoneList milestones={[]} />);
    expect(screen.getByText(/no milestones yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/verified milestones from approved validators/i),
    ).toBeInTheDocument();
  });

  it('renders the description for each milestone when populated', () => {
    const milestones = [
      makeMilestone('m1', 'First verified trial', 1_700_000_000),
      makeMilestone('m2', 'Scored in regional cup', 1_700_100_000),
    ];
    render(<MilestoneList milestones={milestones} />);
    expect(screen.getByText('First verified trial')).toBeInTheDocument();
    expect(screen.getByText('Scored in regional cup')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('sorts milestones by timestamp descending (most-recent first)', () => {
    const milestones = [
      makeMilestone('older', 'Older milestone', 1_700_000_000),
      makeMilestone('newer', 'Newer milestone', 1_700_100_000),
    ];
    render(<MilestoneList milestones={milestones} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Newer milestone');
    expect(items[1]).toHaveTextContent('Older milestone');
  });

  it('renders the default level-2 (“Performance”) badge when no level is passed', () => {
    render(
      <MilestoneList
        milestones={[makeMilestone('m1', 'A milestone', 1_700_000_000)]}
      />,
    );
    expect(screen.getByText('Performance')).toBeInTheDocument();
  });

  it.each([0, 1, 2, 3] as const)(
    'renders the level %i badge label from the translated milestones_level_%i key',
    (level) => {
      const expectedLabels = ['Unverified', 'Verified', 'Performance', 'Elite'];
      render(
        <MilestoneList
          milestones={[makeMilestone('m1', 'A milestone', 1_700_000_000)]}
          level={level}
        />,
      );
      expect(screen.getByText(expectedLabels[level])).toBeInTheDocument();
    },
  );

  it('renders the validator address truncated to first-8…last-4 with copy button', () => {
    render(
      <MilestoneList
        milestones={[
          makeMilestone(
            'm1',
            'A milestone',
            1_700_000_000,
            'GABCDEFGHIJKLMNOP1234',
          ),
        ]}
      />,
    );
    expect(screen.getByText('GABCDEFG…1234')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy validator address/i }),
    ).toBeInTheDocument();
  });

  it('writes the full validator address to navigator.clipboard on copy click', async () => {
    render(
      <MilestoneList
        milestones={[
          makeMilestone(
            'm1',
            'A milestone',
            1_700_000_000,
            'GABCDEFGHIJKLMNOP1234',
          ),
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /copy validator address/i }),
    );

    // The clipboard promise resolves on a microtask after fireEvent.click
    // returns; wait for the success toast (showMock called) so the assertion
    // doesn't race the async path. We can't `findByText(/Copied/)` because
    // our Toast mock doesn't render the toast UI into the DOM — we only
    // observe the show() side-effect.
    await waitFor(() =>
      expect(showMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Copied', variant: 'success' }),
      ),
    );
    expect(writeTextMock).toHaveBeenCalledWith('GABCDEFGHIJKLMNOP1234');
  });

  it('shows a failure toast when navigator.clipboard.writeText rejects', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('not allowed'));
    render(
      <MilestoneList
        milestones={[makeMilestone('m1', 'A milestone', 1_700_000_000)]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /copy validator address/i }),
    );

    await waitFor(() =>
      expect(showMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Copy failed', variant: 'error' }),
      ),
    );
  });

  it('renders descriptions with HTML-unsafe characters as literal text (not parsed markup)', () => {
    render(
      <MilestoneList
        milestones={[
          makeMilestone(
            'm1',
            '<script>alert(1)</script>',
            1_700_000_000,
          ),
        ]}
      />,
    );
    expect(
      screen.getByText('<script>alert(1)</script>'),
    ).toBeInTheDocument();
  });
});
