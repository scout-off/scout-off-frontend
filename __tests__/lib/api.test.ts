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

jest.mock("axios", () => {
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
import axios from "axios";
import {
  fetchPlayerProfile,
  fetchPlayerComments,
  fetchScoutProfile,
  fetchScoutContacts,
  fetchChatHistory,
  postChatMessage,
} from "@/lib/api";

// Grab the mock functions from the instance that axios.create returned
beforeAll(() => {
  const instance = (axios as any).__instance;
  mockGet = instance.__mockGet;
  mockPost = instance.__mockPost;
});

// ── Configuration ─────────────────────────────────────────────────────────────

describe("lib/api – axios instance configuration", () => {
  it("calls axios.create with Content-Type header", () => {
    expect((axios.create as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("sets baseURL from NEXT_PUBLIC_API_URL or falls back to localhost:4000", () => {
    const [[callArgs]] = (axios.create as jest.Mock).mock.calls;
    expect(callArgs.baseURL).toMatch(/localhost:4000|https?:\/\//);
  });
});

// ── fetchPlayerProfile ────────────────────────────────────────────────────────

describe("fetchPlayerProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls GET /players/:playerId and returns data", async () => {
    const mockData = { id: "player-1", vitals: { name: "Alice" } };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchPlayerProfile("player-1");

    expect(mockGet).toHaveBeenCalledWith("/players/player-1");
    expect(result).toEqual(mockData);
  });
});

// ── fetchPlayerComments ───────────────────────────────────────────────────────

describe("fetchPlayerComments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls GET /players/:playerId/comments and returns data", async () => {
    const mockData = [{ id: "c1", text: "Great player" }];
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchPlayerComments("player-1");

    expect(mockGet).toHaveBeenCalledWith("/players/player-1/comments");
    expect(result).toEqual(mockData);
  });
});

// ── fetchScoutProfile ─────────────────────────────────────────────────────────

describe("fetchScoutProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls GET /scouts/:scoutId and returns data", async () => {
    const mockData = { id: "scout-1", name: "Bob" };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchScoutProfile("scout-1");

    expect(mockGet).toHaveBeenCalledWith("/scouts/scout-1");
    expect(result).toEqual(mockData);
  });
});

// ── fetchScoutContacts ────────────────────────────────────────────────────────

describe("fetchScoutContacts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls GET /scouts/:scoutId/contacts and returns data", async () => {
    const mockData = [{ playerId: "player-1" }];
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchScoutContacts("scout-1");

    expect(mockGet).toHaveBeenCalledWith("/scouts/scout-1/contacts");
    expect(result).toEqual(mockData);
  });
});

// ── fetchChatHistory (getMessages) ────────────────────────────────────────────

describe("fetchChatHistory (getMessages)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls GET /chat/:roomId and returns data", async () => {
    const mockData = [{ id: "msg-1", text: "Hello" }];
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await fetchChatHistory("room-abc");

    expect(mockGet).toHaveBeenCalledWith("/chat/room-abc");
    expect(result).toEqual(mockData);
  });

  it("surfaces a 500 error", async () => {
    const serverError = Object.assign(new Error("Request failed with status code 500"), {
      response: { status: 500, data: { message: "Internal Server Error" } },
    });
    mockGet.mockRejectedValueOnce(serverError);

    await expect(fetchChatHistory("room-abc")).rejects.toThrow(
      "Request failed with status code 500"
    );
  });
});

// ── postChatMessage (sendMessage) ─────────────────────────────────────────────

describe("postChatMessage (sendMessage)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls POST /chat/:roomId with the correct body and returns data", async () => {
    const mockData = { id: "msg-2", text: "Hi there" };
    mockPost.mockResolvedValueOnce({ data: mockData });

    const result = await postChatMessage("room-abc", "Hi there", "sender-1");

    expect(mockPost).toHaveBeenCalledWith("/chat/room-abc", {
      message: "Hi there",
      sender: "sender-1",
    });
    expect(result).toEqual(mockData);
  });

  it("surfaces a 500 error", async () => {
    const serverError = Object.assign(new Error("Request failed with status code 500"), {
      response: { status: 500, data: { message: "Internal Server Error" } },
    });
    mockPost.mockRejectedValueOnce(serverError);

    await expect(postChatMessage("room-abc", "Hi", "sender-1")).rejects.toThrow(
      "Request failed with status code 500"
    );
  });

  it("surfaces a 401 error (session cleared scenario)", async () => {
    const authError = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401, data: { message: "Unauthorized" } },
    });
    mockPost.mockRejectedValueOnce(authError);

    await expect(postChatMessage("room-abc", "Hi", "sender-1")).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});
