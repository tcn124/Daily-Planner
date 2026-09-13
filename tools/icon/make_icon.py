#!/usr/bin/env python3
"""Renders the Weekly Planner app icon at every size the bundles need.

No SVG rasteriser is available on this machine, so shapes are flattened to
polygons and filled with a scanline rasteriser: coverage is exact in x and
supersampled in y, which gives clean edges on the star's diagonals and the
petals' curves. Every size is rendered natively rather than downscaled.

The mark: an 8-point light star (tips at R, notches at 0.62R offset 22.5 deg)
with 8 dark teardrop petals seated in the notches.
"""
import math, os, struct, sys, zlib

# ---------------------------------------------------------------- geometry

def cubic(p0, p1, p2, p3, n=64):
    """Flatten a cubic bezier, dropping the start point (callers chain)."""
    out = []
    for i in range(1, n + 1):
        t = i / n
        m = 1 - t
        a, b, c, d = m*m*m, 3*m*m*t, 3*m*t*t, t*t*t
        out.append((a*p0[0] + b*p1[0] + c*p2[0] + d*p3[0],
                    a*p0[1] + b*p1[1] + c*p2[1] + d*p3[1]))
    return out

def arc(cx, cy, r, a0, a1, n=64):
    """Circular arc in degrees, y-down. Drops the start point."""
    out = []
    for i in range(1, n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out

def rotate(pts, deg, cx, cy):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]

def round_rect(x, y, w, h, r, n=48):
    """Rounded rectangle as a single closed contour."""
    x1, y1 = x + w, y + h
    pts = [(x + r, y)]
    pts += [(x1 - r, y)]
    pts += arc(x1 - r, y + r, r, -90, 0, n)
    pts += [(x1, y1 - r)]
    pts += arc(x1 - r, y1 - r, r, 0, 90, n)
    pts += [(x + r, y1)]
    pts += arc(x + r, y1 - r, r, 90, 180, n)
    pts += [(x, y + r)]
    pts += arc(x + r, y + r, r, 180, 270, n)
    return pts

def star(cx, cy, R, inner=0.62):
    pts = []
    for i in range(16):
        a = math.radians(i * 22.5 - 90.0)
        rr = R if i % 2 == 0 else R * inner
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts

def petal(cx, cy, L, w, deg, bow=0.06, n=64):
    """Teardrop: the convex hull of the centre point and the round cap, i.e.
    two tangent lines meeting the cap smoothly, so the petal comes to a true
    point at the centre and the sides stay nearly straight. `bow` bulges the
    sides outward slightly. Built pointing up (-y), then rotated into place."""
    dc = L - w                                  # centre -> cap centre
    a = math.asin(w / dc)                       # half-angle of the tangents
    t = math.sqrt(dc * dc - w * w)              # tangent length
    tx, ty = t * math.sin(a), -t * math.cos(a)
    a0 = math.degrees(math.atan2(ty + dc, -tx))         # left tangent point
    a1 = 540.0 - a0                     # right point, going the long way
                                        # round the cap rather than across it

    def side(p0, p1, sign):
        """Straight tangent, bowed out a touch perpendicular to itself."""
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        ln = math.hypot(dx, dy) or 1.0
        px, py = -dy / ln, dx / ln
        c = (mx + sign * px * bow * ln, my + sign * py * bow * ln)
        return cubic(p0, c, c, p1, n)

    pts = [(0.0, 0.0)]
    pts += side((0.0, 0.0), (-tx, ty), -1)
    pts += arc(0.0, -dc, w, a0, a1, n)          # cap, over the top
    pts += side((tx, ty), (0.0, 0.0), -1)
    return rotate(pts, deg, cx, cy)

# ------------------------------------------------------------- rasteriser

