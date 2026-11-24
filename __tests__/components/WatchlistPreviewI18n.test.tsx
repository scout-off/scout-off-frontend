import { render, screen } from '../setup-providers-intl';
import WatchlistPreview from '@/components/scout/WatchlistPreview';
import type { WatchlistEntry } from '@/types';

jest.unmock('next-intl');

const entries = [{ id: 'w1', playerId: 'p1' }] as unknown as WatchlistEntry[];

describe('WatchlistPreview i18n', () => {
  it('renders French copy', () => {
    render(<WatchlistPreview entries={entries} onRemove={jest.fn()} />, {
      locale: 'fr',
    });
    expect(screen.getByText('Ma liste de suivi')).toBeInTheDocument();
    expect(screen.getByText('Tout voir')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retirer p1 de la liste de suivi' }),
    ).toBeInTheDocument();
  });
});
