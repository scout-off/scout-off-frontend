import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import IPFSMediaGallery, {
  deriveMediaKindFromContentType,
  deriveMediaKindFromPath,
} from "@/components/player/IPFSMediaGallery";
import { ipfsUrl } from "@/lib/ipfs";

async function flushPendingUpdates() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("IPFSMediaGallery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("resolves an image CID and renders a lazy-loaded image", async () => {
    const cid = "QmImageCid";
    const url = ipfsUrl(cid);

    global.fetch = jest.fn((input, init) => {
      expect(input).toBe(url);
      const response = {
        ok: true,
        headers: {
          get: (key: string) => (key === "content-type" ? "image/png" : null),
        },
      };

      return new Promise((resolve) => setTimeout(() => resolve(response as Response), 0));
    }) as jest.Mock;

    render(<IPFSMediaGallery cids={[cid]} />);
    await flushPendingUpdates();

    const image = (await screen.findByAltText("IPFS image 1")) as HTMLImageElement;
    expect(image).toHaveAttribute("src", url);
    expect(image).toHaveAttribute("loading", "lazy");
    expect(global.fetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD" }));
  });

  it("resolves a video CID and renders a play button before playback", async () => {
    const cid = "QmVideoCid";
    const url = ipfsUrl(cid);

    global.fetch = jest.fn((input, init) => {
      expect(input).toBe(url);
      const response = {
        ok: true,
        headers: {
          get: (key: string) => (key === "content-type" ? "video/mp4" : null),
        },
      };

      return new Promise((resolve) => setTimeout(() => resolve(response as Response), 0));
    }) as jest.Mock;

    render(<IPFSMediaGallery cids={[cid]} />);
    await flushPendingUpdates();

    const playButton = await screen.findByRole("button", {
      name: /play IPFS video 1/i,
    });
    expect(playButton).toBeInTheDocument();

    fireEvent.click(playButton);
    await flushPendingUpdates();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /play IPFS video 1/i })).not.toBeInTheDocument();
    });
    expect(document.querySelector("video")).toBeInTheDocument();
  });

  it("shows an error placeholder when a CID fails to resolve", async () => {
    const cid = "QmBadCid";
    const url = ipfsUrl(cid);

    global.fetch = jest.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                ({
                  ok: false,
                  headers: {
                    get: () => null,
                  },
                } as unknown as Response),
              ),
            0,
          ),
        ),
    ) as jest.Mock;

    render(<IPFSMediaGallery cids={[cid]} />);
    await flushPendingUpdates();

    await screen.findByText(/Could not load IPFS media/i);
    expect(global.fetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD" }));
  });

  it("renders the responsive gallery grid with expected CSS classes", () => {
    render(<IPFSMediaGallery cids={[]} />);
    const gallery = screen.getByTestId("ipfs-gallery");

    expect(gallery).toHaveClass("grid");
    expect(gallery.className).toContain("sm:grid-cols-2");
    expect(gallery.className).toContain("lg:grid-cols-3");
  });

  it("derives media kind from content type and file extension correctly", () => {
    expect(deriveMediaKindFromContentType("image/jpeg")).toBe("image");
    expect(deriveMediaKindFromContentType("video/webm; codecs=vp9")).toBe("video");
    expect(deriveMediaKindFromContentType("application/octet-stream")).toBe("unsupported");
    expect(deriveMediaKindFromPath("https://example.com/video.mp4")).toBe("video");
    expect(deriveMediaKindFromPath("asset.png")).toBe("image");
    expect(deriveMediaKindFromPath("QmNoExtensionCid")).toBe("unknown");
  });
});
