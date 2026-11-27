import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Notifications, pileShape } from './notifications';
import { notify, resetNotifications } from './notify';

afterEach(() => { cleanup(); act(() => resetNotifications()); });

describe('Notifications', () => {
  it('stacks a type collapsed under its newest, saying how many only once it is opened', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 5; i++) notify({ tone: 'error', title: `Upload ${i} failed` }); });
    const cards = document.querySelectorAll('[data-slot="notification"]');
    expect(cards.length).toBe(5);
    // Only the front one is reachable; the rest are tucked under it.
    expect(cards[0].getAttribute('aria-hidden')).toBeNull();
    expect(cards[1].getAttribute('aria-hidden')).toBe('true');
    // closed: no +N, no header; the cards under the front one say there are more
    expect(screen.queryByRole('button', { name: /more errors: show all/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Notification actions' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\+\d/);
  });

  it('keeps types in their own stacks, errors first', () => {
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'Info' }); notify({ tone: 'error', title: 'Error' }); });
    expect([...document.querySelectorAll('[data-slot="notification-stack"]')].map((s) => (s as HTMLElement).dataset.tone)).toEqual(['error', 'info']);
  });

  it('opens a stack under the pointer, so every notification in it can be reached', () => {
    render(<Notifications />);
    act(() => { notify({ tone: 'success', title: 'A' }); notify({ tone: 'success', title: 'B' }); });
    fireEvent.pointerEnter(document.querySelector('[data-slot="notification-stack"]')!);
    expect(document.querySelector('[data-slot="notification-stack"]')!.hasAttribute('data-open')).toBe(true);
    expect([...document.querySelectorAll('[data-slot="notification"]')].every((c) => !c.hasAttribute('aria-hidden'))).toBe(true);
  });
});

describe('Notifications, opened', () => {
  it('shows the top five of an opened stack and keeps the rest behind +N, until asked for all', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 8; i++) notify({ tone: 'error', title: `Upload ${i} failed` }); });
    fireEvent.pointerEnter(document.querySelector('[data-slot="notification-stack"]')!);
    const reachable = () => [...document.querySelectorAll('[data-slot="notification"]')].filter((c) => !c.hasAttribute('aria-hidden')).length;
    expect(reachable()).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: '3 more errors: show all' }));
    expect(reachable()).toBe(8);
  });
});

describe('Notifications, counts, clearing and time', () => {
  it('shows identical notifications as one card, its icon piled as the card has room for and the number in a badge', () => {
    render(<Notifications />);
    act(() => { for (let i = 0; i < 3; i++) notify({ tone: 'warning', title: 'Slides unreadable' }); });
    expect(document.querySelectorAll('[data-slot="notification"]').length).toBe(1);
    const pile = screen.getByRole('button', { name: '3 times: show each' });
    expect(pile.querySelectorAll('[data-slot="notification-pile"] svg').length).toBe(3);
    expect(pile.textContent).toBe('');
    // the badge says how many from the second arrival on
    expect(document.querySelector('[data-part="notification-count-badge"]')!.textContent).toBe('3');
    act(() => { for (let i = 0; i < 11; i++) notify({ tone: 'warning', title: 'Slides unreadable' }); });
    const many = screen.getByRole('button', { name: '14 times: show each' });
    // (jsdom measures nothing: a card is taken as 68px tall, room for the most copies, four)
    expect(many.querySelectorAll('[data-slot="notification-pile"] svg').length).toBe(5);
    // the pile stops where the card has no more room; the badge on the card's top-left corner says how many
    expect(many.textContent).toBe('');
    const badge = document.querySelector<HTMLElement>('[data-part="notification-count-badge"]')!;
    expect(badge.textContent).toBe('14');
    expect(badge.className.split(/\s+/)).toEqual(expect.arrayContaining(['top-0', 'left-0', '-translate-x-1/2', '-translate-y-1/2']));
    expect(badge.closest('[data-slot="notification"]')).toBeTruthy();
  });

  it('piles a plain ring for a type with no icon', () => {
    render(<Notifications />);
    act(() => { for (let i = 0; i < 2; i++) notify({ tone: 'neutral', title: 'Closed “Limits”' }); });
    expect(screen.getByRole('button', { name: '2 times: show each' }).querySelectorAll('svg').length).toBe(2);
  });

  it('the same one again, from under the front of its stack, comes in at the top as a new one does; in front, it only counts', () => {
    render(<Notifications />);
    act(() => { for (const t of ['A', 'B', 'C']) notify({ tone: 'info', title: t }); });
    const card = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-slot="notification"]')].find((c) => c.textContent!.includes(title))!;
    const a = card('A'), c = card('C');
    // C is in front: again, it is the same card, counted
    act(() => { notify({ tone: 'info', title: 'C' }); });
    expect(card('C')).toBe(c);
    // A is under the others: again, it is a new card at the top (not A's, moved up), with its count
    act(() => { notify({ tone: 'info', title: 'A' }); });
    const again = card('A');
    expect(again).not.toBe(a);
    expect(document.querySelector('[data-slot="notification"]')).toBe(again);
    expect(screen.getByRole('button', { name: '2 times: show each' })).toBeTruthy();
  });

  it('splits a counted card into one per arrival when its badge is clicked, each with its time', () => {
    render(<Notifications />);
    act(() => { for (let i = 0; i < 3; i++) notify({ tone: 'warning', title: 'Slides unreadable' }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: '3 times: show each' })); });
    const cards = [...document.querySelectorAll('[data-slot="notification"]')];
    expect(cards.length).toBe(3);
    expect(cards.filter((c) => !c.hasAttribute('aria-hidden')).length).toBe(3);
    expect(cards.every((c) => c.querySelector('[data-slot="notification-when"]'))).toBe(true);
    expect(document.querySelector('[data-part="notification-count"]')).toBeNull();
  });

  it('clears an opened stack with one button', () => {
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'A' }); notify({ tone: 'info', title: 'B' }); });
    fireEvent.pointerEnter(document.querySelector('[data-slot="notification-stack"]')!);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Clear all/ })); });
    expect([...document.querySelectorAll('[data-slot="notification"]')].every((c) => c.hasAttribute('data-leaving'))).toBe(true);
  });

  it('leaves to the left when dragged to the left and let go', () => {
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'Swipe me' }); });
    const card = document.querySelector<HTMLElement>('[data-slot="notification"]')!;
    act(() => { card.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 10 })); });
    // Past half its width (jsdom's card is 300px), so it leaves even when the events arrive too
    // close together for a speed to be measured.
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120 })); window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 20 })); });
    expect(card.hasAttribute('data-leaving')).toBe(true);
    expect(parseFloat(card.style.getPropertyValue('--drag-x'))).toBeLessThan(0);
  });

  it('says when each one arrived', () => {
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'Now' }); });
    expect(document.querySelector('[data-slot="notification-when"]')!.textContent).toBe('just now');
  });
});

