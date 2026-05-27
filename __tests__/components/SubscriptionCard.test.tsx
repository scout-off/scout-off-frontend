// Mock Stellar and contract dependencies before importing the component
jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: {
    Server: jest.fn(() => ({})),
  },
  TransactionBuilder: jest.fn(),
  Networks: {
    PUBLIC: {},
    TESTNET: {},
  },
  BASE_FEE: 100,
  Contract: jest.fn(() => ({})),
  Keypair: {
    fromPublicKey: jest.fn(),
  },
}));

jest.mock("@stellar/freighter-api", () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
  signAuthEntry: jest.fn(),
}));

jest.mock("@/lib/stellar", () => ({
  rpc: {},
  NETWORK: {},
  BASE_FEE: 100,
  TransactionBuilder: jest.fn(),
}));

jest.mock("@/lib/contract", () => ({
  getSubscription: jest.fn(),
  buildSubscribe: jest.fn(),
}));

jest.mock("@/context/WalletContext", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
  useWalletContext: jest.fn(() => ({
    publicKey: "GTEST",
    signAndSubmit: jest.fn(),
  })),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => "/"),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

import { render, screen } from "@testing-library/react";
import type { Subscription } from "@/types";
import SubscriptionCard from "@/components/scout/SubscriptionCard";

jest.mock("@/hooks/useSubscription", () => ({
  useSubscription: jest.fn(() => ({
    subscription: null,
    isExpired: false,
    loading: false,
    error: null,
    subscribe: jest.fn(),
  })),
}));

const mockUseSubscription = require("@/hooks/useSubscription").useSubscription;

describe("SubscriptionCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("loading state", () => {
    it("renders Spinner while loading", () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        isExpired: false,
        loading: true,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByRole("status", { name: /loading subscription data/i })).toBeInTheDocument();
      expect(screen.getByTestId("spinner-svg")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders error message when error occurs", () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        isExpired: false,
        loading: false,
        error: "Failed to fetch subscription",
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Failed to fetch subscription")).toBeInTheDocument();
    });

    it("renders fallback message when no subscription and no error", () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to load subscription information")).toBeInTheDocument();
    });
  });

  describe("active subscription", () => {
    it("renders subscription tier and active badge for subscription with > 7 days remaining", () => {
      const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: futureDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("Pro")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("displays formatted expiry date", () => {
      const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "basic",
        expiresAt: futureDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("Expires")).toBeInTheDocument();
      // The formatted date should be in the document
      const expiryText = screen.getByText((content, element) => {
        return element?.textContent?.includes("Expires") ? false : /\w{3}\s\d{1,2},\s\d{4}/.test(content);
      });
      expect(expiryText).toBeInTheDocument();
    });

    it("displays correct days remaining", () => {
      const futureDate = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60; // 15 days
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "elite",
        expiresAt: futureDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("Days Remaining")).toBeInTheDocument();
      // Should show 15 days remaining
      const daysText = screen.getByText((content) => /\d+/.test(content) && content.includes("15"));
      expect(daysText).toBeInTheDocument();
    });

    it("displays all subscription tiers correctly", () => {
      const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      const tiers: Array<{ tier: "basic" | "pro" | "elite"; display: string }> = [
        { tier: "basic", display: "Basic" },
        { tier: "pro", display: "Pro" },
        { tier: "elite", display: "Elite" },
      ];

      tiers.forEach(({ tier, display }) => {
        const { unmount } = render(<SubscriptionCard />);

        mockUseSubscription.mockReturnValue({
          subscription: {
            scout: "GTEST",
            tier,
            expiresAt: futureDate,
          },
          isExpired: false,
          loading: false,
          error: null,
          subscribe: jest.fn(),
        });

        const { rerender } = render(<SubscriptionCard />);
        expect(screen.getByText(display)).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe("expiring soon", () => {
    it("renders warning badge when subscription expires within 7 days", () => {
      const soonDate = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60; // 3 days from now
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: soonDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText(/\d+ days left/)).toBeInTheDocument();
    });

    it("shows exactly 7 days as warning badge", () => {
      const sevenDaysDate = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: sevenDaysDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("7 days left")).toBeInTheDocument();
    });
  });

  describe("expired subscription", () => {
    it("renders Expired badge with error styling when isExpired is true", () => {
      const pastDate = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60; // 10 days ago
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: pastDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: true,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("Expired")).toBeInTheDocument();
      const expiredBadge = screen.getByText("Expired").closest("span");
      expect(expiredBadge).toHaveClass("bg-red-100", "text-red-800");
    });

    it("displays 0 days remaining when expired", () => {
      const pastDate = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: pastDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: true,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      // Find days remaining row
      const daysRemaining = screen.getByText((content) => {
        return content === "0";
      });
      expect(daysRemaining).toBeInTheDocument();
      expect(daysRemaining).toHaveClass("text-red-400");
    });
  });

  describe("navigation", () => {
    it("renders Renew button that links to /scout/subscribe", () => {
      const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: futureDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      const renewButton = screen.getByRole("link", { name: /renew/i });
      expect(renewButton).toHaveAttribute("href", "/scout/subscribe");
    });
  });

  describe("accessibility", () => {
    it("has proper ARIA labels for loading state", () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        isExpired: false,
        loading: true,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByLabelText(/loading subscription data/i)).toBeInTheDocument();
    });

    it("has proper ARIA labels for error state", () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        isExpired: false,
        loading: false,
        error: "Error",
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("has aria-live on status badge for updates", () => {
      const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: futureDate,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      const badge = screen.getByText("Active").closest("span");
      expect(badge).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("edge cases", () => {
    it("handles subscription expiring today", () => {
      const today = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours from now
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: today,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("1 day left")).toBeInTheDocument();
    });

    it("handles subscription expiring in less than 1 day", () => {
      const soonish = Math.floor(Date.now() / 1000) + 6 * 60 * 60; // 6 hours from now
      const subscription: Subscription = {
        scout: "GTEST",
        tier: "pro",
        expiresAt: soonish,
      };

      mockUseSubscription.mockReturnValue({
        subscription,
        isExpired: false,
        loading: false,
        error: null,
        subscribe: jest.fn(),
      });

      render(<SubscriptionCard />);

      expect(screen.getByText("1 day left")).toBeInTheDocument();
    });
  });
});
