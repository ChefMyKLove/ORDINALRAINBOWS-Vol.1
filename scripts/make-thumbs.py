"""Write an 800px copy of every piece: images/<name>.JPG -> images/sm/<name>.JPG.

Used by the gallery cards, the screensaver, the wallet panel and the phone background.
Run from the repo root after adding or changing a piece:  python scripts/make-thumbs.py
Needs Pillow (pip install Pillow).
"""
from pathlib import Path
import sys

from PIL import Image, ImageOps

SRC = Path(__file__).resolve().parent.parent / "images"
OUT = SRC / "sm"
MAX_SIDE = 800


def main() -> int:
    OUT.mkdir(exist_ok=True)
    made = 0
    for src in sorted(SRC.glob("*.JPG")):
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            im.save(OUT / src.name, "JPEG", quality=82, optimize=True, progressive=True)
        made += 1
    print(f"wrote {made} images to {OUT}")
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())
