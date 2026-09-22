import type { PlannerState, RecurringItem, Subject } from '../types';
import { clampDays, createInitialState } from './defaults';
import { spanDates } from '../lib/recurring';
import { hexToHue } from '../lib/color';
import { isTauri } from '../lib/platform';

const KEY = 'planner.v1';

/**
 * Subjects used to store a hex `color`; they now store a `hue`. Convert on read
 * so a planner saved by an earlier build keeps its colours.
 */
function migrateSubjects(subjects: Subject[]): Subject[] {
  return subjects.map((s) => {
    if (typeof s.hue === 'number' || s.hue === null) return s;
    const legacy = (s as Subject & { color?: string }).color;
    return { id: s.id, name: s.name, hue: legacy ? hexToHue(legacy) : null };
  });
}

/**
 * Shape check that is strict enough to reject junk but forgiving enough that a
 * partially-written state still loads. Anything unrecognised falls back to a
 * fresh planner rather than throwing — losing a session beats a white screen.
 */
function isPlannerState(value: unknown): value is PlannerState {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<PlannerState>;
  return (
    s.version === 1 &&
    Array.isArray(s.subjects) &&
    Array.isArray(s.items) &&
    Array.isArray(s.recurring) &&
    Array.isArray(s.todos) &&
    typeof s.settings === 'object' &&
    s.settings !== null
  );
  // `notes` is deliberately not required: states written before day notes
  // existed are still valid and get an empty map on read.
}

/**
 * Recurring items used to carry one `done` flag for the whole span; they now
 * track completion per day. A span that was marked done becomes every day in
 * it checked off, so nothing the user had ticked is lost.
 */
function migrateRecurring(recurring: RecurringItem[]): RecurringItem[] {
  return recurring.map((r) => {
    if (Array.isArray(r.doneDates)) return r;
    const { done, ...rest } = r as RecurringItem & { done?: boolean };
    return { ...rest, doneDates: done ? spanDates(rest as RecurringItem) : [] };
  });
}

/** Day notes arrived after v1 shipped, so older saves simply have none. */
function migrateNotes(notes: unknown): Record<string, string> {
  if (typeof notes !== 'object' || notes === null) return {};
  return Object.fromEntries(
    Object.entries(notes as Record<string, unknown>).filter(
      ([, v]) => typeof v === 'string',
    ),
  ) as Record<string, string>;
}

export function loadState(): PlannerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitialState();
    const parsed: unknown = JSON.parse(raw);
    if (!isPlannerState(parsed)) return createInitialState();
    // Merge settings over defaults so a state written by an older build that
    // lacks a newer setting still opens. Rebuilt field by field rather than
    // spread, so settings dropped in later versions don't linger forever.
    const base = createInitialState();
    const merged = { ...base.settings, ...parsed.settings };
    return {
      ...parsed,
      subjects: migrateSubjects(parsed.subjects),
      recurring: migrateRecurring(parsed.recurring),
      notes: migrateNotes(parsed.notes),
      settings: {
        daysVisible: clampDays(merged.daysVisible),
        anchorDate: merged.anchorDate,
        view: merged.view,
        bandWeights: merged.bandWeights,
        // Saves written before the Today tab existed simply aren't in it.
        daysBeforeToday:
          typeof merged.daysBeforeToday === 'number'
            ? clampDays(merged.daysBeforeToday)
            : null,
      },
    };
  } catch {
    return createInitialState();
  }
}

export function saveState(state: PlannerState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled — the app keeps working in memory.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Validates and normalises backup text. Shared by both platforms so the desktop
 * and browser paths cannot drift apart.
 */
function parseBackup(text: string): PlannerState {
  const parsed: unknown = JSON.parse(text);
  if (!isPlannerState(parsed)) {
    throw new Error('That file is not a planner backup.');
  }
  const base = createInitialState();
  return {
    ...parsed,
    subjects: migrateSubjects(parsed.subjects),
    recurring: migrateRecurring(parsed.recurring),
    notes: migrateNotes(parsed.notes),
    settings: {
      ...base.settings,
      ...parsed.settings,
      daysVisible: clampDays(parsed.settings.daysVisible ?? base.settings.daysVisible),
    },
  };
}

export async function exportState(state: PlannerState): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `planner-backup-${stamp}.json`;
  const json = JSON.stringify(state, null, 2);

  if (isTauri()) {
    // WKWebView never fires `<a download>`, so go through a native save panel.
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return; // cancelled
    await writeTextFile(path, json);
    return;
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Reads a backup the user picks. Resolves null if they cancel. */
async function pickBackupText(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof path !== 'string') return null; // cancelled
    return readTextFile(path);
  }

  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Opens a picker and returns the imported state, or null if cancelled.
 * Throws with a readable message when the file is not a planner backup.
 */
export async function importState(): Promise<PlannerState | null> {
  const text = await pickBackupText();
  return text === null ? null : parseBackup(text);
}