describe('a pile fits the room under its icon', () => {
  it('in a one-line card (46px): two copies, 3.5px apart, clear of the bottom edge', () => {
    expect(pileShape(9, 46)).toEqual({ copies: 2, gap: 3.5 });
  });
  it('in a two-line card (67px): four copies (the most), 4px apart (the widest)', () => {
    expect(pileShape(9, 67)).toEqual({ copies: 4, gap: 4 });
  });
  it('no more copies than arrivals, and always one, however short the card', () => {
    expect(pileShape(2, 65)).toEqual({ copies: 1, gap: 4 });
    expect(pileShape(9, 30)).toEqual({ copies: 1, gap: 3 });
  });
});

describe('Notifications, with reduced motion', () => {
  it('still show the time left: the bar is a reading, not a flourish', () => {
    const css = readFileSync(join(__dirname, '../styles.css'), 'utf8');
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g)!;
    expect(reduced.length).toBeGreaterThan(0);
    for (const block of reduced) expect(block).not.toContain('notification-time');
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'Saved', ms: 4000 }); });
    expect(document.querySelector<HTMLElement>('[data-slot="notification-time"]')!.style.getPropertyValue('--notice-ms')).toBe('4000ms');
  });
});

describe('Notifications, the header of a stack a mouse opened', () => {
  it('says how many there are, clears them all and shows the rest; leaving closes it, so no Show less', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 8; i++) notify({ tone: 'error', title: `Upload ${i} failed` }); });
    const stack = document.querySelector<HTMLElement>('[data-slot="notification-stack"]')!;
    fireEvent.pointerEnter(stack);
    const head = screen.getByRole('group', { name: 'Notification actions' });
    expect(head.textContent).toBe('8 errorsClear all+3 more');
    expect(head.className).toContain('bg-popover');
    // the cards sit under it
    expect(document.querySelector<HTMLElement>('[data-slot="notification"]')!.style.transform).toBe('translateY(52px) scale(1)');
    fireEvent.click(screen.getByRole('button', { name: '3 more errors: show all' }));
    expect(screen.getByRole('group', { name: 'Notification actions' }).textContent).toBe('8 errorsClear all');
    fireEvent.pointerLeave(stack);
    expect(screen.queryByRole('group', { name: 'Notification actions' })).toBeNull();
  });

  it('holds every one in it while the pointer is on the header, and lets them run on once it leaves', () => {
    vi.useFakeTimers();
    try {
      render(<Notifications />);
      act(() => { for (const t of ['A', 'B', 'C']) notify({ tone: 'success', title: t, ms: 1000 }); });
      const live = () => document.querySelectorAll('[data-slot="notification"]:not([data-leaving])').length;
      fireEvent.pointerEnter(document.querySelector('[data-slot="notification-stack"]')!);
      fireEvent.pointerEnter(screen.getByRole('group', { name: 'Notification actions' }));
      act(() => { vi.advanceTimersByTime(5000); });
      expect(live()).toBe(3);
      fireEvent.pointerLeave(screen.getByRole('group', { name: 'Notification actions' }));
      act(() => { vi.advanceTimersByTime(5000); });
      expect(live()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('keeps a card\'s first line on one line: its action and its close button centred on the title', () => {
    render(<Notifications />);
    act(() => { notify({ title: 'Closed “Limits”', action: { label: 'Undo', onClick: () => {} } }); });
    const classes = (el: Element) => el.className.split(/\s+/);
    expect(classes(screen.getByRole('button', { name: 'Undo' }))).toEqual(expect.arrayContaining(['-my-0.5', 'pointer-coarse:-my-1.5']));
    expect(classes(screen.getByRole('button', { name: 'Close: Closed “Limits”' }))).toContain('top-2.5');
  });

  it('every one listed (+N more), each says the time it came to the second, not "just now"', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 8; i++) notify({ tone: 'error', title: `Upload ${i} failed` }); });
    fireEvent.pointerEnter(document.querySelector('[data-slot="notification-stack"]')!);
    const times = () => [...document.querySelectorAll<HTMLElement>('[data-slot="notification"]:not([aria-hidden]) [data-slot="notification-when"]')];
    expect(times().every((t) => t.textContent === 'just now')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '3 more errors: show all' }));
    expect(times()).toHaveLength(8);
    expect(times().every((t) => /\d{1,2}:\d{2}:\d{2}/.test(t.textContent!) && t.hasAttribute('data-exact'))).toBe(true);
  });

  it('opened taller than the window below it, it scrolls inside, its header held at the top', () => {
    const tall = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    try {
      render(<Notifications />);
      act(() => { for (let i = 1; i <= 8; i++) notify({ tone: 'error', title: `Upload ${i} failed` }); });
      const stack = document.querySelector<HTMLElement>('[data-slot="notification-stack"]')!;
      expect(stack.hasAttribute('data-scrolls')).toBe(false);
      fireEvent.pointerEnter(stack);
      fireEvent.click(screen.getByRole('button', { name: '3 more errors: show all' }));
      expect(stack.hasAttribute('data-scrolls')).toBe(true);
      expect(stack.style.height).toBe(`${300 - 16}px`);
      // the cards scroll in their own box; the header is not in it, so it stays
      const scroller = stack.querySelector<HTMLElement>('[data-slot="notification-stack-scroll"]')!;
      expect(scroller.className).toContain('overflow-y-auto');
      expect(scroller.contains(screen.getByRole('group', { name: 'Notification actions' }))).toBe(false);
      // closed, it is itself again
      fireEvent.pointerLeave(stack);
      expect(stack.hasAttribute('data-scrolls')).toBe(false);
    } finally { tall.mockRestore(); }
  });

  it('has nothing to say for a lone notification', () => {
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'Saved' }); });
    fireEvent.pointerEnter(document.querySelector('[data-slot="notification-stack"]')!);
    expect(screen.queryByRole('group', { name: 'Notification actions' })).toBeNull();
  });
});

