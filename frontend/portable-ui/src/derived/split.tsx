// Two panes of one place, side by side ("projects can be split side by side on
// desktop and tablet and top and bottom on mobile", "restricted to two panes per a screen", "not fully
// paned"): not the reader's Workspace, with its tabs, splits and spaces, but a pair. Each pane has a
// slim header (its name, its buttons, × to close it) and scrolls on its own; between them a divider,
// dragged or moved with the arrow keys, each pane kept to at least a third or so. A phone stacks the
// two, the divider dragged up and down. The share is the app's to keep (useSplitShare: per person, in
// this browser).
//
// `useDragBeside` is the way in: a press on something (a sidebar's link) that becomes a drag shows,
// over the page, where it would go: the right half (the bottom half on a phone), "Open beside".
import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '../base/button';
import { cn } from '../lib/utils';
import { PHONE_QUERY } from './panes/Workspace';

/** Side by side ('row') or one above the other ('column'). */
export type SplitOrientation = 'row' | 'column';
/** The least either pane may have of the split. */
export const SPLIT_MIN = 0.3;
/** How far an arrow key moves the divider. */
export const SPLIT_STEP = 0.05;

const clampShare = (share: number, min = SPLIT_MIN) => (Number.isFinite(share) ? Math.min(1 - min, Math.max(min, share)) : 0.5);

/** A phone stacks the panes; a tablet and a desktop put them side by side. */
export function useSplitOrientation(): SplitOrientation {
  const read = () => (typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches ? 'column' : 'row');
  const [orientation, setOrientation] = React.useState<SplitOrientation>(read);
  React.useEffect(() => {
    const list = window.matchMedia?.(PHONE_QUERY);
    if (!list?.addEventListener) return;
    const change = () => setOrientation(read());
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, []);
  return orientation;
}

/** The first pane's share, kept under `key` in this browser (a phone's stack and a desktop's row
 *  apart: the app adds the orientation to the key). Even, to start with, and wherever storage is off. */
export function useSplitShare(key: string): [number, (share: number) => void] {
  const read = React.useCallback(() => {
    try { const saved = Number(localStorage.getItem(key)); return saved ? clampShare(saved) : 0.5; } catch { return 0.5; }
  }, [key]);
  const [share, setShare] = React.useState(read);
  React.useEffect(() => setShare(read()), [read]);
  const choose = React.useCallback((next: number) => {
    const s = clampShare(next);
    setShare(s);
    try { localStorage.setItem(key, s.toFixed(3)); } catch { /* kept for this visit */ }
  }, [key]);
  return [share, choose];
}

export interface SplitPane {
  /** Which it is (a page's id), on the pane as `data-pane`. */
  id: string;
  /** Its name, in its header (and in its buttons' names). */
  title: string;
  icon?: React.ReactNode;
  /** The header's buttons before the ×: make it the main one, a menu. */
  actions?: React.ReactNode;
  /** × in its header. */
  onClose?(): void;
  children: React.ReactNode;
}

export interface SplitProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  panes: [SplitPane, SplitPane];
  /** The first pane's share, 0 to 1 (held between `min` and 1 − `min`). */
  share: number;
  onShareChange(share: number): void;
  /** By the device when not given (useSplitOrientation). */
  orientation?: SplitOrientation;
  min?: number;
}

