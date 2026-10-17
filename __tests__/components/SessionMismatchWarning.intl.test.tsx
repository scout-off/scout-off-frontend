import '@testing-library/jest-dom';
import { render, screen } from '../setup-providers-intl';
import SessionMismatchWarning from '@/components/SessionMismatchWarning';
import { useWallet } from '@/hooks/useWallet';

jest.unmock('next-intl');
jest.mock('@/hooks/useWallet', () => ({ useWallet: jest.fn() }));

const mockUseWallet = useWallet as jest.Mock;

describe('SessionMismatchWarning localization', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GABCDEFGHIJKLMNOP',
      sessionMismatch: true,
      reauthenticate: jest.fn(),
    });
  });

  it('renders French copy and accessible names', () => {
    render(<SessionMismatchWarning />, { locale: 'fr' });
    expect(screen.getByText('Incohérence de session détectée')).toBeInTheDocument();
    expect(screen.getByText(/GABCDEFG…/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se réauthentifier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Fermer l'avertissement" })).toBeInTheDocument();
  });

  it('renders Swahili copy', () => {
    render(<SessionMismatchWarning />, { locale: 'sw' });
    expect(screen.getByText('Hitilafu ya kikao imegunduliwa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Funga onyo' })).toBeInTheDocument();
  });
});
