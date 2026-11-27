import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BookOpen, LayoutGrid } from 'lucide-react';
import { AREA_ASPECT, ARMED_MS, mapSize, SpaceCards, SpaceMap, SpaceSpots, SpacesMenu, SpacesSheet, SpaceTiles, spaceKeyOf, usedAgo, type SpaceView } from './spaces';
import { emptyLayout, openPane, stacks } from './panes/model';
import { PHONE_QUERY } from './panes/Workspace';

afterEach(cleanup);

const lesson = openPane(emptyLayout(), 'topic:limits', 'Limits').layout;
const views: SpaceView[] = [
  { id: 'reading', name: 'Reading', icon: BookOpen, count: 1, used: 0, layout: lesson },
  { id: 'space-1', name: 'Exam prep', icon: LayoutGrid, count: 0, used: 0, layout: emptyLayout() },
];
const key = (over: Partial<KeyboardEvent>) => ({ ctrlKey: true, altKey: true, metaKey: false, shiftKey: false, key: '', code: '', ...over });

describe('the spaces’ keys', () => {
  it('Ctrl+Alt+arrows step, Ctrl+Alt+digit opens one; anything else is not theirs', () => {
    expect(spaceKeyOf(key({ key: 'ArrowRight' }))).toEqual({ step: 1 });
    expect(spaceKeyOf(key({ key: 'ArrowLeft' }))).toEqual({ step: -1 });
    expect(spaceKeyOf(key({ key: '2', code: 'Digit2' }))).toEqual({ index: 1 });
    expect(spaceKeyOf(key({ key: 'ArrowRight', shiftKey: true }))).toBeNull();
    expect(spaceKeyOf(key({ key: 'ArrowRight', altKey: false }))).toBeNull();
    expect(spaceKeyOf(key({ key: '0', code: 'Digit0' }))).toBeNull();
  });

  it('says how long ago a space was open', () => {
    const now = 10 * 86400000;
    expect(usedAgo(now - 20000, now)).toBe('now');
    expect(usedAgo(now - 12 * 60000, now)).toBe('12 min ago');
    expect(usedAgo(now - 3 * 3600000, now)).toBe('3 h ago');
    expect(usedAgo(now - 30 * 3600000, now)).toBe('yesterday');
    expect(usedAgo(now - 4 * 86400000, now)).toBe('4 days ago');
  });
});

describe('the sidebar’s tiles', () => {
  it('one per space, the showing one current and not a drop target, the others taking a dropped tab; the gear manages', () => {
    const onSpace = vi.fn();
    const onManage = vi.fn();
    render(<SpaceTiles spaces={views} current="reading" last="reading" onSpace={onSpace} onManage={onManage} />);
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-slot=space-tiles] [data-space]')];
    expect(tiles.map((t) => [t.getAttribute('aria-label'), t.getAttribute('aria-current'), t.dataset.paneDrop ?? null])).toEqual([
      ['Reading, 1 page', 'page', null],
      ['Exam prep, 0 pages', null, 'space-1'],
    ]);
    expect(tiles[1].dataset.paneDropLabel).toBe('Move to Exam prep');
    fireEvent.click(tiles[1]);
    expect(onSpace).toHaveBeenLastCalledWith('space-1');
    fireEvent.click(screen.getByRole('button', { name: 'Manage spaces' }));
    expect(onManage).toHaveBeenCalled();
  });

  it('while a page shows no tile is current, and the keys step from the space the panes are in', () => {
    const onSpace = vi.fn();
    render(<SpaceTiles spaces={views} current={null} last="space-1" onSpace={onSpace} onManage={() => undefined} managing />);
    expect(document.querySelector('[data-space][aria-current]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage spaces' }).getAttribute('aria-current')).toBe('page');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, altKey: true, key: 'ArrowRight' })); });
    expect(onSpace).toHaveBeenLastCalledWith('reading');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, altKey: true, key: '2', code: 'Digit2' })); });
    expect(onSpace).toHaveBeenLastCalledWith('space-1');
  });
});

