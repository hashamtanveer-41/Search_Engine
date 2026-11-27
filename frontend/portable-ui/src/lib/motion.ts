// Motion: springs and gestures, for everything in the library that moves.
//
// The rule: a motion has no fixed length. It is a spring with a value, a velocity
// and a target, so it can be stopped, grabbed or sent somewhere else at any point and carries on
// from where it is, as fast as it was going. A gesture hands over its own speed: let go of a sheet
// mid-flick and it keeps that speed, and how far a flick would carry decides where it lands.
//
//   const s = new Spring(0, (v) => el.style.setProperty('--p', String(v)));
//   s.to(1);                        // springs to 1
//   s.set(0.4);                     // a finger holds it at 0.4 (it stops there)
//   s.to(0, { velocity: -3 });      // let go, moving back at 3 units a second
//
// Under prefers-reduced-motion a spring jumps straight to its target.
import * as React from 'react';

export interface SpringConfig {
  /** Pull toward the target: higher is snappier. */
  stiffness: number;
  /** Friction: at 2·sqrt(stiffness) nothing overshoots; below it, a little does. */
  damping: number;
  /** Close enough to stop, in the value's own units. */
  precision?: number;
}

/** The library's springs: one family, so everything feels related. */
export const SPRINGS = {
  /** Things that move into place: sheets, dialogs, indicators. Barely overshoots. */
  settle: { stiffness: 420, damping: 40 },
  /** Small things appearing: a dot, a badge, a menu. A touch of bounce. */
  pop: { stiffness: 600, damping: 30 },
  /** Big, slow things: a height opening, a pane. */
  gentle: { stiffness: 260, damping: 32 },
} satisfies Record<string, SpringConfig>;

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const STEP = 1 / 240;

/** One step of a damped spring; exported for tests. */
export function stepSpring(value: number, velocity: number, target: number, config: SpringConfig, dt: number): [number, number] {
  let x = value, v = velocity;
  for (let t = 0; t < dt; t += STEP) {
    const h = Math.min(STEP, dt - t);
    const a = -config.stiffness * (x - target) - config.damping * v;
    v += a * h;
    x += v * h;
  }
  return [x, v];
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  /** A finger has it (`set`), until the next `to`. */
  held = false;
  config: SpringConfig;
  private frame = 0;
  private last = 0;
  private rest: (() => void)[] = [];

  constructor(value: number, private onChange: (value: number) => void, config: SpringConfig = SPRINGS.settle) {
    this.value = value;
    this.target = value;
    this.config = config;
  }

  get moving() { return this.frame !== 0; }

  /** Springs to `target`, from where it is now; `velocity` (units a second) replaces its own.
   *  With reduced motion it jumps there, unless `gesture`: the end of a move the reader's own finger
   *  started (a swipe let go mid-way), which carries on at their speed instead of cutting (16 Nov). */
  to(target: number, options: { velocity?: number; config?: SpringConfig; gesture?: boolean } = {}) {
    this.target = target;
    this.held = false;
    if (options.config) this.config = options.config;
    if (options.velocity !== undefined) this.velocity = options.velocity;
    if ((reducedMotion() && !options.gesture) || typeof requestAnimationFrame === 'undefined') { this.jump(target); return this; }
    if (!this.frame) { this.last = performance.now(); this.frame = requestAnimationFrame(this.tick); }
    return this;
  }

  /** Holds it at `value` (a finger has it): no motion until the next `to`. */
  set(value: number) {
    this.halt();
    this.held = true;
    this.velocity = 0;
    this.value = value;
    this.onChange(value);
  }

  /** At `value` at once, at rest. */
  jump(value: number) {
    this.target = value;
    this.set(value);
    this.held = false;
    this.settled();
  }

  /** Stops where it is. */
  stop() { this.halt(); this.velocity = 0; }

  /** Calls `fn` once it next comes to rest. */
  onRest(fn: () => void) { this.rest.push(fn); }

  private halt() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }

  private settled() { const fns = this.rest; this.rest = []; fns.forEach((fn) => fn()); }

  private tick = (now: number) => {
    // A hidden tab hands back a long gap: take it in one bounded go, not a jump.
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    [this.value, this.velocity] = stepSpring(this.value, this.velocity, this.target, this.config, dt);
    const precision = this.config.precision ?? 0.001;
    if (Math.abs(this.value - this.target) < precision && Math.abs(this.velocity) < precision * 10) {
      this.frame = 0;
      this.value = this.target;
      this.velocity = 0;
      this.onChange(this.value);
      this.settled();
      return;
    }
    this.onChange(this.value);
    this.frame = requestAnimationFrame(this.tick);
  };
}

