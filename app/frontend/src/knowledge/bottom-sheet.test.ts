import { describe, expect, it } from 'vitest';
import { nearestSnap, snapHeights } from './bottom-sheet';

describe('bottom sheet snaps', () => {
  it('peeks at the handle and tabs, halves, and leaves a strip of canvas when full', () => {
    expect(snapHeights(800)).toEqual({ peek: 76, half: 400, full: 744 });
  });

  it('comes to rest on the nearest snap after a drag', () => {
    expect(nearestSnap(120, 800)).toBe('peek');
    expect(nearestSnap(300, 800)).toBe('half');
    expect(nearestSnap(620, 800)).toBe('full');
  });
});
