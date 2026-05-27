import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import IPFSMediaGallery from "../../components/player/IPFSMediaGallery";
import * as ipfs from "../../lib/ipfs";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, fill, unoptimized, placeholder, ...props }: any) => (
    <img src={typeof src === "string" ? src : src?.src} alt={alt} {...props} />
  ),
}));

jest.mock("../../lib/ipfs", () => ({
  ipfsUrl: jest.fn(),
}));

describe("IPFSMediaGallery", () => {
  const origFetch = global.fetch;
  const origPlay = HTMLMediaElement.prototype.play;

  beforeEach(() => {
    jest.resetAllMocks();
    // mock play to avoid DOM exceptions
    HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined) as any;
  });

  afterEach(() => {
    global.fetch = origFetch;
    HTMLMediaElement.prototype.play = origPlay;
  });

  test("renders image items and uses next/image alt text", async () => {
    (ipfs.ipfsUrl as jest.Mock).mockImplementation((cid: string) => `https://example.com/${cid}.jpg`);

    render(<IPFSMediaGallery cids={["cid-image-1"]} />);

    // Wait for image to be rendered
    await waitFor(() => expect(screen.getByAltText(/Player media cid-image-1/)).toBeInTheDocument());
  });

  test("renders video items and starts playback on click", async () => {
    (ipfs.ipfsUrl as jest.Mock).mockImplementation((cid: string) => `https://example.com/${cid}.mp4`);

    // HEAD fetch may not be called (ext detection), but ensure fetch exists
    global.fetch = jest.fn().mockResolvedValue({ ok: true, headers: { get: () => "video/mp4" } } as any);

    render(<IPFSMediaGallery cids={["cid-video-1"]} />);

    // Wait for play button to appear
    const playButton = await screen.findByRole("button", { name: /Play video cid-video-1/ });
    expect(playButton).toBeInTheDocument();

    fireEvent.click(playButton);

    // play should have been called on the video element
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
  });

  test("shows error placeholder when HEAD fails to resolve", async () => {
    (ipfs.ipfsUrl as jest.Mock).mockImplementation((cid: string) => `https://example.com/${cid}`);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, headers: { get: () => null } } as any);

    render(<IPFSMediaGallery cids={["bad-cid"]} />);

    // fallback will render an error placeholder containing the cid
    await waitFor(() => expect(screen.getByText(/Unable to load media/)).toBeInTheDocument());
    expect(screen.getByText(/bad-cid/)).toBeInTheDocument();
  });
});
