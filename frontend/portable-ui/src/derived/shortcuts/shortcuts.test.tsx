import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { validate } from '../panes/model';
import { paneShortcuts } from '../panes/keymap';
import { BEAT, balance, paneFrames, paneShortcutSections, ShortcutGuide, useBeat, type ShortcutSection } from './index';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the pane shortcuts acted out', () => {
  it('gives every pane key a scene and a few words', () => {
    const rows = paneShortcutSections().flatMap((s) => s.rows);
    expect(rows.map((r) => r.id)).toEqual(paneShortcuts().map((k) => k.id));
    for (const r of rows) {
      expect(r.scene, r.id).toBeTypeOf('function');
      expect(r.short!.length, r.id).toBeLessThanOrEqual(22);
    }
  });

  it('plays each on the map with the model’s operations: valid layouts, every press changing it', () => {
    for (const { id } of paneShortcuts()) {
      const frames = paneFrames(id);
      if (id.startsWith('tab-')) { expect(frames, id).toEqual([]); continue; }
      expect(frames.length, id).toBeGreaterThanOrEqual(2);
      for (const f of frames) expect(validate(f), id).toEqual([]);
      for (let i = 1; i < frames.length; i++) expect(JSON.stringify(frames[i]), `${id} press ${i}`).not.toBe(JSON.stringify(frames[i - 1]));
    }
  });

  it('splits the active pane into a fourth, closes it to two, and moves focus to the neighbour', () => {
    const count = (id: string, at: number) => Object.keys(paneFrames(id)[at].panes).length;
    expect([count('split-right', 0), count('split-right', 1)]).toEqual([3, 4]);
    expect(count('close', 1)).toBe(2);
    const [from, to] = paneFrames('focus-left');
    expect(from.panes[from.activePane!].kind).toBe('workbook');
    expect(to.panes[to.activePane!].kind).toBe('lesson');
    expect(paneFrames('next').map((l) => l.panes[l.activePane!].kind)).toEqual(['lesson', 'workbook', 'cards']);
  });

  it('reports a scene the model refuses and keeps its row', () => {
    const failed: string[] = [];
    const sections = paneShortcutSections((id) => failed.push(id));
    expect(failed).toEqual([]);
    expect(sections.map((s) => s.title)).toEqual(['Panes', 'Focus', 'History', 'On a tab or a divider']);
  });
});

describe('the beat', () => {
  it('presses near at once (keys down, then up) as often as asked, holds the result and starts over after a moment', () => {
    vi.useFakeTimers();
    expect(BEAT.first).toBeLessThanOrEqual(150);
    const { result } = renderHook(() => useBeat(2));
    expect(result.current).toEqual({ step: 0, pressed: false });
    act(() => { vi.advanceTimersByTime(BEAT.first); });
    expect(result.current).toEqual({ step: 1, pressed: true });
    act(() => { vi.advanceTimersByTime(BEAT.down); });
    expect(result.current).toEqual({ step: 1, pressed: false });
    act(() => { vi.advanceTimersByTime(BEAT.every - BEAT.down); });
    expect(result.current).toEqual({ step: 2, pressed: true });
    act(() => { vi.advanceTimersByTime(BEAT.down + BEAT.hold); });
    expect(result.current).toEqual({ step: 0, pressed: false });
    act(() => { vi.advanceTimersByTime(BEAT.lead); });
    expect(result.current.step).toBe(1);
  });
});

const row = (id: string, what: string) => ({ id, combo: 'Mod+K' as const, what, short: id, scene: (b: { step: number }) => <span data-testid="scene">{`${id} ${b.step}`}</span> });

describe('the guide', () => {
  it('balances the sections into two columns, in order', () => {
    const s = (title: string, n: number): ShortcutSection => ({ title, rows: Array.from({ length: n }, (_, i) => row(`${title}${i}`, 'x')) });
    expect(balance([s('General', 5), s('Panes', 9), s('Focus', 6), s('History', 2), s('Tabs', 6)]).map((c) => c.map((x) => x.title)))
      .toEqual([['General', 'Panes'], ['Focus', 'History', 'Tabs']]);
    expect(balance([s('Only', 3)])).toHaveLength(1);
  });

  it('acts out the row under the pointer or the focus, and Up and Down move along the rows', () => {
    render(<ShortcutGuide mac sections={[{ title: 'General', rows: [row('search', 'Search your notes'), row('help', 'These shortcuts')] }, { title: 'Panes', rows: [row('split', 'Split right')] }]} />);
    const stage = () => document.querySelector('[data-slot=shortcut-stage]')!;
    expect(stage().textContent).toContain('Search your notes');
    fireEvent.pointerEnter(screen.getByRole('button', { name: /These shortcuts: Command K/ }));
    expect(stage().textContent).toContain('These shortcuts');
    expect(screen.getByTestId('scene').textContent).toBe('help 0');
    const help = screen.getByRole('button', { name: /These shortcuts/ });
    help.focus();
    fireEvent.keyDown(help, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Split right/ }));
    expect(stage().textContent).toContain('Split right');
    expect(screen.getByRole('region', { name: 'Panes' })).toBeTruthy();
  });

  it('locks on a row clicked, until it is clicked again or Esc is pressed', () => {
    render(<ShortcutGuide mac sections={[{ title: 'General', rows: [row('search', 'Search your notes'), row('help', 'These shortcuts')] }]} />);
    const stage = () => document.querySelector('[data-slot=shortcut-stage]')!.textContent;
    const help = () => screen.getByRole('button', { name: /These shortcuts/ });
    const search = () => screen.getByRole('button', { name: /Search your notes/ });
    fireEvent.click(help());
    expect(help().getAttribute('aria-pressed')).toBe('true');
    expect(help().querySelector('[data-slot=shortcut-lock]')).not.toBeNull();
    fireEvent.pointerEnter(search());
    expect(stage()).toContain('These shortcuts');
    fireEvent.click(help());
    expect(help().getAttribute('aria-pressed')).toBe('false');
    fireEvent.pointerEnter(search());
    expect(stage()).toContain('Search your notes');
    // Esc lets go, and is taken (a dialog round it stays open).
    fireEvent.click(help());
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(esc); });
    expect(esc.defaultPrevented).toBe(true);
    expect(help().getAttribute('aria-pressed')).toBe('false');
    const again = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(again); });
    expect(again.defaultPrevented).toBe(false);
  });
});
