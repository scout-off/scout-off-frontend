import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MilestoneTimeline from '@/components/player/MilestoneTimeline';
import type { Milestone } from '@/types';

const MS: Milestone[] = [
  {
    id: 'm1',
    description: 'KYC verified',
    evidenceHash: 'Qm1',
    validator: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ12345678901234567890123456',
    timestamp: 1_700_000_000,
  },
  {
    id: 'm2',
    description: 'Scored 5 goals',
    evidenceHash: 'Qm2',
    validator: 'GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ56',
    timestamp: 1_710_000_000,
  },
  {
    id: 'm3',
    description: 'Trial offer logged',
    evidenceHash: 'Qm3',
    validator: 'GKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK56',
    timestamp: 1_720_000_000,
  },
];

describe('MilestoneTimeline — renders all four level nodes', () => {
  it('renders four list items', () => {
    render(<MilestoneTimeline milestones={[]} currentLevel={0} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('shows all four level names', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={3} />);
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(screen.getByText('Verified Identity')).toBeInTheDocument();
    expect(screen.getByText('Performance Milestones')).toBeInTheDocument();
    expect(screen.getByText('Elite Tier')).toBeInTheDocument();
  });
});

describe('MilestoneTimeline — completed level nodes', () => {
  it('completed nodes have filled colour class from NODE_COLOUR', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    // Level 0 button should have bg-gray-600 (completed)
    const btn0 = screen.getByRole('button', { name: /Unverified/i });
    expect(btn0.className).toMatch(/bg-gray-600/);
  });

  it('completed level 1 node has bg-blue-400', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    const btn1 = screen.getByRole('button', { name: /Verified Identity/i });
    expect(btn1.className).toMatch(/bg-blue-400/);
  });

  it('completed level 2 node has bg-amber-400', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    const btn2 = screen.getByRole('button', {
      name: /Performance Milestones/i,
    });
    expect(btn2.className).toMatch(/bg-amber-400/);
  });

  it('shows achievement date for completed levels with milestones', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    // Timestamp 1_700_000_000 → a real date string should be in the doc
    const dates = document.querySelectorAll('time');
    expect(dates.length).toBeGreaterThan(0);
  });
});

describe('MilestoneTimeline — current level node', () => {
  it('renders a pulse-ring element for the current level', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    expect(screen.getByTestId('pulse-ring')).toBeInTheDocument();
  });

  it('pulse-ring has animate-ping class', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={1} />);
    expect(screen.getByTestId('pulse-ring')).toHaveClass('animate-ping');
  });
});

describe('MilestoneTimeline — future level nodes', () => {
  it('future node does not have a filled colour class', () => {
    render(<MilestoneTimeline milestones={[]} currentLevel={0} />);
    // Level 3 is future; should have border-gray-600 (empty style)
    const btn3 = screen.getByRole('button', { name: /Elite Tier/i });
    expect(btn3.className).toMatch(/border-gray-600/);
    expect(btn3.className).not.toMatch(/bg-emerald-400/);
  });

  it('future nodes show "Not yet reached" instead of a date', () => {
    render(<MilestoneTimeline milestones={[]} currentLevel={0} />);
    const notYet = screen.getAllByText('Not yet reached');
    expect(notYet.length).toBeGreaterThanOrEqual(1);
  });

  it('no <time> elements exist for future levels', () => {
    render(<MilestoneTimeline milestones={[]} currentLevel={0} />);
    // With currentLevel=0 and no milestones, no dates should appear
    expect(document.querySelectorAll('time')).toHaveLength(0);
  });
});

describe('MilestoneTimeline — expand/collapse toggle', () => {
  it('expanded panel is not shown initially', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    expect(
      screen.queryByRole('region', { name: /Details for Unverified/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking a node opens its detail panel', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    fireEvent.click(screen.getByRole('button', { name: /Unverified/i }));
    expect(
      screen.getByRole('region', { name: /Details for Unverified/i }),
    ).toBeInTheDocument();
  });

  it('clicking the same node again closes the panel', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    const btn = screen.getByRole('button', { name: /Unverified/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(
      screen.queryByRole('region', { name: /Details for Unverified/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking a different node closes the previous panel', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    fireEvent.click(screen.getByRole('button', { name: /Unverified/i }));
    fireEvent.click(screen.getByRole('button', { name: /Verified Identity/i }));
    expect(
      screen.queryByRole('region', { name: /Details for Unverified/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Details for Verified Identity/i }),
    ).toBeInTheDocument();
  });

  it('expanded milestone panel shows description and truncated validator', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    fireEvent.click(screen.getByRole('button', { name: /Verified Identity/i }));
    expect(screen.getByText('KYC verified')).toBeInTheDocument();
    // truncated: first 8 chars + … + last 4
    expect(screen.getByText(/GABCDEFG/)).toBeInTheDocument();
  });

  it('aria-expanded is false before click and true after', () => {
    render(<MilestoneTimeline milestones={MS} currentLevel={2} />);
    const btn = screen.getByRole('button', { name: /Unverified/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('MilestoneTimeline — milestone information accuracy', () => {
  it('does not mutate the input milestones array', () => {
    const original = [...MS];
    render(<MilestoneTimeline milestones={MS} currentLevel={3} />);
    expect(MS).toEqual(original);
  });
});
