/**
 * Subjects are stored as a single hue (0–359). Every colour the UI needs is
 * derived from it at a fixed perceptual lightness and chroma, matching the
 * subject chips in the design canvas (see `design/`).
 *
 * Derivation happens in OKLCH rather than HSL: across the four seeded subjects
 * the design's measured HSL saturations swing from 32 (History's green) to 78
 * (Journalism's orange), while in OKLCH the same swatches sit at near-constant
 * lightness and chroma. One OKLCH formula reproduces all of them; no single
 * HSL formula can.
 *
 * A `null` hue means "no colour" and uses the neutral greys the design gives
 * the Meeting subject.
 */

import { hslHueToOkHue, oklchToHex } from './oklch';

const NEUTRAL_CHIP_BG = '#eeeeeb';
const NEUTRAL_CHIP_INK = '#6a6862';
const NEUTRAL_ACCENT = '#9b9a94';
const NEUTRAL_TINT = '#f7f7f5';

/*
 * L and C below are fitted against the design's four seeded subjects, chosen to
 * minimise the worst-case error rather than the average. The design's own
 * swatches are hand-picked and not internally consistent — their chip-ink
 * chroma alone ranges 0.077–0.124 — so no single constant reproduces all four
 * exactly. Minimax keeps every subject equally close instead of nailing two and
 * visibly missing the others.
 */

/** Subject chip background — on cards, list rows, and the composer. */
export function subjectChipBg(hue: number | null): string {
  return hue === null ? NEUTRAL_CHIP_BG : oklchToHex(0.946, 0.021, hslHueToOkHue(hue));
}

/** Subject chip text, sitting on `subjectChipBg`. */
export function subjectChipInk(hue: number | null): string {
  return hue === null ? NEUTRAL_CHIP_INK : oklchToHex(0.412, 0.089, hslHueToOkHue(hue));
}

/** Sidebar dot, recurring bar's left border, swatch buttons. */
export function subjectAccent(hue: number | null): string {
  return hue === null ? NEUTRAL_ACCENT : oklchToHex(0.612, 0.123, hslHueToOkHue(hue));
}

/** Faint tint used behind larger surfaces such as the list-view row hover. */
export function subjectTint(hue: number | null): string {
  return hue === null ? NEUTRAL_TINT : oklchToHex(0.97, 0.012, hslHueToOkHue(hue));
}

/**
 * Converts a legacy stored hex colour into a hue so planners saved by an
 * earlier build keep their subject colours. Greys (no saturation) become null.
 */
export function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.02) return null; // grey — keep it neutral

  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  return Math.round((h * 60 + 360) % 360);
}
