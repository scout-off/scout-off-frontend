jest.unmock('next-intl');

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@/__tests__/setup-providers-intl';
import '@testing-library/jest-dom';
import ExportContactsCsvButton from '@/components/scout/ExportContactsCsvButton';
import { fetchScoutContacts } from '@/lib/api';

const show = jest.fn();

jest.mock('@/lib/api', () => ({
  fetchScoutContacts: jest.fn(),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show }),
}));

describe('ExportContactsCsvButton i18n', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the button label in French', () => {
    render(<ExportContactsCsvButton scoutId="G123" />, { locale: 'fr' });
    expect(
      screen.getByRole('button', { name: 'Exporter en CSV' }),
    ).toBeInTheDocument();
  });

  it('shows the translated error toast when the export fails', async () => {
    (fetchScoutContacts as jest.Mock).mockRejectedValue(new Error('boom'));
    render(<ExportContactsCsvButton scoutId="G123" />, { locale: 'sw' });
    fireEvent.click(screen.getByRole('button', { name: 'Hamisha CSV' }));
    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({
        message: 'Imeshindwa kuhamisha anwani.',
        variant: 'error',
      }),
    );
  });
});
