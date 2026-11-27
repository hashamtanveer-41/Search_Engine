import { defineFixtures } from '../fixture';
import { CHART_COLOR } from './charts';
import { BarRows, DayColumns, SegmentBar } from './mini-charts';

const TASKS = [
  { key: 'done', label: 'Done', value: 2, color: CHART_COLOR.ok },
  { key: 'doing', label: 'Doing', value: 1, color: CHART_COLOR.info },
  { key: 'todo', label: 'To do', value: 3, color: CHART_COLOR.rest },
];
const WEEK = [
  { key: 'late', label: 'Late', value: 1, tone: 'bad' as const, apart: true },
  { key: 'd0', label: 'Today', value: 1, tone: 'warn' as const, strong: true },
  { key: 'd1', label: 'Thu', value: 0 },
  { key: 'd2', label: 'Fri', value: 1, tone: 'info' as const },
  { key: 'd3', label: 'Sat', value: 0 },
  { key: 'd4', label: 'Sun', value: 0 },
  { key: 'd5', label: 'Mon', value: 3, tone: 'info' as const },
  { key: 'd6', label: 'Tue', value: 0 },
];
const card = 'grid gap-5 rounded-xl border bg-card p-5';

export default defineFixtures({
  component: 'derived/mini-charts',
  title: 'Small charts',
  frame: { width: 760, padding: 16 },
  cases: {
    'all three': () => (
      <div className={card}>
        <SegmentBar label="Tasks" segments={TASKS} />
        <DayColumns label="The week ahead" columns={WEEK} />
        <BarRows label="Time logged" rows={[
          { key: 'now', label: 'Last 7 days', value: 210, display: '3.5 h' },
          { key: 'before', label: 'The 7 before', value: 30, display: '30 min', color: CHART_COLOR.rest },
        ]} />
      </div>
    ),
    'the week ahead on a phone': () => <div className="w-[300px] rounded-xl border bg-card p-4"><DayColumns label="The week ahead" columns={[...WEEK, { key: 'd7', label: 'Wed', value: 0 }]} /></div>,
    'nothing yet': () => (
      <div className={card}>
        <SegmentBar label="Tasks" segments={TASKS.map((s) => ({ ...s, value: 0 }))} />
        <DayColumns label="The week ahead" columns={WEEK.map((c) => ({ ...c, value: 0 }))} />
        <BarRows label="Time logged" rows={[{ key: 'now', label: 'Last 7 days', value: 0, display: 'None' }]} />
      </div>
    ),
  },
});
