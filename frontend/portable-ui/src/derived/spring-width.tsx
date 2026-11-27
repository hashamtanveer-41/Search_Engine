// A box that holds one of two layouts of the same thing (a sidebar: full, or a rail) and plays the
// change between them. The new layout is on the page at once, at its own width,
// so everything lays out once; what is drawn then goes from the old picture to the new one on one
// spring (lib/motion), by transform, clip-path and opacity only:
// - the box's edge travels from the old width to the new: its `surface` (the look of the layouts'
//   own background and border) is drawn that wide, and a new layout wider than that is cut to it;
// - the box's own width follows the edge, so what sits beside it (the panes) resizes with it, a
//   frame at a time, as it does when the window is resized (it was laid out at its
//   new width at once and slid there, so its text jumped to the new width before anything moved);
// - what the two layouts share (an element with the same `data-flip` in both: an icon, the mark,
//   the avatar) goes from where it was to where it is, growing or shrinking from its old size;
// - everything else of the new layout fades in, and the old layout, kept on the page over it
//   until it has gone, fades out (what it shares is the travelling thing, so it is not drawn twice).
// A change mid-way turns all of it round from where it is drawn, at the speed it had. With reduced
// motion nothing travels: the new layout fades in where it is.
//
// The old layout is read once, just before React changes the page, and the new one once, right
// after. No other render reads the page; what is beside the box lays out each frame (the panes
// handle that as a window resize: their cards follow at once and their pages lay out live).
import * as React from 'react';
import { reducedMotion, SPRINGS, useSpring } from '../lib/motion';
import { cn } from '../lib/utils';

/** The edge's spring, in pixels: it has arrived within half a pixel (the library's springs stop
 *  within a thousandth of their unit, which for a width is another half second of unseen frames). */
const EDGE = { ...SPRINGS.settle, precision: 0.5 };
/** How many fades come off in one frame once a change has arrived (each stops being a layer of
 *  its own, which restyles everything in it). */
const UNFADE = 8;

type Box = { x: number; y: number; w: number; h: number };
type Styled = HTMLElement | SVGElement;
const centre = (r: DOMRect): Box => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const shared = (root: Element) => [...root.querySelectorAll<HTMLElement>('[data-flip]')];

/** Tells `take` just before React changes the page for a new `on`: what is there is still the old. */
class Before extends React.Component<{ on: unknown; take(): void; children: React.ReactNode }> {
  getSnapshotBeforeUpdate(prev: { on: unknown }) {
    if (!Object.is(prev.on, this.props.on)) this.props.take();
    return null;
  }
  componentDidUpdate() { /* React asks for it beside getSnapshotBeforeUpdate */ }
  render() { return this.props.children; }
}

/** The old layout as it was drawn, taken just before the change. */
interface Taken {
  old: HTMLElement | null;
  /** Its width, and where the box's edge was drawn (mid-way through a change, not the same). */
  width: number;
  drawn: number;
  at: Map<string, Box>;
  /** How much of it showed, and of the layout before it, still on its way out. */
  shown: number;
  left: number;
}

interface Mover { el: Styled; dx: number; dy: number; sx: number; sy: number }
interface Change {
  from: number;
  to: number;
  /** The widest the edge is drawn: the surface is laid out that wide, once. */
  wide: number;
  movers: Mover[];
  faders: Styled[];
  riders: HTMLElement[];
  ghost: HTMLElement | null;
  ghostWidth: number;
  /** The new layout: its own border is not drawn on the way (the edge is the surface's). */
  live: HTMLElement | null;
  /** Where the new layout's fade starts and the old one's (a change mid-way starts from what shows). */
  shown: number;
  left: number;
  p: number;
  /** The fade as last written: the same value is not written again. */
  seen: string;
}

/** The parts of a layout that fade as a whole: every subtree that holds nothing the two layouts
 *  share (a label, a caption, a list), and what it marks as shared that the old one did not have. */
function fadersOf(root: Element, had: ReadonlyMap<string, Box>): Styled[] {
  const out: Styled[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      const key = (child as Styled).dataset?.flip;
      if (key !== undefined) { if (!had.has(key)) out.push(child as Styled); continue; }
      if (child.querySelector('[data-flip]')) walk(child);
      else out.push(child as Styled);
    }
  };
  walk(root);
  return out;
}

