import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useToken } from './auth';

/** An entry's text for each Experience Level, as light Markdown. */
export type LevelTexts = { beginner: string; intermediate: string; expert: string };

/** A known design pattern. Decisions name it by `id` (`patternId`), matched on the server. */
export type Pattern = {
  id: string;
  name: string;
  aliases: string[];
  gist: string;
  reference: string;
  explanations: LevelTexts;
};

/** The explanation of a Component Type (every one but Custom has one). */
export type ComponentTypeExplanation = {
  type: string;
  name: string;
  gist: string;
  reference: string;
  explanations: LevelTexts;
};

export type Explanations = { patterns: Pattern[]; componentTypes: ComponentTypeExplanation[] };

/**
 * The catalog of Pattern and Component Type explanations. It is the same for every Project and
 * changes only with a deploy, so it is read once.
 */
export function useExplanations() {
  const token = useToken();
  return useQuery({
    queryKey: ['explanations'],
    queryFn: () => apiFetch<Explanations>('/api/explanations', { token }),
    enabled: token !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
