#!/usr/bin/env python3
"""Renders every icon asset the Tauri bundle needs from a real SVG source.

Mirrors build.py exactly (same size list, same .iconset/.ico assembly) —
only the render call differs, since svg_source.render() takes the source
path as an argument.
"""
import os, struct, sys
import svg_source as S

SVG = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
os.makedirs(OUT, exist_ok=True)

ICNS   = [16, 32, 64, 128, 256, 512, 1024]
ICO    = [16, 32, 48, 64, 128, 256]
SQUARE = [30, 44, 71, 89, 107, 142, 150, 284, 310]
NAMED  = {32: "32x32.png", 64: "64x64.png", 128: "128x128.png",
          256: "128x128@2x.png", 512: "icon.png", 50: "StoreLogo.png"}

sizes = sorted(set(ICNS + ICO + SQUARE + list(NAMED)))
cache = {}
for s in sizes:
    cache[s] = os.path.join(OUT, f"_{s}.png")
    S.render(SVG, s).png(cache[s])
    print(f"  rendered {s}px", flush=True)

def read(s):
    with open(cache[s], "rb") as f:
        return f.read()

iconset = os.path.join(OUT, "icon.iconset")
os.makedirs(iconset, exist_ok=True)
for base in (16, 32, 128, 256, 512):
    open(os.path.join(iconset, f"icon_{base}x{base}.png"), "wb").write(read(base))
    open(os.path.join(iconset, f"icon_{base}x{base}@2x.png"), "wb").write(read(base * 2))

blobs = [(s, read(s)) for s in ICO]
hdr = struct.pack("<HHH", 0, 1, len(blobs))
offset = 6 + 16 * len(blobs)
entries, body = b"", b""
for s, data in blobs:
    entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32,
                           len(data), offset)
    body += data
    offset += len(data)
open(os.path.join(OUT, "icon.ico"), "wb").write(hdr + entries + body)

for s, name in NAMED.items():
    open(os.path.join(OUT, name), "wb").write(read(s))
for s in SQUARE:
    open(os.path.join(OUT, f"Square{s}x{s}Logo.png"), "wb").write(read(s))

print("assets written to", OUT)