/** A spring owned by a component: stopped when it unmounts. `onChange` may change between renders. */
export function useSpring(initial: number, onChange: (value: number) => void, config?: SpringConfig) {
  const change = React.useRef(onChange);
  change.current = onChange;
  const [spring] = React.useState(() => new Spring(initial, (v) => change.current(v), config));
  React.useEffect(() => () => spring.stop(), [spring]);
  return spring;
}

// ---------------------------------------------------------------------------------------- gestures

/** The speed of a pointer, from its last few positions (units a second). */
export class VelocityTracker {
  private samples: { t: number; x: number }[] = [];
  add(x: number, t = performance.now()) {
    this.samples.push({ t, x });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }
  velocity() {
    const s = this.samples;
    if (s.length < 2) return 0;
    const first = s[0], last = s[s.length - 1];
    const dt = (last.t - first.t) / 1000;
    // Under a frame's worth of samples says nothing about speed (events that arrived together).
    return dt >= 0.012 ? (last.x - first.x) / dt : 0;
  }
  reset() { this.samples = []; }
}

/** Where a flick moving at `velocity` would come to rest, decelerating as a scroll does. */
export function project(position: number, velocity: number, deceleration = 0.998) {
  return position + (velocity / 1000) * deceleration / (1 - deceleration);
}

/** The snap point nearest where a flick would land. */
export function landing(position: number, velocity: number, snaps: number[]) {
  const end = project(position, velocity);
  return snaps.reduce((best, s) => (Math.abs(s - end) < Math.abs(best - end) ? s : best), snaps[0]);
}

export interface DragOptions {
  axis: 'x' | 'y';
  /** Pixels along the axis before it counts as a drag (a tap below that). */
  threshold?: number;
  /** A drag began: return false to leave this one alone (say, the wrong direction). */
  onStart?(e: PointerEvent): boolean | void;
  /** Moved: how far along the axis since the press, in pixels. */
  onMove(offset: number, e: PointerEvent): void;
  /** Let go: the offset and the speed along the axis, in pixels a second. */
  onEnd(offset: number, velocity: number): void;
  /** Elements a press inside does not drag. */
  ignore?: string;
}

/**
 * Drags along one axis, starting only when the pointer moves more along that axis than across it
 * (so a page still scrolls the other way). Spread the result onto the element; give it the
 * touch-action that leaves the other axis to the browser (`pan-y` for a sideways drag).
 */
