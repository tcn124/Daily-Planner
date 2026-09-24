/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absent until Phase 0 (Supabase project setup) is done on this checkout. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
