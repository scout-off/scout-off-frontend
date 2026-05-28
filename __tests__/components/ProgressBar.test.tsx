import { render } from "@testing-library/react";
import ProgressBar from "@/components/ProgressBar";
import type { ProgressLevel } from "@/types";

const cases: { level: ProgressLevel; width: string }[] = [
  { level: 0, width: "0%" },
  { level: 1, width: "33.333333333333336%" },
  { level: 2, width: "66.66666666666667%" },
  { level: 3, width: "100%" },
];

describe("ProgressBar", () => {
  cases.forEach(({ level, width }) => {
    it(`level ${level}: renders bar at ${width} width`, () => {
      const { container } = render(<ProgressBar level={level} />);
      const bar = container.querySelector(".bg-brand-green.h-full") as HTMLElement;
      expect(bar.style.width).toBe(width);
    });

    it(`level ${level}: bar has bg-brand-green colour class`, () => {
      const { container } = render(<ProgressBar level={level} />);
      const bar = container.querySelector(".h-full");
      expect(bar).toHaveClass("bg-brand-green");
    });

    it(`level ${level}: aria-valuenow is ${level}`, () => {
      const { container } = render(<ProgressBar level={level} />);
      const bar = container.querySelector(".h-full") as HTMLElement;
      expect(bar).toHaveAttribute("aria-valuenow", String(level));
    });
  });
});
