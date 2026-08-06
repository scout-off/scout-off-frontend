/** @jest-environment node */
import { GET } from '@/app/api/admin/config-status/route';

describe('Config Status API', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_CONTRACT_ID = 'test-contract';
    process.env.NEXT_PUBLIC_NETWORK = 'testnet';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns presence information for all config variables', async () => {
    const response = await GET();
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    const names = data.map((d: any) => d.name);
    expect(names).toContain('NEXT_PUBLIC_CONTRACT_ID');
    expect(names).toContain('NEXT_PUBLIC_NETWORK');
    const contractEntry = data.find(
      (d: any) => d.name === 'NEXT_PUBLIC_CONTRACT_ID',
    );
    expect(contractEntry.present).toBe(true);
    const networkEntry = data.find(
      (d: any) => d.name === 'NEXT_PUBLIC_NETWORK',
    );
    expect(networkEntry.present).toBe(true);
    const pinataEntry = data.find((d: any) => d.name === 'PINATA_API_KEY');
    expect(pinataEntry.present).toBe(false);
  });
});
