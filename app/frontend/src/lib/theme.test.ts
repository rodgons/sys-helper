import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTheme, readThemeChoice, setThemeChoice, THEME_KEY, useThemeChoice } from './theme';

function themeColorMetas() {
  document.head.innerHTML = `
    <meta name="theme-color" data-scheme="light" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" data-scheme="dark" content="#0d0a12" media="(prefers-color-scheme: dark)" />`;
  const meta = (scheme: string) =>
    document.head.querySelector(`meta[data-scheme="${scheme}"]`) as HTMLMetaElement;
  return { light: meta('light'), dark: meta('dark') };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  document.head.innerHTML = '';
});

describe('theme', () => {
  it('follows the system until the User chooses', () => {
    expect(readThemeChoice()).toBe('system');
    const { result } = renderHook(() => useThemeChoice());
    expect(result.current).toBe('system');
  });

  it('remembers a choice and forces it on the page', () => {
    const { result } = renderHook(() => useThemeChoice());

    act(() => setThemeChoice('light'));

    expect(result.current).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('goes back to the system scheme', () => {
    setThemeChoice('dark');

    setThemeChoice('system');

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readThemeChoice()).toBe('system');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(readThemeChoice()).toBe('system');
  });

  it('still switches when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readThemeChoice()).toBe('system');
    setThemeChoice('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies the stored choice at start-up', () => {
    localStorage.setItem(THEME_KEY, 'dark');

    initTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('points the browser theme color at the chosen scheme', () => {
    const { light, dark } = themeColorMetas();

    setThemeChoice('dark');
    expect(light.media).toBe('not all');
    expect(dark.media).toBe('all');

    setThemeChoice('system');
    expect(light.media).toBe('(prefers-color-scheme: light)');
    expect(dark.media).toBe('(prefers-color-scheme: dark)');
  });
});
