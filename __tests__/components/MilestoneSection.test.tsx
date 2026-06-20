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

// Mock the Toast module so rendering MilestoneList (and thus MilestoneSection
// via its inner delegation) doesn't throw "useToast must be used within a
// ToastProvider". Tests on this file don't exercise clipboard behaviour,
// so a no-op show is fine.
jest.mock('@/components/ui/Toast', () => ({
  __esModule: true,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ show: jest.fn() }),
}));

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

describe('MilestoneSection \u2014 wrapper delegation to MilestoneList', () => {
  it('renders the translated section heading for the empty case', () => {
    render(<MilestoneSection milestones={[]} />);
    // Exact-string match: MilestoneList's delegated EmptyState also
    // renders an <h3>, and its title ("No milestones yet") used to
    // substring-match the looser /milestones/i regex. Pinning to the
    // literal "Milestones" makes this assertion target the section
    // heading specifically.
    expect(
      screen.getByRole('heading', { name: 'Milestones', level: 3 }),
    ).toBeInTheDocument();
  });

  it('exposes the section as a navigable region via aria-labelledby + heading id', () => {
    render(<MilestoneSection milestones={[]} />);

    const heading = screen.getByRole('heading', {
      name: 'Milestones',
      level: 3,
    });
    // The heading carries the id that the outer <section> references.
    expect(heading).toHaveAttribute('id', 'milestones-heading');

    // <section> with an aria-label or aria-labelledby is exposed in the
    // accessibility tree as a "region" with the heading text as its
    // accessible name. This is the AT-discovery contract the landmark
    // upgrade delivers.
    const region = screen.getByRole('region', { name: 'Milestones' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveAttribute('aria-labelledby', 'milestones-heading');
  });

  it('shows the EmptyState copy from MilestoneList when milestones is empty', () => {
    render(<MilestoneSection milestones={[]} />);
    expect(screen.getByText(/no milestones yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/verified milestones from approved validators/i),
    ).toBeInTheDocument();
  });

  it('renders the milestone descriptions from MilestoneList when populated', () => {
    const milestones = [
      makeMilestone('m1', 'First verified trial', 1_700_000_000),
      makeMilestone('m2', 'Scored in regional cup', 1_700_100_000),
    ];

    render(<MilestoneSection milestones={milestones} />);

    expect(screen.getByText('First verified trial')).toBeInTheDocument();
    expect(screen.getByText('Scored in regional cup')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('passes the level prop through to MilestoneList\u2019s level badge', () => {
    const milestones = [makeMilestone('m1', 'A milestone', 1_700_000_000)];

    // level=3 ("Elite") produces different badge label than the default
    // level=2 ("Performance"). Both come from MilestoneList, so asserting
    // on the rendered label verifies the level passed through the
    // MilestoneSection wrapper.
    render(<MilestoneSection milestones={milestones} level={3} />);
    expect(screen.getByText('Elite')).toBeInTheDocument();
  });

  it('does not render the EmptyState copy when milestones are populated', () => {
    const milestones = [makeMilestone('m1', 'A milestone', 1_700_000_000)];
    render(<MilestoneSection milestones={milestones} />);
    expect(screen.queryByText(/no milestones yet/i)).not.toBeInTheDocument();
  });

  it('renders milestones whose description contains HTML-unsafe characters safely', () => {
    // Smoke test: descriptions come through MilestoneList \u2192 React\u2019s
    // text encoder. A raw <script> must render as literal text \u2014 not
    // parsed as markup. Guards against future regressions that might
    // switch to dangerouslySetInnerHTML on either component.
    const milestones = [
      makeMilestone('m1', '<script>alert(1)</script>', 1_700_000_000),
    ];
    render(<MilestoneSection milestones={milestones} />);
    expect(
      screen.getByText('<script>alert(1)</script>'),
    ).toBeInTheDocument();
  });
});
