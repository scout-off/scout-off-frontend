/** @jest-environment node */

describe('database store lifecycle', () => {
  afterEach(() => {
    delete process.env.INDEXER_DATABASE_URL;
    jest.dontMock('pg');
    jest.resetModules();
  });

  it('ends the Postgres pool during store cleanup', async () => {
    const end = jest.fn().mockResolvedValue(undefined);
    jest.doMock('pg', () => ({
      Pool: jest.fn(() => ({ end })),
    }));
    process.env.INDEXER_DATABASE_URL = 'postgres://localhost/indexer';

    const { closeStore, createPgPoolFromEnv } = require('../index') as typeof import('../index');
    expect(createPgPoolFromEnv()).not.toBeNull();

    await closeStore();

    expect(end).toHaveBeenCalledTimes(1);
  });
});