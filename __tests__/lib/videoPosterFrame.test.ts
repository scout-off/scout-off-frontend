import {
  blackPixelJpeg,
  extractPosterFrameFromBuffer,
  findMp4MdatOffset,
  looksLikeMp4,
  looksLikeWebm,
} from '@/lib/videoPosterFrame';

function box(type: string, size: number, payloadLength = size - 8): number[] {
  const bytes = new Array<number>(8 + Math.max(payloadLength, 0)).fill(0);
  bytes[0] = (size >>> 24) & 0xff;
  bytes[1] = (size >>> 16) & 0xff;
  bytes[2] = (size >>> 8) & 0xff;
  bytes[3] = size & 0xff;
  for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i);
  return bytes;
}

const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());
const buf = (...parts: number[][]) => Buffer.from(parts.flat());

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
const MP4_PARTS = [box('ftyp', 16), box('free', 8), box('mdat', 16)];
const MP4 = bytes(...MP4_PARTS);

describe('looksLikeMp4 / looksLikeWebm', () => {
  it('detects valid magic', () => {
    expect(looksLikeMp4(MP4)).toBe(true);
    expect(looksLikeWebm(WEBM)).toBe(true);
  });

  it.each([
    ['PNG', PNG],
    ['empty', new Uint8Array(0)],
    ['truncated', MP4.subarray(0, 6)],
  ])('rejects %s input', (_label, input) => {
    expect(looksLikeMp4(input)).toBe(false);
    expect(looksLikeWebm(input.subarray(0, 3))).toBe(false);
  });

  it('rejects PNG as WebM and WebM as MP4', () => {
    expect(looksLikeWebm(PNG)).toBe(false);
    expect(looksLikeMp4(WEBM)).toBe(false);
  });
});

describe('findMp4MdatOffset', () => {
  it('finds mdat after ftyp + free', () => {
    expect(findMp4MdatOffset(buf(...MP4_PARTS))).toBe(24);
  });

  it('returns -1 when mdat is not within range', () => {
    expect(findMp4MdatOffset(buf(box('ftyp', 16), box('moov', 16)))).toBe(-1);
    expect(findMp4MdatOffset(buf(...MP4_PARTS).subarray(0, 20))).toBe(-1);
  });

  it.each([
    ['size 0', 0],
    ['size 1 (extended)', 1],
    ['size larger than buffer', 4096],
  ])('stops on malformed box %s', (_label, size) => {
    const data = buf(box('ftyp', 16), box('free', size, 8), box('mdat', 16));
    expect(findMp4MdatOffset(data)).toBe(-1);
  });
});

describe('blackPixelJpeg', () => {
  it('has SOI and EOI markers', () => {
    const jpeg = blackPixelJpeg();
    expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...jpeg.subarray(-2)]).toEqual([0xff, 0xd9]);
  });
});

describe('extractPosterFrameFromBuffer', () => {
  const placeholder = {
    jpeg: blackPixelJpeg(),
    width: 1,
    height: 1,
  };

  it('returns the placeholder for non-video input', async () => {
    expect(await extractPosterFrameFromBuffer(PNG)).toMatchObject(placeholder);
  });

  it('returns the placeholder for moov-after-mdat input without mdat in range', async () => {
    const data = bytes(box('ftyp', 16), box('moov', 16));
    expect(await extractPosterFrameFromBuffer(data, 2)).toMatchObject(
      placeholder,
    );
  });

  it('returns a 1x1 frame for a recognised container', async () => {
    // No ffmpeg in the test environment, so extraction degrades to the
    // placeholder.
    const result = await extractPosterFrameFromBuffer(MP4, 2);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect([...result.jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });
});
