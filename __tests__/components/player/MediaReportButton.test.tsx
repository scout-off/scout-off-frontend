import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../setup-providers-intl';
import MediaReportButton from '@/components/player/MediaReportButton';

jest.unmock('next-intl');

describe('MediaReportButton', () => {
  it('renders the report flow in English', async () => {
    const user = userEvent.setup();
    render(<MediaReportButton cid="QmCid" />);

    await user.click(screen.getByRole('button', { name: 'Report' }));

    expect(screen.getByText('Report this media')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Copyright infringement' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit report' }),
    ).toBeInTheDocument();
  });

  it('renders the report flow in French', async () => {
    const user = userEvent.setup();
    render(<MediaReportButton cid="QmCid" />, { locale: 'fr' });

    await user.click(screen.getByRole('button', { name: 'Signaler' }));

    expect(screen.getByText('Signaler ce média')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Violation du droit d’auteur' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Envoyer le signalement' }),
    ).toBeInTheDocument();
  });
});
