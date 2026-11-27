// The playground's URL and saved choices (route.ts): links that round-trip any name, values read
// back only when valid, and the theme the same way in the playground and the fixture view.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureHref, navigate, parseRoute, routeSearch, savedTheme, stored, themeFor } from './route';

const NAMES = ['plain', 'with spaces', 'a&b=c', 'hash#tag', 'one+two', 'per%cent', 'ünïcödé · ∂', 'tabs.exchange'];

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the route', () => {
  it('round-trips a theme, a size and an embedding', () => {
    const r = { theme: 'dark', size: 'phone', embed: '1' } as const;
    expect(parseRoute(routeSearch(r))).toEqual(r);
  });

  it('reads back only a theme, a size and an embedding the playground has', () => {
    expect(parseRoute('?view=lessons&theme=dark')).toEqual({ theme: 'dark', size: null, embed: null });
    expect(parseRoute('?theme=sepia')).toMatchObject({ theme: null });
    expect(parseRoute('')).toEqual({ theme: null, size: null, embed: null });
    expect(parseRoute('?size=watch&embed=2')).toMatchObject({ size: null, embed: null });
    expect(parseRoute('?embed=touch')).toMatchObject({ embed: 'touch' });
    expect(parseRoute('?size=tablet')).toMatchObject({ size: 'tablet' });
  });

  it('writes only what it sets', () => {
    expect(routeSearch({})).toBe('');
    expect(routeSearch({ theme: 'dark', size: null })).toBe('?theme=dark');
  });
});

describe('fixture links', () => {
  it('are encoded, so a name with &, #, + or spaces opens that fixture', () => {
    for (const name of NAMES) {
      const q = new URLSearchParams(fixtureHref('derived/views/frame', name));
      expect([q.get('fixture'), q.get('case')]).toEqual(['derived/views/frame', name]);
    }
    expect(new URLSearchParams(fixtureHref('base/button')).has('case')).toBe(false);
  });
});

describe('saved choices', () => {
  it('are used only while they are still valid', () => {
    localStorage.setItem('pg/theme', 'dark');
    expect(stored('pg/theme', ['light', 'dark'])).toBe('dark');
    localStorage.setItem('pg/theme', 'sepia');
    expect(stored('pg/theme', ['light', 'dark'])).toBeNull();
  });

  it('fall back to the defaults when storage is blocked (a private window)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(stored('pg/theme', ['light', 'dark'])).toBeNull();
  });
});

describe('the theme', () => {
  const system = (dark: boolean) => { window.matchMedia = vi.fn((media: string) => ({ matches: dark, media }) as MediaQueryList); };

  it('is the URL’s, then the saved one, then the system’s', () => {
    system(true);
    expect(themeFor('')).toBe('dark');
    localStorage.setItem('pg/theme', 'light');
    expect(themeFor('')).toBe('light');
    expect(themeFor('?theme=dark')).toBe('dark');
    expect(themeFor('?fixture=base%2Fbutton&theme=dark')).toBe('dark');
    // an unknown value is ignored, not taken as "light"
    expect(themeFor('?theme=sepia')).toBe('light');
    localStorage.setItem('pg/theme', 'purple');
    expect(savedTheme()).toBe('dark');
  });
});

describe('navigating', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('keeps the URL’s theme, and adds a history entry so Back returns', () => {
    history.replaceState(null, '', '/?theme=dark');
    const before = history.length;
    navigate({ size: 'phone' });
    expect(location.search).toBe('?theme=dark&size=phone');
    expect(history.length).toBe(before + 1);
    navigate({ size: 'phone', theme: 'light' }, 'replace');
    expect(location.search).toBe('?theme=light&size=phone');
    expect(history.length).toBe(before + 1);
  });
});
