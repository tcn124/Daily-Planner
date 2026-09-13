import { isTauri } from './platform';

/**
 * Ask the user to confirm a destructive action.
 *
 * `window.confirm` is NOT usable in the desktop build: Tauri's WebView returns
 * true without ever showing a dialog, which silently defeats every guard. The
 * native dialog plugin is the only reliable option there.
 */
export async function confirmAction(message: string): Promise<boolean> {
  if (isTauri()) {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(message, { title: 'Weekly Planner', kind: 'warning' });
  }
  return window.confirm(message);
}
