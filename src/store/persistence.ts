import type { Item, PlannerState, RecurringItem, Subject, TodoItem } from '../types';
import { createInitialState } from './defaults';
import { adoptLegacySettings } from './devicePrefs';
import { spanDates } from '../lib/recurring';
import { hexToHue } from '../lib/color';
import { isTauri } from '../lib/platform';

const KEY = 'planner.v1';

/** A tombstone older than this can no longer matter to a device that syncs. */
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Subjects used to store a hex `color`; they now store a `hue`. Convert on read
 * so a planner saved by an earlier build keeps its colours. Every record type
 * gained `updatedAt` at the same time sync was added; missing it means this
 * record predates sync entirely, so `0` is correct — it must lose to whatever
 * the server holds on first connect.
 */
function migrateSubjects(subjects: Subject[]): Subject[] {
  return subjects.map((s) => {
    const legacy = s as Subject & { color?: string; updatedAt?: number };
    const hue = typeof s.hue === 'number' || s.hue === null
      ? s.hue
      : legacy.color
        ? hexToHue(legacy.color)
        : null;
    return {
      id: s.id,
      name: s.name,
      hue,
      updatedAt: typeof legacy.updatedAt === 'number' ? legacy.updatedAt : 0,
    };
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
    Array.isArray(s.todos)
  );
  // `notes` is deliberately not required: states written before day notes
  // existed are still valid and get an empty map on read. Nor is `settings`,
  // which older saves carry and newer ones do not — see `stripSettings` — nor
  // `sync`, which is handled the same way by `migrateSync`.
}

/**
 * Recurring items used to carry one `done` flag for the whole span; they now
 * track completion per day. A span that was marked done becomes every day in
 * it checked off, so nothing the user had ticked is lost.
 */
function migrateRecurring(recurring: RecurringItem[]): RecurringItem[] {
  return recurring.map((r) => {
    const legacy = r as RecurringItem & { done?: boolean; updatedAt?: number };
    const { done, updatedAt, ...rest } = legacy;
    const doneDates = Array.isArray(rest.doneDates)
      ? rest.doneDates
      : done
        ? spanDates(rest as RecurringItem)
        : [];
    return { ...rest, doneDates, updatedAt: typeof updatedAt === 'number' ? updatedAt : 0 };
  });
}

/** Items gained a `details` line after v1 shipped; older saves have only the title. */
function migrateItems(items: Item[]): Item[] {
  return items.map((i) => {
    const legacy = i as Item & { updatedAt?: number };
    return {
      ...i,
      details: typeof i.details === 'string' ? i.details : '',
      updatedAt: typeof legacy.updatedAt === 'number' ? legacy.updatedAt : 0,
    };
  });
}

/** To-dos predate sync too; the same 0-means-never-synced rule applies. */
function migrateTodos(todos: TodoItem[]): TodoItem[] {
  return todos.map((t) => {
    const legacy = t as TodoItem & { updatedAt?: number };
    return { ...t, updatedAt: typeof legacy.updatedAt === 'number' ? legacy.updatedAt : 0 };
  });
}

/**
 * Day notes arrived after v1 shipped, so older saves simply have none. A note
 * used to be a bare string; it now carries its own `updatedAt` the same way
 * every other record does, once sync needs one to compare.
 */
function migrateNotes(notes: unknown): PlannerState['notes'] {
  if (typeof notes !== 'object' || notes === null) return {};
  const result: PlannerState['notes'] = {};
  for (const [date, value] of Object.entries(notes as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[date] = { text: value, updatedAt: 0 };
    } else if (typeof value === 'object' && value !== null && 'text' in value) {
      const v = value as { text: unknown; updatedAt?: unknown };
      if (typeof v.text === 'string') {
        result[date] = { text: v.text, updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0 };
      }
    }
  }
  return result;
}

/**
 * `sync` is device-local bookkeeping, never part of a backup — see
 * `withoutSync`. On a normal load it's real state and must survive, just
 * shape-checked the way everything else here is; a tombstone older than
 * `TOMBSTONE_MAX_AGE_MS` can no longer matter to any device and is dropped so
 * the map doesn't grow forever.
 */
function migrateSync(sync: unknown): PlannerState['sync'] {
  const s = (typeof sync === 'object' && sync !== null ? sync : {}) as Partial<
    PlannerState['sync']
  >;
  const deleted = typeof s.deleted === 'object' && s.deleted !== null ? s.deleted : {};
  const ticks = typeof s.ticks === 'object' && s.ticks !== null ? s.ticks : {};
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  return {
    deleted: Object.fromEntries(
      Object.entries(deleted).filter(([, t]) => typeof t === 'number' && t >= cutoff),
    ),
    ticks: Object.fromEntries(
      Object.entries(ticks).filter(([, t]) => typeof t === 'number'),
    ),
  };
}

/** Strips device-local sync bookkeeping before a state is written to a backup. */
function withoutSync(state: PlannerState): Omit<PlannerState, 'sync'> {
  const { sync: _sync, ...rest } = state;
  return rest;
}

/**
 * View settings used to live in here. They are device state, not planner
 * state, so they now belong to `devicePrefs` — but a planner saved by an
 * earlier build still carries them, and a backup file always will. Hand them
 * over on the way past (only ever adopted on a device that has none of its
 * own) and drop the field.
 */
function stripSettings(parsed: PlannerState): PlannerState {
  const { settings, ...rest } = parsed as PlannerState & { settings?: unknown };
  adoptLegacySettings(settings);
  return rest;
}

export function loadState(): PlannerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitialState();
    const parsed: unknown = JSON.parse(raw);
    if (!isPlannerState(parsed)) return createInitialState();
    return stripSettings({
      ...parsed,
      subjects: migrateSubjects(parsed.subjects),
      items: migrateItems(parsed.items),
      recurring: migrateRecurring(parsed.recurring),
      todos: migrateTodos(parsed.todos),
      notes: migrateNotes(parsed.notes),
      sync: migrateSync((parsed as PlannerState & { sync?: unknown }).sync),
    });
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
  // A backup's own view settings are ignored: importing someone's planner
  // should not move this screen to the day they happened to be looking at.
  // Its sync bookkeeping is dropped the same way — a backup never has any,
  // since `exportState` never writes it, but an older backup predating sync
  // is handled identically by `migrateSync` defaulting to empty.
  return stripSettings({
    ...parsed,
    subjects: migrateSubjects(parsed.subjects),
    items: migrateItems(parsed.items),
    recurring: migrateRecurring(parsed.recurring),
    todos: migrateTodos(parsed.todos),
    notes: migrateNotes(parsed.notes),
    sync: migrateSync(undefined),
  });
}

export async function exportState(state: PlannerState): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `planner-backup-${stamp}.json`;
  const json = JSON.stringify(withoutSync(state), null, 2);

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
