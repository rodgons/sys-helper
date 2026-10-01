import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useToken } from './auth';

/** A Project as the API shows it: identified by its slug, which follows renames. */
export type Project = { slug: string; name: string; updatedAt: string };

/** The fixed part of a Project Slug; it alone identifies the Project. */
export const slugSuffix = (slug: string) => slug.slice(slug.lastIndexOf('-') + 1);

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** The User's Projects, most recently updated first. */
export function useProjects() {
  const token = useToken();
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Project[]>('/api/projects', { token }),
    enabled: token !== undefined,
  });
}

export function useProject(slug: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['project', slugSuffix(slug)],
    queryFn: () => apiFetch<Project>(`/api/projects/${slug}`, { token }),
    enabled: token !== undefined,
  });
}

export function useCreateProject() {
  const token = useToken();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Project>('/api/projects', { token, ...json('POST', { name }) }),
    onSuccess: (project) => {
      client.setQueryData(['project', slugSuffix(project.slug)], project);
      return client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRenameProject(slug: string) {
  const token = useToken();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Project>(`/api/projects/${slug}`, { token, ...json('PATCH', { name }) }),
    onSuccess: (project) => {
      client.setQueryData(['project', slugSuffix(project.slug)], project);
      return client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject(slug: string) {
  const token = useToken();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/api/projects/${slug}`, { token, method: 'DELETE' }),
    onSuccess: () => {
      // Drop it from the cached list right away, so nothing redirects back to it before the refetch.
      client.setQueryData<Project[]>(['projects'], (list) =>
        list?.filter((p) => slugSuffix(p.slug) !== slugSuffix(slug)),
      );
      return client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
