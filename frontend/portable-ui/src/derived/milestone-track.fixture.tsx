import { defineFixtures } from '../fixture';
import { MilestoneTrack, type TrackItem } from './milestone-track';

const ITEMS: TrackItem[] = [
  { key: '10', title: 'Requirements', href: '#10', tone: 'ok', state: 'Done', when: 'Done Mon 9 Nov', progress: { done: 4, total: 4 } },
  { key: '11', title: 'Use cases and the domain model', href: '#11', tone: 'bad', state: 'Late', when: 'Due Mon 16 Nov, 5 days late', progress: { done: 2, total: 5 } },
  { key: '12', title: 'Design', href: '#12', tone: 'info', state: 'Next', when: 'Due Mon 23 Nov, in 2 days', progress: { done: 0, total: 3 } },
  { key: '13', title: 'Final hand-in', href: '#13', tone: 'neutral', when: 'Due Fri 4 Dec, in 13 days', progress: { done: 0, total: 5 } },
  { key: '14', title: 'Presentation', href: '#14', tone: 'neutral', when: 'No date yet' },
];
const many: TrackItem[] = [...ITEMS.slice(0, 4), ...['Sprint 3', 'Sprint 4', 'Testing', 'Report'].map((title, i) => ({ key: `x${i}`, title, href: `#x${i}`, tone: 'neutral' as const, when: `Due ${7 + i * 3} Dec` }))];

const card = 'rounded-xl border bg-card p-5';

export default defineFixtures({
  component: 'derived/milestone-track',
  title: 'Milestone track',
  frame: { width: 1000, padding: 16 },
  cases: {
    'five milestones, today between two': () => <div className={card}><MilestoneTrack label="Milestones" items={ITEMS} todayAt={1.71} /></div>,
    'on a tablet': () => <div className="w-[640px] rounded-xl border bg-card p-5"><MilestoneTrack label="Milestones" items={ITEMS} todayAt={1.71} /></div>,
    'on a phone': () => <div className="w-[328px] rounded-xl border bg-card p-4"><MilestoneTrack label="Milestones" items={ITEMS} todayAt={1.71} /></div>,
    'eight, scrolling across': () => <div className={`${card} max-w-[760px]`}><MilestoneTrack label="Milestones" items={many} todayAt={1.71} /></div>,
    'all done, today after them': () => (
      <div className={card}>
        <MilestoneTrack label="Milestones" todayAt={1.5}
          items={ITEMS.slice(0, 2).map((m) => ({ ...m, tone: 'ok' as const, state: 'Done', when: 'Handed in', progress: m.progress && { ...m.progress, done: m.progress.total } }))} />
      </div>
    ),
    'before the first': () => <div className={card}><MilestoneTrack label="Milestones" items={ITEMS.slice(2, 4)} todayAt={-0.5} /></div>,
  },
});
