import { render, screen, fireEvent } from "@testing-library/react";
import type { Player } from "@/types";
import PlayerCard from "@/components/PlayerCard";
import { PROGRESS_LABELS } from "@/types";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: jest.fn(() => ({ push: mockPush })),
  usePathname: jest.fn(() => "/"),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

describe("PlayerCard", () => {
  const mockPlayer: Player = {
    id: "player-123",
    wallet: "GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV",
    vitals: {
      name: "Ava Rodriguez",
      age: 21,
      position: "Forward",
      region: "Europe",
      nationality: "Spain",
    },
    ipfsHash: "QmRJzSVrP1bqfSL4E8hKM7bCqYjDG4rMxUhsr5xKFN6sct",
    progressLevel: 2,
    milestones: [
      {
        id: "milestone-1",
        description: "Scored 20 goals in the last season",
        evidenceHash: "QmYwAPJzv5CZsnAzt8auV2Zh6Z7ni1e8jX4rv19rMeS5qD",
        validator: "GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV",
        timestamp: 1700000000,
      },
    ],
    createdAt: 1670000000,
  };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = "https://ipfs.example.com/ipfs";
  });

  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the player name", () => {
    render(<PlayerCard player={mockPlayer} />);

    expect(
      screen.getByRole("heading", { level: 3, name: mockPlayer.vitals.name })
    ).toBeInTheDocument();
  });

  it("renders position and region in the details text", () => {
    render(<PlayerCard player={mockPlayer} />);

    expect(
      screen.getByText(`${mockPlayer.vitals.position} · ${mockPlayer.vitals.region}`)
    ).toBeInTheDocument();
  });

  it("renders the card as an article with a descriptive aria-label", () => {
    render(<PlayerCard player={mockPlayer} />);

    const levelLabel = PROGRESS_LABELS[mockPlayer.progressLevel];
    const card = screen.getByRole("article");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute(
      "aria-label",
      `${mockPlayer.vitals.name}, ${mockPlayer.vitals.position}, Level ${mockPlayer.progressLevel} – ${levelLabel}`
    );
  });

  it("card is focusable via keyboard (tabIndex=0)", () => {
    render(<PlayerCard player={mockPlayer} />);

    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("renders the progress level badge with a descriptive aria-label", () => {
    render(<PlayerCard player={mockPlayer} />);

    const levelLabel = PROGRESS_LABELS[mockPlayer.progressLevel];
    const badge = screen.getByRole("status", {
      name: `Level ${mockPlayer.progressLevel}: ${levelLabel}`,
    });
    expect(badge).toBeInTheDocument();
  });

  it("navigates to the player profile when Enter is pressed", () => {
    render(<PlayerCard player={mockPlayer} />);

    const card = screen.getByRole("article");
    fireEvent.keyDown(card, { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith(`/player/${mockPlayer.id}`);
  });

  it("navigates to the player profile when Space is pressed", () => {
    render(<PlayerCard player={mockPlayer} />);

    const card = screen.getByRole("article");
    fireEvent.keyDown(card, { key: " " });

    expect(mockPush).toHaveBeenCalledWith(`/player/${mockPlayer.id}`);
  });

  it("navigates to the player profile when clicked", () => {
    render(<PlayerCard player={mockPlayer} />);

    const card = screen.getByRole("article");
    fireEvent.click(card);

    expect(mockPush).toHaveBeenCalledWith(`/player/${mockPlayer.id}`);
  });

  it("renders the player image as decorative when an IPFS hash is present", () => {
    render(<PlayerCard player={mockPlayer} />);

    // Image is decorative (alt="") so it won't appear in the accessibility tree by name.
    // We verify it exists in the DOM with the correct src.
    const images = document.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute(
      "src",
      `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/${mockPlayer.ipfsHash}`
    );
    expect(images[0]).toHaveAttribute("alt", "");
  });

  it("shows no image when no IPFS hash is set", () => {
    render(<PlayerCard player={{ ...mockPlayer, ipfsHash: "" }} />);

    expect(document.querySelectorAll("img")).toHaveLength(0);
  });
});
