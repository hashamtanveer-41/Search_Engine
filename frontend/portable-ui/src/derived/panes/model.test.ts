import { describe, expect, it } from 'vitest';
import {
  activatePane,
  canCollapse,
  closePane,
  collapseNode,
  emptyLayout,
  equalize,
  expandAll,
  expandNode,
  findStackOf,
  foldedAround,
  foldedNodes,
  fromTree,
  keepPane,
  migrateLayout,
  moveLine,
  movePane,
  neighbourStack,
  normalize,
  openPane,
  OpError,
  readingOrder,
  reopenPane,
  retargetPane,
  runs,
  shownOrder,
  stacks,
  stretchOf,
  unitRects,
  validate,
  type GridNode,
  type Layout,
} from './model';

/** Opens panes one after another; `at(l, ids)` says where each goes (default: a tab of the active group). */
function build(...steps: [string, ((l: Layout, ids: string[]) => Parameters<typeof openPane>[3])?][]) {
  let l = emptyLayout();
  const ids: string[] = [];
  for (const [title, at] of steps) {
    const r = openPane(l, title, title, at?.(l, ids));
    l = r.layout;
    ids.push(r.paneId);
  }
  return { l, ids };
}
const groupOf = (l: Layout, id: string) => findStackOf(l.root, id)!.id;
const cols = (l: Layout) => l.root!.cols.map((t) => +t.size.toFixed(4));
const rows = (l: Layout) => l.root!.rows.map((t) => +t.size.toFixed(4));
const width = (l: Layout, id: string) => +unitRects(l.root).get(groupOf(l, id))!.w.toFixed(4);
/** The column lines set to these sizes, left to right. */
function setCols(l: Layout, sizes: number[]) {
  let at = 0;
  sizes.slice(0, -1).forEach((s, i) => { at += s; l = moveLine(l, 'row', i + 1, at).layout; });
  return l;
}
/** Three groups side by side: [a | b | c]. */
const three = () =>
  build(['a'], ['b', (l, ids) => ({ kind: 'beside', nodeId: groupOf(l, ids[0]), side: 'right', share: 0.5 })], [
    'c',
    (l, ids) => ({ kind: 'beside', nodeId: groupOf(l, ids[1]), side: 'right', share: 0.5 }),
  ]);
/** Four groups in two rows: [A | B] over [C | D], the second row split after the first. */
const twoByTwo = (shareB = 0.5, shareD = 0.5) =>
  build(
    ['A'],
    ['C', (l, ids) => ({ kind: 'beside', nodeId: groupOf(l, ids[0]), side: 'bottom', share: 0.5 })],
    ['B', (l, ids) => ({ kind: 'beside', nodeId: groupOf(l, ids[0]), side: 'right', share: shareB })],
    ['D', (l, ids) => ({ kind: 'beside', nodeId: groupOf(l, ids[1]), side: 'right', share: shareD })],
  );
/** A layout: [ (A | B) over (C | D) ] beside E, all on one grid. */
function sixUp() {
  let l = emptyLayout();
  const id: Record<string, string> = {};
  const open = (name: string, target?: Parameters<typeof openPane>[3]) => { const r = openPane(l, name, name, target); l = r.layout; id[name] = r.paneId; };
  const g = (name: string) => groupOf(l, id[name]);
  open('A');
  open('C', { kind: 'beside', nodeId: g('A'), side: 'bottom', share: 0.5 });
  open('E', { kind: 'edge', side: 'right', share: 0.5 });
  open('B', { kind: 'beside', nodeId: g('A'), side: 'right', share: 0.3 });
  open('D', { kind: 'beside', nodeId: g('C'), side: 'right', share: 0.3 });
  return { l, id };
}

