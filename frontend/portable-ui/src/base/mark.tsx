// Marks: the library’s badges. An icon on a small tile tinted by what it means, never text inside it;
// the words are in a tooltip that opens at once on hover and on keyboard focus. A count sits on the
// tile's corner. The tile is a rounded square (styles.css).
import * as React from 'react';
import { Count } from './count';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn } from '../lib/utils';

export type MarkTone = 'ok' | 'info' | 'warn' | 'bad' | 'thm' | 'ex' | 'neutral';

const TONES: Record<MarkTone, { ink: string; soft: string; line: string }> = {
  ok: { ink: 'var(--ok)', soft: 'var(--ok-soft)', line: 'var(--ok-line)' },
  info: { ink: 'var(--info)', soft: 'var(--info-soft)', line: 'var(--info-line)' },
  warn: { ink: 'var(--warn)', soft: 'var(--warn-soft)', line: 'var(--warn-line)' },
  bad: { ink: 'var(--bad)', soft: 'var(--bad-soft)', line: 'var(--bad-line)' },
  thm: { ink: 'var(--thm)', soft: 'var(--thm-soft)', line: 'var(--thm-line)' },
  ex: { ink: 'var(--ex)', soft: 'var(--ex-soft)', line: 'var(--ex-line)' },
  neutral: { ink: 'var(--neutral)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)' },
};

const SIZES = { sm: 20, md: 24, lg: 32 } as const;

export interface MarkProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** What it means: colours the tile, its icon and its tooltip's swatch. */
  tone?: MarkTone;
  /** The icon, e.g. `<Check />` from lucide-react. */
  icon: React.ReactNode;
  /** Said in bold in the tooltip, and the mark's accessible name. */
  label: string;
  /** A second line in the tooltip. */
  detail?: string;
  /** A number on the tile's corner. */
  count?: number;
  /** Filled with the tone: for the strongest states (new, failed, wrong). */
  solid?: boolean;
  size?: keyof typeof SIZES;
  /** Where the tooltip opens. */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Text a screen reader hears for a mark: the label, the count and the detail. */
export function markName({ label, count, detail }: Pick<MarkProps, 'label' | 'count' | 'detail'>): string {
  return [count !== undefined ? `${label} (${count})` : label, detail].filter(Boolean).join('. ');
}

function Mark({ tone = 'neutral', icon, label, detail, count, solid = false, size = 'md', side = 'top', className, style, ...props }: MarkProps) {
  const t = TONES[tone];
  const px = SIZES[size];
  const glyph = Math.round(px * 0.58);
  return (
    // Built from base: the Tooltip (opening at once) and the Count.
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-slot="mark"
            data-tone={tone}
            role="img"
            tabIndex={0}
            aria-label={markName({ label, count, detail })}
            className={cn(
              'group/mark relative inline-grid shrink-0 place-items-center rounded-md align-middle outline-none',
              'transition-[box-shadow] focus-visible:shadow-[0_0_0_3px_var(--mark-ring)]',
              className,
            )}
            style={{ width: px, height: px, color: solid ? 'var(--background)' : t.ink, ['--mark-ink' as string]: t.ink, ['--mark-ring' as string]: `color-mix(in srgb, ${t.ink} 35%, transparent)`, ...style }}
            {...props}
          >
            <span aria-hidden data-edge className="ui-mark-tile absolute inset-0" style={{ background: solid ? t.ink : t.line }} />
            <span aria-hidden className="ui-mark-tile absolute inset-px" style={{ background: solid ? t.ink : t.soft }} />
            {/* The icon has a size class of its own, so a Button round the mark (a sidebar link) does not
                make it 16 px: it had spilled out of the tile's corner. */}
            <span aria-hidden className="relative grid place-items-center [&>svg]:stroke-[2.2]" style={{ width: glyph, height: glyph }}>
              {React.isValidElement<{ size?: number; className?: string }>(icon) ? React.cloneElement(icon, { size: glyph, className: cn(icon.props.className, 'size-full') }) : icon}
            </span>
            {count !== undefined && <Count aria-hidden value={count} tone={tone} size="sm" corner />}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={8} data-part="mark-tooltip" className="max-w-60 rounded-lg px-2.5 text-left">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <i aria-hidden className="size-[7px] rounded-[2px]" style={{ background: t.line }} />
            {count !== undefined ? `${label} · ${count}` : label}
          </span>
          {detail && <span className="block opacity-75">{detail}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Mark };
