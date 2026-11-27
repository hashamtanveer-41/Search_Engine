import { describe, expect, it } from 'vitest';
import { activatePane, emptyLayout, onePane, openPane, readingOrder, stacks, validate } from './model';

describe('onePane: a space as a phone first shows it', () => {
  it('puts every page in one group, in reading order, the one in use in front, keeping their ids and colours', () => {
    let l = openPane(emptyLayout(), 'a', 'A').layout;
    l = openPane(l, 'b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
    l = openPane(l, 'c', 'C', { kind: 'beside', nodeId: stacks(l.root)[1].id, side: 'bottom', share: 0.5 }).layout;
    const b = Object.values(l.panes).find((p) => p.title === 'B')!;
    l = activatePane(l, b.id).layout;
    const one = onePane(l);
    expect(validate(one)).toEqual([]);
    expect(stacks(one.root)).toHaveLength(1);
    expect(readingOrder(one.root).map((id) => one.panes[id].title)).toEqual(readingOrder(l.root).map((id) => l.panes[id].title));
    expect(one.activePane).toBe(b.id);
    expect(one.panes[b.id]).toEqual(l.panes[b.id]);
  });

  it('leaves a layout of one group, or none, as it is', () => {
    const l = openPane(emptyLayout(), 'a', 'A').layout;
    expect(onePane(l)).toBe(l);
    const none = emptyLayout();
    expect(onePane(none)).toBe(none);
  });
});
