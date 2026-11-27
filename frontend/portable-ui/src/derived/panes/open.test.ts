import { describe, expect, it } from 'vitest';
import { openPage } from './open';
import { emptyLayout, findStackOf, keepPane, openPane, stacks } from './model';

describe('openPage: where a click opens a page', () => {
  const base = openPane(emptyLayout(), 'a', 'A').layout;

  it('into an empty layout: an ordinary pane, not a preview', () => {
    const { layout } = openPage(emptyLayout(), 'a', 'A');
    expect(Object.values(layout.panes)[0].preview).toBeUndefined();
  });

  it('a plain click opens a preview, and the next one shows its page in the same tab', () => {
    const one = openPage(base, 'b', 'B').layout;
    const preview = Object.values(one.panes).find((p) => p.kind === 'b')!;
    expect(preview.preview).toBe(true);
    const two = openPage(one, 'c', 'C').layout;
    expect(Object.keys(two.panes)).toHaveLength(2);
    expect(two.panes[preview.id]).toMatchObject({ kind: 'c', preview: true });
    expect(two.activePane).toBe(preview.id);
  });

  it('a kept preview is never replaced: the next click opens a new preview beside it', () => {
    const one = openPage(base, 'b', 'B').layout;
    const id = Object.values(one.panes).find((p) => p.kind === 'b')!.id;
    const kept = keepPane(one, id).layout;
    const two = openPage(kept, 'c', 'C').layout;
    expect(Object.keys(two.panes)).toHaveLength(3);
    expect(two.panes[id].kind).toBe('b');
  });

  it('an open page comes forward instead of opening twice', () => {
    const one = openPage(base, 'b', 'B', 'tab').layout;
    const again = openPage(one, 'a', 'A').layout;
    expect(Object.keys(again.panes)).toHaveLength(2);
    expect(again.panes[again.activePane!].kind).toBe('a');
  });

  it("'beside' opens a pane of its own; 'tab' an ordinary tab in the active group", () => {
    const beside = openPage(base, 'b', 'B', 'beside').layout;
    expect(stacks(beside.root)).toHaveLength(2);
    const tab = openPage(base, 'b', 'B', 'tab').layout;
    expect(findStackOf(tab.root, tab.activePane!)!.panes).toHaveLength(2);
    expect(tab.panes[tab.activePane!].preview).toBeUndefined();
  });
});