describe('invariants', () => {
  it('a layout from any operation is valid', () => {
    expect(validate(three().l)).toEqual([]);
    expect(validate(twoByTwo().l)).toEqual([]);
    expect(validate(sixUp().l)).toEqual([]);
  });

  it('a line no group has an edge on goes, and so does a track of no size', () => {
    const grid: GridNode = {
      type: 'grid', id: 'grid', cols: [{ size: 0.5 }, { size: 0.25 }, { size: 0 }, { size: 0.25 }], rows: [{ size: 1 }],
      groups: [
        { type: 'stack', id: 'g1', panes: ['a'], active: 'a', c0: 0, c1: 2, r0: 0, r1: 1 },
        { type: 'stack', id: 'g2', panes: ['b'], active: 'b', c0: 2, c1: 4, r0: 0, r1: 1 },
      ],
    };
    const n = normalize(grid)!;
    expect(n.cols.map((t) => t.size)).toEqual([0.75, 0.25]);
    expect(n.groups.map((g) => [g.c0, g.c1])).toEqual([[0, 1], [1, 2]]);
  });

  it('validate names a broken saved layout instead of loading it', () => {
    const bad = {
      root: {
        type: 'grid', id: 'grid', cols: [{ size: 1 }], rows: [{ size: 1 }],
        groups: [
          { type: 'stack', id: 'g1', panes: ['a', 'a'], active: 'a', c0: 0, c1: 1, r0: 0, r1: 1 },
          { type: 'stack', id: 'g2', panes: ['b'], active: 'b', c0: 0, c1: 1, r0: 0, r1: 1 },
        ],
      },
      panes: { a: { id: 'a', kind: 'x', title: 'x' }, b: { id: 'b', kind: 'x', title: 'x' } }, activePane: 'a', nextId: 2,
    } as Layout;
    expect(validate(bad)).toContain('pane a appears twice');
    expect(validate(bad)).toContain('cell 0,0 is in two groups');
  });
});

describe('opening', () => {
  it('opens as a tab of the active group by default', () => {
    const { l, ids } = build(['a'], ['b']);
    expect(stacks(l.root)).toHaveLength(1);
    expect(findStackOf(l.root, ids[1])!.panes).toEqual(ids);
  });

  it('a beside share is clamped to 15–85%', () => {
    const { l } = build(['a'], ['b', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'right', share: 0.99 })]);
    expect(cols(l)[1]).toBeCloseTo(0.85);
  });

  it('a pane dropped in a divider takes a third of each neighbour', () => {
    const { l, ids } = build(['a'], ['b', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'right', share: 0.5 })]);
    const r = openPane(l, 'c', 'c', { kind: 'gap', axis: 'row', before: groupOf(l, ids[0]), after: groupOf(l, ids[1]) });
    expect(cols(r.layout)).toEqual([0.3333, 0.3333, 0.3333]);
  });

  it('a split uses a line already inside the group, so its edge lines up with the grid', () => {
    // A spans both columns of the row under it; split, its new edge is that row's line, not one beside it.
    const { l, ids } = build(
      ['A'],
      ['C', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'bottom', share: 0.5 })],
      ['D', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[1]), side: 'right', share: 0.45 })],
      ['B', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'right', share: 0.5 })],
    );
    expect(cols(l)).toEqual([0.55, 0.45]);
    expect(width(l, ids[0])).toBe(width(l, ids[1]));
    expect(runs(l.root).filter((r) => r.axis === 'row')).toHaveLength(1);
  });

  it('refuses a split that would make a pane smaller than 12% of the window', () => {
    const { l: l0, ids } = three();
    const l = setCols(l0, [0.15, 0.7, 0.15]);
    expect(() => openPane(l, 'd', 'd', { kind: 'beside', nodeId: groupOf(l, ids[0]), side: 'left', share: 0.5 })).toThrow(/smaller than 12%/);
  });

  it('refuses more columns than the window holds', () => {
    let { l, ids } = build(['a']);
    let last = ids[0];
    let error: unknown = null;
    for (let i = 0; i < 5; i++) {
      try {
        const r = openPane(l, 'x', 'x', { kind: 'beside', nodeId: groupOf(l, last), side: 'right', share: 0.5 }, { limits: { minShare: 0, maxTracks: 3 } });
        l = r.layout;
        last = r.paneId;
      } catch (e) {
        error = e;
        break;
      }
    }
    expect(error).toBeInstanceOf(OpError);
    expect((error as OpError).code).toBe('too-many');
  });
});

