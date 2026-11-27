import * as React from 'react';
import { CalendarDays, Check, ListChecks, MoreHorizontal, Paperclip, Plus } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Button } from '../base/button';
import { Checkbox } from '../base/checkbox';
import { Chip } from '../base/chip';
import { BoardCard, BoardColumn, type BoardTone } from './board';

type Sample = { title: string; tone?: BoardTone; date?: string; dateTone?: 'bad' | 'warn'; done?: string; files?: number; steps?: string; people: string[]; cover?: string; above?: string };

const PEOPLE: Record<string, string> = { HA: 'bg-thm', ZK: 'bg-bad', OF: 'bg-info', MS: 'bg-ok' };
function People({ who }: { who: string[] }) {
  return (
    <span className="flex -space-x-1.5">
      {who.map((p) => <span key={p} className={`grid size-[26px] place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-card ${PEOPLE[p]}`}>{p}</span>)}
    </span>
  );
}

function SampleCard({ s }: { s: Sample }) {
  const [done, setDone] = React.useState(!!s.done);
  return (
    <BoardCard as="li" title={s.title} tone={done ? 'ok' : s.tone} quiet={done} above={s.above}
      leading={<Checkbox checked={done} onCheckedChange={(c) => setDone(c === true)} aria-label={`${s.title}: done`} />}
      cover={s.cover && <div aria-hidden className={`aspect-[16/9] ${s.cover}`} />}
      menu={<Button variant="ghost" size="icon-xs" aria-label={`${s.title}: more`}><MoreHorizontal /></Button>}
      footer={(
        <>
          {done ? <Chip size="sm" tone="ok" className="gap-1"><Check className="size-3" />{s.done ?? 'Today'}</Chip>
            : s.date && <Chip size="sm" tone={s.dateTone} className="gap-1 font-normal"><CalendarDays className="size-3" />{s.date}</Chip>}
          {s.steps && <Chip size="sm" className="gap-1 font-normal"><ListChecks className="size-3" />{s.steps}</Chip>}
          {s.files ? <Chip size="sm" className="gap-1 font-normal"><Paperclip className="size-3" />{s.files}</Chip> : null}
        </>
      )}
      people={<People who={s.people} />} />
  );
}

const COLUMNS: { id: string; title: string; dot: string; cards: Sample[] }[] = [
  { id: 'todo', title: 'To do', dot: 'bg-muted-foreground/50', cards: [
    { title: 'Prepare the moodboard for the landing page', tone: 'warn', date: 'Tomorrow', dateTone: 'warn', files: 3, people: ['HA', 'ZK'], above: 'Design' },
    { title: 'Write the announcement for the launch', tone: 'bad', date: '2 days late', dateTone: 'bad', files: 1, people: ['OF'], above: 'Launch' },
    { title: 'Final edits', date: 'Mon 23 Nov', people: ['MS'] },
  ] },
  { id: 'doing', title: 'Doing', dot: 'bg-info', cards: [
    { title: 'Interview the librarian', date: 'Mon 23 Nov', steps: '1/3', files: 3, people: ['HA'], above: 'Requirements' },
    { title: 'Find references for the cover', date: 'Fri 27 Nov', files: 2, people: ['ZK', 'OF', 'MS'], cover: 'bg-[linear-gradient(120deg,var(--thm),var(--info)_45%,var(--warn)_70%,var(--bad))]' },
  ] },
  { id: 'done', title: 'Done', dot: 'bg-ok', cards: [
    { title: 'A detailed brief for the group', done: 'Thu 19 Nov', files: 3, people: ['HA'] },
    { title: 'Call with the client', done: 'Tue 17 Nov', people: ['OF'] },
  ] },
];

function Board({ empty = false }: { empty?: boolean }) {
  return (
    <div className="grid grid-cols-3 items-start gap-3">
      {COLUMNS.map((c) => (
        <BoardColumn key={c.id} title={c.title} titleId={`fixture-${c.id}`} count={empty && c.id === 'doing' ? 0 : c.cards.length} dot={c.dot}
          actions={c.id !== 'done' ? <Button variant="ghost" size="icon-xs" aria-label={`Add a task to ${c.title}`}><Plus /></Button> : undefined}>
          {empty && c.id === 'doing'
            ? <p className="rounded-lg border-2 border-dashed px-3 py-5 text-center text-[12.5px] text-muted-foreground">Nothing here. Drag a card in.</p>
            : <ul className="grid gap-2.5">{c.cards.map((s) => <SampleCard key={s.title} s={s} />)}</ul>}
        </BoardColumn>
      ))}
    </div>
  );
}

export default defineFixtures({
  component: 'derived/board',
  title: 'Board',
  frame: { width: 1080, padding: 16 },
  cases: {
    'a board': () => <Board />,
    'an empty column': () => <Board empty />,
    'one card, held over a column': () => (
      <div className="w-80">
        <BoardColumn title="Doing" titleId="fixture-held" count={1} dot="bg-info" over>
          <ul className="grid gap-2.5"><SampleCard s={COLUMNS[1].cards[0]} /></ul>
        </BoardColumn>
      </div>
    ),
  },
});
