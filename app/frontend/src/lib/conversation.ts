import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from './auth';
import { slugSuffix } from './projects';

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