describe('lines: dividers that line up are one line', () => {
  it('a grid of four has one upright line through both rows, and moving it moves both', () => {
    const { l, ids } = twoByTwo();
    expect(cols(l)).toEqual([0.5, 0.5]);
    const upright = runs(l.root).filter((r) => r.axis === 'row');
    expect(upright).toHaveLength(1);
    expect([upright[0].from, upright[0].to]).toEqual([0, 2]);
    const moved = moveLine(l, 'row', 1, 0.3).layout;
    expect([width(moved, ids[0]), width(moved, ids[1])]).toEqual([0.3, 0.3]);
  });

  it('with Alt only the stretch pulled moves: the line becomes two', () => {
    const { l, ids } = twoByTwo();
    const only = new Set([groupOf(l, ids[0]), groupOf(l, ids[2])]);
    const moved = moveLine(l, 'row', 1, 0.3, undefined, only).layout;
    expect(width(moved, ids[0])).toBe(0.3);
    expect(width(moved, ids[1])).toBe(0.5);
    expect(cols(moved)).toEqual([0.3, 0.2, 0.5]);
  });

  it('Alt takes the stretch under the pointer, as far along as the groups there reach', () => {
    const { l, ids } = twoByTwo();
    const top = stretchOf(l.root!, 'row', 1, 0);
    expect(top).toEqual(new Set([groupOf(l, ids[0]), groupOf(l, ids[2])]));
    // a group across both rows on one side takes both rows' with it
    const tall = build(
      ['A'],
      ['B', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'right', share: 0.5 })],
      ['D', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[1]), side: 'bottom', share: 0.5 })],
    );
    expect(stretchOf(tall.l.root!, 'row', 1, 0).size).toBe(3);
  });

  it('a line let go on another is the same line from then on', () => {
    const { l, ids } = twoByTwo(0.75, 0.5); // A | B at 0.25, C | D at 0.5
    expect(cols(l)).toEqual([0.25, 0.25, 0.5]);
    const met = moveLine(l, 'row', 1, l.root!.cols[0].size + l.root!.cols[1].size).layout;
    expect(cols(met)).toEqual([0.5, 0.5]);
    const both = moveLine(met, 'row', 1, 0.4).layout;
    expect([width(both, ids[0]), width(both, ids[1])]).toEqual([0.4, 0.4]);
  });

  it('a line passes another it shares no group with', () => {
    const { l, ids } = twoByTwo(0.75, 0.5); // A | B at 0.25, C | D at 0.5
    const passed = moveLine(l, 'row', 1, 0.7).layout;
    expect(validate(passed)).toEqual([]);
    expect([width(passed, ids[0]), width(passed, ids[1])]).toEqual([0.7, 0.5]);
    expect(cols(passed)).toEqual([0.5, 0.2, 0.3]);
  });

  it('a line that would make a pane too small is refused', () => {
    const { l } = three();
    expect(() => moveLine(l, 'row', 1, 0.05)).toThrow(OpError);
  });
});

describe('sharing evenly', () => {
  it('evens out the columns', () => {
    const l = setCols(three().l, [0.2, 0.5, 0.3]);
    expect(cols(equalize(l, 'row').layout)).toEqual([0.3333, 0.3333, 0.3333]);
  });

  it('counts the columns, not the sides of a split: two on the left and one on the right is a third each', () => {
    const { l, id } = sixUp();
    expect(l.root!.cols).toHaveLength(3);
    const even = equalize(l, 'row').layout;
    const w = (name: string) => +unitRects(even.root).get(groupOf(even, id[name]))!.w.toFixed(4);
    expect(['A', 'B', 'C', 'D', 'E'].map(w)).toEqual([0.3333, 0.3333, 0.3333, 0.3333, 0.3333]);
  });

  it('a column of three beside one of two: a third each, its stretch of the line coming away', () => {
    let l = emptyLayout();
    const id: Record<string, string> = {};
    const open = (name: string, target?: Parameters<typeof openPane>[3]) => { const r = openPane(l, name, name, target); l = r.layout; id[name] = r.paneId; };
    const g = (name: string) => groupOf(l, id[name]);
    open('checking');
    open('what', { kind: 'beside', nodeId: g('checking'), side: 'bottom', share: 0.56 });
    open('qualities', { kind: 'edge', side: 'right', share: 1 / 3 });
    open('working', { kind: 'beside', nodeId: g('qualities'), side: 'bottom', share: 0.56 });
    open('four', { kind: 'beside', nodeId: g('working'), side: 'bottom', share: 0.5 });
    open('planning', { kind: 'beside', nodeId: g('what'), side: 'right', share: 0.5 });
    // the line under Checking and under Qualities is one line
    expect(runs(l.root).filter((r) => r.axis === 'column' && r.line === 1)).toHaveLength(1);
    const even = equalize(l, 'column').layout;
    expect(validate(even)).toEqual([]);
    const h = (name: string) => +unitRects(even.root).get(groupOf(even, id[name]))!.h.toFixed(4);
    expect(['qualities', 'working', 'four'].map(h)).toEqual([0.3333, 0.3333, 0.3333]);
    expect(['checking', 'what', 'planning'].map(h)).toEqual([0.5, 0.5, 0.5]);
    expect(rows(even)).toEqual([0.3333, 0.1667, 0.1667, 0.3333]);
  });

  it('lines that only stood apart because their shares differed come together as one', () => {
    const { l } = twoByTwo(0.7, 0.4); // A | B at 0.3, C | D at 0.6
    expect(l.root!.cols).toHaveLength(3);
    const even = equalize(l, 'row').layout;
    expect(cols(even)).toEqual([0.5, 0.5]);
    expect(rows(even)).toEqual([0.5, 0.5]);
  });
});

