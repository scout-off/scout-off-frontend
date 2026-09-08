import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfigStatus from '@/components/admin/ConfigStatus';

type ConfigEntry = {
  name: string;
  required: boolean;
  present: boolean;
};

function mockConfigResponse(config: ConfigEntry[]) {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => config,
  } as Response);
}

describe('ConfigStatus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders an all-green state when every configuration value is present', async () => {
    mockConfigResponse([
      { name: 'NEXT_PUBLIC_CONTRACT_ID', required: true, present: true },
      { name: 'NEXT_PUBLIC_NETWORK', required: true, present: true },
      { name: 'NEXT_PUBLIC_IPFS_GATEWAY', required: false, present: true },
    ]);

    render(<ConfigStatus />);

    expect(
      await screen.findByRole('heading', {
        name: 'Runtime Configuration Status',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Present')).toHaveLength(3);
    expect(screen.queryByText('Missing')).not.toBeInTheDocument();
  });

  it('clearly marks each missing configuration value', async () => {
    mockConfigResponse([
      { name: 'NEXT_PUBLIC_CONTRACT_ID', required: true, present: false },
      { name: 'NEXT_PUBLIC_NETWORK', required: true, present: true },
      { name: 'NEXT_PUBLIC_IPFS_GATEWAY', required: false, present: false },
    ]);

    render(<ConfigStatus />);

    expect(
      await screen.findByRole('heading', {
        name: 'Runtime Configuration Status',
      }),
    ).toBeInTheDocument();

    for (const name of [
      'NEXT_PUBLIC_CONTRACT_ID',
      'NEXT_PUBLIC_IPFS_GATEWAY',
    ]) {
      const row = screen.getByText(name).closest('tr');
      expect(row).not.toBeNull();
      expect(
        within(row as HTMLElement).getByText('Missing'),
      ).toBeInTheDocument();
    }

    const presentRow = screen.getByText('NEXT_PUBLIC_NETWORK').closest('tr');
    expect(presentRow).not.toBeNull();
    expect(
      within(presentRow as HTMLElement).getByText('Present'),
    ).toBeInTheDocument();
  });
});
