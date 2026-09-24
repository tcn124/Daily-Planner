import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * `null` when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are absent — the
 * state of every checkout before Phase 0 (creating the Supabase project) is
 * done. Every other module in `src/sync` must treat that as "sync doesn't
 * exist here," not as an error: the app has to run exactly as it does today
 * with no env vars set, with no sync UI and nothing thrown.
 */
export const supabase: SupabaseClient | null = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
})();

export function isSyncConfigured(): boolean {
  return supabase !== null;
}
