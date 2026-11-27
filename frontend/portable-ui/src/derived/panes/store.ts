// A pane layout kept in the browser under one key: loaded once (checked, and dropped when it does
// not hold together), saved after every change. Operations are the model's; one the model refuses
// leaves the layout as it was and says why.
//
// Undo and redo: every change is one step, up to HISTORY_LIMIT, except a change of focus
// (`record: false`: bringing a pane forward is not worth a step) and a change inside a gesture
// already recorded (a divider drag, or a burst of arrow keys, is one step however long it lasts).
// The history lasts for the visit; it is not saved. Each key keeps its own (a space switched away
// from and back to still undoes what was done in it).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyLayout, migrateLayout, OpError, validate, type Layout, type OpResult } from './model';

export const STORAGE_PREFIX = 'ui/panes/v1/';
export const HISTORY_LIMIT = 100;

export type Apply = (op: (layout: Layout) => OpResult, options?: { record?: boolean }) => Layout | null;

/** Undo and redo for one layout. `gesture()` starts a gesture and returns its end. */
export interface PaneHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo(): boolean;
  redo(): boolean;
  gesture(): () => void;
}

/** The undo and redo stacks, apart from React (the hook below keeps one per layout). */
export class LayoutHistory {
  undoStack: Layout[] = [];
  redoStack: Layout[] = [];
  private depth = 0;
  private recorded = false;
  constructor(private limit = HISTORY_LIMIT) {}
  /** Before a change: `before` is the layout it replaces. */
  record(before: Layout) {
    if (this.depth > 0 && this.recorded) return;
    this.recorded = this.depth > 0;
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current: Layout): Layout | null {
    const to = this.undoStack.pop();
    if (!to) return null;
    this.redoStack.push(current);
    return to;
  }
  redo(current: Layout): Layout | null {
    const to = this.redoStack.pop();
    if (!to) return null;
    this.undoStack.push(current);
    return to;
  }
  gestureStart() { if (this.depth++ === 0) this.recorded = false; }
  gestureEnd() { if (this.depth > 0 && --this.depth === 0) this.recorded = false; }
}

/** The saved layout, or an empty one when there is none or it is broken (`broken` says why). */
export function loadLayout(key: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): { layout: Layout; broken?: string } {
  let raw: string | null = null;
  try { raw = storage?.getItem(STORAGE_PREFIX + key) ?? null; } catch { return { layout: emptyLayout() }; }
  if (!raw) return { layout: emptyLayout() };
  try {
    const saved = JSON.parse(raw) as Layout;
    if (!saved || typeof saved !== 'object' || typeof saved.nextId !== 'number' || typeof saved.panes !== 'object') return { layout: emptyLayout(), broken: 'not a layout' };
    // Saved before the grid (a tree of splits): the same groups at the same sizes, on a grid.
    const layout = migrateLayout(saved);
    const problems = validate(layout);
    return problems.length ? { layout: emptyLayout(), broken: problems.join('; ') } : { layout };
  } catch (e) {
    return { layout: emptyLayout(), broken: (e as Error).message };
  }
}

export function saveLayout(key: string, layout: Layout, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()) {
  try {
    if (layout.root) storage?.setItem(STORAGE_PREFIX + key, JSON.stringify(layout));
    else storage?.removeItem(STORAGE_PREFIX + key);
  } catch { /* private window or full storage: the layout lasts for this visit */ }
}

function safeStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** The layout for `key`, `apply` to change it, and its undo history. `onRefused` hears an
 * operation the model turned down (a pane would get too small, say); `onProblem` hears anything
 * else that went wrong. `persist: false` keeps it in memory only (fixtures, tests); `initial` is the
 * layout to start from when there is none saved. */
export function usePaneLayout(
  key: string,
  handlers: { onRefused?(message: string): void; onProblem?(message: string): void; persist?: boolean; initial?(): Layout } = {},
): [Layout, Apply, PaneHistory] {
  const said = useRef(handlers);
  said.current = handlers;
  const persist = handlers.persist !== false;
  // A layout made from `initial` is saved at once: a space left and come back to finds it as it was,
  // not made again from whatever page is asked for then.
  const load = (k: string) => {
    const loaded = persist ? loadLayout(k) : { layout: emptyLayout() };
    if (loaded.layout.root || !handlers.initial) return loaded;
    const layout = handlers.initial();
    if (persist && layout.root) saveLayout(k, layout);
    return { ...loaded, layout };
  };
  const [state, setState] = useState(() => ({ key, ...load(key) }));
  const histories = useRef(new Map<string, LayoutHistory>());
  const historyOf = (k: string) => { let h = histories.current.get(k); if (!h) { h = new LayoutHistory(); histories.current.set(k, h); } return h; };
  const history = useRef(historyOf(key));
  let current = state;
  if (state.key !== key) {
    current = { key, ...load(key) };
    history.current = historyOf(key);
    setState(current);
  }
  const broken = current.broken;
  useEffect(() => { if (broken) said.current.onProblem?.(`Saved pane layout was unreadable and was reset: ${broken}`); }, [broken]);

  const ref = useRef(current.layout);
  ref.current = current.layout;
  const set = useCallback((layout: Layout) => {
    ref.current = layout;
    if (persist) saveLayout(key, layout);
    setState({ key, layout });
  }, [key, persist]);
  const apply = useCallback<Apply>((op, options) => {
    try {
      const result = op(ref.current);
      if (!result.changed) return ref.current;
      if (options?.record !== false) history.current.record(ref.current);
      set(result.layout);
      return result.layout;
    } catch (e) {
      if (e instanceof OpError && (e.code === 'too-small' || e.code === 'too-many' || e.code === 'last-open')) said.current.onRefused?.(e.message);
      else {
        console.warn('pane operation failed', e);
        said.current.onProblem?.(`Pane operation failed: ${(e as Error).message}`);
      }
      return null;
    }
  }, [set]);

  const canUndo = history.current.undoStack.length > 0;
  const canRedo = history.current.redoStack.length > 0;
  const paneHistory = useMemo<PaneHistory>(() => ({
    canUndo,
    canRedo,
    undo: () => { const to = history.current.undo(ref.current); if (to) set(to); return !!to; },
    redo: () => { const to = history.current.redo(ref.current); if (to) set(to); return !!to; },
    gesture: () => {
      history.current.gestureStart();
      let ended = false;
      return () => { if (!ended) { ended = true; history.current.gestureEnd(); } };
    },
  }), [canUndo, canRedo, set]);
  return [current.layout, apply, paneHistory];
}
