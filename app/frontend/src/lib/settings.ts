import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from './auth';

/** The User's settings across Projects. An empty `experienceLevel` means no default. */
export type Settings = { experienceLevel: string };

const key = ['settings'];

function useToken() {
  const auth = useAuth();
  return auth.status === 'signedIn' ? auth.token : undefined;
}

export function useSettings() {
  const token = useToken();
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<Settings>('/api/settings', { token }),
    enabled: token !== undefined,
  });
}

/**
 * Saves the settings. Projects without their own Experience Level show the default, so every
 * Project's knowledge reloads too.
 */
export function useSaveSettings() {
  const token = useToken();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) =>
      apiFetch<Settings>('/api/settings', {
        token,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    onSuccess: (saved) => {
      client.setQueryData(key, saved);
      return client.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}
