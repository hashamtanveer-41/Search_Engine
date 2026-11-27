// The divider's limits (resize.ts): a line stops at the smallest size, given in width and height, and
// lands on another line near it.
import { describe, expect, it } from 'vitest';
import { clampLine, snapLine } from './resize';
import { DEFAULT_LIMITS, emptyLayout, moveLine, openPane, stacks, type Layout } from './model';

/** Two groups side by side, half and half. */
function two(): Layout {
  const l = openPane(emptyLayout(), 'a', 'A').layout;
  return openPane(l, 'b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
}

describe('a divider stops at the smallest size', () => {
  it("in width, as the workspace gives it (from px), not the model's share of the window", () => {
    const l = two();
    const wide = { ...DEFAULT_LIMITS, minW: 0.3, minH: 0.1 };
    // pulled all the way left: the left group stops at 30% of the width
    expect(+clampLine(l, 'row', 1, 0.05, wide).toFixed(3)).toBe(0.3);
    // with the model's own 12%, it would have gone further
    expect(+clampLine(l, 'row', 1, 0.05).toFixed(3)).toBe(0.12);
  });

  it('a group already under it (a smaller window) may grow, and never holds the divider still', () => {
    const l = moveLine(two(), 'row', 1, 0.2).layout;
    const wide = { ...DEFAULT_LIMITS, minW: 0.3, minH: 0.1 };
    // growing it: allowed
    expect(clampLine(l, 'row', 1, 0.25, wide)).toBeCloseTo(0.25);
    // shrinking it further: not
    expect(clampLine(l, 'row', 1, 0.15, wide)).toBeCloseTo(0.2);
  });

  it('a group under it one way may still be made shorter the other way, down to the smallest height', () => {
    // two columns over one wide row; the columns narrower than the smallest width
    let l = openPane(emptyLayout(), 'a', 'A').layout;
    const a = stacks(l.root)[0].id;
    l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: a, side: 'bottom', share: 0.5 }).layout;
    l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: a, side: 'right', share: 0.5 }).layout;
    const narrow = { ...DEFAULT_LIMITS, minW: 0.6, minH: 0.2 };
    expect(+clampLine(l, 'column', 1, 0.05, narrow).toFixed(3)).toBe(0.2);
  });
});

describe('a line near another lands on it', () => {
  it('within the snap distance, at exactly its place; further, where it was let go', () => {
    // [A | B] at 0.25 over [C | D] at 0.5: two lines
    let l = openPane(emptyLayout(), 'a', 'A').layout;
    const a = stacks(l.root)[0].id;
    l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: a, side: 'bottom', share: 0.5 }).layout;
    const c = stacks(l.root).find((s) => s.id !== a)!.id;
    l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: a, side: 'right', share: 0.75 }).layout;
    l = openPane(l, 'd', 'D', { kind: 'beside', nodeId: c, side: 'right', share: 0.5 }).layout;
    expect(l.root!.cols).toHaveLength(3);
    const at = l.root!.cols[0].size + l.root!.cols[1].size;
    expect(snapLine(l, 'row', 1, 0.49, 0.02)).toBe(at);
    expect(snapLine(l, 'row', 1, 0.45, 0.02)).toBe(0.45);
  });
});
