/**
 * Subjects are stored as a single hue (0–359). Every colour the UI needs is
 * derived from it, matching the three-tone card treatment in the Figma design:
 * a pale fill, a saturated label, and a faint description tone.
 *
 * Reference values from the design — Math #b5bdff / #3749e7 / #6d7ae8 and
 * Biology #b5ffbf / #23ba50 / #71e682 — sit almost exactly on these curves.
 *
 * A `null` hue means "no colour" and uses the neutral greys the design gives
 * the Meeting card.
 */

const NEUTRAL_FILL = '#ededed';
const NEUTRAL_LABEL = '#8c8c8c';
const NEUTRAL_DESC = '#cbcbcb';

/** Card / bar background. */
export function subjectFill(hue: number | null): string {
  return hue === null ? NEUTRAL_FILL : `hsl(${hue} 100% 85%)`;
}

/** Subject name, the 3px marker bar, and dropdown swatches. */
export function subjectLabel(hue: number | null): string {
  return hue === null ? NEUTRAL_LABEL : `hsl(${hue} 72% 45%)`;
}

/** Description line — deliberately low contrast against the fill. */
export function subjectDesc(hue: number | null): string {
  return hue === null ? NEUTRAL_DESC : `hsl(${hue} 68% 66%)`;
}

/** Faint tint used behind larger surfaces such as the list-view row hover. */
export function subjectTint(hue: number | null): string {
  return hue === null ? '#f5f5f5' : `hsl(${hue} 100% 95%)`;
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
