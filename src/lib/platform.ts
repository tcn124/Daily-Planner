/** True when running inside the Tauri desktop shell rather than a browser tab. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
