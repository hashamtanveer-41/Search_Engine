// A stat tile: its label with its icon, the number with its unit, its line last, toned only when
// asked, a link when it leads somewhere; and the ring beside a share, read out only when labelled.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProgressRing, StatTile } from './stat-tile';

afterEach(cleanup);

describe('StatTile', () => {
  it('leads where it says, with its number, unit and line in that order', () => {
    render(<StatTile href="/tasks" title="2 tasks in Library" icon={<svg data-testid="icon" />} label="Overdue" value={2} unit="tasks" line="Use case diagram · 2 days late" tone="bad" data-tile="overdue" />);
    const tile = screen.getByRole('link');
    expect(tile.getAttribute('href')).toBe('/tasks');
    expect(tile.getAttribute('title')).toBe('2 tasks in Library');
    expect(tile.dataset.tone).toBe('bad');
    expect(tile.dataset.tile).toBe('overdue');
    expect(tile.className).toContain('border-bad-line');
    expect(tile.querySelector('[data-number]')!.textContent).toBe('2');
    expect(tile.querySelector('[data-slot=stat-tile-unit]')!.textContent).toBe('tasks');
    expect(tile.lastElementChild!.textContent).toBe('Use case diagram · 2 days late');
    expect(tile.lastElementChild!.getAttribute('title')).toBe('Use case diagram · 2 days late');
    expect(tile.querySelector('[data-icon]')!.getAttribute('aria-hidden')).toBe('true');
    expect(tile.textContent).toBe('Overdue2tasksUse case diagram · 2 days late');
  });

  it('without a link it is a plain box, untoned by default; an empty count is quieter', () => {
    const { container } = render(<StatTile label="Need a date" value={0} empty line="Every task has one" />);
    expect(screen.queryByRole('link')).toBeNull();
    const tile = container.querySelector<HTMLElement>('[data-slot=stat-tile]')!;
    expect(tile.tagName).toBe('DIV');
    expect(tile.dataset.tone).toBe('neutral');
    expect(tile.querySelector('[data-number]')!.className).toContain('text-muted-foreground/70');
    expect(tile.querySelector('[data-slot=stat-tile-visual]')).toBeNull();
  });

  it('draws a picture beside the number, hidden where the tile is too narrow for it', () => {
    const { container } = render(<StatTile label="Done" value="35%" line="6 of 17 tasks" visual={<ProgressRing value={6 / 17} />} />);
    const visual = container.querySelector('[data-slot=stat-tile-visual]')!;
    expect(visual.className).toContain('@[8.5rem]/tile:block');
    expect(visual.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ProgressRing', () => {
  it('fills its share of the circle, and none at all at nothing', () => {
    const { container, rerender } = render(<ProgressRing value={0.25} size={40} thickness={4} />);
    const length = 2 * Math.PI * 18;
    const fill = container.querySelector('[data-slot=progress-ring-fill]')!;
    expect(fill.getAttribute('stroke-dasharray')).toBe(`${length * 0.25} ${length}`);
    expect(fill.getAttribute('class')).toContain('stroke-ok');
    rerender(<ProgressRing value={0} />);
    expect(container.querySelector('[data-slot=progress-ring-fill]')).toBeNull();
    rerender(<ProgressRing value={3} />);
    expect(container.querySelector('[data-slot=progress-ring-fill]')!.getAttribute('stroke-dasharray')).toMatch(/^([\d.]+) \1$/);
  });

  it('is read out when it is given a label', () => {
    render(<ProgressRing value={0.5} label="Half done" tone="info" />);
    expect(screen.getByRole('img', { name: 'Half done' })).toBeTruthy();
  });
});
