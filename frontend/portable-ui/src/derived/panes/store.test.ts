import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LayoutHistory, loadLayout, saveLayout, STORAGE_PREFIX, usePaneLayout } from './store';
import { emptyLayout, openPane } from './model';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

describe('pane layout storage', () => {
  it('saves a layout and loads it back', () => {
    const s = memory();
    const { layout } = openPane(emptyLayout(), 'continuity', 'Continuity');
    saveLayout('k', layout, s);
    expect(loadLayout('k', s)).toEqual({ layout });
  });

  it('drops a layout that does not hold together, and says why', () => {
    const s = memory();
    s.setItem(STORAGE_PREFIX + 'k', JSON.stringify({ root: { type: 'stack', id: 'g1', panes: ['p9'], active: 'p9' }, panes: {}, activePane: 'p9', nextId: 2 }));
    const loaded = loadLayout('k', s);
    expect(loaded.layout.root).toBeNull();
    expect(loaded.broken).toContain('pane p9 has no definition');
  });

  it('a layout saved before the grid (a tree of splits) comes back on the grid, the same sizes', () => {
    const s = memory();
    const pane = (id: string) => ({ id, kind: id, title: id });
    const tree = {
      type: 'split', id: 's1', axis: 'row', weights: [0.3, 0.7],
      children: [{ type: 'stack', id: 'g1', panes: ['a'], active: 'a' }, { type: 'stack', id: 'g2', panes: ['b'], active: 'b' }],
    };
    s.setItem(STORAGE_PREFIX + 'k', JSON.stringify({ root: tree, panes: { a: pane('a'), b: pane('b') }, activePane: 'b', nextId: 3 }));
    const loaded = loadLayout('k', s);
    expect(loaded.broken).toBeUndefined();
    expect(loaded.layout.root?.type).toBe('grid');
    expect(loaded.layout.root!.cols.map((t) => +t.size.toFixed(4))).toEqual([0.3, 0.7]);
    expect(loaded.layout.activePane).toBe('b');
  });

  it('treats unreadable JSON as no layout', () => {
    const s = memory();
    s.setItem(STORAGE_PREFIX + 'k', '{not json');
    expect(loadLayout('k', s).layout.root).toBeNull();
  });

  it('removes the saved layout when the last pane closes', () => {
    const s = memory();
    saveLayout('k', openPane(emptyLayout(), 'a', 'A').layout, s);
    saveLayout('k', emptyLayout(), s);
    expect(s.data.size).toBe(0);
  });
});

describe('layout history', () => {
  const a = openPane(emptyLayout(), 'a', 'A').layout;
  const b = openPane(a, 'b', 'B').layout;
  const c = openPane(b, 'c', 'C').layout;

  it('undoes and redoes step by step; a new change drops what could be redone', () => {
    const h = new LayoutHistory();
    h.record(a);
    h.record(b);
    expect(h.undo(c)).toBe(b);
    expect(h.undo(b)).toBe(a);
    expect(h.undo(a)).toBeNull();
    expect(h.redo(a)).toBe(b);
    h.record(b);
    expect(h.redo(c)).toBeNull();
  });

  it('a gesture is one step however many changes it makes', () => {
    const h = new LayoutHistory();
    h.gestureStart();
    h.record(a);
    h.record(b);
    h.record(c);
    h.gestureEnd();
    expect(h.undoStack).toEqual([a]);
    h.record(b);
    expect(h.undoStack).toEqual([a, b]);
  });

  it('keeps at most the limit, dropping the oldest', () => {
    const h = new LayoutHistory(2);
    h.record(a);
    h.record(b);
    h.record(c);
    expect(h.undoStack).toEqual([b, c]);
  });
});

describe('the layout hook', () => {
  afterEach(() => localStorage.clear());

  it('saves a layout made from `initial` at once, so coming back to its key finds it', () => {
    const made = () => openPane(emptyLayout(), 'home', 'Home').layout;
    const { result, rerender } = renderHook(({ k }) => usePaneLayout(k, { initial: made }), { initialProps: { k: 'spaces-test/a' } });
    expect(loadLayout('spaces-test/a').layout.panes).toEqual(result.current[0].panes);
    rerender({ k: 'spaces-test/b' });
    rerender({ k: 'spaces-test/a' });
    expect(Object.values(result.current[0].panes).map((p) => p.kind)).toEqual(['home']);
  });

  it('keeps each key’s undo: a space left and come back to still undoes what was done in it', () => {
    const { result, rerender } = renderHook(({ k }) => usePaneLayout(k, { persist: false }), { initialProps: { k: 'a' } });
    act(() => { result.current[1]((l) => openPane(l, 'x', 'X')); });
    expect(result.current[2].canUndo).toBe(true);
    rerender({ k: 'b' });
    expect(result.current[2].canUndo).toBe(false);
    rerender({ k: 'a' });
    expect(result.current[2].canUndo).toBe(true);
  });
});
