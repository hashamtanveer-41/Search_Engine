// The state of a tab being dragged, outside React: the pointer moves every frame, and only the
// overlay and the ghost need to know. The workspace reads `held`, which changes twice per drag. Ported from the tabbed layout reference pack.

import { useSyncExternalStore } from 'react';
import type { Geometry } from './geometry';
import type { DropPlan } from './zones';

export interface DragState {
  held: boolean;
  paneId: string | null;
  title: string;
  geo: Geometry | null;
  /** The drop targets have grown from thin bars (the pointer has left the tab's own pane); the
   *  panes themselves never move. */
  open: boolean;
  plan: DropPlan | null;
  /** Over a place outside the panes that takes a tab (a space's chip): what dropping does there. */
  away: string | null;
}

const EMPTY: DragState = { held: false, paneId: null, title: '', geo: null, open: false, plan: null, away: null };

let state = EMPTY;
const listeners = new Set<() => void>();

export const dragStore = {
  get: () => state,
  set(patch: Partial<DragState>) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  },
  reset() {
    state = EMPTY;
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useDrag<T>(select: (s: DragState) => T): T {
  return useSyncExternalStore(dragStore.subscribe, () => select(dragStore.get()));
}