export function useDrag(options: DragOptions) {
  const opts = React.useRef(options);
  opts.current = options;
  const onPointerDown = React.useCallback((down: React.PointerEvent<HTMLElement>) => {
    const { ignore = 'input, textarea, select, [data-no-drag]', threshold = 6 } = opts.current;
    if (down.button !== 0 || (down.target as Element).closest(ignore)) return;
    const el = down.currentTarget;
    const id = down.pointerId;
    const start = { x: down.clientX, y: down.clientY };
    const tracker = new VelocityTracker();
    let state: 'pending' | 'dragging' | 'ignored' = 'pending';
    const along = (e: PointerEvent) => (opts.current.axis === 'x' ? e.clientX - start.x : e.clientY - start.y);
    const across = (e: PointerEvent) => (opts.current.axis === 'x' ? e.clientY - start.y : e.clientX - start.x);
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if (state === 'pending') {
        const a = Math.abs(along(e)), c = Math.abs(across(e));
        if (a < threshold && c < threshold) return;
        if (c > a || opts.current.onStart?.(e) === false) { state = 'ignored'; finish(); return; }
        state = 'dragging';
        try { el.setPointerCapture(id); } catch { /* gone */ }
        // A click that ends a drag is not a click.
        el.addEventListener('click', swallow, { capture: true, once: true });
      }
      last = along(e);
      tracker.add(last, e.timeStamp || performance.now());
      opts.current.onMove(last, e);
    };
    let last = 0;
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      // The browser took the touch over (a scroll): a cancel carries no position, so it ends where
      // the finger last was, at rest.
      if (e.type === 'pointercancel') {
        finish();
        if (state === 'dragging') opts.current.onEnd(last, 0);
        return;
      }
      finish();
      // The click a drag ends with comes straight after this with a mouse, a little later after a
      // touch; one that never comes is not waited for long.
      if (state === 'dragging') setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 400);
      if (state === 'dragging') {
        tracker.add(along(e), e.timeStamp || performance.now());
        opts.current.onEnd(along(e), tracker.velocity());
      }
    };
    // A finger held on it before it moves (a press-and-hold, then a drag) is not a long press: no
    // context menu, no text selected under it, either of which takes the finger away (17 Nov).
    const finger = down.pointerType === 'touch';
    const quiet = (ev: Event) => ev.preventDefault();
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (finger) { window.removeEventListener('contextmenu', quiet, true); document.removeEventListener('selectstart', quiet, true); }
      if (state !== 'dragging') el.removeEventListener('click', swallow, { capture: true });
    };
    tracker.add(0, down.timeStamp || performance.now());
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    if (finger) { window.addEventListener('contextmenu', quiet, true); document.addEventListener('selectstart', quiet, true); }
  }, []);
  return { onPointerDown };
}

/** Eats the click a drag ends with: the browser's own, never one the code sends (a switch flipped
 *  by its drag). */
function swallow(e: Event) {
  if (!e.isTrusted) { e.currentTarget?.addEventListener('click', swallow, { capture: true, once: true }); return; }
  e.stopPropagation();
  e.preventDefault();
}

// ---------------------------------------------------------------------------------------- presence

/**
 * Something that opens and closes on a spring (a sheet, a dialog): `progress` runs 0 (gone) to 1
 * (open), and it stays `present` (mounted) until a close has finished, so closing can be seen and
 * turned round. `drive(p)` writes the progress to the page; a gesture holds it with `spring.set`.
 */
