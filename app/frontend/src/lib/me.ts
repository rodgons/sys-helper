import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from './auth';

export type Me = { username: string; avatarUrl: string };

/** The signed-in User's GitHub profile. Fails with code `not_allowed` outside the beta allowlist. */
export function useMe() {
  const auth = useAuth();
  const token = auth.status === 'signedIn' ? auth.token : undefined;
  return useQuery({
    queryKey: ['me', token],
    queryFn: () => apiFetch<Me>('/api/me', { token }),
    enabled: token !== undefined,
  });
}
