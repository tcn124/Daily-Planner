import type { PlannerState, Subject } from '../types';
import { startOfWeek, todayISO } from '../lib/dates';

/**
 * Hues drawn from SWATCH_HUES so a fresh planner's subjects land exactly on the
 * swatches offered in the edit-planner panel, rather than opening the custom
 * hue bar on first edit. Meeting and Other stay neutral grey.
 */
export const SEED_SUBJECTS: Subject[] = [
  { id: 'economics', name: 'Economics', hue: 225 },
  { id: 'political-science', name: 'Political Science', hue: 266 },
  { id: 'journalism', name: 'Journalism', hue: 29 },
  { id: 'history', name: 'History', hue: 139 },
  { id: 'meeting', name: 'Meeting', hue: null },
  { id: 'other', name: 'Other', hue: null },
];

/** Bounds on how many day columns the week view may show. */
export const MIN_DAYS = 1;
export const MAX_DAYS = 14;

/** Coerces any stored or requested day count into a whole number within bounds. */
export function clampDays(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 7;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, v));
}

/** Starting hue offered when a new subject is created. */
export const DEFAULT_HUE = 210;

/** The design's 1.35 / 0.95 / 1 band flex ratios, scaled to whole numbers. */
export const DEFAULT_BAND_WEIGHTS: [number, number, number] = [135, 95, 100];

export function createInitialState(): PlannerState {
  return {
    version: 1,
    subjects: SEED_SUBJECTS,
    items: [],
    recurring: [],
    todos: [],
    notes: {},
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
