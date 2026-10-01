import { useQuery } from '@tanstack/react-query';
import type { ArchitectureDocument } from '../architecture/model';
import { apiFetch } from './api';
import { useAuth } from './auth';
import { slugSuffix } from './projects';

export type VersionedArchitecture = { version: number; document: ArchitectureDocument };

/** The Project's saved Architecture. Read once per visit: the canvas owns it while open. */
export function useArchitecture(slug: string) {
  const auth = useAuth();
  const token = auth.status === 'signedIn' ? auth.token : undefined;
  return useQuery({
    queryKey: ['architecture', slugSuffix(slug)],
    queryFn: () => apiFetch<VersionedArchitecture>(`/api/projects/${slug}/architecture`, { token }),
    enabled: token !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
}
