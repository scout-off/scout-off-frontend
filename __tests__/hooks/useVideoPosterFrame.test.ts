import { renderHook, act } from '@testing-library/react';
import { useVideoPosterFrame } from '@/hooks/useVideoPosterFrame';

const VIDEO_URL = 'https://gateway.pinata.cloud/ipfs/QmClip.mp4';

let createdVideos: HTMLVideoElement[] = [];
let createElementSpy: jest.SpyInstance;

beforeEach(() => {
  createdVideos = [];
  const realCreateElement = document.createElement.bind(document);
  createElementSpy = jest
    .spyOn(document, 'createElement')
    .mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'video') createdVideos.push(el as HTMLVideoElement);
      return el;
    });
});

afterEach(() => {
  createElementSpy.mockRestore();
  jest.restoreAllMocks();
});

function loadMetadata(video: HTMLVideoElement, duration: number) {
  Object.defineProperty(video, 'duration', {
    value: duration,
    configurable: true,
  });
  act(() => {
    video.dispatchEvent(new Event('loadedmetadata'));
  });
}

function seek(video: HTMLVideoElement) {
  act(() => {
    video.dispatchEvent(new Event('seeked'));
  });
}

function mockCanvasCapture(dataUrl: string, dimensions = { w: 320, h: 180 }) {
  const drawImage = jest.fn();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
  // videoWidth/videoHeight back the canvas dimensions read inside the hook.
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    value: dimensions.w,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    value: dimensions.h,
    configurable: true,
  });
  return { drawImage };
}

describe('useVideoPosterFrame', () => {
  it('returns null before capture completes', () => {
    const { result } = renderHook(() => useVideoPosterFrame(VIDEO_URL));
    expect(result.current).toBeNull();
  });

  it('does not create a video element when disabled', () => {
    renderHook(() => useVideoPosterFrame(VIDEO_URL, { enabled: false }));
    expect(createdVideos).toHaveLength(0);
  });

  it('creates a muted, cross-origin, metadata-preloading video element when enabled', () => {
    renderHook(() => useVideoPosterFrame(VIDEO_URL));
    expect(createdVideos).toHaveLength(1);
    const video = createdVideos[0];
    expect(video.muted).toBe(true);
    expect(video.crossOrigin).toBe('anonymous');
    expect(video.preload).toBe('metadata');
    expect(video.src).toBe(VIDEO_URL);
  });

  it('seeks to the requested timestamp once metadata loads, clamped to the clip duration', () => {
    renderHook(() => useVideoPosterFrame(VIDEO_URL, { timestampSeconds: 5 }));
    const video = createdVideos[0];
    loadMetadata(video, 2); // shorter than the requested 5s timestamp
    expect(video.currentTime).toBeCloseTo(1.9, 5); // duration - 0.1
  });

  it('captures the frame and returns a poster data URL once seeking completes', () => {
    mockCanvasCapture('data:image/jpeg;base64,CAPTURED');
    const { result } = renderHook(() => useVideoPosterFrame(VIDEO_URL));

    const video = createdVideos[0];
    loadMetadata(video, 10);
    seek(video);

    expect(result.current).toBe('data:image/jpeg;base64,CAPTURED');
  });

  it('degrades gracefully (returns null) when the canvas is empty', () => {
    mockCanvasCapture('data:image/jpeg;base64,SHOULD_NOT_BE_USED', {
      w: 0,
      h: 0,
    });
    const { result } = renderHook(() => useVideoPosterFrame(VIDEO_URL));

    const video = createdVideos[0];
    loadMetadata(video, 10);
    seek(video);

    expect(result.current).toBeNull();
  });

  it('degrades gracefully (returns null) when the canvas is CORS-tainted', () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: jest.fn(),
    } as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      value: 320,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      value: 180,
      configurable: true,
    });

    const { result } = renderHook(() => useVideoPosterFrame(VIDEO_URL));
    const video = createdVideos[0];
    loadMetadata(video, 10);
    seek(video);

    expect(result.current).toBeNull();
  });

  it('does nothing when videoUrl is empty', () => {
    renderHook(() => useVideoPosterFrame(''));
    expect(createdVideos).toHaveLength(0);
  });

  it('re-runs capture when the video URL changes', () => {
    mockCanvasCapture('data:image/jpeg;base64,FIRST');
    const { result, rerender } = renderHook(
      ({ url }) => useVideoPosterFrame(url),
      { initialProps: { url: VIDEO_URL } },
    );

    loadMetadata(createdVideos[0], 10);
    seek(createdVideos[0]);
    expect(result.current).toBe('data:image/jpeg;base64,FIRST');

    (HTMLCanvasElement.prototype.toDataURL as jest.Mock).mockReturnValue(
      'data:image/jpeg;base64,SECOND',
    );
    rerender({ url: 'https://gateway.pinata.cloud/ipfs/QmOther.mp4' });

    expect(createdVideos).toHaveLength(2);
    loadMetadata(createdVideos[1], 10);
    seek(createdVideos[1]);
    expect(result.current).toBe('data:image/jpeg;base64,SECOND');
  });
});
