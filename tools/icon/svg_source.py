#!/usr/bin/env python3
"""Renders the app icon from a real SVG source instead of hand-authored
geometry — the mark's own coordinates and colours, not an eyeballed guess
at them.

Uses `xml.etree.ElementTree` (stdlib) for document structure, and a small
hand-written parser for the `d` path mini-language, since ElementTree only
understands XML tags/attributes, not SVG path syntax. Flattening reuses
`cubic()` from make_icon.py — the same Bezier flattener the hand-authored
petals are built from — so a curved path command becomes exactly the kind
of polygon `Canvas.fill()` already knows how to rasterise.

Supported: <rect>, <path> with M/L/H/V/C/S/A/Z (absolute and relative,
including implicit command repetition), and `fill` / `fill-opacity` /
`opacity`. Not supported: <g>/transform (this file has none), gradients,
filters, embedded images, <polygon>/<circle>, and multiple subpaths within
one `d` (each `M` after the first is treated as its own independently
filled shape — correct for solid marks like this one, but would not carve
a hole the way one `d` with two subpaths and a fill rule can).
"""
import math
import re
import xml.etree.ElementTree as ET

from make_icon import Canvas, cubic, hexrgb, round_rect

SVG_NS = "{http://www.w3.org/2000/svg}"

# ------------------------------------------------------------- path parsing

_TOKEN_RE = re.compile(r"[A-Za-z]|[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?")

def _tokenize(d):
    out = []
    for m in _TOKEN_RE.finditer(d):
        t = m.group()
        out.append(t if t[0].isalpha() else float(t))
    return out

def _flatten_arc(x1, y1, rx, ry, rot_deg, large_arc, sweep, x2, y2, n=48):
    """Endpoint-to-centre arc parameterisation, per the SVG spec's own
    pseudocode. Untested against this particular file (it has no `A`
    commands) but included so a future export that uses rounded caps via
    arcs, rather than the cubic approximation Figma sometimes emits, works
    without revisiting this module."""
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)]
    phi = math.radians(rot_deg)
    cphi, sphi = math.cos(phi), math.sin(phi)
    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0
    x1p = cphi * dx2 + sphi * dy2
    y1p = -sphi * dx2 + cphi * dy2
    rx, ry = abs(rx), abs(ry)
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        s = math.sqrt(lam)
        rx *= s
        ry *= s
    sign = -1.0 if large_arc == sweep else 1.0
    num = rx**2 * ry**2 - rx**2 * y1p**2 - ry**2 * x1p**2
    den = rx**2 * y1p**2 + ry**2 * x1p**2
    co = sign * math.sqrt(max(num, 0.0) / den) if den else 0.0
    cxp, cyp = co * (rx * y1p / ry), co * (-ry * x1p / rx)
    cx = cphi * cxp - sphi * cyp + (x1 + x2) / 2.0
    cy = sphi * cxp + cphi * cyp + (y1 + y2) / 2.0

    def ang(ux, uy, vx, vy):
        denom = math.hypot(ux, uy) * math.hypot(vx, vy)
        cosv = max(-1.0, min(1.0, (ux * vx + uy * vy) / denom))
        a = math.acos(cosv)
        return -a if (ux * vy - uy * vx) < 0 else a

    theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dtheta > 0:
        dtheta -= 2 * math.pi
    if sweep and dtheta < 0:
        dtheta += 2 * math.pi
    pts = []
    for i in range(1, n + 1):
        t = theta1 + dtheta * i / n
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        pts.append((cphi * ex - sphi * ey + cx, sphi * ex + cphi * ey + cy))
    return pts

