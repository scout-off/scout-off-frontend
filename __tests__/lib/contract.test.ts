import { getPlayer, filterPlayers, getValidators, getSubscription } from "@/lib/contract";
import { rpc } from "@/lib/stellar";
import { scValToNative, nativeToScVal } from "@stellar/stellar-sdk";
import type { Player, ValidatorInfo, Subscription } from "@/types";

jest.mock("@/lib/stellar", () => ({
  rpc: {
    simulateTransaction: jest.fn(),
  },
  NETWORK: "TESTNET",
  BASE_FEE: "100",
}));

jest.mock("@stellar/stellar-sdk", () => ({
  ...jest.requireActual("@stellar/stellar-sdk"),
  scValToNative: jest.fn(),
  nativeToScVal: jest.fn((val: any, opts?: any) => `scVal_${val}`),
  Contract: jest.fn(),
  Account: jest.fn(),
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnThis(),
  })),
}));

const mockedRpc = rpc as jest.Mocked<typeof rpc>;
const mockedScValToNative = scValToNative as jest.MockedFunction<typeof scValToNative>;

describe("contract read functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getPlayer() deserialises the contract response into a Player object", async () => {
    // Arrange
    const mockPlayer: Player = {
      id: "player123",
      wallet: "GABC123",
      vitals: { name: "Test Player", age: 25, position: "ST", region: "Africa", nationality: "Nigerian" },
      ipfsHash: "Qm123",
      progressLevel: 2,
      milestones: [],
      createdAt: 1234567890,
    };
    mockedRpc.simulateTransaction.mockResolvedValue({
      result: { retval: "mockScVal" },
    } as any);
    mockedScValToNative.mockReturnValue(mockPlayer);

    // Act
    const result = await getPlayer("player123");

    // Assert
    expect(mockedRpc.simulateTransaction).toHaveBeenCalled();
    expect(mockedScValToNative).toHaveBeenCalledWith("mockScVal");
    expect(result).toEqual(mockPlayer);
  });

  test("filterPlayers() passes region, position, and minLevel args correctly", async () => {
    // Arrange
    const mockPlayers: Player[] = [
      { id: "p1", wallet: "G1", vitals: { name: "P1", age: 20, position: "ST", region: "Africa", nationality: "Nigerian" }, ipfsHash: "Q1", progressLevel: 2, milestones: [], createdAt: 123 },
    ];
    mockedRpc.simulateTransaction.mockResolvedValue({ result: { retval: "playersScVal" } } as any);
    mockedScValToNative.mockReturnValue(mockPlayers);

    // Act
    const result = await filterPlayers("Africa", "ST", 2);

    // Assert
    expect(mockedRpc.simulateTransaction).toHaveBeenCalled();
    expect(mockedScValToNative).toHaveBeenCalledWith("playersScVal");
    expect(result).toEqual(mockPlayers);
  });

  test("getValidators() returns an array of ValidatorInfo objects", async () => {
    // Arrange
    const mockValidators: ValidatorInfo[] = [
      { address: "GVAL1", addedAt: 123456, addedBy: "GADMIN" },
      { address: "GVAL2", addedAt: 789012, addedBy: "GADMIN" },
    ];
    mockedRpc.simulateTransaction.mockResolvedValue({ result: { retval: "validatorsScVal" } } as any);
    mockedScValToNative.mockReturnValue(mockValidators);

    // Act
    const result = await getValidators();

    // Assert
    expect(mockedRpc.simulateTransaction).toHaveBeenCalled();
    expect(mockedScValToNative).toHaveBeenCalledWith("validatorsScVal");
    expect(result).toEqual(mockValidators);
  });

  test("getSubscription() returns null for a scout with no subscription", async () => {
    // Arrange
    mockedRpc.simulateTransaction.mockResolvedValue({ result: { retval: "nullScVal" } } as any);
    mockedScValToNative.mockReturnValue(null);

    // Act
    const result = await getSubscription("GSCOUT123");

    // Assert
    expect(mockedRpc.simulateTransaction).toHaveBeenCalled();
    expect(mockedScValToNative).toHaveBeenCalledWith("nullScVal");
    expect(result).toBeNull();
  });
});
