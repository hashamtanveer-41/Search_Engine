// How the panes move when the layout changes ("buttery" pane moves, then folding).
//
// Nothing lays out on the way. Everything is laid out once, the moment the layout changes; this
// then draws it, frame by frame, from where it was on screen to there, with transform, clip-path
// and opacity only:
// - a page is laid out at its final rect, rides there by translate, and is cut to what is drawn of
//   it while that is smaller, so its text never re-wraps mid-motion;
// - a box with something in it (a group's card: its tab bar and background; a strip) is laid out at
//   the larger of where it was and where it goes, rides by translate and is cut to what is drawn.
//   What sits at its far end (`data-motion-end`: the card's buttons) stays at the drawn edge. It
//   takes its final size on arriving, when that is the smaller one;
// - a line (a divider, the active-pane frame) is laid out at its final rect and stretched there.
//
// A group folding into its strip keeps its layout: its card and page are cut to the shrinking box
// and, over the last stretch before strip size, fade by how far it has gone, over the strip's
// colour; the strip's title fades in at the end of it. Growing back out of the strip is the same
// drawing run the other way.
//
// Everything rides one spring (critically damped, about 150 ms to the eye), so two edges that met
// before and after meet all the way. A change mid-way starts from where everything is drawn, with
// the spring's speed. A gesture can hold the spring (`hold`): a fold then follows the pointer, and
// on `release` goes on from where it is at the pointer's speed. While it is held a page is laid out
// at the larger of its two sizes (nothing re-wraps under the pointer, no empty band); let go, it
// takes its final size, once. A key in `snap` is not animated: the dropped pane is at its new place
// at once (it was previewed there), raised over the rest until they settle. With reduced motion
// nothing travels: what moved fades in where it is.
//
// A divider drag draws the layout itself, outside React (`place`); the next update starts from
// there, or puts React's rects back if the drag was cancelled.
import { reducedMotion, Spring, type SpringConfig } from '../../lib/motion';
import type { Rect } from './geometry';

/** About 150 ms to settle, without overshoot (ω ≈ 44/s, critically damped). */
export const PANE_SPRING: SpringConfig = { stiffness: 1940, damping: 88 };

/** `page` and `box` keep their layout on the way (moved and cut); a `line` is stretched. */
export type MotionKind = 'box' | 'page' | 'line';
export type MotionTarget = { el: HTMLElement; kind: MotionKind; rect: Rect };

/** One group of a folding node: its card and the page showing in it, where they are when open. */
export interface FoldPart {
  /** The card's key among the targets, and its page's. */
  key: string;
  pageKey?: string;
  card?: HTMLElement | null;
  page?: HTMLElement | null;
  /** The card's rect, open, and the page's. */
  open: Rect;
  body?: Rect;
}

/** A node folding into its strip (`to` 1) or growing back out of it (`to` 0). */
export interface Fold {
  id: string;
  to: 0 | 1;
  /** The node's rect when open, and its strip's. */
  group: Rect;
  strip: Rect;
  /** The strip's key among the targets, and the strip itself: on the page, or just taken off it. */
  stripKey: string;
  stripEl?: HTMLElement | null;
  parts: FoldPart[];
}