describe('moving', () => {
  it('a lone pane moved beside a neighbour leaves the other sizes alone ([1|2|3], 3 right of 1 -> [1|3|2])', () => {
    const { l: l0, ids } = three();
    const l = setCols(l0, [0.2, 0.5, 0.3]);
    const r = movePane(l, ids[2], { kind: 'beside', nodeId: groupOf(l, ids[0]), side: 'right' });
    expect(readingOrder(r.layout.root)).toEqual([ids[0], ids[2], ids[1]]);
    expect(width(r.layout, ids[1])).toBe(0.5); // 2 keeps its width: the room 3 left goes to 1, beside which it lands
    expect(width(r.layout, ids[0]) + width(r.layout, ids[2])).toBeCloseTo(0.5);
  });

  it('a lone pane dropped beside its own group goes nowhere', () => {
    const { l, ids } = three();
    expect(movePane(l, ids[1], { kind: 'beside', nodeId: groupOf(l, ids[1]), side: 'left' }).changed).toBe(false);
  });

  it('a lone pane dropped in a divider of its own goes nowhere', () => {
    const { l, ids } = three();
    const [a, b, c] = ids.map((id) => groupOf(l, id));
    expect(movePane(l, ids[1], { kind: 'gap', axis: 'row', before: a, after: b }).changed).toBe(false);
    expect(movePane(l, ids[1], { kind: 'gap', axis: 'row', before: b, after: c }).changed).toBe(false);
  });

  it('the only pane in the window goes nowhere', () => {
    const { l, ids } = build(['a']);
    expect(movePane(l, ids[0], { kind: 'edge', side: 'left' }).changed).toBe(false);
  });

  it('reorders inside its own group', () => {
    const { l, ids } = build(['a'], ['b'], ['c']);
    const r = movePane(l, ids[0], { kind: 'stack', stackId: groupOf(l, ids[0]), index: 3 });
    expect(findStackOf(r.layout.root, ids[0])!.panes).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("a lone pane keeps its group's id when it moves (the view animates the same card)", () => {
    const { l, ids } = three();
    const g = groupOf(l, ids[2]);
    const r = movePane(l, ids[2], { kind: 'edge', side: 'top' });
    expect(groupOf(r.layout, ids[2])).toBe(g);
    expect(validate(r.layout)).toEqual([]);
  });

  it('a preview dragged somewhere is kept', () => {
    let { l, ids } = build(['a']);
    const r = openPane(l, 'p', 'p', undefined, { preview: true });
    l = r.layout;
    const moved = movePane(l, r.paneId, { kind: 'beside', nodeId: groupOf(l, ids[0]), side: 'right' });
    expect(moved.layout.panes[r.paneId].preview).toBeUndefined();
  });
});

describe('closing and reopening', () => {
  it('closing a tab brings the one to its right forward (the left one when it was last)', () => {
    const { l, ids } = build(['a'], ['b'], ['c']);
    let r = closePane(activatePane(l, ids[1]).layout, ids[1]);
    expect(findStackOf(r.layout.root, ids[0])!.active).toBe(ids[2]);
    r = closePane(l, ids[2]);
    expect(findStackOf(r.layout.root, ids[0])!.active).toBe(ids[1]);
  });

  it("the group before it takes a closed group's cells, so the others keep their sizes", () => {
    let l = setCols(three().l, [0.2, 0.5, 0.3]);
    const ids = readingOrder(l.root);
    l = activatePane(l, ids[1]).layout;
    const r = closePane(l, ids[1]);
    expect(cols(r.layout)).toEqual([0.7, 0.3]);
    expect(r.layout.activePane).toBe(ids[0]);
  });

  it('in a grid the group beside it that fits it exactly takes it; the line the others share stays', () => {
    const { l, ids } = twoByTwo();
    const r = closePane(l, ids[2]); // B
    expect(validate(r.layout)).toEqual([]);
    expect(width(r.layout, ids[0])).toBe(1);
    expect(cols(r.layout)).toEqual([0.5, 0.5]);
  });

  it('closing the middle of a pinwheel still leaves a whole grid', () => {
    const g = (id: string, c0: number, c1: number, r0: number, r1: number) => ({ type: 'stack' as const, id, panes: [id], active: id, c0, c1, r0, r1 });
    const third = [{ size: 1 / 3 }, { size: 1 / 3 }, { size: 1 / 3 }];
    const l: Layout = {
      root: { type: 'grid', id: 'grid', cols: third, rows: third.map((t) => ({ ...t })), groups: [g('a', 0, 2, 0, 1), g('b', 2, 3, 0, 2), g('e', 1, 2, 1, 2), g('d', 0, 1, 1, 3), g('c', 1, 3, 2, 3)] },
      panes: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [id, { id, kind: id, title: id }])),
      activePane: 'e',
      nextId: 1,
    };
    expect(validate(l)).toEqual([]);
    const r = closePane(l, 'e');
    expect(validate(r.layout)).toEqual([]);
    expect(stacks(r.layout.root)).toHaveLength(4);
  });

  it('reopening puts it back exactly where it was, with its size', () => {
    const l = setCols(three().l, [0.2, 0.5, 0.3]);
    const ids = readingOrder(l.root);
    const c = closePane(l, ids[1]);
    const back = reopenPane(c.layout, c.closed);
    expect(readingOrder(back.layout.root)).toEqual(ids);
    expect(cols(back.layout)).toEqual([0.2, 0.5, 0.3]);
  });

  it('when its old place is gone it comes back on the right edge', () => {
    const { l, ids } = three();
    const c = closePane(l, ids[1]);
    const gone = closePane(c.layout, ids[0]);
    const back = reopenPane(gone.layout, c.closed);
    expect(readingOrder(back.layout.root).at(-1)).toBe(ids[1]);
  });

  it('when its old place is too small now it comes back as a tab: a pane is never lost', () => {
    const { l: l0, ids } = three();
    const c = closePane(l0, ids[0]);
    const l = setCols(c.layout, [0.88, 0.12]);
    const back = reopenPane(l, { ...c.closed, restore: { kind: 'beside', nodeId: groupOf(l, ids[2]), side: 'right', share: 0.5 } });
    expect(Object.keys(back.layout.panes)).toContain(ids[0]);
  });

  it('closing the last pane leaves an empty layout', () => {
    const { l, ids } = build(['a']);
    const r = closePane(l, ids[0]);
    expect(r.layout.root).toBeNull();
    expect(r.layout.activePane).toBeNull();
  });
});

