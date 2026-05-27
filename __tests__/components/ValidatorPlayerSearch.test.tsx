import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ValidatorPlayerSearch from "@/components/validator/ValidatorPlayerSearch";
import { getPlayer } from "@/lib/contract";
import type { Player } from "@/types";

jest.mock("@/lib/stellar", () => ({
  rpc: {
    getAccount: jest.fn(),
    prepareTransaction: jest.fn(),
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
  },
  NETWORK: "TESTNET",
  BASE_FEE: "100",
}));

jest.mock("@/lib/contract", () => ({
  getPlayer: jest.fn(),
}));

const mockedGetPlayer = getPlayer as jest.MockedFunction<typeof getPlayer>;

const player: Player = {
  id: "player-1",
  wallet: "GABC123PUBLICKEY",
  vitals: { name: "Test Player", age: 20, position: "Forward", region: "West Africa", nationality: "Nigerian" },
  ipfsHash: "Qmabc123",
  progressLevel: 2,
  milestones: [
    { id: "m1", description: "Scored 5 goals", evidenceHash: "Qmevidence", validator: "GVAL", timestamp: 1700000000 },
  ],
  createdAt: 1234567890,
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); jest.clearAllMocks(); });

function setup(onSelect = jest.fn()) {
  render(<ValidatorPlayerSearch onSelect={onSelect} />);
  return { input: screen.getByRole("textbox"), onSelect };
}

describe("ValidatorPlayerSearch", () => {
  it("searches by player ID and displays the result", async () => {
    mockedGetPlayer.mockResolvedValue(player as any);
    const { input } = setup();

    fireEvent.change(input, { target: { value: "player-1" } });
    act(() => jest.advanceTimersByTime(400));

    await waitFor(() => expect(screen.getByText("Test Player")).toBeInTheDocument());
    expect(mockedGetPlayer).toHaveBeenCalledWith("player-1");
  });

  it("searches by wallet address and displays the result", async () => {
    mockedGetPlayer.mockResolvedValue(player as any);
    const { input } = setup();

    fireEvent.change(input, { target: { value: "GABC123PUBLICKEY" } });
    act(() => jest.advanceTimersByTime(400));

    await waitFor(() => expect(screen.getByText("Test Player")).toBeInTheDocument());
    expect(mockedGetPlayer).toHaveBeenCalledWith("GABC123PUBLICKEY");
  });

  it("renders EmptyState when player is not found", async () => {
    mockedGetPlayer.mockRejectedValue(new Error("not found"));
    const { input } = setup();

    fireEvent.change(input, { target: { value: "unknown-id" } });
    act(() => jest.advanceTimersByTime(400));

    await waitFor(() => expect(screen.getByText("Player not found")).toBeInTheDocument());
  });

  it("calls onSelect with the full Player object when Select is clicked", async () => {
    mockedGetPlayer.mockResolvedValue(player as any);
    const { input, onSelect } = setup();

    fireEvent.change(input, { target: { value: "player-1" } });
    act(() => jest.advanceTimersByTime(400));

    await waitFor(() => screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(player);
  });

  it("debounces the search by 400ms", async () => {
    mockedGetPlayer.mockResolvedValue(player as any);
    const { input } = setup();

    fireEvent.change(input, { target: { value: "p" } });
    act(() => jest.advanceTimersByTime(200));
    expect(mockedGetPlayer).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "player-1" } });
    act(() => jest.advanceTimersByTime(400));

    await waitFor(() => expect(mockedGetPlayer).toHaveBeenCalledTimes(1));
    expect(mockedGetPlayer).toHaveBeenCalledWith("player-1");
  });

  it("ignores stale responses when a newer search supersedes them", async () => {
    let resolveFirst!: (v: any) => void;
    const firstCall = new Promise((res) => { resolveFirst = res; });
    mockedGetPlayer
      .mockReturnValueOnce(firstCall as any)
      .mockResolvedValueOnce(player as any);

    const { input } = setup();

    fireEvent.change(input, { target: { value: "old-query" } });
    act(() => jest.advanceTimersByTime(400));

    fireEvent.change(input, { target: { value: "player-1" } });
    act(() => jest.advanceTimersByTime(400));

    // resolve the first (stale) call with a different player
    const stalePlayer = { ...player, vitals: { ...player.vitals, name: "Stale Player" } };
    await act(async () => { resolveFirst(stalePlayer); });

    await waitFor(() => expect(screen.getByText("Test Player")).toBeInTheDocument());
    expect(screen.queryByText("Stale Player")).not.toBeInTheDocument();
  });

  it("clears input, result, and errors when Clear is clicked", async () => {
    mockedGetPlayer.mockResolvedValue(player as any);
    const { input } = setup();

    fireEvent.change(input, { target: { value: "player-1" } });
    act(() => jest.advanceTimersByTime(400));
    await waitFor(() => screen.getByText("Test Player"));

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(input).toHaveValue("");
    expect(screen.queryByText("Test Player")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });
});
