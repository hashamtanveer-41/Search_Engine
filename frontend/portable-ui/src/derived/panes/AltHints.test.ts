// Which key each pane shows while Alt is held (AltHints.tsx focusTargets).
import { describe, expect, it } from 'vitest';
import { focusTargets } from './AltHints';
import type { Geometry } from './geometry';
import { activatePane, emptyLayout, openPane, stacks, unitRects, type Layout } from './model';

/** A layout: two columns of two, and a tall one on the right; the top middle one
 *  active. Its panes, by name. */
function grid(): { layout: Layout; id: Record<string, string> } {
  const id: Record<string, string> = {};
  let l = emptyLayout();
  const open = (name: string, target?: Parameters<typeof openPane>[3]) => { const r = openPane(l, name, name, target); l = r.layout; id[name] = r.paneId; };
  const stackOf = (name: string) => stacks(l.root).find((s) => s.panes.includes(id[name]))!.id;
  open('working');
  open('planning', { kind: 'beside', nodeId: stackOf('working'), side: 'right', share: 2 / 3 });
  open('what', { kind: 'beside', nodeId: stackOf('planning'), side: 'right', share: 1 / 2 });
  open('qualities', { kind: 'beside', nodeId: stackOf('working'), side: 'bottom', share: 0.5 });
  open('shipping', { kind: 'beside', nodeId: stackOf('planning'), side: 'bottom', share: 0.5 });
  return { layout: activatePane(l, id.planning).layout, id };
}

/** The cards where the layout puts them, in a 1200 by 800 area. */
function geometryOf(l: Layout): Geometry {
  const ids = new Set(stacks(l.root).map((s) => s.id));
  const boxes = [...unitRects(l.root)].filter(([id]) => ids.has(id)).map(([id, r]) => [id, { card: { x: r.x * 1200, y: r.y * 800, w: r.w * 1200, h: r.h * 800 } }] as const);
  return { stacks: new Map(boxes) } as unknown as Geometry;
}

describe('the keys drawn while Alt is held', () => {
  it('puts each arrow on the pane that way, and [ ] on the ones before and after in reading order that no arrow reaches', () => {
    const { layout, id } = grid();
    const byId = focusTargets(layout, geometryOf(layout));
    const key = (name: string) => byId.get(id[name]);
    expect([key('working'), key('what'), key('shipping')]).toEqual(['←', '→', '↓']);
    // the panes before and after it in reading order are the ones beside it: no [ or ]
    expect([...byId.values()]).not.toContain('[');
    expect([...byId.values()]).not.toContain(']');
  });

  it('reading order goes along the rows of the grid: from the bottom left, the one before is the top right, which no arrow reaches', () => {
    const { layout: l, id } = grid();
    const layout = activatePane(l, id.qualities).layout;
    const byId = focusTargets(layout, geometryOf(layout));
    const key = (name: string) => byId.get(id[name]);
    expect([key('working'), key('shipping')]).toEqual(['↑', '→']);
    expect(key('what')).toBe('[');
  });
});
