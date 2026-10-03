import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { useAutosave } from './autosave';
import type { ArchitectureDocument } from './model';

const PATH = 'PUT /api/projects/shop-k3xa9q2m7p/architecture';
const doc = (name: string): ArchitectureDocument => ({
  components: [{ id: 'a', type: 'service', name, position: { x: 0, y: 0 } }],
  connections: [],
});

let schedule: (d: ArchitectureDocument) => void = () => {};
let commit: ReturnType<typeof useAutosave>['commit'] = async () => {};

function Probe({ version = 0 }: { version?: number }) {
  const autosave = useAutosave('shop-k3xa9q2m7p', version);
  schedule = autosave.schedule;
  commit = autosave.commit;
  return <output>{autosave.status}</output>;
}

function stubSave(reply: (body: { version: number; document: ArchitectureDocument }) => unknown) {
  const save = vi.fn(({ json }: { json?: unknown }) => reply(json as never));
  vi.stubGlobal('fetch', vi.fn(mockApi({ [PATH]: save })));
  return save;
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(1000));

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once, 1s after the last change, with the latest document', async () => {
    const save = stubSave((b) => ({ version: b.version + 1 }));
    renderWithQuery(<Probe />, { auth: signedIn() });

    act(() => schedule(doc('one')));
    await act(() => vi.advanceTimersByTimeAsync(600));
    act(() => schedule(doc('two')));
    expect(screen.getByRole('status')).toHaveTextContent('pending');
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(save).not.toHaveBeenCalled();
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].json).toEqual({ version: 0, document: doc('two') });
    expect(screen.getByRole('status')).toHaveTextContent('saved');
  });

  it('bases each save on the version the previous one created', async () => {
    const save = stubSave((b) => ({ version: b.version + 1 }));
    renderWithQuery(<Probe version={4} />, { auth: signedIn() });

    act(() => schedule(doc('one')));
    await flush();
    act(() => schedule(doc('two')));
    await flush();

    expect(save.mock.calls.map((c) => (c[0].json as { version: number }).version)).toEqual([4, 5]);
  });

  it('stops saving after a conflict', async () => {
    const save = stubSave(() => ({ status: 409, body: { error: 'conflict' } }));
    renderWithQuery(<Probe />, { auth: signedIn() });

    act(() => schedule(doc('one')));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('conflict');

    act(() => schedule(doc('two')));
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports failures and retries on the next change', async () => {
    let fail = true;
    const save = stubSave((b) =>
      fail ? { status: 500, body: { error: 'internal' } } : { version: b.version + 1 },
    );
    renderWithQuery(<Probe />, { auth: signedIn() });

    act(() => schedule(doc('one')));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('error');

    fail = false;
    act(() => schedule(doc('two')));
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('saved');
  });

  it('saves pending changes right away when unmounted', async () => {
    const save = stubSave((b) => ({ version: b.version + 1 }));
    const { unmount } = renderWithQuery(<Probe />, { auth: signedIn() });

    act(() => schedule(doc('one')));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].keepalive).toBe(true);
  });

  it('saves a document too big for keepalive with a plain request when unmounted', async () => {
    // Browsers refuse keepalive bodies over 64 KiB, which would drop the save.
    const save = stubSave((b) => ({ version: b.version + 1 }));
    const { unmount } = renderWithQuery(<Probe />, { auth: signedIn() });

    act(() => schedule(doc('x'.repeat(70_000))));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].keepalive).toBe(false);
  });

  it('commits through another request after the save in progress, with its version', async () => {
    let release = () => {};
    const save = vi.fn(
      (b: { version: number }) =>
        new Promise<unknown>((resolve) => {
          release = () => resolve({ version: b.version + 1 });
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(mockApi({ [PATH]: ({ json }: { json?: unknown }) => save(json as never) })),
    );
    renderWithQuery(<Probe version={4} />, { auth: signedIn() });
    act(() => schedule(doc('edited')));
    await flush(); // the autosave is now in flight
    const send = vi.fn(async (version: number) => version + 1);

    const committed = commit(doc('accepted'), send);
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await committed;
    });

    expect(send).toHaveBeenCalledWith(5, doc('accepted'));
    expect(screen.getByRole('status')).toHaveTextContent('saved');
    act(() => schedule(doc('later')));
    await flush();
    expect((save.mock.calls[1]?.[0] as { version: number } | undefined)?.version).toBe(6);
  });

  it('keeps earlier edits scheduled when a commit fails', async () => {
    const save = stubSave((b) => ({ version: b.version + 1 }));
    renderWithQuery(<Probe />, { auth: signedIn() });
    act(() => schedule(doc('edited')));

    await act(() =>
      commit(doc('accepted'), () => Promise.reject(new Error('offline'))).catch(() => {}),
    );
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].json).toEqual({ version: 0, document: doc('edited') });
  });
});
