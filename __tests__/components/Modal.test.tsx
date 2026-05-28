import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Modal from "@/components/ui/Modal";

function renderModal(isOpen: boolean, onClose = jest.fn()) {
  return render(
    <Modal isOpen={isOpen} onClose={onClose}>
      <button>First</button>
      <button>Second</button>
      <button>Last</button>
    </Modal>
  );
}

describe("Modal", () => {
  describe("visibility", () => {
    it("renders children when isOpen is true", () => {
      renderModal(true);
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.getByText("Last")).toBeInTheDocument();
    });

    it("renders nothing when isOpen is false", () => {
      renderModal(false);
      expect(screen.queryByText("First")).not.toBeInTheDocument();
      expect(screen.queryByText("Second")).not.toBeInTheDocument();
    });
  });

  describe("backdrop click", () => {
    it("calls onClose when the outer backdrop wrapper is clicked", async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={onClose}>
          <button>Inside</button>
        </Modal>
      );

      // The outermost div is the backdrop — click it directly via fireEvent
      // userEvent.click on the backdrop overlay (fixed inset-0 wrapper)
      const backdrop = screen
        .getByText("Inside")
        .closest('[class*="fixed"]') as HTMLElement;

      await user.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT call onClose when clicking inside the modal content panel", async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={onClose}>
          <button>Inside</button>
        </Modal>
      );

      await user.click(screen.getByText("Inside"));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("keyboard — Escape key", () => {
    it("calls onClose when Escape is pressed", async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      renderModal(true, onClose);

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT call onClose for other keys", async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      renderModal(true, onClose);

      await user.keyboard("{Enter}");
      await user.keyboard("a");

      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not attach keydown listener when isOpen is false", async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      renderModal(false, onClose);

      await user.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("focus trap", () => {
    it("Tab key cycles focus within the modal and does not leave", async () => {
      const user = userEvent.setup();

      renderModal(true);

      const [first, second, last] = screen.getAllByRole("button");

      // Focus the first button explicitly
      first.focus();
      expect(document.activeElement).toBe(first);

      // Tab → second
      await user.tab();
      expect(document.activeElement).toBe(second);

      // Tab → last
      await user.tab();
      expect(document.activeElement).toBe(last);

      // Tab again — focus must NOT leave the modal
      await user.tab();
      const focusedElement = document.activeElement as HTMLElement;
      const modalRoot = first.closest('[class*="relative"]') as HTMLElement;
      expect(modalRoot.contains(focusedElement)).toBe(true);
    });

    it("Shift+Tab cycles focus backwards within the modal", async () => {
      const user = userEvent.setup();

      renderModal(true);

      const [first, , last] = screen.getAllByRole("button");

      last.focus();
      expect(document.activeElement).toBe(last);

      await user.tab({ shift: true });
      const focusedElement = document.activeElement as HTMLElement;
      const modalRoot = first.closest('[class*="relative"]') as HTMLElement;
      expect(modalRoot.contains(focusedElement)).toBe(true);
    });
  });

  describe("body scroll lock", () => {
    it("sets body overflow to hidden when modal opens", () => {
      renderModal(true);
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores body overflow when modal closes", () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={jest.fn()}>
          <span>content</span>
        </Modal>
      );

      expect(document.body.style.overflow).toBe("hidden");

      rerender(
        <Modal isOpen={false} onClose={jest.fn()}>
          <span>content</span>
        </Modal>
      );

      expect(document.body.style.overflow).toBe("unset");
    });
  });
});
