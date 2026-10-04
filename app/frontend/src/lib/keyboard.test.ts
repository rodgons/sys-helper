import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardHeight } from './keyboard';

/** A stand-in for `window.visualViewport` whose size the test sets. */
function stubViewport(height: number) {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  return {
    viewport,
    resize(next: Partial<typeof viewport>) {
      Object.assign(viewport, next);
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
    },
  };
}

describe('useKeyboardHeight', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the visual viewport as the keyboard opens and closes', () => {
    const { resize } = stubViewport(844);
    const { result } = renderHook(() => useKeyboardHeight(true));
    expect(result.current).toBe(844);

    resize({ height: 508.4 });
    expect(result.current).toBe(508);
    resize({ height: 844 });
    expect(result.current).toBe(844);
  });

  it("undoes Safari's pan by scrolling back to the top", () => {
    const { resize } = stubViewport(844);
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderHook(() => useKeyboardHeight(true));

    resize({ height: 500, offsetTop: 280 });

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does nothing when inactive, without visualViewport or while pinch-zoomed', () => {
    const { resize } = stubViewport(844);
    const inactive = renderHook(() => useKeyboardHeight(false));
    expect(inactive.result.current).toBeNull();

    const zoomed = renderHook(() => useKeyboardHeight(true));
    resize({ scale: 2, height: 422 });
    expect(zoomed.result.current).toBeNull();

    vi.stubGlobal('visualViewport', undefined);
    expect(renderHook(() => useKeyboardHeight(true)).result.current).toBeNull();
  });
});
