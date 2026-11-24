import React from 'react';
import { render, screen } from '../../setup-providers-intl';

jest.unmock('next-intl');

const mockUsePayToContact = jest.fn();

jest.mock('@/hooks/usePayToContact', () => ({
  usePayToContact: (...args: unknown[]) => mockUsePayToContact(...args),
}));

import ContactModal from '@/components/scout/ContactModal';

describe('ContactModal (localized)', () => {
  it('renders contact details in French', () => {
    mockUsePayToContact.mockReturnValue({
      contactDetails: { email: 'scout@example.com' },
      loading: false,
      clear: jest.fn(),
    });
    render(<ContactModal isOpen onClose={jest.fn()} playerId="player-123" />, {
      locale: 'fr',
    });

    expect(screen.getByText('Coordonnées du joueur')).toBeInTheDocument();
    expect(screen.getByText('E-mail : scout@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
  });
});
