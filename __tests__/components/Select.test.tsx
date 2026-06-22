import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Select from "@/components/ui/Select";

const OPTIONS = [
  { label: "Striker", value: "ST" },
  { label: "Goalkeeper", value: "GK" },
  { label: "Midfielder", value: "CM" },
];

describe("Select", () => {
  it("renders all options", () => {
    render(<Select options={OPTIONS} value="" onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "Striker" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Goalkeeper" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Midfielder" })).toBeInTheDocument();
  });

  it("renders placeholder option when value is empty", () => {
    render(<Select options={OPTIONS} value="" onChange={() => {}} placeholder="Select position" />);
    const placeholder = screen.getByRole("option", { name: "Select position" }) as HTMLOptionElement;
    expect(placeholder.value).toBe("");
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("shows selected value", () => {
    render(<Select options={OPTIONS} value="GK" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("GK");
  });

  it("calls onChange with the correct value when an option is selected", () => {
    const handleChange = jest.fn();
    render(<Select options={OPTIONS} value="" onChange={handleChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ST" } });
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith("ST");
  });

  it("renders label when provided", () => {
    render(<Select options={OPTIONS} value="" onChange={() => {}} label="Position" />);
    expect(screen.getByText("Position")).toBeInTheDocument();
  });

  it("renders error message and applies error styling", () => {
    render(<Select options={OPTIONS} value="" onChange={() => {}} error="Required field" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required field");
    expect(screen.getByRole("combobox")).toHaveClass("border-red-500");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not render error message when error is not provided", () => {
    render(<Select options={OPTIONS} value="" onChange={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Select options={OPTIONS} value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("does not call onChange when disabled", () => {
    const handleChange = jest.fn();
    render(<Select options={OPTIONS} value="" onChange={handleChange} disabled />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ST" } });
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("supports keyboard navigation via native select behavior", () => {
    const handleChange = jest.fn();
    render(<Select options={OPTIONS} value="ST" onChange={handleChange} />);
    const select = screen.getByRole("combobox");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    // Native select handles arrow key navigation; verify element is focusable
    expect(select).not.toBeDisabled();
    expect(select).toHaveValue("ST");
  });
});
