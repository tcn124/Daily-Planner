import { useSyncExternalStore } from 'react';

/**
 * `unconfigured`: no Supabase env vars (see client.ts) — every UI surface
 * that reads this must render nothing in that case, per Phase 0's "if the
 * vars are absent the app must run exactly as it does today."
 * `signed-out`: configured, but no session — the sign-in form shows.
 * `first-sync`: the one-time additive merge on a device's first connect.
 * `offline`: signed in, but the last attempt (or the browser itself) says
 * there's no network — local edits keep queuing.
 * `synced`: caught up as of `lastSyncedAt`.
 */
export type SyncPhase = 'unconfigured' | 'signed-out' | 'first-sync' | 'offline' | 'synced';

export interface SyncStatus {
  phase: SyncPhase;
  email: string | null;
  lastSyncedAt: number | null;
}

const initial: SyncStatus = { phase: 'unconfigured', email: null, lastSyncedAt: null };

let status: SyncStatus = initial;
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

/** Only `engine.ts` calls this — everything else reads via `useSyncStatus`. */
export function setSyncStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSyncStatus, () => initial);
}

/** "just now" / "2m ago" / "3h ago" / "5d ago" — coarse on purpose, this is ambient status, not a clock. */
export function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
