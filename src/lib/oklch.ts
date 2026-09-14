/**
 * Minimal OKLab/OKLCH ↔ sRGB conversion (Björn Ottosson's matrices).
 *
 * Subject colours are generated at a fixed perceptual lightness and chroma so
 * that every hue reads with the same weight — which plain HSL cannot do, since
 * `hsl(h 100% 85%)` is far lighter at yellow than at blue.
 *
 * Everything is emitted as hex rather than a CSS `oklch()` colour so the
 * out-of-gamut clamp stays under our control: naive per-channel clipping turns
 * a saturated orange into a visibly wrong brown.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
} // each 0–1, may sit outside the sRGB gamut before clamping

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.089484177 * a - 1.291485548 * bb;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

export function rgbToOklch(rgb: Rgb): { L: number; C: number; h: number } {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return {
    L,
    C: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

function inGamut({ r, g, b }: Rgb): boolean {
  const ok = (c: number) => c >= -0.0001 && c <= 1.0001;
  return ok(r) && ok(g) && ok(b);
}

/**
 * Converts OKLCH to a hex string, reducing chroma until the colour fits inside
 * sRGB. Binary search converges well inside a pixel's worth of precision.
 */
export function oklchToHex(L: number, C: number, h: number): string {
  let rgb = oklchToRgb(L, C, h);

  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToRgb(L, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToRgb(L, lo, h);
  }

  const byte = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}`;
}

/**
 * Maps a stored HSL hue (0–359) onto the OKLCH hue wheel, so existing saved
 * subjects keep their colour identity without a data migration.
 *
 * The +8° correction compensates for the hue shift that appears when a fully
 * saturated HSL colour is re-expressed at the much lower chroma the design
 * uses; without it the blues drift violet.
 */
export function hslHueToOkHue(hslHue: number): number {
  const h = ((hslHue % 360) + 360) % 360;
  const c = 1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));

  let rgb: Rgb;
  if (h < 60) rgb = { r: c, g: x, b: 0 };
  else if (h < 120) rgb = { r: x, g: c, b: 0 };
  else if (h < 180) rgb = { r: 0, g: c, b: x };
  else if (h < 240) rgb = { r: 0, g: x, b: c };
  else if (h < 300) rgb = { r: x, g: 0, b: c };
  else rgb = { r: c, g: 0, b: x };

  return (rgbToOklch(rgb).h + 8) % 360;
}
