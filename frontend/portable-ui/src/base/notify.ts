// Notifications: the store behind <Notifications /> (notifications.tsx).
//
// - Notifications are grouped by type: errors in one stack, warnings in the next, then success,
//   info and the rest. Each stack collapses its notifications under the newest one.
// - Only the notifications on show count down: the one in front of a collapsed stack, or every
//   one listed in an opened stack. The ones tucked away wait their turn, so none runs out unseen.
//   The one under the pointer (or the keyboard) stops counting; the rest of its stack does not.
// - A notification can be clicked: its own `onClick`, else the route set for its type with
//   `setNotificationRoutes`.
// - One exactly like an open one (type, title, description, action) is not shown twice: the open
//   one counts it (a badge on its corner), comes to the front and starts its time again. Each
//   arrival's time is kept, so `expandNotice` can split it back into one notification per arrival.
// - A whole stack can be cleared at once (`dismissAll`).
import { useSyncExternalStore } from 'react';

export type NotifyTone = 'error' | 'warning' | 'success' | 'info' | 'neutral';
export const TONE_ORDER: NotifyTone[] = ['error', 'warning', 'success', 'info', 'neutral'];
/** How long a notification stays in front once nothing holds it. */
export const NOTIFY_MS = 5000;
/** How long a dismissed notification takes to leave. */
export const LEAVE_MS = 450;

export interface NotifyInput {
  title: string;
  description?: string;
  tone?: NotifyTone;
  action?: { label: string; onClick(): void };
  /** What clicking the notification does; without it, the route for its type (if any). */
  onClick?(): void;
  ms?: number;
}

export interface Notice extends NotifyInput {
  id: string;
  tone: NotifyTone;
  ms: number;
  /** How many identical notifications this one stands for. */
  count: number;
  /** When it (or, for a counted one, its latest twin) arrived, in ms since the epoch. */
  at: number;
  /** A counted one: when each of its arrivals came, newest first (`count` of them). */
  times: number[];
  /** Counting down now (it is on show, and nothing holds it). */
  running: boolean;
  /** How many times it has come back from under the front of its stack: each is drawn as a new
   *  arrival at the top, not moved up out of the stack. */
  arrivals?: number;
  leaving: boolean;
  /** Which way it leaves: 1 to the right (closed, timed out, flicked right), -1 flicked left. */
  away?: 1 | -1;
}

interface Timing { remaining: number; startedAt: number; timer: ReturnType<typeof setTimeout> | null }

let notices: Notice[] = [];
const timing = new Map<string, Timing>();
/** What holds each notification's time, by who holds it: the pointer over it, focus in it, its open
 *  stack. Each lets go of its own hold only (the stack letting go does not undo the pointer's). */
const held = new Map<string, Set<string>>();
/** How many notifications of each stack are on show (1 when collapsed; set by the view). */
const onShow = new Map<NotifyTone, number>();
const listeners = new Set<() => void>();
let routes: Partial<Record<NotifyTone, (n: Notice) => void>> = {};
let nextId = 1;

const emit = () => { notices = notices.map((n) => ({ ...n })); for (const l of listeners) l(); };

/** Starts the notifications on show that nothing holds; stops every other one. */
function sync(): boolean {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const front = new Set<string>();
  for (const tone of TONE_ORDER) {
    const shown = notices.filter((n) => n.tone === tone && !n.leaving).slice(0, onShow.get(tone) ?? 1);
    for (const n of shown) if (!held.has(n.id) && !hidden) front.add(n.id);
  }
  let changed = false;
  for (const n of notices) {
    const t = timing.get(n.id);
    if (!t) continue;
    const run = front.has(n.id);
    if (run && !t.timer) {
      t.startedAt = Date.now();
      const id = n.id;
      t.timer = setTimeout(() => dismiss(id), t.remaining);
    } else if (!run && t.timer) {
      clearTimeout(t.timer);
      t.timer = null;
      t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
    }
    if (n.running !== run) { n.running = run; changed = true; }
  }
  return changed;
}

/** Shows a notification on top of its type's stack. Returns its id. */
const sameAs = (a: NotifyInput, b: NotifyInput) =>
  (a.tone ?? 'neutral') === (b.tone ?? 'neutral') && a.title === b.title && (a.description ?? '') === (b.description ?? '') && a.action?.label === b.action?.label;

