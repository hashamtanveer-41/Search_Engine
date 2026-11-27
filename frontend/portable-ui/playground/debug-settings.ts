// The Debug dialog's settings (Debug.tsx), saved per browser in localStorage `pg/debug`, and what
// each one does to the page: set once before the playground draws (main.tsx) and again on every
// change. Each turns off one of the library's shortcuts, or shows something it does unseen.
import { useSyncExternalStore } from 'react';

export type Motion = 'system' | 'reduce';

export interface DebugSettings {
  /** off screen, a widget frame is neither laid out nor painted (content-visibility) */
  skipOffscreen: boolean;
  motion: Motion;
  /** CSS transitions and animations run 5× slower */
  slowMotion: boolean;
  /** outline every layout shift as it happens, with a running score (LayoutShifts) */
  layoutShifts: boolean;
  /** press feedback, truncation tips and scroll fades (on reload) */
  helpers: boolean;
}

export const DEBUG_DEFAULTS: Readonly<DebugSettings> = {
  skipOffscreen: true, motion: 'system', slowMotion: false, layoutShifts: false, helpers: true,
};

/** Settings that only take effect when the page loads again. */
export const ON_RELOAD: readonly (keyof DebugSettings)[] = ['helpers'];

const KEY = 'pg/debug';

function read(): DebugSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DebugSettings>;
    return { ...DEBUG_DEFAULTS, ...saved };
  } catch {
    return { ...DEBUG_DEFAULTS };
  }
}

let settings = read();
// what the page started with, so the dialog can say a reload is due
const started = settings;
const listeners = new Set<() => void>();

export const debugSettings = {
  get: (): DebugSettings => settings,
  set(patch: Partial<DebugSettings>): void {
    settings = { ...settings, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private window */ }
    apply(settings);
    for (const f of listeners) f();
  },
  reset(): void { debugSettings.set({ ...DEBUG_DEFAULTS }); },
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

export function useDebugSettings(): DebugSettings {
  return useSyncExternalStore(debugSettings.subscribe, debugSettings.get, debugSettings.get);
}

/** The settings that differ from what the page loaded with and wait for a reload. */
export const pendingReload = (s: DebugSettings): (keyof DebugSettings)[] => ON_RELOAD.filter((k) => s[k] !== started[k]);

/** The settings changed from their defaults (the top bar's button shows a dot while there are any). */
export const changedFromDefaults = (s: DebugSettings): (keyof DebugSettings)[] =>
  (Object.keys(DEBUG_DEFAULTS) as (keyof DebugSettings)[]).filter((k) => s[k] !== DEBUG_DEFAULTS[k]);

/** Before the playground draws: the settings saved last time, and the reduced-motion switch where
 *  the library asks for it. */
export function installDebug(): DebugSettings {
  installMotionQuery();
  apply(settings);
  return settings;
}

function apply(s: DebugSettings): void {
  const root = document.documentElement.dataset;
  flag(root, 'debugDrawAll', !s.skipOffscreen);
  flag(root, 'debugMotion', s.motion === 'reduce');
  slowAnimations(s.slowMotion);
}

const flag = (set: DOMStringMap, name: string, on: boolean) => { if (on) set[name] = ''; else delete set[name]; };

// ------------------------------------------------------------------ motion

const REDUCE = /prefers-reduced-motion:\s*reduce/;

/** `matchMedia('(prefers-reduced-motion: reduce)')` matches while motion is set to reduce, so what
 *  reads it (lessons, the panes' moves) acts as on a system set that way; CSS
 *  is held still by debug.css. */
function installMotionQuery(): void {
  const real = window.matchMedia?.bind(window);
  if (!real) return;
  window.matchMedia = (query: string): MediaQueryList => {
    if (settings.motion !== 'reduce' || !REDUCE.test(query)) return real(query);
    const none = () => {};
    return { matches: true, media: query, onchange: null, addEventListener: none, removeEventListener: none, addListener: none, removeListener: none, dispatchEvent: () => false };
  };
}

let slowed = false;
const SLOW = 0.2;
const sweep = () => {
  const rate = slowed ? SLOW : 1;
  for (const a of document.getAnimations()) {
    // (the layout-shift outlines keep their own fade)
    if (a.playbackRate !== rate && !(a.effect as KeyframeEffect | null)?.target?.classList.contains('pg-shift')) a.playbackRate = rate;
  }
};
let sweeping: ReturnType<typeof setInterval> | undefined;

/** Every CSS transition and animation, and every Web Animation, at a fifth of its speed: each as it
 *  starts, and a sweep every 100 ms for what starts without an event. */
function slowAnimations(on: boolean): void {
  if (on === slowed || typeof document.getAnimations !== 'function') return;
  slowed = on;
  for (const type of ['transitionrun', 'animationstart'] as const) {
    if (on) document.addEventListener(type, sweep, true);
    else document.removeEventListener(type, sweep, true);
  }
  clearInterval(sweeping);
  sweeping = on ? setInterval(sweep, 100) : undefined;
  sweep();
}

// ------------------------------------------------------------------ storage

/** What the playground keeps in this browser's localStorage: its own `pg/` keys and the panes'
 *  layout. (The widget frames' heights are in sessionStorage.) */
export function playgroundStorage(): { key: string; bytes: number }[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith('pg/') || k.startsWith('ui/'))
      .sort()
      .map((key) => ({ key, bytes: (localStorage.getItem(key) ?? '').length * 2 }));
  } catch {
    return [];
  }
}

/** Forgets all of it but these settings, and the frames' heights, and loads the page again. */
export function resetPlaygroundStorage(): void {
  try {
    for (const { key } of playgroundStorage()) if (key !== KEY) localStorage.removeItem(key);
    sessionStorage.clear();
  } catch { /* private window */ }
  location.reload();
}
