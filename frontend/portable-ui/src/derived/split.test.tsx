// Two panes of one place: side by side, or stacked on a phone; each with its header (its name, its
// buttons, ×); a divider dragged or moved with the keys, never past the least share; the share kept;
// and a press that becomes a drag showing where it drops ("Open beside"), opening it there.
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { Split, SPLIT_MIN, useDragBeside, useSplitShare, type BesideDrag, type SplitOrientation } from './split';
import { PHONE_QUERY } from './panes/Workspace';

function media(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone && query === PHONE_QUERY, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
}

beforeEach(() => {
  // jsdom has no PointerEvent: without one, fired pointer events carry no clientX, pointerId or type.
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; }
  });
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  localStorage.clear();
  media(false);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Harness({ orientation, start = 0.5, onShare, onClose }: { orientation?: SplitOrientation; start?: number; onShare?(s: number): void; onClose?(): void }) {
  const [share, setShare] = React.useState(start);
  return (
    <Split orientation={orientation} share={share} onShareChange={(s) => { setShare(s); onShare?.(s); }}
      panes={[
        { id: 'tasks', title: 'Tasks', onClose, children: <p>The tasks</p> },
        { id: 'timeline', title: 'Timeline', actions: <button type="button">Make it the main page</button>, children: <p>The timeline</p> },
      ]} />
  );
}
const divider = () => screen.getByRole('separator', { name: 'Resize the panes' });
const split = () => document.querySelector<HTMLElement>('[data-slot=split]')!;
/** The split drawn `w` by `h` px at the window's corner. */
const sized = (w: number, h: number) => { split().getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON() {} }); };

