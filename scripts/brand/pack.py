"""Packs the frames scripts/brand/generate.mjs renders into icon.ico and the README GIFs.

Usage: python3 pack.py <render dir> <repo root> [ico|gif|all]. Needs Pillow.

`ico` reads the `<dir>/ico-<size>.png` tiles, `gif` reads `<dir>/gif-<theme>/f*.png`;
pass the mode that matches the stages this run rendered.
"""
import glob
import sys

from PIL import Image

out, root = sys.argv[1:3]
mode = sys.argv[3] if len(sys.argv) > 3 else "all"

sizes = [16, 24, 32, 48, 64, 128, 256]

if mode in ("ico", "all"):
    ico = [Image.open(f"{out}/ico-{s}.png").convert("RGBA") for s in sizes]
    ico[-1].save(
        f"{root}/apps/desktop/build/icon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=ico[:-1],
    )

if mode in ("gif", "all"):
    for name in ("light", "dark"):
        frames = [Image.open(f).convert("RGB") for f in sorted(glob.glob(f"{out}/gif-{name}/f*.png"))]
        # One palette for every frame, taken from the finished mark, so the strokes never shimmer.
        palette = frames[-1].quantize(colors=64, method=Image.Quantize.MEDIANCUT)
        gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        gif[0].save(
            f"{root}/docs/assets/logo-{name}.gif",
            save_all=True,
            append_images=gif[1:],
            duration=33,
            optimize=True,
            disposal=1,
        )
