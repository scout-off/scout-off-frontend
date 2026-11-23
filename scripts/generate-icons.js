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
const { createMinimalPNG } = require('./create-minimal-png');

/** Square icon sizes written for the PWA manifest. */
const ICON_SIZES = [16, 32, 192, 512];

/**
 * Returns the list of output filenames (relative to public/icons/) that
 * generateIcons writes — must stay in sync with public/manifest.json.
 */
function getIconOutputFiles() {
  return [
    ...ICON_SIZES.map((size) => `icon-${size}x${size}.png`),
    'icon-maskable-512x512.png',
  ];
}

function generateIcons() {
  const iconsDir = path.join(__dirname, '../public/icons');
  const sourcePath = path.join(iconsDir, 'icon.svg');

  try {
    // Gate on the SVG source so a missing brand asset fails loudly instead of
    // silently writing placeholder PNGs with no upstream artwork.
    fs.readFileSync(sourcePath);

    for (const size of ICON_SIZES) {
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
    const message =
      error && error.code === 'ENOENT'
        ? `source image missing at ${sourcePath}`
        : error && error.message
          ? error.message
          : String(error);
    console.error('Error generating icons:', message);
    process.exit(1);
  }
}

module.exports = {
  ICON_SIZES,
  getIconOutputFiles,
  generateIcons,
};

if (require.main === module) {
  generateIcons();
}
