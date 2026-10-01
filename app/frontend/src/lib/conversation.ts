import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, baseUrl } from './api';
import { useAuth } from './auth';
import { slugSuffix } from './projects';
import { readEvents } from './sse';

export type Message = { role: 'user' | 'assistant'; body: string; createdAt: string };

function useToken() {
  const auth = useAuth();
  return auth.status === 'signedIn' ? auth.token : undefined;
}

const key = (slug: string) => ['messages', slugSuffix(slug)];

/** The Project's Conversation, oldest message first. */
export function useMessages(slug: string) {
  const token = useToken();
  return useQuery({
    queryKey: key(slug),
    queryFn: () => apiFetch<Message[]>(`/api/projects/${slug}/messages`, { token }),
    enabled: token !== undefined,
  });
}

export function useSendMessage(slug: string) {
  const token = useToken();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<Message>(`/api/projects/${slug}/messages`, {
        token,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),
    onSuccess: (message) =>
      client.setQueryData<Message[]>(key(slug), (list) => [...(list ?? []), message]),
  });
}

export type ReplyState =
  | { status: 'idle' }
  | { status: 'streaming'; text: string }
  | { status: 'failed'; code: string };

/**
 * Asks the AI to answer the Conversation's last User message and streams its reply. The server
 * saves the reply only when it completes, so a failure leaves nothing behind and `start` retries.
 */
export function useReply(slug: string) {
  const token = useToken();
  const client = useQueryClient();
  const [state, setState] = useState<ReplyState>({ status: 'idle' });
  const abort = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: 'streaming', text: '' });
    try {
      const res = await fetch(`${baseUrl}/api/projects/${slug}/reply`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
        setState({ status: 'failed', code: body?.error ?? 'ai_failed' });
        return;
      }
      let text = '';
      for await (const { event, data } of readEvents(res.body)) {
        if (event === 'delta') {
          text += (data as { text: string }).text;
          setState({ status: 'streaming', text });
        } else if (event === 'done') {
          client.setQueryData<Message[]>(key(slug), (list) => [...(list ?? []), data as Message]);
          setState({ status: 'idle' });
          return;
        } else if (event === 'error') {
          break;
        }
      }
      setState({ status: 'failed', code: 'ai_failed' });
    } catch {
      if (!controller.signal.aborted) setState({ status: 'failed', code: 'ai_failed' });
    }
  }, [client, slug, token]);

  return { state, start };
}
