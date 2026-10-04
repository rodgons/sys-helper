import { useEffect, useState } from 'react';

/**
 * The height in px of what the User can see, for sizing the compact workspace above the
 * on-screen keyboard, or null to keep the CSS height (`100dvh`).
 *
 * Android follows the keyboard in CSS alone: the viewport meta's `interactive-widget=
 * resizes-content` makes `dvh` shrink. iOS Safari supports neither that nor the VirtualKeyboard
 * API; it keeps `dvh` full height and pans the visual viewport to reveal the focused field, which
 * pushes the workspace bar off the top. So while `active`, this follows `visualViewport.height`
 * and undoes the pan by scrolling the window back to the top. (Translating the shell by
 * `offsetTop` is the other candidate; the scroll reset stands until a real iPhone says otherwise.)
 * Without `visualViewport`, or while the User has pinch-zoomed the page, it does nothing.
 */
export function useKeyboardHeight(active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) {
      setHeight(null);
      return;
    }
    const follow = () => {
      if (Math.abs(viewport.scale - 1) > 0.01) {
        setHeight(null);
        return;
      }
      setHeight(Math.round(viewport.height));
      if (viewport.offsetTop > 0) window.scrollTo(0, 0);
    };
    follow();
    viewport.addEventListener('resize', follow);
    viewport.addEventListener('scroll', follow);
    return () => {
      viewport.removeEventListener('resize', follow);
      viewport.removeEventListener('scroll', follow);
    };
  }, [active]);

  return height;
}
