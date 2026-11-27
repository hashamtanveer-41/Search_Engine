import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from './theme';

afterEach(() => { vi.useRealTimers(); document.documentElement.removeAttribute('data-theme'); document.documentElement.style.colorScheme = ''; });

describe('switching the theme', () => {
  it('writes it to the page at once, with every transition off until the style has been worked out', () => {
    vi.useFakeTimers();
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    const freeze = document.querySelector('style[data-theme-switch]');
    expect(freeze?.textContent).toContain('transition:none!important');
    // the theme button's sun and moon are left to move
    expect(freeze?.textContent).toContain(':not([data-theme-morph],[data-theme-morph] *)');
    vi.runAllTimers();
    expect(document.querySelector('style[data-theme-switch]')).toBeNull();
  });

  it('crossfades where the browser can: the theme changes inside the view transition, marked while it plays', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const updates: (() => void)[] = [];
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => { updates.push(update); return { finished: new Promise<void>((ok) => { finish = ok; }) }; },
    });
    try {
      applyTheme('dark');
      // the old page is still what is there until the browser runs the update
      expect(document.documentElement.dataset.theme).not.toBe('dark');
      expect(document.documentElement.hasAttribute('data-theme-fading')).toBe(true);
      // asked again before it has run (React's effect after the click): no second crossfade
      applyTheme('dark');
      expect(updates).toHaveLength(1);
      updates[0]();
      expect(document.documentElement.dataset.theme).toBe('dark');
      vi.runAllTimers();
      finish();
      await Promise.resolve();
      await Promise.resolve();
      expect(document.documentElement.hasAttribute('data-theme-fading')).toBe(false);
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('does nothing when the page is in that theme already', () => {
    vi.useFakeTimers();
    applyTheme('light');
    vi.runAllTimers();
    applyTheme('light');
    expect(document.querySelector('style[data-theme-switch]')).toBeNull();
  });
});