export function Split({ panes, share, onShareChange, orientation: given, min = SPLIT_MIN, className, style, ...props }: SplitProps) {
  const device = useSplitOrientation();
  const orientation = given ?? device;
  const row = orientation === 'row';
  const box = React.useRef<HTMLDivElement>(null);
  // While the divider is held: where it is (the panes follow it live; the share is kept on letting go).
  const [live, setLive] = React.useState<number | null>(null);
  const uid = React.useId();
  const clamp = (s: number) => clampShare(s, min);
  const s = clamp(live ?? share);
  const percent = Math.round(s * 100);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = box.current?.getBoundingClientRect();
    const size = rect ? (row ? rect.width : rect.height) : 0;
    if (!rect || size <= 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    try { handle.setPointerCapture(pointerId); } catch { /* gone already */ }
    let last = s;
    const at = (ev: PointerEvent) => clamp(((row ? ev.clientX - rect.left : ev.clientY - rect.top)) / size);
    const move = (ev: PointerEvent) => { if (ev.pointerId !== pointerId) return; last = at(ev); setLive(last); };
    const end = (keep: boolean) => (ev: Event) => {
      if (ev instanceof PointerEvent && ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      try { if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId); } catch { /* ignore */ }
      setLive(null);
      if (keep) onShareChange(last);
    };
    const up = end(true);
    const cancel = end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const back = row ? 'ArrowLeft' : 'ArrowUp';
    const on = row ? 'ArrowRight' : 'ArrowDown';
    let next: number | null = null;
    if (e.key === back) next = s - SPLIT_STEP;
    else if (e.key === on) next = s + SPLIT_STEP;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = 1 - min;
    else if (e.key === 'Enter') next = 0.5;
    if (next === null) return;
    e.preventDefault();
    onShareChange(clamp(next));
  };

  const tracks = `minmax(0,${s}fr) auto minmax(0,${1 - s}fr)`;
  const pane = (p: SplitPane, i: number) => (
    <section key={p.id} data-slot="split-pane" data-pane={p.id} aria-labelledby={`${uid}-${i}`}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <header data-slot="split-pane-head" className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar ps-3 pe-1 text-[13px] pointer-coarse:h-11">
        {p.icon && <span aria-hidden className="flex shrink-0 text-muted-foreground [&_svg]:size-4">{p.icon}</span>}
        <span id={`${uid}-${i}`} data-slot="split-pane-title" className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {p.actions}
          {p.onClose && <Button variant="ghost" size="icon-sm" aria-label={`Close ${p.title}`} title="Close" onClick={p.onClose}><X /></Button>}
        </span>
      </header>
      <div data-slot="split-pane-body" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">{p.children}</div>
    </section>
  );
  return (
    <div ref={box} data-slot="split" data-orientation={orientation} data-resizing={live !== null || undefined}
      className={cn('grid min-h-0 min-w-0', live !== null && (row ? 'cursor-col-resize select-none' : 'cursor-row-resize select-none'), className)}
      style={{ ...(row ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks }), ...style }} {...props}>
      {pane(panes[0], 0)}
      <div role="separator" tabIndex={0} data-slot="split-divider" data-held={live !== null || undefined}
        aria-orientation={row ? 'vertical' : 'horizontal'} aria-label="Resize the panes"
        aria-valuemin={Math.round(min * 100)} aria-valuemax={Math.round((1 - min) * 100)} aria-valuenow={percent}
        aria-valuetext={`${panes[0].title} ${percent}%, ${panes[1].title} ${100 - percent}%`}
        title="Drag to resize · Enter to share evenly"
        onPointerDown={onDown} onKeyDown={onKey} onDoubleClick={() => onShareChange(0.5)}
        className={cn('group relative z-10 flex touch-none items-center justify-center outline-none',
          row
            // A hairline on a desktop, its grip reaching 4px either side; a finger gets a handle.
            ? 'w-px cursor-col-resize bg-border pointer-coarse:w-3.5 pointer-coarse:border-x pointer-coarse:bg-muted'
            : 'h-3.5 cursor-row-resize border-y bg-muted')}>
        <span aria-hidden className={cn('absolute', row ? 'inset-y-0 -inset-x-1 pointer-coarse:-inset-x-4' : '-inset-y-4 inset-x-0')} />
        <span aria-hidden data-slot="split-divider-line" className={cn('absolute transition-colors',
          row ? 'inset-y-0 -inset-x-px group-hover:bg-info group-active:bg-info group-focus-visible:bg-foreground group-data-[held]:bg-info pointer-coarse:hidden'
            : 'hidden')} />
        <span aria-hidden data-slot="split-divider-grip" className={cn('rounded-full bg-foreground/60 group-focus-visible:bg-foreground',
          row ? 'hidden h-11 w-[5px] pointer-coarse:block' : 'h-[5px] w-11')} />
      </div>
      {pane(panes[1], 1)}
    </div>
  );
}

// ------------------------------------------------------------------ dragging something in

const DRAG_THRESHOLD = 5;
const TOUCH_HOLD_MS = 350;
const TOUCH_SLOP = 8;

export interface BesideDrag {
  /** What is held, on the chip under the pointer. */
  title: string;
  /** What the drop zone says: "Open beside". */
  label: string;
  /** The zone is the whole page, not its far half: what is held opens as the page (one that cannot
   *  be a pane, say). */
  whole?: boolean;
  onDrop(): void;
}

export interface DragBesideOptions {
  /** The page it drops on (the frame's main area). */
  area(): HTMLElement | null;
  orientation: SplitOrientation;
  /** The press became a drag (the phone's menu closes, say, so the page can be dropped on). */
  onHold?(): void;
  /** The pointer left `from()`'s box while held, once a drag: a sidebar showing something else goes back. */
  leave?: { from(): Element | null; onLeave(): void };
}

type Held = { drag: BesideDrag; area: DOMRect; over: boolean };

/** The far half of `area` (or all of it) a drop goes into. */
function zoneOf(area: DOMRect, orientation: SplitOrientation, whole?: boolean) {
  if (whole) return { left: area.left, top: area.top, width: area.width, height: area.height };
  return orientation === 'row'
    ? { left: area.left + area.width / 2, top: area.top, width: area.width / 2, height: area.height }
    : { left: area.left, top: area.top + area.height / 2, width: area.width, height: area.height / 2 };
}

/**
 * Press, hold, move, drop, as a pane's tab is dragged in the reader (panes/useTabDrag.ts): with a mouse
 * the drag starts after 5px; with a finger after a 350ms hold (moving first was a scroll). Escape,
 * pointercancel and a window blur call it off; the click that ends a drag is swallowed. Returns the
 * press handler and what to draw while it is held (the zone and the chip, at the end of <body>).
 */
