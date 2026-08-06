import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoUpload, {
  validateFile,
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL,
  ACCEPTED_TYPES_LABEL,
} from '@/components/ui/VideoUpload';

// ── useChunkedUpload mock ─────────────────────────────────────────────────────

const mockUpload = jest.fn();
const mockResume = jest.fn();
let mockHookState = {
  progress: 0,
  phase: 'uploading' as 'uploading' | 'processing',
  uploading: false,
  error: null as string | null,
  canResume: false,
};

jest.mock('@/hooks/useChunkedUpload', () => ({
  useChunkedUpload: () => ({
    ...mockHookState,
    upload: mockUpload,
    resume: mockResume,
  }),
}));

// ── Helper ────────────────────────────────────────────────────────────────────

function makeFile(name: string, type: string, sizeBytes: number): File {
  // Blob of the exact requested size
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

// ── validateFile unit tests ───────────────────────────────────────────────────

describe('validateFile', () => {
  // ── Accepted types ──────────────────────────────────────────────────────────

  it.each(ACCEPTED_MIME_TYPES)(
    'returns null for accepted type "%s"',
    (mimeType) => {
      const file = makeFile('test', mimeType, 1024);
      expect(validateFile(file)).toBeNull();
    },
  );

  // ── Rejected types ──────────────────────────────────────────────────────────

  it('rejects application/pdf', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    expect(validateFile(file)).toMatch(/not supported/i);
  });

  it('rejects text/plain', () => {
    const file = makeFile('readme.txt', 'text/plain', 1024);
    expect(validateFile(file)).toMatch(/not supported/i);
  });

  it('rejects video/avi (not in the accepted list)', () => {
    const file = makeFile('clip.avi', 'video/x-msvideo', 1024);
    expect(validateFile(file)).toMatch(/not supported/i);
  });

  it('includes the rejected MIME type in the error message', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    const error = validateFile(file);
    expect(error).toContain('application/pdf');
  });

  it('includes accepted types label in the error message', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    const error = validateFile(file);
    expect(error).toContain(ACCEPTED_TYPES_LABEL);
  });

  // ── Size validation ─────────────────────────────────────────────────────────

  it('returns null for a file exactly at the size limit', () => {
    const file = makeFile('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES);
    expect(validateFile(file)).toBeNull();
  });

  it('returns null for a file one byte under the limit', () => {
    const file = makeFile('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES - 1);
    expect(validateFile(file)).toBeNull();
  });

  it('rejects a file one byte over the size limit', () => {
    const file = makeFile('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES + 1);
    expect(validateFile(file)).toMatch(/too large/i);
  });

  it('includes the max size label in the oversized error message', () => {
    const file = makeFile('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES + 1);
    const error = validateFile(file);
    expect(error).toContain(MAX_FILE_SIZE_LABEL);
  });

  it('includes the actual file size (in MB) in the oversized error message', () => {
    const sizeBytes = 60 * 1024 * 1024; // 60 MB
    const file = makeFile('video.mp4', 'video/mp4', sizeBytes);
    const error = validateFile(file);
    expect(error).toContain('60.0 MB');
  });

  it('rejects an invalid type even if the size is fine', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    expect(validateFile(file)).not.toBeNull();
  });

  it('type error takes precedence over size error', () => {
    // Invalid type AND oversized — type check runs first
    const file = makeFile(
      'doc.pdf',
      'application/pdf',
      MAX_FILE_SIZE_BYTES + 1,
    );
    const error = validateFile(file);
    expect(error).toMatch(/not supported/i);
  });
});

// ── VideoUpload component tests ───────────────────────────────────────────────

describe('VideoUpload component', () => {
  const onUpload = jest.fn();
  const onValidationError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockHookState = {
      progress: 0,
      phase: 'uploading',
      uploading: false,
      error: null,
      canResume: false,
    };
    mockUpload.mockResolvedValue({ cid: 'QmMockCID123', error: null });
    mockResume.mockResolvedValue({ cid: null, error: null });
  });

  function renderUpload() {
    return render(
      <VideoUpload onUpload={onUpload} onValidationError={onValidationError} />,
    );
  }

  it('renders the file input with accepted MIME types', () => {
    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i) as HTMLInputElement;
    expect(input.accept).toBe(ACCEPTED_MIME_TYPES.join(','));
  });

  it('shows the accepted types and size limit hint', () => {
    renderUpload();
    expect(screen.getByText(/MP4, MOV, JPEG, PNG/i)).toBeInTheDocument();
    expect(screen.getByText(/50 MB/i)).toBeInTheDocument();
  });

  it('calls onValidationError with an error message for an invalid file type', async () => {
    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const badFile = makeFile('doc.pdf', 'application/pdf', 1024);

    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(onValidationError).toHaveBeenCalledWith(
        expect.stringMatching(/not supported/i),
      );
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('calls onValidationError with an error message for an oversized file', async () => {
    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const bigFile = makeFile('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES + 1);

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(onValidationError).toHaveBeenCalledWith(
        expect.stringMatching(/too large/i),
      );
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows an inline error message for an invalid file type', async () => {
    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const badFile = makeFile('doc.pdf', 'application/pdf', 1024);

    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/not supported/i);
  });

  it('shows an inline error message for an oversized file', async () => {
    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const bigFile = makeFile('video.mp4', 'video/mp4', MAX_FILE_SIZE_BYTES + 1);

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/too large/i);
  });

  it('propagates aria-invalid when an external error prop is supplied', () => {
    render(<VideoUpload onUpload={onUpload} error="External error message" />);
    const input = screen.getByLabelText(/highlight reel/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not call onUpload for an invalid file type', async () => {
    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const badFile = makeFile('image.gif', 'image/gif', 1024);

    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => expect(onValidationError).toHaveBeenCalled());
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('calls onValidationError(null) and then onUpload for a valid file', async () => {
    mockUpload.mockResolvedValue({ cid: 'QmValidCID', error: null });

    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const goodFile = makeFile('clip.mp4', 'video/mp4', 1024);

    fireEvent.change(input, { target: { files: [goodFile] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('QmValidCID'));
    expect(onValidationError).toHaveBeenCalledWith(null);
  });

  it('shows a progress bar with the current percentage while uploading', () => {
    mockHookState = {
      progress: 42,
      phase: 'uploading',
      uploading: true,
      error: null,
      canResume: false,
    };

    renderUpload();

    const bar = screen.getByRole('progressbar', { name: /upload progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it('disables the file input while uploading', () => {
    mockHookState = {
      progress: 10,
      phase: 'uploading',
      uploading: true,
      error: null,
      canResume: false,
    };

    renderUpload();

    expect(screen.getByLabelText(/highlight reel/i)).toBeDisabled();
  });

  it('shows a distinct "Processing" state once chunk upload completes and pinning begins', () => {
    mockHookState = {
      progress: 100,
      phase: 'processing',
      uploading: true,
      error: null,
      canResume: false,
    };

    renderUpload();

    expect(screen.getByText(/processing/i)).toBeInTheDocument();
    expect(screen.queryByText(/uploading\.\.\./i)).not.toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /processing upload/i });
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });

  it('surfaces the chunked-upload hook error and calls onValidationError with it', async () => {
    mockUpload.mockResolvedValue({
      cid: null,
      error: 'Upload interrupted. You can resume from where it left off.',
    });

    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    const goodFile = makeFile('clip.mp4', 'video/mp4', 1024);

    fireEvent.change(input, { target: { files: [goodFile] } });

    await waitFor(() =>
      expect(onValidationError).toHaveBeenCalledWith(
        'Upload interrupted. You can resume from where it left off.',
      ),
    );
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows a Resume upload button when the hook reports a resumable failure, and calls resume() on click', async () => {
    mockUpload.mockResolvedValue({ cid: null, error: 'Upload interrupted.' });
    mockHookState = {
      progress: 0,
      phase: 'uploading',
      uploading: false,
      error: null,
      canResume: true,
    };
    mockResume.mockResolvedValue({ cid: 'QmResumedCID', error: null });

    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    fireEvent.change(input, {
      target: { files: [makeFile('clip.mp4', 'video/mp4', 1024)] },
    });

    const resumeButton = await screen.findByRole('button', {
      name: /resume upload/i,
    });
    fireEvent.click(resumeButton);

    await waitFor(() => expect(mockResume).toHaveBeenCalled());
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('QmResumedCID'));
  });

  it('does not show a Resume upload button when there is nothing to resume', async () => {
    mockUpload.mockResolvedValue({
      cid: null,
      error: 'Upload failed. Please try again.',
    });

    renderUpload();
    const input = screen.getByLabelText(/highlight reel/i);
    fireEvent.change(input, {
      target: { files: [makeFile('clip.mp4', 'video/mp4', 1024)] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: /resume upload/i }),
    ).not.toBeInTheDocument();
  });
});
