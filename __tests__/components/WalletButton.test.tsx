import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletButton from "@/components/WalletButton";

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    publicKey: mockPublicKey,
    connect: mockConnect,
    disconnect: mockDisconnect,
    isConnecting: false,
  }),
}));

let mockPublicKey: string | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockPublicKey = null;
});

describe("WalletButton — disconnected", () => {
  it('renders "Connect" text', () => {
    render(<WalletButton />);
    expect(screen.getByRole("button")).toHaveTextContent("Connect Wallet");
  });

  it("calls connect() when clicked", async () => {
    render(<WalletButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });
});

describe("WalletButton — connected", () => {
  beforeEach(() => {
    mockPublicKey = "GABCDEFGHIJKLMNOP1234";
  });

  it("shows truncated wallet address", () => {
    render(<WalletButton />);
    expect(screen.getByRole("button")).toHaveTextContent("GABC…1234");
  });

  it("calls disconnect() when clicked", async () => {
    render(<WalletButton />);
    await userEvent.click(screen.getByRole("button"));
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
