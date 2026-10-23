jest.unmock('next-intl');

import { render, screen } from '@/__tests__/setup-providers-intl';
import '@testing-library/jest-dom';
import ValidatorChip from '@/components/player/ValidatorChip';

jest.mock('@/lib/contract', () => ({
  checkIsValidator: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/api', () => ({
  fetchValidatorMilestoneCount: jest.fn().mockResolvedValue(3),
  fetchAcademyForWallet: jest.fn().mockResolvedValue(null),
}));

const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

describe('ValidatorChip i18n', () => {
  it('renders the status and tooltip label in French', async () => {
    render(<ValidatorChip address={ADDRESS} />, { locale: 'fr' });
    expect(await screen.findByText('Validateur actif')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Validateur actif · 3 jalons validés'),
    ).toBeInTheDocument();
  });
});
