import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TransactionStatus from "@/components/ui/TransactionStatus";

describe("TransactionStatus", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders nothing when status is null", () => {
    const { container } = render(<TransactionStatus status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders pending state with spinner and message", () => {
    render(<TransactionStatus status="pending" />);
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Submitting transaction…")).toBeInTheDocument();
    // Spinner has aria-label="Loading"
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders success state with confirmation text", () => {
    render(<TransactionStatus status="success" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Transaction confirmed.")).toBeInTheDocument();
  });

  it("renders success state with explorer link for testnet", () => {
    process.env.NEXT_PUBLIC_NETWORK = "testnet";
    const hash = "abc123";
    render(<TransactionStatus status="success" txHash={hash} />);
    const link = screen.getByRole("link", { name: /view transaction on stellar expert/i });
    expect(link).toHaveAttribute("href", `https://stellar.expert/explorer/testnet/tx/${hash}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders success state with explorer link for mainnet", () => {
    process.env.NEXT_PUBLIC_NETWORK = "mainnet";
    const hash = "def456";
    render(<TransactionStatus status="success" txHash={hash} />);
    const link = screen.getByRole("link", { name: /view transaction on stellar expert/i });
    expect(link).toHaveAttribute("href", `https://stellar.expert/explorer/mainnet/tx/${hash}`);
  });

  it("renders success state without explorer link when txHash is absent", () => {
    render(<TransactionStatus status="success" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders error state with provided error message", () => {
    render(<TransactionStatus status="error" error="Insufficient balance" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
  });

  it("renders error state with fallback message when error is undefined", () => {
    render(<TransactionStatus status="error" />);
    expect(screen.getByText("Transaction failed.")).toBeInTheDocument();
  });

  it("calls onHide after 8 seconds on success", () => {
    const onHide = jest.fn();
    render(<TransactionStatus status="success" onHide={onHide} />);
    expect(onHide).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("does not call onHide before 8 seconds", () => {
    const onHide = jest.fn();
    render(<TransactionStatus status="success" onHide={onHide} />);
    act(() => {
      jest.advanceTimersByTime(7999);
    });
    expect(onHide).not.toHaveBeenCalled();
  });

  it("respects custom autoHideMs", () => {
    const onHide = jest.fn();
    render(<TransactionStatus status="success" autoHideMs={3000} onHide={onHide} />);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("clears timer on unmount to prevent memory leaks", () => {
    const onHide = jest.fn();
    const { unmount } = render(<TransactionStatus status="success" onHide={onHide} />);
    unmount();
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(onHide).not.toHaveBeenCalled();
  });

  it("does not start auto-hide timer for pending state", () => {
    const onHide = jest.fn();
    render(<TransactionStatus status="pending" onHide={onHide} />);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(onHide).not.toHaveBeenCalled();
  });

  it("does not start auto-hide timer for error state", () => {
    const onHide = jest.fn();
    render(<TransactionStatus status="error" error="oops" onHide={onHide} />);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(onHide).not.toHaveBeenCalled();
  });
});
