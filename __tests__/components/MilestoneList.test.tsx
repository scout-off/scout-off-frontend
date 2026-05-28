import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MilestoneList from "@/components/player/MilestoneList";
import type { Milestone } from "@/types";

const mockMilestones: Milestone[] = [
  {
    id: "m1",
    description: "Scored 20 goals in the last season",
    evidenceHash: "QmEvidence1",
    validator: "GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV",
    timestamp: 1700000000,
  },
  {
    id: "m2",
    description: "Named player of the tournament",
    evidenceHash: "QmEvidence2",
    validator: "GBXYZ1234ABCDEF5678GHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH",
    timestamp: 1710000000,
  },
];

describe("MilestoneList", () => {
  it("renders each milestone's description", () => {
    render(<MilestoneList milestones={mockMilestones} />);

    expect(
      screen.getByText("Scored 20 goals in the last season")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Named player of the tournament")
    ).toBeInTheDocument();
  });

  it("renders each milestone's timestamp formatted as a locale date string", () => {
    render(<MilestoneList milestones={mockMilestones} />);

    const date1 = new Date(1700000000 * 1000).toLocaleDateString();
    const date2 = new Date(1710000000 * 1000).toLocaleDateString();

    expect(screen.getByText(date1)).toBeInTheDocument();
    expect(screen.getByText(date2)).toBeInTheDocument();
  });

  it("truncates the validator address to first 8 chars + ellipsis + last 4 chars", () => {
    render(<MilestoneList milestones={mockMilestones} />);

    const validator1 = mockMilestones[0].validator;
    const expected1 = `${validator1.slice(0, 8)}…${validator1.slice(-4)}`;

    const validator2 = mockMilestones[1].validator;
    const expected2 = `${validator2.slice(0, 8)}…${validator2.slice(-4)}`;

    expect(screen.getByText(expected1)).toBeInTheDocument();
    expect(screen.getByText(expected2)).toBeInTheDocument();
  });

  it("renders EmptyState when milestones array is empty", () => {
    render(<MilestoneList milestones={[]} />);

    expect(screen.getByText("No milestones yet")).toBeInTheDocument();
  });

  it("renders a list item for each milestone", () => {
    render(<MilestoneList milestones={mockMilestones} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(mockMilestones.length);
  });
});
