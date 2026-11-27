// The charts: each says what it shows in words (an accessible name with its numbers, values beside
// the marks, a table), draws only what it is given, and copes with nothing.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BurnUpChart, CHART_COLOR, DonutChart, StackedBarList, dayNumber, niceTicks } from './charts';

afterEach(cleanup);

const POINTS = [
  { date: '2026-11-02', total: 3, done: 0 },
  { date: '2026-11-03', total: 5, done: 1 },
  { date: '2026-11-04', total: 8, done: 4 },
];

describe('scales', () => {
  it('ticks counts in steps of 1, 2 or 5 past the most there is', () => {
    expect(niceTicks(17)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(8, 4)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('counts days without the clock moving them', () => {
    expect(dayNumber('2026-11-03') - dayNumber('2026-11-02')).toBe(1);
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-28')).toBe(2);
    expect(dayNumber('2026-11-02T23:30:00Z')).toBe(dayNumber('2026-11-02'));
  });
});

describe('BurnUpChart', () => {
  it('names itself with the latest numbers, ends each line on its number, and has a table of every day', () => {
    render(<BurnUpChart label="Progress over time" points={POINTS} today="2026-11-04" />);
    const chart = screen.getByRole('img', { name: /^Progress over time\. 4 of 8 tasks done on 4 Nov; 3 on 2 Nov\.$/ });
    const texts = [...chart.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('8');
    expect(texts).toContain('4');
    expect(texts).toContain('Today');
    const table = screen.getByRole('table', { name: 'Progress over time' });
    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual(['DateTasksDone', '2 Nov30', '3 Nov51', '4 Nov84']);
    expect(chart.getAttribute('aria-describedby')).toBe(table.id);
    expect(chart.querySelector('[data-slot=burn-up-total]')!.getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
  });

  it('marks its milestones by name, in their tone, and lists them in the table', () => {
    render(<BurnUpChart label="Progress" points={POINTS} today="2026-11-04" end="2026-11-20"
      marks={[{ date: '2026-11-03', label: 'Requirements', tone: 'ok' }, { date: '2026-11-20', label: 'Design', tone: 'info' }, { date: '2026-12-30', label: 'Out of range' }]} />);
    const marks = [...document.querySelectorAll('[data-slot=burn-up-mark]')];
    expect(marks.map((m) => m.querySelector('text')!.firstChild!.textContent)).toEqual(['Requirements', 'Design']);
    expect(marks.map((m) => m.querySelector('text title')!.textContent)).toEqual(['Requirements, 3 Nov', 'Design, 20 Nov']);
    expect(marks.map((m) => m.querySelector('rect')!.getAttribute('fill'))).toEqual(['var(--ok)', 'var(--info)']);
    const foot = screen.getByRole('table').querySelector('tfoot')!;
    expect(foot.textContent).toBe('3 NovRequirements20 NovDesign');
  });

  it('shows a day’s numbers while it is stepped through with the arrow keys', () => {
    render(<BurnUpChart label="Progress" points={POINTS} today="2026-11-04" />);
    const chart = screen.getByRole('img', { name: /^Progress/ });
    fireEvent.focus(chart);
    expect(document.querySelector('[data-slot=burn-up-tip]')!.textContent).toBe('Wed 4 NovTasks: 8Done: 4');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(document.querySelector('[data-slot=burn-up-tip]')!.textContent).toBe('Mon 2 NovTasks: 3Done: 0');
    expect(screen.getByText('Mon 2 Nov: 3 tasks, 0 done')).toBeTruthy();
    fireEvent.keyDown(chart, { key: 'End' });
    expect(document.querySelector('[data-slot=burn-up-tip]')!.textContent).toBe('Wed 4 NovTasks: 8Done: 4');
    fireEvent.blur(chart);
    expect(document.querySelector('[data-slot=burn-up-tip]')).toBeNull();
  });

  it('says so when there is nothing to draw', () => {
    render(<BurnUpChart label="Progress" points={[]} />);
    expect(screen.getByText('Nothing to draw yet.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

const STATUS = [
  { key: 'todo', label: 'To do', value: 8, color: CHART_COLOR.rest },
  { key: 'doing', label: 'Doing', value: 3, color: CHART_COLOR.info },
  { key: 'done', label: 'Done', value: 6, color: CHART_COLOR.ok },
];

describe('DonutChart', () => {
  it('draws a slice a part, says every count, and lists them with their shares', () => {
    render(<DonutChart label="Tasks by status" slices={STATUS} center="17 tasks" />);
    expect(screen.getByRole('img', { name: 'Tasks by status: 8 to do, 3 doing, 6 done' })).toBeTruthy();
    const legend = screen.getByRole('list', { name: 'Tasks by status' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['To do847%', 'Doing318%', 'Done635%']);
    const slices = [...document.querySelectorAll('[data-slot=donut-slice]')];
    expect(slices.map((s) => s.getAttribute('stroke'))).toEqual(['var(--chart-rest)', 'var(--info)', 'var(--ok)']);
    // Pointing at a part of the legend brings its slice forward.
    fireEvent.pointerEnter(within(legend).getAllByRole('listitem')[1]);
    expect(slices.map((s) => s.getAttribute('opacity'))).toEqual(['0.3', '1', '0.3']);
  });

  it('leaves out a part with none, and draws only its ring when there is nothing', () => {
    const { rerender } = render(<DonutChart label="Tasks" slices={STATUS.map((s) => (s.key === 'doing' ? { ...s, value: 0 } : s))} />);
    expect([...document.querySelectorAll('[data-slot=donut-slice]')].map((s) => s.getAttribute('data-key'))).toEqual(['todo', 'done']);
    rerender(<DonutChart label="Tasks" slices={STATUS.map((s) => ({ ...s, value: 0 }))} />);
    expect(document.querySelectorAll('[data-slot=donut-slice]')).toHaveLength(0);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['To do00%', 'Doing00%', 'Done00%']);
  });
});

describe('StackedBarList', () => {
  const series = [{ key: 'done', label: 'Done', color: CHART_COLOR.ok }, { key: 'open', label: 'Open', color: CHART_COLOR.rest }, { key: 'late', label: 'Late', color: CHART_COLOR.bad }];

  it('a row per thing, its name leading where it should, its bar on one scale and read out in words', () => {
    render(<StackedBarList label="Workload" series={series} rows={[
      { key: 'a', name: 'Hamna Akram', label: 'Hamna Akram (you)', href: '/tasks?owner=a', values: { done: 3, open: 2, late: 1 }, aside: '3 open · 1 late · 3 done' },
      { key: 'b', name: 'Zara Khan', href: '/tasks?owner=b', values: { done: 1, open: 2, late: 0 } },
      { key: 'c', name: 'No owner', values: { done: 0, open: 0, late: 0 } },
    ]} />);
    const list = screen.getByRole('list', { name: 'Workload' });
    const rows = within(list).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Hamna Akram (you)' }).getAttribute('href')).toBe('/tasks?owner=a');
    expect(within(rows[0]).getByText('3 open · 1 late · 3 done')).toBeTruthy();
    const bar = within(rows[0]).getByRole('img', { name: 'Hamna Akram: 3 done, 2 open, 1 late' });
    expect(bar.style.width).toBe('100%');
    expect([...bar.children].map((c) => [c.getAttribute('data-key'), (c as HTMLElement).style.flexGrow, c.getAttribute('title')])).toEqual([
      ['done', '3', 'Done: 3'], ['open', '2', 'Open: 2'], ['late', '1', 'Late: 1'],
    ]);
    const second = within(rows[1]).getByRole('img', { name: 'Zara Khan: 1 done, 2 open, 0 late' });
    expect(second.style.width).toBe('50%');
    expect([...second.children].map((c) => c.getAttribute('data-key'))).toEqual(['done', 'open']);
    expect(within(rows[2]).queryByRole('link')).toBeNull();
    expect(within(rows[2]).getByRole('img', { name: 'No owner: 0 done, 0 open, 0 late' })).toBeTruthy();
    // The key names every part.
    expect([...document.querySelectorAll('[data-slot=chart-key]')].map((k) => k.textContent)).toEqual(['Done', 'Open', 'Late']);
  });
});
