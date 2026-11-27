import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { closeSpace, enterSpace, firstSpaces, loadSpaces, newSpace, READING, renameSpace, saveSpaces, spaceKey, SPACES_PREFIX, stepSpace, useSpaces, type SpaceList } from './spaces';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe('spaces', () => {
  it('Reading keeps the course’s own layout key; another space has one of its own', () => {
    expect(spaceKey('reader/c1', READING)).toBe('reader/c1');
    expect(spaceKey('reader/c1', 'space-1')).toBe('reader/c1/space/space-1');
  });

  it('entering a space opens it and marks it used; one that is not there, with nothing to make it from, changes nothing', () => {
    let list = newSpace(firstSpaces(0), 5).list;
    list = enterSpace(list, READING, 6);
    expect([list.current, list.spaces.map((s) => s.used)]).toEqual([READING, [6, 5]]);
    expect(enterSpace(list, 'nowhere', 7)).toBe(list);
  });

  it('new spaces are numbered among the person’s own, past the names already taken', () => {
    let { list, id } = newSpace(firstSpaces(0), 1);
    expect([id, list.current, list.spaces[1].name]).toEqual(['space-1', 'space-1', 'Space 1']);
    ({ list, id } = newSpace(renameSpace(list, 'space-1', 'Space 2'), 2));
    expect([id, list.spaces[2].name]).toEqual(['space-2', 'Space 3']);
  });

  it('a new space can be made without opening it (the Spaces page names it first)', () => {
    const { list, id } = newSpace(firstSpaces(0), 1, { open: false });
    expect([id, list.current, list.spaces.map((s) => s.id)]).toEqual(['space-1', READING, [READING, 'space-1']]);
  });

  it('deleting the open space opens the one used last; any space may go, but never the last one', () => {
    let list: SpaceList = firstSpaces(0);
    list = newSpace(list, 10).list;
    list = newSpace(list, 20).list;
    list = enterSpace(list, 'space-1', 30);
    const gone = closeSpace(list, 'space-1');
    expect([gone.spaces.map((s) => s.id), gone.current]).toEqual([[READING, 'space-2'], 'space-2']);
    const noReading = closeSpace(gone, READING);
    expect(noReading.spaces.map((s) => s.id)).toEqual(['space-2']);
    expect(closeSpace(noReading, 'space-2')).toBe(noReading);
  });

  it('renames, trimmed, and keeps the name when the new one is blank', () => {
    const list = newSpace(firstSpaces(0), 1).list;
    expect(renameSpace(list, 'space-1', '  Exam prep ').spaces[1].name).toBe('Exam prep');
    expect(renameSpace(list, 'space-1', '   ')).toBe(list);
  });

  it('steps to the next and the one before, round the ends', () => {
    let list = newSpace(firstSpaces(0), 1).list;
    list = newSpace(list, 2).list;
    expect(stepSpace(list, 1)).toBe(READING);
    expect(stepSpace(list, -1)).toBe('space-1');
  });

  it('saves and loads; a broken or missing list is Reading alone', () => {
    const s = memory();
    const list = newSpace(firstSpaces(0), 1).list;
    saveSpaces('reader/c1', list, s);
    expect(loadSpaces('reader/c1', s)).toEqual(list);
    s.m.set(SPACES_PREFIX + 'reader/c2', '{nope');
    expect(loadSpaces('reader/c2', s).spaces.map((x) => x.id)).toEqual([READING]);
  });

  it('drops the tools’ own spaces saved by the first design: tools are pages now', () => {
    const s = memory();
    s.m.set(SPACES_PREFIX + 'reader/c3', JSON.stringify({
      spaces: [{ id: READING, name: 'Reading', used: 1 }, { id: 'cards', name: 'Review cards', tool: 'cards', used: 2 }, { id: 'space-1', name: 'Exam', used: 3 }],
      current: 'cards',
    }));
    const c3 = loadSpaces('reader/c3', s);
    expect([c3.spaces.map((x) => x.id), c3.current]).toEqual([[READING, 'space-1'], READING]);
    expect(c3.spaces[1]).toEqual({ id: 'space-1', name: 'Exam', used: 3 });
  });

  it('the hook changes the list and keeps one per course', () => {
    const { result, rerender } = renderHook(({ base }) => useSpaces(base, { persist: false }), { initialProps: { base: 'reader/c1' } });
    act(() => result.current[1]((l) => newSpace(l, 1).list));
    expect(result.current[0].current).toBe('space-1');
    rerender({ base: 'reader/c2' });
    expect(result.current[0].spaces.map((s) => s.id)).toEqual([READING]);
  });
});
