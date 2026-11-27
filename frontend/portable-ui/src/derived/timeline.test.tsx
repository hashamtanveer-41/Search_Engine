// The timeline: a real scale of days (each item and today where its date falls), zoomed around a
// point and panned within reach of its items, ticks as fine as the zoom leaves room for, labels kept
// apart, and a drag that moves it without following the link it began on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { dayOf, fitView, labelWidth, placeLabels, MAX_SPAN, MIN_SPAN, panView, tickStep, ticksOf, Timeline, xOf, zoomView, type TimelineItem } from './timeline';

beforeEach(() => {
  // jsdom has no PointerEvent: without one, fired pointer events carry no pointerId (scrub.test.tsx).
  if (typeof PointerEvent === 'undefined' || !('pointerId' in new PointerEvent('pointerdown'))) {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
    });
  }
  HTMLElement.prototype.setPointerCapture = () => undefined;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ITEMS: TimelineItem[] = [
  { key: 'a', date: '2026-11-09', title: 'Requirements', tone: 'ok', state: 'Done', href: '/m/a' },
  { key: 'b', date: '2026-11-23', title: 'Design', tone: 'info', state: 'Next', href: '/m/b', progress: { done: 1, total: 6 } },
  { key: 'c', date: '2026-12-04', title: 'Final hand-in', href: '/m/c' },
];

describe('the scale', () => {
  it('fits every item and today, a margin either side, never under three weeks', () => {
    const days = [dayOf('2026-11-09'), dayOf('2026-12-04'), dayOf('2026-11-21')];
    const v = fitView(days);
    for (const d of days) expect(xOf(d, v, 1000)).toBeGreaterThan(30);
    for (const d of days) expect(xOf(d, v, 1000)).toBeLessThan(970);
    expect(fitView([dayOf('2026-11-21')]).span).toBe(21);
    // Today in the middle when it is all there is.
    expect(xOf(dayOf('2026-11-21'), fitView([dayOf('2026-11-21')]), 1000)).toBe(500);
  });

  it('zooms around the point given, which stays where it was, within its limits', () => {
    const v = { start: 100, span: 60 };
    const z = zoomView(v, 0.5, 0.25);
    expect(z.span).toBe(30);
    // The day a quarter across before is a quarter across after.
    expect(z.start + z.span * 0.25).toBeCloseTo(v.start + v.span * 0.25);
    expect(zoomView(v, 0.01).span).toBe(MIN_SPAN);
    expect(zoomView(v, 100).span).toBe(MAX_SPAN);
  });

  it('pans, but not so far that its items and today leave the view', () => {
    const v = { start: 100, span: 50 };
    expect(panView(v, 10, [90, 200]).start).toBe(110);
    // Far left: the first item still in view, near the right edge.
    expect(panView(v, -1000, [90, 200]).start).toBe(90 - 45);
    // Far right: the last item still in view, near the left edge.
    expect(panView(v, 1000, [90, 200]).start).toBe(200 - 5);
  });

  it('ticks follow the zoom: days, then Mondays, then months, then quarters', () => {
    expect(tickStep(60)).toBe('day');
    expect(tickStep(20)).toBe('week');
    expect(tickStep(5)).toBe('month');
    expect(tickStep(1)).toBe('quarter');
    const start = dayOf('2026-11-01');
    const weeks = ticksOf({ start, span: 30 }, 600);
    // Mondays only: 2, 9, 16, 23 and 30 Nov.
    expect(weeks.map((t) => t.label)).toEqual(['2 Nov', '9 Nov', '16 Nov', '23 Nov', '30 Nov']);
    expect(weeks[0].major).toBe(true);
    const days = ticksOf({ start, span: 7 }, 700);
    expect(days.find((t) => t.day === dayOf('2026-11-02'))).toMatchObject({ label: 'Mon 2', major: true });
    const months = ticksOf({ start: dayOf('2026-10-15'), span: 120 }, 600);
    expect(months.map((t) => t.label)).toEqual(['Nov', 'Dec', 'Jan 2027', 'Feb']);
    expect(months.find((t) => t.label === 'Jan 2027')!.major).toBe(true);
    const quarters = ticksOf({ start: dayOf('2026-10-15'), span: 400 }, 600);
    expect(quarters.map((t) => t.label)).toEqual(['Jan 2027', 'Apr 2027', 'Jul 2027', 'Oct 2027']);
  });

  it('keeps cards apart: below while there is room, then above; crowded, the ones that matter most keep theirs', () => {
    const w = labelWidth(1000);
    expect(placeLabels([100, 300, 500], 1000, [0, 0, 0]).map((p) => p.lane)).toEqual([0, 0, 0]);
    expect(placeLabels([100, 140, 300], 1000, [0, 0, 0]).map((p) => p.lane)).toEqual([0, 1, 0]);
    // Three at one spot: the two ranked first get the two sides, the third is its mark alone.
    expect(placeLabels([500, 505, 510], 1000, [2, 0, 1]).map((p) => p.lane)).toEqual([-1, 0, 1]);
    // Kept inside the track, and none for a mark out of view.
    const edge = placeLabels([2, 990, 1200], 1000, [0, 0, 0]);
    expect(edge[0].left).toBe(4);
    expect(edge[1].left).toBe(1000 - w - 4);
    expect(edge[2].lane).toBe(-1);
    expect(labelWidth(360)).toBeLessThan(w);
  });
});

