// View lock: graphs, plots, maps and 3D views do not zoom, pan or turn until the reader unlocks them,
// so scrolling the page past one never gets caught by it. Locked, a try (a pinch or ctrl+wheel, a
// double-click, a drag across it) shakes the lock and lights the widget's outline, to say where the
// switch is. Unlocked, the wheel or a pinch zooms about the pointer, a drag pans (or turns a 3D view),
// and + / − / reset sit beside the lock.
//
//   useViewLock()      the state, and `refuse()` for a try made while locked
//   <ViewControls>     the lock (and, unlocked, zoom buttons), top right over the view
//   <ZoomPane>         zoom and pan for any content (CSS transform); NodeGraph uses React Flow's own
import * as React from 'react';
import { Lock, LockOpen, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '../../base/button';
import { FADE } from '../../base/scroll-fades';
import { cn } from '../../lib/utils';
import './view-lock.css';

/** How long a refused try lights the widget. */
export const NUDGE_MS = 1000;

export type ViewLock = {
  locked: boolean;
  setLocked(locked: boolean): void;
  /** Bumped by each refused try (the lock's shake restarts from it). */
  tries: number;
  /** A try to zoom, pan or turn while locked: shake the lock, light the widget. */
  refuse(from?: Element | null): void;
};

export function useViewLock(initial = true): ViewLock {
  const [locked, setLocked] = React.useState(initial);
  const [tries, setTries] = React.useState(0);
  const refuse = React.useCallback((from?: Element | null) => {
    setTries((n) => n + 1);
    // Light the widget the try was made on (its frame) for a second.
    const frame = from?.closest<HTMLElement>('[data-slot="widget-frame"]');
    if (frame) {
      frame.removeAttribute('data-nudged');
      void frame.offsetWidth; // restart the highlight on a quick second try
      frame.setAttribute('data-nudged', '');
      window.setTimeout(() => frame.removeAttribute('data-nudged'), NUDGE_MS);
    }
  }, []);
  return { locked, setLocked, tries, refuse };
}

/** True for a wheel that zooms (a trackpad pinch arrives as ctrl+wheel). */
export const isZoomWheel = (e: WheelEvent | React.WheelEvent) => e.ctrlKey || e.metaKey;

/** The lock, top right over a view; unlocked, the zoom buttons join it. */
export function ViewControls({ lock, onZoomIn, onZoomOut, onReset, what = 'view', className }: {
  lock: ViewLock; onZoomIn?(): void; onZoomOut?(): void; onReset?(): void;
  /** What it moves, for the labels ("zoom and pan", "turn"). */
  what?: string; className?: string;
}) {
  return (
    <div data-slot="view-controls" className={cn('absolute top-2 right-2 z-10 flex items-center gap-0.5 pointer-coarse:gap-2 rounded-lg border bg-popover p-0.5 shadow-sm', className)}>
      {!lock.locked && onZoomOut && <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}><Minus /></Button>}
      {!lock.locked && onZoomIn && <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}><Plus /></Button>}
      {!lock.locked && onReset && <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" aria-label="Reset the view" title="Reset the view" onClick={onReset}><RotateCcw /></Button>}
      <Button key={lock.tries} variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" data-slot="view-lock" data-shake={lock.tries > 0 || undefined}
        aria-pressed={!lock.locked} aria-label={lock.locked ? `Unlock to ${what}` : `Lock the ${what}`}
        title={lock.locked ? `Locked: click to ${what}` : `Unlocked: click to lock`}
        onClick={() => lock.setLocked(!lock.locked)}>
        {lock.locked ? <Lock /> : <LockOpen />}
      </Button>
    </div>
  );
}

const ZOOM_STEP = 1.25;

/** The edge fades for a zoomed or panned view: how far the content runs past each edge, capped at
 *  the fade's length (FADE in base/scroll-fades.ts). */
export function zoomFades(view: { scale: number; x: number; y: number }, w: number, h: number) {
  const ramp = (n: number) => Math.max(0, Math.min(FADE, n));
  return { top: ramp(-view.y), left: ramp(-view.x), bottom: ramp(view.y + h * view.scale - h), right: ramp(view.x + w * view.scale - w) };
}
const fadeStyle = (view: { scale: number; x: number; y: number }, el: HTMLElement | null): React.CSSProperties | undefined => {
  if (!el || (view.scale === 1 && !view.x && !view.y)) return undefined;
  const f = zoomFades(view, el.clientWidth, el.clientHeight);
  return { '--fade-top': `${f.top}px`, '--fade-bottom': `${f.bottom}px`, '--fade-left': `${f.left}px`, '--fade-right': `${f.right}px` } as React.CSSProperties;
};
/** How far, at most, the content's edges may be pulled in from the pane's edges by a pan (and so
 *  how much empty pane a pan can show), across and down. */
