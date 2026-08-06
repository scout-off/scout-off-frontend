/**
 * Unit tests for lib/api.ts
 * Issue #85 – test: add unit tests for lib/api.ts
 *
 * Strategy: mock axios using jest.mock factory. Because jest.mock is hoisted
 * before variable declarations, we capture the mock functions via module-level
 * references that are assigned inside the factory using jest.fn().
 */

// These are assigned inside the jest.mock factory below.
// They must be declared with `let` so the factory can close over them.
let mockGet: jest.Mock;
let mockPost: jest.Mock;

jest.mock('axios', () => {
  // Create the fns inside the factory to avoid the TDZ issue with hoisting
  const get = jest.fn();
  const post = jest.fn();

  // Expose them so tests can reference them after the factory runs
  // We assign to the outer `let` variables via a side-effect on the mock module
  const instance = {
    get,
    post,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    // Attach refs so we can grab them in beforeAll
    __mockGet: get,
    __mockPost: post,
  };

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
      __instance: instance,
    },
  };
});

// Import AFTER the mock is registered
import axios from 'axios';
import {
  fetchPlayerProfile,
  fetchPlayerComments,
  fetchScoutProfile,
  fetchScoutContacts,
  fetchChatHistory,
  postChatMessage,
  searchPlayersByName,
  SearchRateLimitedError,
  fetchScoutStats,
  fetchActivityEvents,
  fetchValidatorMilestoneCount,
  fetchAcademies,
  createAcademy,
  addAcademyMember,
  removeAcademyMember,
  fetchAcademyForWallet,
} from '@/lib/api';

// Grab the mock functions from the instance that axios.create returned
beforeAll(() => {
  const instance = (axios as any).__instance;
  mockGet = instance.__mockGet;
  mockPost = instance.__mockPost;
});

// ── Configuration ─────────────────────────────────────────────────────────────

describe('lib/api – axios instance configuration', () => {
  it('calls axios.create with Content-Type header', () => {
    expect(axios.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('sets baseURL from NEXT_PUBLIC_API_URL or falls back to localhost:4000', () => {
    const [[callArgs]] = (axios.create as jest.Mock).mock.calls;
    expect(callArgs.baseURL).toMatch(/localhost:4000|https?:\/\//);
  });
});

// ── fetchPlayerProfile ────────────────────────────────────────────────────────

describe('fetchPlayerProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /players/:playerId and returns data', async () => {
    const mockData = { id: 'player-1', vitals: { name: 'Alice' } };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchPlayerProfile('player-1');

    expect(mockGet).toHaveBeenCalledWith('/players/player-1');
    expect(result).toEqual(mockData);
  });
});

// ── fetchPlayerComments ───────────────────────────────────────────────────────

describe('fetchPlayerComments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /players/:playerId/comments and returns data', async () => {
    const mockData = [{ id: 'c1', text: 'Great player' }];
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchPlayerComments('player-1');

    expect(mockGet).toHaveBeenCalledWith('/players/player-1/comments');
    expect(result).toEqual(mockData);
  });
});

// ── fetchScoutProfile ─────────────────────────────────────────────────────────

describe('fetchScoutProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /scouts/:scoutId and returns data', async () => {
    const mockData = { id: 'scout-1', name: 'Bob' };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchScoutProfile('scout-1');

    expect(mockGet).toHaveBeenCalledWith('/scouts/scout-1');
    expect(result).toEqual(mockData);
  });
});

// ── fetchScoutContacts ────────────────────────────────────────────────────────

describe('fetchScoutContacts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /scouts/:scoutId/contacts and returns data', async () => {
    const mockData = [{ playerId: 'player-1' }];
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchScoutContacts('scout-1');

    expect(mockGet).toHaveBeenCalledWith('/scouts/scout-1/contacts');
    expect(result).toEqual(mockData);
  });
});

// ── fetchChatHistory (getMessages) ────────────────────────────────────────────

describe('fetchChatHistory (getMessages)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /chat/:roomId and returns data', async () => {
    const mockData = [{ id: 'msg-1', text: 'Hello' }];
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchChatHistory('room-abc');

    expect(mockGet).toHaveBeenCalledWith('/chat/room-abc');
    expect(result).toEqual(mockData);
  });

  it('surfaces a 500 error', async () => {
    const serverError = Object.assign(
      new Error('Request failed with status code 500'),
      {
        response: { status: 500, data: { message: 'Internal Server Error' } },
      },
    );
    mockGet.mockRejectedValueOnce(serverError);

    await expect(fetchChatHistory('room-abc')).rejects.toThrow(
      'Request failed with status code 500',
    );
  });
});

