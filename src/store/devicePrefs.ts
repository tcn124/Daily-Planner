import { useSyncExternalStore } from 'react';
import type { DaysVisible, ViewMode } from '../types';
import { addDays, startOfWeek, todayISO } from '../lib/dates';
import { clampDays, DEFAULT_BAND_WEIGHTS } from './defaults';
import { MOBILE_QUERY } from '../lib/useIsMobile';

/**
 * Everything about *where this device is looking*, kept out of the planner.
 *
 * `PlannerState` is the blob that will sync between the desktop app and the
 * phone, and none of this belongs in it: which day is on screen, how many
 * columns fit, which tab is open and how tall the bands are are properties of
 * a screen, not of a planner. Syncing them would mean scrolling to Friday on
 * a phone scrolls the Mac to Friday too.
 *
 * So the planner holds content — subjects, items, recurring, to-dos, notes —
 * and this holds the view. The two are stored under different keys and never
 * merge.
 */

const KEY = 'planner.device.v1';

export type MobileTab = 'week' | 'list' | 'planner';

/** How many day columns the phone shows. The desktop's count is separate. */
export type MobileDays = 1 | 2 | 3;

export interface DevicePrefs {
  /* ---- Desktop ------------------------------------------------------- */
  daysVisible: DaysVisible;
  /** 'YYYY-MM-DD' — leftmost day of the visible window. */
  anchorDate: string;
  view: ViewMode;
  /**
   * Relative heights of the Assignments / Events / Recurring bands. Weights
   * rather than pixels, so the grid still stretches to fill any window size.
   */
  bandWeights: [number, number, number];
  /**
   * Set only while the Today tab is selected: the day count to put back when
   * it is deselected. Its presence is what marks that tab active, so both the
   * mode and the count it borrowed survive a restart.
   */
  daysBeforeToday: DaysVisible | null;

  /* ---- Phone --------------------------------------------------------- */
  mobileDays: MobileDays;
  /** Whether the details line shows under a title. One setting for every view. */
  detailsVisible: boolean;
  tab: MobileTab;
}

/**
 * Where a device that has never been opened before starts.
 *
 * The desktop shows seven days, so it starts on Monday and today is somewhere
 * in the middle. A phone shows one, and that one has to be today — opening a
 * fresh install on Monday of the current week is how you get "Nothing on
 * Monday" on a Wednesday, and it is the reason the phone design has no Today
 * tab to get back with.
 *
 * Only ever the first run; after that the stored anchor is wherever the device
 * was left.
 */
function defaults(): DevicePrefs {
  const phone = typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
  return {
    daysVisible: 7,
    anchorDate: phone ? todayISO() : startOfWeek(todayISO()),
    view: 'grid',
    bandWeights: [...DEFAULT_BAND_WEIGHTS] as [number, number, number],
    daysBeforeToday: null,
    mobileDays: 1,
    detailsVisible: true,
    tab: 'week',
  };
}

function isTab(v: unknown): v is MobileTab {
  return v === 'week' || v === 'list' || v === 'planner';
}

function isMobileDays(v: unknown): v is MobileDays {
  return v === 1 || v === 2 || v === 3;
}

function isView(v: unknown): v is ViewMode {
  return v === 'grid' || v === 'list';
}

function isWeights(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number');
}

/**
 * Field by field over a base, so a value written by a later build that we no
 * longer understand falls back instead of poisoning the whole object.
 */
function coerce(raw: unknown, base: DevicePrefs): DevicePrefs {
  if (typeof raw !== 'object' || raw === null) return base;
  const p = raw as Partial<DevicePrefs>;
  return {
    daysVisible: clampDays(p.daysVisible ?? base.daysVisible),
    anchorDate: typeof p.anchorDate === 'string' ? p.anchorDate : base.anchorDate,
    view: isView(p.view) ? p.view : base.view,
    bandWeights: isWeights(p.bandWeights) ? p.bandWeights : base.bandWeights,
    daysBeforeToday:
      typeof p.daysBeforeToday === 'number' ? clampDays(p.daysBeforeToday) : null,
    mobileDays: isMobileDays(p.mobileDays) ? p.mobileDays : base.mobileDays,
    detailsVisible:
      typeof p.detailsVisible === 'boolean' ? p.detailsVisible : base.detailsVisible,
    tab: isTab(p.tab) ? p.tab : base.tab,
  };
}

function load(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerce(JSON.parse(raw), defaults()) : defaults();
  } catch {
    return defaults();
  }
}

/**
 * Whether this device had preferences of its own before the split. Read once,
 * so the legacy adoption below is decided on the state at startup rather than
 * on whatever the first write leaves behind.
 */
let hadStored = false;
try {
  hadStored = localStorage.getItem(KEY) !== null;
} catch {
  /* storage disabled — treat as a fresh device */
}

let current: DevicePrefs = load();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(next: DevicePrefs): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode or a full quota — the app keeps working in memory.
  }
  for (const listener of listeners) listener();
}

/** Merges a patch. Writes through immediately: these are taps, not keystrokes. */
export function setDevicePrefs(patch: Partial<DevicePrefs>): void {
  write({ ...current, ...patch });
}

export function useDevicePrefs(): DevicePrefs {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

/** Read outside React — for the odd call site that has no hook to hand. */
export function devicePrefs(): DevicePrefs {
  return current;
}

/* ---- View actions ------------------------------------------------------ */

export function setAnchor(anchorDate: string): void {
  setDevicePrefs({ anchorDate });
}

/** One day per press, regardless of how many days are on screen. */
export function shiftAnchor(direction: -1 | 1): void {
  setDevicePrefs({ anchorDate: addDays(current.anchorDate, direction) });
}

/** Today is always the leftmost column, whatever the window size. */
export function goToToday(): void {
  setDevicePrefs({ anchorDate: todayISO() });
}

export function setDays(days: number): void {
  // Picking a count by hand takes over from the Today tab, which deselects it
  // and drops the count it was holding.
  setDevicePrefs({ daysVisible: clampDays(days), daysBeforeToday: null });
}

export function setBandWeights(weights: [number, number, number]): void {
  setDevicePrefs({ bandWeights: weights });
}

/** Choosing any view tab deselects Today and restores its day count. */
export function setView(view: ViewMode): void {
  setDevicePrefs({
    view,
    daysVisible: current.daysBeforeToday ?? current.daysVisible,
    daysBeforeToday: null,
  });
}

/**
 * The Today tab is a single day, on today, over whatever the week view was
 * showing. `daysBeforeToday` both marks the tab selected and holds the count
 * to give back, so pressing Today twice must not overwrite it.
 */
export function focusToday(): void {
  setDevicePrefs({
    view: 'grid',
    anchorDate: todayISO(),
    daysVisible: 1,
    daysBeforeToday: current.daysBeforeToday ?? current.daysVisible,
  });
}

/* ---- Migration --------------------------------------------------------- */

/**
 * Takes the view settings out of a planner saved before the split, so the app
 * reopens where it was left rather than snapping back to this week.
 *
 * Only ever runs on a device that had no preferences of its own, and only
 * once: StrictMode double-invokes the reducer initializer that calls this, and
 * an import replaces planner state while this device's view should stay put.
 */
let adopted = false;
export function adoptLegacySettings(legacy: unknown): void {
  if (hadStored || adopted) return;
  adopted = true;
  if (typeof legacy !== 'object' || legacy === null) return;
  write(coerce(legacy, current));
}