const same = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A folding group changes its look (its own content fading, the strip's title coming) over the
 *  last stretch before strip size, this long at most: a wide group is plain until it is this
 *  close, a group at its smallest size changes all the way (it is closer than this already). */
export const FOLD_LOOK_PX = 128;
/** How far the look has gone at fold `f`: 0 the group's own, 1 the strip's. */
export function foldLook(fold: Pick<Fold, 'group' | 'strip'>, f: number) {
  const span = Math.max(fold.group.w - fold.strip.w, fold.group.h - fold.strip.h, 1);
  return clamp01(1 - ((1 - f) * span) / Math.min(span, FOLD_LOOK_PX));
}
/** How much of the group's own content shows at look `k`, and of the strip it becomes. */
export const foldContent = (k: number) => clamp01(1 - k * 1.4);
export const foldTitle = (k: number) => clamp01((k - 0.55) / 0.45);

interface End { el: HTMLElement; axis: 'x' | 'y' }
interface Track { el: HTMLElement; kind: MotionKind; from: Rect; to: Rect; /** How it is laid out on the way. */ lay: Rect; ends: End[] }
interface Folding { fold: Fold; f0: number; f: number; fill: HTMLElement | null; ghosts: HTMLElement[] }

/** Lays an element out at a rect. Writes only what differs: a write of the same value is no layout. */
function lay(el: HTMLElement, r: Rect) {
  const s = el.style;
  const left = `${r.x}px`, top = `${r.y}px`, width = `${r.w}px`, height = `${r.h}px`;
  if (s.left !== left) s.left = left;
  if (s.top !== top) s.top = top;
  if (s.width !== width) s.width = width;
  if (s.height !== height) s.height = height;
}

/** Takes off an element what a move drew on it. */
function plain(el: HTMLElement, ends: End[] = []) {
  const s = el.style;
  s.transform = ''; s.transformOrigin = ''; s.clipPath = ''; s.willChange = '';
  for (const e of ends) e.el.style.transform = '';
}

/** An element at a rect, at rest: laid out there, nothing drawn on it. */
function rest(el: HTMLElement, r: Rect, ends?: End[]) {
  lay(el, r);
  plain(el, ends);
}

const larger = (from: Rect, to: Rect): Rect => ({ x: to.x, y: to.y, w: Math.max(from.w, to.w), h: Math.max(from.h, to.h) });
const cut = (w: number, h: number) => (w > 0.5 || h > 0.5 ? `inset(0 ${Math.max(0, w).toFixed(2)}px ${Math.max(0, h).toFixed(2)}px 0)` : '');
const shift = (x: number, y: number) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

/** Draws a track's element at `r`: laid out at `t.lay`, moved there and cut (or stretched) to it. */
function drawAt(t: Track, r: Rect) {
  const s = t.el.style, at = t.lay;
  s.willChange = 'transform';
  if (t.kind === 'line') {
    s.transformOrigin = '0 0';
    s.transform = `${shift(r.x - at.x, r.y - at.y)} scale(${(r.w / (at.w || 1)).toFixed(4)}, ${(r.h / (at.h || 1)).toFixed(4)})`;
    return;
  }
  s.transform = shift(r.x - at.x, r.y - at.y);
  const cutW = at.w - r.w, cutH = at.h - r.h;
  s.clipPath = cut(cutW, cutH);
  for (const e of t.ends) {
    const by = e.axis === 'x' ? cutW : cutH;
    e.el.style.transform = by > 0.5 ? (e.axis === 'x' ? shift(-by, 0) : shift(0, -by)) : '';
  }
}

const endsOf = (el: HTMLElement, kind: MotionKind): End[] =>
  kind === 'box' ? [...el.querySelectorAll<HTMLElement>('[data-motion-end]')].map((e) => ({ el: e, axis: e.dataset.motionEnd === 'y' ? 'y' : 'x' })) : [];

export class PaneMotion {
  /** Where each element is drawn now (what a change mid-way starts from). */
  private drawn = new Map<string, Rect>();
  private tracks = new Map<string, Track>();
  private folds = new Map<string, Folding>();
  private raised: HTMLElement[] = [];
  private fading: HTMLElement[] = [];
  private rests: (() => void)[] = [];
  private holding = false;
  private progress: Spring;
  private fade: Spring;
  /** An element of the area, under its cards: what has left the page (a folded group's card, an
   *  opened strip) is drawn there while it goes, over the colour of the strip. */
  layer: HTMLElement | null = null;

  /** `onMoving` is told when things start and stop travelling. */
  constructor(private onMoving: (moving: boolean) => void = () => undefined, config: SpringConfig = PANE_SPRING) {
    this.progress = new Spring(1, (p) => this.draw(p), config);
    this.fade = new Spring(1, (o) => { for (const el of this.fading) el.style.opacity = o >= 0.999 ? '' : o.toFixed(3); }, config);
  }

  /** Is anything travelling (or held on its way by a gesture). */
  get moving() { return this.tracks.size > 0 || this.folds.size > 0; }
  /** A gesture has the spring. */
  get held() { return this.holding; }

  /**
   * After a render: `els` are the elements on screen by key, each with the rect React gave it. Those
   * drawn somewhere else go from there, unless `animate` is off (a window resize, a divider drag),
   * in which case they are put at their place at once. `snap`: keys that are at their place at once
   * anyway (the dropped pane), raised over the rest while it settles. `folds`: the nodes that fold
   * into their strip or grow out of it with this change. `hold`: a gesture has the spring, at this
   * much of the way (see `hold` and `release`). `velocity`: how fast it is going at the start, in
   * shares of the way a second (a gesture let go).
   */
  update(els: Map<string, MotionTarget>, { animate, snap, folds, hold, velocity }: {
    animate: boolean; snap?: ReadonlySet<string>; folds?: readonly Fold[]; hold?: number; velocity?: number;
  }) {
    const travel = animate && !reducedMotion();
    const wasMoving = this.moving;
    const next = new Map<string, Track>();
    const folding = new Map<string, Folding>();
    const faded: HTMLElement[] = [];
    let fresh = false;

    // Folds first: whether one is already drawn is told from what was drawn before this change.
    for (const fold of folds ?? []) {
      const cur = this.folds.get(fold.id);
      // Drawn there already (a gesture took it all the way, and React now says the same).
      if (!cur && this.drawn.has(fold.stripKey) === (fold.to === 1)) continue;
      if (!travel) {
        if (cur) this.endFold(cur);
        // Reduced motion: what came on fades in where it is.
        if (animate) for (const el of fold.to === 1 ? [fold.stripEl] : fold.parts.flatMap((p) => [p.card, p.page])) if (el?.isConnected) faded.push(el);
        continue;
      }
      const g: Folding = { fold, f0: cur ? cur.f : 1 - fold.to, f: cur ? cur.f : 1 - fold.to, fill: cur?.fill ?? null, ghosts: [] };
      if (cur) this.endFold({ ...cur, fill: null }, new Set([fold.stripEl, ...fold.parts.flatMap((p) => [p.card, p.page])]));
      // What has left the page is drawn while it goes.
      for (const el of [fold.stripEl, ...fold.parts.map((p) => p.card)]) {
        if (!el || el.isConnected || !this.layer) continue;
        el.removeAttribute('data-motion');
        el.removeAttribute('data-strip');
        el.setAttribute('aria-hidden', 'true');
        el.inert = true;
        el.style.pointerEvents = 'none';
        this.layer.append(el);
        g.ghosts.push(el);
      }
      if (!g.fill && this.layer) {
        g.fill = document.createElement('div');
        g.fill.className = 'pane-fold-fill';
        g.fill.style.willChange = 'transform';
        this.layer.prepend(g.fill);
      }
      if (g.fill) lay(g.fill, fold.group);
      // Kept as they are laid out when open; a page that no longer shows is shown while it goes.
      for (const part of fold.parts) {
        if (part.card) lay(part.card, part.open);
        if (part.page && part.body) {
          lay(part.page, part.body);
          const s = part.page.style;
          s.visibility = 'visible'; s.contentVisibility = 'visible';
          if (fold.to === 1) s.pointerEvents = 'none';
        }
      }
      folding.set(fold.id, g);
      fresh = true;
    }
    // A fold on its way (or held on it) goes on while what it draws is still what the layout has,
    // whatever this render was for.
    for (const [id, cur] of this.folds) {
      if (folding.has(id) || (folds ?? []).some((f) => f.id === id)) continue;
      const { fold } = cur;
      const strip = els.get(fold.stripKey);
      const still = fold.to === 1
        ? !!strip && same(strip.rect, fold.strip)
        : fold.parts.every((p) => { const t = els.get(p.key); return !!t && t.el === p.card && same(t.rect, p.open); });
      if (still) folding.set(id, cur);
      else this.endFold(cur);
    }
    const folded = new Set<string>();
    for (const g of folding.values()) for (const p of g.fold.parts) { folded.add(p.key); if (p.pageKey) folded.add(p.pageKey); }

    for (const [key, { el, kind, rect }] of els) {
      // A fold draws it.
      if (folded.has(key)) continue;
      const cur = this.tracks.get(key);
      // Still on its way to the same place: it carries on.
      if (cur && cur.el === el && same(cur.to, rect)) { next.set(key, cur); continue; }
      const was = this.drawn.get(key);
      if (!was || same(was, rect)) { if (cur) rest(el, rect, cur.ends); continue; }
      if (!animate || snap?.has(key)) { rest(el, rect, cur?.ends); continue; }
      if (!travel) { rest(el, rect, cur?.ends); faded.push(el); continue; }
      next.set(key, { el, kind, from: was, to: rect, lay: rect, ends: cur && cur.el === el ? cur.ends : endsOf(el, kind) });
      fresh = true;
    }
    for (const [key, t] of this.tracks) if (!next.has(key) && els.get(key)?.el === t.el && !folded.has(key)) rest(t.el, els.get(key)!.rect, t.ends);
    for (const key of [...this.drawn.keys()]) if (!els.has(key)) this.drawn.delete(key);
    for (const [key, { rect }] of els) if (!next.has(key)) this.drawn.set(key, rect);
    this.tracks = next;
    this.folds = folding;

    if (fresh) {
      // One spring for all: what was already on its way starts again from where it is drawn, with
      // the speed it had (in progress a second: a new move covers its own distance).
      const speed = velocity ?? (this.progress.moving ? Math.max(0, this.progress.velocity) : 0);
      this.holding = hold !== undefined;
      for (const [key, t] of next) {
        t.from = this.drawn.get(key) ?? t.from;
        t.lay = t.kind === 'box' || (t.kind === 'page' && this.holding) ? larger(t.from, t.to) : t.to;
        lay(t.el, t.lay);
      }
      for (const g of folding.values()) g.f0 = g.f;
      this.lower();
      for (const key of snap ?? []) { const el = els.get(key)?.el; if (el) { el.style.zIndex = '3'; this.raised.push(el); } }
      if (hold !== undefined) this.progress.set(hold);
      else {
        this.progress.set(0);
        this.progress.to(1, { velocity: speed });
      }
    } else if (!this.moving) {
      this.progress.stop();
      this.holding = false;
      this.lower();
      if (wasMoving) this.rested();
    }
    if (wasMoving !== this.moving) this.onMoving(this.moving);

    if (faded.length) {
      this.fading = faded;
      this.fade.jump(0.35);
      this.fade.to(1, { gesture: true });
    }
  }

  /** A gesture moved: everything is drawn at this much of the way. */
  hold(progress: number) {
    if (this.holding) this.progress.set(progress);
  }

  /** The gesture let go: on to the end from where it is, at `velocity` (shares of the way a second).
   *  A page laid out larger than it ends takes its final size now, once. */
  release(velocity = 0) {
    if (!this.holding) return;
    this.holding = false;
    for (const t of this.tracks.values()) if (t.kind === 'page' && !same(t.lay, t.to)) { t.lay = t.to; lay(t.el, t.to); }
    this.draw(this.progress.value);
    this.progress.to(1, { velocity, gesture: true });
  }

  /** Everything is at its end now (a gesture took it all the way and goes on to something else). */
  finish() {
    if (!this.moving) return;
    this.holding = false;
    this.progress.jump(1);
  }

  /** Calls `fn` once everything has next come to rest (at once, when nothing is moving). */
  onRest(fn: () => void) {
    if (this.moving) this.rests.push(fn);
    else fn();
  }

  /** Draws an element at a rect now, outside React (a divider drag), and remembers it there. */
  place(key: string, el: HTMLElement, rect: Rect) {
    const t = this.tracks.get(key);
    if (t) {
      this.tracks.delete(key);
      if (!this.moving) { this.progress.stop(); this.holding = false; this.lower(); this.onMoving(false); this.rested(); }
    }
    this.drawn.set(key, rect);
    rest(el, rect, t?.ends);
  }

  stop() {
    this.progress.stop();
    this.fade.stop();
    const wasMoving = this.moving;
    for (const t of this.tracks.values()) rest(t.el, t.to, t.ends);
    for (const g of this.folds.values()) this.endFold(g);
    this.tracks.clear();
    this.folds.clear();
    this.holding = false;
    this.rests = [];
    this.lower();
    if (wasMoving) this.onMoving(false);
  }

  private rested() { const fns = this.rests; this.rests = []; fns.forEach((fn) => fn()); }

  private draw(p: number) {
    if (!this.moving) return;
    const done = !this.holding && p >= 0.999;
    for (const [key, t] of this.tracks) {
      const r = done ? t.to : mix(t.from, t.to, p);
      this.drawn.set(key, r);
      if (done) rest(t.el, t.to, t.ends);
      else drawAt(t, r);
    }
    for (const g of this.folds.values()) {
      g.f = done ? g.fold.to : clamp01(lerp(g.f0, g.fold.to, p));
      if (!done) { this.drawFold(g); continue; }
      // Arrived: an opened group is where the layout has it.
      for (const part of g.fold.parts) {
        if (g.fold.to === 1) continue;
        this.drawn.set(part.key, part.open);
        if (part.pageKey && part.body) this.drawn.set(part.pageKey, part.body);
      }
      this.endFold(g);
    }
    // The dropped pane's shadow fades as the rest arrives.
    for (const el of this.raised) el.style.boxShadow = done ? '' : `0 10px 28px rgba(0, 0, 0, ${(0.18 * (1 - clamp01(p))).toFixed(3)})`;
    if (done) {
      this.tracks.clear();
      this.folds.clear();
      this.lower();
      this.onMoving(false);
      this.rested();
    }
  }

  /** A folding group at `g.f` of the way into its strip (see the top of the file). */
  private drawFold(g: Folding) {
    const { fold, f } = g;
    const look = foldLook(fold, f);
    // Never quite 1 on the way: at 1 a page would stop being a layer of its own, and start being
    // one again a frame later, each a restyle of everything in it.
    const seen = Math.min(0.999, foldContent(look)).toFixed(3);
    for (const part of fold.parts) {
      const r = mix(part.open, fold.strip, f);
      const move = shift(r.x - part.open.x, r.y - part.open.y);
      this.drawn.set(part.key, r);
      if (part.card) {
        const s = part.card.style;
        s.willChange = 'transform, opacity';
        s.transform = move;
        s.clipPath = cut(part.open.w - r.w, part.open.h - r.h);
        s.opacity = seen;
      }
      if (part.page && part.body) {
        if (part.pageKey) this.drawn.set(part.pageKey, { x: r.x, y: r.y + (part.body.y - part.open.y), w: r.w, h: Math.max(0, r.h - (part.body.y - part.open.y)) });
        const s = part.page.style;
        s.willChange = 'transform, opacity';
        s.transform = move;
        // Under its card's head, as far as the card is drawn.
        s.clipPath = cut(part.body.w - r.w, part.body.h - Math.max(0, r.h - (part.body.y - part.open.y)));
        s.opacity = seen;
      }
    }
    if (g.fill) {
      const r = mix(fold.group, fold.strip, f);
      g.fill.style.transformOrigin = '0 0';
      g.fill.style.transform = `${shift(r.x - fold.group.x, r.y - fold.group.y)} scale(${(r.w / (fold.group.w || 1)).toFixed(4)}, ${(r.h / (fold.group.h || 1)).toFixed(4)})`;
    }
    if (fold.stripEl) fold.stripEl.style.opacity = foldTitle(look).toFixed(3);
  }

  /** A fold is over (arrived, or another took its place): its elements are plain again, and what
   *  it kept on the page goes, but for `keep` (what the fold after it draws on). */
  private endFold(g: Folding, keep?: ReadonlySet<HTMLElement | null | undefined>) {
    const { fold } = g;
    for (const el of [fold.stripEl, ...fold.parts.flatMap((p) => [p.card, p.page])]) {
      if (!el || keep?.has(el)) continue;
      plain(el);
      const s = el.style;
      s.opacity = ''; s.visibility = ''; s.contentVisibility = '';
      if (!g.ghosts.includes(el)) s.pointerEvents = '';
    }
    for (const el of g.ghosts) if (!keep?.has(el)) el.remove();
    g.fill?.remove();
  }

  private lower() {
    for (const el of this.raised) { el.style.zIndex = ''; el.style.boxShadow = ''; }
    this.raised = [];
  }
}
