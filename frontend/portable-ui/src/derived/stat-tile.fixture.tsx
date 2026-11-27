import { CalendarClock, CircleAlert, CircleCheck, Clock, Flag, ListTodo, Send } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { ProgressRing, StatTile } from './stat-tile';

/** A project's six, as its Overview shows them. */
function Overview({ quiet = false, phone = false }: { quiet?: boolean; phone?: boolean }) {
  return (
    <ul className={phone ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6'}>
      <li className="grid min-w-0"><StatTile href="#tasks" icon={<CircleCheck />} label="Done" value={quiet ? '0%' : '35%'} line={quiet ? 'None of 4 tasks yet' : '6 of 17 tasks'}
        visual={<ProgressRing value={quiet ? 0 : 6 / 17} />} /></li>
      <li className="grid min-w-0"><StatTile href="#design" icon={<Flag />} label="Next milestone" value={quiet ? '12' : '2'} unit="days left" line="Design · 0/3 tasks" tone={quiet ? 'neutral' : 'warn'} /></li>
      <li className="grid min-w-0"><StatTile href="#tasks" icon={<CircleAlert />} label="Overdue" value={quiet ? 0 : 2} empty={quiet} line={quiet ? 'Nothing late' : 'Use case diagram · 2 days late'} tone={quiet ? 'neutral' : 'bad'} /></li>
      <li className="grid min-w-0"><StatTile href="#week" icon={<CalendarClock />} label="Due this week" value={quiet ? 0 : 4} empty={quiet} line={quiet ? 'Nothing due this week' : 'Next: Screen sketches · Fri 20 Nov'} tone={quiet ? 'neutral' : 'info'} /></li>
      <li className="grid min-w-0"><StatTile icon={<Clock />} label="Time this week" value="3.5" unit="h" line="2 h 10 min the week before" /></li>
      <li className="grid min-w-0"><StatTile href="#journal" icon={<Send />} label="Checked in" value={2} unit="of 3" line="This week · not yet: Omar" /></li>
    </ul>
  );
}

export default defineFixtures({
  component: 'derived/stat-tile',
  title: 'Stat tile',
  frame: { width: 1180, padding: 16 },
  cases: {
    'a project’s overview': () => <Overview />,
    'nothing asking for anything': () => <Overview quiet />,
    'on a phone': () => <div className="w-[328px]"><Overview phone /></div>,
    'the projects home': () => (
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li className="grid min-w-0"><StatTile href="#open" icon={<ListTodo />} label="Open" value={3} line="Across 2 projects" /></li>
        <li className="grid min-w-0"><StatTile href="#overdue" icon={<CircleAlert />} label="Overdue" value={1} tone="bad" line="Use case diagram · 2 days late" /></li>
        <li className="grid min-w-0"><StatTile href="#week" icon={<CalendarClock />} label="Due this week" value={1} tone="info" line="Next: Lexer tests · Fri 20 Nov" /></li>
        <li className="grid min-w-0"><StatTile icon={<CalendarClock />} label="Need a date" value={0} empty line="Every task has one" /></li>
      </ul>
    ),
    'rings': () => (
      <div className="flex items-center gap-4">
        {[0, 0.08, 0.35, 0.7, 1].map((v) => <ProgressRing key={v} value={v} size={44} label={`${Math.round(v * 100)}%`} />)}
        <ProgressRing value={0.5} size={44} tone="info" />
        <ProgressRing value={0.5} size={44} tone="bad" />
      </div>
    ),
  },
});
