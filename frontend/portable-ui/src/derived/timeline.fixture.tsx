import { defineFixtures } from '../fixture';
import { Timeline, type TimelineItem } from './timeline';

// A project's milestones, today 21 Nov: two behind (one handed in, one late), the next in two days,
// two ahead, one far off.
const ITEMS: TimelineItem[] = [
  { key: '1', date: '2026-11-09', title: 'Requirements', tone: 'ok', state: 'Done', detail: 'Done Sun 8 Nov', progress: { done: 4, total: 4 }, href: '#1' },
  { key: '2', date: '2026-11-16', title: 'Use cases and the domain model', tone: 'bad', state: 'Late', detail: 'Due Mon 16 Nov, 5 days ago', progress: { done: 3, total: 5 }, href: '#2' },
  { key: '3', date: '2026-11-23', title: 'Design', tone: 'info', state: 'Next', detail: 'Due Mon 23 Nov, in 2 days', progress: { done: 1, total: 6 }, href: '#3' },
  { key: '4', date: '2026-11-27', title: 'Prototype', detail: 'Due Fri 27 Nov, in 6 days', progress: { done: 0, total: 3 }, href: '#4' },
  { key: '5', date: '2026-12-04', title: 'Final hand-in', detail: 'Due Fri 4 Dec, in 13 days', href: '#5' },
];

const card = 'rounded-xl border bg-card p-5';

export default defineFixtures({
  component: 'derived/timeline',
  title: 'Timeline',
  frame: { width: 1000, padding: 16 },
  cases: {
    'milestones, today among them': () => <div className={card}><Timeline label="Milestones" items={ITEMS} today="2026-11-21" /></div>,
    'one far ahead': () => <div className={card}><Timeline label="Milestones" items={[...ITEMS, { key: '6', date: '2027-03-12', title: 'Showcase', detail: 'Due Fri 12 Mar' }]} today="2026-11-21" /></div>,
    'today before them all': () => <div className={card}><Timeline label="Milestones" items={ITEMS.slice(2)} today="2026-11-02" /></div>,
    'one milestone': () => <div className={card}><Timeline label="Milestones" items={ITEMS.slice(2, 3)} today="2026-11-21" /></div>,
    'on a phone': () => <div className="w-[328px] rounded-xl border bg-card p-3"><Timeline label="Milestones" items={ITEMS} today="2026-11-21" /></div>,
  },
});
