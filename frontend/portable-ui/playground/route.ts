// How the playground is drawn, as a URL, so a link opens on the same thing:
//
//   ?theme=dark                          it wins over the saved theme
//   ?size=phone                          drawn in a frame that wide (phone, tablet, desktop)
//   ?embed=1                             the playground inside that frame: no header of its own
//   ?embed=touch                         …inside a Phone or Tablet frame: and a mouse in it is a finger (touch.ts)
//   ?fixture=base/button&case=sizes      one fixture alone (FixtureView.tsx); `?fixtures` lists them
//
// A value is used only when it is one the playground has: anything else takes the saved choice,
// then the default. Links are built with URLSearchParams, so any name (spaces, &, #, +) survives.
import * as React from 'react';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const SIZES = ['phone', 'tablet', 'desktop'] as const;
export type Size = (typeof SIZES)[number];
/** Each size's width: a common phone, a tablet held upright, a laptop. */
export const SIZE_WIDTH: Record<Size, number> = { phone: 390, tablet: 768, desktop: 1280 };
/** A phone's and a tablet's height, held upright (a laptop's is the window's). */
export const SIZE_HEIGHT: Record<Size, number | null> = { phone: 844, tablet: 1024, desktop: null };

export interface Route {
  /** null: the saved theme, else the system's */
  theme: Theme | null;
  /** null: the whole window; else the playground is drawn in a frame this wide */
  size: Size | null;
  /** the playground inside that frame ('touch': a Phone or Tablet frame, where a mouse is a finger) */
  embed: '1' | 'touch' | null;
}

const KEYS = ['theme', 'size', 'embed'] as const;

const one = <T extends string>(v: string | null, allowed: readonly T[]): T | null => (v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null);

export function parseRoute(search: string): Route {
  const q = new URLSearchParams(search);
  return { theme: one(q.get('theme'), THEMES), size: one(q.get('size'), SIZES), embed: one(q.get('embed'), ['1', 'touch'] as const) };
}

/** The search string for a route: only what it sets. */
export function routeSearch(r: Partial<Route>): string {
  const q = new URLSearchParams();
  for (const k of KEYS) if (r[k]) q.set(k, r[k]);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** A link to one fixture set in the fixture view, or to one case of it. */
export function fixtureHref(component: string, name?: string): string {
  return `?${new URLSearchParams(name ? { fixture: component, case: name } : { fixture: component })}`;
}

// ------------------------------------------------------------------ saved choices

/** What this browser saved under `key`, if it is still one of `allowed` (a tab since renamed is not). */
export function stored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try { return one(localStorage.getItem(key), allowed); } catch { return null; }
}

export function store(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private window */ }
}

/** The saved theme, else the system's. */
export function savedTheme(): Theme {
  return stored('pg/theme', THEMES) ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

/** The theme to draw in, the same in the playground and the fixture view: the URL's, the saved one, the system's. */
export const themeFor = (search: string): Theme => parseRoute(search).theme ?? savedTheme();

// ------------------------------------------------------------------ the current route, live

const listeners = new Set<() => void>();
const changed = () => { for (const f of listeners) f(); };
if (typeof window !== 'undefined') window.addEventListener('popstate', changed);
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const search = () => (typeof location === 'undefined' ? '' : location.search);

/** Goes to a route: a new history entry, so Back returns (`replace` for the same place, redrawn). The URL's theme, size and embedding stay unless `r` sets them. */
export function navigate(r: Partial<Route>, how: 'push' | 'replace' = 'push'): void {
  const now = parseRoute(location.search);
  const next = routeSearch({ theme: now.theme, size: now.size, embed: now.embed, ...r });
  if (next === location.search) return;
  history[how === 'push' ? 'pushState' : 'replaceState'](null, '', `${location.pathname}${next}`);
  changed();
}

/** The route now, read again when the reader navigates (links, Back and Forward). */
export function useRoute(): Route {
  const now = React.useSyncExternalStore(subscribe, search, search);
  return React.useMemo(() => parseRoute(now), [now]);
}

/** A full link to a route, for copying. */
export const linkTo = (r: Partial<Route>): string => `${location.origin}${location.pathname}${routeSearch(r)}`;