export function notify(input: NotifyInput): string {
  installVisibility();
  const ms = input.ms ?? NOTIFY_MS;
  const twin = notices.find((n) => !n.leaving && sameAs(n, input));
  if (twin) {
    const t = timing.get(twin.id)!;
    if (t.timer) clearTimeout(t.timer);
    timing.set(twin.id, { remaining: ms, startedAt: 0, timer: null });
    const at = Date.now();
    // Under the front of its stack, it comes again as a new one does, at the top (it
    // rose out of the stack); in front already, it only counts.
    const front = notices.find((n) => n.tone === twin.tone && !n.leaving);
    const arrivals = (twin.arrivals ?? 0) + (front === twin ? 0 : 1);
    notices = [{ ...twin, ...input, tone: twin.tone, count: twin.count + 1, at, times: [at, ...twin.times], ms, running: false, arrivals }, ...notices.filter((n) => n !== twin)];
    sync();
    emit();
    return twin.id;
  }
  const id = `n${nextId++}`;
  const at = Date.now();
  notices = [{ ...input, id, tone: input.tone ?? 'neutral', ms, count: 1, at, times: [at], running: false, leaving: false }, ...notices];
  timing.set(id, { remaining: ms, startedAt: 0, timer: null });
  sync();
  emit();
  return id;
}

/** Splits a counted notification back into one per arrival, in place, each with its own time. The
 * first keeps its id (and its countdown); the others start theirs from the full time. */
export function expandNotice(id: string) {
  const n = notices.find((x) => x.id === id);
  if (!n || n.leaving || n.count < 2) return;
  const parts: Notice[] = n.times.map((at, i) => {
    const partId = i === 0 ? n.id : `n${nextId++}`;
    if (i > 0) timing.set(partId, { remaining: n.ms, startedAt: 0, timer: null });
    return { ...n, id: partId, count: 1, at, times: [at], running: i === 0 && n.running };
  });
  const index = notices.indexOf(n);
  notices = [...notices.slice(0, index), ...parts, ...notices.slice(index + 1)];
  sync();
  emit();
}

/** Sends a notification away (to the right, or `away` -1 to the left, the way it was flicked); the
 * next one in its stack comes to the front and starts counting. */
export function dismiss(id: string, away: 1 | -1 = 1) {
  const n = notices.find((x) => x.id === id);
  if (!n || n.leaving) return;
  const t = timing.get(id);
  if (t?.timer) clearTimeout(t.timer);
  timing.delete(id);
  held.delete(id);
  n.leaving = true;
  n.away = away;
  n.running = false;
  sync();
  emit();
  setTimeout(() => { notices = notices.filter((x) => x.id !== id); emit(); }, LEAVE_MS);
}

/** When a notification arrived, said the way a person would: "just now", "4 min ago", "2 h ago",
 * "yesterday 14:05", "Mon 09:30", "3 Nov 2026". */
export function whenSaid(at: number, now = Date.now(), locale?: string): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const then = new Date(at);
  const today = new Date(now);
  const time = then.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86400000);
  if (days === 0) return `${Math.round(m / 60)} h ago`;
  if (days === 1) return `yesterday ${time}`;
  if (days < 7) return `${then.toLocaleDateString(locale, { weekday: 'short' })} ${time}`;
  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** How many of a stack's notifications are on show (the view says: 1 collapsed, more opened). */
export function showStack(tone: NotifyTone, count: number) {
  if ((onShow.get(tone) ?? 1) === count) return;
  onShow.set(tone, Math.max(1, count));
  if (sync()) emit();
}

/** Clears a whole stack. */
export function dismissAll(tone: NotifyTone) {
  for (const n of notices.filter((x) => x.tone === tone && !x.leaving)) dismiss(n.id);
}

/** Holds (or lets go of) one notification's countdown for `by`: the pointer on it, focus in it, its
 *  open stack. It runs again once nothing holds it. */
export function holdNotice(id: string, hold: boolean, by = 'pointer') {
  const holders = held.get(id);
  if (hold === !!holders?.has(by)) return;
  if (hold) { if (holders) holders.add(by); else held.set(id, new Set([by])); }
  else if (holders) { holders.delete(by); if (!holders.size) held.delete(id); }
  if (sync()) emit();
}

/** What clicking a notification of each type opens, for notifications without their own onClick. */
export function setNotificationRoutes(next: Partial<Record<NotifyTone, (n: Notice) => void>>) {
  routes = next;
}

/** The click on a notification: its own onClick or its type's route, then it goes. Null: not clickable. */
export function clickTarget(n: Notice): (() => void) | null {
  const route = routes[n.tone];
  const go = n.onClick ?? (route ? () => route(n) : null);
  return go ? () => { go(); dismiss(n.id); } : null;
}

export function useNotices(): Notice[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => notices, () => notices);
}

let visibilityInstalled = false;
function installVisibility() {
  if (visibilityInstalled || typeof document === 'undefined') return;
  visibilityInstalled = true;
  document.addEventListener('visibilitychange', () => { if (sync()) emit(); });
}

/** For tests: start over. */
export function resetNotifications() {
  for (const t of timing.values()) if (t.timer) clearTimeout(t.timer);
  timing.clear();
  held.clear();
  onShow.clear();
  notices = [];
  routes = {};
  emit();
}