// ── searchPlayersByName ───────────────────────────────────────────────────────

describe('searchPlayersByName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('calls GET /api/players/search with the name param and returns data', async () => {
    const mockData = [{ id: 'player-1', name: 'Alice' }];
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
      headers: new Headers(),
    });

    const result = await searchPlayersByName('Alice');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/players/search?name=Alice',
      undefined,
    );
    expect(result).toEqual(mockData);
  });

  it('throws SearchRateLimitedError with retryAfterSec when rate-limited', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '7' }),
      json: async () => ({
        error: 'Too many search requests. Please slow down.',
      }),
    });

    await expect(searchPlayersByName('Alice')).rejects.toThrow(
      SearchRateLimitedError,
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '7' }),
      json: async () => ({
        error: 'Too many search requests. Please slow down.',
      }),
    });
    const err = await searchPlayersByName('Alice').catch((e) => e);
    expect(err).toBeInstanceOf(SearchRateLimitedError);
    expect(err.retryAfterSec).toBe(7);
  });

  it('throws a generic error for other failed responses', async () => {
    // 500 is a retryable status (see lib/fetchWithRetry.ts), so every
    // attempt — not just the first — needs to see this response; fake
    // timers skip the real backoff delay between retries.
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
    });

    const assertion = expect(searchPlayersByName('Alice')).rejects.toThrow(
      'Failed to search players',
    );
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
  });
});

// ── fetchScoutStats ───────────────────────────────────────────────────────────

describe('fetchScoutStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /scouts/:scoutId/stats and returns data', async () => {
    const mockData = { contactedCount: 3, trialOffersCount: 1 };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchScoutStats('scout-1');

    expect(mockGet).toHaveBeenCalledWith('/scouts/scout-1/stats');
    expect(result).toEqual(mockData);
  });
});

// ── fetchActivityEvents ───────────────────────────────────────────────────────

describe('fetchActivityEvents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls GET /admin/activity with default paging and returns data', async () => {
    const mockData = { events: [], total: 0 };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchActivityEvents();

    expect(mockGet).toHaveBeenCalledWith('/admin/activity', {
      params: { page: 1, pageSize: 20 },
    });
    expect(result).toEqual(mockData);
  });

  it('forwards explicit page and pageSize params', async () => {
    const mockData = { events: [], total: 0 };
    mockGet.mockResolvedValueOnce({ data: mockData });

    await fetchActivityEvents(2, 5);

    expect(mockGet).toHaveBeenCalledWith('/admin/activity', {
      params: { page: 2, pageSize: 5 },
    });
  });
});

// ── fetchValidatorMilestoneCount ──────────────────────────────────────────────

describe('fetchValidatorMilestoneCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the milestone count from a camelCase response', async () => {
    mockGet.mockResolvedValueOnce({ data: { milestoneCount: 7 } });

    const result = await fetchValidatorMilestoneCount('GVALIDATOR');

    expect(mockGet).toHaveBeenCalledWith('/validators/GVALIDATOR/stats');
    expect(result).toBe(7);
  });

  it('falls back to a snake_case response', async () => {
    mockGet.mockResolvedValueOnce({ data: { milestone_count: 4 } });

    const result = await fetchValidatorMilestoneCount('GVALIDATOR');

    expect(result).toBe(4);
  });

  it('returns null when the response has no recognisable count', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });

    const result = await fetchValidatorMilestoneCount('GVALIDATOR');

    expect(result).toBeNull();
  });

  it('returns null when the request fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchValidatorMilestoneCount('GVALIDATOR');

    expect(result).toBeNull();
  });

  it('URL-encodes the validator address', async () => {
    mockGet.mockResolvedValueOnce({ data: { milestoneCount: 1 } });

    await fetchValidatorMilestoneCount('G VALIDATOR/WITH SPACE');

    expect(mockGet).toHaveBeenCalledWith(
      '/validators/G%20VALIDATOR%2FWITH%20SPACE/stats',
    );
  });
});

// ── postChatMessage (sendMessage) ─────────────────────────────────────────────

