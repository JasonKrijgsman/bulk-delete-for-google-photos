"""Draws the extension icons: a white trash can on a red rounded square.

Plain Python with no dependencies. Run it from anywhere:

    python scripts/make-icons.py

It writes extension/icons/icon16.png, icon32.png, icon48.png and icon128.png.
"""

import os
import struct
import zlib

BG = (201, 52, 44)
FG = (255, 255, 255)
SAMPLES = 4  # per axis, for smooth edges


def rounded_rect(x, y, left, top, right, bottom, radius):
    if not (left <= x <= right and top <= y <= bottom):
        return False
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def colour_at(x, y):
    """Colour of the 128 by 128 design at (x, y), or None for transparent."""
    if not rounded_rect(x, y, 0, 0, 128, 128, 28):
        return None
    # The slots in the can show the background through.
    for centre in (52, 64, 76):
        if rounded_rect(x, y, centre - 3, 58, centre + 3, 94, 3):
            return BG
    # Handle, lid and body of the can.
    if rounded_rect(x, y, 53, 24, 75, 36, 4):
        return FG
    if rounded_rect(x, y, 30, 34, 98, 44, 4):
        return FG
    if 48 <= y <= 104:
        t = (y - 48) / 56.0
        left = 36 + 6 * t
        right = 92 - 6 * t
        if rounded_rect(x, y, left, 48, right, 104, 7):
            return FG
    return BG


def render(size):
    rows = []
    scale = 128.0 / size
    for py in range(size):
        row = bytearray([0])  # filter type: none
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    x = (px + (sx + 0.5) / SAMPLES) * scale
                    y = (py + (sy + 0.5) / SAMPLES) * scale
                    colour = colour_at(x, y)
                    if colour is not None:
                        r += colour[0]
                        g += colour[1]
                        b += colour[2]
                        a += 1
            n = SAMPLES * SAMPLES
            if a:
                row += bytes((round(r / a), round(g / a), round(b / a), round(255 * a / n)))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) +
            chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extension", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(out, "icon%d.png" % size)
        with open(path, "wb") as f:
            f.write(png(size, render(size)))
        print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()
