import { defineFixtures } from '../fixture';
import { BurnUpChart, CHART_COLOR, DonutChart, StackedBarList, type BurnUpPoint, type ChartMark } from './charts';

// A project started on 2 Nov, today 21 Nov: tasks added in bursts, done steadily; two milestones
// behind, two ahead.
const START = Date.UTC(2026, 10, 2);
const iso = (day: number) => new Date(START + day * 86_400_000).toISOString().slice(0, 10);
const ADDED = [5, 5, 5, 6, 8, 8, 8, 9, 11, 11, 12, 12, 12, 14, 15, 15, 15, 16, 17, 17];
const DONE = [0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6];
const POINTS: BurnUpPoint[] = ADDED.map((total, i) => ({ date: iso(i), total, done: DONE[i] }));
const MARKS: ChartMark[] = [
  { date: '2026-11-09', label: 'Requirements', tone: 'ok' },
  { date: '2026-11-16', label: 'Use cases and the domain model', tone: 'bad' },
  { date: '2026-11-23', label: 'Design', tone: 'info' },
  { date: '2026-12-04', label: 'Final hand-in', tone: 'neutral' },
];

const STATUS = [
  { key: 'todo', label: 'To do', value: 8, color: CHART_COLOR.rest },
  { key: 'doing', label: 'Doing', value: 3, color: CHART_COLOR.info },
  { key: 'done', label: 'Done', value: 6, color: CHART_COLOR.ok },
];
const WORK = [
  { key: 'done', label: 'Done', color: CHART_COLOR.ok },
  { key: 'open', label: 'Open', color: CHART_COLOR.rest },
  { key: 'late', label: 'Late', color: CHART_COLOR.bad },
];
const person = (initials: string, n: number) => (
  <span aria-hidden className="grid size-[26px] place-items-center rounded-full text-[9.5px] font-semibold text-white" style={{ background: CHART_COLOR.series(n as 1) }}>{initials}</span>
);
const ROWS = [
  { key: 'ha', name: 'Hamna Akram', label: 'Hamna Akram (you)', lead: person('HA', 1), href: '#ha', values: { done: 3, open: 2, late: 1 }, aside: '3 open · 1 late · 3 done' },
  { key: 'zk', name: 'Zara Khan', lead: person('ZK', 5), href: '#zk', values: { done: 2, open: 4, late: 0 }, aside: '4 open · 2 done' },
  { key: 'of', name: 'Omar Farooq', lead: person('OF', 3), href: '#of', values: { done: 1, open: 0, late: 2 }, aside: '2 open · 2 late · 1 done' },
  { key: 'none', name: 'No owner', values: { done: 0, open: 1, late: 0 }, aside: '1 open' },
  { key: 'ms', name: 'Maryam Siddiqui', lead: person('MS', 4), href: '#ms', values: { done: 0, open: 0, late: 0 }, aside: 'Nothing yet' },
];

const card = 'rounded-xl border bg-card p-5';

export default defineFixtures({
  component: 'derived/charts',
  title: 'Charts',
  frame: { width: 1000, padding: 16 },
  cases: {
    'burn-up with milestones': () => <div className={card}><BurnUpChart label="Progress over time" points={POINTS} marks={MARKS} today={iso(19)} end="2026-12-04" /></div>,
    'burn-up, today at the end': () => <div className={card}><BurnUpChart label="Progress over time" points={POINTS} marks={MARKS.slice(0, 2)} today={iso(19)} /></div>,
    'burn-up on a phone': () => <div className="w-[328px]"><div className="rounded-xl border bg-card p-4"><BurnUpChart label="Progress over time" points={POINTS} marks={MARKS} today={iso(19)} end="2026-12-04" /></div></div>,
    'burn-up, the first day': () => <div className={card}><BurnUpChart label="Progress over time" points={[{ date: iso(0), total: 3, done: 0 }]} today={iso(0)} /></div>,
    'burn-up with nothing': () => <div className={card}><BurnUpChart label="Progress over time" points={[]} /></div>,
    'tasks by status': () => (
      <div className="grid grid-cols-2 gap-4">
        <div className={card}>
          <DonutChart label="Tasks by status" slices={STATUS}
            center={<><strong className="text-[22px] leading-none font-semibold">17</strong><span className="text-[12px] text-muted-foreground">tasks</span></>} />
        </div>
        <div className={card}><DonutChart label="Tasks by status" slices={STATUS.map((s) => ({ ...s, value: 0 }))} center={<span className="text-[12px] text-muted-foreground">No tasks</span>} /></div>
      </div>
    ),
    'workload by member': () => <div className={`${card} max-w-[520px]`}><StackedBarList label="Workload by member" series={WORK} rows={ROWS} /></div>,
    'workload on a phone': () => <div className="w-[328px] rounded-xl border bg-card p-4"><StackedBarList label="Workload by member" series={WORK} rows={ROWS} /></div>,
  },
});