describe('postChatMessage (sendMessage)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls POST /chat/:roomId with the correct body and returns data', async () => {
    const mockData = { id: 'msg-2', text: 'Hi there' };
    mockPost.mockResolvedValueOnce({ data: mockData });

    const result = await postChatMessage('room-abc', 'Hi there', 'sender-1');

    expect(mockPost).toHaveBeenCalledWith('/chat/room-abc', {
      message: 'Hi there',
      sender: 'sender-1',
    });
    expect(result).toEqual(mockData);
  });

  it('surfaces a 500 error', async () => {
    const serverError = Object.assign(
      new Error('Request failed with status code 500'),
      {
        response: { status: 500, data: { message: 'Internal Server Error' } },
      },
    );
    mockPost.mockRejectedValueOnce(serverError);

    await expect(postChatMessage('room-abc', 'Hi', 'sender-1')).rejects.toThrow(
      'Request failed with status code 500',
    );
  });

  it('surfaces a 401 error (session cleared scenario)', async () => {
    const authError = Object.assign(
      new Error('Request failed with status code 401'),
      {
        response: { status: 401, data: { message: 'Unauthorized' } },
      },
    );
    mockPost.mockRejectedValueOnce(authError);

    await expect(
      postChatMessage('room-abc', 'Hi', 'sender-1'),
    ).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});

// ── Academies (issue #663) ──────────────────────────────────────────────────

const ACADEMY = {
  id: 'academy-1',
  name: 'FC Sahel',
  ownerWallet: 'GOWNER',
  createdAt: 1_700_000_000,
  members: [
    {
      wallet: 'GOWNER',
      academyId: 'academy-1',
      addedAt: 1_700_000_000,
      addedBy: 'GADMIN',
    },
  ],
};

describe('fetchAcademies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('GETs the admin proxy and returns the academy list', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [ACADEMY],
    });

    const result = await fetchAcademies();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/academies',
      undefined,
    );
    expect(result).toEqual([ACADEMY]);
  });

  it('throws with the server-provided error message on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });

    await expect(fetchAcademies()).rejects.toThrow('Unauthorized');
  });
});

describe('createAcademy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('POSTs name and ownerWallet to the admin proxy', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ACADEMY,
    });

    const result = await createAcademy('FC Sahel', 'GOWNER');

    expect(global.fetch).toHaveBeenCalledWith('/api/admin/academies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'FC Sahel', ownerWallet: 'GOWNER' }),
    });
    expect(result).toEqual(ACADEMY);
  });

  it('throws with a fallback message when the response has no error field', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(createAcademy('FC Sahel', 'GOWNER')).rejects.toThrow(
      'Failed to create academy',
    );
  });
});

describe('addAcademyMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('POSTs the wallet to the academy members admin proxy', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ACADEMY,
    });

    await addAcademyMember('academy-1', 'GCOACH');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/academies/academy-1/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: 'GCOACH' }),
      },
    );
  });
});

describe('removeAcademyMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('DELETEs the member from the admin proxy, URL-encoding both segments', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await removeAcademyMember('academy 1', 'GCOACH/WITH SLASH');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/academies/academy%201/members/GCOACH%2FWITH%20SLASH',
      { method: 'DELETE' },
    );
  });

  it('throws when the response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Membership not found' }),
    });

    await expect(removeAcademyMember('academy-1', 'GCOACH')).rejects.toThrow(
      'Membership not found',
    );
  });
});

describe('fetchAcademyForWallet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GETs the public academy lookup and returns the academy', async () => {
    mockGet.mockResolvedValueOnce({ data: ACADEMY });

    const result = await fetchAcademyForWallet('GOWNER');

    expect(mockGet).toHaveBeenCalledWith('/academies/wallet/GOWNER');
    expect(result).toEqual(ACADEMY);
  });

  it('returns null when the request fails (e.g. wallet in no academy)', async () => {
    mockGet.mockRejectedValueOnce(new Error('Not Found'));

    const result = await fetchAcademyForWallet('GNOBODY');

    expect(result).toBeNull();
  });

  it('URL-encodes the wallet address', async () => {
    mockGet.mockResolvedValueOnce({ data: ACADEMY });

    await fetchAcademyForWallet('G WALLET/WITH SPACE');

    expect(mockGet).toHaveBeenCalledWith(
      '/academies/wallet/G%20WALLET%2FWITH%20SPACE',
    );
  });
});
