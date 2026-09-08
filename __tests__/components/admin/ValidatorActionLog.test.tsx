import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ValidatorActionLog from '@/components/admin/ValidatorActionLog';
import { useValidatorActionLog } from '@/hooks/useValidatorActionLog';
import { buildValidatorActionLogCsv } from '@/lib/validatorActionLogCsv';
import type { ValidatorActionEntry } from '@/hooks/useValidatorActionLog';

jest.mock('@/hooks/useValidatorActionLog', () => ({
  useValidatorActionLog: jest.fn(),
}));

jest.mock('@/lib/validatorActionLogCsv', () => ({
  buildValidatorActionLogCsv: jest.fn(() => 'mocked,csv,content\n'),
}));

const mockUseValidatorActionLog = useValidatorActionLog as jest.Mock;
const mockBuildValidatorActionLogCsv = buildValidatorActionLogCsv as jest.Mock;

const setFilter = jest.fn();
const refetch = jest.fn();

function makeEntry(
  overrides: Partial<ValidatorActionEntry> = {},
): ValidatorActionEntry {
  return {
    id: 'milestone_approved-1',
    timestamp: 1_700_000_000,
    validator: 'GVAL1234567890ABCDEFGVAL1234567890ABCDEFGVAL1234567890AB',
    playerId: 'player-001',
    milestoneId: 'milestone-kyc',
    action: 'approved',
    ...overrides,
  };
}

function baseState(
  overrides: Partial<ReturnType<typeof useValidatorActionLog>> = {},
) {
  return {
    entries: [],
    validators: [],
    loading: false,
    error: null,
    filter: {},
    setFilter,
    refetch,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
});

describe('ValidatorActionLog', () => {
  // ── Empty / loading states ──────────────────────────────────────────────

  it('shows the empty state when there are no entries', () => {
    mockUseValidatorActionLog.mockReturnValue(baseState());
    render(<ValidatorActionLog />);

    expect(
      screen.getByText('No validator actions recorded'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/milestone approvals and revocations will appear here/i),
    ).toBeInTheDocument();
  });

  it('shows a loading message while data is being fetched', () => {
    mockUseValidatorActionLog.mockReturnValue(baseState({ loading: true }));
    render(<ValidatorActionLog />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // Section heading is always present
    expect(screen.getByText('Validator Action Log')).toBeInTheDocument();
  });

  it('shows an error alert when the hook returns an error', () => {
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ error: 'indexer unavailable' }),
    );
    render(<ValidatorActionLog />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Failed to load validator action log. The indexer may be unavailable.',
    );
  });

  // ── Populated log ───────────────────────────────────────────────────────

  it('renders a table row per entry with time, action, validator, player, and milestone', () => {
    const entries = [
      makeEntry(),
      makeEntry({
        id: 'milestone_revoked-2',
        action: 'revoked',
        validator: 'GVAL9999999999ABCDEFGVAL9999999999ABCDEFGVAL9999999999AB',
        playerId: 'player-002',
        milestoneId: 'milestone-contract',
      }),
    ];
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ entries, validators: [] }),
    );
    render(<ValidatorActionLog />);

    // Table headers
    expect(
      screen.getByRole('columnheader', { name: /time/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /action/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /validator/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /player/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /milestone/i }),
    ).toBeInTheDocument();

    // Action labels
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();

    // Player and milestone IDs
    expect(screen.getByText('player-001')).toBeInTheDocument();
    expect(screen.getByText('milestone-kyc')).toBeInTheDocument();
    expect(screen.getByText('player-002')).toBeInTheDocument();
    expect(screen.getByText('milestone-contract')).toBeInTheDocument();
  });

  it('renders the section heading', () => {
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ entries: [makeEntry()] }),
    );
    render(<ValidatorActionLog />);

    expect(screen.getByText('Validator Action Log')).toBeInTheDocument();
  });

  it('renders a dash when validator, playerId, or milestoneId is null', () => {
    mockUseValidatorActionLog.mockReturnValue(
      baseState({
        entries: [
          makeEntry({ validator: null, playerId: null, milestoneId: null }),
        ],
      }),
    );
    render(<ValidatorActionLog />);

    // Three em-dash cells rendered as '—'
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('populates the validator filter dropdown with the unique validators list', () => {
    const validators = [
      'GVAL1111111111ABCDEFGVAL1111111111ABCDEFGVAL1111111111AB',
      'GVAL2222222222ABCDEFGVAL2222222222ABCDEFGVAL2222222222AB',
    ];
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ entries: [makeEntry()], validators }),
    );
    render(<ValidatorActionLog />);

    const select = screen.getByRole('combobox');
    // "All" option + one per validator
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  // ── Filtering ───────────────────────────────────────────────────────────

  it('calls setFilter with the selected validator when the dropdown changes', () => {
    const validators = [
      'GVAL1111111111ABCDEFGVAL1111111111ABCDEFGVAL1111111111AB',
    ];
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ entries: [makeEntry()], validators }),
    );
    render(<ValidatorActionLog />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: validators[0] },
    });

    expect(setFilter).toHaveBeenCalledWith(
      expect.objectContaining({ validator: validators[0] }),
    );
  });

  it('calls setFilter with from/to unix seconds when Apply is clicked', () => {
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ entries: [makeEntry()] }),
    );
    render(<ValidatorActionLog />);

    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: '2024-01-01' },
    });
    fireEvent.change(screen.getByLabelText(/^to$/i), {
      target: { value: '2024-01-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(setFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(Number),
        to: expect.any(Number),
      }),
    );
  });

  // ── CSV export ──────────────────────────────────────────────────────────

  it('disables the Export as CSV button when entries is empty', () => {
    mockUseValidatorActionLog.mockReturnValue(baseState());
    render(<ValidatorActionLog />);

    expect(
      screen.getByRole('button', { name: /export as csv/i }),
    ).toBeDisabled();
  });

  it('disables the Export as CSV button while loading', () => {
    mockUseValidatorActionLog.mockReturnValue(baseState({ loading: true }));
    render(<ValidatorActionLog />);

    expect(
      screen.getByRole('button', { name: /export as csv/i }),
    ).toBeDisabled();
  });

  it('triggers a CSV download when Export is clicked with entries present', () => {
    mockUseValidatorActionLog.mockReturnValue(
      baseState({ entries: [makeEntry()] }),
    );
    render(<ValidatorActionLog />);

    fireEvent.click(screen.getByRole('button', { name: /export as csv/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('calls buildValidatorActionLogCsv with the current entries on export', () => {
    const entries = [
      makeEntry(),
      makeEntry({ id: 'milestone_revoked-3', action: 'revoked' }),
    ];
    mockUseValidatorActionLog.mockReturnValue(baseState({ entries }));
    render(<ValidatorActionLog />);

    fireEvent.click(screen.getByRole('button', { name: /export as csv/i }));

    expect(mockBuildValidatorActionLogCsv).toHaveBeenCalledTimes(1);
    expect(mockBuildValidatorActionLogCsv).toHaveBeenCalledWith(entries);
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });
});
