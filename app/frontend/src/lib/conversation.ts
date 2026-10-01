import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Proposal } from '../architecture/proposal';
import { apiFetch, baseUrl } from './api';
import { useAuth } from './auth';
import { slugSuffix } from './projects';
import { readEvents } from './sse';

export type Message = {
  role: 'user' | 'assistant';
  body: string;
  createdAt: string;
  /** Set on AI messages that proposed changes to the canvas. */
  proposal?: Proposal;
};

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
          const message = data as Message;
          client.setQueryData<Message[]>(key(slug), (list = []) => [
            // A new Proposal supersedes the pending one, as on the server.
            ...(message.proposal
              ? list.map((m) => withStatus(m, (p) => p.status === 'pending', 'superseded'))
              : list),
            message,
          ]);
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

function withStatus(
  m: Message,
  match: (p: Proposal) => boolean,
  status: Proposal['status'],
): Message {
  return m.proposal && match(m.proposal) ? { ...m, proposal: { ...m.proposal, status } } : m;
}

/** Records a resolved Proposal in the cached Conversation. */
export function useSetProposalStatus(slug: string) {
  const client = useQueryClient();
  return useCallback(
    (seq: number, status: Proposal['status']) =>
      client.setQueryData<Message[]>(key(slug), (list) =>
        list?.map((m) => withStatus(m, (p) => p.seq === seq, status)),
      ),
    [client, slug],
  );
}

/** Reloads the Conversation, e.g. after learning a Proposal was resolved elsewhere. */
export function useRefreshMessages(slug: string) {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: key(slug) }), [client, slug]);
}

/** The Project's pending Proposal, if any (there is at most one). */
export function usePendingProposal(slug: string): Proposal | undefined {
  const messages = useMessages(slug);
  return messages.data?.findLast((m) => m.proposal?.status === 'pending')?.proposal;
}
