import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clickTarget, dismiss, dismissAll, holdNotice, LEAVE_MS, showStack, whenSaid, notify, resetNotifications, setNotificationRoutes, useNotices, type Notice } from './notify';
import { renderHook } from '@testing-library/react';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { resetNotifications(); vi.useRealTimers(); });

const current = () => renderHook(() => useNotices()).result.current;
const byId = (id: string): Notice => current().find((n) => n.id === id)!;

describe('notification stacks', () => {
  it('counts down only the front notification of a stack; the ones under it wait their turn', () => {
    const first = notify({ tone: 'error', title: 'Upload failed', ms: 1000 });
    const second = notify({ tone: 'error', title: 'Upload failed again', ms: 1000 });
    expect(byId(second).running).toBe(true);
    expect(byId(first).running).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(byId(second).leaving).toBe(true);
    // The one under it only now starts its full time.
    expect(byId(first).running).toBe(true);
    vi.advanceTimersByTime(999);
    expect(byId(first).leaving).toBe(false);
    vi.advanceTimersByTime(1);
    expect(byId(first).leaving).toBe(true);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(current()).toEqual([]);
  });

  it('keeps one stack per type, each with its own front', () => {
    const e = notify({ tone: 'error', title: 'E' });
    const i = notify({ tone: 'info', title: 'I' });
    expect(byId(e).running && byId(i).running).toBe(true);
  });

  it('keeps a notification held while anything holds it: one holder letting go does not free it', () => {
    const id = notify({ tone: 'info', title: 'Generating', ms: 1000 });
    // the open stack holds it (the pointer on its header), then the pointer moves onto the card itself
    holdNotice(id, true, 'stack');
    holdNotice(id, true, 'pointer');
    holdNotice(id, false, 'stack');
    expect(byId(id).running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(byId(id).leaving).toBe(false);
    holdNotice(id, false, 'pointer');
    expect(byId(id).running).toBe(true);
    // letting go twice, or of a hold it never had, changes nothing
    holdNotice(id, false, 'focus');
    expect(byId(id).running).toBe(true);
  });

  it('stops a notification while it is held and goes on with the time it had', () => {
    const id = notify({ tone: 'info', title: 'Generating', ms: 1000 });
    vi.advanceTimersByTime(600);
    holdNotice(id, true);
    expect(byId(id).running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(byId(id).leaving).toBe(false);
    holdNotice(id, false);
    vi.advanceTimersByTime(399);
    expect(byId(id).leaving).toBe(false);
    vi.advanceTimersByTime(1);
    expect(byId(id).leaving).toBe(true);
  });

  it('routes a click by type, unless the notification has its own; then it goes', () => {
    const opened: string[] = [];
    setNotificationRoutes({ error: (n) => opened.push(`error:${n.title}`) });
    const e = notify({ tone: 'error', title: 'Upload failed' });
    const own = notify({ tone: 'error', title: 'Mine', onClick: () => opened.push('own') });
    const plain = notify({ tone: 'info', title: 'Nothing to open' });
    expect(clickTarget(byId(plain))).toBeNull();
    clickTarget(byId(own))!();
    clickTarget(byId(e))!();
    expect(opened).toEqual(['own', 'error:Upload failed']);
    expect(byId(e).leaving && byId(own).leaving).toBe(true);
  });

  it('holding one notification leaves the rest of its stack alone', () => {
    const a = notify({ tone: 'error', title: 'A', ms: 1000 });
    const b = notify({ tone: 'error', title: 'B', ms: 1000 });
    holdNotice(a, true); // the one under it, not the front
    expect(byId(b).running).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(byId(b).leaving).toBe(true);
    // a is in front now, but still held: it waits.
    expect(byId(a).running).toBe(false);
    holdNotice(a, false);
    expect(byId(a).running).toBe(true);
  });

  it('closes on request, and the next comes forward', () => {
    const a = notify({ tone: 'warning', title: 'A' });
    const b = notify({ tone: 'warning', title: 'B' });
    dismiss(b);
    expect(byId(a).running).toBe(true);
  });
});

describe('identical notifications, clear all, timestamps', () => {
  it('counts an identical notification on the open one, brings it forward and restarts its time', () => {
    const a = notify({ tone: 'error', title: 'Upload failed', description: 'Too big', ms: 1000 });
    const other = notify({ tone: 'error', title: 'Upload failed', description: 'Different' });
    vi.advanceTimersByTime(800);
    const again = notify({ tone: 'error', title: 'Upload failed', description: 'Too big', ms: 1000 });
    expect(again).toBe(a);
    expect(byId(a).count).toBe(2);
    expect(current()[0].id).toBe(a);
    expect(byId(other).count).toBe(1);
    vi.advanceTimersByTime(999);
    expect(byId(a).leaving).toBe(false);
  });

  it('clears a whole stack and leaves the others', () => {
    notify({ tone: 'error', title: 'A' });
    notify({ tone: 'error', title: 'B' });
    const i = notify({ tone: 'info', title: 'C' });
    dismissAll('error');
    expect(current().filter((n) => n.tone === 'error').every((n) => n.leaving)).toBe(true);
    expect(byId(i).leaving).toBe(false);
  });

  it('says when, the way a person would', () => {
    const now = new Date(2026, 10, 2, 15, 0).getTime();
    expect(whenSaid(now - 10_000, now)).toBe('just now');
    expect(whenSaid(now - 4 * 60_000, now)).toBe('4 min ago');
    expect(whenSaid(now - 2 * 3600_000, now)).toBe('2 h ago');
    expect(whenSaid(new Date(2026, 10, 1, 14, 5).getTime(), now, 'en-GB')).toBe('yesterday 14:05');
    expect(whenSaid(new Date(2026, 9, 1).getTime(), now, 'en-GB')).toBe('1 Oct 2026');
  });
});

describe('opened stacks', () => {
  it('counts down every notification on show in an opened stack, except the held one', () => {
    const ids = [1, 2, 3, 4].map((i) => notify({ tone: 'success', title: `L${i}` }));
    showStack('success', 3);
    const running = current().filter((n) => n.running).map((n) => n.title);
    expect(running).toEqual(['L4', 'L3', 'L2']);
    holdNotice(ids[2], true);
    expect(current().filter((n) => n.running).map((n) => n.title)).toEqual(['L4', 'L2']);
    showStack('success', 1);
    expect(current().filter((n) => n.running).map((n) => n.title)).toEqual(['L4']);
  });
});