describe('the collapsed sidebar’s spaces menu', () => {
  it('one icon; its menu has Manage spaces on top, then the spaces, the one showing ticked', async () => {
    const onSpace = vi.fn();
    const onManage = vi.fn();
    render(<SpacesMenu spaces={views} current="reading" last="reading" onSpace={onSpace} onManage={onManage} />);
    const icon = screen.getByRole('button', { name: 'Spaces, Reading open' });
    await act(async () => { fireEvent.keyDown(icon, { key: 'Enter' }); });
    const items = screen.getAllByRole('menuitem');
    expect(items.map((m) => m.textContent)).toEqual(['Manage spaces', 'Reading1', 'Exam prep0']);
    expect(items[1].getAttribute('aria-current')).toBe('page');
    await act(async () => { fireEvent.click(items[2]); });
    expect(onSpace).toHaveBeenCalledWith('space-1');
    await act(async () => { fireEvent.keyDown(icon, { key: 'Enter' }); });
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Manage spaces' })); });
    expect(onManage).toHaveBeenCalled();
  });
});

describe('where a page is open', () => {
  it('one icon naming the space, a click opening it there; in more, +N opens a menu of them all', async () => {
    const onSpot = vi.fn();
    const pane = Object.keys(lesson.panes)[0];
    const spots = ['Reading', 'Exam', 'Lectures'].map((name, i) => ({ space: `s${i}`, name, layout: lesson, pane }));
    render(<SpaceSpots spots={spots} onSpot={onSpot} />);
    expect(document.querySelectorAll('[data-spot]')).toHaveLength(1);
    expect(document.querySelector('[data-slot=space-map]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'In Reading, open it there' }));
    expect(onSpot).toHaveBeenLastCalledWith(spots[0]);
    const more = screen.getByRole('button', { name: 'In 3 spaces: pick one' });
    expect(more.textContent).toBe('+2');
    await act(async () => { fireEvent.keyDown(more, { key: 'Enter' }); });
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Reading', 'Exam', 'Lectures']);
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Lectures' })); });
    expect(onSpot).toHaveBeenLastCalledWith(spots[2]);
  });

  it('nothing when it is open nowhere; one space, no +N', () => {
    const pane = Object.keys(lesson.panes)[0];
    const { container, rerender } = render(<SpaceSpots spots={[]} onSpot={() => undefined} />);
    expect(container.innerHTML).toBe('');
    rerender(<SpaceSpots spots={[{ space: 'a', name: 'A', layout: lesson, pane }]} onSpot={() => undefined} />);
    expect(document.querySelector('[data-spot-more]')).toBeNull();
  });
});

describe('the phone’s spaces sheet', () => {
  it('the space’s name opens a sheet: Manage spaces on top, then the spaces, the open one ticked; picking one opens it', async () => {
    const onSpace = vi.fn();
    const onManage = vi.fn();
    render(<SpacesSheet spaces={views} current="reading" onSpace={onSpace} onManage={onManage} />);
    const name = screen.getByRole('button', { name: 'Reading: your spaces' });
    expect(name.textContent).toBe('Reading');
    await act(async () => { fireEvent.click(name); });
    const items = [...document.querySelectorAll<HTMLElement>('[role=dialog] li button')];
    expect(items.map((b) => b.textContent)).toEqual(['Manage spaces', 'Reading1 page', 'Exam prep0 pages']);
    expect(items[1].getAttribute('aria-current')).toBe('page');
    await act(async () => { fireEvent.click(items[2]); });
    expect(onSpace).toHaveBeenCalledWith('space-1');
    // The sheet slides away first; until it has, the page under it is hidden from the tree.
    const again = await waitFor(() => screen.getByRole('button', { name: 'Reading: your spaces' }), { timeout: 3000 });
    await act(async () => { fireEvent.click(again); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Manage spaces' })); });
    expect(onManage).toHaveBeenCalled();
  });
});

describe('the tiles’ row', () => {
  it('fills the row, so the gear is at its end; one space alone shows its name and page count', () => {
    const { rerender } = render(<SpaceTiles spaces={views.slice(0, 1)} current="reading" last="reading" onSpace={() => undefined} onManage={() => undefined} />);
    const row = document.querySelector<HTMLElement>('[data-slot=space-tiles]')!;
    expect(row.className).toMatch(/\bw-full\b/);
    expect(row.textContent).toBe('Reading1 page');
    rerender(<SpaceTiles spaces={views} current="reading" last="reading" onSpace={() => undefined} onManage={() => undefined} />);
    expect(document.querySelector<HTMLElement>('[data-slot=space-tiles]')!.textContent).toBe('');
  });
});

describe('a space’s map’s shape', () => {
  it('is the pane area’s, so it matches the layout: wide cards, tiles as tall as the row and as wide as that makes them', () => {
    expect(mapSize(2, 240)).toEqual({ w: 240, h: 120 });
    expect(mapSize(1.5, 30, true)).toEqual({ w: 45, h: 30 });
    // Kept sensible: an absurd shape, or none, is clamped or falls back.
    expect(mapSize(10, 240)).toEqual({ w: 240, h: 80 });
    expect(mapSize(NaN, 240)).toEqual(mapSize(AREA_ASPECT, 240));
    render(<SpaceCards spaces={views} onSpace={() => undefined} aspect={2} now={0} />);
    expect((document.querySelector('[data-slot=space-map]') as HTMLElement).style.aspectRatio).toBe('240 / 120');
  });
});

describe('a space’s map', () => {
  it('a box holding two or more tabs says how many, in the tiles and the bigger maps alike', () => {
    let l = openPane(emptyLayout(), 'topic:a', 'A').layout;
    const stack = Object.values(l.panes)[0].id;
    l = openPane(l, 'topic:b', 'B', { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.5 }).layout;
    l = openPane(l, 'topic:c', 'C', { kind: 'stack', stackId: stacks(l.root).find((s) => s.panes.includes(stack))!.id }).layout;
    const counts = () => [...document.querySelectorAll<HTMLElement>('[data-slot=space-map] > span')].map((b) => b.dataset.tabs ?? '-');
    const { rerender } = render(<SpaceMap layout={l} w={34} h={34} room={2} />);
    expect(counts().sort()).toEqual(['-', '2']);
    rerender(<SpaceMap layout={l} />);
    expect(counts().sort()).toEqual(['-', '2']);
    expect(document.querySelector('[data-tabs="2"]')!.textContent).toBe('2');
  });
});

describe('nothing current while a page shows (page › space › pane)', () => {
  it('no tile is ringed, and the collapsed menu ticks no space', async () => {
    render(<><SpaceTiles spaces={views} current={null} last="reading" onSpace={() => undefined} onManage={() => undefined} />
      <SpacesMenu spaces={views} current={null} last="reading" onSpace={() => undefined} onManage={() => undefined} /></>);
    expect(document.querySelector('[data-slot=space-tiles] [data-space][aria-current]')).toBeNull();
    expect(document.querySelector('[data-slot=space-tiles] [data-space=reading]')!.className).not.toMatch(/border-info/);
    await act(async () => { fireEvent.keyDown(screen.getByRole('button', { name: 'Spaces' }), { key: 'Enter' }); });
    expect(document.querySelector('[role=menuitem][aria-current]')).toBeNull();
  });
});

describe('the Spaces page’s cards', () => {
  it('a card per space, none of them current (a page is showing); a click opens a space', () => {
    const onSpace = vi.fn();
    render(<SpaceCards spaces={views} onSpace={onSpace} now={0} />);
    expect(screen.queryByText('Current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the Exam prep space' }));
    expect(onSpace).toHaveBeenCalledWith('space-1');
    expect(screen.getByText('Limits')).toBeTruthy();
  });

  it('renames in place from its pencil; the buttons stay while it does', () => {
    const onRename = vi.fn();
    render(<SpaceCards spaces={views} onSpace={() => undefined} onRename={onRename} onDelete={() => undefined} now={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Reading' }));
    const input = screen.getByRole('textbox', { name: 'Space name' }) as HTMLInputElement;
    expect(screen.getByRole('button', { name: 'Rename Reading' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Delete Reading' })).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Lectures' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('reading', 'Lectures');
  });

  it('renames by clicking the name twice: the first click says to click again; the name is the same field before and after, so nothing moves', () => {
    const onRename = vi.fn();
    render(<SpaceCards spaces={views} onSpace={() => undefined} onRename={onRename} now={0} />);
    const name = screen.getByRole('textbox', { name: 'Exam prep, click twice to rename' }) as HTMLInputElement;
    expect(name.readOnly).toBe(true);
    // A press before renaming does not focus it (no caret in the name).
    expect(fireEvent.mouseDown(name)).toBe(false);
    expect(name.className).toMatch(/\bcaret-transparent\b/);
    fireEvent.click(name);
    expect(name.readOnly).toBe(true);
    expect(screen.getAllByText('Click again to rename').length).toBeGreaterThan(0);
    fireEvent.click(name);
    const editing = screen.getByRole('textbox', { name: 'Space name' }) as HTMLInputElement;
    expect(editing).toBe(name);
    expect(editing.readOnly).toBe(false);
    expect(editing.className.match(/\bh-7\b/)).toBeTruthy();
    // Escape keeps the old name.
    fireEvent.change(editing, { target: { value: 'Nope' } });
    fireEvent.keyDown(editing, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(editing.value).toBe('Exam prep');
  });

  it('deletes on a second press: the first arms the button (a confirm icon, a tooltip saying so), which disarms by itself', () => {
    vi.useFakeTimers();
    try {
      const onDelete = vi.fn();
      render(<SpaceCards spaces={views} onSpace={() => undefined} onDelete={onDelete} now={0} />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Exam prep' }));
      expect(onDelete).not.toHaveBeenCalled();
      const armed = screen.getByRole('button', { name: 'Confirm deleting Exam prep' });
      expect(armed.hasAttribute('data-armed')).toBe(true);
      expect(screen.getAllByText('Confirm deletion').length).toBeGreaterThan(0);
      // Red: it is about to delete.
      expect(document.querySelector('[data-slot=tooltip-content]')!.getAttribute('data-tone')).toBe('bad');
      act(() => { vi.advanceTimersByTime(ARMED_MS + 10); });
      expect(screen.getByRole('button', { name: 'Delete Exam prep' }).hasAttribute('data-armed')).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Exam prep' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm deleting Exam prep' }));
      expect(onDelete).toHaveBeenCalledWith('space-1');
    } finally { vi.useRealTimers(); }
  });

  it('with a modifier key held the button shows the confirm already and deletes at once', () => {
    const onDelete = vi.fn();
    render(<SpaceCards spaces={views} onSpace={() => undefined} onDelete={onDelete} now={0} />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })); });
    expect(screen.getByRole('button', { name: 'Delete Reading' }).hasAttribute('data-armed')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reading' }), { altKey: true });
    expect(onDelete).toHaveBeenCalledWith('reading');
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' })); });
    expect(screen.getByRole('button', { name: 'Delete Reading' }).hasAttribute('data-armed')).toBe(false);
  });

  it('a new space’s card has its name ready to type', () => {
    const onNew = vi.fn(() => 'space-1');
    const { rerender } = render(<SpaceCards spaces={views.slice(0, 1)} onSpace={() => undefined} onRename={() => undefined} onNew={onNew} now={0} />);
    fireEvent.click(screen.getByRole('button', { name: /New space/ }));
    rerender(<SpaceCards spaces={views} onSpace={() => undefined} onRename={() => undefined} onNew={onNew} now={0} />);
    const name = screen.getByRole('textbox', { name: 'Space name' }) as HTMLInputElement;
    expect([name.readOnly, name === document.activeElement, name.value]).toEqual([false, true, 'Exam prep']);
  });

  it('a new space left with no name is removed, not named Space N; an old one keeps its name', () => {
    const onNew = vi.fn(() => 'space-1');
    const onDelete = vi.fn();
    const onRename = vi.fn();
    const { rerender } = render(<SpaceCards spaces={views.slice(0, 1)} onSpace={() => undefined} onRename={onRename} onDelete={onDelete} onNew={onNew} now={0} />);
    fireEvent.click(screen.getByRole('button', { name: /New space/ }));
    rerender(<SpaceCards spaces={views} onSpace={() => undefined} onRename={onRename} onDelete={onDelete} onNew={onNew} now={0} />);
    const name = screen.getByRole('textbox', { name: 'Space name' }) as HTMLInputElement;
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.blur(name);
    expect(onDelete).toHaveBeenCalledWith('space-1');
    expect(onRename).not.toHaveBeenCalled();
    // An old space, renamed to nothing: it keeps its name.
    onDelete.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Reading' }));
    const old = screen.getByRole('textbox', { name: 'Space name' }) as HTMLInputElement;
    fireEvent.change(old, { target: { value: '' } });
    fireEvent.keyDown(old, { key: 'Enter' });
    expect(onDelete).not.toHaveBeenCalled();
    expect(old.value).toBe('Reading');
  });

  it('on a phone, delete asks in a dialog: one tap, then Delete', () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === PHONE_QUERY, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const onDelete = vi.fn();
      render(<SpaceCards spaces={views} onSpace={() => undefined} onDelete={onDelete} now={0} />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Reading' }));
      expect(onDelete).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog', { name: 'Delete Reading?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(onDelete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Delete Reading' }));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Reading?' })).getByRole('button', { name: 'Delete' }));
      expect(onDelete).toHaveBeenCalledWith('reading');
    } finally { window.matchMedia = was; }
  });

  it('the last space left has no delete button', () => {
    render(<SpaceCards spaces={views.slice(0, 1)} onSpace={() => undefined} onRename={() => undefined} onDelete={() => undefined} now={0} />);
    expect(screen.queryByRole('button', { name: 'Delete Reading' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rename Reading' })).toBeTruthy();
  });
});
