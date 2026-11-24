jest.unmock('next-intl');

import { fireEvent, render, screen } from '@/__tests__/setup-providers-intl';
import '@testing-library/jest-dom';
import DisputeEvidenceForm from '@/components/player/DisputeEvidenceForm';

jest.mock('@/lib/ipfs', () => ({ uploadToIPFS: jest.fn() }));

describe('DisputeEvidenceForm i18n', () => {
  it('renders labels and the file-type error in French', () => {
    render(<DisputeEvidenceForm onSubmit={jest.fn()} isValidatorResponse />, {
      locale: 'fr',
    });
    expect(
      screen.getByRole('button', { name: 'Soumettre la preuve' }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        'Expliquez les raisons de la validation de ce jalon…',
      ),
    ).toBeInTheDocument();

    const input = screen.getByLabelText(/Fichier de preuve/);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Type de fichier non pris en charge.',
    );
  });
});
