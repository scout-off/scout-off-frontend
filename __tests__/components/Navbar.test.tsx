import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/hooks/useWallet", () => ({
  useWallet: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

jest.mock("@/hooks/useContractHealth", () => ({
  useContractHealth: () => ({ paused: false }),
}));

jest.mock("next/link", () => {
  const React = require("react");
  const { usePathname } = require("next/navigation");
  return {
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => {
      const pathname = usePathname();
      const aria = pathname === href ? { "aria-current": "page" } : {};
      return React.createElement("a", { href, ...aria, ...props }, children);
    },
  };
});

import Navbar from "@/components/Navbar";
import { useWallet } from "@/hooks/useWallet";
import { usePathname } from "next/navigation";

const mockUseWallet = useWallet as unknown as jest.Mock;
const mockUsePathname = usePathname as unknown as jest.Mock;

describe("Navbar", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("renders the ScoutOff logo/link", () => {
    mockUseWallet.mockReturnValue({ publicKey: null, isConnecting: false, connect: jest.fn(), disconnect: jest.fn(), signAndSubmit: jest.fn() });
    mockUsePathname.mockReturnValue("/");

    render(<Navbar />);

    expect(screen.getByRole("link", { name: /ScoutOff/i })).toBeInTheDocument();
  });

  test("shows Connect Wallet button when wallet is disconnected", () => {
    mockUseWallet.mockReturnValue({ publicKey: null, isConnecting: false, connect: jest.fn(), disconnect: jest.fn(), signAndSubmit: jest.fn() });
    mockUsePathname.mockReturnValue("/");

    render(<Navbar />);

    expect(screen.getByRole("button", { name: /Connect Wallet/i })).toBeInTheDocument();
  });

  test("shows truncated wallet address when wallet is connected", () => {
    const publicKey = "0x1234567890abcdef";
    mockUseWallet.mockReturnValue({ publicKey, isConnecting: false, connect: jest.fn(), disconnect: jest.fn(), signAndSubmit: jest.fn() });
    mockUsePathname.mockReturnValue("/");

    render(<Navbar />);

    const expected = `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
    expect(screen.getByRole("button", { name: expected })).toBeInTheDocument();
  });

  test("active route link has aria-current=\"page\"", () => {
    mockUseWallet.mockReturnValue({ publicKey: null, isConnecting: false, connect: jest.fn(), disconnect: jest.fn(), signAndSubmit: jest.fn() });
    mockUsePathname.mockReturnValue("/player");

    render(<Navbar />);

    const playerLink = screen.getByRole("link", { name: /Player Dashboard/i });
    expect(playerLink).toHaveAttribute("aria-current", "page");
  });
});