describe('Timeline', () => {
  it('places each item and today by date, in order, each a link, with a list for a screen reader', () => {
    render(<Timeline label="Milestones" items={[ITEMS[2], ITEMS[0], ITEMS[1]]} today="2026-11-21" />);
    expect(screen.queryByText(/zoom in to read/)).toBeNull();
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-slot=timeline-item]')];
    expect(links.map((a) => a.dataset.key)).toEqual(['a', 'b', 'c']);
    expect(links[1].getAttribute('href')).toBe('/m/b');
    const left = (el: Element) => parseFloat((el as HTMLElement).style.left);
    const marks = [...document.querySelectorAll('[data-slot=timeline-mark]')].map(left);
    const today = left(document.querySelector('[data-slot=timeline-today]')!) + 1;
    // Today (21 Nov) between Requirements (9 Nov) and Design (23 Nov), nearer Design, on the scale.
    expect(marks[0]).toBeLessThan(today);
    expect(today).toBeLessThan(marks[1]);
    expect((marks[1] - today) / (today - marks[0])).toBeCloseTo(2 / 12, 1);
    expect(document.querySelector('[data-slot=timeline-mark]')!.getAttribute('data-tone')).toBe('ok');
    // A labelled group; its links say each in full, in date order, and today is said once.
    const group = screen.getByRole('group', { name: 'Milestones' });
    expect(group.getAttribute('aria-keyshortcuts')).toBe('ArrowLeft ArrowRight + - T 0');
    expect(within(group).getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Requirements, done: Mon, 9 Nov 2026', 'Design, next: Mon, 23 Nov 2026, 1 of 6 done', 'Final hand-in: Fri, 4 Dec 2026',
    ]);
    expect(group.querySelector('[data-slot=timeline-today-words]')!.textContent).toBe('Today: Sat, 21 Nov 2026');
  });

  it('zooms in and out with its buttons and keys; Fit all and Today bring it back', () => {
    render(<Timeline label="Milestones" items={ITEMS} today="2026-11-21" />);
    const step = () => document.querySelector('[data-slot=timeline-step]')!.textContent;
    const spread = () => {
      const m = [...document.querySelectorAll<HTMLElement>('[data-slot=timeline-mark]')].map((e) => parseFloat(e.style.left));
      return m[m.length - 1] - m[0];
    };
    const fitted = spread();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(spread()).toBeGreaterThan(fitted * 1.3);
    fireEvent.click(screen.getByRole('button', { name: 'Fit all' }));
    expect(spread()).toBeCloseTo(fitted);
    const track = document.querySelector<HTMLElement>('[data-slot=timeline-track]')!;
    for (let i = 0; i < 12; i++) fireEvent.keyDown(track, { key: '-' });
    expect(step()).toMatch(/^(Month by month|By quarter)/);
    for (let i = 0; i < 20; i++) fireEvent.keyDown(track, { key: '+' });
    expect(step()).toMatch(/^Day by day/);
    expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(true);
    // Today in the middle.
    fireEvent.click(screen.getByRole('button', { name: /Today/ }));
    expect(parseFloat(document.querySelector<HTMLElement>('[data-slot=timeline-today]')!.style.left) + 1).toBeCloseTo(400);
    fireEvent.keyDown(track, { key: '0' });
    expect(spread()).toBeCloseTo(fitted);
  });

  it('says what is past each edge with a chip that brings it into view; today’s pill sits on the axis, held at the edge while off it', () => {
    render(<Timeline label="Milestones" items={[...ITEMS, { key: 'd', date: '2026-12-10', title: 'Demo' }]} today="2026-11-21" />);
    expect(document.querySelector('[data-slot=timeline-edge]')).toBeNull();
    const pill = () => document.querySelector<HTMLElement>('[data-slot=timeline-today-pill]')!;
    expect(pill().className).toContain('bottom-1');
    expect(pill().dataset.off).toBeUndefined();
    const track = document.querySelector<HTMLElement>('[data-slot=timeline-track]')!;
    // A week around today: Requirements is off to the left, Final hand-in and Demo to the right.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(track, { key: '+' });
    fireEvent.keyDown(track, { key: 't' });
    const left = screen.getByRole('button', { name: 'show Requirements, done: Mon, 9 Nov 2026' });
    expect(left.dataset.side).toBe('left');
    expect(left.textContent).toBe('Requirements9 Nov');
    const right = screen.getByRole('button', { name: '2 more later; show Final hand-in: Fri, 4 Dec 2026' });
    expect(right.textContent).toContain('+1');
    // Its chip brings Requirements to the middle; today is then off to the right, its pill a button back.
    fireEvent.click(left);
    const mark = document.querySelector<HTMLElement>('[data-slot=timeline-mark][data-key=a]')!;
    expect(parseFloat(mark.style.left)).toBeCloseTo(400);
    expect(pill().dataset.off).toBe('right');
    fireEvent.click(screen.getByRole('button', { name: 'Show today' }));
    expect(pill().dataset.off).toBeUndefined();
  });

  it('pans with ← and →, and a drag moves it without following the link it began on', () => {
    render(<Timeline label="Milestones" items={ITEMS} today="2026-11-21" />);
    const track = document.querySelector<HTMLElement>('[data-slot=timeline-track]')!;
    const first = () => parseFloat(document.querySelector<HTMLElement>('[data-slot=timeline-mark]')!.style.left);
    const at = first();
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(first()).toBeLessThan(at);
    fireEvent.keyDown(track, { key: 'ArrowLeft' });
    expect(first()).toBeCloseTo(at);
    const link = document.querySelector<HTMLElement>('[data-slot=timeline-item]')!;
    fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 360 });
    fireEvent.pointerUp(track, { pointerId: 1, clientX: 360 });
    expect(first()).toBeGreaterThan(at);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    // A click with no drag before it is the link's.
    const next = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
  });

  it('crowded (zoomed out), the next one keeps its card and the rest show as marks, still links, until a zoom in', () => {
    const many: TimelineItem[] = [
      { key: '1', date: '2026-11-20', title: 'One', href: '/m/1' },
      { key: '2', date: '2026-11-21', title: 'Two', tone: 'bad', state: 'Late', href: '/m/2' },
      { key: '3', date: '2026-11-22', title: 'Three', tone: 'info', state: 'Next', href: '/m/3' },
      { key: '4', date: '2026-11-23', title: 'Four', href: '/m/4' },
    ];
    render(<Timeline label="Milestones" items={many} today="2026-11-21" />);
    const track = document.querySelector<HTMLElement>('[data-slot=timeline-track]')!;
    for (let i = 0; i < 12; i++) fireEvent.keyDown(track, { key: '-' });
    const cards = () => [...document.querySelectorAll<HTMLElement>('[data-slot=timeline-item]')].map((e) => e.dataset.key);
    expect(cards()).toEqual(['2', '3']);
    expect(screen.getByText(/zoom in to read 2 more/)).toBeTruthy();
    const alone = screen.getByRole('link', { name: 'Four: Mon, 23 Nov 2026' });
    expect(alone.getAttribute('href')).toBe('/m/4');
    expect(alone.dataset.slot).toBe('timeline-mark');
    // Zoomed in, day by day around today: room for every card again.
    for (let i = 0; i < 16; i++) fireEvent.keyDown(track, { key: '+' });
    fireEvent.keyDown(track, { key: 't' });
    expect(document.querySelector('[data-slot=timeline-step]')!.textContent).toMatch(/^Day by day/);
    expect(cards()).toEqual(['1', '2', '3', '4']);
    expect(screen.queryByText(/zoom in to read/)).toBeNull();
  });
});
