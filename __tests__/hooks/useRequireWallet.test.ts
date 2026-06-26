import { renderHook } from "@testing-library/react";
import { useRequireWallet } from "@/hooks/useRequireWallet";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockWalletContext = {
  isAuthenticated: false,
  isConnecting: false,
};

jest.mock("@/context/WalletContext", () => ({
  useWalletContext: () => mockWalletContext,
}));

describe("useRequireWallet", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockWalletContext.isAuthenticated = false;
    mockWalletContext.isConnecting = false;
  });

  it("redirects to home when unauthenticated and not connecting", () => {
    renderHook(() => useRequireWallet());
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("does not redirect when authenticated", () => {
    mockWalletContext.isAuthenticated = true;
    renderHook(() => useRequireWallet());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not redirect while session restore is in progress", () => {
    mockWalletContext.isConnecting = true;
    renderHook(() => useRequireWallet());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("uses router.replace (not push) to prevent back-navigation", () => {
    renderHook(() => useRequireWallet());
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockReplace).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
  });
});
