#!/usr/bin/env bash
# Regenerates the PWA icons in public/icons from the app mark.
#
# The source is src-tauri/icons/source.svg, rasterised by `qlmanage` (macOS's
# own renderer; `sips` cannot read SVG). The desktop icon is a rounded square
# with transparent corners, but iOS composites a home-screen icon onto its own
# mask, so rounded art would show slivers in the corners. The SVG is therefore
# rendered with its corner radius and clip removed, so the two flat colours run
# to the edge: full-bleed, no border. The maskable icon is the same full-bleed
# art, with no inset, so Android's mask never exposes a padding colour either.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT=public/icons
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

sed -E -e 's/ rx="[0-9.]+"//g' -e 's/ clip-path="url\(#[^)]*\)"//' \
  src-tauri/icons/source.svg > "$TMP/fullbleed.svg"
qlmanage -t -s 1024 -o "$TMP" "$TMP/fullbleed.svg" >/dev/null 2>&1

# Flatten to opaque: a round trip through JPEG is how sips drops the alpha
# channel; the art is flat colour, so quality 100 is lossless to the eye.
sips -s format jpeg -s formatOptions 100 "$TMP/fullbleed.svg.png" --out "$TMP/flat.jpg" >/dev/null
sips -s format png "$TMP/flat.jpg" --out "$TMP/flat.png" >/dev/null

for size in 180 192 512; do
  sips -z "$size" "$size" "$TMP/flat.png" --out "$OUT/icon-$size.png" >/dev/null
done
sips -z 512 512 "$TMP/flat.png" --out "$OUT/icon-512-maskable.png" >/dev/null

ls -l "$OUT"