export function usePresence(open: boolean, drive: (progress: number) => void, config: SpringConfig = SPRINGS.settle) {
  const [present, setPresent] = React.useState(open);
  const spring = useSpring(open ? 1 : 0, drive, config);
  React.useEffect(() => {
    if (open) {
      setPresent(true);
      // Drawn closed first, then sprung open (it may be turning round from a close).
      requestAnimationFrame(() => { drive(spring.value); if (!spring.held) spring.to(1); });
    } else if (spring.value > 0 || spring.moving) {
      spring.onRest(() => { if (spring.target === 0) setPresent(false); });
      spring.to(0);
    } else {
      setPresent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spring]);
  return { present, spring };
}

// ---------------------------------------------------------------------------------------- pop-ups

/** What a menu, popover, select or tooltip's content needs from its root: a ref to drive, and the
 *  look it starts with. */
export interface Pop { ref(el: HTMLElement | null): void; style: React.CSSProperties }
export const PopContext = React.createContext<Pop | null>(null);

/** How a pop-up looks at progress `p`: it grows from its anchor (the transform origin Radix sets)
 *  and fades, a few pixels away from the side it opens on. */
function popLook(el: HTMLElement, p: number) {
  const q = Math.max(0, Math.min(1, p));
  const away = (1 - p) * 6;
  const side = el.dataset.side;
  el.style.opacity = String(q);
  el.style.scale = String(0.95 + 0.05 * p);
  el.style.translate = side === 'top' ? `0 ${away}px` : side === 'left' ? `${away}px 0` : side === 'right' ? `${-away}px 0` : `0 ${-away}px`;
}

/**
 * A pop-up's root: open state (controlled or not) and a spring for its content, kept mounted
 * until a close has finished. Pass `present` and `setOpen` to the Radix root, and `pop` to
 * PopContext for the content.
 */
export function usePopRoot(openProp: boolean | undefined, defaultOpen: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined) {
  const [own, setOwn] = React.useState(defaultOpen ?? false);
  const open = openProp ?? own;
  const change = React.useRef(onOpenChange);
  change.current = onOpenChange;
  const setOpen = React.useCallback((next: boolean) => { if (openProp === undefined) setOwn(next); change.current?.(next); }, [openProp]);
  const node = React.useRef<HTMLElement | null>(null);
  const { present, spring } = usePresence(open, (p) => {
    const el = node.current;
    if (!el) return;
    popLook(el, p);
    // Closing, it no longer takes the pointer: what is under it is what a click reaches. Open, it
    // takes it: 'auto', not '' (which would wipe the 'auto' Radix puts on a modal menu while it
    // turns the page's pointer off, leaving the open menu unclickable, 16 Nov).
    el.style.pointerEvents = spring.target === 0 ? 'none' : 'auto';
  }, SPRINGS.pop);
  const pop = React.useMemo<Pop>(() => ({
    ref: (el) => { node.current = el; if (el) popLook(el, spring.value); },
    style: { opacity: spring.value },
  }), [spring]);
  return { present, setOpen, pop };
}

// ---------------------------------------------------------------------------------------- opening in place

const OPENS = "[data-slot='accordion-content'], [data-slot='disclosure']";
const isOpen = (el: HTMLElement) => el.dataset.state === 'open' || el.hasAttribute('data-open');

/** Draws something that opens in place (an accordion panel, a sidebar chapter) at progress `p`:
 *  its row grows from nothing to its height (a grid row of p·fr), and its text rises in. */
function openLook(el: HTMLElement, p: number) {
  const q = Math.max(0, p);
  el.style.gridTemplateRows = `${q.toFixed(4)}fr`;
  el.style.visibility = q > 0.001 || isOpen(el) ? 'visible' : 'hidden';
  const body = el.querySelector<HTMLElement>(":scope > [data-slot='accordion-body'], :scope > * > [data-slot='accordion-body']");
  if (body) { body.style.opacity = String(Math.min(1, q)); body.style.translate = `0 ${((1 - Math.min(1, q)) * -4).toFixed(2)}px`; }
}

const opening = new WeakMap<HTMLElement, Spring>();

/** Puts everything that opens in place on a spring: opened or closed mid-way, it turns round from
 *  where it is. Watches the page, so it covers what the app renders too. Call once, at start-up. */
export function installOpenSprings(doc: Document = document) {
  if (once(doc, 'open')) return;
  const follow = (el: HTMLElement, first: boolean) => {
    let spring = opening.get(el);
    if (!spring) {
      spring = new Spring(isOpen(el) ? 1 : 0, (p) => openLook(el, p), SPRINGS.gentle);
      opening.set(el, spring);
      openLook(el, spring.value);
      if (first) return;
    }
    spring.to(isOpen(el) ? 1 : 0);
  };
  doc.querySelectorAll<HTMLElement>(OPENS).forEach((el) => follow(el, true));
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') { const el = r.target as HTMLElement; if (el.matches?.(OPENS)) follow(el, false); continue; }
      r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches(OPENS)) follow(n, true);
        n.querySelectorAll<HTMLElement>(OPENS).forEach((el) => follow(el, true));
      });
    }
  }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'data-open'] });
}

