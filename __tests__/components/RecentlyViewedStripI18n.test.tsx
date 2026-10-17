import { render, screen } from '../setup-providers-intl';
import RecentlyViewedStrip from '@/components/scout/RecentlyViewedStrip';
import type { RecentlyViewedEntry } from '@/types';

jest.unmock('next-intl');

const entries = [
  { playerId: 'p1', name: 'Amara', position: 'Midfielder' },
] as unknown as RecentlyViewedEntry[];

describe('RecentlyViewedStrip i18n', () => {
  it('renders French heading', () => {
    render(<RecentlyViewedStrip entries={entries} />, { locale: 'fr' });
    expect(screen.getByText('Consultés récemment')).toBeInTheDocument();
  });
});
