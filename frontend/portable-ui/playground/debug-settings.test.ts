// The Debug dialog's settings (debug-settings.ts): saved per browser, applied to the page and the library.
import { beforeAll, describe, expect, it, vi } from 'vitest';

type Debug = typeof import('./debug-settings');
let d: Debug;

beforeAll(async () => {
  // what this browser saved last time, and a system that asks for full motion
  localStorage.setItem('pg/debug', JSON.stringify({ skipOffscreen: false, slowMotion: true }));
  window.matchMedia = vi.fn((media: string) => ({ matches: false, media }) as MediaQueryList);
  d = await import('./debug-settings');
  d.installDebug();
});

describe('the debug settings', () => {
  it('start from what was saved, the rest from the defaults, and reach the page', () => {
    expect(d.debugSettings.get()).toEqual({ ...d.DEBUG_DEFAULTS, skipOffscreen: false, slowMotion: true });
    expect(document.documentElement.dataset.debugDrawAll).toBe('');
    expect(d.changedFromDefaults(d.debugSettings.get()).sort()).toEqual(['skipOffscreen', 'slowMotion']);
  });

  it('are saved and applied as they change', () => {
    d.debugSettings.set({ skipOffscreen: true, slowMotion: false });
    expect(JSON.parse(localStorage.getItem('pg/debug')!)).toMatchObject({ skipOffscreen: true, slowMotion: false });
    expect(document.documentElement.dataset.debugDrawAll).toBeUndefined();
  });

  it('say which changes wait for a reload', () => {
    expect(d.pendingReload(d.debugSettings.get())).toEqual([]);
    d.debugSettings.set({ helpers: false });
    expect(d.pendingReload(d.debugSettings.get())).toEqual(['helpers']);
  });

  it('make the page ask for reduced motion while motion is set to reduce', () => {
    const query = '(prefers-reduced-motion: reduce)';
    expect(window.matchMedia(query).matches).toBe(false);
    d.debugSettings.set({ motion: 'reduce' });
    expect(window.matchMedia(query).matches).toBe(true);
    expect(document.documentElement.dataset.debugMotion).toBe('');
    expect(window.matchMedia('(min-width: 600px)').matches).toBe(false); // other queries untouched
    d.debugSettings.set({ motion: 'system' });
    expect(window.matchMedia(query).matches).toBe(false);
  });

  it('go back to the defaults', () => {
    d.debugSettings.reset();
    expect(d.debugSettings.get()).toEqual(d.DEBUG_DEFAULTS);
    expect(d.changedFromDefaults(d.debugSettings.get())).toEqual([]);
    expect(document.documentElement.dataset.debugDrawAll).toBeUndefined();
  });
});

describe('the playground storage', () => {
  it("lists the playground's entries, and forgets all but the debug settings", () => {
    localStorage.setItem('pg/theme', 'dark');
    localStorage.setItem('ui/panes/v1/playground', '{}');
    localStorage.setItem('someone-else', 'x');
    const entries = d.playgroundStorage();
    expect(entries.map(({ key }) => key)).toEqual(['pg/debug', 'pg/theme', 'ui/panes/v1/playground']);
    expect(entries.find(({ key }) => key === 'pg/theme')?.bytes).toBe(8);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    d.resetPlaygroundStorage();
    vi.unstubAllGlobals();
    expect(reload).toHaveBeenCalled();
    expect(Object.keys(localStorage).sort()).toEqual(['pg/debug', 'someone-else']);
  });
});