/** What is beside the box and makes room for it: the elements after it, or after its slot. */
function ridersOf(box: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let n = (box.closest('[data-sidebar-slot]') ?? box).nextElementSibling; n; n = n.nextElementSibling) if (n instanceof HTMLElement) out.push(n);
  return out;
}

export function SpringWidth({ children, flip, surface = 'border-r bg-sidebar' }: {
  children: React.ReactNode;
  /** Which of the two layouts is showing: when it changes, the change is played. */
  flip?: unknown;
  /** The layouts' own background and border, for the box's surface while its edge travels. */
  surface?: string;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const back = React.useRef<HTMLDivElement>(null);
  const face = React.useRef<HTMLDivElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const shield = React.useRef<HTMLDivElement>(null);
  const taken = React.useRef<Taken | null>(null);
  const change = React.useRef<Change | null>(null);
  /** What a change that has arrived still has to take off the page: a step a frame, after the
   *  frame it arrives in. None of it shows (the old layout is faded out, the fades are at full
   *  strength), but each step restyles what it touches, and all of it in the arrival frame made
   *  that one a long frame. */
  const tail = React.useRef<{ steps: (() => void)[]; frame: number } | null>(null);
  /** Runs the next step of the tail (`all`: every one left, now). */
  const tidy = (all = true) => {
    const t = tail.current;
    if (!t) return;
    cancelAnimationFrame(t.frame);
    for (const step of t.steps.splice(0, all ? t.steps.length : 1)) step();
    if (t.steps.length) t.frame = requestAnimationFrame(() => tidy(false));
    else tail.current = null;
  };

  /** The change has arrived: everything is where it is laid out, and the rest comes off after. */
  const finish = () => {
    const c = change.current;
    if (!c) return;
    change.current = null;
    for (const m of c.movers) m.el.style.transform = '';
    if (box.current) box.current.style.width = '';
    if (c.live) c.live.style.borderColor = '';
    if (inner.current) inner.current.style.clipPath = '';
    if (back.current) back.current.style.display = '';
    if (shield.current) shield.current.style.display = '';
    tidy();
    const steps: (() => void)[] = [
      () => { c.ghost?.remove(); },
      () => { for (const m of c.movers) m.el.style.transition = ''; },
    ];
    for (let i = 0; i < c.faders.length; i += UNFADE) {
      const some = c.faders.slice(i, i + UNFADE);
      steps.push(() => { for (const el of some) { el.style.opacity = ''; el.style.transition = ''; } });
    }
    tail.current = { steps, frame: requestAnimationFrame(() => tidy(false)) };
  };

  /** Everything at the point where the edge is `w` wide. */
  const draw = (w: number) => {
    const c = change.current;
    if (!c) return;
    const span = c.to - c.from;
    const p = Math.abs(span) < 0.5 ? 1 : clamp01((w - c.from) / span);
    const q = 1 - p;
    c.p = p;
    if (face.current) face.current.style.transform = `translateX(${(w - c.wide).toFixed(2)}px)`;
    // A new layout wider than the edge is cut to it. A narrower one is not cut: what travels into
    // it from the old one's far side starts outside it.
    if (inner.current) inner.current.style.clipPath = c.to - w > 0.5 ? `inset(0 ${(c.to - w).toFixed(2)}px 0 0)` : '';
    if (c.ghost) {
      c.ghost.style.opacity = (c.left * q).toFixed(3);
      c.ghost.style.clipPath = c.ghostWidth - w > 0.5 ? `inset(0 ${(c.ghostWidth - w).toFixed(2)}px 0 0)` : '';
    }
    for (const m of c.movers) m.el.style.transform = q <= 0.001 ? '' : `translate(${(m.dx * q).toFixed(2)}px, ${(m.dy * q).toFixed(2)}px) scale(${(1 + (m.sx - 1) * q).toFixed(4)}, ${(1 + (m.sy - 1) * q).toFixed(4)})`;
    // Never quite 1 on the way: at 1 each would stop being a layer of its own, mid-move.
    const seen = Math.min(0.999, c.shown + (1 - c.shown) * p).toFixed(3);
    if (seen !== c.seen) { c.seen = seen; for (const el of c.faders) el.style.opacity = seen; }
    // The box is as wide as the edge: what is beside it takes the rest, and resizes with it.
    if (box.current) box.current.style.width = `${w.toFixed(2)}px`;
    if (!edge.moving && !edge.held && Math.abs(w - c.to) < 0.01) finish();
  };
  const edge = useSpring(0, draw, EDGE);
  // Reduced motion: the new layout fades in where it is.
  const appear = useSpring(1, (o) => { if (inner.current) inner.current.style.opacity = o >= 0.999 ? '' : o.toFixed(3); }, SPRINGS.settle);
  React.useEffect(() => () => { finish(); tidy(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Just before the change: the old layout is what is on the page. */
  const take = () => {
    const el = inner.current;
    if (!el) return;
    const c = change.current;
    const width = el.offsetWidth;
    taken.current = {
      old: el.firstElementChild as HTMLElement | null,
      width,
      drawn: c && edge.moving ? edge.value : width,
      at: new Map(shared(el).map((n) => [n.dataset.flip!, centre(n.getBoundingClientRect())])),
      shown: c ? c.shown + (1 - c.shown) * c.p : 1,
      left: c ? c.left * (1 - c.p) : 0,
    };
  };

  React.useLayoutEffect(() => {
    const was = taken.current;
    taken.current = null;
    const el = inner.current, b = box.current;
    if (!was || !el || !b) return;
    // What the change before this one left on the page goes: this one starts from what was taken.
    finish();
    tidy();
    const to = el.offsetWidth;
    // Out of the layout (a phone's hidden sidebar) there is nothing to play.
    if (!to || !was.width) return;
    if (reducedMotion()) {
      edge.stop();
      appear.jump(0.35);
      appear.to(1, { gesture: true });
      return;
    }
    // Everything is read first, in one layout (the one this change costs); then written.
    const live = el.firstElementChild as HTMLElement | null;
    const movers: Mover[] = [];
    for (const n of shared(el)) {
      const from = was.at.get(n.dataset.flip!);
      const now = centre(n.getBoundingClientRect());
      if (from && now.w && now.h) movers.push({ el: n, dx: from.x - now.x, dy: from.y - now.y, sx: from.w / now.w, sy: from.h / now.h });
    }
    const faders = fadersOf(el, was.at);
    const riders = ridersOf(b);
    const wide = Math.max(was.drawn, was.width, to);

    // The old layout stays on the page, over the new one, until it has faded: React is done with
    // it. What it shares with the new one is not drawn in it: that is the travelling thing.
    let ghost: HTMLElement | null = null;
    if (was.old && !was.old.isConnected) {
      ghost = was.old;
      ghost.removeAttribute('data-slot');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      const g = ghost.style;
      g.position = 'absolute'; g.left = '0'; g.top = '0'; g.pointerEvents = 'none'; g.background = 'transparent'; g.borderColor = 'transparent';
      for (const n of shared(ghost)) n.style.visibility = 'hidden';
      b.append(ghost);
    }
    if (live) live.style.borderColor = 'transparent';
    if (back.current) { back.current.style.width = `${wide}px`; back.current.style.display = 'block'; }
    // What is beside the box is not the pointer's on the way: things passing under a resting
    // pointer would each light up (a hover, a tooltip) as they went by. A shield over it takes the
    // pointer: pointer-events on it is inherited, and would restyle every element of the page.
    if (shield.current && riders.length) shield.current.style.display = 'block';
    // The spring alone moves and fades them: a CSS transition of their own (a button's) would run
    // after every frame's value.
    for (const f of faders) f.style.transition = 'none';
    for (const m of movers) m.el.style.transition = 'none';
    change.current = { from: was.drawn, to, wide, movers, faders, riders, ghost, ghostWidth: was.width, live, shown: was.left, left: ghost ? was.shown : 0, p: 0, seen: '' };
    // From where the edge is drawn, at the speed it has.
    if (!edge.moving) edge.jump(was.drawn);
    draw(edge.value);
    edge.to(to);
  }, [flip]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Before on={flip} take={take}>
      <div ref={box} data-slot="spring-width" className="relative h-full shrink-0">
        <div ref={back} aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden overflow-hidden">
          <div ref={face} className={cn('absolute inset-0', surface)} />
        </div>
        <div ref={inner} className="relative h-full w-max">{children}</div>
        <div ref={shield} aria-hidden className="absolute inset-y-0 left-full z-10 hidden w-screen" />
      </div>
    </Before>
  );
}
