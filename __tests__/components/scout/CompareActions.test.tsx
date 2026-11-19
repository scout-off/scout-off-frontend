import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompareActions, {
  buildCompareUrl,
} from '@/components/scout/CompareActions';
import type { Player } from '@/types';

const show = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show }),
}));
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const player = (id: string): Player => ({
  id,
  wallet: 'GWALLET',
  vitals: {
    name: `Player ${id}`,
    age: 20,
    position: 'ST',
    region: 'West Africa',
    nationality: 'Ghanaian',
  },
  ipfsHash: '',
  progressLevel: 1,
  milestones: [],
  createdAt: 0,
  archived: false,
});

const players = [player('p1'), player('p2')];

beforeEach(() => {
  show.mockClear();
  window.history.replaceState({}, '', '/en/scout/compare?ids=p1,p2&x=1#top');
});

describe('buildCompareUrl', () => {
  it('keeps only the ids param', () => {
    expect(buildCompareUrl(players)).toBe(
      `${window.location.origin}/en/scout/compare?ids=p1,p2`,
    );
  });
});

describe('CompareActions', () => {
  it('copies the canonical link and shows a success toast', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CompareActions players={players} />);
    fireEvent.click(screen.getByRole('button', { name: 'copy_link' }));
    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({
        message: 'link_copied',
        variant: 'success',
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/en/scout/compare?ids=p1,p2`,
    );
  });

  it('falls back to a toast when the clipboard is unavailable', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('no')) },
    });
    render(<CompareActions players={players} />);
    fireEvent.click(screen.getByRole('button', { name: 'copy_link' }));
    await waitFor(() =>
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'link_copy_failed',
          variant: 'warning',
        }),
      ),
    );
  });

  it('downloads a CSV', () => {
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<CompareActions players={players} />);
    fireEvent.click(screen.getByRole('button', { name: 'download_csv' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(show).toHaveBeenCalledWith({
      message: 'csv_downloaded',
      variant: 'success',
    });
    click.mockRestore();
  });

  it('disables actions with no players', () => {
    render(<CompareActions players={[]} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });
});
