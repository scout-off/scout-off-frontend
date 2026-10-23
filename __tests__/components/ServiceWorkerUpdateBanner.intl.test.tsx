import '@testing-library/jest-dom';
import { render, screen } from '../setup-providers-intl';
import ServiceWorkerUpdateBanner from '@/components/ServiceWorkerUpdateBanner';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';

jest.unmock('next-intl');
jest.mock('@/hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: jest.fn(),
}));

describe('ServiceWorkerUpdateBanner localization', () => {
  beforeEach(() => {
    (useServiceWorkerUpdate as jest.Mock).mockReturnValue({
      updateAvailable: true,
      reload: jest.fn(),
      dismiss: jest.fn(),
    });
  });

  it('renders French copy and accessible names', () => {
    render(<ServiceWorkerUpdateBanner />, { locale: 'fr' });
    expect(screen.getByText('Nouvelle version disponible.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fermer la bannière de mise à jour' }),
    ).toBeInTheDocument();
  });

  it('renders Swahili copy', () => {
    render(<ServiceWorkerUpdateBanner />, { locale: 'sw' });
    expect(screen.getByText('Toleo jipya linapatikana.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pakia upya' })).toBeInTheDocument();
  });
});
