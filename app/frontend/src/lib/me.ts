import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useToken } from './auth';

export type Me = { username: string; avatarUrl: string };

/**
 * The signed-in User's GitHub profile. Fails with code `not_allowed` outside the beta allowlist.
 * Keyed by token, but a token refresh keeps the previous profile while it refetches, so pages gated
 * on it (`RequireUser`) never unmount mid-session.
 */
export function useMe() {
  const token = useToken();
  return useQuery({
    queryKey: ['me', token],
    queryFn: () => apiFetch<Me>('/api/me', { token }),
    enabled: token !== undefined,
    placeholderData: keepPreviousData,
  });
}
