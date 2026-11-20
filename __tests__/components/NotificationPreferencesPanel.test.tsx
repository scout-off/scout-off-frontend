import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import NotificationPreferencesPanel from '@/components/NotificationPreferencesPanel';
import { useWallet } from '@/hooks/useWallet';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';

jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: jest.fn(),
}));

const mockSavedSearchAlerts = {
  preferences: { enabled: true, delivery: 'instant' },
  loading: false,
  update: jest.fn(),
};
jest.mock('@/hooks/useSavedSearchAlertPreferences', () => ({
  useSavedSearchAlertPreferences: () => mockSavedSearchAlerts,
}));

const mockUseWallet = useWallet as jest.Mock;
const mockUseNotificationPreferences = useNotificationPreferences as jest.Mock;

describe('NotificationPreferencesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompts wallet connection when not authenticated', () => {
    mockUseWallet.mockReturnValue({ publicKey: null, isAuthenticated: false });
    mockUseNotificationPreferences.mockReturnValue({
      preferences: { milestoneApprovals: true, contactUnlocks: true },
      loading: false,
      update: jest.fn(),
    });

    render(<NotificationPreferencesPanel />);

    expect(
      screen.getByText(
        'Connect your wallet to manage notification preferences.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('renders a toggle per notification category with its saved state', () => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GABCDEF1234567890XYZ',
      isAuthenticated: true,
    });
    mockUseNotificationPreferences.mockReturnValue({
      preferences: { milestoneApprovals: true, contactUnlocks: false },
      loading: false,
      update: jest.fn(),
    });

    render(<NotificationPreferencesPanel />);

    const milestoneToggle = screen.getByRole('switch', {
      name: 'Milestone approvals',
    });
    const contactToggle = screen.getByRole('switch', {
      name: 'Contact unlocks',
    });
    expect(milestoneToggle).toHaveAttribute('aria-checked', 'true');
    expect(contactToggle).toHaveAttribute('aria-checked', 'false');
  });

  it('flips a single category independently when its toggle is clicked', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockUseWallet.mockReturnValue({
      publicKey: 'GABCDEF1234567890XYZ',
      isAuthenticated: true,
    });
    mockUseNotificationPreferences.mockReturnValue({
      preferences: { milestoneApprovals: true, contactUnlocks: true },
      loading: false,
      update,
    });

    const user = userEvent.setup({ delay: null });
    render(<NotificationPreferencesPanel />);

    await user.click(screen.getByRole('switch', { name: 'Contact unlocks' }));

    expect(update).toHaveBeenCalledWith({
      milestoneApprovals: true,
      contactUnlocks: false,
    });
  });

  describe('saved search matches (issue #1705)', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({
        publicKey: 'GSCOUT',
        isAuthenticated: true,
      });
      mockUseNotificationPreferences.mockReturnValue({
        preferences: { milestoneApprovals: true, contactUnlocks: true },
        loading: false,
        update: jest.fn(),
      });
      mockSavedSearchAlerts.preferences = {
        enabled: true,
        delivery: 'instant',
      };
      mockSavedSearchAlerts.update = jest.fn().mockResolvedValue(undefined);
    });

    it('toggles the saved search matches category off', async () => {
      const user = userEvent.setup();
      render(<NotificationPreferencesPanel />);

      await user.click(
        screen.getByRole('switch', { name: 'Saved search matches' }),
      );

      expect(mockSavedSearchAlerts.update).toHaveBeenCalledWith({
        enabled: false,
        delivery: 'instant',
      });
    });

    it('switches delivery to a daily digest', async () => {
      const user = userEvent.setup();
      render(<NotificationPreferencesPanel />);

      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Delivery' }),
        'daily',
      );

      expect(mockSavedSearchAlerts.update).toHaveBeenCalledWith({
        enabled: true,
        delivery: 'daily',
      });
    });
  });
});
