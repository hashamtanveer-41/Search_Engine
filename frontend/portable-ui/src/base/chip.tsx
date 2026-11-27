// Chip: a small rounded label — a tag, a state, an item in a list (job-2, FK, set, changed, dropped).
// One component for all of them, so every pill in the kit has the same height, radius, type and tone
// colours. `tone` picks the semantic colour; `variant` soft (tinted, the default) or outline; `struck`
// for something crossed out (dropped). Chips are always in the interface font (a mono font's
// descenders and widths made short words like job-2 look off-centre); `mono` is kept for callers and
// only tightens the figures. Keep a chip's text one run of
// inline text (a second, quieter part goes in a <span>, not a flex item), so it shares one baseline. Count (count.tsx) is the round
// number badge; marks (mark.tsx) are icon tiles; this is for words.
import * as React from 'react';
import { cn } from '../lib/utils';

export type ChipTone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad' | 'thm' | 'ex';

const SOFT: Record<ChipTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-info-line bg-info-soft text-info',
  ok: 'border-ok-line bg-ok-soft text-ok',
  warn: 'border-warn-line bg-warn-soft text-warn',
  bad: 'border-bad-line bg-bad-soft text-bad',
  thm: 'border-thm-line bg-thm-soft text-thm',
  ex: 'border-ex-line bg-ex-soft text-ex',
};
const OUTLINE: Record<ChipTone, string> = {
  neutral: 'border-border bg-background text-foreground',
  info: 'border-info-line bg-background text-info',
  ok: 'border-ok-line bg-background text-ok',
  warn: 'border-warn-line bg-background text-warn',
  bad: 'border-bad-line bg-background text-bad',
  thm: 'border-thm-line bg-background text-thm',
  ex: 'border-ex-line bg-background text-ex',
};

export interface ChipProps extends React.ComponentProps<'span'> {
  tone?: ChipTone;
  variant?: 'soft' | 'outline';
  size?: 'sm' | 'md';
  mono?: boolean;
  struck?: boolean;
}

function Chip({ tone = 'neutral', variant = 'soft', size = 'md', mono = false, struck = false, className, ...props }: ChipProps) {
  return (
    <span data-slot="chip" data-tone={tone}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border align-middle whitespace-nowrap',
        // Text is centred on its capital height (text-box trim), so descenders (j, g, p) hang below
        // instead of pushing the word up: it reads as centred in the pill.
        size === 'sm' ? 'h-[18px] px-1.5 text-[10.5px] font-semibold' : 'h-6 px-2.5 text-[11.5px]',
        '[text-box:trim-both_cap_alphabetic] leading-none',
        mono && 'tabular-nums',
        struck && 'line-through',
        (variant === 'soft' ? SOFT : OUTLINE)[tone],
        className,
      )}
      {...props} />
  );
}

export { Chip };
