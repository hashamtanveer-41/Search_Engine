// Spaces: a space is a saved layout of panes, and a course has several. A space
// holds lessons; the app's pages (Home, the Workbook…) open full-size instead, and go into a space
// only when dragged there. The sidebar lists the spaces; a page of their own manages them.
//
// Each space's layout is kept under its own key (store.ts); Reading keeps the course's own key, so a
// layout saved before spaces is Reading's. The list of spaces, and which one is open, is kept here.
import { useCallback, useState } from 'react';

export interface Space {
  id: string;
  name: string;
  /** When it was last open (ms). */
  used: number;
}

export interface SpaceList {
  spaces: Space[];
  current: string;
}

export const READING = 'reading';
export const SPACES_PREFIX = 'ui/spaces/v1/';

export const firstSpaces = (now = Date.now()): SpaceList => ({ spaces: [{ id: READING, name: 'Reading', used: now }], current: READING });

/** The key a space's layout is kept under: Reading's is the course's own. */
export const spaceKey = (base: string, id: string) => (id === READING ? base : `${base}/space/${id}`);

/** `id` opened, made first (named `made.name`) when there is none. */
export function enterSpace(list: SpaceList, id: string, now = Date.now(), made?: { name: string }): SpaceList {
  const there = list.spaces.some((s) => s.id === id);
  if (!there && !made) return list;
  const spaces = there ? list.spaces.map((s) => (s.id === id ? { ...s, used: now } : s)) : [...list.spaces, { id, name: made!.name, used: now }];
  return { spaces, current: id };
}

/** A new, empty space: "Space 1", "Space 2"… counting the person's own (not Reading). Opened, unless
 *  `open` is false (the Spaces page names it first: ). */
export function newSpace(list: SpaceList, now = Date.now(), { open = true }: { open?: boolean } = {}): { list: SpaceList; id: string } {
  let n = 1;
  while (list.spaces.some((s) => s.id === `space-${n}`)) n++;
  const taken = new Set(list.spaces.map((s) => s.name));
  let k = list.spaces.filter((s) => s.id !== READING).length + 1;
  while (taken.has(`Space ${k}`)) k++;
  const id = `space-${n}`;
  const made = enterSpace(list, id, now, { name: `Space ${k}` });
  return { list: open ? made : { ...made, current: list.current }, id };
}

/** Deleted: gone from the list, as long as one is left. Deleting the open one opens the one used last. */
export function closeSpace(list: SpaceList, id: string): SpaceList {
  if (list.spaces.length < 2 || !list.spaces.some((s) => s.id === id)) return list;
  const spaces = list.spaces.filter((s) => s.id !== id);
  if (list.current !== id) return { spaces, current: list.current };
  const last = [...spaces].sort((a, b) => b.used - a.used)[0];
  return { spaces, current: last?.id ?? READING };
}

export function renameSpace(list: SpaceList, id: string, name: string): SpaceList {
  const clean = name.trim().slice(0, 40);
  if (!clean) return list;
  return { ...list, spaces: list.spaces.map((s) => (s.id === id ? { ...s, name: clean } : s)) };
}

/** The one `by` places along (1: the next, -1: the one before), round the end. */
export function stepSpace(list: SpaceList, by: number): string {
  const i = list.spaces.findIndex((s) => s.id === list.current);
  const n = list.spaces.length;
  return list.spaces[(((i + by) % n) + n) % n].id;
}

/** The saved list, or Reading alone when there is none or it does not hold together. */
export function loadSpaces(base: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): SpaceList {
  try {
    const raw = storage?.getItem(SPACES_PREFIX + base);
    if (!raw) return firstSpaces();
    const saved = JSON.parse(raw) as { spaces: (Space & { tool?: string })[]; current: string };
    const ok = saved && Array.isArray(saved.spaces) && saved.spaces.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string');
    if (!ok) return firstSpaces();
    // A tool's own space (spaces' first design, 19 Nov) is gone: tools are pages now.
    const spaces = saved.spaces.filter((s) => !s.tool).map(({ id, name, used }) => ({ id, name, used }));
    if (!spaces.length) return firstSpaces();
    return { spaces, current: spaces.some((s) => s.id === saved.current) ? saved.current : spaces[0].id };
  } catch {
    return firstSpaces();
  }
}

export function saveSpaces(base: string, list: SpaceList, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try { storage?.setItem(SPACES_PREFIX + base, JSON.stringify(list)); } catch { /* private window or full storage: kept for this visit */ }
}

function safeStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** The course's spaces, and `update` to change them (saved after every change; `persist: false`
 *  keeps them in memory: fixtures, tests). */
export function useSpaces(base: string, { persist = true, initial }: { persist?: boolean; initial?(): SpaceList } = {}): [SpaceList, (change: (list: SpaceList) => SpaceList) => void] {
  const load = (b: string) => (persist ? loadSpaces(b) : initial?.() ?? firstSpaces());
  const [state, setState] = useState(() => ({ base, list: load(base) }));
  let current = state;
  if (state.base !== base) {
    current = { base, list: load(base) };
    setState(current);
  }
  const update = useCallback((change: (list: SpaceList) => SpaceList) => {
    setState((s) => {
      const list = change(s.list);
      if (list === s.list) return s;
      if (persist) saveSpaces(s.base, list);
      return { base: s.base, list };
    });
  }, [persist]);
  return [current.list, update];
}
