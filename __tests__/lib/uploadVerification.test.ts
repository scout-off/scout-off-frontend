/** @jest-environment node */
import axios from 'axios';
import {
  sha256Hex,
  verifyUploadedContent,
  UploadVerificationError,
} from '@/lib/uploadVerification';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('sha256Hex', () => {
  it('produces a deterministic hash for the same bytes', () => {
    const bytes = Buffer.from('hello world');
    expect(sha256Hex(bytes)).toBe(sha256Hex(Buffer.from('hello world')));
  });

  it('produces different hashes for different bytes', () => {
    expect(sha256Hex(Buffer.from('a'))).not.toBe(sha256Hex(Buffer.from('b')));
  });
});

describe('verifyUploadedContent (issue #699)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves when the gateway serves byte-identical content', async () => {
    const uploadedBytes = Buffer.from('the uploaded file');
    mockedAxios.get.mockResolvedValueOnce({
      data: new Uint8Array(uploadedBytes).buffer,
    });

    await expect(
      verifyUploadedContent('QmSomeCid', uploadedBytes),
    ).resolves.toBeUndefined();
  });

  it('throws UploadVerificationError when the gateway content does not match', async () => {
    const uploadedBytes = Buffer.from('the uploaded file');
    mockedAxios.get.mockResolvedValueOnce({
      data: new Uint8Array(Buffer.from('a different file')).buffer,
    });

    await expect(
      verifyUploadedContent('QmSomeCid', uploadedBytes),
    ).rejects.toThrow(UploadVerificationError);
  });

  it('throws UploadVerificationError when the gateway request fails', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network error'));

    await expect(
      verifyUploadedContent('QmSomeCid', Buffer.from('anything')),
    ).rejects.toThrow(/could not verify the upload/i);
  });
});
