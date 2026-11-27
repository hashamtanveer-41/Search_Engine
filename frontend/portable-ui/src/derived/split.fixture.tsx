import * as React from 'react';
import { ArrowLeftRight, CalendarRange, Check, ListChecks, NotebookText } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Button } from '../base/button';
import { Checkbox } from '../base/checkbox';
import { Chip } from '../base/chip';
import { Split, SplitDropZone, type SplitOrientation } from './split';

const TASKS = [
  { title: 'Use case diagram', due: '2 days late', tone: 'bad' as const },
  { title: 'Screen sketches', due: 'Fri 20 Nov' },
  { title: 'ER diagram', due: 'Sat 21 Nov' },
  { title: 'Interview the librarian', done: true },
  { title: 'Final edits', due: 'Mon 23 Nov' },
];

function Tasks() {
  return (
    <div className="grid gap-4 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      <div className="overflow-hidden rounded-xl border">
        <header className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5"><b className="flex-1 text-[15px]">Design</b><span className="text-[12.5px] text-muted-foreground">1/5</span></header>
        <ul className="grid py-1">
          {TASKS.map((t) => (
            <li key={t.title} className="flex items-center gap-3 px-4 py-2 text-[14px]">
              <Checkbox defaultChecked={t.done} aria-label={`${t.title}: done`} />
              <span className={t.done ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{t.title}</span>
              {t.done ? <Chip size="sm" tone="ok" className="gap-1"><Check className="size-3" />Done</Chip> : <Chip size="sm" tone={t.tone} className="font-normal">{t.due}</Chip>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Timeline() {
  const bars = [[0, 3, 'bg-bad'], [2, 5, 'bg-info'], [3, 7, 'bg-info'], [6, 9, 'bg-ok'], [5, 10, 'bg-warn']] as const;
  return (
    <div className="grid gap-4 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
      <div className="grid gap-2 rounded-xl border p-3">
        {bars.map(([from, to, tone], i) => (
          <div key={i} className="grid h-7 grid-cols-12 items-center gap-0 border-b border-dashed last:border-b-0">
            <span className={`h-3 rounded-full ${tone}`} style={{ gridColumn: `${from + 1} / ${to + 1}` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Pair({ orientation, share: start = 0.5 }: { orientation: SplitOrientation; share?: number }) {
  const [share, setShare] = React.useState(start);
  return (
    <Split orientation={orientation} share={share} onShareChange={setShare} className={orientation === 'row' ? 'h-[460px] rounded-lg border' : 'h-[720px] rounded-lg border'}
      panes={[
        { id: 'tasks', title: 'Tasks', icon: <ListChecks />, onClose: () => undefined, children: <Tasks /> },
        { id: 'timeline', title: 'Timeline', icon: <CalendarRange />, onClose: () => undefined,
          actions: <Button variant="ghost" size="icon-sm" aria-label="Make it the main page" title="Make it the main page"><ArrowLeftRight /></Button>, children: <Timeline /> },
      ]} />
  );
}

export default defineFixtures({
  component: 'derived/split',
  title: 'Split',
  frame: { width: 1080, padding: 16 },
  cases: {
    'side by side': () => <Pair orientation="row" />,
    'divider moved': () => <Pair orientation="row" share={0.62} />,
    'stacked on a phone': () => <div className="mx-auto w-[390px]"><Pair orientation="column" /></div>,
    // What a page dragged from the sidebar shows over the page (drawn in place here, not over the window).
    'dropping beside': () => (
      <div className="relative h-[360px] overflow-hidden rounded-lg border p-5">
        <div className="grid gap-3 opacity-80"><h1 className="text-2xl font-semibold tracking-tight">Tasks</h1><p className="text-muted-foreground">Drop a page on the right half to open it beside.</p></div>
        <SplitDropZone className="absolute" rect={{ left: 522, top: 0, width: 524, height: 358 }} label="Open beside" over />
        <span className="pointer-events-none absolute top-[96px] left-[600px] flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-[12.5px] font-medium text-background shadow-lg"><NotebookText className="size-3.5" />Journal</span>
      </div>
    ),
  },
  play: {
    'side by side': [{ wait: 300 }, { drag: { from: '[data-slot=split-divider]', by: [-200, 0], ms: 900 } }, { wait: 600 }],
  },
});
