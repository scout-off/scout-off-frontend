#!/usr/bin/env python3
"""
Generate PNG icons from SVG source using PIL and cairosvg
Requires: pip install cairosvg pillow
"""

import sys
import os
from pathlib import Path

def generate_icons():
    try:
        import cairosvg
        from PIL import Image
        from io import BytesIO
    except ImportError as e:
        print(f"Error: Required module not installed: {e.name}")
        print("Install with: pip install cairosvg pillow")
        sys.exit(1)

    script_dir = Path(__file__).parent
    svg_path = script_dir.parent / "public" / "icons" / "icon.svg"
    icons_dir = script_dir.parent / "public" / "icons"

    if not svg_path.exists():
        print(f"Error: SVG file not found at {svg_path}")
        sys.exit(1)

    sizes = [16, 32, 192, 512]

    try:
        # Generate standard icons
        for size in sizes:
            png_path = icons_dir / f"icon-{size}x{size}.png"
            cairosvg.svg2png(
                url=str(svg_path),
                write_to=str(png_path),
                output_width=size,
                output_height=size
            )
            print(f"✓ Generated icon-{size}x{size}.png")

        # Generate maskable icon
        maskable_path = icons_dir / "icon-maskable-512x512.png"
        cairosvg.svg2png(
            url=str(svg_path),
            write_to=str(maskable_path),
            output_width=512,
            output_height=512
        )
        print("✓ Generated icon-maskable-512x512.png")

        print("\n✓ All icons generated successfully!")

    except Exception as e:
        print(f"Error generating icons: {e}")
        sys.exit(1)

if __name__ == "__main__":
    generate_icons()