describe('strips: a fold takes the whole column or row', () => {
  it('folding gives its room to the neighbour, and opening gives exactly that back', () => {
    const l = setCols(three().l, [0.2, 0.5, 0.3]);
    const ids = readingOrder(l.root);
    const folded = collapseNode(l, groupOf(l, ids[0]));
    expect(shownOrder(folded.layout.root)).toEqual([ids[1], ids[2]]);
    expect(folded.layout.activePane).toBe(ids[1]);
    const open = expandNode(folded.layout, groupOf(l, ids[0]));
    expect(cols(open.layout)).toEqual([0.2, 0.5, 0.3]);
  });

  it('everything in the column folds with it', () => {
    const { l, id } = sixUp();
    const folded = collapseNode(l, groupOf(l, id.A), undefined, 'row').layout;
    expect(foldedNodes(folded.root)).toEqual(new Set([groupOf(l, id.A), groupOf(l, id.C)]));
  });

  it('a group under one that reaches past it folds with the whole band, as far as that one goes', () => {
    // [A over (C | D)] beside E: C's column is only part of A's, so all three fold.
    const { l, ids } = build(
      ['A'],
      ['C', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'bottom', share: 0.5 })],
      ['D', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[1]), side: 'right', share: 0.5 })],
      ['E', () => ({ kind: 'edge', side: 'right', share: 0.4 })],
    );
    const folded = collapseNode(l, groupOf(l, ids[1]), undefined, 'row').layout;
    expect(foldedNodes(folded.root)).toEqual(new Set(ids.slice(0, 3).map((id) => groupOf(l, id))));
    expect(shownOrder(folded.root)).toEqual([ids[3]]);
  });

  it('the way that takes fewest other groups with it', () => {
    // Three columns of two: A's column takes D with it, its row would take B and C.
    const { l, ids } = build(
      ['A'],
      ['D', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'bottom', share: 0.5 })],
      ['B', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'right', share: 2 / 3 })],
      ['E', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[1]), side: 'right', share: 2 / 3 })],
      ['C', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[2]), side: 'right', share: 0.5 })],
      ['F', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[3]), side: 'right', share: 0.5 })],
    );
    expect(cols(l)).toEqual([0.3333, 0.3333, 0.3333]);
    expect(stacks(l.root)).toHaveLength(6);
    const folded = collapseNode(l, groupOf(l, ids[0])).layout;
    expect(foldedNodes(folded.root)).toEqual(new Set([groupOf(l, ids[0]), groupOf(l, ids[1])]));
    // A wide group under two: only its row can fold.
    const wide = build(
      ['A'],
      ['C', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'bottom', share: 0.5 })],
      ['B', (x, i) => ({ kind: 'beside', nodeId: groupOf(x, i[0]), side: 'right', share: 0.5 })],
    );
    const c = groupOf(wide.l, wide.ids[1]);
    expect(foldedNodes(collapseNode(wide.l, c).layout.root)).toEqual(new Set([c]));
  });

  it('the last open pane cannot be folded', () => {
    const { l, ids } = build(['a']);
    expect(canCollapse(l, groupOf(l, ids[0]))).toBe(false);
    expect(() => collapseNode(l, groupOf(l, ids[0]))).toThrow(/stays open/);
  });

  it('going to a folded pane opens its strip', () => {
    const { l, ids } = three();
    const folded = collapseNode(l, groupOf(l, ids[2])).layout;
    const shown = activatePane(folded, ids[2]).layout;
    expect(shownOrder(shown.root)).toContain(ids[2]);
  });

  it('keys that move between panes pass strips by', () => {
    const { l, ids } = three();
    const folded = collapseNode(l, groupOf(l, ids[1])).layout;
    expect(neighbourStack(folded.root, groupOf(folded, ids[0]), 'right')?.panes).toEqual([ids[2]]);
  });

  it('expand all opens every strip', () => {
    let { l, ids } = three();
    l = collapseNode(l, groupOf(l, ids[0])).layout;
    l = collapseNode(l, groupOf(l, ids[2])).layout;
    expect(shownOrder(expandAll(l).layout.root)).toEqual(ids);
  });
});

