// Dragging a tab: press, hold, move, drop.
//
// - A press activates the pane at once (before any threshold), then arms the drag.
// - Mouse and pen: the drag begins after the pointer moves more than 5px. Touch: after a 350ms hold;
//   moving more than 8px before then was a scroll or a swipe, and cancels it.
// - A 'soft' handle (the breadcrumbs of a one-tab row) keeps its own click: only a press that moves
//   past the threshold drags, and the click that ends such a drag is swallowed. Touch never drags it.
// - The layout never moves while a tab is held: every pane keeps its place and size, and the drop
//   targets (edge and gap bands, card zones) are laid over it. The edge and gap bands start thin
//   and grow once the pointer leaves the tab's own pane, until the drop.
// - Per animation frame: the ghost moves by transform (no React render), and the zone under the
//   pointer is found. The drop is planned only when that zone changes.
// - Escape, pointercancel and window blur cancel. A move with no button down means the release was
//   missed (it happened over something that kept it): it ends as a drop where the pointer is.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { contains, type Geometry, type Metrics, type Rect } from './geometry';
import { findStackOf, type Layout } from './model';
import { BANDS, hitTest, layoutMap, planDrop, type DropPlan, type Hit, type TabSlots } from './zones';
import { dragStore } from './dragStore';

export const DRAG_THRESHOLD = 5;
export const TOUCH_HOLD_MS = 350;
export const TOUCH_SLOP = 8;
export const GHOST_OFFSET = { x: 12, y: 14 };

export interface TabDragDeps {
  area(): HTMLElement | null;
  layout(): Layout;
  /** The geometry as the workspace draws it, in area coordinates. */
  geo(): Geometry;
  /** The metrics it draws with, so a drop's outline lands where the pane will. */
  metrics: Metrics;
  ghost(): HTMLElement | null;
  activate(paneId: string): void;
  onHold(): void;
  onRelease(moved: boolean): void;
  onDrop(paneId: string, plan: DropPlan): void;
  onRefused(message: string): void;
  /** A tab dropped on a place outside the panes that takes one: an element marked
   *  `data-pane-drop="<id>"` (a space's chip, ), its `data-pane-drop-label` saying
   *  what the drop does. Without it, those places are not drop targets. */
  onMoveOut?(paneId: string, to: string): void;
  /** Places outside the panes (their `data-pane-drop` ids) this drag does not drop on: a page
   *  brought from the sidebar is not removed by being over the sidebar. Asked as the pointer moves. */
  ignores?(place: string): boolean;
  /** Plans a drop in place of moving the pane: for a page brought in from outside, not open yet
   *  (zones.ts `planBring`). `at`: the pointer, in area coordinates. */
  plan?(hit: Hit, geo: Geometry, at: { x: number; y: number }): DropPlan;
  /** What tells two places apart, when more than the hit does (a page's halves): planned again when
   *  it changes. The hit's own key by default. */
  keyOf?(hit: Hit, geo: Geometry, at: { x: number; y: number }): string;
}

/** The place outside the panes under the pointer that takes a tab, if any. */
const awayAt = (x: number, y: number): HTMLElement | null =>
  (typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-pane-drop]') : null) ?? null;

/** Each group's tab slots, relative to its tab bar's left edge. */
function measureSlots(area: HTMLElement): TabSlots {
  const out: TabSlots = new Map();
  for (const bar of area.querySelectorAll<HTMLElement>('[data-tab-bar]')) {
    const left = bar.getBoundingClientRect().left;
    out.set(
      bar.dataset.tabBar!,
      [...bar.querySelectorAll<HTMLElement>('[data-tab]')].map((t) => {
        const r = t.getBoundingClientRect();
        return { left: r.left - left, width: r.width };
      }),
    );
  }
  return out;
}

