// A count: the small number pill every badge uses (a mark's count, a notification's ×N, a sidebar
// link's due items). Tinted by meaning, its figure in --count-text (white on the light theme's deep
// inks, near-black on the dark theme's light ones); ringed in the background colour so it reads over
// anything (`ring={false}` inside a row, where the ring only draws a dark outline on the row's tint).
// `corner` centres it exactly on its parent's top-right corner.
import * as React from 'react';
import { cn } from '../lib/utils';

export type CountTone = 'ok' | 'info' | 'warn' | 'bad' | 'thm' | 'ex' | 'neutral';

const INK: Record<CountTone, string> = {
  ok: 'var(--ok)', info: 'var(--info)', warn: 'var(--warn)', bad: 'var(--bad)', thm: 'var(--thm)', ex: 'var(--ex)', neutral: 'var(--neutral)',
};

export interface CountProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  value: number;
  tone?: CountTone;
  /** Centre it on the parent's top-right corner (the parent must be positioned). */
  corner?: boolean;
  size?: 'sm' | 'md';
  /** The background-coloured ring that lifts it off an icon; off inside a row. */
  ring?: boolean;
}

function Count({ value, tone = 'neutral', corner = false, size = 'md', ring = true, className, style, ...props }: CountProps) {
  return (
    <span data-slot="count" data-tone={tone}
      className={cn(
        'pointer-events-none z-10 grid place-items-center rounded-full font-mono font-semibold text-[var(--count-text,#fff)] tabular-nums',
        ring && 'shadow-[0_0_0_2px_var(--background)]',
        size === 'sm' ? 'h-[15px] min-w-[15px] px-[3px] text-[9.5px]' : 'h-5 min-w-5 px-1.5 text-[11px]',
        // After the size: tailwind-merge drops a leading-* that comes before a text-[size].
        'leading-none',
        corner && 'absolute top-0 right-0 translate-x-1/2 -translate-y-1/2',
        className,
      )}
      style={{ background: INK[tone], ...style }}
      {...props}>
      {value}
    </span>
  );
}

export { Count };
