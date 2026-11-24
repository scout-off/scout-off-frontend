import { render, screen } from '../../setup-providers-intl';
import DataFreshnessBadge from '@/components/ui/DataFreshnessBadge';
import { useIndexerFreshness } from '@/hooks/useIndexerFreshness';

jest.unmock('next-intl');
jest.mock('@/hooks/useIndexerFreshness', () => ({
  useIndexerFreshness: jest.fn(),
}));
const mockHook = useIndexerFreshness as jest.Mock;

describe('DataFreshnessBadge (localized)', () => {
  test('renders title, stale text and pending hint in French', () => {
    mockHook.mockReturnValue({
      error: undefined,
      isLoading: false,
      data: { lastLedger: 10, lastUpdated: Date.now(), ledgerLag: 0 },
      stale: true,
      pendingWrite: true,
    });
    render(<DataFreshnessBadge />, { locale: 'fr' });
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute(
      'title',
      'Fraîcheur des données de l’indexeur',
    );
    expect(badge).toHaveTextContent('les données peuvent être obsolètes');
    expect(
      screen.getByText(
        'Votre modification peut prendre jusqu’à une minute pour apparaître',
      ),
    ).toBeInTheDocument();
  });
});
