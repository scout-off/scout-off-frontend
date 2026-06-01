import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ApproveForm from "@/components/validator/ApproveForm";
import { useWallet } from "@/hooks/useWallet";
import { useValidator } from "@/hooks/useValidator";
import { getPlayer } from "@/lib/contract";
import type { Player } from "@/types";

jest.mock("@/hooks/useWallet", () => ({
  useWallet: jest.fn(),
}));

jest.mock("@/hooks/useValidator", () => ({
  useValidator: jest.fn(),
}));

jest.mock("@/lib/contract", () => ({
  getPlayer: jest.fn(),
}));

const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockedUseValidator = useValidator as jest.MockedFunction<typeof useValidator>;
const mockedGetPlayer = getPlayer as jest.MockedFunction<typeof getPlayer>;

const player: Player = {
  id: "player-1",
  wallet: "GABC123PUBLICKEY",
  vitals: {
    name: "Test Player",
    age: 20,
    position: "Forward",
    region: "West Africa",
    nationality: "Nigerian",
  },
  ipfsHash: "Qmabcdef1234567890abcdef1234567890abcdef12",
  progressLevel: 0,
  milestones: [],
  createdAt: 1234567890,
};

function renderComponent(
  isValidator: boolean = true,
  onSuccess: () => void = jest.fn()
) {
  mockedUseWallet.mockReturnValue({
    publicKey: "GVALIDATORPUBLICKEY",
    isAuthenticated: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signAndSubmit: jest.fn(),
  });

  mockedUseValidator.mockReturnValue({
    isValidator,
    checking: false,
    approveMilestone: jest.fn(),
    revokeMilestone: jest.fn(),
    loading: false,
    error: null,
  });

  return render(<ApproveForm onSuccess={onSuccess} />);
}

describe("ApproveForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows not a validator message when isValidator=false", () => {
    renderComponent(false);
    expect(screen.getByText("Not a validator")).toBeInTheDocument();
  });

  it("displays the form when isValidator=true", () => {
    renderComponent(true);
    expect(screen.getByText("Approve Milestone")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter player ID")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe the player's achievement/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://example.com/evidence")).toBeInTheDocument();
  });

  it("shows validation error for invalid evidence URL", async () => {
    renderComponent(true);
    const evidenceUrlInput = screen.getByPlaceholderText("https://example.com/evidence");
    
    fireEvent.change(evidenceUrlInput, { target: { value: "invalid-url" } });
    
    expect(await screen.findByText("Evidence URL must be a valid http/https URL")).toBeInTheDocument();
  });

  it("calls approveMilestone with correct arguments when submitting valid data", async () => {
    const approveMilestone = jest.fn().mockResolvedValue("mock-xdr");
    const signAndSubmit = jest.fn().mockResolvedValue({});
    const onSuccess = jest.fn();

    mockedUseValidator.mockReturnValue({
      isValidator: true,
      checking: false,
      approveMilestone,
      revokeMilestone: jest.fn(),
      loading: false,
      error: null,
    });

    mockedUseWallet.mockReturnValue({
      publicKey: "GVALIDATORPUBLICKEY",
      isAuthenticated: true,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signAndSubmit,
    });

    render(<ApproveForm onSuccess={onSuccess} />);

    const playerIdInput = screen.getByPlaceholderText("Enter player ID");
    const descriptionInput = screen.getByPlaceholderText(/Describe the player's achievement/i);
    const evidenceUrlInput = screen.getByPlaceholderText("https://example.com/evidence");
    const submitButton = screen.getByRole("button", { name: /Approve Milestone/i });

    fireEvent.change(playerIdInput, { target: { value: "player-1" } });
    fireEvent.change(descriptionInput, { target: { value: "Test milestone" } });
    fireEvent.change(evidenceUrlInput, { target: { value: "https://example.com/evidence" } });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(approveMilestone).toHaveBeenCalledWith("player-1", "Test milestone");
    expect(signAndSubmit).toHaveBeenCalledWith("mock-xdr");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