export const SCROLL_MARGIN = { x: 80, y: 80 };

/** A view kept inside its four corners: the content's left and top edges never further right or down
 *  than the margin, its right and bottom edges never further left or up than the pane's less the
 *  margin. Zoomed in, that is the content's own edges plus the margin; at 1, a pan of the margin. */
export function boundView(view: { scale: number; x: number; y: number }, w: number, h: number, margin = SCROLL_MARGIN) {
  const within = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  return {
    scale: view.scale,
    x: within(view.x, Math.min(0, w - w * view.scale) - margin.x, Math.max(0, w - w * view.scale) + margin.x),
    y: within(view.y, Math.min(0, h - h * view.scale) - margin.y, Math.max(0, h - h * view.scale) + margin.y),
  };
}

/** Elements a drag works on itself (handles, inputs), so it does not pan. */
const OWN_DRAG = 'button, a, input, select, textarea, [role="slider"], [data-own-drag]';

/** Zoom and pan for any content, behind a view lock. The content keeps its own clicks and handles. */
export function ZoomPane({ children, min = 1, max = 4, what = 'zoom and pan', className, controlsClassName, contentProps, onView, margin = SCROLL_MARGIN }: {
  children: React.ReactNode; min?: number; max?: number; what?: string; className?: string; controlsClassName?: string;
  /** The most a pan can pull the content in from the pane's edges, across and down (SCROLL_MARGIN). */
  margin?: { x: number; y: number };
  /** Attributes for the moving layer, e.g. a mark that lets what is drawn over the content (arrows) live in it. */
  contentProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
  /** Called after each change of the view (a pan, a zoom, a reset). */
  onView?: (view: { scale: number; x: number; y: number }) => void;
}) {
  const lock = useViewLock();
  const box = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ scale: 1, x: 0, y: 0 });
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  /** A view kept inside its four corners (boundView), for this pane's size. */
  const bound = React.useCallback((v: { scale: number; x: number; y: number }) => {
    const el = box.current;
    return el ? boundView(v, el.clientWidth, el.clientHeight, margin) : v;
  }, [margin]);
  const viewed = React.useRef(onView);
  viewed.current = onView;
  React.useEffect(() => viewed.current?.(view), [view]);

  /** Zooms by `by` about a point in the pane (its centre if none). */
  const zoomAt = React.useCallback((by: number, px?: number, py?: number) => {
    const el = box.current;
    if (!el) return;
    const cx = px ?? el.clientWidth / 2, cy = py ?? el.clientHeight / 2;
    setView((v) => {
      const scale = Math.min(max, Math.max(min, v.scale * by));
      const k = scale / v.scale;
      return scale === 1 ? { scale, x: 0, y: 0 } : bound({ scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    });
  }, [min, max, bound]);

  // A wheel listener of our own, not passive, so an unlocked zoom (or a locked pinch) does not also
  // scroll or zoom the page. A plain wheel over a locked view scrolls the page as usual.
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (lock.locked) { if (isZoomWheel(e)) { e.preventDefault(); lock.refuse(el); } return; }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (isZoomWheel(e) ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [lock, zoomAt]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest(OWN_DRAG)) return;
    const el = e.currentTarget, start = { x: e.clientX, y: e.clientY }, from = view;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      if (!moved) {
        moved = true;
        if (lock.locked) { lock.refuse(el); up(); return; }
        try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
      }
      setView(bound({ ...from, x: from.x + dx, y: from.y + dy }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div ref={box} data-slot="zoom-pane" data-locked={lock.locked || undefined} data-zoomed={view.scale !== 1 || undefined}
      className={cn('relative h-full w-full overflow-hidden', className)}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest(OWN_DRAG)) return;
        if (lock.locked) { lock.refuse(e.currentTarget); return; }
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(ZOOM_STEP * ZOOM_STEP, e.clientX - r.left, e.clientY - r.top);
      }}>
      {/* The viewport fades at each edge the content runs past once zoomed or panned (the same mask as
          every scrolling surface, sized from the view instead of a scroll position); the controls sit
          outside it. */}
      <div data-slot="zoom-viewport" className="relative h-full w-full overflow-hidden" style={fadeStyle(view, box.current)}>
        <div {...contentProps} data-slot="zoom-content" className="relative h-full w-full origin-top-left"
          style={view.scale === 1 && !view.x && !view.y ? undefined : { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {children}
        </div>
      </div>
      <ViewControls lock={lock} what={what} className={controlsClassName}
        onZoomIn={() => zoomAt(ZOOM_STEP)} onZoomOut={() => zoomAt(1 / ZOOM_STEP)}
        onReset={() => setView({ scale: clamp(1), x: 0, y: 0 })} />
    </div>
  );
}
