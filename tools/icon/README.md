# App icon

The icon is generated, not hand-drawn. `make_icon.py` describes the mark
geometrically and rasterises it; `build.py` renders every size the bundles
need. Nothing here is required to build the app — run it only to change the
icon.

```bash
python3 tools/icon/build.py /tmp/icons          # render all sizes
iconutil -c icns /tmp/icons/icon.iconset -o /tmp/icons/icon.icns
cp /tmp/icons/{icon.icns,icon.ico,icon.png,32x32.png,64x64.png,\
128x128.png,128x128@2x.png,StoreLogo.png,Square*Logo.png} src-tauri/icons/
```

There is no SVG rasteriser on this machine (no rsvg-convert, ImageMagick,
Pillow or cairosvg), which is why `make_icon.py` carries its own scanline
filler and PNG writer. Every size is rendered natively rather than downscaled
from one master, so small sizes stay crisp.

## The mark

An 8-point star with 8 teardrop petals seated in its notches:

- star tips at radius `R`, notches at `0.62R`, alternating every 22.5°
- each petal is the convex hull of the centre point and its round cap, so it
  comes to a true point at the middle and the sides stay nearly straight
- petals reach `L_RATIO`×R — the notch radius — so each cap seats exactly in
  the crook between two star points
- below 64px the mark grows into the card's margin, since the standard macOS
  grid leaves it too small to read

Tunables live at the top of `make_icon.py`: `L_RATIO`, `W_RATIO`, `BOW`, and
the `LIGHT` / `DARK` colours.
