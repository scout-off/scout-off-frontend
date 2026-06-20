import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MilestoneSection from '@/components/player/MilestoneSection';
import type { Milestone } from '@/types';

// Mock next-intl so the component can resolve translations without loading
// its ESM runtime. We resolve against the real messages/en.json so DOM
// queries match rendered English strings rather than i18n key paths,
// matching the pattern used in __tests__/components/PlayerProfileForm.test.tsx.
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

function makeMilestone(
  id: string,
  description: string,
  timestamp: number,
): Milestone {
  return {
    id,
    description,
    evidenceHash: 'Qmtest',
    validator: 'GABC123VALIDATOR',
    timestamp,
  };
}

// Lock the date format so the date assertion isn't brittle to the runtime
// locale (some node test environments emit "11/14/23" with a 2-digit year,
// which would defeat the more naive /2023/ regex). Restoring in afterEach
// keeps the spy from leaking into other test files.
let toLocaleDateStringSpy: jest.SpyInstance;

beforeEach(() => {
  toLocaleDateStringSpy = jest
    .spyOn(Date.prototype, 'toLocaleDateString')
    .mockReturnValue('2024-01-15');
});

afterEach(() => {
  toLocaleDateStringSpy.mockRestore();
});

describe('MilestoneSection', () => {
  it('renders the translated section heading for the empty case', () => {
    render(<MilestoneSection milestones={[]} />);
    expect(
      screen.getByRole('heading', { name: /milestones/i, level: 3 }),
    ).toBeInTheDocument();
  });

  it('shows the translated empty-state copy when milestones is empty', () => {
    render(<MilestoneSection milestones={[]} />);
    expect(screen.getByText(/no milestones yet/i)).toBeInTheDocument();
  });

  it('renders a list item with description and human-readable date for each milestone', () => {
    const milestones = [
      makeMilestone('m1', 'First verified trial', 1_700_000_000),
      makeMilestone('m2', 'Scored in regional cup', 1_700_100_000),
    ];

    render(<MilestoneSection milestones={milestones} />);

    expect(screen.getByText('First verified trial')).toBeInTheDocument();
    expect(screen.getByText('Scored in regional cup')).toBeInTheDocument();

    // Each description is wrapped in a <li> — assert the list membership.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    // Both timestamps are mocked to "2024-01-15" via the beforeEach spy,
    // so we can assert deterministically against that exact string. The
    // mock guards against locale-dependent short-year formatting that
    // would defeat a "2023" regex.
    expect(screen.getAllByText('2024-01-15')).toHaveLength(2);
  });

  it('does not render the empty-state copy when milestones are populated', () => {
    const milestones = [makeMilestone('m1', 'A milestone', 1_700_000_000)];

    render(<MilestoneSection milestones={milestones} />);

    expect(screen.queryByText(/no milestones yet/i)).not.toBeInTheDocument();
  });

  it('renders milestones whose description contains HTML-unsafe characters safely', () => {
    // Smoke test: descriptions go through React's text encoder, so a raw
    // <script> in props must end up as literal text \u2014 not be parsed as
    // markup. This guards against future regressions that might switch to
    // dangerouslySetInnerHTML. The single getByText assertion is the
    // load-bearing one: if React had parsed the description as markup,
    // getByText would not find the literal "<script>alert(1)</script>".
    const milestones = [
      makeMilestone('m1', '<script>alert(1)</script>', 1_700_000_000),
    ];
    render(<MilestoneSection milestones={milestones} />);
    expect(
      screen.getByText('<script>alert(1)</script>'),
    ).toBeInTheDocument();
  });
});
