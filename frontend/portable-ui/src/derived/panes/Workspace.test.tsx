import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, useCallback, useRef, useState } from 'react';
import { PHONE_QUERY, RESIZE_QUIET_MS, Workspace, phonePairs, type Bring, type Cover } from './Workspace';
import type { BringPage } from './zones';
import { emptyLayout, openPane, stacks, type Layout } from './model';
import { usePaneLayout, type Apply } from './store';

// A ResizeObserver the test drives: `resizeTo` reports a new size for the area.
let observed: { cb: ResizeObserverCallback; el: Element } | null = null;
class DrivenObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) { observed = { cb: this.cb, el }; }
  unobserve() {}
  disconnect() {}
}
const resizeTo = (width: number, height: number) =>
  act(() => observed!.cb([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver));

function twoSideBySide(): Layout {
  let l = openPane(emptyLayout(), 'a', 'A').layout;
  return openPane(l, 'b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
}

function Harness({ onPage }: { onPage?(): void } = {}) {
  const [layout, setLayout] = useState(twoSideBySide);
  const ref = useRef(layout);
  ref.current = layout;
  const apply = useCallback<Apply>((op) => { const r = op(ref.current); ref.current = r.layout; setLayout(r.layout); return r.layout; }, []);
  return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => { onPage?.(); return <p>{p.title}</p>; }} />;
}

const area = () => document.querySelector<HTMLElement>('.pane-area')!;
const transformed = () => [...document.querySelectorAll<HTMLElement>('[data-pane-body]')].filter((b) => b.style.transform);
/** The page of the left (`a`) or right (`b`) pane as first laid out. */
const ids: Record<string, string> = {};
const bodyOf = (which: string) => document.querySelector<HTMLElement>(`[data-pane-body="${ids[which]}"]`)!;
/** Names the two pages by where they start: left `a`, right `b`. */
const nameSides = () => {
  const bodies = [...document.querySelectorAll<HTMLElement>('[data-pane-body]')].sort((x, y) => parseFloat(x.style.left) - parseFloat(y.style.left));
  ids.a = bodies[0].dataset.paneBody!;
  ids.b = bodies[1].dataset.paneBody!;
};
/** Springs on frames of the fake clock, so a test can run one to rest. */
const frames = () => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
};

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView ??= () => undefined;
  // jsdom has no PointerEvent: without one, fired pointer events carry no clientX or pointerId.
  if (typeof PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
    });
  }
  vi.stubGlobal('ResizeObserver', DrivenObserver);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); observed = null; });

describe('Workspace: how the panes move', () => {
  beforeEach(frames);
  function Keyed() {
    const [layout, apply, history] = usePaneLayout('motion', { persist: false, initial: twoSideBySide });
    return <Workspace layout={layout} apply={apply} history={history} label="Notes" render={(p) => <p>{p.title}</p>} />;
  }

  it('a window resize: everything follows it at once, nothing travels', () => {
    render(<Harness />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    nameSides();
    const first = bodyOf('a');
    const before = first.style.width;
    resizeTo(800, 600);
    expect(first.style.width).not.toBe(before);
    expect(transformed()).toHaveLength(0);
    expect(area().dataset.moving).toBeUndefined();
    act(() => { vi.advanceTimersByTime(RESIZE_QUIET_MS + 1); });
    expect(transformed()).toHaveLength(0);
  });

  it('a layout change lays every page out once at its new size, and they ride there by transform on one short spring', () => {
    render(<Keyed />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const a = document.querySelector<HTMLElement>('[data-pane-body][data-active]')!;
    const was = a.style.width;
    fireEvent.keyDown(window, { key: '\\', code: 'Backslash', altKey: true });
    // The page is at its new size already; it is drawn where it was, moved and clipped.
    act(() => { vi.advanceTimersByTime(16); });
    expect(a.style.width).not.toBe(was);
    expect(area().dataset.moving).toBeDefined();
    // Drawn where it was by transform, not re-laid out on the way.
    expect(transformed()).toContain(a);
    // No CSS slide: the cards are moved by the spring, not a transition.
    expect(getComputedStyle(document.querySelector('.pane-card')!).transitionProperty).not.toMatch(/left|width/);
    act(() => { vi.advanceTimersByTime(400); });
    expect(area().dataset.moving).toBeUndefined();
    expect(transformed()).toHaveLength(0);
  });

  it('a divider drag draws the layout itself: pages follow live, never dimmed, and React renders nothing per move', () => {
    // A page is drawn again only when the workspace renders with new places for it.
    let commits = 0;
    render(<Profiler id="ws" onRender={() => undefined}><Harness onPage={() => { commits++; }} /></Profiler>);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    nameSides();
    const divider = document.querySelector<HTMLElement>('[data-divider]')!;
    divider.setPointerCapture = () => undefined;
    divider.releasePointerCapture = () => undefined;

    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 2 });
    const body = bodyOf('a');
    const before = body.style.width;
    fireEvent.pointerMove(window, { clientX: 490, pointerId: 2, buttons: 1 });
    expect(area().dataset.resizing).toBeDefined();
    const started = commits;
    for (const x of [470, 450, 430, 420]) fireEvent.pointerMove(window, { clientX: x, pointerId: 2, buttons: 1 });
    expect(commits).toBe(started);
    expect(body.style.width).not.toBe(before);
    expect(document.querySelectorAll('[data-pane-body][data-dim]').length).toBe(0);
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toMatch(/%.*%/);

    fireEvent.pointerUp(window, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(area().dataset.resizing).toBeUndefined();
    expect(document.querySelector('[data-testid="split-label"]')).toBeNull();
    expect(body.style.width).toBe(`${parseFloat(body.style.width)}px`);
    expect(transformed()).toHaveLength(0);
  });

  it('losing the window mid-drag puts the divider back, and the panes go back from where they were drawn', () => {
    render(<Harness />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const divider = document.querySelector<HTMLElement>('[data-divider]')!;
    divider.setPointerCapture = () => undefined;
    divider.releasePointerCapture = () => undefined;
    const before = divider.getAttribute('aria-valuenow');
    nameSides();
    const width = bodyOf('a').style.width;
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: 400, pointerId: 3, buttons: 1 });
    expect(bodyOf('a').style.width).not.toBe(width);
    fireEvent.blur(window);
    act(() => { vi.advanceTimersByTime(400); });
    expect(bodyOf('a').style.width).toBe(width);
    expect(document.querySelector('[data-divider]')!.getAttribute('aria-valuenow')).toBe(before);
  });

  it('a dropped tab is at its new place at once, pulses, and takes focus; the other pane settles around it', () => {
    render(<Harness />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    nameSides();
    const tab = document.querySelector<HTMLElement>(`#tab-${ids.b}`)!;
    // Hold the right-hand tab and take it to the window's left edge.
    fireEvent.pointerDown(tab, { button: 0, clientX: 560, clientY: 15, pointerId: 7, pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerMove(window, { clientX: 540, clientY: 40, pointerId: 7, pointerType: 'mouse', buttons: 1 });
    act(() => { vi.advanceTimersByTime(32); });
    expect(area().dataset.held).toBeDefined();
    // Held: nothing is drawn over the panes, the pages are not dimmed.
    expect(document.querySelectorAll('.zone-hint, .drop-preview')).toHaveLength(0);
    expect(document.querySelectorAll('[data-pane-body][data-dim]')).toHaveLength(0);
    fireEvent.pointerMove(window, { clientX: 3, clientY: 300, pointerId: 7, pointerType: 'mouse', buttons: 1 });
    act(() => { vi.advanceTimersByTime(32); });
    // Over the left edge: only the box where it would land.
    expect(document.querySelectorAll('.drop-preview')).toHaveLength(1);
    expect(document.querySelectorAll('.zone-hint')).toHaveLength(0);
    fireEvent.pointerUp(window, { clientX: 3, clientY: 300, pointerId: 7, pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(16); });
    const b = bodyOf('b');
    expect(parseFloat(b.style.left)).toBeLessThan(10);
    expect(b.style.transform).toBe('');
    expect(document.activeElement).toBe(b);
    expect(document.querySelector('.pane-glow')).toBeTruthy();
    // The pane it left goes over to the right on the spring.
    expect(transformed().map((x) => x.dataset.paneBody)).toEqual([ids.a]);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(transformed()).toHaveLength(0);
    expect(document.querySelector('.pane-glow')).toBeNull();
  });

  it('a divider has a tooltip at the pointer instead of a native title, gone on press', () => {
    render(<Harness />);
    resizeTo(1000, 600);
    const divider = document.querySelector<HTMLElement>('[data-divider]')!;
    divider.setPointerCapture = () => undefined;
    divider.releasePointerCapture = () => undefined;
    expect(divider.getAttribute('title')).toBeNull();
    fireEvent.pointerEnter(divider, { pointerType: 'mouse', clientX: 500, clientY: 300 });
    expect(document.querySelector('.pane-tip-anchor')).toBeTruthy();
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 4 });
    expect(document.querySelector('.pane-tip-anchor')).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 4 });
  });
});