describe('colours', () => {
  it('each pane gets a colour when it opens, the one fewest others have, and keeps it when its page changes', () => {
    const { l, ids } = build(['a'], ['b'], ['c']);
    const colours = ids.map((id) => l.panes[id].color);
    expect(new Set(colours).size).toBe(3);
    const after = closePane(l, ids[1]).layout;
    // the colour freed by the closed one is the next one given
    const r = openPane(after, 'd', 'd');
    expect(r.layout.panes[r.paneId].color).toBe(colours[1]);
    const shown = retargetPane(l, ids[0], 'z', 'Z');
    expect(shown.layout.panes[ids[0]].color).toBe(colours[0]);
  });
});

describe('previews', () => {
  it('keeping a preview is not a change to the arrangement', () => {
    const r = openPane(emptyLayout(), 'p', 'p', undefined, { preview: true });
    const kept = keepPane(r.layout, r.paneId);
    expect(kept.layout.panes[r.paneId].preview).toBeUndefined();
    expect(kept.layout.root).toEqual(r.layout.root);
  });
});

describe('foldedAround: the layout as a zoomed group shows it', () => {
  it('folds every column and row it is not in, toward it, and leaves the layout itself alone', () => {
    let l = openPane(emptyLayout(), 'a', 'A').layout;
    const a = stacks(l.root)[0].id;
    l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: a, side: 'right', share: 0.5 }).layout;
    const b = stacks(l.root).find((s) => s.id !== a)!.id;
    l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: b, side: 'bottom', share: 0.5 }).layout;
    const c = stacks(l.root).find((s) => s.id !== a && s.id !== b)!.id;
    const view = foldedAround(l.root!, b);
    expect(view.cols.map((t) => t.fold)).toEqual(['after', undefined]);
    expect(view.rows.map((t) => t.fold)).toEqual([undefined, 'before']);
    expect(foldedNodes(view)).toEqual(new Set([a, c]));
    // a view: the layout is as it was
    expect(foldedNodes(l.root)).toEqual(new Set());
  });
});

