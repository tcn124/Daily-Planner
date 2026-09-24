import { useState } from 'react';
import { supabase } from './client';
import { useSyncStatus, type SyncStatus } from './status';

export interface SyncAuth {
  status: SyncStatus;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  submitting: boolean;
  signIn: () => void;
  signOut: () => void;
}

/**
 * The sign-in/out logic shared by the desktop `SettingsPanel` and the
 * phone's `PlannerSheet` — each renders its own markup around this, the way
 * every other piece of the two panels is a separate implementation rather
 * than a shared component.
 */
export function useSyncAuth(): SyncAuth {
  const status = useSyncStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function signIn(): void {
    if (!supabase || submitting) return;
    setSubmitting(true);
    setError(null);
    void supabase.auth.signInWithPassword({ email, password }).then(({ error: err }) => {
      setSubmitting(false);
      if (err) setError(err.message);
      else setPassword('');
    });
  }

  function signOut(): void {
    // Local data and the cursor both stay — this only stops syncing, per
    // status.ts's `signed-out` phase and engine.ts's `onSignedOut`.
    void supabase?.auth.signOut();
  }

  return { status, email, setEmail, password, setPassword, error, submitting, signIn, signOut };
}
