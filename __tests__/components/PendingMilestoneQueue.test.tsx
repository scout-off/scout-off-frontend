import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PendingMilestoneQueue from "@/components/validator/PendingMilestoneQueue";

jest.mock("@/components/validator/ApproveForm", () => ({
  __esModule: true,
  default: ({ initialPlayerId }: { initialPlayerId: string }) => (
    <div data-testid="approve-form">Approve {initialPlayerId}</div>
  ),
}));

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as any;
});

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockClear();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

type PendingMilestoneItem = {
  playerId: string;
  playerName: string;
  progressLevel: number;
  lastMilestoneTimestamp: number;
};

function mockFetchResponseOnce(data: PendingMilestoneItem[] = [], ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    statusText: ok ? "OK" : "Server Error",
    json: async () => data,
  });
}

describe("PendingMilestoneQueue", () => {
  it("loads the queue on mount", async () => {
    mockFetchResponseOnce([
      {
        playerId: "player-1",
        playerName: "Player One",
        progressLevel: 2,
        lastMilestoneTimestamp: 1700000000,
      },
    ]);

    render(<PendingMilestoneQueue />);

    expect(screen.getByRole("status", { name: /Loading/i })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Player One")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/validator/queue", { method: "GET" });
  });

  it("auto-refreshes every 30 seconds", async () => {
    mockFetchResponseOnce([
      {
        playerId: "player-1",
        playerName: "Player One",
        progressLevel: 2,
        lastMilestoneTimestamp: 1700000000,
      },
    ]);
    mockFetchResponseOnce([
      {
        playerId: "player-1",
        playerName: "Player One",
        progressLevel: 2,
        lastMilestoneTimestamp: 1700000000,
      },
    ]);

    render(<PendingMilestoneQueue />);

    await waitFor(() => expect(screen.getByText("Player One")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(30000);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it("shows a Spinner while loading", () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    render(<PendingMilestoneQueue />);

    expect(screen.getByRole("status", { name: /Loading/i })).toBeInTheDocument();
  });

  it("shows EmptyState when the queue is empty", async () => {
    mockFetchResponseOnce([]);

    render(<PendingMilestoneQueue />);

    await waitFor(() => expect(screen.getByText(/No pending milestones/i)).toBeInTheDocument());
  });

  it("renders player rows correctly", async () => {
    mockFetchResponseOnce([
      {
        playerId: "player-1",
        playerName: "Player One",
        progressLevel: 2,
        lastMilestoneTimestamp: 1700000000,
      },
    ]);

    render(<PendingMilestoneQueue />);

    await waitFor(() => expect(screen.getByText("Player One")).toBeInTheDocument());
    expect(screen.getByText("Performance Milestones")).toBeInTheDocument();
    expect(screen.getByText(new Date(1700000000 * 1000).toLocaleDateString())).toBeInTheDocument();
  });

  it("shows pagination after more than 20 entries", async () => {
    const items = Array.from({ length: 21 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      playerName: `Player ${index + 1}`,
      progressLevel: 1,
      lastMilestoneTimestamp: 1700000000 + index,
    }));
    mockFetchResponseOnce(items);

    render(<PendingMilestoneQueue />);

    await waitFor(() => expect(screen.getByText("Player 1")).toBeInTheDocument());
    expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByText("Player 21")).toBeInTheDocument());
    expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
  });

  it("opens ApproveForm with the correct player ID when Approve is clicked", async () => {
    mockFetchResponseOnce([
      {
        playerId: "player-1",
        playerName: "Player One",
        progressLevel: 2,
        lastMilestoneTimestamp: 1700000000,
      },
    ]);

    render(<PendingMilestoneQueue />);

    await waitFor(() => expect(screen.getByText("Player One")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    expect(await screen.findByTestId("approve-form")).toBeInTheDocument();
    expect(screen.getByText("Approve player-1")).toBeInTheDocument();
  });
});