describe('layouts saved before the grid', () => {
  const tree = {
    type: 'split', id: 's1', axis: 'row', weights: [2 / 3, 1 / 3],
    children: [
      {
        type: 'split', id: 's2', axis: 'column', weights: [0.5, 0.5],
        children: [
          { type: 'split', id: 's3', axis: 'row', weights: [0.5, 0.5], children: [{ type: 'stack', id: 'gA', panes: ['A'], active: 'A' }, { type: 'stack', id: 'gB', panes: ['B'], active: 'B' }] },
          { type: 'split', id: 's4', axis: 'row', weights: [0.5, 0.5], children: [{ type: 'stack', id: 'gC', panes: ['C'], active: 'C' }, { type: 'stack', id: 'gD', panes: ['D'], active: 'D' }] },
        ],
      },
      { type: 'stack', id: 'gE', panes: ['E'], active: 'E' },
    ],
  };
  const saved = { root: tree, panes: Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((p) => [p, { id: p, kind: p, title: p }])), activePane: 'A', nextId: 9 } as unknown as Layout;

  it('come back on the grid, every group the same size, the lines that met one line', () => {
    const l = migrateLayout(saved);
    expect(validate(l)).toEqual([]);
    expect(cols(l)).toEqual([0.3333, 0.3333, 0.3333]);
    expect(rows(l)).toEqual([0.5, 0.5]);
    expect(runs(l.root).filter((r) => r.axis === 'column')).toHaveLength(1);
    expect([...unitRects(l.root)].filter(([id]) => id !== 'grid').map(([id, r]) => [id, +r.w.toFixed(4), +r.h.toFixed(4)])).toEqual([
      ['gA', 0.3333, 0.5], ['gB', 0.3333, 0.5], ['gE', 0.3333, 1], ['gC', 0.3333, 0.5], ['gD', 0.3333, 0.5],
    ]);
  });

  it('a strip stays a strip where it is a whole column', () => {
    const folded = { ...tree, children: [tree.children[0], { ...tree.children[1], collapsed: true, heir: 'before' }] };
    const grid = fromTree(folded as never)!;
    expect(grid.cols.map((t) => t.fold)).toEqual([undefined, undefined, 'before']);
  });

  it('a grid is left as it is', () => {
    const { l } = twoByTwo();
    expect(migrateLayout(l)).toBe(l);
  });

  it('panes saved before panes had colours get one each, all different, in reading order', () => {
    const { l } = twoByTwo();
    const bare = { ...l, panes: Object.fromEntries(Object.entries(l.panes).map(([id, p]) => [id, { id: p.id, kind: p.kind, title: p.title }])) };
    const coloured = migrateLayout(bare);
    const colours = readingOrder(coloured.root).map((id) => coloured.panes[id].color);
    expect(colours).toEqual([0, 1, 2, 3]);
  });
});
