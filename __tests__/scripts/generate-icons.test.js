const path = require('path');
const fs = require('fs');

const FAKE_PNG = Buffer.from('fake-png');
const realReadFileSync = fs.readFileSync.bind(fs);

jest.mock('../../scripts/create-minimal-png', () => ({
  createMinimalPNG: jest.fn(() => FAKE_PNG),
}));

const { createMinimalPNG } = require('../../scripts/create-minimal-png');
const {
  ICON_SIZES,
  getIconOutputFiles,
  generateIcons,
} = require('../../scripts/generate-icons');

const iconsDir = path.join(__dirname, '../../public/icons');
const sourcePath = path.join(iconsDir, 'icon.svg');
const manifestPath = path.join(__dirname, '../../public/manifest.json');

describe('generate-icons.js', () => {
  let writeFileSyncSpy;
  let readFileSyncSpy;
  let exitSpy;
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    createMinimalPNG.mockClear();
    createMinimalPNG.mockReturnValue(FAKE_PNG);

    writeFileSyncSpy = jest
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => undefined);
    readFileSyncSpy = jest
      .spyOn(fs, 'readFileSync')
      .mockImplementation((filePath, ...rest) => {
        if (filePath === sourcePath) {
          return '<svg />';
        }
        return realReadFileSync(filePath, ...rest);
      });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    writeFileSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('invokes the image renderer once per required icon size (including maskable)', () => {
    generateIcons();

    // One call per square size + one for the maskable 512 variant
    expect(createMinimalPNG).toHaveBeenCalledTimes(ICON_SIZES.length + 1);

    for (const size of ICON_SIZES) {
      expect(createMinimalPNG).toHaveBeenCalledWith(size, size);
    }
    expect(createMinimalPNG).toHaveBeenCalledWith(512, 512);
  });

  it('writes output paths that match manifest.json icon srcs', () => {
    generateIcons();

    const writtenFiles = writeFileSyncSpy.mock.calls.map(([filePath]) =>
      path.basename(filePath),
    );
    expect(writtenFiles.sort()).toEqual(getIconOutputFiles().sort());

    const manifest = JSON.parse(realReadFileSync(manifestPath, 'utf8'));
    const manifestFiles = [
      ...new Set(manifest.icons.map((entry) => path.basename(entry.src))),
    ].sort();

    expect(writtenFiles.sort()).toEqual(manifestFiles);
  });

  it('surfaces a clear error when the source image is missing', () => {
    const missing = new Error(
      `ENOENT: no such file or directory, open '${sourcePath}'`,
    );
    missing.code = 'ENOENT';
    readFileSyncSpy.mockImplementation((filePath) => {
      if (filePath === sourcePath) {
        throw missing;
      }
      return realReadFileSync(filePath);
    });

    generateIcons();

    expect(createMinimalPNG).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Error generating icons:',
      expect.stringContaining('source image missing'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
