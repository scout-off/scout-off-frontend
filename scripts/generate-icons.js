#!/usr/bin/env node

/**
 * Generate PNG icons from SVG source
 * This script creates placeholder PNG files using pure Node.js.
 * For production, use one of these methods to convert the SVG:
 *
 * 1. Inkscape (CLI):
 *    inkscape -w 512 -h 512 public/icons/icon.svg -o public/icons/icon-512x512.png
 *
 * 2. ImageMagick:
 *    convert -density 150 -resize 512x512 public/icons/icon.svg public/icons/icon-512x512.png
 *
 * 3. Online converter:
 *    https://convertio.co/svg-png/
 *
 * 4. Use 'sharp' with: npm install sharp && npx sharp-cli
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Creates a minimal valid PNG file with simple styling
 */
function createMinimalPNG(width, height) {
  const png = Buffer.alloc(1, 0x89);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature

  const ihdr = createIHDR(width, height);
  const idat = createIDAT(width, height);
  const iend = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  return Buffer.concat([sig, ihdr, idat, iend]);
}

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

function generateIcons() {
  const iconsDir = path.join(__dirname, '../public/icons');
  const sizes = [16, 32, 192, 512];

  try {
    for (const size of sizes) {
      const pngBuffer = createMinimalPNG(size, size);
      fs.writeFileSync(
        path.join(iconsDir, `icon-${size}x${size}.png`),
        pngBuffer,
      );
      console.log(
        `✓ Generated icon-${size}x${size}.png (${pngBuffer.length} bytes)`,
      );
    }

    const maskablePng = createMinimalPNG(512, 512);
    fs.writeFileSync(
      path.join(iconsDir, 'icon-maskable-512x512.png'),
      maskablePng,
    );
    console.log(
      `✓ Generated icon-maskable-512x512.png (${maskablePng.length} bytes)`,
    );

    console.log('\n✓ All placeholder PNG files generated!');
    console.log('\n⚠️  Note: These are placeholder files. For production:');
    console.log('   Replace with proper SVG-to-PNG conversions using:');
    console.log('   - Inkscape, ImageMagick, or an online converter');
    console.log(
      '   - Ensure all icons match the brand colors (#0f172a and white)',
    );
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
