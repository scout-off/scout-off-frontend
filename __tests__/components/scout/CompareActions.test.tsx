import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToastProvider } from '@/components/ui/Toast';
import CompareActions from '@/components/scout/CompareActions';
import type { Player } from '@/types';

const player = (id: string): Player => ({
  id,
  wallet: `G${id}`,
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

function renderActions() {
  return render(
    <ToastProvider>
      <CompareActions players={[player('p1'), player('p2')]} />
    </ToastProvider>,
  );
}

describe('CompareActions', () => {
  const writeText = jest.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it('copies the canonical comparison URL and shows a toast', async () => {
    writeText.mockResolvedValue(undefined);
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(screen.getByText('Comparison link copied')).toBeInTheDocument(),
    );
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}?ids=p1,p2`,
    );
  });

  it('shows the link in an error toast when the clipboard fails', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(screen.getByText(/Couldn't copy the link/)).toBeInTheDocument(),
    );
  });

  it('downloads a CSV of the comparison', () => {
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });
});
