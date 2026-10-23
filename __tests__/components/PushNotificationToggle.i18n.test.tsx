jest.unmock('next-intl');

import { render, screen } from '@/__tests__/setup-providers-intl';
import '@testing-library/jest-dom';
import PushNotificationToggle from '@/components/PushNotificationToggle';
import { usePushNotifications } from '@/hooks/usePushNotifications';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({ publicKey: 'GABC' }),
}));
jest.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: jest.fn(),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

const mockUsePush = usePushNotifications as jest.Mock;

describe('PushNotificationToggle i18n', () => {
  it('renders the toggle in French', () => {
    mockUsePush.mockReturnValue({
      status: 'subscribed',
      enable: jest.fn(),
      disable: jest.fn(),
    });
    render(<PushNotificationToggle />, { locale: 'fr' });
    expect(
      screen.getByText('Alertes de validation de jalons'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Désactiver' }),
    ).toBeInTheDocument();
  });

  it('renders the unsupported message in Swahili', () => {
    mockUsePush.mockReturnValue({
      status: 'unsupported',
      enable: jest.fn(),
      disable: jest.fn(),
    });
    render(<PushNotificationToggle />, { locale: 'sw' });
    expect(
      screen.getByText('Arifa za push hazitumiki kwenye kivinjari hiki.'),
    ).toBeInTheDocument();
  });
});
