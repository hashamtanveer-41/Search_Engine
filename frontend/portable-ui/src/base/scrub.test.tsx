// The shared scrub (scrub.ts) with a finger: a sideways row follows a sideways move at once and
// leaves an up or down one to the page; along a scroll, a finger held still takes it; a tap
// chooses; a long press opens no menu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { HOLD, useScrub, type ScrubAxis } from './scrub';

/** Three stops, 10, 50 and 90 px along the row. */
function Row({ axis, onPick, onDrag }: { axis: ScrubAxis; onPick(i: number): void; onDrag(x: number | null): void }) {
  const scrub = useScrub({ axis, stops: () => [10, 50, 90], onPick, onDrag });
  return <div data-testid="row" onPointerDown={scrub.onPointerDown} />;
}

const row = () => document.querySelector<HTMLElement>('[data-testid=row]')!;
const at = (axis: ScrubAxis, along: number, across = 100) => (axis === 'x' ? { clientX: along, clientY: across } : { clientX: across, clientY: along });
const down = (axis: ScrubAxis, along: number) => fireEvent.pointerDown(row(), { button: 0, pointerId: 7, pointerType: 'touch', ...at(axis, along) });
const move = (axis: ScrubAxis, along: number, across = 100) => fireEvent.pointerMove(window, { pointerId: 7, pointerType: 'touch', ...at(axis, along, across) });
/** Runs the frames asked for since the last one, as a browser would. */
let queued: FrameRequestCallback[] = [];
const frame = () => { const run = queued; queued = []; run.forEach((cb) => cb(0)); };
const up = (axis: ScrubAxis, along: number) => fireEvent.pointerUp(window, { pointerId: 7, pointerType: 'touch', ...at(axis, along) });

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no PointerEvent: without one, fired pointer events carry no pointerId or pointerType.
  if (typeof PointerEvent === 'undefined' || !('pointerType' in new PointerEvent('pointerdown'))) {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerId: number; pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; }
    });
  }
  queued = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { queued = []; });
  HTMLElement.prototype.setPointerCapture = () => undefined;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the scrub, with a finger', () => {
  it('across the page\'s scroll (tabs), a sideways move is the scrub\'s at once: it follows the finger, and the stop let go nearest is chosen', () => {
    const onPick = vi.fn(), onDrag = vi.fn();
    render(<Row axis="x" onPick={onPick} onDrag={onDrag} />);
    down('x', 10);
    // a press alone chooses nothing yet: it may be the start of a scroll
    expect(onPick).not.toHaveBeenCalled();
    move('x', 20);
    expect(onPick).toHaveBeenLastCalledWith(0);
    move('x', 70);
    frame();
    expect(onDrag).toHaveBeenLastCalledWith(70);
    up('x', 85);
    expect(onPick).toHaveBeenLastCalledWith(2);
    expect(onDrag).toHaveBeenLastCalledWith(null);
  });

  it('an up or down move on a sideways row is the page\'s scroll: nothing is chosen', () => {
    const onPick = vi.fn(), onDrag = vi.fn();
    render(<Row axis="x" onPick={onPick} onDrag={onDrag} />);
    down('x', 10);
    move('x', 12, 140);
    move('x', 60, 200);
    up('x', 60);
    expect(onPick).not.toHaveBeenCalled();
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('along a scroll (a listing\'s lines), a move before the finger has been held is the scroll\'s', () => {
    const onPick = vi.fn(), onDrag = vi.fn();
    render(<Row axis="y" onPick={onPick} onDrag={onDrag} />);
    down('y', 10);
    vi.advanceTimersByTime(HOLD / 2);
    move('y', 40);
    vi.advanceTimersByTime(HOLD);
    up('y', 40);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('along a scroll, a finger held still takes it: its moves are no longer a scroll, and it chooses where it is let go', () => {
    const onPick = vi.fn(), onDrag = vi.fn();
    render(<Row axis="y" onPick={onPick} onDrag={onDrag} />);
    down('y', 52);
    vi.advanceTimersByTime(HOLD);
    expect(onPick).toHaveBeenLastCalledWith(1);
    const touchmove = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(touchmove);
    expect(touchmove.defaultPrevented).toBe(true);
    move('y', 88);
    frame();
    expect(onDrag).toHaveBeenLastCalledWith(88);
    up('y', 88);
    expect(onPick).toHaveBeenLastCalledWith(2);
    // let go, the page scrolls again
    const after = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('a tap chooses the stop under it', () => {
    const onPick = vi.fn(), onDrag = vi.fn();
    render(<Row axis="x" onPick={onPick} onDrag={onDrag} />);
    down('x', 48);
    up('x', 49);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith(1);
  });

  it('a long press opens no context menu and selects no text, while the finger is down only', () => {
    render(<Row axis="y" onPick={vi.fn()} onDrag={vi.fn()} />);
    down('y', 10);
    const menu = new Event('contextmenu', { cancelable: true });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const select = new Event('selectstart', { cancelable: true });
    document.dispatchEvent(select);
    expect(select.defaultPrevented).toBe(true);
    up('y', 10);
    const later = new Event('contextmenu', { cancelable: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('a mouse still chooses on press, as before', () => {
    const onPick = vi.fn();
    render(<Row axis="x" onPick={onPick} onDrag={vi.fn()} />);
    fireEvent.pointerDown(row(), { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 88, clientY: 0 });
    expect(onPick).toHaveBeenLastCalledWith(2);
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 88, clientY: 0 });
  });
});
