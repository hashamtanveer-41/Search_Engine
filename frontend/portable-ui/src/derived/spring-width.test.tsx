// SpringWidth (spring-width.tsx): the change between its two layouts is played from one read of
// the old layout (just before React changes the page) and one of the new (right after), on one
// spring, with transform, clip-path and opacity only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { SpringWidth } from './spring-width';

/** rAF driven by hand: each frame runs what was asked for before it, and a cancel takes off the one it names. */
let now = 0;
let asked = 0;
let queued: { id: number; fn: FrameRequestCallback }[] = [];
const frames = (n: number) => act(() => { for (let i = 0; i < n; i++) { now += 16; const run = queued; queued = []; run.forEach((f) => f.fn(now)); } });

/** Where things are, by their data-at ("x,y,w,h"); a layout's width by its data-w. */
const place = () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const [x, y, w, h] = ((this as HTMLElement).dataset.at ?? '0,0,0,0').split(',').map(Number);
    return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON() {} } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.querySelector<HTMLElement>('[data-w]')?.dataset.w ?? 0);
  });
};

let reduced = false;
beforeEach(() => {
  now = 0;
  queued = [];
  reduced = false;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { queued.push({ id: ++asked, fn }); return asked; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queued = queued.filter((f) => f.id !== id); });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const Full = () => (
  <aside data-w="272" data-slot="sidebar">
    <i data-flip="search" data-at="20,100,16,16" />
    <span id="label">Search</span>
    <div id="row"><i data-flip="home" data-at="20,140,16,16" /><b id="home-label">Home</b></div>
    <i data-flip="toggle" data-at="240,600,16,16" />
  </aside>
);
const Rail = () => (
  <aside data-w="64" data-slot="sidebar">
    <i data-flip="search" data-at="12,60,24,24" />
    <i data-flip="home" data-at="20,96,24,24" />
    <em id="badge">3</em>
    <i data-flip="toggle" data-at="20,560,24,24" />
  </aside>
);
/** The sidebar in its slot, and what is beside it. */
const Frame = ({ collapsed }: { collapsed: boolean }) => (
  <div>
    <div data-sidebar-slot><SpringWidth flip={collapsed}>{collapsed ? <Rail /> : <Full />}</SpringWidth></div>
    <main id="beside" />
  </div>
);
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const live = () => q('[data-slot=sidebar]');
const ghost = () => document.querySelector<HTMLElement>('[data-slot=spring-width] > aside[aria-hidden]');
const surface = () => q('[data-slot=spring-width] > [aria-hidden]:first-child');
const shiftX = (el: HTMLElement) => Number(/translateX?\((-?[\d.]+)px/.exec(el.style.transform)?.[1] ?? 0);

describe('SpringWidth', () => {
  it('reads nothing of the page when it renders or re-renders the same layout', () => {
    place();
    const width = vi.mocked(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!.get!);
    const rect = vi.mocked(Element.prototype.getBoundingClientRect);
    const { rerender } = render(<Frame collapsed={false} />);
    for (let i = 0; i < 5; i++) rerender(<Frame collapsed={false} />);
    expect(width).not.toHaveBeenCalled();
    expect(rect).not.toHaveBeenCalled();
    expect(queued).toHaveLength(0);
  });

  it('collapsing: the new layout is on the page at its own width at once; the box is as wide as the edge, so what is beside it resizes with it', () => {
    place();
    const { rerender } = render(<Frame collapsed={false} />);
    rerender(<Frame collapsed={true} />);
    const box = q('[data-slot=spring-width]');
    expect(live().dataset.w).toBe('64');
    // The edge starts where it was: the box that wide, what is beside it the rest.
    expect(parseFloat(box.style.width)).toBe(272);
    frames(3);
    expect(parseFloat(box.style.width)).toBeLessThan(272);
    expect(parseFloat(box.style.width)).toBeGreaterThan(64);
    // Nothing is written on what is beside it: it is laid out by the box's width alone.
    expect(q('#beside').style.width).toBe('');
    expect(q('#beside').style.transform).toBe('');
    frames(120);
    expect(box.style.width).toBe('');
  });

  it('collapsing: the edge, what is beside the box and what the layouts share all start where they were and arrive together', () => {
    place();
    const { rerender } = render(<Frame collapsed={false} />);
    rerender(<Frame collapsed={true} />);
    const beside = q('#beside'), icon = q('aside:not([aria-hidden]) [data-flip="search"]'), toggle = q('aside:not([aria-hidden]) [data-flip="toggle"]');
    // The edge is drawn 272 wide still: the box that wide, what is beside it after it.
    const box = q('[data-slot=spring-width]');
    expect(parseFloat(box.style.width)).toBe(272);
    expect(beside.style.transform).toBe('');
    expect(surface().style.display).toBe('block');
    // Its old centre (28,108) from its new one (24,72): 4 right, 36 down; 16/24 of its size.
    expect(icon.style.transform).toBe('translate(4.00px, 36.00px) scale(0.6667, 0.6667)');
    // From the far side of the old layout: it starts outside the rail, so the rail is not cut.
    expect(toggle.style.transform).toMatch(/^translate\(216\.00px, 36\.00px\)/);
    expect(q('[data-slot=spring-width] > .relative').style.clipPath).toBe('');
    frames(4);
    // Mid-way they have all gone the same share of the way.
    const p = (272 - parseFloat(box.style.width)) / 208;
    expect(p).toBeGreaterThan(0.05);
    expect(p).toBeLessThan(0.95);
    expect(shiftX(icon)).toBeCloseTo(4 * (1 - p), 1);
    expect(shiftX(surface().firstElementChild as HTMLElement)).toBeCloseTo(-208 * p, 1);
    frames(120);
    expect(box.style.width).toBe('');
    expect(beside.style.transform).toBe('');
    expect(beside.style.willChange).toBe('');
    expect(icon.style.transform).toBe('');
    expect(toggle.style.transform).toBe('');
    expect(surface().style.display).toBe('');
  });

  it('what is beside the box takes no pointer on the way (a shield over it does), and nothing is written on it', () => {
    place();
    const { rerender } = render(<Frame collapsed={false} />);
    const shield = q('[data-slot=spring-width] > .left-full');
    expect(shield.style.display).toBe('');
    rerender(<Frame collapsed={true} />);
    expect(shield.style.display).toBe('block');
    // pointer-events is inherited: set on what rides, it would restyle every element of the page.
    expect(q('#beside').style.pointerEvents).toBe('');
    expect(q('#beside').style.transform).toBe('');
    frames(120);
    expect(shield.style.display).toBe('');
  });

  it('collapsing: the old layout stays on the page over the new one, fades out and goes; what it shares is not drawn twice', () => {
    place();
    const { rerender } = render(<Frame collapsed={false} />);
    const old = live();
    rerender(<Frame collapsed={true} />);
    expect(ghost()).toBe(old);
    expect(old.inert).toBe(true);
    expect(old.hasAttribute('data-slot')).toBe(false);
    expect(old.querySelector<HTMLElement>('[data-flip="search"]')!.style.visibility).toBe('hidden');
    expect(Number(old.style.opacity)).toBe(1);
    // What only the rail has fades in.
    expect(Number(q('#badge').style.opacity)).toBe(0);
    frames(4);
    expect(Number(old.style.opacity)).toBeLessThan(1);
    expect(Number(q('#badge').style.opacity)).toBeGreaterThan(0);
    // The old layout is cut to the edge as it comes in.
    expect(old.style.clipPath).toMatch(/^inset\(0 \d/);
    frames(120);
    expect(ghost()).toBeNull();
    expect(q('#badge').style.opacity).toBe('');
  });

  it('expanding: the full layout is cut to the edge, its labels fade in, and a box that holds something shared does not fade (the shared thing would)', () => {
    place();
    const { rerender } = render(<Frame collapsed={true} />);
    rerender(<Frame collapsed={false} />);
    const inner = q('[data-slot=spring-width] > .relative');
    // 272 wide, the edge at 64: 208 cut off.
    expect(inner.style.clipPath).toBe('inset(0 208.00px 0 0)');
    expect(parseFloat(q('[data-slot=spring-width]').style.width)).toBe(64);
    expect(Number(q('#label').style.opacity)).toBe(0);
    expect(Number(q('#home-label').style.opacity)).toBe(0);
    expect(q('#row').style.opacity).toBe('');
    frames(120);
    expect(inner.style.clipPath).toBe('');
    expect(q('#label').style.opacity).toBe('');
    expect(live().style.borderColor).toBe('');
  });

  it('turned round mid-way, everything goes back from where it is drawn', () => {
    place();
    const { rerender } = render(<Frame collapsed={false} />);
    rerender(<Frame collapsed={true} />);
    frames(4);
    const edge = () => parseFloat(q('[data-slot=spring-width]').style.width);
    const at = edge();
    expect(at).toBeLessThan(272);
    const fading = Number(ghost()!.style.opacity);
    rerender(<Frame collapsed={false} />);
    // The edge is where it was drawn: the box as wide as it was.
    expect(edge()).toBeCloseTo(at, 1);
    // The full layout's labels start at what was left of them, not from nothing.
    expect(Number(q('#label').style.opacity)).toBeCloseTo(fading, 2);
    frames(1);
    // Still moving the way it was going at first: no jump back.
    expect(edge()).toBeLessThan(at);
    frames(160);
    expect(q('[data-slot=spring-width]').style.width).toBe('');
    expect(q('#beside').style.transform).toBe('');
    expect(ghost()).toBeNull();
    expect(document.querySelectorAll('aside').length).toBe(1);
  });

  it('with reduced motion nothing travels: the new layout is there at once and fades in', () => {
    reduced = true;
    place();
    const { rerender } = render(<Frame collapsed={false} />);
    rerender(<Frame collapsed={true} />);
    expect(q('#beside').style.transform).toBe('');
    expect(ghost()).toBeNull();
    expect(q('[data-flip="search"]').style.transform).toBe('');
    const inner = q('[data-slot=spring-width] > .relative');
    expect(Number(inner.style.opacity)).toBeLessThan(1);
    frames(120);
    expect(inner.style.opacity).toBe('');
  });

  it('out of the layout (a phone\'s hidden sidebar: no width) it plays nothing', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(0);
    const { rerender } = render(<Frame collapsed={false} />);
    rerender(<Frame collapsed={true} />);
    expect(q('#beside').style.transform).toBe('');
    expect(ghost()).toBeNull();
    expect(queued).toHaveLength(0);
  });
});