describe('Workspace: folding and zoom', () => {
  beforeEach(frames);
  const ready = () => {
    render(<Harness />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(20); });
    const divider = document.querySelector<HTMLElement>('[data-divider]')!;
    divider.setPointerCapture = () => undefined;
    divider.releasePointerCapture = () => undefined;
    return divider;
  };

  it('a divider pulled past the smallest size folds that side into a strip; a click opens it', () => {
    const divider = ready();
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 5 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 5, buttons: 1 });
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toBe('Let go to collapse A');
    // Past the smallest size the side goes on with the pointer: its page fades, the strip it becomes shows.
    expect(document.querySelector('[data-fold-preview]')).toBeTruthy();
    fireEvent.pointerUp(window, { pointerId: 5 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('[data-fold-preview]')).toBeNull();
    const strip = document.querySelector<HTMLElement>('[data-strip]')!;
    expect(strip.getAttribute('aria-label')).toBe('Collapsed: A');
    expect(document.querySelectorAll('.pane-card').length).toBe(1);
    fireEvent.click(strip);
    expect(document.querySelector('[data-strip]')).toBeNull();
    expect(document.querySelectorAll('.pane-card').length).toBe(2);
    act(() => { vi.advanceTimersByTime(400); });
  });

  it('pulled past the smallest size and let go short of half way, it springs back and does not fold', () => {
    const divider = ready();
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 8 });
    fireEvent.pointerMove(window, { clientX: 300, pointerId: 8, buttons: 1 });
    // 20 px past the smallest size (280 px: MIN_PANE in a 1000 px area)
    fireEvent.pointerMove(window, { clientX: 260, pointerId: 8, buttons: 1 });
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toBe('Collapse A');
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(window, { pointerId: 8 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('[data-strip]')).toBeNull();
    expect(document.querySelectorAll('.pane-card').length).toBe(2);
    expect(document.querySelector('[data-fold-preview]')).toBeNull();
  });

  it('past the smallest size nothing renders or lays out per move: the folding card keeps its size and is cut and faded by how far it is pulled, the page beside it keeps the size it will have', () => {
    let pages = 0;
    render(<Harness onPage={() => { pages++; }} />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(20); });
    nameSides();
    const divider = document.querySelector<HTMLElement>('[data-divider]')!;
    divider.setPointerCapture = () => undefined;
    divider.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 9 });
    // The smallest size is 280 px here (MIN_PANE): 20 px past it, the fold has begun.
    fireEvent.pointerMove(window, { clientX: 260, pointerId: 9, buttons: 1 });
    const card = document.querySelector<HTMLElement>(`.pane-card[data-front="${ids.a}"]`)!;
    const beside = bodyOf('b');
    const cardWidth = card.style.width, besideWidth = beside.style.width;
    // The page beside is laid out as it will be once folded (the strip is 36 px), drawn at the divider.
    expect(parseFloat(besideWidth)).toBeGreaterThan(950);
    expect(beside.style.transform).toMatch(/translate\(22\d/);
    const rendered = pages;
    const cuts: number[] = [], seen: number[] = [];
    // (it fades once less than FOLD_LOOK_PX of it is left: past 128 px)
    for (const x of [250, 200, 120, 80]) {
      fireEvent.pointerMove(window, { clientX: x, pointerId: 9, buttons: 1 });
      expect(card.style.width).toBe(cardWidth);
      expect(beside.style.width).toBe(besideWidth);
      cuts.push(Number(/inset\(0(?:px)? ([\d.]+)px/.exec(card.style.clipPath)![1]));
      seen.push(Number(card.style.opacity));
    }
    expect(pages).toBe(rendered);
    expect(cuts.map(Math.round)).toEqual([30, 80, 160, 200]);
    expect(seen).toEqual([...seen].sort((x, y) => y - x));
    expect(seen[3]).toBeLessThan(seen[0]);
    // The strip it becomes is on the page, not yet one to press.
    expect(document.querySelector('[data-fold-preview]')).toBeTruthy();
    expect(document.querySelector('[data-strip]')).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 9 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('[data-strip]')).toBeTruthy();
    expect(beside.style.transform).toBe('');
    expect(beside.style.width).toBe(besideWidth);
  });

  it('back inside the smallest size while still held, the fold is off: the divider resizes live again', () => {
    const divider = ready();
    nameSides();
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 10 });
    fireEvent.pointerMove(window, { clientX: 90, pointerId: 10, buttons: 1 });
    expect(document.querySelector('[data-fold-preview]')).toBeTruthy();
    fireEvent.pointerMove(window, { clientX: 300, pointerId: 10, buttons: 1 });
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toMatch(/%.*%/);
    const card = document.querySelector<HTMLElement>(`.pane-card[data-front="${ids.a}"]`)!;
    expect(Math.round(parseFloat(card.style.width) / 10)).toBe(30);
    expect(card.style.clipPath).toBe('');
    expect(card.style.opacity).toBe('');
    expect(transformed()).toHaveLength(0);
    fireEvent.pointerUp(window, { pointerId: 10 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('[data-fold-preview]')).toBeNull();
    expect(document.querySelector('[data-strip]')).toBeNull();
  });

  it("a strip's divider pulled away opens it with the pointer: let go far enough it stays open, close to the strip it shuts again", () => {
    const divider = ready();
    nameSides();
    const cards = () => document.querySelectorAll('.pane-area > .pane-card').length;
    const fold = () => {
      fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 11 });
      fireEvent.pointerMove(window, { clientX: 20, pointerId: 11, buttons: 1 });
      fireEvent.pointerUp(window, { pointerId: 11 });
      act(() => { vi.advanceTimersByTime(400); });
    };
    fold();
    expect(cards()).toBe(1);
    // It folded at its smallest size (280 px), so that is the size it opens to: 244 px from the strip.
    // Pulled 30 px away: the layout it opens to is there, the group cut to where the pointer is.
    fireEvent.pointerDown(divider, { button: 0, clientX: 36, pointerId: 12 });
    fireEvent.pointerMove(window, { clientX: 66, pointerId: 12, buttons: 1 });
    expect(cards()).toBe(2);
    expect(document.querySelector('[data-strip]')).toBeNull();
    const card = () => document.querySelector<HTMLElement>(`.pane-area > .pane-card[data-front="${ids.a}"]`)!;
    const cut = () => Number(/inset\(0(?:px)? ([\d.]+)px/.exec(card().style.clipPath)?.[1] ?? 0);
    const at30 = cut();
    expect(Math.round(at30)).toBe(214);
    fireEvent.pointerMove(window, { clientX: 86, pointerId: 12, buttons: 1 });
    expect(cut()).toBeCloseTo(at30 - 20, 0);
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toBe('Expand A');
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(window, { pointerId: 12 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(cards()).toBe(2);
    expect(card().style.clipPath).toBe('');
    expect(Math.round(parseFloat(card().style.width))).toBe(280);
    expect(area().dataset.resizing).toBeUndefined();

    // Pulled on past the size it had, the divider resizes it like any other.
    fold();
    fireEvent.pointerDown(divider, { button: 0, clientX: 36, pointerId: 14 });
    fireEvent.pointerMove(window, { clientX: 76, pointerId: 14, buttons: 1 });
    fireEvent.pointerMove(window, { clientX: 336, pointerId: 14, buttons: 1 });
    expect(card().style.clipPath).toBe('');
    expect(Math.round(parseFloat(card().style.width) / 10)).toBe(34);
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toMatch(/%.*%/);
    fireEvent.pointerUp(window, { pointerId: 14 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(Math.round(parseFloat(card().style.width) / 10)).toBe(34);

    // Pulled 10 px and let go: it shuts again, a strip as it was.
    fold();
    fireEvent.pointerDown(divider, { button: 0, clientX: 36, pointerId: 13 });
    fireEvent.pointerMove(window, { clientX: 46, pointerId: 13, buttons: 1 });
    expect(cards()).toBe(2);
    expect(document.querySelector('[data-testid="split-label"]')?.textContent).toBe('Pull away to expand');
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(window, { pointerId: 13 });
    expect(document.querySelector('[data-strip]')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(400); });
    expect(cards()).toBe(1);
    expect(document.querySelector('.pane-ghosts')!.children.length).toBe(0);
  });

  it('the menu, the keys and a click play the same motion: what left the page is drawn until it has gone, and nothing of it stays', () => {
    ready();
    nameSides();
    const ghosts = () => document.querySelector('.pane-ghosts')!.children.length;
    // B is the active group: Alt+- folds it. Its card has left the layout and is still drawn.
    fireEvent.keyDown(window, { key: '-', code: 'Minus', altKey: true });
    expect(document.querySelectorAll('.pane-area > .pane-card').length).toBe(1);
    expect(document.querySelector('[data-strip]')).toBeTruthy();
    expect(ghosts()).toBe(2);
    expect(bodyOf('b').style.visibility).toBe('visible');
    act(() => { vi.advanceTimersByTime(400); });
    expect(ghosts()).toBe(0);
    expect(bodyOf('b').style.visibility).toBe('');
    // Alt+= opens it: the strip has left the layout and is still drawn.
    fireEvent.keyDown(window, { key: '=', code: 'Equal', altKey: true });
    expect(document.querySelector('[data-strip]')).toBeNull();
    expect(ghosts()).toBe(2);
    expect(document.querySelector<HTMLElement>(`.pane-area > .pane-card[data-front="${ids.b}"]`)!.style.clipPath).not.toBe('');
    act(() => { vi.advanceTimersByTime(400); });
    expect(ghosts()).toBe(0);
    expect(transformed()).toHaveLength(0);
  });

  it('stopping short of the fold distance just resizes to the smallest size', () => {
    const divider = ready();
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 6 });
    fireEvent.pointerMove(window, { clientX: 360, pointerId: 6, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 6 });
    expect(document.querySelector('[data-strip]')).toBeNull();
  });

  it('zoom folds every other group into its strip around the zoomed one, with no dividers; Escape puts the layout back', () => {
    ready();
    fireEvent.click(document.querySelector<HTMLElement>('[aria-label="Zoom A"]')!);
    // (a group folding is drawn in the ghost layer a moment more: the area's own cards count)
    expect(document.querySelectorAll('.pane-area > .pane-card').length).toBe(1);
    expect(document.querySelectorAll('[data-strip]').length).toBe(1);
    expect(document.querySelector('[data-divider]')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelectorAll('.pane-area > .pane-card').length).toBe(2);
    expect(document.querySelector('[data-strip]')).toBeNull();
  });

  it('zoomed, a strip pressed zooms its pane instead', () => {
    ready();
    fireEvent.click(document.querySelector<HTMLElement>('[aria-label="Zoom A"]')!);
    const strip = document.querySelector<HTMLElement>('[data-strip] .pane-strip-open')!;
    expect(strip.getAttribute('aria-label')).toBe('Zoom B');
    fireEvent.click(strip);
    act(() => { vi.advanceTimersByTime(400); });
    // B fills the area now, A is the strip: still zoomed
    expect(document.querySelectorAll('.pane-area > .pane-card').length).toBe(1);
    expect(document.querySelector('.pane-area > .pane-card [role=tab]')?.textContent).toContain('B');
    expect(document.querySelector('[data-strip] .pane-strip-open')?.getAttribute('aria-label')).toBe('Zoom A');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelectorAll('.pane-area > .pane-card').length).toBe(2);
  });

  it('each tab shows its page\'s icon in its pane\'s colour', () => {
    ready();
    expect(document.querySelectorAll('.pane-tab-icon svg')).toHaveLength(2);
    const dots = [...document.querySelectorAll<HTMLElement>('.pane-tab-icon')].map((d) => d.dataset.color);
    expect(dots).toHaveLength(2);
    expect(new Set(dots).size).toBe(2);
  });
});

