import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApproveForm from '@/components/validator/ApproveForm';
import { useWallet } from '@/hooks/useWallet';
import { useValidator } from '@/hooks/useValidator';
import { getPlayer } from '@/lib/contract';
import type { Player } from '@/types';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useValidator', () => ({
  useValidator: jest.fn(),
}));

jest.mock('@/lib/contract', () => ({
  getPlayer: jest.fn(),
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseValidator = useValidator as jest.MockedFunction<
  typeof useValidator
>;
const mockedGetPlayer = getPlayer as jest.MockedFunction<typeof getPlayer>;

const player: Player = {
  id: 'player-1',
  wallet: 'GABC123PUBLICKEY',
  vitals: {
    name: 'Test Player',
    age: 20,
    position: 'Forward',
    region: 'West Africa',
    nationality: 'Nigerian',
  },
  ipfsHash: 'Qmabcdef1234567890abcdef1234567890abcdef12',
  progressLevel: 0,
  milestones: [],
  createdAt: 1234567890,
};

function renderComponent(
  isValidator: boolean = true,
  onSuccess: () => void = jest.fn(),
) {
  mockedUseWallet.mockReturnValue({
    publicKey: 'GVALIDATORPUBLICKEY',
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  } as any);

  mockedUseValidator.mockReturnValue({
    isValidator,
    checking: false,
    approveMilestone: jest.fn(),
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  });

  return render(<ApproveForm onSuccess={onSuccess} />);
}

describe('ApproveForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows not a validator message when isValidator=false', () => {
    renderComponent(false);
    expect(screen.getByText('Not a validator')).toBeInTheDocument();
  });

  it('displays the form when isValidator=true', () => {
    renderComponent(true);
    // "Approve Milestone" appears as both the <h2> form heading and
    // the submit button's text content, so naive getByText throws
    // "Multiple elements found". Scope to role=heading so the query
    // disambiguates from the same-text <button>.
    expect(
      screen.getByRole('heading', { name: 'Approve Milestone' }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter player ID')).toBeInTheDocument();
    // The textarea placeholder uses the smart apostrophe (U+2019) and
    // an ellipsis (U+2026). The regex char class accepts either
    // apostrophe form so the test is stable across placeholder
    // rewrites that switch between straight ' and smart U+2019.
    expect(
      screen.getByPlaceholderText(/Describe the player['’]s achievement/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('https://example.com/evidence'),
    ).toBeInTheDocument();
  });

  it('shows validation error for invalid evidence URL', async () => {
    renderComponent(true);
    const evidenceUrlInput = screen.getByPlaceholderText(
      'https://example.com/evidence',
    );

    fireEvent.change(evidenceUrlInput, { target: { value: 'invalid-url' } });

    expect(
      await screen.findByText('Evidence URL must be a valid http/https URL'),
    ).toBeInTheDocument();
  });

  it('calls approveMilestone with correct arguments when submitting valid data', async () => {
    const approveMilestone = jest.fn().mockResolvedValue('mock-xdr');
    const signAndSubmit = jest.fn().mockResolvedValue({});
    const onSuccess = jest.fn();

    mockedUseValidator.mockReturnValue({
      isValidator: true,
      checking: false,
      approveMilestone,
      revokeMilestone: jest.fn(),
      loading: false,
      error: null,
    });

    mockedUseWallet.mockReturnValue({
      publicKey: 'GVALIDATORPUBLICKEY',
      isAuthenticated: true,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit,
    } as any);

    render(<ApproveForm onSuccess={onSuccess} />);

    const playerIdInput = screen.getByPlaceholderText('Enter player ID');
    // See the smart-apostrophe note in "displays the form when
    // isValidator=true" — the textarea placeholder can have either
    // straight ' or smart U+2019, and this regex accepts both.
    const descriptionInput = screen.getByPlaceholderText(
      /Describe the player['’]s achievement/i,
    );
    const evidenceUrlInput = screen.getByPlaceholderText(
      'https://example.com/evidence',
    );
    const submitButton = screen.getByRole('button', {
      name: /Approve Milestone/i,
    });

    fireEvent.change(playerIdInput, { target: { value: 'player-1' } });
    fireEvent.change(descriptionInput, { target: { value: 'Test milestone' } });
    fireEvent.change(evidenceUrlInput, {
      target: { value: 'https://example.com/evidence' },
    });

    // fireEvent.click on a <button type="submit"> dispatches the click
    // event but does NOT trigger jsdom's form-submission default action,
    // so the form's onSubmit handler never runs. Firing `submit` on the
    // submit button doesn't reliably bubble through React's synthetic
    // event system either. The canonical fix is to fire `submit` on
    // the form element itself (button.form points to the owning <form>
    // and is the most reliable way to grab it without introducing a
    // new selector). (userEvent.click would also work but requires an
    // extra dependency.)
    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(approveMilestone).toHaveBeenCalledWith('player-1', 'Test milestone');
    expect(signAndSubmit).toHaveBeenCalledWith('mock-xdr');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
