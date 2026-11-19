import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import CookieSettingsLink from '@/components/ui/CookieSettingsLink';
import { reopenConsentBanner } from '@/components/ui/CookieConsentBanner';

expect.extend(toHaveNoViolations);

jest.mock('@/components/ui/CookieConsentBanner', () => ({
  reopenConsentBanner: jest.fn(),
}));

const mockReopen = reopenConsentBanner as jest.Mock;

describe('CookieSettingsLink', () => {
  beforeEach(() => mockReopen.mockReset());

  it('uses the label as its accessible name', () => {
    render(<CookieSettingsLink label="Cookie Settings" />);
    expect(
      screen.getByRole('button', { name: 'Cookie Settings' }),
    ).toHaveAttribute('type', 'button');
  });

  it('calls reopenConsentBanner once on click', () => {
    render(<CookieSettingsLink label="Cookie Settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cookie Settings' }));
    expect(mockReopen).toHaveBeenCalledTimes(1);
  });

  it.each(['{Enter}', ' '])('activates via keyboard (%s)', async (key) => {
    const user = userEvent.setup();
    render(<CookieSettingsLink label="Cookie Settings" />);
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Cookie Settings' }),
    ).toHaveFocus();
    await user.keyboard(key);
    expect(mockReopen).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <CookieSettingsLink label="Cookie Settings" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