describe('Notifications, with a finger (no hover)', () => {
  // jsdom's pointer events carry no pointerType without a PointerEvent of their own
  const touch = { pointerType: 'touch', pointerId: 1, button: 0 };
  const stack = () => document.querySelector<HTMLElement>('[data-slot="notification-stack"]')!;
  const front = () => document.querySelector<HTMLElement>('[data-slot="notification"]')!;
  /** A tap as a phone sends it: the pointer enters, goes down, up, leaves, then the click. */
  const tap = (el: HTMLElement) => {
    fireEvent.pointerEnter(el, touch);
    fireEvent.pointerDown(el, touch);
    fireEvent.pointerUp(el, touch);
    fireEvent.pointerLeave(el, touch);
    fireEvent.click(el);
  };
  beforeEach(() => {
    if (typeof PointerEvent === 'undefined' || !('pointerType' in new PointerEvent('pointerdown'))) {
      vi.stubGlobal('PointerEvent', class extends MouseEvent {
        pointerId: number; pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; }
      });
    }
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('a tap opens a closed stack, lifting the finger does not close it, and a tap outside does', () => {
    const clicked = vi.fn();
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'A', onClick: clicked }); notify({ tone: 'info', title: 'B', onClick: clicked }); });
    tap(front().querySelector('button')!);
    expect(stack().hasAttribute('data-open')).toBe(true);
    // the tap opened the stack; it did not open the card's target
    expect(clicked).not.toHaveBeenCalled();
    expect([...document.querySelectorAll('[data-slot="notification"]')].every((c) => !c.hasAttribute('aria-hidden'))).toBe(true);
    // open, a tap on a card does what a click does
    tap(document.querySelector<HTMLElement>('[data-slot="notification"] button')!);
    expect(clicked).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body, touch);
    expect(stack().hasAttribute('data-open')).toBe(false);
  });

  it('opened by a finger, its timers wait while it is read; Show less closes it and they run again', () => {
    vi.useFakeTimers();
    render(<Notifications />);
    act(() => { notify({ tone: 'success', title: 'Saved', ms: 1000 }); notify({ tone: 'success', title: 'Sent', ms: 1000 }); });
    tap(front());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(document.querySelectorAll('[data-slot="notification"]:not([data-leaving])').length).toBe(2);
    // opened by a finger, a header above the cards says what it holds and closes it; the cards sit under it
    const head = screen.getByRole('group', { name: 'Notification actions' });
    expect(head.getAttribute('data-slot')).toBe('notification-head');
    expect(head.textContent).toBe('2 doneClear allShow less');
    expect(front().style.transform).toBe('translateY(52px) scale(1)');
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(stack().hasAttribute('data-open')).toBe(false);
    expect(screen.queryByRole('group', { name: 'Notification actions' })).toBeNull();
    expect(front().style.transform).toBe('translateY(0px) scale(1)');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(document.querySelectorAll('[data-slot="notification"]:not([data-leaving])').length).toBe(0);
  });

  it('cleared, it closes at once: no "0 done" header while the cards leave, and they leave from where they were', () => {
    vi.useFakeTimers();
    render(<Notifications />);
    act(() => { for (const t of ['Saved', 'Sent', 'Synced']) notify({ tone: 'success', title: t }); });
    tap(front());
    const cards = () => [...document.querySelectorAll<HTMLElement>('[data-slot="notification"]')];
    const where = cards().map((c) => c.style.transform);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('group', { name: 'Notification actions' })).toBeNull();
    expect(document.body.textContent).not.toContain('0 done');
    // it fades out as it was, untouchable, then goes
    const fading = document.querySelector<HTMLElement>('[data-slot="notification-head"]')!;
    expect(fading.hasAttribute('data-gone')).toBe(true);
    expect(fading.hasAttribute('inert')).toBe(true);
    expect(fading.textContent).toBe('3 doneClear allShow less');
    expect(stack().hasAttribute('data-open')).toBe(false);
    // still there, leaving, each from its own place
    expect(cards().every((c) => c.hasAttribute('data-leaving'))).toBe(true);
    expect(cards().map((c) => c.style.transform)).toEqual(where);
    // and once faded, the header is gone
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.querySelector('[data-slot="notification-head"]')).toBeNull();
  });

  it('in a narrow header (a phone), Clear all and Show less are their icons, so the count is never cut short', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 6; i++) notify({ title: `Closed ${i}` }); });
    tap(front());
    const head = screen.getByRole('group', { name: 'Notification actions' });
    expect(head.className.split(/\s+/)).toContain('@container/head');
    const words = (name: string) => screen.getByRole('button', { name }).querySelector('span:not([aria-hidden])')!.className;
    expect(words('Clear all')).toContain('@max-[26rem]/head:sr-only');
    expect(words('Show less')).toContain('@max-[26rem]/head:sr-only');
    // still said, and still a tooltip
    expect(screen.getByRole('button', { name: 'Clear all' }).getAttribute('title')).toBe('Clear all');
  });

  it('opened by a finger with more than five, the header shows the rest too', () => {
    render(<Notifications />);
    act(() => { for (let i = 1; i <= 8; i++) notify({ tone: 'error', title: `Upload ${i} failed` }); });
    tap(front());
    expect(screen.getByRole('group', { name: 'Notification actions' }).textContent).toBe('8 errorsClear all+3 moreShow less');
    fireEvent.click(screen.getByRole('button', { name: '3 more errors: show all' }));
    expect(screen.getByRole('group', { name: 'Notification actions' }).textContent).toBe('8 errorsClear allShow less');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(document.querySelectorAll('[data-slot="notification"]:not([data-leaving])').length).toBe(0);
  });

  it('a lone notification is acted on at once: there is nothing to open', () => {
    const clicked = vi.fn();
    render(<Notifications />);
    act(() => { notify({ tone: 'info', title: 'Only one', onClick: clicked }); });
    tap(front().querySelector('button')!);
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
