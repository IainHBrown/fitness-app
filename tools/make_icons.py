"""Generates the app icons (navy background, muted-blue progress ring).
Pure Python, no dependencies. Run: python3 tools/make_icons.py
"""
import math, os, struct, zlib

BG = (11, 19, 34)        # deep navy
RING_BG = (30, 45, 74)   # faint track
RING = (123, 155, 209)   # muted blue accent
DOT = (111, 174, 159)    # muted teal

def png(path, size, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 3:(y + 1) * size * 3]) for y in range(size))
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))

def sample(x, y):
    """Colour at a point in unit space (0..1), or None for background."""
    dx, dy = x - 0.5, y - 0.5
    r = math.hypot(dx, dy)
    ang = (math.degrees(math.atan2(dx, -dy)) + 360) % 360  # 0 = top, clockwise
    if 0.235 <= r <= 0.315:
        return RING if ang <= 290 else RING_BG
    if r <= 0.07:
        return DOT
    return None

def render(size, ss=3):
    px = []
    for py in range(size):
        for pxl in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = sample((pxl + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size) or BG
                    for i in range(3):
                        acc[i] += c[i]
            px.extend(int(a / (ss * ss)) for a in acc)
    return px

out = os.path.join(os.path.dirname(__file__), "..", "icons")
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    png(os.path.join(out, name), size, render(size))
    print("wrote", name)
