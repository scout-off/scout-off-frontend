import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import VideoUpload from "@/components/ui/VideoUpload";
import * as ipfs from "@/lib/ipfs";

jest.mock("@/lib/ipfs", () => ({
  uploadToIPFS: jest.fn(),
}));

const mockUploadToIPFS = ipfs.uploadToIPFS as jest.Mock;

describe("VideoUpload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders file input and upload button area", () => {
    render(<VideoUpload onUpload={jest.fn()} />);
    expect(screen.getByLabelText(/highlight reel/i)).toBeInTheDocument();
  });

  it("shows file name after a video file is selected", async () => {
    mockUploadToIPFS.mockResolvedValue("Qm123");
    const onUpload = jest.fn();
    render(<VideoUpload onUpload={onUpload} />);

    const input = screen.getByLabelText(/highlight reel/i);
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/uploaded: clip\.mp4/i)).toBeInTheDocument();
    });
  });

  it("calls onUpload with the IPFS CID on successful upload", async () => {
    mockUploadToIPFS.mockResolvedValue("QmTestCID");
    const onUpload = jest.fn();
    render(<VideoUpload onUpload={onUpload} />);

    const input = screen.getByLabelText(/highlight reel/i);
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith("QmTestCID");
    });
  });

  it("shows loading state during upload", async () => {
    let resolveUpload: (cid: string) => void;
    mockUploadToIPFS.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
    const onUpload = jest.fn();
    render(<VideoUpload onUpload={onUpload} />);

    const input = screen.getByLabelText(/highlight reel/i);
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

    act(() => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByText(/uploading/i)).toBeInTheDocument();

    await act(async () => { resolveUpload!("QmDone"); });
  });

  it("shows an error message when error prop is provided", () => {
    render(<VideoUpload onUpload={jest.fn()} error="Upload failed" />);
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
  });

  it("does not call onUpload for non-video files", async () => {
    const onUpload = jest.fn();
    render(<VideoUpload onUpload={onUpload} />);

    const input = screen.getByLabelText(/highlight reel/i);
    const file = new File(["data"], "document.pdf", { type: "application/pdf" });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(onUpload).not.toHaveBeenCalled();
    expect(mockUploadToIPFS).not.toHaveBeenCalled();
  });
});
