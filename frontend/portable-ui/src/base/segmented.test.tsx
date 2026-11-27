import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Segmented, SegmentedItem } from './segmented';
import { Tabs, TabsList, TabsTrigger } from './tabs';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** jsdom lays nothing out: each item 80px wide, side by side from 3px in, in a row 246px wide. */
function layOut(slot: string) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.slot === slot ? 80 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === slot ? 3 + 80 * [...this.parentElement!.querySelectorAll(`[data-slot="${slot}"]`)].indexOf(this) : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.querySelector(`[data-slot="${slot}"]`) ? 246 : 0; });
}

const item = (name: RegExp | string) => screen.getByRole('radio', { name });
const chosen = () => screen.getAllByRole('radio').filter((r) => r.dataset.state === 'on').map((r) => r.textContent);

function View({ onChange }: { onChange?: (v: string) => void }) {
  const [view, setView] = useState('lesson');
  return (
    <Segmented aria-label="View" value={view} onValueChange={(v) => { setView(v); onChange?.(v); }}>
      <SegmentedItem value="lesson">As readers see it</SegmentedItem>
      <SegmentedItem value="text">Text and comments</SegmentedItem>
      <SegmentedItem value="flagged" count={3}>Flagged</SegmentedItem>
    </Segmented>
  );
}

describe('Segmented', () => {
  it('chooses the item pressed', () => {
    const onChange = vi.fn();
    render(<View onChange={onChange} />);
    expect(chosen()).toEqual(['As readers see it']);
    fireEvent.click(item('Text and comments'));
    expect(chosen()).toEqual(['Text and comments']);
    expect(onChange).toHaveBeenCalledWith('text');
  });

  it('cannot be emptied: pressing the chosen item again keeps it', () => {
    const onChange = vi.fn();
    render(<View onChange={onChange} />);
    fireEvent.click(item('As readers see it'));
    expect(chosen()).toEqual(['As readers see it']);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps its own choice when uncontrolled, and still cannot be emptied', () => {
    render(
      <Segmented aria-label="Period" defaultValue="week">
        <SegmentedItem value="week">Week</SegmentedItem><SegmentedItem value="term">Term</SegmentedItem>
      </Segmented>,
    );
    fireEvent.click(item('Term'));
    expect(chosen()).toEqual(['Term']);
    fireEvent.click(item('Term'));
    expect(chosen()).toEqual(['Term']);
  });

  it('is never wider than its room: on a narrow screen its items scroll inside it, not the page', () => {
    render(<View />);
    const track = screen.getByRole('radiogroup', { name: 'View' });
    for (const c of ['max-w-full', 'min-w-0', 'overflow-x-auto']) expect(track.className.split(/\s+/)).toContain(c);
  });

  it('shows an item’s count', () => {
    render(<View />);
    expect(item(/Flagged/).querySelector('[data-slot="count"]')!.textContent).toBe('3');
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeTruthy();
  });

  it('raises the chosen item with one sliding pill, placed on it at once', () => {
    layOut('segmented-item');
    render(<Segmented aria-label="Period" defaultValue="term"><SegmentedItem value="week">Week</SegmentedItem><SegmentedItem value="term">Term</SegmentedItem></Segmented>);
    const indicators = screen.getByRole('radiogroup', { name: 'Period' }).querySelectorAll<HTMLElement>('[data-slot="segmented-indicator"]');
    expect(indicators.length).toBe(1);
    expect(indicators[0].style.left).toBe('83px');
    expect(indicators[0].style.right).toBe(`${246 - 83 - 80}px`);
  });

  it('is the tabs\' row: the same track, the same pill', () => {
    render(<><View /><Tabs defaultValue="a"><TabsList aria-label="Tabs"><TabsTrigger value="a">A</TabsTrigger></TabsList></Tabs></>);
    const look = (slot: string) => document.querySelector(`[data-slot="${slot}"]`)!.className;
    expect(look('segmented-indicator')).toBe(look('tabs-indicator'));
    for (const c of ['rounded-lg', 'bg-muted', 'p-[3px]']) {
      expect(look('segmented').split(/\s+/)).toContain(c);
      expect(look('tabs-list').split(/\s+/)).toContain(c);
    }
    // as tall: 36px (the tabs' through their orientation)
    expect(look('segmented').split(/\s+/)).toContain('h-9');
    expect(look('tabs-list').split(/\s+/)).toContain('group-data-[orientation=horizontal]/tabs:h-9');
  });

  it('pressed and dragged along, as the tabs are, chooses the item nearest where it is let go', () => {
    if (typeof PointerEvent === 'undefined' || !('pointerType' in new PointerEvent('pointerdown'))) {
      vi.stubGlobal('PointerEvent', class extends MouseEvent {
        pointerId: number; pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; }
      });
    }
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    HTMLElement.prototype.setPointerCapture = () => undefined;
    layOut('segmented-item');
    const onChange = vi.fn();
    render(<View onChange={onChange} />);
    const track = screen.getByRole('radiogroup', { name: 'View' });
    // pressed on the chosen one (centre 43), dragged past the last one (centre 203), let go there
    fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 43, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 10 });
    frames.splice(0).forEach((cb) => cb(0));
    // while dragged, the pill is under the pointer and nothing is chosen yet
    expect(track.querySelector<HTMLElement>('[data-slot="segmented-indicator"]')!.style.left).toBe('80px');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 230, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 230, clientY: 10 });
    expect(onChange).toHaveBeenCalledWith('flagged');
    expect(chosen()).toEqual(['Flagged3']);
  });
});
