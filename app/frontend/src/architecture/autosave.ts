import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ArchitectureDocument } from './model';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'conflict' | 'error';

const DELAY_MS = 1000;

/**
 * Saves the Architecture 1s after the last change. Each save sends the version it is based on; a
 * 409 means another tab (or a Proposal) saved first, and autosave stops so nothing is overwritten.
 */
export function useAutosave(slug: string, initialVersion: number) {
  const auth = useAuth();
  const token = auth.status === 'signedIn' ? auth.token : undefined;
  const [status, setStatus] = useState<SaveStatus>('saved');

  const s = useRef({
    version: initialVersion,
    pending: undefined as ArchitectureDocument | undefined,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    saving: false,
    conflict: false,
    token,
    slug,
  });
  s.current.token = token;
  s.current.slug = slug;

  const flush = useCallback(async (keepalive = false): Promise<void> => {
    const st = s.current;
    clearTimeout(st.timer);
    if (st.saving || st.conflict || !st.pending) return;
    const document = st.pending;
    st.pending = undefined;
    st.saving = true;
    setStatus('saving');
    try {
      const res = await apiFetch<{ version: number }>(`/api/projects/${st.slug}/architecture`, {
        token: st.token,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: st.version, document }),
        keepalive,
      });
      st.version = res.version;
      st.saving = false;
      if (st.pending) {
        // Changes arrived while saving: save them on the normal schedule.
        setStatus('pending');
        st.timer = setTimeout(() => void flush(), DELAY_MS);
      } else {
        setStatus('saved');
      }
    } catch (err) {
      st.saving = false;
      if (err instanceof ApiError && err.status === 409) {
        st.conflict = true;
        setStatus('conflict');
      } else {
        st.pending ??= document;
        setStatus('error');
      }
    }
  }, []);

  const schedule = useCallback(
    (document: ArchitectureDocument) => {
      const st = s.current;
      if (st.conflict) return;
      st.pending = document;
      clearTimeout(st.timer);
      if (!st.saving) setStatus('pending');
      st.timer = setTimeout(() => void flush(), DELAY_MS);
    },
    [flush],
  );

  // Leaving the workspace saves what's pending right away; closing the tab asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (s.current.pending || s.current.saving) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void flush(true);
    };
  }, [flush]);

  return { status, schedule };
}
