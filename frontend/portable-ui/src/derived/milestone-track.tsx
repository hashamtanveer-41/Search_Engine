// Milestones on one line ("add more widgets and stats stuff that helps"): each in
// date order, a diamond in its tone (done: ok, late: bad, the next one: info and ringed, the rest
// quiet) with its state in words beside its name, its date, how far its tasks are, and its own page
// behind its name; today marked where it falls between them. Evenly spaced, so names never collide;
// the dates say how far apart they are. 36rem wide or more, a horizontal track (scrolling sideways
// when there are too many to fit); narrower (a phone, a side column), the same list down the page.
import * as React from 'react';
import { cn } from '../lib/utils';

export type TrackTone = 'ok' | 'bad' | 'info' | 'neutral';

export type TrackItem = {
  key: string;
  title: string;
  href?: string;
  tone: TrackTone;
  /** Its state in a word ("Done", "Late", "Next"): shown with the colour, never left to it. */
  state?: string;
  /** Its date, said as a reader thinks of it ("Due Mon 23 Nov, in 5 days"). */
  when?: React.ReactNode;
  /** Its tasks, done of all. */
  progress?: { done: number; total: number };
};

export interface MilestoneTrackProps extends React.ComponentProps<'div'> {
  items: TrackItem[];
  /** Where today falls, in items: 0 on the first, 1.5 halfway between the second and the third,
   *  -0.5 before them all, `items.length - 0.5` after. None: not marked. */
  todayAt?: number | null;
  todayLabel?: string;
  /** What the list is, read out. */
  label: string;
}

const DOT: Record<TrackTone, string> = {
  ok: 'bg-ok', bad: 'bg-bad', info: 'bg-info ring-4 ring-info/20', neutral: 'bg-card ring-[1.5px] ring-inset ring-muted-foreground/60',
};
const STATE: Record<TrackTone, string> = { ok: 'text-ok', bad: 'text-bad', info: 'text-info', neutral: 'text-muted-foreground' };

function MilestoneTrack({ items, todayAt = null, todayLabel = 'Today', label, className, ...props }: MilestoneTrackProps) {
  const n = items.length;
  if (!n) return null;
  const at = todayAt === null ? null : Math.max(-0.5, Math.min(n - 0.5, todayAt));
  // Across: each item's centre is (i + 0.5) / n of the way; today likewise.
  const across = at === null ? null : ((at + 0.5) / n) * 100;
  // Down: today's line goes before the first item past it.
  const before = at === null ? -1 : Math.ceil(at + 1e-9);
  const passed = at === null ? 0 : Math.max(0, across! - 50 / n);
  const todayRow = (
    <li key="today" aria-hidden data-slot="track-today-row" className="relative flex items-center gap-2 py-1 ps-7 @xl/track:hidden">
      <span className="absolute start-[5px] top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-foreground" />
      <span className="h-px flex-1 bg-foreground/40" />
      <span className="text-[11.5px] font-medium">{todayLabel}</span>
    </li>
  );
  return (
    <div data-slot="milestone-track" className={cn('@container/track min-w-0', className)} {...props}>
      <div className="min-w-0 overflow-x-auto pb-1">
        {/* As wide as its stops across, at least 7.5rem each (scrolling sideways past that), so the
            rail and today's line, placed in percent, keep to them. */}
        <div className="relative @xl/track:min-w-[calc(var(--n)*7.5rem)]" style={{ ['--n' as string]: n }}>
          {/* The rail across, darker up to today (wide only). */}
          <span aria-hidden className="absolute top-[34px] hidden h-0.5 rounded-full bg-border @xl/track:block" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
          {passed > 0 && <span aria-hidden data-slot="track-passed" className="absolute top-[34px] hidden h-0.5 rounded-full bg-foreground/45 @xl/track:block" style={{ left: `${50 / n}%`, width: `${Math.min(passed, 100 - 100 / n)}%` }} />}
          {across !== null && (
            <span aria-hidden data-slot="track-today" className="absolute top-0 bottom-0 hidden w-0 @xl/track:block" style={{ left: `${across}%` }}>
              {/* At either end the label keeps inside the track. */}
              <span className={cn('absolute top-0 rounded-full bg-foreground px-1.5 text-[11px] leading-[18px] font-medium whitespace-nowrap text-background',
                across < 6 ? '-translate-x-1' : across > 94 ? '-translate-x-[calc(100%-4px)]' : '-translate-x-1/2')}>{todayLabel}</span>
              {/* Down to just past the rail, clear of the names under it. */}
              <span className="absolute top-[18px] h-6 -translate-x-1/2 border-s border-foreground/40" />
            </span>
          )}
          <ol aria-label={label} className="relative grid gap-y-1 @xl/track:grid-cols-[repeat(var(--n),minmax(0,1fr))] @xl/track:gap-0 @xl/track:pt-7">
            {items.map((item, i) => (
              <React.Fragment key={item.key}>
                {i === before && todayRow}
                <TrackStop item={item} last={i === n - 1} />
              </React.Fragment>
            ))}
            {before >= n && todayRow}
          </ol>
        </div>
      </div>
    </div>
  );
}

function TrackStop({ item, last }: { item: TrackItem; last: boolean }) {
  const { title, href, tone, state, when, progress } = item;
  const share = progress && progress.total ? progress.done / progress.total : 0;
  return (
    <li data-slot="track-stop" data-tone={tone}
      className={cn('relative grid min-w-0 content-start gap-1 ps-7 pb-3 text-[13px]',
        // Down: a rail from this diamond to the next.
        !last && 'before:absolute before:start-[8px] before:top-3 before:-bottom-1 before:w-0.5 before:rounded-full before:bg-border',
        '@xl/track:row-start-1 @xl/track:justify-items-center @xl/track:px-2 @xl/track:pt-6 @xl/track:pb-0 @xl/track:text-center @xl/track:before:hidden')}>
      <span aria-hidden data-slot="track-dot"
        className={cn('absolute start-[4px] top-[5px] size-[10px] rotate-45 rounded-[2px] @xl/track:start-1/2 @xl/track:top-[2px] @xl/track:-ms-[5px]', DOT[tone])} />
      <span className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 @xl/track:justify-center">
        {href
          ? <a href={href} className="min-w-0 truncate rounded-sm font-medium text-foreground no-underline hover:underline ui-focus">{title}</a>
          : <span className="min-w-0 truncate font-medium">{title}</span>}
        {state && <span data-slot="track-state" className={cn('text-[12px] font-medium', STATE[tone])}>{state}</span>}
      </span>
      {when && <span className="text-[12px] text-muted-foreground">{when}</span>}
      {progress && progress.total > 0 && (
        <span className="flex w-full max-w-48 items-center gap-2 text-[12px] text-muted-foreground @xl/track:max-w-36">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span data-slot="track-progress" className="block h-full rounded-full bg-ok" style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
          <span className="tabular-nums">{progress.done}/{progress.total}</span>
        </span>
      )}
    </li>
  );
}

export { MilestoneTrack };