export function useDragBeside(options: DragBesideOptions): [(e: React.PointerEvent<HTMLElement>, drag: BesideDrag) => void, React.ReactNode] {
  const opts = React.useRef(options);
  opts.current = options;
  const [held, setHeld] = React.useState<Held | null>(null);
  const ghost = React.useRef<HTMLDivElement>(null);
  const live = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => live.current?.(), []);

  const start = React.useCallback((e: React.PointerEvent<HTMLElement>, drag: BesideDrag) => {
    if (e.button !== 0) return;
    live.current?.();
    const touch = e.pointerType === 'touch';
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    const from = { x: e.clientX, y: e.clientY };
    const last = { x: e.clientX, y: e.clientY };
    let area: DOMRect | null = null;
    let over = false;
    let left = false;
    const holdTimer = touch ? setTimeout(() => hold(), TOUCH_HOLD_MS) : null;

    function place() {
      const g = ghost.current;
      if (g) g.style.transform = `translate(${last.x + 12}px, ${last.y + 14}px)`;
      if (!area) return;
      const z = zoneOf(area, opts.current.orientation, drag.whole);
      const now = last.x >= z.left && last.x <= z.left + z.width && last.y >= z.top && last.y <= z.top + z.height;
      if (now !== over) { over = now; setHeld((h) => (h ? { ...h, over } : h)); }
      const l = opts.current.leave;
      if (l && !left) {
        const box = l.from()?.getBoundingClientRect();
        if (box && (last.x < box.left || last.x > box.right || last.y < box.top || last.y > box.bottom)) { left = true; l.onLeave(); }
      }
    }
    function hold() {
      const el = opts.current.area();
      if (!el) return cleanup();
      area = el.getBoundingClientRect();
      if (touch) {
        // Held by a finger: the page does not scroll, nor the long-press menu open, while it is dragged.
        window.addEventListener('touchmove', noScroll, { passive: false });
        handle.addEventListener('touchmove', noScroll, { passive: false });
        window.addEventListener('contextmenu', noScroll, true);
      }
      try { handle.setPointerCapture(pointerId); } catch { /* ignore */ }
      setHeld({ drag, area, over: false });
      opts.current.onHold?.();
      place();
      // The chip is drawn by the render this set off: placed once it is there.
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
    }
    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      last.x = ev.clientX;
      last.y = ev.clientY;
      if (!area) {
        const moved = Math.hypot(ev.clientX - from.x, ev.clientY - from.y);
        if (touch) { if (moved > TOUCH_SLOP) cleanup(); return; }
        if (ev.buttons === 0) return cleanup();
        if (moved > DRAG_THRESHOLD) hold();
        return;
      }
      ev.preventDefault();
      place();
    }
    function noScroll(ev: Event) { if (area) ev.preventDefault(); }
    function swallowClick(ev: MouseEvent) { ev.preventDefault(); ev.stopPropagation(); }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }
    function finish(drop: boolean) {
      const wasHeld = !!area;
      const into = over;
      cleanup();
      if (!wasHeld) return;
      // The click that ends a drag is not a click on whatever is under the pointer (the link pressed).
      window.addEventListener('click', swallowClick, true);
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
      if (drop && into) drag.onDrop();
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(true); };
    const onCancel = (ev: Event) => { if (!(ev instanceof PointerEvent) || ev.pointerId === pointerId) finish(false); };
    function cleanup() {
      if (holdTimer) clearTimeout(holdTimer);
      area = null;
      setHeld(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('touchmove', noScroll);
      handle.removeEventListener('touchmove', noScroll);
      window.removeEventListener('contextmenu', noScroll, true);
      try { if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId); } catch { /* ignore */ }
      live.current = null;
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey, true);
    live.current = () => finish(false);
  }, []);

  const overlay = held && typeof document !== 'undefined' ? createPortal(
    <>
      <SplitDropZone rect={zoneOf(held.area, options.orientation, held.drag.whole)} label={held.drag.label} over={held.over} />
      <div ref={ghost} data-slot="split-ghost" aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[60] max-w-60 truncate rounded-md bg-foreground px-2.5 py-1 text-[12.5px] font-medium text-background shadow-lg"
        style={{ transform: 'translate(-9999px, 0)' }}>
        {held.drag.title}
      </div>
    </>,
    document.body,
  ) : null;
  return [start, overlay];
}

/** Where a drop goes, over the page: a dashed box saying what dropping does, lit while it is over it. */
export function SplitDropZone({ rect, label, over = false, className }: { rect: { left: number; top: number; width: number; height: number }; label: string; over?: boolean; className?: string }) {
  return (
    <div data-slot="split-drop" data-over={over || undefined} role="status" aria-live="polite"
      className={cn('pointer-events-none fixed z-50 p-2', className)} style={rect}>
      <div className={cn('grid size-full place-items-center rounded-xl border-2 border-dashed transition-colors duration-150',
        over ? 'border-info bg-info-soft/80' : 'border-info-line bg-info-soft/35')}>
        <span className={cn('rounded-full px-3 py-1 text-[13px] font-semibold shadow-sm transition-colors', over ? 'bg-info text-white' : 'bg-background text-info ring-1 ring-info-line')}>{label}</span>
      </div>
    </div>
  );
}