describe('Split', () => {
  it('puts the two side by side on a desktop or a tablet, each a region named by its header, with its buttons and ×', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(split().dataset.orientation).toBe('row');
    expect(split().style.gridTemplateColumns).toBe('minmax(0,0.5fr) auto minmax(0,0.5fr)');
    const [tasks, timeline] = screen.getAllByRole('region');
    expect(tasks.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tasks' }).textContent).toContain('The tasks');
    expect(within(timeline).getByRole('button', { name: 'Make it the main page' })).toBeTruthy();
    // Only a pane given onClose has ×.
    expect(within(timeline).queryByRole('button', { name: 'Close Timeline' })).toBeNull();
    fireEvent.click(within(tasks).getByRole('button', { name: 'Close Tasks' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(divider().getAttribute('aria-orientation')).toBe('vertical');
    expect(divider().getAttribute('aria-valuenow')).toBe('50');
    expect(divider().getAttribute('aria-valuetext')).toBe('Tasks 50%, Timeline 50%');
  });

  it('stacks them on a phone, the divider across', () => {
    media(true);
    render(<Harness />);
    expect(split().dataset.orientation).toBe('column');
    expect(split().style.gridTemplateRows).toBe('minmax(0,0.5fr) auto minmax(0,0.5fr)');
    expect(divider().getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('follows the divider as it is dragged, and keeps the share it is let go at', () => {
    const onShare = vi.fn();
    render(<Harness onShare={onShare} />);
    sized(1000, 600);
    fireEvent.pointerDown(divider(), { button: 0, clientX: 500, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: 640, pointerId: 3, buttons: 1 });
    // Live: the panes follow, nothing is kept yet.
    expect(divider().getAttribute('aria-valuenow')).toBe('64');
    expect(split().dataset.resizing).toBeDefined();
    expect(onShare).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 3 });
    expect(onShare).toHaveBeenCalledWith(0.64);
    expect(divider().getAttribute('aria-valuenow')).toBe('64');
    expect(split().dataset.resizing).toBeUndefined();
  });

  it('never gives a pane less than its least share, either way', () => {
    const onShare = vi.fn();
    render(<Harness onShare={onShare} />);
    sized(1000, 600);
    fireEvent.pointerDown(divider(), { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40, pointerId: 1, buttons: 1 });
    expect(divider().getAttribute('aria-valuenow')).toBe(String(SPLIT_MIN * 100));
    fireEvent.pointerMove(window, { clientX: 990, pointerId: 1, buttons: 1 });
    expect(divider().getAttribute('aria-valuenow')).toBe(String(100 - SPLIT_MIN * 100));
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onShare).toHaveBeenLastCalledWith(1 - SPLIT_MIN);
  });

  it('a cancelled drag puts the divider back', () => {
    const onShare = vi.fn();
    render(<Harness onShare={onShare} />);
    sized(1000, 600);
    fireEvent.pointerDown(divider(), { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 600, pointerId: 1, buttons: 1 });
    fireEvent(window, new PointerEvent('pointercancel', { pointerId: 1 }));
    expect(onShare).not.toHaveBeenCalled();
    expect(divider().getAttribute('aria-valuenow')).toBe('50');
  });

  it('a phone’s divider is dragged up and down', () => {
    media(true);
    const onShare = vi.fn();
    render(<Harness onShare={onShare} />);
    sized(390, 800);
    fireEvent.pointerDown(divider(), { button: 0, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 320, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onShare).toHaveBeenCalledWith(0.4);
  });

  it('moves with the arrow keys along its own axis, Home and End to the ends, Enter to even', () => {
    render(<Harness />);
    const d = divider();
    fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(d.getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(d, { key: 'ArrowUp' }); // not this one's axis
    expect(d.getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(d, { key: 'ArrowLeft' });
    fireEvent.keyDown(d, { key: 'ArrowLeft' });
    expect(d.getAttribute('aria-valuenow')).toBe('45');
    fireEvent.keyDown(d, { key: 'Home' });
    expect(d.getAttribute('aria-valuenow')).toBe('30');
    fireEvent.keyDown(d, { key: 'ArrowLeft' });
    expect(d.getAttribute('aria-valuenow')).toBe('30');
    fireEvent.keyDown(d, { key: 'End' });
    expect(d.getAttribute('aria-valuenow')).toBe('70');
    fireEvent.keyDown(d, { key: 'Enter' });
    expect(d.getAttribute('aria-valuenow')).toBe('50');
  });

  it('stacked, ↑ and ↓ move it', () => {
    render(<Harness orientation="column" />);
    fireEvent.keyDown(divider(), { key: 'ArrowDown' });
    expect(divider().getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    expect(divider().getAttribute('aria-valuenow')).toBe('55');
  });

  it('a double-click shares it evenly', () => {
    render(<Harness start={0.66} />);
    fireEvent.doubleClick(divider());
    expect(divider().getAttribute('aria-valuenow')).toBe('50');
  });
});

describe('useSplitShare', () => {
  it('starts even, keeps a choice in this browser (held to the least share), and reads it back', () => {
    const { result } = renderHook(() => useSplitShare('k'));
    expect(result.current[0]).toBe(0.5);
    act(() => result.current[1](0.62));
    expect(result.current[0]).toBe(0.62);
    expect(localStorage.getItem('k')).toBe('0.620');
    act(() => result.current[1](0.05));
    expect(result.current[0]).toBe(SPLIT_MIN);
    expect(renderHook(() => useSplitShare('k')).result.current[0]).toBe(SPLIT_MIN);
    localStorage.setItem('k', 'nonsense');
    expect(renderHook(() => useSplitShare('k')).result.current[0]).toBe(0.5);
  });
});

describe('useDragBeside', () => {
  function Dragging({ drag, orientation = 'row', onHold, leave }: { drag: Partial<BesideDrag>; orientation?: SplitOrientation; onHold?(): void; leave?: { from(): Element | null; onLeave(): void } }) {
    const [start, overlay] = useDragBeside({ area: () => document.getElementById('page'), orientation, onHold, leave });
    return (
      <>
        <nav id="side"><a href="#journal" onPointerDown={(e) => start(e, { title: 'Journal', label: 'Open beside', onDrop: () => undefined, ...drag })}>Journal</a></nav>
        <main id="page">The page</main>
        {overlay}
      </>
    );
  }
  const box = (id: string, left: number, top: number, w: number, h: number) => {
    document.getElementById(id)!.getBoundingClientRect = () => ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON() {} });
  };
  const link = () => screen.getByRole('link', { name: 'Journal' });
  const zone = () => document.querySelector<HTMLElement>('[data-slot=split-drop]');

  it('a press that moves past a few px is a drag: the far half says “Open beside”, lit while over it, and a drop opens it', () => {
    const onDrop = vi.fn();
    render(<Dragging drag={{ onDrop }} />);
    box('page', 272, 44, 1000, 800);
    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 102, clientY: 201, pointerId: 1, buttons: 1 });
    expect(zone()).toBeNull(); // not past the threshold yet
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300, pointerId: 1, buttons: 1 });
    expect(zone()!.textContent).toBe('Open beside');
    // The right half of the page.
    expect(zone()!.style.left).toBe('772px');
    expect(zone()!.style.width).toBe('500px');
    expect(zone()!.dataset.over).toBeUndefined();
    expect(document.querySelector('[data-slot=split-ghost]')!.textContent).toBe('Journal');
    fireEvent.pointerMove(window, { clientX: 900, clientY: 300, pointerId: 1, buttons: 1 });
    expect(zone()!.dataset.over).toBe('true');
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDrop).toHaveBeenCalledOnce();
    expect(zone()).toBeNull();
    // The click that ends the drag does not follow the link.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link().dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('let go outside the zone, or Escape, opens nothing; a plain click stays a click', () => {
    const onDrop = vi.fn();
    render(<Dragging drag={{ onDrop }} />);
    box('page', 272, 44, 1000, 800);
    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDrop).not.toHaveBeenCalled();

    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 900, clientY: 300, pointerId: 2, buttons: 1 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(zone()).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(onDrop).not.toHaveBeenCalled();

    return new Promise<void>((done) => setTimeout(() => {
      fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 3 });
      fireEvent.pointerUp(window, { pointerId: 3 });
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link().dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
      done();
    }, 5));
  });

  it('on a phone the zone is the bottom half; one that cannot be beside takes the whole page', () => {
    const { unmount } = render(<Dragging drag={{}} orientation="column" />);
    box('page', 0, 44, 390, 800);
    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300, pointerId: 1, buttons: 1 });
    expect([zone()!.style.top, zone()!.style.height]).toEqual(['444px', '400px']);
    fireEvent.keyDown(window, { key: 'Escape' });
    unmount();

    render(<Dragging drag={{ whole: true, label: 'Open Team' }} />);
    box('page', 272, 44, 1000, 800);
    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300, pointerId: 1, buttons: 1 });
    expect([zone()!.style.left, zone()!.style.width, zone()!.textContent]).toEqual(['272px', '1000px', 'Open Team']);
    expect(zone()!.dataset.over).toBe('true');
  });

  it('a finger drags after a hold (moving first is a scroll), and the menu it came from is told', () => {
    vi.useFakeTimers();
    const onHold = vi.fn();
    render(<Dragging drag={{}} onHold={onHold} />);
    box('page', 0, 44, 800, 900);
    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 230, pointerId: 1, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(zone()).toBeNull();
    expect(onHold).not.toHaveBeenCalled();

    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 2, pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onHold).toHaveBeenCalledOnce();
    expect(zone()).not.toBeNull();
  });

  it('says so once when the pointer leaves where it started', () => {
    const onLeave = vi.fn();
    render(<Dragging drag={{}} leave={{ from: () => document.getElementById('side'), onLeave }} />);
    box('page', 272, 44, 1000, 800);
    box('side', 0, 0, 272, 900);
    fireEvent.pointerDown(link(), { button: 0, clientX: 100, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 220, pointerId: 1, buttons: 1 });
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 400, clientY: 220, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 220, pointerId: 1, buttons: 1 });
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
