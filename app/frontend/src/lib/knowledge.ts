import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch } from './api';
import { useToken } from './auth';
import { slugSuffix } from './projects';

// Keep in sync with internal/knowledge in the backend.
export const CATEGORIES = [
  { value: 'scale', label: 'Scale' },
  { value: 'performance', label: 'Performance' },
  { value: 'availability', label: 'Availability' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'security', label: 'Security' },
  { value: 'cost', label: 'Cost' },
  { value: 'constraints', label: 'Constraints' },
  { value: 'functional', label: 'Functional' },
] as const;

export const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' },
] as const;

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const levelLabel = (l: string) => LEVELS.find((x) => x.value === l)?.label ?? l;

export type Requirement = { id: string; category: string; statement: string };

export type Decision = {
  id: string;
  title: string;
  rationale: string;
  pattern: string;
  /** The catalog Pattern `pattern` names, if any (matched by the server). */
  patternId?: string;
  alternative: string;
  requirements: string[];
  targets: string[];
  author: 'user' | 'ai';
  needsReview: boolean;
};

export type DecisionInput = Pick<
  Decision,
  'title' | 'rationale' | 'pattern' | 'alternative' | 'requirements'
>;

export type Knowledge = {
  experienceLevel: string;
  requirements: Requirement[];
  decisions: Decision[];
};

const key = (slug: string) => ['knowledge', slugSuffix(slug)];

/** The Project's Experience Level, Requirements and Decisions. */
export function useKnowledge(slug: string) {
  const token = useToken();
  return useQuery({
    queryKey: key(slug),
    queryFn: () => apiFetch<Knowledge>(`/api/projects/${slug}/knowledge`, { token }),
    enabled: token !== undefined,
  });
}

/** Reloads the knowledge, e.g. after a Proposal is accepted or a canvas save pruned Decisions. */
export function useRefreshKnowledge(slug: string) {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: key(slug) }), [client, slug]);
}

/**
 * All knowledge edits. Each one reloads the knowledge afterwards, since the server also updates
 * related items (e.g. flagging Decisions when a Requirement they cite changes).
 */
export function useKnowledgeActions(slug: string) {
  const token = useToken();
  const refresh = useRefreshKnowledge(slug);
  const call = (method: string, path: string, body?: unknown) =>
    apiFetch<unknown>(`/api/projects/${slug}${path}`, {
      token,
      method,
      ...(body !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  const settled = { onSettled: refresh };

  return {
    addRequirement: useMutation({
      mutationFn: (r: { category: string; statement: string }) => call('POST', '/requirements', r),
      ...settled,
    }),
    updateRequirement: useMutation({
      mutationFn: ({ id, ...patch }: { id: string; category?: string; statement?: string }) =>
        call('PATCH', `/requirements/${id}`, patch),
      ...settled,
    }),
    removeRequirement: useMutation({
      mutationFn: (id: string) => call('DELETE', `/requirements/${id}`),
      ...settled,
    }),
    addDecision: useMutation({
      mutationFn: (d: DecisionInput & { targets: string[] }) => call('POST', '/decisions', d),
      ...settled,
    }),
    updateDecision: useMutation({
      mutationFn: ({ id, ...patch }: Partial<DecisionInput> & { id: string }) =>
        call('PATCH', `/decisions/${id}`, patch),
      ...settled,
    }),
    removeDecision: useMutation({
      mutationFn: (id: string) => call('DELETE', `/decisions/${id}`),
      ...settled,
    }),
    setExperienceLevel: useMutation({
      mutationFn: (level: string) => call('PUT', '/experience-level', { level }),
      ...settled,
    }),
  };
}
