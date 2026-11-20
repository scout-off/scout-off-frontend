import {
  downloadBlob,
  downloadCsv,
  REVOKE_DELAY_MS,
  sanitizeFilename,
} from '@/lib/download';

describe('lib/download', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    jest.useFakeTimers();
    createObjectURL = jest.fn(() => 'blob:mock');
    revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    clicked = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(document.body.contains(this)).toBe(true);
        clicked.push(this);
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('clicks an attached anchor, removes it, and defers revocation', () => {
    downloadBlob(new Blob(['x']), 'file.json');

    expect(clicked).toHaveLength(1);
    expect(clicked[0].href).toBe('blob:mock');
    expect(clicked[0].download).toBe('file.json');
    expect(document.body.contains(clicked[0])).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    jest.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('prepends a UTF-8 BOM to CSV downloads', async () => {
    downloadCsv('name\nKanté', 'players.csv');

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new Uint8Array(buffer);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('sanitizes filenames', () => {
    expect(sanitizeFilename('../etc\\pa\u0000ss\nwd.csv')).toBe(
      '..etcpasswd.csv',
    );
    expect(sanitizeFilename('/\u0007')).toBe('download');
    expect(sanitizeFilename('player-1-milestones.json')).toBe(
      'player-1-milestones.json',
    );
  });
});
