// The thing under the pointer while a tab is held: the pill saying what the drop does, with the map
// of the layout it leaves when the other groups move; or just the pane's name.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { dropLine, Ghost } from './DragOverlay';
import { computeGeometry, REST } from './geometry';
import { emptyLayout, openPane, stacks } from './model';
import { dragStore } from './dragStore';
import type { DropPlan } from './zones';

const area = { x: 0, y: 0, w: 1200, h: 800 };
const plan = (over: Partial<DropPlan> = {}): DropPlan => ({
  key: 'centre:s2', target: { kind: 'stack', stackId: 's2' }, zone: area, label: 'Add as a tab of “Beta”', preview: null, noop: false,
  after: { area, boxes: [{ id: 's1', rect: { x: 0, y: 0, w: 588, h: 800 }, mine: false }, { id: 's2', rect: { x: 612, y: 0, w: 588, h: 800 }, mine: true }] },
  ...over,
});

afterEach(() => { cleanup(); act(() => dragStore.reset()); });

describe('the line a drop goes into', () => {
  it('a divider: a line along it, centred on it; a window edge: a line inside that edge; a group: none', () => {
    let l = openPane(emptyLayout(), 'a', 'A').layout;
    l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
    const geo = computeGeometry(l.root, area, REST);
    const [a, b] = stacks(l.root).map((s) => s.id);
    const gap = geo.gaps[0].rect;
    const line = dropLine({ kind: 'gap', axis: 'row', before: a, after: b }, geo)!;
    expect(line.w).toBe(3);
    expect(line.x + line.w / 2).toBeCloseTo(gap.x + gap.w / 2, 5);
    expect(line.h).toBe(gap.h);
    expect(dropLine({ kind: 'edge', side: 'right' }, geo)).toEqual({ x: 1197, y: 0, w: 3, h: 800 });
    expect(dropLine({ kind: 'stack', stackId: a }, geo)).toBeNull();
  });
});

describe('the ghost', () => {
  it('over a drop that moves the other groups: the map, the dragged pane’s group marked, above the pill', () => {
    const { container } = render(<Ghost refEl={() => undefined} />);
    act(() => dragStore.set({ held: true, title: 'Gamma', plan: plan() }));
    const ghost = container.querySelector('.ghost')!;
    const rects = [...ghost.querySelectorAll('svg rect')];
    expect(rects.map((r) => r.hasAttribute('data-mine'))).toEqual([false, true]);
    expect(ghost.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1200 800');
    expect([...ghost.children].map((c) => c.className)).toEqual(['ghost-map-frame', 'ghost-pill']);
    expect(ghost.querySelector('.ghost-pill')!.textContent).toBe('Add as a tab of “Beta”');
  });

  it('a plan given no map: the pill alone', () => {
    const { container } = render(<Ghost refEl={() => undefined} />);
    act(() => dragStore.set({ held: true, title: 'Gamma', plan: plan({ after: undefined }) }));
    expect(container.querySelector('.ghost svg')).toBeNull();
    expect(container.querySelector('.ghost-pill')!.getAttribute('data-state')).toBe('ok');
  });

  it('a refusal says why, in the danger pill, with no map', () => {
    const { container } = render(<Ghost refEl={() => undefined} />);
    act(() => dragStore.set({ held: true, title: 'Gamma', plan: plan({ refused: 'Too small', after: undefined }) }));
    expect(container.querySelector('.ghost svg')).toBeNull();
    const pill = container.querySelector('.ghost-pill')!;
    expect([pill.textContent, pill.getAttribute('data-state')]).toEqual(['Too small', 'refused']);
  });

  it('over nothing: just the pane’s name', () => {
    const { container } = render(<Ghost refEl={() => undefined} />);
    act(() => dragStore.set({ held: true, title: 'Gamma', plan: null }));
    expect(container.querySelector('.ghost-pill')).toBeNull();
    expect(container.querySelector('.ghost')!.textContent).toBe('Gamma');
  });
});
