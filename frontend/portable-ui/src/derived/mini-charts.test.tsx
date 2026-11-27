// The small charts: their parts in proportion, every bar round, and what they show said in words.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CHART_COLOR } from './charts';
import { BarRows, DayColumns, SegmentBar } from './mini-charts';

afterEach(cleanup);

describe('SegmentBar', () => {
  it('draws each part in proportion in one rounded track, says them all, and keys them', () => {
    render(<SegmentBar label="Tasks" segments={[
      { key: 'done', label: 'Done', value: 2, color: CHART_COLOR.ok },
      { key: 'doing', label: 'Doing', value: 0, color: CHART_COLOR.info },
      { key: 'todo', label: 'To do', value: 6, color: CHART_COLOR.rest },
    ]} />);
    const track = screen.getByRole('img', { name: 'Tasks: 2 done, 0 doing, 6 to do' });
    expect(track.className).toContain('rounded-full');
    expect(track.className).toContain('overflow-hidden');
    // An empty part is not drawn; the others grow by their share.
    expect([...track.children].map((p) => [(p as HTMLElement).dataset.key, (p as HTMLElement).style.flexGrow])).toEqual([['done', '2'], ['todo', '6']]);
    expect(document.querySelector('[data-slot=segment-bar] ul')!.textContent).toBe('Done 2Doing 0To do 6');
  });

  it('with nothing in it, an empty track; without its key when asked', () => {
    render(<SegmentBar label="Tasks" legend={false} segments={[{ key: 'done', label: 'Done', value: 0, color: CHART_COLOR.ok }]} />);
    expect(screen.getByRole('img', { name: 'Tasks: none' }).children).toHaveLength(0);
    expect(document.querySelector('[data-slot=segment-bar] ul')).toBeNull();
  });
});

describe('DayColumns', () => {
  it('a column a day, as tall as its count against the tallest, round, toned; an empty day a low pill', () => {
    render(<DayColumns label="The week ahead" height={60} columns={[
      { key: 'late', label: 'Late', value: 1, tone: 'bad', apart: true },
      { key: 'd0', label: 'Today', title: 'Today, Wed 18 Nov', value: 2, tone: 'warn', strong: true },
      { key: 'd1', label: 'Thu', value: 0 },
      { key: 'd2', label: 'Fri', value: 4, tone: 'info' },
    ]} />);
    expect(screen.getByRole('img', { name: 'The week ahead: Late 1, Today, Wed 18 Nov 2, Thu 0, Fri 4' })).toBeTruthy();
    const bars = [...document.querySelectorAll<HTMLElement>('[data-slot=day-column-bar]')];
    expect(bars.map((b) => b.style.height)).toEqual(['15px', '30px', '4px', '60px']);
    for (const b of bars) expect(b.className).toContain('rounded-full');
    expect(bars[0].style.background).toBe('var(--bad)');
    expect(bars[2].style.background).toBe('var(--muted)');
    const columns = [...document.querySelectorAll<HTMLElement>('[data-slot=day-column]')];
    expect(columns[0].className).toContain('me-2.5');
    expect(columns.map((c) => c.textContent)).toEqual(['1Late', '2Today', '0Thu', '4Fri']);
    // Labels whole, never cut short.
    for (const l of document.querySelectorAll('[data-slot=day-column-label]')) expect(l.className).not.toContain('truncate');
  });
});

describe('BarRows', () => {
  it('labelled bars on one scale, round, the value at the end; none drawn for nothing', () => {
    render(<BarRows label="Time logged" rows={[
      { key: 'now', label: 'Last 7 days', value: 210, display: '3.5 h' },
      { key: 'before', label: 'The 7 before', value: 30, display: '30 min', color: CHART_COLOR.rest },
      { key: 'never', label: 'Earlier', value: 0, display: 'None' },
    ]} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['Last 7 days3.5 h', 'The 7 before30 min', 'EarlierNone']);
    const fills = [...document.querySelectorAll<HTMLElement>('[data-slot=bar-rows-fill]')];
    expect(fills.map((f) => f.style.width)).toEqual(['100%', `${(30 / 210) * 100}%`]);
    for (const f of fills) expect(f.className).toContain('rounded-full');
    expect(screen.getByRole('list', { name: 'Time logged' })).toBeTruthy();
  });
});
