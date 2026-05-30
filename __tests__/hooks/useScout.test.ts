import { renderHook, act } from "@testing-library/react";
import { useScout } from "@/hooks/useScout";
import { filterPlayers } from "@/lib/contract";
import type { Player } from "@/types";

jest.mock("@/lib/contract", () => ({
  filterPlayers: jest.fn(),
}));

const mockedFilterPlayers = filterPlayers as jest.MockedFunction<typeof filterPlayers>;

const mockPlayers: Player[] = [
  {
    id: "player-1",
    wallet: "GABC123",
    vitals: { name: "Test Player 1", age: 20, position: "ST", region: "Africa", nationality: "Nigerian" },
    ipfsHash: "Qm123",
    progressLevel: 2,
    milestones: [],
    createdAt: 1234567890,
  },
];

describe("useScout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("calls filterPlayers with the correct filter arguments", async () => {
    mockedFilterPlayers.mockResolvedValue(mockPlayers);
    
    const { result } = renderHook(() => useScout({ region: "Africa", position: "ST", minLevel: 2 }));
    
    act(() => jest.advanceTimersByTime(300));
    
    await act(async () => {});
    
    expect(mockedFilterPlayers).toHaveBeenCalledWith("Africa", "ST", 2);
    expect(result.current.players).toEqual(mockPlayers);
  });

  it("returns an empty array when no players match", async () => {
    mockedFilterPlayers.mockResolvedValue([]);
    
    const { result } = renderHook(() => useScout({ region: "Unknown" }));
    
    act(() => jest.advanceTimersByTime(300));
    
    await act(async () => {});
    
    expect(result.current.players).toEqual([]);
  });

  it("debounces filter changes", async () => {
    mockedFilterPlayers.mockResolvedValue(mockPlayers);
    
    const { result } = renderHook(() => useScout());
    
    act(() => result.current.setFilter({ region: "Africa" }));
    expect(mockedFilterPlayers).not.toHaveBeenCalled();
    
    act(() => jest.advanceTimersByTime(200));
    expect(mockedFilterPlayers).not.toHaveBeenCalled();
    
    act(() => result.current.setFilter({ region: "Europe" }));
    act(() => jest.advanceTimersByTime(300));
    
    await act(async () => {});
    
    expect(mockedFilterPlayers).toHaveBeenCalledTimes(1);
    expect(mockedFilterPlayers).toHaveBeenCalledWith("Europe", "", 0);
  });

  it("surfaces ContractPaused error in error state", async () => {
    const testError = new Error("ContractPaused");
    mockedFilterPlayers.mockRejectedValue(testError);
    
    const { result } = renderHook(() => useScout());
    
    act(() => jest.advanceTimersByTime(300));
    
    await act(async () => {});
    
    expect(result.current.error).toBe("ContractPaused");
    expect(result.current.players).toEqual([]);
  });
});