def parse_path(d, n=48):
    """`d` -> list of subpaths, each a flattened list of (x, y) points."""
    tokens = _tokenize(d)
    subpaths, cur = [], []
    cx = cy = sx = sy = 0.0
    last_ctrl = None
    cmd = None
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if isinstance(t, str):
            cmd = t
            i += 1
        if cmd in ("M", "m"):
            x, y = tokens[i], tokens[i + 1]
            i += 2
            if cmd == "m" and cur:
                x, y = x + cx, y + cy
            if cur:
                subpaths.append(cur)
            cur = [(x, y)]
            cx, cy, sx, sy, last_ctrl = x, y, x, y, None
            cmd = "L" if cmd == "M" else "l"       # bare pairs after M are lineto
        elif cmd in ("L", "l"):
            x, y = tokens[i], tokens[i + 1]
            i += 2
            if cmd == "l":
                x, y = x + cx, y + cy
            cur.append((x, y)); cx, cy, last_ctrl = x, y, None
        elif cmd in ("H", "h"):
            x = tokens[i]; i += 1
            if cmd == "h":
                x += cx
            cur.append((x, cy)); cx, last_ctrl = x, None
        elif cmd in ("V", "v"):
            y = tokens[i]; i += 1
            if cmd == "v":
                y += cy
            cur.append((cx, y)); cy, last_ctrl = y, None
        elif cmd in ("C", "c"):
            x1, y1, x2, y2, x, y = tokens[i:i + 6]; i += 6
            if cmd == "c":
                x1, y1, x2, y2, x, y = x1+cx, y1+cy, x2+cx, y2+cy, x+cx, y+cy
            cur.extend(cubic((cx, cy), (x1, y1), (x2, y2), (x, y), n))
            cx, cy, last_ctrl = x, y, (x2, y2)
        elif cmd in ("S", "s"):
            x2, y2, x, y = tokens[i:i + 4]; i += 4
            if cmd == "s":
                x2, y2, x, y = x2+cx, y2+cy, x+cx, y+cy
            x1, y1 = ((2*cx - last_ctrl[0], 2*cy - last_ctrl[1])
                      if last_ctrl is not None else (cx, cy))
            cur.extend(cubic((cx, cy), (x1, y1), (x2, y2), (x, y), n))
            cx, cy, last_ctrl = x, y, (x2, y2)
        elif cmd in ("A", "a"):
            rx, ry, rot, laf, sf, x, y = tokens[i:i + 7]; i += 7
            if cmd == "a":
                x, y = x + cx, y + cy
            cur.extend(_flatten_arc(cx, cy, rx, ry, rot, laf, sf, x, y, n))
            cx, cy, last_ctrl = x, y, None
        elif cmd in ("Z", "z"):
            cx, cy, last_ctrl = sx, sy, None
        else:
            raise ValueError(f"unsupported path command {cmd!r} in: {d[:60]}...")
    if cur:
        subpaths.append(cur)
    return subpaths

# --------------------------------------------------------------- document

class Doc:
    def __init__(self, size, background, shapes):
        self.size = size                # (width, height) of the SVG's own canvas
        self.background = background    # rgb tuple, or None
        self.shapes = shapes            # [(points, rgb, alpha), ...]

def _paint(el, default_rgb=(0.0, 0.0, 0.0)):
    fill = el.get("fill")
    if fill in ("none", None):
        return None
    rgb = hexrgb(fill) if fill.startswith("#") else default_rgb
    alpha = float(el.get("fill-opacity", 1.0)) * float(el.get("opacity", 1.0))
    return rgb, alpha

def load(path):
    root = ET.parse(path).getroot()
    vb = root.get("viewBox")
    if vb:
        _, _, w, h = (float(v) for v in vb.split())
    else:
        w, h = float(root.get("width")), float(root.get("height"))

    background = None
    shapes = []
    for el in root:
        tag = el.tag.removeprefix(SVG_NS)
        paint = _paint(el)
        if paint is None:
            continue
        rgb, alpha = paint
        if tag == "rect":
            x, y = float(el.get("x", 0)), float(el.get("y", 0))
            rw, rh = float(el.get("width")), float(el.get("height"))
            pts = [(x, y), (x + rw, y), (x + rw, y + rh), (x, y + rh)]
            if x == 0 and y == 0 and rw == w and rh == h and alpha == 1.0:
                background = rgb            # full-canvas rect -> the card's background
            else:
                shapes.append((pts, rgb, alpha))
        elif tag == "path":
            for sub in parse_path(el.get("d", "")):
                shapes.append((sub, rgb, alpha))
        # <g>/transform, <polygon>, <circle> intentionally unsupported —
        # this file (and Figma's flat-shape exports generally) doesn't use them.
    return Doc((w, h), background, shapes)

# ------------------------------------------------------------------ render

def render(svg_path, size, card=True, ss=None):
    doc = load(svg_path)
    c = Canvas(size)
    u = size / 1024.0
    ss = ss or (24 if size <= 64 else 16 if size <= 256 else 8)

    if card:
        s, r = 824 * u, 185.4 * u
        o = (size - s) / 2.0
        c.fill(round_rect(o, o, s, s, r), doc.background or (1.0, 1.0, 1.0), ss)
        vb_w, vb_h = doc.size
        scale = s / max(vb_w, vb_h)
        ox, oy = o + (s - vb_w * scale) / 2.0, o + (s - vb_h * scale) / 2.0
    else:
        vb_w, vb_h = doc.size
        scale = size / max(vb_w, vb_h)
        ox = oy = 0.0

    def T(pts):
        return [(ox + x * scale, oy + y * scale) for x, y in pts]

    for pts, rgb, alpha in doc.shapes:
        c.fill(T(pts), rgb, ss, alpha)
    return c

if __name__ == "__main__":
    import os, sys
    svg_path, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sizes = [int(a) for a in sys.argv[3:]] or [1024]
    for s in sizes:
        render(svg_path, s).png(os.path.join(out, f"{s}.png"))
        print("wrote", s)