describe('Workspace: undo and redo', () => {
  function WithHistory() {
    const [layout, apply, history] = usePaneLayout('t', { persist: false, initial: twoSideBySide });
    return <Workspace layout={layout} apply={apply} history={history} label="Notes" render={(p) => <p>{p.title}</p>} />;
  }
  const value = () => document.querySelector('[data-divider]')!.getAttribute('aria-valuenow');

  it('a divider drag is one step; Mod+Z takes it back and Mod+Shift+Z redoes it', () => {
    render(<WithHistory />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(20); });
    const divider = document.querySelector<HTMLElement>('[data-divider]')!;
    divider.setPointerCapture = () => undefined;
    divider.releasePointerCapture = () => undefined;
    const before = value();
    fireEvent.pointerDown(divider, { button: 0, clientX: 500, pointerId: 7 });
    for (const x of [480, 450, 420, 400]) fireEvent.pointerMove(window, { clientX: x, pointerId: 7, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 7 });
    const after = value();
    expect(after).not.toBe(before);
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(value()).toBe(before);
    fireEvent.keyDown(window, { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    expect(value()).toBe(after);
  });

  it('a burst of arrow keys is one step, and an undo mid-burst takes the whole burst back', () => {
    render(<WithHistory />);
    resizeTo(1000, 600);
    const before = value();
    for (let i = 0; i < 4; i++) fireEvent.keyDown(document.querySelector('[data-divider]')!, { key: 'ArrowLeft' });
    expect(value()).not.toBe(before);
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(value()).toBe(before);
  });

  it('stands aside in a text field: Mod+Z there is the field\'s own', () => {
    render(<><input aria-label="note" /><WithHistory /></>);
    resizeTo(1000, 600);
    const before = value();
    fireEvent.keyDown(document.querySelector('[data-divider]')!, { key: 'ArrowLeft' });
    act(() => { vi.advanceTimersByTime(700); });
    fireEvent.keyDown(document.querySelector('input')!, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(value()).not.toBe(before);
  });
});

describe('Workspace: tabs', () => {
  function Tabs({ initial }: { initial(): Layout }) {
    const [layout, apply] = usePaneLayout('tabs', { persist: false, initial });
    return (
      <Workspace layout={layout} apply={apply} label="Notes" detail={(p) => (p.kind === 'b' ? 'Chapter 1' : p.kind === 'c' ? 'Chapter 4' : undefined)}
        render={(p, info) => <textarea aria-label={`notes ${p.title}`} onInput={(e) => info.setDirty(e.currentTarget.value !== '')} />} />
    );
  }
  const tab = (id: string) => document.querySelector<HTMLElement>(`[data-tab="${id}"]`)!;

  it('a preview is italic until it is double-clicked or typed in', () => {
    const withPreview = () => openPane(openPane(emptyLayout(), 'a', 'A').layout, 'b', 'B', undefined, { preview: true }).layout;
    render(<Tabs initial={withPreview} />);
    resizeTo(1000, 600);
    const id = document.querySelector<HTMLElement>('[data-preview]')!.dataset.tab!;
    expect(tab(id).textContent).toContain(', preview');
    fireEvent.doubleClick(tab(id).querySelector('[role=tab]')!);
    expect(tab(id).dataset.preview).toBeUndefined();
  });

  it('two tabs with the same title say where each one is', () => {
    const twoLimits = () => openPane(openPane(emptyLayout(), 'b', 'Limits').layout, 'c', 'Limits').layout;
    render(<Tabs initial={twoLimits} />);
    resizeTo(1000, 600);
    expect([...document.querySelectorAll('.pane-tab-where')].map((e) => e.textContent)).toEqual(['Chapter 1', 'Chapter 4']);
  });

  it('a page with unsaved changes puts a dot in place of its tab\'s ×', () => {
    render(<Tabs initial={() => openPane(emptyLayout(), 'a', 'A').layout} />);
    resizeTo(1000, 600);
    const area = document.querySelector('textarea')!;
    fireEvent.input(area, { target: { value: 'x' } });
    expect(document.querySelector('[data-tab][data-dirty] .pane-tab-dot')).toBeTruthy();
    fireEvent.input(area, { target: { value: '' } });
    expect(document.querySelector('[data-tab][data-dirty]')).toBeNull();
  });
});

describe('Workspace: the keymap', () => {
  beforeEach(frames);
  function Keyed() {
    const [layout, apply, history] = usePaneLayout('keys', { persist: false, initial: twoSideBySide });
    return (
      <Workspace layout={layout} apply={apply} history={history} label="Notes"
        render={(p) => <input aria-label={`field ${p.title}`} />} />
    );
  }
  const cards = () => document.querySelectorAll('.pane-card').length;
  const tabs = () => document.querySelectorAll('[data-tab]').length;

  it('Alt+W closes the active pane and Alt+Shift+T reopens it where it was', () => {
    render(<Keyed />);
    resizeTo(1000, 600);
    expect(tabs()).toBe(2);
    fireEvent.keyDown(window, { key: '∑', code: 'KeyW', altKey: true });
    expect(tabs()).toBe(1);
    fireEvent.keyDown(window, { key: 'T', code: 'KeyT', altKey: true, shiftKey: true });
    expect(tabs()).toBe(2);
    expect(cards()).toBe(2);
  });

  it('Alt+\\ splits the active page beside it; Alt+- folds the active group', () => {
    render(<Keyed />);
    resizeTo(1000, 600);
    fireEvent.keyDown(window, { key: '\\', code: 'Backslash', altKey: true });
    expect(cards()).toBe(3);
    fireEvent.keyDown(window, { key: '-', code: 'Minus', altKey: true });
    // It shrinks into its strip on the spring first.
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('[data-strip]')).toBeTruthy();
    fireEvent.keyDown(window, { key: '=', code: 'Equal', altKey: true });
    expect(document.querySelector('[data-strip]')).toBeNull();
  });

  it('stands aside in a text field: Alt+W there is the field\'s', () => {
    render(<Keyed />);
    resizeTo(1000, 600);
    const field = document.querySelector('input')!;
    fireEvent.keyDown(field, { key: '∑', code: 'KeyW', altKey: true });
    expect(tabs()).toBe(2);
  });

  it('holding Alt draws each key where it goes', () => {
    render(<Keyed />);
    resizeTo(1000, 600);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    expect(document.querySelector('[data-testid="alt-hints"]')).toBeTruthy();
    expect(document.querySelector('[data-target="split-right"]')).toBeTruthy();
    act(() => { fireEvent.keyUp(window, { key: 'Alt' }); });
    expect(document.querySelector('[data-testid="alt-hints"]')).toBeNull();
  });

  it("leaves search and the shortcuts dialog to the app: ? opens nothing here", () => {
    render(<Keyed />);
    resizeTo(1000, 600);
    fireEvent.keyDown(window, { key: '?', code: 'Slash', shiftKey: true });
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
});

describe('Workspace: focus and announcements', () => {
  function Focused() {
    const [layout, apply, history] = usePaneLayout('focus', { persist: false, initial: twoSideBySide });
    return <Workspace layout={layout} apply={apply} history={history} label="Notes" render={(p) => <input aria-label={`field ${p.title}`} />} />;
  }
  const activeTitle = () => document.querySelector('.pane-card[data-active] [role=tab][aria-selected=true]')?.textContent;

  it('a page that focuses itself does not take the active pane', () => {
    render(<Focused />);
    resizeTo(1000, 600);
    expect(activeTitle()).toBe('B');
    act(() => { document.querySelector<HTMLInputElement>('[aria-label="field A"]')!.focus(); });
    expect(activeTitle()).toBe('B');
  });

  it('a press in a pane makes it active, and its focus is then the person\'s', () => {
    render(<Focused />);
    resizeTo(1000, 600);
    const field = document.querySelector<HTMLInputElement>('[aria-label="field A"]')!;
    fireEvent.pointerDown(field);
    act(() => { field.focus(); });
    expect(activeTitle()).toBe('A');
  });

  it('a key that moves between panes says where it went, politely', () => {
    render(<Focused />);
    resizeTo(1000, 600);
    fireEvent.keyDown(window, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    expect(activeTitle()).toBe('A');
    expect(document.querySelector('[data-testid="pane-announce"]')!.textContent).toBe('A, pane 1 of 2');
    // ] is the next one in reading order
    fireEvent.keyDown(window, { key: ']', code: 'BracketRight', altKey: true });
    expect(activeTitle()).toBe('B');
  });
});

describe('Workspace: accessibility', () => {
  it('has no axe violations (tabs, tab panels, dividers, strips, menus)', async () => {
    function Full() {
      const [layout, apply, history] = usePaneLayout('axe', { persist: false, initial: () => {
        const l = twoSideBySide();
        return openPane(l, 'c', 'C', { kind: 'stack', stackId: stacks(l.root)[0].id }).layout;
      } });
      return <main><Workspace layout={layout} apply={apply} history={history} label="Notes" render={(p) => <p>{p.title}</p>} /></main>;
    }
    const { container } = render(<Full />);
    resizeTo(1000, 600);
    vi.useRealTimers();
    // Colour contrast needs layout jsdom does not have; everything else is checked.
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

describe('Workspace: nothing open', () => {
  it('closing the last pane shows the ways back, and Reopen puts it back', () => {
    function One() {
      const [layout, apply] = usePaneLayout('empty', { persist: false, initial: () => openPane(emptyLayout(), 'a', 'A').layout });
      return <Workspace layout={layout} apply={apply} label="Notes" layouts={[{ label: 'Two side by side', make: twoSideBySide }]} render={(p) => <p>{p.title}</p>} />;
    }
    render(<One />);
    resizeTo(1000, 600);
    fireEvent.click(document.querySelector<HTMLElement>('[aria-label="Close A"]')!);
    const empty = document.querySelector('[data-testid="pane-empty"]')!;
    expect(empty.textContent).toContain('No panes are open');
    fireEvent.click([...empty.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Reopen “A”'))!);
    expect(document.querySelectorAll('[data-tab]').length).toBe(1);
    fireEvent.keyDown(window, { key: '∑', code: 'KeyW', altKey: true });
    fireEvent.click([...document.querySelectorAll('[data-testid="pane-empty"] button')].find((b) => b.textContent === 'Two side by side')!);
    expect(document.querySelectorAll('.pane-card').length).toBe(2);
  });
});

describe('Workspace: a page not showing', () => {
  it('keeps its group\'s size and place, so bringing it forward does not grow it from the corner', () => {
    function Tabs() {
      const [layout, apply] = usePaneLayout('rest-tabs', { persist: false, initial: () => {
        const l = openPane(emptyLayout(), 'a', 'A').layout;
        return openPane(l, 'b', 'B').layout; // a second tab in the same group
      } });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Tabs />);
    resizeTo(1000, 600);
    // A, then back to B: A has been shown, and is now the tab behind.
    fireEvent.click(document.querySelector<HTMLElement>('[role=tab][id="tab-a"], [role=tab]')!);
    const tab = (title: string) => [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent?.includes(title))!;
    fireEvent.click(tab('A'));
    fireEvent.click(tab('B'));
    const bodyOf = (title: string) => [...document.querySelectorAll<HTMLElement>('.pane-body')].find((b) => b.textContent === title)!;
    const shown = bodyOf('B');
    const hidden = bodyOf('A');
    expect(shown.dataset.hidden).toBeUndefined();
    expect(hidden.dataset.hidden).toBeDefined();
    expect(hidden.style.width).toBe(shown.style.width);
    expect(hidden.style.height).toBe(shown.style.height);
    expect(hidden.style.left).toBe(shown.style.left);
    expect(hidden.style.top).toBe(shown.style.top);
    expect(hidden.style.width).not.toBe('0px');
  });
});

describe('Workspace: phone', () => {
  // Springs run on animation frames: here, frames of the fake clock, so a test can run one to rest.
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  it('under 700px it is the phone layout: one page and the bar, no panes, strips, dividers or hints', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    function Folded() {
      const [layout, apply] = usePaneLayout('phone', { persist: false, initial: twoSideBySide });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Folded />);
    resizeTo(390, 760);
    expect(document.querySelector('.pane-card')).toBeNull();
    expect(document.querySelector('[data-divider]')).toBeNull();
    expect(document.querySelector('[data-strip]')).toBeNull();
    expect(document.querySelector('.phone-bar')?.textContent).toContain('2 of 2');
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(document.querySelector('[data-testid="alt-hints"]')).toBeNull();
  });

  it('loads the pages either side ahead, hidden at the full page size, so a swipe brings in a page that is ready', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    function Three() {
      const [layout, apply] = usePaneLayout('phone-near', { persist: false, initial: () => {
        let l = openPane(emptyLayout(), 'a', 'A').layout;
        l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
        return openPane(l, 'c', 'C', { kind: 'beside', nodeId: stacks(l.root)[1].id, side: 'right', share: 0.5 }).layout;
      } });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Three />);
    resizeTo(390, 760);
    expect(document.querySelector('.phone-bar')?.textContent).toContain('3 of 3');
    const bodies = [...document.querySelectorAll<HTMLElement>('.pane-body')];
    const b = bodies.find((x) => x.textContent === 'B');
    // B (2 of 3) is next to the page showing: mounted, hidden, already the width of the screen.
    expect(b).toBeTruthy();
    expect(b!.dataset.hidden).toBeDefined();
    expect(b!.style.width).toBe('390px');
  });

  it('a swipe on the bar draws the page beside the one showing, so it comes in with the finger, and drops it once settled', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    function Folded() {
      const [layout, apply] = usePaneLayout('phone-swipe', { persist: false, initial: twoSideBySide });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Folded />);
    resizeTo(390, 760);
    const bar = document.querySelector<HTMLElement>('.phone-bar')!;
    expect(bar.textContent).toContain('2 of 2');
    const peeking = () => document.querySelector<HTMLElement>('[data-peek]');
    expect(peeking()).toBeNull();
    // Finger down on the bar and moving right: the previous page is drawn to the left of this one.
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 700, pointerId: 7 });
    act(() => { window.dispatchEvent(new PointerEvent('pointermove', { clientX: 140, clientY: 700, pointerId: 7 })); });
    expect(peeking()?.dataset.peek).toBe('prev');
    expect(peeking()?.dataset.hidden).toBeUndefined();
    expect(peeking()?.getAttribute('aria-hidden')).toBe('true');
    // Let go short of the way: it springs back, and the page beside is no longer drawn.
    act(() => { window.dispatchEvent(new PointerEvent('pointerup', { clientX: 140, clientY: 700, pointerId: 7 })); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(peeking()).toBeNull();
    expect(bar.textContent).toContain('2 of 2');
  });

  function ThreeOnPhone() {
    const [layout, apply] = usePaneLayout('phone-pair', { persist: false, initial: () => {
      let l = openPane(emptyLayout(), 'a', 'A').layout;
      l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
      return openPane(l, 'c', 'C', { kind: 'beside', nodeId: stacks(l.root)[1].id, side: 'right', share: 0.5 }).layout;
    } });
    return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
  }
  const barSlot = () => document.querySelector<HTMLElement>('.phone-bar [data-title-slot="0"]')!;
  /** C showing, A shown below it, from the sheet. */
  const pairUp = () => {
    render(<ThreeOnPhone />);
    resizeTo(390, 760);
    expect(barSlot().textContent).toContain('3 of 3');
    fireEvent.click(document.querySelector('.phone-bar')!);
    fireEvent.click(screen.getByRole('button', { name: 'Show A below' }));
    act(() => { vi.advanceTimersByTime(600); });
  };

  it('a page shown below another is one stop with it, as a split is on a desktop: the bar names both, as they sit, and counts them once', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    pairUp();
    const lines = [...barSlot().querySelectorAll('.phone-bar-pair .phone-bar-title')].map((l) => l.textContent);
    expect(lines).toEqual(['C', 'A']);
    expect(barSlot().textContent).toContain('2 of 2');
    expect(document.querySelector('.phone-bar')!.getAttribute('aria-label')).toBe('C above A, 2 of 2 open. Show open pages');
    // Both are drawn, one above the other, and move together with a swipe.
    const paired = [...document.querySelectorAll<HTMLElement>('.pane-body[data-paired]')].map((b) => b.textContent).sort();
    expect(paired).toEqual(['A', 'C']);
    expect(document.querySelector('.phone-handle')).toBeTruthy();
    // The one in use is the stronger line; using the lower one keeps the two together.
    expect(barSlot().querySelector('[data-in-use]')?.textContent).toBe('C');
    fireEvent.click(document.querySelector('.phone-bar')!);
    fireEvent.click(screen.getAllByRole('button').find((x) => x.classList.contains('phone-card-main') && x.textContent?.startsWith('A'))!);
    act(() => { vi.advanceTimersByTime(600); });
    expect([...document.querySelectorAll('.pane-body[data-paired]')]).toHaveLength(2);
    expect(barSlot().querySelector('[data-in-use]')?.textContent).toBe('A');
  });

  it('on its side, the pair is side by side, the divider upright; pulled to the left edge it closes the left page', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY || q === '(orientation: landscape)', addEventListener() {}, removeEventListener() {} }));
    render(<ThreeOnPhone />);
    resizeTo(760, 300);
    fireEvent.click(document.querySelector('.phone-bar')!);
    expect(screen.queryByRole('button', { name: 'Show A below' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show A beside' }));
    act(() => { vi.advanceTimersByTime(600); });
    const box = (title: string) => [...document.querySelectorAll<HTMLElement>('.pane-body[data-paired]')].find((b) => b.textContent === title)!.style;
    expect(box('C').left).toBe('0px');
    expect(parseFloat(box('A').left)).toBeGreaterThan(300);
    expect(box('A').height).toBe(box('C').height);
    const handle = document.querySelector<HTMLElement>('.phone-handle')!;
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.dataset.sideways).toBe('true');
    handle.setPointerCapture = () => undefined;
    fireEvent.pointerDown(handle, { clientX: 380, clientY: 150, pointerId: 5 });
    fireEvent.pointerMove(handle, { clientX: 20, clientY: 150, pointerId: 5 });
    expect(document.querySelector('.phone-closing-label')?.textContent).toBe('Close C');
    fireEvent.pointerUp(handle, { clientX: 20, clientY: 150, pointerId: 5 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.querySelector('.phone-handle')).toBeNull();
    expect([...document.querySelectorAll('.pane-body')].map((b) => b.textContent)).not.toContain('C');
  });

  it('is a phone where the styles say so: one query, narrow or a short touch screen (on its side a phone got a phone’s top bar over a desktop’s panes)', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles.css'), 'utf8');
    expect(styles).toContain(`@custom-variant phone {\n  @media ${PHONE_QUERY} { @slot; }`);
    expect(PHONE_QUERY).toContain('(max-width: 599px)');
    expect(PHONE_QUERY).toContain('(max-height: 460px) and (pointer: coarse)');
  });

  it('the pairs are the layout’s own top and bottom splits, as wide as each other; side by side is not one', () => {
    const one = openPane(emptyLayout(), 'a', 'A').layout;
    const stacked = openPane(one, 'b', 'B', { kind: 'beside', nodeId: stacks(one.root)[0].id, side: 'bottom', share: 0.4 }).layout;
    expect(phonePairs(stacked).map((p) => [p.top, p.bottom].map((id) => stacked.panes[id].title))).toEqual([['A', 'B']]);
    expect(phonePairs(stacked)[0].share).toBeCloseTo(0.6, 1);
    expect(phonePairs(twoSideBySide())).toEqual([]);
    // Three stacked: the upper two pair, the third is a stop of its own.
    const three = openPane(stacked, 'c', 'C', { kind: 'beside', nodeId: stacks(stacked.root)[1].id, side: 'bottom', share: 0.5 }).layout;
    expect(phonePairs(three).map((p) => [p.top, p.bottom].map((id) => three.panes[id].title))).toEqual([['A', 'B']]);
  });

  it('no bar while a page is drawn over the space (dormant): it is the space’s, not the page’s', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    function Under() {
      const [layout, apply] = usePaneLayout('phone-dormant', { persist: false, initial: twoSideBySide });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} dormant />;
    }
    render(<Under />);
    resizeTo(390, 760);
    expect(document.querySelector('.phone-bar')).toBeNull();
  });

  it('the divider pulled to the bottom closes the lower page, saying so as it gets there; short of it, it only resizes', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    pairUp();
    const handle = document.querySelector<HTMLElement>('.phone-handle')!;
    handle.setPointerCapture = () => undefined;
    // Not far enough: resized, kept within a fifth of either end.
    fireEvent.pointerDown(handle, { clientY: 380, pointerId: 3 });
    fireEvent.pointerMove(handle, { clientY: 560, pointerId: 3 });
    expect(document.querySelector('.phone-closing')).toBeNull();
    fireEvent.pointerUp(handle, { clientY: 560, pointerId: 3 });
    expect(Number(document.querySelector('.phone-handle')!.getAttribute('aria-valuenow'))).toBe(74);
    // To the bottom: the lower page dims, says it closes, and closes on letting go.
    const again = document.querySelector<HTMLElement>('.phone-handle')!;
    again.setPointerCapture = () => undefined;
    fireEvent.pointerDown(again, { clientY: 560, pointerId: 4 });
    fireEvent.pointerMove(again, { clientY: 740, pointerId: 4 });
    expect(document.querySelector('.phone-closing-label')?.textContent).toBe('Close A');
    fireEvent.pointerUp(again, { clientY: 740, pointerId: 4 });
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.querySelector('.phone-handle')).toBeNull();
    expect(barSlot().textContent).toContain('C');
    expect(barSlot().textContent).toContain('2 of 2');
    expect([...document.querySelectorAll('.pane-body')].map((b) => b.textContent)).not.toContain('A');
  });

  it('the bar names this page in the middle and the pages either side beside it, out of sight until a swipe brings them', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} }));
    function Folded() {
      const [layout, apply] = usePaneLayout('phone-titles', { persist: false, initial: twoSideBySide });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Folded />);
    resizeTo(390, 760);
    const slots = [...document.querySelectorAll<HTMLElement>('.phone-bar [data-title-slot]')];
    // The last page: past it, the empty view to open something new from.
    expect(slots.map((s) => s.dataset.titleSlot)).toEqual(['-1', '0', '1']);
    expect(slots[0].getAttribute('aria-hidden')).toBe('true');
    expect(Number(slots[0].style.opacity)).toBe(0);
    expect(Number(slots[1].style.opacity)).toBe(1);
    expect(slots[1].textContent).toContain('2 of 2');
    expect(slots[2].textContent).toContain('Open something here');
    // Each page in its pane's colour, as its tab is.
    expect(slots[1].querySelector('.pane-tab-icon[data-color]')).toBeTruthy();
  });

  it('with reduced motion a swipe fades the next page in where it is, and letting go finishes the fade', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY || q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    function Folded() {
      const [layout, apply] = usePaneLayout('phone-reduced', { persist: false, initial: twoSideBySide });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Folded />);
    resizeTo(390, 760);
    const bar = document.querySelector<HTMLElement>('.phone-bar')!;
    const area = bar.closest<HTMLElement>('.pane-area')!;
    fireEvent.pointerDown(bar, { button: 0, clientX: 40, clientY: 700, pointerId: 9 });
    act(() => { window.dispatchEvent(new PointerEvent('pointermove', { clientX: 235, clientY: 700, pointerId: 9 })); });
    // Half way across it fades through: this page mostly gone, the previous one starting to show,
    // and the same for their titles; nothing has moved.
    const out = Number(area.style.getPropertyValue('--phone-fade-out'));
    const incoming = Number(area.style.getPropertyValue('--phone-fade-prev'));
    expect(out).toBeGreaterThan(0.05);
    expect(out).toBeLessThan(0.3);
    expect(incoming).toBeGreaterThan(0.05);
    expect(incoming).toBeLessThan(0.3);
    const prev = document.querySelector<HTMLElement>('.phone-bar [data-title-slot="-1"]')!;
    expect(prev.style.translate).toBe('0.00px 0');
    expect(Number(prev.style.opacity)).toBeCloseTo(incoming, 2);
    // A fast flick on: it lands on page 1, and the fade runs to its end instead of cutting.
    act(() => { window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 700, pointerId: 9 })); });
    act(() => { window.dispatchEvent(new PointerEvent('pointerup', { clientX: 330, clientY: 700, pointerId: 9 })); });
    expect(document.querySelector('.phone-bar [data-title-slot="0"]')?.textContent).toContain('1 of 2');
    // Page 1 is current now and still part-way in: it finishes fading in rather than cutting.
    const mid = Number(area.style.getPropertyValue('--phone-fade-out'));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(Number(area.style.getPropertyValue('--phone-fade-out'))).toBe(1);
    expect(document.querySelector('[data-peek]')).toBeNull();
  });
});

