#!/usr/bin/env bash
# Regenerates the PWA icons in public/icons from the app mark.
#
# `sips` is macOS's own image tool, which is the whole point: no dependency to
# install, and the icons are reproducible on any Mac that can build the app.
# It cannot rasterise SVG, so the source is the 1024 PNG the Tauri icon set was
# made from rather than source.svg.
set -euo pipefail
cd "$(dirname "$0")/../.."

SRC=src-tauri/icons/source-1024.png
OUT=public/icons
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

# The mark has transparent corners outside its rounded rect. iOS composites a
# home-screen icon onto black, so those corners would come back as black
# slivers inside Apple's own (larger) mask. A round trip through JPEG is how
# sips flattens: the art is two flat colours, so quality 100 is lossless to
# the eye.
sips -s format jpeg -s formatOptions 100 "$SRC" --out "$TMP/flat.jpg" >/dev/null
sips -s format png "$TMP/flat.jpg" --out "$TMP/flat.png" >/dev/null

for size in 180 192 512; do
  sips -z "$size" "$size" "$TMP/flat.png" --out "$OUT/icon-$size.png" >/dev/null
done

# Maskable: Android crops to a circle inscribed in the middle 80%, so the art
# is inset to 72% and the rest is the mark's own white.
sips -z 369 369 "$TMP/flat.png" --out "$TMP/inset.png" >/dev/null
sips --padToHeightWidth 512 512 --padColor FFFFFF "$TMP/inset.png" \
  --out "$OUT/icon-512-maskable.png" >/dev/null

ls -l "$OUT"
