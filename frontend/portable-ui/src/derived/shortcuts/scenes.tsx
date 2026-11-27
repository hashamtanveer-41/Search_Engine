// Small pieces a shortcut is acted out with (guide.tsx): a window of the app drawn in outline (top
// bar, sidebar, page), lines standing in for text, and what a shortcut brings up over it, growing in.
import * as React from 'react';
import { cn } from '../../lib/utils';

/** Lines standing in for text: `widths` in percent, one per line. */
export function MiniLines({ widths = [90, 70, 82, 55], className }: { widths?: number[]; className?: string }) {
  return (
    <span aria-hidden className={cn('grid content-start gap-[7%]', className)}>
      {widths.map((w, i) => <span key={i} className="block h-1.5 rounded-full bg-muted-foreground/20" style={{ width: `${w}%` }} />)}
    </span>
  );
}

/** Something a shortcut brings up (a search, a menu, a dialog), growing in when `shown`. */
export function MiniAppear({ shown, className, children }: { shown: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <span aria-hidden data-shown={shown || undefined}
      className={cn('absolute rounded-md border bg-popover opacity-0 shadow-md transition-[opacity,scale] duration-200 ease-out scale-95 data-[shown]:scale-100 data-[shown]:opacity-100 motion-reduce:transition-none', className)}>
      {children}
    </span>
  );
}

export type MiniPart = 'bar' | 'page' | 'notice';

const RING = 'outline-2 -outline-offset-2 outline-transparent transition-[outline-color] duration-200 data-[ringed]:outline-primary';

/** A window of the app in outline: `ring` outlines one part (F6 moving between them), `page` is
 *  what the page shows (lines when not given), `notice` a notice in its corner, and `children` what
 *  a shortcut brings up over it all. */
export function MiniWindow({ ring, page, notice = false, children }: { ring?: MiniPart; page?: React.ReactNode; notice?: boolean; children?: React.ReactNode }) {
  const part = (p: MiniPart) => ({ 'data-part': p, 'data-ringed': ring === p || undefined });
  return (
    <span aria-hidden data-slot="mini-window" className="relative flex h-full flex-col overflow-hidden rounded-md border bg-background shadow-xs">
      <span {...part('bar')} className={cn('flex h-[15%] shrink-0 items-center gap-[4%] rounded-t-md border-b px-[5%]', RING)}>
        <span className="h-1.5 w-[18%] rounded-full bg-muted-foreground/30" />
        <span className="ml-auto h-[52%] w-[26%] rounded-sm border bg-muted/60" />
        <span className="aspect-square h-[46%] rounded-full bg-muted-foreground/20" />
        <span className="aspect-square h-[46%] rounded-full bg-muted-foreground/20" />
      </span>
      <span className="flex min-h-0 flex-1">
        <span className="w-[26%] shrink-0 border-r p-[4%]"><MiniLines widths={[80, 64, 72, 58, 68]} /></span>
        <span {...part('page')} className={cn('relative min-w-0 flex-1 rounded-br-md p-[5%]', RING)}>{page ?? <MiniLines widths={[46, 92, 84, 90, 62, 88, 74]} />}</span>
      </span>
      {notice && <span {...part('notice')} className={cn('absolute right-[4%] bottom-[5%] grid h-[20%] w-[40%] items-center rounded-md border bg-popover px-[4%] shadow-md', RING)}><MiniLines widths={[86, 58]} /></span>}
      {children}
    </span>
  );
}
