// Gestures on the library's springs: what a drag decides once it is let go. The drags here are
// slow ones (events far apart), so a release carries no speed: these are the "let go gently" cases,
// where the position alone decides (the speed cases are in lib/motion.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Switch } from './switch';

/** A pointer event at `at` ms: far enough apart that the drag is a slow one. */
const ev = (type: string, init: MouseEventInit, at: number) => {
  const e = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(e, 'timeStamp', { value: at });
  return e;
};
/** A drag in four steps `step` ms apart (300: slow; 10: a flick), let go at once after the last. */
const drag = (el: Element, from: { x: number; y: number }, to: { x: number; y: number }, step = 300) => {
  act(() => { el.dispatchEvent(ev('pointerdown', { button: 0, clientX: from.x, clientY: from.y }, 1000)); });
  act(() => {
    for (let i = 1; i <= 4; i++) {
      window.dispatchEvent(ev('pointermove', { clientX: from.x + ((to.x - from.x) * i) / 4, clientY: from.y + ((to.y - from.y) * i) / 4 }, 1000 + i * step));
    }
  });
  act(() => { window.dispatchEvent(ev('pointerup', { clientX: to.x, clientY: to.y }, 1000 + 4 * step + 1)); });
};

beforeEach(() => {
  // A sheet 300px wide, a switch 32px wide with a 16px knob.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === 'sheet-content' ? 300 : this.dataset.slot === 'switch-thumb' ? 16 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === 'switch' ? 32 : 0;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('a sheet', () => {
  const open = (onOpenChange = vi.fn()) => {
    render(<Sheet open onOpenChange={onOpenChange}><SheetContent side="right"><SheetTitle>Sources</SheetTitle></SheetContent></Sheet>);
    return { onOpenChange, sheet: document.querySelector('[data-slot="sheet-content"]')! };
  };

  it('dragged a little toward its edge and let go, stays open', () => {
    const { onOpenChange, sheet } = open();
    drag(sheet, { x: 100, y: 200 }, { x: 160, y: 200 });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('dragged most of the way out and let go, closes', () => {
    const { onOpenChange, sheet } = open();
    drag(sheet, { x: 100, y: 200 }, { x: 300, y: 200 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('flicked a little way toward its edge, closes: the speed carries it', () => {
    const { onOpenChange, sheet } = open();
    drag(sheet, { x: 100, y: 200 }, { x: 160, y: 200 }, 10);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dragged up and down instead, leaves the page to scroll', () => {
    const { onOpenChange, sheet } = open();
    drag(sheet, { x: 100, y: 200 }, { x: 110, y: 400 });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('a switch', () => {
  it('dragged across, flips; dragged a little, does not', () => {
    vi.useFakeTimers();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Show progress" onCheckedChange={onCheckedChange} />);
    const knob = screen.getByRole('switch');
    drag(knob, { x: 4, y: 8 }, { x: 6, y: 8 });
    act(() => { vi.runAllTimers(); });
    expect(onCheckedChange).not.toHaveBeenCalled();
    drag(knob, { x: 4, y: 8 }, { x: 30, y: 8 });
    act(() => { vi.runAllTimers(); });
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('pressed, flips as before', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Show progress" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
