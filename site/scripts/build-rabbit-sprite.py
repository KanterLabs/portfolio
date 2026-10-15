#!/usr/bin/env python3
"""Build the compact brand-rabbit sprite from the full pet sprite sheet.

The source sheet (not committed, ~2.2 MB) is an 8 x 11 grid of 192 x 208
cells on a transparent background. This keeps only the rows the site uses,
crops every frame to one shared box, and writes a small WebP strip.

    python3 scripts/build-rabbit-sprite.py <source.png> [out.webp]

Output rows (8 columns each, unused cells transparent) must stay in sync
with SEQUENCES in src/components/BrandRabbit.astro:
    0 idle blink (6)   1 wave (4)   2 happy jump (5)
    3 look around (8)  4 hop right (8)
"""
import sys
from PIL import Image

CELL_W, CELL_H = 192, 208
# (source row, frame count), in output order.
ROWS = [(0, 6), (3, 4), (4, 5), (10, 8), (1, 8)]
# Union of every used frame's opaque bounds, padded a few pixels.
CROP = (4, 50, 188, 206)
SCALE = 0.6


def main(src: str, out: str) -> None:
    sheet = Image.open(src).convert('RGBA')
    crop_w, crop_h = CROP[2] - CROP[0], CROP[3] - CROP[1]
    frame_w, frame_h = round(crop_w * SCALE), round(crop_h * SCALE)
    strip = Image.new('RGBA', (frame_w * 8, frame_h * len(ROWS)), (0, 0, 0, 0))
    for out_row, (src_row, count) in enumerate(ROWS):
        for col in range(count):
            left, top = col * CELL_W + CROP[0], src_row * CELL_H + CROP[1]
            frame = sheet.crop((left, top, left + crop_w, top + crop_h))
            frame = frame.resize((frame_w, frame_h), Image.LANCZOS)
            strip.alpha_composite(frame, (col * frame_w, out_row * frame_h))
    strip.save(out, 'WEBP', quality=78, method=6)
    print(f'{out}: {strip.size[0]}x{strip.size[1]}, frame {frame_w}x{frame_h}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'src/assets/brand/rabbit-sprite.webp')