describe('Workspace: one grid', () => {
  beforeEach(frames);
  /** [A | B] over a wide C over [D | E]: the upright line between A and B and the one between D and
   *  E are one line, in two stretches either side of C. */
  function stretches(): Layout {
    let l = openPane(emptyLayout(), 'a', 'A').layout;
    const g = (title: string) => stacks(l.root).find((s) => l.panes[s.active].title === title)!.id;
    l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: g('A'), side: 'bottom', share: 2 / 3 }).layout;
    l = openPane(l, 'd', 'D', { kind: 'beside', nodeId: g('C'), side: 'bottom', share: 0.5 }).layout;
    l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: g('A'), side: 'right', share: 0.5 }).layout;
    return openPane(l, 'e', 'E', { kind: 'beside', nodeId: g('D'), side: 'right', share: 0.5 }).layout;
  }
  function Grid() {
    const [layout, apply] = usePaneLayout('grid', { persist: false, initial: stretches });
    return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
  }
  const ready = () => {
    render(<Grid />);
    resizeTo(1200, 900);
    act(() => { vi.advanceTimersByTime(20); });
    const dividers = [...document.querySelectorAll<HTMLElement>('[data-divider]')];
    for (const d of dividers) { d.setPointerCapture = () => undefined; d.releasePointerCapture = () => undefined; }
    return dividers;
  };
  const card = (title: string) => [...document.querySelectorAll<HTMLElement>('.pane-area > .pane-card')].find((c) => c.querySelector('[role=tab]')?.textContent?.includes(title))!;
  const width = (title: string) => Math.round(parseFloat(card(title).style.width));

  it('a line in two stretches is one line: hovering either lights both, and dragging either moves both', () => {
    const upright = ready().filter((d) => d.dataset.line?.startsWith('row'));
    expect(upright).toHaveLength(2);
    expect(new Set(upright.map((d) => d.dataset.line)).size).toBe(1);
    fireEvent.pointerEnter(upright[0], { pointerType: 'mouse' });
    expect(upright.every((d) => d.hasAttribute('data-hot'))).toBe(true);
    const [a, d] = [width('A'), width('D')];
    expect(a).toBe(d);
    fireEvent.pointerDown(upright[0], { button: 0, clientX: 600, clientY: 100, pointerId: 21 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 100, pointerId: 21, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 21 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(width('A')).toBe(a - 100);
    expect(width('D')).toBe(d - 100);
  });

  it('with Alt only the stretch pulled moves, and let go near the other it lands on it: one line again', () => {
    const upright = ready().filter((d) => d.dataset.line?.startsWith('row'));
    const top = upright.sort((x, y) => parseFloat(x.style.top) - parseFloat(y.style.top))[0];
    const d = width('D');
    fireEvent.pointerDown(top, { button: 0, clientX: 600, clientY: 100, pointerId: 22, altKey: true });
    fireEvent.pointerMove(window, { clientX: 520, clientY: 100, pointerId: 22, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 22 });
    act(() => { vi.advanceTimersByTime(400); });
    // (a line more takes its 1px gap from the rest: within a pixel)
    expect(Math.abs(width('A') - (d - 80))).toBeLessThanOrEqual(1);
    expect(Math.abs(width('D') - d)).toBeLessThanOrEqual(1);
    const lines = () => new Set([...document.querySelectorAll<HTMLElement>('[data-divider]')].map((x) => x.dataset.line).filter((x) => x?.startsWith('row')));
    expect(lines().size).toBe(2);
    // dragged back to within a few px of the other stretch's line: it snaps onto it
    const again = [...document.querySelectorAll<HTMLElement>('[data-divider]')].find((x) => x.dataset.line?.startsWith('row') && parseFloat(x.style.top) < 100)!;
    again.setPointerCapture = () => undefined;
    again.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(again, { button: 0, clientX: 520, clientY: 100, pointerId: 23 });
    fireEvent.pointerMove(window, { clientX: 595, clientY: 100, pointerId: 23, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 23 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(lines().size).toBe(1);
    expect(width('A')).toBe(width('D'));
  });

  it('a line dragged onto another stays under the pointer with its label, though the line it joins has another name', () => {
    // [A | B] over [C | D], their lines apart (A | B at a quarter, C | D at a half): C | D dragged up onto A | B
    function apart(): Layout {
      let l = openPane(emptyLayout(), 'a', 'A').layout;
      const g = (title: string) => stacks(l.root).find((s) => l.panes[s.active].title === title)!.id;
      l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: g('A'), side: 'bottom', share: 0.5 }).layout;
      l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: g('A'), side: 'right', share: 0.75 }).layout;
      return openPane(l, 'd', 'D', { kind: 'beside', nodeId: g('C'), side: 'right', share: 0.5 }).layout;
    }
    function Apart() {
      const [layout, apply] = usePaneLayout('apart', { persist: false, initial: apart });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Apart />);
    resizeTo(1200, 900);
    act(() => { vi.advanceTimersByTime(20); });
    const upright = () => [...document.querySelectorAll<HTMLElement>('[data-divider]')].filter((d) => d.dataset.line?.startsWith('row'));
    expect(upright()).toHaveLength(2);
    const [top, low] = upright().sort((x, y) => parseFloat(x.style.top) - parseFloat(y.style.top));
    for (const d of [top, low]) { d.setPointerCapture = () => undefined; d.releasePointerCapture = () => undefined; }
    const left = (el: HTMLElement) => parseFloat(el.style.left) + parseFloat(/translate\(([-\d.]+)px/.exec(el.style.transform)?.[1] ?? '0');
    const at = left(top);
    const middle = parseFloat(low.style.top) + parseFloat(low.style.height) / 2;
    fireEvent.pointerDown(low, { button: 0, clientX: 600, clientY: 700, pointerId: 26 });
    fireEvent.pointerMove(window, { clientX: at + 4, clientY: 700, pointerId: 26, buttons: 1 });
    // landed on the upper line: drawn on it, and its label still there, at the middle of the
    // stretch in hand (the lower row), not of the two
    expect(Math.abs(left(low) - at)).toBeLessThanOrEqual(1);
    const label = document.querySelector<HTMLElement>('[data-testid="split-label"]')!;
    expect(label.textContent).toMatch(/%.*%/);
    const labelY = [...label.style.transform.matchAll(/([-\d.]+)px - 50%/g)].map((m) => parseFloat(m[1]))[1];
    expect(Math.abs(labelY - middle)).toBeLessThanOrEqual(1);
    fireEvent.pointerUp(window, { pointerId: 26 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(upright()).toHaveLength(1);
    expect(width('A')).toBe(width('C'));
  });

  it('with Alt held, only the stretch an Alt-drag would move is lit, not the whole line', () => {
    // A over C | D beside B over E: the line across the middle is one line; under A, Alt takes A, C and D
    function wide(): Layout {
      let l = openPane(emptyLayout(), 'a', 'A').layout;
      const g = (title: string) => stacks(l.root).find((s) => l.panes[s.active].title === title)!.id;
      l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: g('A'), side: 'bottom', share: 0.5 }).layout;
      l = openPane(l, 'b', 'B', { kind: 'edge', side: 'right', share: 1 / 3 }).layout;
      l = openPane(l, 'e', 'E', { kind: 'beside', nodeId: g('B'), side: 'bottom', share: 0.5 }).layout;
      return openPane(l, 'd', 'D', { kind: 'beside', nodeId: g('C'), side: 'right', share: 0.5 }).layout;
    }
    function Wide() {
      const [layout, apply] = usePaneLayout('wide', { persist: false, initial: wide });
      return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
    }
    render(<Wide />);
    resizeTo(1200, 900);
    act(() => { vi.advanceTimersByTime(20); });
    const lying = [...document.querySelectorAll<HTMLElement>('[data-divider]')].filter((d) => d.dataset.line?.startsWith('column'));
    expect(lying).toHaveLength(1);
    const line = lying[0];
    fireEvent.pointerEnter(line, { clientX: 200, clientY: 450, pointerType: 'mouse' });
    expect(line.hasAttribute('data-hot')).toBe(true);
    expect(document.querySelector('[data-testid="divider-part"]')).toBeNull();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    const part = document.querySelector<HTMLElement>('[data-testid="divider-part"]')!;
    expect(part).toBeTruthy();
    expect(line.hasAttribute('data-hot')).toBe(false);
    // two of the three columns: under A, C and D
    expect(Math.abs(parseFloat(part.style.width) - parseFloat(line.style.width) * 2 / 3)).toBeLessThanOrEqual(2);
    expect(parseFloat(part.style.left)).toBe(parseFloat(line.style.left));
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(document.querySelector('[data-testid="divider-part"]')).toBeNull();
    expect(line.hasAttribute('data-hot')).toBe(true);
  });

  it('a double-click on a line shares the columns evenly', () => {
    const upright = ready().filter((d) => d.dataset.line?.startsWith('row'));
    fireEvent.pointerDown(upright[0], { button: 0, clientX: 600, clientY: 100, pointerId: 24 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 100, pointerId: 24, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 24 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(width('A')).toBeLessThan(width('B'));
    fireEvent.doubleClick(document.querySelector<HTMLElement>('[data-divider][data-line^="row"]')!);
    act(() => { vi.advanceTimersByTime(400); });
    expect(Math.abs(width('A') - width('B'))).toBeLessThanOrEqual(1);
    expect(Math.abs(width('D') - width('E'))).toBeLessThanOrEqual(1);
  });
});

describe('Workspace: a corner box', () => {
  beforeEach(frames);
  /** A over a C two rows tall, beside B over D over E; the bottom two rows and the right column
   *  folded, so D and E meet in the corner. */
  function cornered(): Layout {
    const g = (id: string, c0: number, c1: number, r0: number, r1: number) => ({ type: 'stack' as const, id: `g${id}`, panes: [id], active: id, c0, c1, r0, r1 });
    const ids = ['A', 'B', 'C', 'D', 'E'];
    return {
      root: {
        type: 'grid', id: 'grid',
        cols: [{ size: 0.7 }, { size: 0.3, fold: 'before' }],
        rows: [{ size: 0.5 }, { size: 0.25, fold: 'before' }, { size: 0.25, fold: 'before' }],
        groups: [g('A', 0, 1, 0, 1), g('B', 1, 2, 0, 1), g('C', 0, 1, 1, 3), g('D', 1, 2, 1, 2), g('E', 1, 2, 2, 3)],
      },
      panes: Object.fromEntries(ids.map((id, i) => [id, { id, kind: 'x', title: id, color: i }])),
      activePane: 'A',
      nextId: 6,
    };
  }
  function Cornered() {
    const [layout, apply] = usePaneLayout('corner', { persist: false, initial: cornered });
    return <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />;
  }

  it('its menu shows each page’s icon on its colour’s tile, as a strip does', async () => {
    render(<Cornered />);
    resizeTo(1000, 800);
    act(() => { vi.advanceTimersByTime(20); });
    const box = document.querySelector<HTMLElement>('.pane-strip-corner .pane-strip-count')!;
    expect(box.getAttribute('aria-label')).toBe('2 pages: D, E');
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
    const tiles = [...document.querySelectorAll<HTMLElement>('[role=menuitem] .pane-icon-tile')];
    expect(tiles.map((t) => t.dataset.color)).toEqual(['3', '4']);
    expect(tiles.map((t) => t.hasAttribute('data-front'))).toEqual([true, false]);
    expect(tiles.every((t) => t.querySelector('svg'))).toBe(true);
  });
});

describe('Workspace: moving a pane to another space', () => {
  beforeEach(frames);
  it('its menu lists the other spaces and a new one, and moves the pane in front', async () => {
    const onMove = vi.fn();
    const layout = twoSideBySide();
    render(<Workspace layout={layout} apply={() => layout} label="Notes" render={(p) => <p>{p.title}</p>}
      moveTo={{ places: [{ id: 'cards', name: 'Review cards' }], onMove }} />);
    resizeTo(1200, 800);
    const a = Object.values(layout.panes).find((p) => p.title === 'A')!;
    await act(async () => { fireEvent.keyDown(document.querySelector<HTMLElement>('[aria-label="Pane actions for A"]')!, { key: 'Enter' }); });
    const sub = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find((m) => m.textContent === 'Move to space')!;
    await act(async () => { sub.focus(); fireEvent.keyDown(sub, { key: 'ArrowRight' }); });
    const items = [...document.querySelectorAll<HTMLElement>('[data-move-menu] [role=menuitem]')];
    expect(items.map((m) => m.textContent)).toEqual(['Review cards', 'New space']);
    await act(async () => { fireEvent.click(items[0]); });
    expect(onMove).toHaveBeenCalledWith(a.id, 'cards');
  });

  it('“Move to…” offers places outside the spaces too, as the app says for the pane in front (beside in a project, )', async () => {
    const onBeside = vi.fn();
    const layout = twoSideBySide();
    const asked: string[] = [];
    render(<Workspace layout={layout} apply={() => layout} label="Notes" render={(p) => <p>{p.title}</p>}
      moveTo={{ places: [{ id: 'cards', name: 'Review cards' }], onMove: vi.fn(), onBeside,
        beside: (pane) => { asked.push(pane.title); return pane.title === 'A' ? [{ id: 'p1', name: 'Beside in Library system' }] : []; } }} />);
    resizeTo(1200, 800);
    const a = Object.values(layout.panes).find((p) => p.title === 'A')!;
    // Asked only once its menu is open.
    expect(asked).toEqual([]);
    await act(async () => { fireEvent.keyDown(document.querySelector<HTMLElement>('[aria-label="Pane actions for A"]')!, { key: 'Enter' }); });
    expect(asked).toContain('A');
    const sub = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find((m) => m.textContent === 'Move to…')!;
    await act(async () => { sub.focus(); fireEvent.keyDown(sub, { key: 'ArrowRight' }); });
    const items = [...document.querySelectorAll<HTMLElement>('[data-move-menu] [role=menuitem]')];
    expect(items.map((m) => m.textContent)).toEqual(['Review cards', 'New space', 'Beside in Library system']);
    await act(async () => { fireEvent.click(items[2]); });
    expect(onBeside).toHaveBeenCalledWith(a.id, 'p1');
  });

  it('a tab dropped on another space’s chip moves there: the chip lights and the pill says so while it is held', () => {
    const onMove = vi.fn();
    const layout = twoSideBySide();
    render(<>
      <button type="button" data-pane-drop="cards" data-pane-drop-label="Move to Review cards">Review cards</button>
      <Workspace layout={layout} apply={() => layout} label="Notes" render={(p) => <p>{p.title}</p>}
        moveTo={{ places: [{ id: 'cards', name: 'Review cards' }], onMove }} />
    </>);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const chip = document.querySelector<HTMLElement>('[data-pane-drop]')!;
    // The chip is up in the top bar, out of the panes: the pointer finds it there.
    const at = document.elementFromPoint;
    document.elementFromPoint = ((_x: number, y: number) => (y < 0 ? chip : null)) as typeof document.elementFromPoint;
    try {
      const b = Object.values(layout.panes).find((p) => p.title === 'B')!;
      const tab = document.querySelector<HTMLElement>(`#tab-${b.id}`)!;
      fireEvent.pointerDown(tab, { button: 0, clientX: 560, clientY: 15, pointerId: 9, pointerType: 'mouse', buttons: 1 });
      fireEvent.pointerMove(window, { clientX: 540, clientY: 40, pointerId: 9, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      fireEvent.pointerMove(window, { clientX: 300, clientY: -20, pointerId: 9, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      expect(chip.hasAttribute('data-drop-over')).toBe(true);
      expect(document.querySelector('.ghost-pill')?.textContent).toBe('Move to Review cards');
      expect(document.querySelectorAll('.drop-preview')).toHaveLength(0);
      fireEvent.pointerUp(window, { clientX: 300, clientY: -20, pointerId: 9, pointerType: 'mouse' });
      act(() => { vi.advanceTimersByTime(16); });
      expect(onMove).toHaveBeenCalledWith(b.id, 'cards');
      expect(chip.hasAttribute('data-drop-over')).toBe(false);
    } finally {
      document.elementFromPoint = at;
    }
  });
});

describe('Workspace: empty', () => {
  it('says so, so it is drawn on the page’s own background and takes a page dropped anywhere on it', () => {
    render(<Workspace layout={emptyLayout()} apply={() => emptyLayout()} label="Notes" render={() => null} empty={<p>Nothing here</p>} />);
    expect(area().hasAttribute('data-empty')).toBe(true);
    expect(area().dataset.paneDrop).toBe('here');
  });
});

describe('Workspace: dormant under a page', () => {
  beforeEach(frames);
  it('takes no keys and draws no Alt hints while dormant; wakes when it is not', () => {
    const apply = vi.fn((op: Parameters<Apply>[0]) => op(twoSideBySide()).layout);
    const layout = twoSideBySide();
    const { rerender } = render(<Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} dormant />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(area().hasAttribute('data-alt-hints')).toBe(false);
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' })); });
    // A pane key (Ctrl+\\ splits the active pane) does nothing while dormant.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', code: 'Backslash', ctrlKey: true })); });
    expect(apply).not.toHaveBeenCalled();
    rerender(<Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(area().hasAttribute('data-alt-hints')).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' })); });
  });
});

describe('Workspace: pages brought from the sidebar, and panes dropped on it', () => {
  beforeEach(frames);
  let bringFn: { current: Bring | null } = { current: null };
  function Bringing({ cover, start = twoSideBySide() }: { cover?: Cover; start?: Layout }) {
    const [layout, setLayout] = useState(start);
    const ref = useRef(layout);
    ref.current = layout;
    const apply = useCallback<Apply>((op) => { const r = op(ref.current); ref.current = r.layout; setLayout(r.layout); return r.layout; }, []);
    bringFn = useRef<Bring | null>(null);
    return (
      <>
        <aside data-pane-drop="sidebar" data-pane-drop-label="Remove from Reading">
          <button type="button" onPointerDown={(e) => bringFn.current?.({ kind: 'workbook', title: 'Workbook' }, e)}>Workbook</button>
        </aside>
        <Workspace layout={layout} apply={apply} label="Notes" render={(p) => <p>{p.title}</p>} bring={bringFn} cover={cover} />
      </>
    );
  }
  const titles = () => [...document.querySelectorAll('.pane-area > .pane-card [role=tab]')].map((t) => t.textContent);
  const stubPoint = (under: (x: number, y: number) => Element | null) => {
    const was = document.elementFromPoint;
    document.elementFromPoint = under as typeof document.elementFromPoint;
    return () => { document.elementFromPoint = was; };
  };

  it('a page dragged in from outside shows where it would land, as a tab’s drag does, and opens there', () => {
    render(<Bringing />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const restore = stubPoint(() => null);
    try {
      const from = screen.getByRole('button', { name: 'Workbook' });
      fireEvent.pointerDown(from, { button: 0, clientX: -100, clientY: 100, pointerId: 11, pointerType: 'mouse', buttons: 1 });
      fireEvent.pointerMove(window, { clientX: -80, clientY: 120, pointerId: 11, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      fireEvent.pointerMove(window, { clientX: 3, clientY: 300, pointerId: 11, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      expect(document.querySelectorAll('.drop-preview')).toHaveLength(1);
      expect(document.querySelector('.ghost-pill')?.textContent).toBe('Dock along the left edge');
      fireEvent.pointerUp(window, { clientX: 3, clientY: 300, pointerId: 11, pointerType: 'mouse' });
      act(() => { vi.advanceTimersByTime(16); });
      expect(titles().sort()).toEqual(['A', 'B', 'Workbook']);
    } finally { restore(); }
  });

  /** Workbook dragged from the sidebar to (x, y), then let go there (or Escape). */
  const bringTo = (x: number, y: number, end: 'drop' | 'escape' = 'drop') => {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Workbook' }), { button: 0, clientX: -100, clientY: 100, pointerId: 14, pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerMove(window, { clientX: -80, clientY: 120, pointerId: 14, pointerType: 'mouse', buttons: 1 });
    act(() => { vi.advanceTimersByTime(32); });
    fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 14, pointerType: 'mouse', buttons: 1 });
    act(() => { vi.advanceTimersByTime(32); });
    const seen = { pill: document.querySelector('.ghost-pill')?.textContent, preview: document.querySelector('.drop-preview')?.getAttribute('data-state') ?? null };
    if (end === 'drop') fireEvent.pointerUp(window, { clientX: x, clientY: y, pointerId: 14, pointerType: 'mouse' });
    else fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(16); });
    return seen;
  };

  it('over a page drawn over the panes, a page brought in lands on it: a new space of the two, the space under it untouched', () => {
    const onDrop = vi.fn();
    render(<Bringing cover={{ page: { kind: 'reference', title: 'Formula sheet' }, onDrop }} />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const restore = stubPoint(() => null);
    try {
      expect(bringTo(997, 300).pill).toBe('New space: Split right of “Formula sheet”');
      expect(onDrop).toHaveBeenCalledTimes(1);
      const [made, brought] = onDrop.mock.calls[0] as [Layout, BringPage];
      expect(brought.kind).toBe('workbook');
      expect(Object.values(made.panes).map((p) => p.title).sort()).toEqual(['Formula sheet', 'Workbook']);
      expect(titles().sort()).toEqual(['A', 'B']);
      // The page itself, brought onto its own page: already here, nothing made.
      cleanup();
      render(<Bringing cover={{ page: { kind: 'workbook', title: 'Workbook' }, onDrop }} />);
      resizeTo(1000, 600);
      act(() => { vi.advanceTimersByTime(50); });
      expect(bringTo(500, 300).pill).toBe('Already here');
      expect(onDrop).toHaveBeenCalledTimes(1);
    } finally { restore(); }
  });

  it('over a page split by halves, each half puts the page brought in beside it on that side, the ghost that half', () => {
    const onDrop = vi.fn();
    render(<Bringing cover={{ page: { kind: 'journal', title: 'Journal' }, onDrop, halves: true, makes: '' }} />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const restore = stubPoint(() => null);
    try {
      // Well inside the page (not at an edge): its left half, then its right half.
      expect(bringTo(250, 300).pill).toBe('Split left of “Journal”');
      const left = onDrop.mock.calls[0][0] as Layout;
      const order = (l: Layout) => (l.root!.type === 'grid' ? [...l.root!.groups].sort((x, y) => x.c0 - y.c0).map((g) => l.panes[g.active].title) : []);
      expect(order(left)).toEqual(['Workbook', 'Journal']);
      expect(bringTo(750, 300).pill).toBe('Split right of “Journal”');
      expect(order(onDrop.mock.calls[1][0] as Layout)).toEqual(['Journal', 'Workbook']);
    } finally { restore(); }
  });

  it('over a page that is never a pane, it is refused in red, and let go there or anywhere the page hears of it', () => {
    const onRefuse = vi.fn();
    // Over an empty space: no pane under the page to hit, all of it still answers.
    render(<Bringing cover={{ refuse: "Home can't be a pane", onRefuse }} start={emptyLayout()} />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const restore = stubPoint(() => null);
    try {
      expect(bringTo(500, 300)).toEqual({ pill: "Home can't be a pane", preview: 'refused' });
      expect(onRefuse).toHaveBeenCalledTimes(1);
      expect(onRefuse.mock.calls[0][0]).toMatchObject({ kind: 'workbook' });
      expect(document.querySelector('[data-notification]')).toBeNull();
      bringTo(300, 200, 'escape');
      expect(onRefuse).toHaveBeenCalledTimes(2);
      expect(titles()).toEqual([]);
    } finally { restore(); }
  });

  it('a tab dropped on the sidebar leaves the space; a page brought from the sidebar is not taken out by being over it', () => {
    render(<Bringing />);
    resizeTo(1000, 600);
    act(() => { vi.advanceTimersByTime(50); });
    const aside = document.querySelector<HTMLElement>('aside')!;
    const restore = stubPoint((x) => (x < 0 ? aside : null));
    try {
      // A page from the sidebar, let go over the sidebar: nothing opens, nothing closes.
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Workbook' }), { button: 0, clientX: -100, clientY: 100, pointerId: 12, pointerType: 'mouse', buttons: 1 });
      fireEvent.pointerMove(window, { clientX: -60, clientY: 140, pointerId: 12, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      expect(aside.hasAttribute('data-drop-over')).toBe(false);
      fireEvent.pointerUp(window, { clientX: -60, clientY: 140, pointerId: 12, pointerType: 'mouse' });
      act(() => { vi.advanceTimersByTime(16); });
      expect(titles().sort()).toEqual(['A', 'B']);
      // B's tab, let go over the sidebar: B leaves the space.
      const tab = [...document.querySelectorAll<HTMLElement>('.pane-area > .pane-card [role=tab]')].find((t) => t.textContent === 'B')!;
      fireEvent.pointerDown(tab, { button: 0, clientX: 560, clientY: 15, pointerId: 13, pointerType: 'mouse', buttons: 1 });
      fireEvent.pointerMove(window, { clientX: 540, clientY: 40, pointerId: 13, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      fireEvent.pointerMove(window, { clientX: -50, clientY: 200, pointerId: 13, pointerType: 'mouse', buttons: 1 });
      act(() => { vi.advanceTimersByTime(32); });
      expect(aside.hasAttribute('data-drop-over')).toBe(true);
      expect(document.querySelector('.ghost-pill')?.textContent).toBe('Remove from Reading');
      fireEvent.pointerUp(window, { clientX: -50, clientY: 200, pointerId: 13, pointerType: 'mouse' });
      act(() => { vi.advanceTimersByTime(400); });
      expect(titles()).toEqual(['A']);
    } finally { restore(); }
  });
});
