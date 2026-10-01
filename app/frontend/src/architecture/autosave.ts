import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { useToken } from '../lib/auth';
import type { ArchitectureDocument } from './model';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'conflict' | 'error';

const DELAY_MS = 1000;

/**
 * Saves the Architecture 1s after the last change. Each save sends the version it is based on; a
 * 409 means another tab (or a Proposal) saved first, and autosave stops so nothing is overwritten.
 */
export function useAutosave(slug: string, initialVersion: number, onSaved?: () => void) {
  const token = useToken();
  const [status, setStatus] = useState<SaveStatus>('saved');

  const s = useRef({
    version: initialVersion,
    pending: undefined as ArchitectureDocument | undefined,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    saving: false,
    // Settles when the save in progress finishes; commit waits on it.
    inflight: undefined as Promise<void> | undefined,
    conflict: false,
    token,
    slug,
    onSaved,
  });
  s.current.token = token;
  s.current.slug = slug;
  s.current.onSaved = onSaved;

  const flush = useCallback(async (keepalive = false): Promise<void> => {
    const st = s.current;
    clearTimeout(st.timer);
    if (st.saving || st.conflict || !st.pending) return;
    const document = st.pending;
    st.pending = undefined;
    st.saving = true;
    const settled = track(st);
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
      st.onSaved?.();
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
    } finally {
      settled();
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

  /**
   * Saves `document` through `send` instead of the usual endpoint (accepting a Proposal saves the
   * canvas and resolves the Proposal in one request). Waits for any save in progress, sends the
   * current version, and adopts the version `send` returns. Rethrows `send`'s errors.
   */
  const commit = useCallback(
    async (
      document: ArchitectureDocument,
      send: (version: number, document: ArchitectureDocument) => Promise<number>,
    ) => {
      const st = s.current;
      clearTimeout(st.timer);
      while (st.inflight) await st.inflight;
      if (st.conflict) throw new ApiError(409, 'conflict', 'the architecture changed elsewhere');
      const earlier = st.pending;
      st.pending = undefined;
      st.saving = true;
      const settled = track(st);
      setStatus('saving');
      try {
        st.version = await send(st.version, document);
        st.saving = false;
        setStatus(st.pending ? 'pending' : 'saved');
      } catch (err) {
        st.saving = false;
        if (err instanceof ApiError && err.code === 'conflict') {
          st.conflict = true;
          setStatus('conflict');
        } else {
          st.pending ??= earlier; // the edits it would have included still need saving
          setStatus(st.pending ? 'pending' : 'saved');
        }
        throw err;
      } finally {
        settled();
        if (st.pending && !st.conflict) st.timer = setTimeout(() => void flush(), DELAY_MS);
      }
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

  return { status, schedule, commit };
}

/** Marks a save as in progress until the returned function is called. */
function track(st: { inflight: Promise<void> | undefined }) {
  let settle = () => {};
  st.inflight = new Promise((resolve) => {
    settle = resolve;
  });
  return () => {
    st.inflight = undefined;
    settle();
  };
}
