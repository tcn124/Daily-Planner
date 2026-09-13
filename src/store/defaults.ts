import type { PlannerState, Subject } from '../types';
import { startOfWeek, todayISO } from '../lib/dates';

/**
 * Hues matched to the original Figma swatches — 228 reproduces #d2dbff, 267
 * #d9baff, 27 #ffca9f, 139 #c5f5d4. Meeting and Other stay neutral grey.
 */
export const SEED_SUBJECTS: Subject[] = [
  { id: 'economics', name: 'Economics', hue: 228 },
  { id: 'political-science', name: 'Political Science', hue: 267 },
  { id: 'journalism', name: 'Journalism', hue: 27 },
  { id: 'history', name: 'History', hue: 139 },
  { id: 'meeting', name: 'Meeting', hue: null },
  { id: 'other', name: 'Other', hue: null },
];

/** Starting hue offered when a new subject is created. */
export const DEFAULT_HUE = 210;

/** The design's 244 / 162 / 256px bands, expressed as ratios. */
export const DEFAULT_BAND_WEIGHTS: [number, number, number] = [244, 162, 256];

export function createInitialState(): PlannerState {
  return {
    version: 1,
    subjects: SEED_SUBJECTS,
    items: [],
    recurring: [],
    todos: [],
    settings: {
      daysVisible: 7,
      anchorDate: startOfWeek(todayISO()),
      view: 'grid',
      bandWeights: [...DEFAULT_BAND_WEIGHTS] as [number, number, number],
    },
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
