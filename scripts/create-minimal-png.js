/**
 * Minimal PNG renderer used by generate-icons.js.
 * Kept in its own module so unit tests can mock it at the module boundary
 * without running real image encoding.
 */
const zlib = require('zlib');

function createIHDR(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8); // Bit depth
  data.writeUInt8(2, 9); // Color type (RGB)
  data.writeUInt8(0, 10); // Compression
  data.writeUInt8(0, 11); // Filter
  data.writeUInt8(0, 12); // Interlace

  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);

  const type = Buffer.from('IHDR');
  const chunk = Buffer.concat([length, type, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);

  return Buffer.concat([chunk, crc]);
}

function createIDAT(width, height) {
  const pixelData = [];

  for (let y = 0; y < height; y++) {
    pixelData.push(0); // Filter type
    for (let x = 0; x < width; x++) {
      // Create a simple pattern: darker edges (#0f172a), lighter center (white)
      const isBorder = x < 5 || x >= width - 5 || y < 5 || y >= height - 5;
      if (isBorder) {
        pixelData.push(0x0f, 0x17, 0x2a); // Dark background
      } else {
        pixelData.push(0xff, 0xff, 0xff); // White
      }
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(pixelData));

  const type = Buffer.from('IDAT');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(compressed.length, 0);

  const chunk = Buffer.concat([length, type, compressed]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, compressed])), 0);

  return Buffer.concat([chunk, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a minimal valid PNG file with simple styling.
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
function createMinimalPNG(width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = createIHDR(width, height);
  const idat = createIDAT(width, height);
  const iend = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  return Buffer.concat([sig, ihdr, idat, iend]);
}

module.exports = { createMinimalPNG };