/** True when `what` is already installed on `doc`, and marks it installed: each installer watches the
 *  page once, however often start-up code (or a hot reload) calls it, so no motion runs twice. */
const installed = new WeakMap<Document, Set<string>>();
function once(doc: Document, what: string) {
  const done = installed.get(doc) ?? new Set<string>();
  installed.set(doc, done);
  if (done.has(what)) return true;
  done.add(what);
  return false;
}

// ---------------------------------------------------------------------------------------- lists

const LISTS = '.data-table > tbody, [data-spring-list]';
/** More rows than this changing at once (a search narrowing a table) just change, no motion. */
const LIST_BURST = 8;

/** A row this module is taking off the page. The mark is an empty attribute (`data-leaving`), so test
 *  for the attribute: its value is '', which is falsy, and reading it as a flag let the module take
 *  its own leaving rows for new ones, and their removal for a new removal, forever (16 Nov). */
const leaving = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.hasAttribute('data-leaving');

/** Where each row is, so rows that move when another leaves can be sprung from there. */
const tops = (rows: Element[]) => new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));

/** Slides rows from where they were to where they are now (a gap closing above them). */
function settleRows(before: Map<Element, number>) {
  before.forEach((top, row) => {
    if (!(row instanceof HTMLElement) || !row.isConnected) return;
    const dy = top - row.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    const s = new Spring(dy, (y) => { row.style.translate = Math.abs(y) < 0.5 ? '' : `0 ${y}px`; }, SPRINGS.settle);
    s.to(0);
  });
}

/**
 * Rows of a table (`.data-table`) or any `[data-spring-list]` spring in when added and out when
 * removed: a new row rises in and fades up; a removed one is held where it was, fades and slides
 * aside, then goes, and the rows below close the gap on a spring. The app removes rows as it
 * always did; this watches the page. Call once, at start-up.
 */
export function installListSprings(doc: Document = document) {
  if (reducedMotion() || once(doc, 'list')) return;
  new MutationObserver((records) => {
    for (const r of records) {
      const list = r.target as HTMLElement;
      if (r.type !== 'childList' || !list.matches?.(LISTS)) continue;
      const added = [...r.addedNodes].filter((n): n is HTMLElement => n instanceof HTMLElement && !leaving(n));
      // A node React moved is removed and added again: still connected, so not leaving.
      const removed = [...r.removedNodes].filter((n): n is HTMLElement => n instanceof HTMLElement && !n.isConnected && !leaving(n));
      if (added.length + removed.length > LIST_BURST) continue;
      for (const row of added) {
        const s = new Spring(0, (p) => { row.style.opacity = p >= 1 ? '' : String(Math.min(1, p)); row.style.translate = p >= 1 ? '' : `0 ${((1 - p) * 8).toFixed(2)}px`; }, SPRINGS.settle);
        s.set(0);
        s.to(1);
      }
      for (const row of removed) {
        // Put it back where it was, for as long as it takes to leave (React no longer owns it).
        const next = r.nextSibling && r.nextSibling.parentNode === list ? r.nextSibling : null;
        row.dataset.leaving = '';
        row.setAttribute('aria-hidden', 'true');
        row.style.pointerEvents = 'none';
        list.insertBefore(row, next);
        const leave = new Spring(1, (p) => { row.style.opacity = String(Math.max(0, p)); row.style.translate = `${((1 - p) * 24).toFixed(2)}px 0`; }, SPRINGS.settle);
        leave.onRest(() => {
          const others = [...list.children].filter((c) => c !== row);
          const before = tops(others);
          row.remove();
          settleRows(before);
        });
        leave.to(0);
      }
    }
  }).observe(doc.body, { subtree: true, childList: true });
}
