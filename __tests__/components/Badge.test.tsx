import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Badge from "@/components/ui/Badge";

describe("Badge", () => {
  describe("label rendering", () => {
    it("renders the correct label text for level0 variant", () => {
      render(<Badge variant="level0" label="Unverified" />);
      expect(screen.getByText("Unverified")).toBeInTheDocument();
    });

    it("renders the correct label text for level1 variant", () => {
      render(<Badge variant="level1" label="Verified Identity" />);
      expect(screen.getByText("Verified Identity")).toBeInTheDocument();
    });

    it("renders the correct label text for level2 variant", () => {
      render(<Badge variant="level2" label="Performance Milestones" />);
      expect(screen.getByText("Performance Milestones")).toBeInTheDocument();
    });

    it("renders the correct label text for level3 variant", () => {
      render(<Badge variant="level3" label="Elite Tier" />);
      expect(screen.getByText("Elite Tier")).toBeInTheDocument();
    });

    it("renders the correct label text for position variant", () => {
      render(<Badge variant="position" label="Forward" />);
      expect(screen.getByText("Forward")).toBeInTheDocument();
    });

    it("renders the correct label text for region variant", () => {
      render(<Badge variant="region" label="Europe" />);
      expect(screen.getByText("Europe")).toBeInTheDocument();
    });
  });

  describe("variant colour classes", () => {
    it("applies correct Tailwind colour classes for level0", () => {
      render(<Badge variant="level0" label="level0" />);
      const el = screen.getByText("level0");
      expect(el).toHaveClass("bg-gray-100");
      expect(el).toHaveClass("text-gray-800");
    });

    it("applies correct Tailwind colour classes for level1", () => {
      render(<Badge variant="level1" label="level1" />);
      const el = screen.getByText("level1");
      expect(el).toHaveClass("bg-blue-100");
      expect(el).toHaveClass("text-blue-800");
    });

    it("applies correct Tailwind colour classes for level2", () => {
      render(<Badge variant="level2" label="level2" />);
      const el = screen.getByText("level2");
      expect(el).toHaveClass("bg-yellow-100");
      expect(el).toHaveClass("text-yellow-800");
    });

    it("applies correct Tailwind colour classes for level3", () => {
      render(<Badge variant="level3" label="level3" />);
      const el = screen.getByText("level3");
      expect(el).toHaveClass("bg-green-100");
      expect(el).toHaveClass("text-green-800");
    });
  });

  describe("inline element", () => {
    it("renders as a <span> (inline element)", () => {
      render(<Badge variant="level1" label="Inline" />);
      const el = screen.getByText("Inline");
      expect(el.tagName).toBe("SPAN");
    });

    it("has inline-flex display class", () => {
      render(<Badge variant="level1" label="InlineFlex" />);
      const el = screen.getByText("InlineFlex");
      expect(el).toHaveClass("inline-flex");
    });
  });

  describe("size classes", () => {
    it("sm size applies text-xs class", () => {
      render(<Badge variant="level0" label="Small" size="sm" />);
      expect(screen.getByText("Small")).toHaveClass("text-xs");
    });

    it("md size applies text-sm class", () => {
      render(<Badge variant="level0" label="Medium" size="md" />);
      expect(screen.getByText("Medium")).toHaveClass("text-sm");
    });

    it("sm and md sizes produce different padding classes", () => {
      const { rerender } = render(<Badge variant="level0" label="SizeTest" size="sm" />);
      const sm = screen.getByText("SizeTest");
      expect(sm).toHaveClass("px-2.5");

      rerender(<Badge variant="level0" label="SizeTest" size="md" />);
      const md = screen.getByText("SizeTest");
      expect(md).toHaveClass("px-3");
    });

    it("defaults to sm size when no size prop is provided", () => {
      render(<Badge variant="level0" label="Default" />);
      expect(screen.getByText("Default")).toHaveClass("text-xs");
    });
  });

  describe("accessibility", () => {
    it("has aria-label matching the label prop", () => {
      render(<Badge variant="region" label="Region" />);
      const el = screen.getByText("Region");
      expect(el).toHaveAttribute("aria-label", "Region");
    });

    it("has role=status", () => {
      render(<Badge variant="position" label="Position" />);
      const el = screen.getByText("Position");
      expect(el).toHaveAttribute("role", "status");
    });

    it("has no undefined or bracket artifacts in className", () => {
      render(<Badge variant="level2" label="Clean" />);
      const el = screen.getByText("Clean");
      expect(el.className).not.toMatch(/undefined|\[|\]/);
    });
  });
});
