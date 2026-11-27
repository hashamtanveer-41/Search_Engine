import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foldContent, foldLook, foldTitle, PaneMotion, type Fold, type MotionTarget } from './motion';
import type { Rect } from './geometry';

const el = () => document.createElement('div');
const at = (e: HTMLElement, kind: MotionTarget['kind'], rect: Rect): MotionTarget => ({ el: e, kind, rect });
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
/** How far a transform moves its element along x (0 when it has none). */
const shiftX = (e: HTMLElement) => Number(/translate\((-?[\d.]+)px/.exec(e.style.transform)?.[1] ?? 0);
/** Where an element is drawn along x: where it is laid out, plus its transform. */
const drawnX = (e: HTMLElement) => parseFloat(e.style.left) + shiftX(e);
/** How much a clip-path cuts off its element's right side. */
const cutRight = (e: HTMLElement) => Number(/inset\(0(?:px)? (-?[\d.]+)px/.exec(e.style.clipPath)?.[1] ?? 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('pane motion', () => {
  it('a page laid out at its new place is drawn from the old one by transform, and is plain again at rest soon after (about 150 ms to the eye)', () => {
    const m = new PaneMotion();
    const page = el();
    m.update(new Map([['body:a', at(page, 'page', r(0, 0, 400, 300))]]), { animate: true });
    m.update(new Map([['body:a', at(page, 'page', r(500, 0, 600, 300))]]), { animate: true });
    expect(page.style.transform).toBe('translate(-500.00px, 0.00px)');
    // Growing: cut to the size it was drawn at.
    expect(page.style.clipPath).toBe('inset(0 200.00px 0.00px 0)');
    // Within a few pixels at 150 ms; at rest by 250.
    vi.advanceTimersByTime(150);
    expect(Math.abs(shiftX(page))).toBeLessThan(25);
    vi.advanceTimersByTime(100);
    expect(page.style.transform).toBe('');
    expect(page.style.clipPath).toBe('');
    expect(m.moving).toBe(false);
  });

  it('a box keeps its layout on the way: laid out at the larger size, moved and cut to what is drawn, its far end kept at the drawn edge; a shrinking page is not cut', () => {
    const m = new PaneMotion();
    const card = el();
    const buttons = el();
    buttons.setAttribute('data-motion-end', 'x');
    card.append(buttons);
    const page = el();
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 600, 300))], ['body:a', at(page, 'page', r(0, 30, 600, 270))]]), { animate: true });
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 300, 300))], ['body:a', at(page, 'page', r(0, 30, 300, 270))]]), { animate: true });
    // Shrinking: it stays laid out at 600 wide all the way; the page is at its final 300 at once.
    expect(card.style.width).toBe('600px');
    expect(page.style.width).toBe('300px');
    expect(page.style.clipPath).toBe('');
    vi.advanceTimersByTime(48);
    expect(card.style.width).toBe('600px');
    const cut = cutRight(card);
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThan(300);
    // Its buttons sit at the drawn right edge, not the laid-out one.
    expect(shiftX(buttons)).toBeCloseTo(-cut, 1);
    vi.advanceTimersByTime(300);
    expect(card.style.width).toBe('300px');
    expect(card.style.clipPath).toBe('');
    expect(card.style.transform).toBe('');
    expect(buttons.style.transform).toBe('');
  });

  it('a line (a divider, the frame) is laid out where it ends and stretched from where it was', () => {
    const m = new PaneMotion();
    const line = el();
    m.update(new Map([['gap:s:0', at(line, 'line', r(500, 0, 1, 600))]]), { animate: true });
    m.update(new Map([['gap:s:0', at(line, 'line', r(200, 0, 1, 300))]]), { animate: true });
    expect(line.style.left).toBe('200px');
    expect(line.style.height).toBe('300px');
    expect(line.style.transform).toBe('translate(300.00px, 0.00px) scale(1.0000, 2.0000)');
    vi.advanceTimersByTime(400);
    expect(line.style.transform).toBe('');
  });

  it('the dropped pane (snap) is at its place at once, raised while the rest settles', () => {
    const moving: boolean[] = [];
    const m = new PaneMotion((b) => moving.push(b));
    const dropped = el();
    const other = el();
    m.update(new Map([['card:d', at(dropped, 'box', r(500, 0, 500, 600))], ['card:o', at(other, 'box', r(0, 0, 500, 600))]]), { animate: true });
    m.update(new Map([['card:d', at(dropped, 'box', r(0, 0, 500, 600))], ['card:o', at(other, 'box', r(500, 0, 500, 600))]]), { animate: true, snap: new Set(['card:d']) });
    expect(dropped.style.left).toBe('0px');
    expect(dropped.style.transform).toBe('');
    expect(dropped.style.zIndex).toBe('3');
    // The other is laid out where it goes and drawn where it was.
    expect(drawnX(other)).toBe(0);
    expect(moving).toEqual([true]);
    vi.advanceTimersByTime(400);
    expect(other.style.left).toBe('500px');
    expect(other.style.transform).toBe('');
    expect(dropped.style.zIndex).toBe('');
    expect(moving).toEqual([true, false]);
  });

  it('a change mid-way goes on from where things are drawn', () => {
    const m = new PaneMotion();
    const card = el();
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 100, 100))]]), { animate: true });
    m.update(new Map([['card:s', at(card, 'box', r(400, 0, 100, 100))]]), { animate: true });
    vi.advanceTimersByTime(48);
    const mid = drawnX(card);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(400);
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 100, 100))]]), { animate: true });
    expect(drawnX(card)).toBeCloseTo(mid, 0);
    vi.advanceTimersByTime(400);
    expect(card.style.left).toBe('0px');
    expect(card.style.transform).toBe('');
  });

  it('a render that changes nothing leaves a move alone, whatever it was for; animate off puts things at their place', () => {
    const m = new PaneMotion();
    const card = el();
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 100, 100))]]), { animate: true });
    m.update(new Map([['card:s', at(card, 'box', r(400, 0, 100, 100))]]), { animate: true });
    vi.advanceTimersByTime(32);
    const mid = card.style.transform;
    m.update(new Map([['card:s', at(card, 'box', r(400, 0, 100, 100))]]), { animate: true });
    expect(card.style.transform).toBe(mid);
    m.update(new Map([['card:s', at(card, 'box', r(400, 0, 100, 100))]]), { animate: false });
    expect(card.style.transform).toBe(mid);
    expect(m.moving).toBe(true);
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 100, 100))]]), { animate: false });
    expect(card.style.left).toBe('0px');
    expect(card.style.transform).toBe('');
    expect(m.moving).toBe(false);
  });

  it('with reduced motion nothing travels: what moved is at its place and fades in', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const m = new PaneMotion();
    const page = el();
    m.update(new Map([['body:a', at(page, 'page', r(0, 0, 400, 300))]]), { animate: true });
    m.update(new Map([['body:a', at(page, 'page', r(500, 0, 400, 300))]]), { animate: true });
    expect(page.style.transform).toBe('');
    expect(page.style.left).toBe('500px');
    expect(Number(page.style.opacity)).toBeLessThan(1);
    vi.advanceTimersByTime(400);
    expect(page.style.opacity).toBe('');
  });
});

