import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from './api';
import { useToken } from './auth';

export type Me = { displayName: string; avatarUrl: string };

/** One of a refused User's identities, as the 403 `not_allowed` body lists them. */
export type Identity = { provider: 'github' | 'google'; id: string; name: string };

/** The identities a `not_allowed` error lists, so the User knows what to ask for access with. */
export function refusedIdentities(err: unknown): Identity[] {
  const identities = err instanceof ApiError ? err.body?.identities : undefined;
  return Array.isArray(identities) ? (identities as Identity[]) : [];
}

/**
 * The signed-in User's profile: GitHub username, else Google name, else email. Fails with code `not_allowed` outside the beta allowlist.
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

/**
 * Deletes the signed-in User's account and everything they own. The server ends their session with
 * it, so the caller signs out afterwards.
 */
export function useDeleteAccount() {
  const token = useToken();
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/me', { token, method: 'DELETE' }),
  });
}
