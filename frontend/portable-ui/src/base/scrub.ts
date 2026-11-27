// Scrub: press anywhere along a row of stops (tabs, lines of code, a rail) and the nearest one is
// chosen at once; keep the pointer down and drag, and the indicator follows the pointer freely, sitting
// between stops if the pointer does; let go and it settles on the stop nearest the pointer (the end one
// when let go beyond either end). The same interaction everywhere, so it feels the same everywhere.
//
//   const scrub = useScrub({ axis: 'y', stops: () => centres, onPick: (i) => go(i), onDrag: setY });
//   <div onPointerDown={scrub.onPointerDown}>…</div>
//
// `stops` returns each stop's centre along the axis, in the container's own coordinates (scroll
// included); `onDrag` gets the indicator's free position while dragging, and null when it settles.
//
// A finger as well as a mouse (on a phone a press-and-drag did nothing). A moving
// finger is the browser's to scroll with, unless the scrub has it first:
// - across the page's scroll (tabs: sideways), the row is `touch-action: pan-y`, so a sideways move
//   is the scrub's at once, and an up or down one still scrolls the page;
// - along a scroll (a listing's lines, or a row that scrolls sideways itself), a finger held still
//   for HOLD ms takes it, and a move before that is a scroll.
// A tap chooses, as a click does. A long press neither opens the context menu nor selects text.
import * as React from 'react';

export type ScrubAxis = 'x' | 'y';

/** How long a finger is held still before a move along a scroll is the scrub's, not the scroll's (ms). */
export const HOLD = 300;
/** How far a finger may wander while it is held and still be holding (px). */
const SLOP = 8;

/** The stop nearest a position (ties go to the earlier one); -1 when there are none. */
export function nearestStop(centres: number[], at: number): number {
  let best = -1, distance = Infinity;
  centres.forEach((c, i) => { const d = Math.abs(c - at); if (d < distance) { best = i; distance = d; } });
  return best;
}

export interface ScrubOptions {
  axis: ScrubAxis;
  /** Each stop's centre along the axis, in the container's coordinates (scroll included). */
  stops(container: HTMLElement): number[];
  /** A stop was chosen: on press, and again on release. */
  onPick(index: number): void;
  /** While dragging: the free position (clamped to the first and last stops); null once let go. */
  onDrag?(position: number | null): void;
  /** Elements a press inside does not scrub (their own controls). */
  ignore?: string;
}

const MOVE = 4;

export function useScrub({ axis, stops, onPick, onDrag, ignore = 'button, a, input, textarea, select, [data-no-scrub]' }: ScrubOptions) {
  const options = React.useRef({ stops, onPick, onDrag });
  options.current = { stops, onPick, onDrag };
  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest(ignore)) return;
    const el = e.currentTarget;
    const centres = options.current.stops(el);
    if (!centres.length) return;
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return axis === 'x' ? ev.clientX - r.left + el.scrollLeft : ev.clientY - r.top + el.scrollTop;
    };
    if (e.pointerType === 'touch') { touchScrub(e, el, centres, local); return; }
    const start = axis === 'x' ? e.clientX : e.clientY;
    let dragging = false, frame = 0, last = local(e);
    // A press chooses the nearest stop at once (the indicator moves there).
    options.current.onPick(nearestStop(centres, last));
    const lo = Math.min(...centres), hi = Math.max(...centres);
    const move = (ev: PointerEvent) => {
      last = local(ev);
      if (!dragging && Math.abs((axis === 'x' ? ev.clientX : ev.clientY) - start) < MOVE) return;
      if (!dragging) { dragging = true; try { el.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; options.current.onDrag?.(Math.max(lo, Math.min(hi, last))); });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (frame) cancelAnimationFrame(frame);
      if (!dragging) return;
      options.current.onPick(nearestStop(centres, last));
      options.current.onDrag?.(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [axis, ignore]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A finger (see the top of the file): nothing is chosen until it is the scrub's, or a tap. */
  const touchScrub = (e: React.PointerEvent<HTMLElement>, el: HTMLElement, centres: number[], local: (ev: { clientX: number; clientY: number }) => number) => {
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    const lo = Math.min(...centres), hi = Math.max(...centres);
    // Along the page's scroll, or a row that scrolls itself: held first. Else at once (pan-y).
    const holdFirst = axis === 'y' || el.scrollWidth > el.clientWidth + 1;
    let state: 'pressed' | 'dragging' | 'done' = 'pressed', frame = 0, last = local(e);
    const draw = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; options.current.onDrag?.(Math.max(lo, Math.min(hi, last))); }); };
    const begin = () => {
      if (state !== 'pressed') return;
      state = 'dragging';
      try { el.setPointerCapture(id); } catch { /* gone */ }
      options.current.onPick(nearestStop(centres, last));
      draw();
    };
    const timer = holdFirst ? setTimeout(begin, HOLD) : undefined;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      last = local(ev);
      if (state === 'pressed') {
        const dx = Math.abs(ev.clientX - x0), dy = Math.abs(ev.clientY - y0);
        // Not held long enough: a scroll, and the browser's.
        if (holdFirst) { if (Math.hypot(dx, dy) > SLOP) finish(); return; }
        const along = axis === 'x' ? dx : dy, across = axis === 'x' ? dy : dx;
        if (Math.max(along, across) < MOVE) return;
        if (across > along) { finish(); return; }
        begin();
      }
      draw();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const was = state;
      finish();
      // A cancel (the browser took the finger for a scroll) chooses nothing more.
      if (ev.type !== 'pointerup') { if (was === 'dragging') options.current.onDrag?.(null); return; }
      last = local(ev);
      options.current.onPick(nearestStop(centres, last));
      if (was === 'dragging') options.current.onDrag?.(null);
    };
    // Once the scrub has the finger, its moves are not a scroll; and a long press is not a menu or a selection.
    const keep = (ev: TouchEvent) => { if (state === 'dragging' && ev.cancelable) ev.preventDefault(); };
    const quiet = (ev: Event) => ev.preventDefault();
    const finish = () => {
      state = 'done';
      clearTimeout(timer);
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', keep);
      window.removeEventListener('contextmenu', quiet, true);
      document.removeEventListener('selectstart', quiet, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', keep, { passive: false });
    window.addEventListener('contextmenu', quiet, true);
    document.addEventListener('selectstart', quiet, true);
  };
  return { onPointerDown };
}