describe('pane motion: a gesture holds the spring', () => {
  it('held, everything is drawn at the share of the way the gesture gives; let go, it goes on from there', () => {
    const rests: string[] = [];
    const m = new PaneMotion();
    const card = el();
    m.update(new Map([['card:s', at(card, 'box', r(0, 0, 100, 100))]]), { animate: true });
    m.update(new Map([['card:s', at(card, 'box', r(400, 0, 100, 100))]]), { animate: true, hold: 0 });
    expect(m.held).toBe(true);
    expect(drawnX(card)).toBe(0);
    m.hold(0.25);
    expect(drawnX(card)).toBe(100);
    // Nothing moves on its own while it is held, however long.
    vi.advanceTimersByTime(500);
    expect(drawnX(card)).toBe(100);
    // Held at the end, it has not arrived: it is still the gesture's.
    m.hold(1);
    expect(m.moving).toBe(true);
    m.hold(0.5);
    m.onRest(() => rests.push('rest'));
    m.release(0);
    expect(m.held).toBe(false);
    vi.advanceTimersByTime(32);
    expect(drawnX(card)).toBeGreaterThan(200);
    vi.advanceTimersByTime(400);
    expect(card.style.left).toBe('400px');
    expect(card.style.transform).toBe('');
    expect(rests).toEqual(['rest']);
  });

  it('a page is laid out at the larger of its two sizes while held (nothing re-wraps under the pointer), and takes its final size once, on letting go', () => {
    const m = new PaneMotion();
    const page = el();
    const widths: string[] = [];
    m.update(new Map([['body:a', at(page, 'page', r(0, 0, 900, 300))]]), { animate: true });
    m.update(new Map([['body:a', at(page, 'page', r(500, 0, 400, 300))]]), { animate: true, hold: 0 });
    for (const p of [0.1, 0.4, 0.8, 0.3]) { m.hold(p); widths.push(page.style.width); }
    expect(new Set(widths)).toEqual(new Set(['900px']));
    // Drawn where the pointer has it: moved, and cut to what is drawn of it.
    expect(drawnX(page)).toBe(150);
    expect(cutRight(page)).toBe(150);
    m.release(0);
    expect(page.style.width).toBe('400px');
    expect(drawnX(page)).toBe(150);
    vi.advanceTimersByTime(400);
    expect(page.style.left).toBe('500px');
    expect(page.style.transform).toBe('');
  });

  it('let go at speed, it starts at that speed', () => {
    const slow = new PaneMotion(), fast = new PaneMotion();
    const a = el(), b = el();
    for (const [m, e] of [[slow, a], [fast, b]] as const) {
      m.update(new Map([['card:s', at(e, 'box', r(0, 0, 100, 100))]]), { animate: true });
      m.update(new Map([['card:s', at(e, 'box', r(400, 0, 100, 100))]]), { animate: true, hold: 0.2 });
    }
    slow.release(0);
    fast.release(6);
    vi.advanceTimersByTime(32);
    expect(drawnX(b)).toBeGreaterThan(drawnX(a) + 5);
  });
});

