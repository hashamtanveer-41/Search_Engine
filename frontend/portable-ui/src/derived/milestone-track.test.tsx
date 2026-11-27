// The milestone track: every milestone in the order given, each with its state in words and its tone,
// its date, its tasks and its page; today marked where it falls (across, and as a row down the page).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MilestoneTrack, type TrackItem } from './milestone-track';

afterEach(cleanup);

const ITEMS: TrackItem[] = [
  { key: '1', title: 'Requirements', href: '/m/1', tone: 'ok', state: 'Done', when: 'Done Mon 9 Nov', progress: { done: 4, total: 4 } },
  { key: '2', title: 'Design', href: '/m/2', tone: 'info', state: 'Next', when: 'Due Mon 23 Nov, in 2 days', progress: { done: 1, total: 4 } },
  { key: '3', title: 'Report', tone: 'neutral', when: 'No date yet' },
];

describe('MilestoneTrack', () => {
  it('lists each milestone with its link, state, date and tasks', () => {
    render(<MilestoneTrack label="Milestones" items={ITEMS} todayAt={0.5} />);
    const list = screen.getByRole('list', { name: 'Milestones' });
    const stops = within(list).getAllByRole('listitem');
    expect(stops.map((s) => s.textContent)).toEqual(['RequirementsDoneDone Mon 9 Nov4/4', 'DesignNextDue Mon 23 Nov, in 2 days1/4', 'ReportNo date yet']);
    expect(within(stops[0]).getByRole('link', { name: 'Requirements' }).getAttribute('href')).toBe('/m/1');
    expect(within(stops[2]).queryByRole('link')).toBeNull();
    expect(stops.map((s) => s.dataset.tone)).toEqual(['ok', 'info', 'neutral']);
    expect(stops[1].querySelector('[data-slot=track-dot]')!.className).toContain('bg-info');
    expect((stops[1].querySelector('[data-slot=track-progress]') as HTMLElement).style.width).toBe('25%');
  });

  it('marks today across (a share of the way) and down (a row before the first milestone past it)', () => {
    const { rerender } = render(<MilestoneTrack label="Milestones" items={ITEMS} todayAt={0.5} />);
    // Three across: the first's centre is at 1/6, today halfway to the second: 1/3.
    expect((document.querySelector('[data-slot=track-today]') as HTMLElement).style.left).toBe(`${(1 / 3) * 100}%`);
    const order = () => [...document.querySelectorAll('ol > li')].map((li) => (li as HTMLElement).dataset.slot);
    expect(order()).toEqual(['track-stop', 'track-today-row', 'track-stop', 'track-stop']);
    expect(document.querySelector('[data-slot=track-today-row]')!.getAttribute('aria-hidden')).toBe('true');
    rerender(<MilestoneTrack label="Milestones" items={ITEMS} todayAt={-0.5} />);
    expect(order()).toEqual(['track-today-row', 'track-stop', 'track-stop', 'track-stop']);
    expect((document.querySelector('[data-slot=track-today]') as HTMLElement).style.left).toBe('0%');
    rerender(<MilestoneTrack label="Milestones" items={ITEMS} todayAt={9} />);
    expect(order()).toEqual(['track-stop', 'track-stop', 'track-stop', 'track-today-row']);
    expect((document.querySelector('[data-slot=track-today]') as HTMLElement).style.left).toBe('100%');
    rerender(<MilestoneTrack label="Milestones" items={ITEMS} todayAt={null} />);
    expect(document.querySelector('[data-slot=track-today]')).toBeNull();
    expect(document.querySelector('[data-slot=track-today-row]')).toBeNull();
  });

  it('draws nothing with no milestones', () => {
    const { container } = render(<MilestoneTrack label="Milestones" items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