class Canvas:
    """RGBA float buffer, premultiplied-free (all fills are opaque)."""

    def __init__(self, size):
        self.n = size
        self.px = [[0.0, 0.0, 0.0, 0.0] for _ in range(size * size)]

    def fill(self, contour, rgb, ss=16, alpha=1.0):
        """Scanline fill, even-odd. Exact x coverage, ss samples per row in y.
        `alpha` (default 1.0, i.e. no change from before) lets a caller draw
        a translucent fill — needed for an SVG source with fill-opacity."""
        n = self.n
        edges = []
        m = len(contour)
        for i in range(m):
            x0, y0 = contour[i]
            x1, y1 = contour[(i + 1) % m]
            if y0 != y1:
                edges.append((y0, y1, x0, (x1 - x0) / (y1 - y0)))
        if not edges:
            return
        ylo = max(0, int(math.floor(min(min(e[0], e[1]) for e in edges))))
        yhi = min(n - 1, int(math.ceil(max(max(e[0], e[1]) for e in edges))))
        cov = [0.0] * n
        r, g, b = rgb
        share = 1.0 / ss
        for py in range(ylo, yhi + 1):
            for k in range(n):
                cov[k] = 0.0
            hit = False
            for s in range(ss):
                sy = py + (s + 0.5) / ss
                xs = []
                for y0, y1, x0, slope in edges:
                    if (y0 <= sy < y1) or (y1 <= sy < y0):
                        xs.append(x0 + (sy - y0) * slope)
                if len(xs) < 2:
                    continue
                xs.sort()
                for j in range(0, len(xs) - 1, 2):
                    a, bx = xs[j], xs[j + 1]
                    if bx <= 0 or a >= n or bx <= a:
                        continue
                    a = max(a, 0.0)
                    bx = min(bx, float(n))
                    ia, ib = int(a), int(min(bx, n - 1e-9))
                    hit = True
                    if ia == ib:
                        cov[ia] += (bx - a) * share
                    else:
                        cov[ia] += (ia + 1 - a) * share
                        for k in range(ia + 1, ib):
                            cov[k] += share
                        cov[ib] += (bx - ib) * share
            if not hit:
                continue
            row = py * n
            for k in range(n):
                c = cov[k]
                if c <= 0.0:
                    continue
                if c > 1.0:
                    c = 1.0
                c *= alpha
                p = self.px[row + k]
                ia = p[3]
                na = c + ia * (1 - c)                      # source-over
                if na <= 0:
                    continue
                p[0] = (r * c + p[0] * ia * (1 - c)) / na
                p[1] = (g * c + p[1] * ia * (1 - c)) / na
                p[2] = (b * c + p[2] * ia * (1 - c)) / na
                p[3] = na

    def png(self, path):
        n = self.n
        raw = bytearray()
        for y in range(n):
            raw.append(0)                                   # filter: none
            row = y * n
            for x in range(n):
                p = self.px[row + x]
                for c in range(3):
                    v = int(p[c] * 255 + 0.5)
                    raw.append(0 if v < 0 else 255 if v > 255 else v)
                v = int(p[3] * 255 + 0.5)
                raw.append(0 if v < 0 else 255 if v > 255 else v)

        def chunk(tag, data):
            return (struct.pack(">I", len(data)) + tag + data
                    + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

        ihdr = struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)
        with open(path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")
            f.write(chunk(b"IHDR", ihdr))
            f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
            f.write(chunk(b"IEND", b""))

# ------------------------------------------------------------------ paint

def hexrgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i+2], 16) / 255.0 for i in (0, 2, 4))

LIGHT  = hexrgb("#BCCEFD")
DARK   = hexrgb("#1A56F5")
WHITE  = hexrgb("#FFFFFF")
EDGE   = hexrgb("#E4E4E4")

# Petal proportions, as fractions. The cap reaches the star's notch radius,
# which is what seats each petal in the crook between two star points.
L_RATIO = 0.62      # petal length, as a fraction of the star radius R
                    # (equal to the notch radius, so each cap seats
                    #  exactly in the crook between two star points)
W_RATIO = 0.19      # cap radius, as a fraction of the petal length
BOW     = 0.06      # how far the straight sides bow outward

def render(size, card=True, ss=None):
    c = Canvas(size)
    u = size / 1024.0
    ss = ss or (24 if size <= 64 else 16 if size <= 256 else 8)
    cx = cy = size / 2.0
    if card:
        # Apple's macOS grid: an 824x824 rounded square inside 1024.
        s, r = 824 * u, 185.4 * u
        o = (size - s) / 2.0
        stroke = max(1.0, 3.0 * u)
        c.fill(round_rect(o, o, s, s, r), EDGE, ss)
        c.fill(round_rect(o + stroke, o + stroke, s - 2*stroke, s - 2*stroke,
                          r - stroke), WHITE, ss)
        # Below 64px the mark loses too much detail on the standard grid, so
        # let it grow into the card's margin a little.
        R = (312 if size > 64 else 348) * u
    else:
        R = 470 * u
    seg = 64 if size > 128 else 32
    c.fill(star(cx, cy, R), LIGHT, ss)
    L = L_RATIO * R
    w = W_RATIO * L
    for i in range(8):
        c.fill(petal(cx, cy, L, w, i * 45.0 + 22.5, bow=BOW, n=seg), DARK, ss)
    return c

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    sizes = [int(a) for a in sys.argv[2:]] or [1024]
    for s in sizes:
        render(s).png(os.path.join(out, f"{s}.png"))
        print("wrote", s)