describe('pane motion: a group folds into its strip, and grows back out of it', () => {
  const group = r(0, 0, 500, 600), stripRect = r(0, 0, 36, 600);
  const open = r(0, 0, 500, 600), body = r(0, 36, 500, 564);
  /** A layer for what leaves the page, a card and its page (open), and the strip. */
  const scene = () => {
    const layer = el(), card = el(), page = el(), strip = el(), next = el();
    document.body.append(layer, card, page, next);
    const m = new PaneMotion();
    m.layer = layer;
    const opened = new Map([['card:a', at(card, 'box', open)], ['body:p', at(page, 'page', body)], ['card:b', at(next, 'box', r(501, 0, 499, 600))]]);
    const folded = new Map([['strip:n', at(strip, 'box', stripRect)], ['card:b', at(next, 'box', r(37, 0, 963, 600))]]);
    const fold = (to: 0 | 1): Fold => ({ id: 'n', to, group, strip: stripRect, stripKey: 'strip:n', stripEl: strip, parts: [{ key: 'card:a', pageKey: 'body:p', card, page, open, body }] });
    return { m, layer, card, page, strip, next, opened, folded, fold };
  };
  afterEach(() => { document.body.innerHTML = ''; });

  it('the look changes over the last stretch before strip size: a group at its smallest size all the way, a wide one only when it gets close', () => {
    // 91 px from its strip: the whole way is the stretch.
    const small = { group: r(0, 0, 127, 600), strip: stripRect };
    expect(foldLook(small, 0)).toBe(0);
    expect(foldLook(small, 0.5)).toBeCloseTo(0.5);
    expect(foldLook(small, 1)).toBe(1);
    // 464 px from its strip: plain until it is within 128 px.
    const wide = { group, strip: stripRect };
    expect(foldLook(wide, 0.5)).toBe(0);
    expect(foldLook(wide, 1 - 64 / 464)).toBeCloseTo(0.5);
    expect(foldLook(wide, 1)).toBe(1);
    // Its own content is gone before the strip's title is all there; the title comes last.
    expect(foldContent(0)).toBe(1);
    expect(foldContent(0.8)).toBe(0);
    expect(foldTitle(0.5)).toBe(0);
    expect(foldTitle(1)).toBeCloseTo(1);
  });

  it('folding: the card and page keep their layout, are cut to the shrinking box and fade; the strip fades in at the end; what left the page is drawn until it has gone', () => {
    const { m, layer, card, page, strip, next, opened, folded, fold } = scene();
    m.update(opened, { animate: true });
    // React has taken the card off the page and put the strip on it.
    card.remove();
    document.body.append(strip);
    m.update(folded, { animate: true, folds: [fold(1)] });
    // The card is back on the page, under the cards, with the strip's colour behind it.
    expect(card.parentElement).toBe(layer);
    expect(card.getAttribute('aria-hidden')).toBe('true');
    const fill = layer.querySelector<HTMLElement>('.pane-fold-fill')!;
    expect(fill).toBeTruthy();
    expect(layer.firstElementChild).toBe(fill);
    // The page no longer shows in the layout: it is shown while it goes.
    expect(page.style.visibility).toBe('visible');
    expect(Number(strip.style.opacity)).toBe(0);
    vi.advanceTimersByTime(64);
    // Laid out as they were, cut to the box, fading.
    expect(card.style.width).toBe('500px');
    expect(page.style.width).toBe('500px');
    expect(cutRight(card)).toBeGreaterThan(100);
    expect(cutRight(page)).toBeCloseTo(cutRight(card), 1);
    expect(fill.style.transform).toMatch(/scale\(0\.\d+, 1\.0000\)/);
    // The neighbour is laid out where it ends, drawn at the fold's edge: no gap, no overlap.
    expect(next.style.left).toBe('37px');
    expect(drawnX(next)).toBeCloseTo(500 - cutRight(card) + 1, 0);
    vi.advanceTimersByTime(400);
    expect(layer.children.length).toBe(0);
    expect(strip.style.opacity).toBe('');
    expect(page.style.visibility).toBe('');
    expect(page.style.opacity).toBe('');
    expect(page.style.clipPath).toBe('');
    expect(m.moving).toBe(false);
  });

  it('opening is the same drawing the other way: the strip stays on the page while its title fades, the group grows out of it', () => {
    const { m, layer, card, page, strip, opened, folded, fold } = scene();
    card.remove();
    document.body.append(strip);
    m.update(folded, { animate: true });
    // React has put the card back and taken the strip off.
    strip.remove();
    document.body.append(card);
    m.update(opened, { animate: true, folds: [fold(0)] });
    expect(strip.parentElement).toBe(layer);
    expect(strip.hasAttribute('data-strip')).toBe(false);
    // It starts as the strip: cut to it, its own content unseen.
    expect(cutRight(card)).toBe(464);
    expect(Number(card.style.opacity)).toBe(0);
    expect(Number(strip.style.opacity)).toBe(1);
    vi.advanceTimersByTime(400);
    expect(layer.children.length).toBe(0);
    expect(card.style.clipPath).toBe('');
    expect(card.style.opacity).toBe('');
    expect(page.style.opacity).toBe('');
  });

  it('turned round mid-way, it goes back from where it is', () => {
    const { m, card, strip, opened, folded, fold } = scene();
    m.update(opened, { animate: true });
    card.remove();
    document.body.append(strip);
    m.update(folded, { animate: true, folds: [fold(1)] });
    vi.advanceTimersByTime(48);
    const cut = cutRight(card);
    expect(cut).toBeGreaterThan(0);
    // Opened again before it arrived.
    strip.remove();
    document.body.append(card);
    m.update(opened, { animate: true, folds: [fold(0)] });
    expect(cutRight(card)).toBeCloseTo(cut, 0);
    vi.advanceTimersByTime(400);
    expect(card.style.clipPath).toBe('');
    expect(m.moving).toBe(false);
  });

  it('held by a gesture it follows it, and a fold the gesture took to its end is not played again when the layout says the same', () => {
    const { m, card, page, strip, opened, folded, fold } = scene();
    m.update(opened, { animate: true });
    // The pull begins: the strip it becomes is on the page; the card and page still are.
    document.body.append(strip);
    m.update(folded, { animate: true, folds: [fold(1)], hold: 0 });
    m.hold(0.5);
    expect(cutRight(card)).toBe(232);
    expect(cutRight(page)).toBe(232);
    m.release(0);
    vi.advanceTimersByTime(400);
    expect(m.moving).toBe(false);
    // React now renders the folded layout: nothing travels.
    card.remove();
    m.update(folded, { animate: true, folds: [fold(1)] });
    expect(m.moving).toBe(false);
    expect(strip.style.opacity).toBe('');
  });

  it('with reduced motion nothing travels: the strip is there at once and fades in', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { m, layer, card, strip, opened, folded, fold } = scene();
    m.update(opened, { animate: true });
    card.remove();
    document.body.append(strip);
    m.update(folded, { animate: true, folds: [fold(1)] });
    expect(m.moving).toBe(false);
    expect(layer.children.length).toBe(0);
    expect(Number(strip.style.opacity)).toBeLessThan(1);
    vi.advanceTimersByTime(400);
    expect(strip.style.opacity).toBe('');
  });
});