export function useTabDrag(deps: TabDragDeps) {
  const ref = useRef(deps);
  ref.current = deps;
  const live = useRef<(() => void) | null>(null);

  // A drag in progress is cancelled when the workspace goes away.
  useEffect(() => () => live.current?.(), []);

  return useCallback((paneId: string, e: ReactPointerEvent<HTMLElement>, opts: { soft?: boolean; title?: string } = {}) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('[data-no-drag]')) return;
    const touch = e.pointerType === 'touch';
    if (opts.soft && touch) return;
    ref.current.activate(paneId);
    live.current?.();

    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    const start = { x: e.clientX, y: e.clientY };
    const last = { x: e.clientX, y: e.clientY };
    let held = false;
    let frame = 0;
    let hoverKey: string | null = null;
    let over: HTMLElement | null = null;
    let slots: TabSlots = new Map();
    let areaBox: DOMRect | null = null;
    let ownStack: string | null = null;
    let own: Rect | null = null;
    const holdTimer = touch ? setTimeout(() => hold(), TOUCH_HOLD_MS) : null;
    if (!opts.soft) {
      // Capture at once: an iframe under the pointer would otherwise take the moves and the release.
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        /* the element may be gone already */
      }
    }

    function hold() {
      const d = ref.current;
      const area = d.area();
      if (!area) return cleanup();
      held = true;
      // Held by a finger: the page does not scroll, nor the long-press menu open, while it is dragged.
      // On the element pressed too: a page dragged out of the phone's menu leaves it as the menu
      // closes, and a finger's touches go on going to it, not to the window (20 Nov).
      if (touch) {
        window.addEventListener('touchmove', noScroll, { passive: false });
        handle.addEventListener('touchmove', noScroll, { passive: false });
        window.addEventListener('contextmenu', noScroll, true);
      }
      if (opts.soft) {
        try {
          handle.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }
      areaBox = area.getBoundingClientRect();
      slots = measureSlots(area);
      const layout = d.layout();
      ownStack = findStackOf(layout.root, paneId)?.id ?? null;
      const geo = d.geo();
      own = ownStack ? (geo.stacks.get(ownStack)?.card ?? null) : null;
      // A pane zoomed away has no card on screen to stay inside: its targets start grown.
      dragStore.set({ held: true, paneId, title: opts.title ?? layout.panes[paneId]?.title ?? '', geo, open: !own, plan: null });
      d.onHold();
      update();
    }

    function update() {
      frame = 0;
      if (!held || !areaBox) return;
      const d = ref.current;
      const ghost = d.ghost();
      if (ghost) {
        // Near the window's right or bottom edge the chip flips to the other side of the pointer,
        // so its name is never cut off.
        const gx = last.x + GHOST_OFFSET.x + ghost.offsetWidth > window.innerWidth - 8 ? last.x - GHOST_OFFSET.x - ghost.offsetWidth : last.x + GHOST_OFFSET.x;
        const gy = last.y + GHOST_OFFSET.y + ghost.offsetHeight > window.innerHeight - 8 ? last.y - GHOST_OFFSET.y - ghost.offsetHeight : last.y + GHOST_OFFSET.y;
        ghost.style.transform = `translate(${gx}px, ${gy}px)`;
      }
      // Over a place outside the panes that takes the tab: it lights, and the pill says what happens.
      const found = d.onMoveOut ? awayAt(last.x, last.y) : null;
      const away = found && !d.ignores?.(found.dataset.paneDrop ?? '') ? found : null;
      if (away !== over) {
        over?.removeAttribute('data-drop-over');
        away?.setAttribute('data-drop-over', '');
        over = away;
      }
      if (away) {
        hoverKey = null;
        const label = away.dataset.paneDropLabel ?? 'Move here';
        if (dragStore.get().away !== label || dragStore.get().plan) dragStore.set({ plan: null, away: label, open: true });
        return;
      }
      if (dragStore.get().away) dragStore.set({ away: null });
      const lx = last.x - areaBox.left;
      const ly = last.y - areaBox.top;
      if (!dragStore.get().open && own && !contains(own, lx, ly)) {
        // Out of its own pane: the targets grow, and stay grown until the drop.
        dragStore.set({ open: true, plan: null });
        hoverKey = null;
      }
      const { geo, open } = dragStore.get();
      const hit = hitTest(lx, ly, geo!, slots, open ? BANDS.open : BANDS.compact);
      const key = hit ? (d.keyOf?.(hit, geo!, { x: lx, y: ly }) ?? hit.key) : null;
      if (key === hoverKey) return;
      hoverKey = key;
      if (!hit) return dragStore.set({ plan: null });
      // The middle of its own group: it is a tab there already.
      const plan = d.plan
        ? d.plan(hit, geo!, { x: lx, y: ly })
        : hit.key === `centre:${ownStack}`
          ? { ...hit, label: 'Already here', preview: null, noop: true, after: layoutMap(d.layout(), paneId, geo!.area) }
          : planDrop(d.layout(), paneId, hit, geo!, d.metrics);
      dragStore.set({ plan });
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      last.x = ev.clientX;
      last.y = ev.clientY;
      if (!held) {
        const moved = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (touch) {
          if (moved > TOUCH_SLOP) cleanup(); // a scroll or a swipe, not a drag
          return;
        }
        if (ev.buttons === 0) return cleanup();
        if (moved > DRAG_THRESHOLD) hold();
        return;
      }
      if (ev.pointerType === 'mouse' && ev.buttons === 0) return finish(true); // a missed release
      ev.preventDefault();
      schedule();
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      finish(true);
    }

    function onCancel(ev: Event) {
      if (ev instanceof PointerEvent && ev.pointerId !== pointerId) return;
      finish(false);
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return;
      // The drag owns Escape: it must not also unzoom or leave a field.
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }

    function noScroll(ev: Event) {
      if (held) ev.preventDefault();
    }

    function swallowClick(ev: MouseEvent) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    function finish(drop: boolean) {
      const wasHeld = held;
      const to = over?.dataset.paneDrop;
      cleanup();
      if (!wasHeld) return;
      const d = ref.current;
      const s = dragStore.get();
      let moved = false;
      if (drop && to !== undefined && d.onMoveOut) {
        d.onMoveOut(paneId, to);
        moved = true;
      } else if (drop && s.plan && !s.plan.noop && !s.plan.refused) {
        d.onDrop(paneId, s.plan);
        moved = true;
      } else if (drop && s.plan?.refused) {
        d.onRefused(s.plan.refused);
      }
      dragStore.reset();
      d.onRelease(moved);
      // The click that ends a drag is not a click on whatever is under the pointer.
      window.addEventListener('click', swallowClick, true);
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
    }

    function cleanup() {
      if (holdTimer) clearTimeout(holdTimer);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      held = false;
      over?.removeAttribute('data-drop-over');
      over = null;
      window.removeEventListener('touchmove', noScroll);
      handle.removeEventListener('touchmove', noScroll);
      window.removeEventListener('contextmenu', noScroll, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey, true);
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      live.current = null;
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey, true);
    live.current = () => finish(false);
  }, []);
}
