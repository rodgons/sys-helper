import { describe, expect, it } from 'vitest';
import { COMPACT_QUERY } from './breakpoints';
import { media } from './tokens.stylex';

const rem = (query: string, feature: string) =>
  Number(new RegExp(`${feature}: ([\\d.]+)rem`).exec(query)?.[1]);

describe('COMPACT_QUERY', () => {
  it('names the width just below media.lg', () => {
    const lg = rem(media.lg, 'min-width');
    const compact = rem(COMPACT_QUERY, 'max-width');

    expect(lg).toBe(64);
    expect(lg - compact).toBeCloseTo(0.01);
  });
});
