// A board's parts ("board still not good, something like this, but in our own style
// and our components"): a column, a soft surface with its title, a count and its menu, lit while a
// card is held over it; and a card, lifted off the column with a shadow rather than drawn with a
// border, an accent bar beside its title in the tone that matters (late, soon, done), a cover picture
// across it when it has one, and a footer of chips with the people on it at the end. The app puts a
// task in it; anything with a title would do.
import * as React from 'react';
import { cn } from '../lib/utils';

export type BoardTone = 'neutral' | 'bad' | 'warn' | 'ok' | 'info';
const BAR: Record<BoardTone, string> = { neutral: 'bg-border', bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok', info: 'bg-info' };

export interface BoardColumnProps extends Omit<React.ComponentProps<'section'>, 'title'> {
  title: React.ReactNode;
  /** The id its heading takes, which names the column. */
  titleId: string;
  count?: number;
  /** A dot before the title, in the column's own colour (a class: `bg-info`). */
  dot?: string;
  /** At the header's end: its menu, an add button. */
  actions?: React.ReactNode;
  /** A card is held over it. */
  over?: boolean;
}

function BoardColumn({ title, titleId, count, dot, actions, over = false, className, children, ...props }: BoardColumnProps) {
  return (
    <section data-slot="board-column" data-over={over || undefined} aria-labelledby={titleId}
      className={cn('grid min-w-0 content-start gap-2.5 rounded-2xl bg-muted/70 p-2.5 ring-1 ring-transparent transition-colors dark:bg-muted/35',
        over && 'bg-info-soft/70 ring-info-line dark:bg-info-soft/70', className)} {...props}>
      <header className="flex min-h-8 items-center gap-2 ps-2 pe-1">
        {dot && <span aria-hidden data-slot="board-column-dot" className={cn('size-2 shrink-0 rounded-full', dot)} />}
        <h2 id={titleId} className="min-w-0 truncate text-[14px] font-semibold">{title}</h2>
        {count !== undefined && (
          <span data-slot="board-column-count" className="rounded-full bg-background px-1.5 text-[11.5px] leading-[18px] text-muted-foreground tabular-nums ring-1 ring-border">{count}</span>
        )}
        {actions && <span className="ms-auto flex shrink-0 items-center gap-0.5">{actions}</span>}
      </header>
      {children}
    </section>
  );
}

export interface BoardCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'li' | 'div' | 'article';
  title: React.ReactNode;
  /** The bar beside the title: what matters about it (late, soon, done). */
  tone?: BoardTone;
  /** Before the title (a task's box). */
  leading?: React.ReactNode;
  /** A small line over the title: what it is in. */
  above?: React.ReactNode;
  /** A picture across the card, under the title. */
  cover?: React.ReactNode;
  /** Chips under it: a date, counts. */
  footer?: React.ReactNode;
  /** At the footer's end: who is on it. */
  people?: React.ReactNode;
  /** Its menu, shown when the card is pointed at or focused (always on a touch screen). */
  menu?: React.ReactNode;
  /** The one open beside the board. */
  current?: boolean;
  /** Finished: drawn a little quieter. */
  quiet?: boolean;
}

function BoardCard({ as: Tag = 'div', title, tone = 'neutral', leading, above, cover, footer, people, menu, current = false, quiet = false, className, ...props }: BoardCardProps) {
  return (
    <Tag data-slot="board-card" data-tone={tone}
      className={cn('group/card relative grid min-w-0 gap-3 overflow-hidden rounded-xl bg-card pb-3.5 text-[13.5px] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_2px_6px_-2px_rgb(0_0_0/0.06)] ring-1 ring-border/60 transition-shadow hover:shadow-[0_2px_4px_rgb(0_0_0/0.06),0_8px_20px_-6px_rgb(0_0_0/0.12)] dark:ring-border',
        !footer && !people && !cover && 'pb-3.5', quiet && 'bg-card/75', current && 'ring-2 ring-info', className)} {...props}>
      <div className="grid gap-1.5 px-3.5 pt-3.5">
        {above && <div data-slot="board-card-above" className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">{above}</div>}
        <div className="relative flex min-w-0 items-start gap-2.5 ps-3">
          <span aria-hidden data-slot="board-card-bar" className={cn('absolute inset-y-0.5 start-0 w-[3px] rounded-full', BAR[tone])} />
          {leading && <span className="flex shrink-0 pt-0.5">{leading}</span>}
          <div data-slot="board-card-title" className={cn('min-w-0 flex-1 text-[14.5px] leading-snug font-medium', quiet && 'text-muted-foreground')}>{title}</div>
          {menu && (
            <div className="-my-1 -me-1.5 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100">{menu}</div>
          )}
        </div>
      </div>
      {cover && <div data-slot="board-card-cover" className="overflow-hidden border-y bg-muted [&_img]:block [&_img]:aspect-[16/9] [&_img]:w-full [&_img]:object-cover">{cover}</div>}
      {(footer || people) && (
        <div data-slot="board-card-footer" className="flex min-w-0 items-center gap-2 px-3.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{footer}</div>
          {people && <div className="shrink-0">{people}</div>}
        </div>
      )}
    </Tag>
  );
}

export { BoardColumn, BoardCard };
