import { render, screen } from "@testing-library/react";
import Spinner from "@/components/ui/Spinner";

describe("Spinner", () => {
  it("renders without throwing", () => {
    expect(() => render(<Spinner />)).not.toThrow();
  });

  it("has role=status for screen reader accessibility", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label for screen reader accessibility", () => {
    render(<Spinner />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("renders with sm size", () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toHaveClass("h-4", "w-4");
  });

  it("renders with md size (default)", () => {
    render(<Spinner size="md" />);
    expect(screen.getByRole("status")).toHaveClass("h-6", "w-6");
  });

  it("renders with lg size", () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toHaveClass("h-8", "w-8");
  });

  it("snapshot", () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
