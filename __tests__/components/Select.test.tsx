import { render, screen, fireEvent } from "@testing-library/react";
import Select from "@/components/ui/Select";

describe("Select", () => {
  it("renders with a list of options", () => {
    render(
      <Select>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </Select>
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("fires onChange with the selected value when an option is chosen", () => {
    const onChange = jest.fn();
    render(
      <Select onChange={onChange}>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </Select>
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows a default placeholder option", () => {
    render(
      <Select>
        <option value="">Select one</option>
        <option value="a">Option A</option>
      </Select>
    );
    expect(screen.getByText("Select one")).toBeInTheDocument();
  });

  it("renders in disabled state when disabled prop is true", () => {
    render(
      <Select disabled>
        <option value="a">Option A</option>
      </Select>
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("renders with correct id for accessibility", () => {
    render(
      <Select id="region-select">
        <option value="a">Option A</option>
      </Select>
    );
    expect(screen.getByRole("combobox")).toHaveAttribute("id", "region-select");
  });

  it("renders with aria-label for accessibility", () => {
    render(
      <Select aria-label="Region">
        <option value="a">Option A</option>
      </Select>
    );
    expect(screen.getByRole("combobox", { name: "Region" })).toBeInTheDocument();
  });

  it("snapshot", () => {
    const { container } = render(
      <Select label="Position" id="position-select">
        <option value="">All</option>
        <option value="forward">Forward</option>
      </Select>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
