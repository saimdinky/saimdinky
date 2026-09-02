# Crops leftover white canvas from stats PNG (Chrome screenshots) and
# scales the terminal to 1400x420 so GitHub does not show a blank block.

from pathlib import Path

from PIL import Image

PNG = Path(__file__).resolve().parent.parent / "dist" / "live-stats.png"
TARGET = (1400, 420)


def main():
    im = Image.open(PNG).convert("RGB")
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 240 and g > 240 and b > 240:
                continue
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    if maxx < minx:
        raise SystemExit(f"no terminal pixels found in {PNG}")
    crop = im.crop((minx, miny, maxx + 1, maxy + 1))
    crop.resize(TARGET, Image.Resampling.LANCZOS).save(PNG, "PNG")
    print(f"cropped {im.size} -> bbox {(minx, miny, maxx + 1, maxy + 1)} -> {TARGET}")


if __name__ == "__main__":
    main()
