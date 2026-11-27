// A number at a glance, as a tile ("too plain, add more widgets and stats stuff that
// helps"): what it counts (a label with its icon), the number big with its unit, a line of context
// under it (the task that matters, against last week), a small picture beside the number when one
// helps (a ProgressRing), and where the number leads. It is toned only when it asks for something
// (late: bad; due today: warn; this week: info); otherwise it stays plain. The Projects home's four
// tiles and a project's Overview are made of it.
import * as React from 'react';
import { cn } from '../lib/utils';

export type StatTileTone = 'neutral' | 'ok' | 'info' | 'warn' | 'bad';

const TONE: Record<StatTileTone, string> = {
  bad: 'border-bad-line bg-bad-soft/60 [&_[data-number]]:text-bad [&_[data-icon]]:text-bad',
  warn: 'border-warn-line bg-warn-soft/60 [&_[data-number]]:text-warn [&_[data-icon]]:text-warn',
  info: 'border-info-line bg-info-soft/50 [&_[data-number]]:text-info [&_[data-icon]]:text-info',
  ok: 'border-ok-line bg-ok-soft/50 [&_[data-number]]:text-ok [&_[data-icon]]:text-ok',
  neutral: 'bg-card',
};

export interface StatTileProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'children'> {
  /** What it counts, in sentence case. */
  label: React.ReactNode;
  /** An icon before the label (lucide), toned with the tile. */
  icon?: React.ReactNode;
  /** The number (or a short word: "Today"). */
  value: React.ReactNode;
  /** After the number, smaller: "days left", "of 4", "h". */
  unit?: React.ReactNode;
  /** A line of context under it; cut at two lines (the whole of it in a tooltip). */
  line?: React.ReactNode;
  tone?: StatTileTone;
  /** Where it leads: the tile is a link then. */
  href?: string;
  /** Its longer name, on the tile. */
  title?: string;
  /** Beside the number, at the end: a ProgressRing, a small chart. */
  visual?: React.ReactNode;
  /** Nothing to count (a 0): the number is drawn quieter. */
  empty?: boolean;
}

function StatTile({ label, icon, value, unit, line, tone = 'neutral', href, title, visual, empty = false, className, ...props }: StatTileProps) {
  const body = (
    <>
      <span data-slot="stat-tile-label" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        {icon && <span aria-hidden data-icon className="flex shrink-0 [&_svg]:size-4">{icon}</span>}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-end justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <strong data-number className={cn('text-[28px] leading-none font-semibold tracking-tight', empty && 'text-muted-foreground/70')}>{value}</strong>
          {unit && <span data-slot="stat-tile-unit" className="truncate text-[13px] text-muted-foreground">{unit}</span>}
        </span>
        {/* Left out where the tile is too narrow for it beside the number (two tiles a row on a phone). */}
        {visual && <span data-slot="stat-tile-visual" className="hidden shrink-0 @[8.5rem]/tile:block">{visual}</span>}
      </span>
      {line !== undefined && line !== null && line !== false && (
        <span data-slot="stat-tile-line" className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground" title={typeof line === 'string' ? line : undefined}>{line}</span>
      )}
    </>
  );
  const look = cn('@container/tile grid min-w-0 content-start gap-2 rounded-xl border p-4 text-foreground no-underline transition-[border-color,box-shadow]', TONE[tone], className);
  return href
    ? <a href={href} title={title} data-slot="stat-tile" data-tone={tone} className={cn(look, 'hover:border-foreground/20 hover:shadow-sm ui-focus')} {...props}>{body}</a>
    : <div title={title} data-slot="stat-tile" data-tone={tone} className={look} {...props}>{body}</div>;
}

const RING_INK: Record<StatTileTone, string> = { neutral: 'stroke-foreground', ok: 'stroke-ok', info: 'stroke-info', warn: 'stroke-warn', bad: 'stroke-bad' };

export interface ProgressRingProps extends Omit<React.SVGProps<SVGSVGElement>, 'values'> {
  /** How far, 0 to 1. */
  value: number;
  /** Its width and height, px. */
  size?: number;
  /** The ring's thickness, px. */
  thickness?: number;
  tone?: StatTileTone;
  /** Read out; without one it is decoration (the number beside it says it). */
  label?: string;
}

/** A share as a ring, filled clockwise from the top: beside a percentage, so it is never read alone. */
function ProgressRing({ value, size = 36, thickness = 4, tone = 'ok', label, className, ...props }: ProgressRingProps) {
  const share = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - thickness) / 2;
  const length = 2 * Math.PI * r;
  return (
    <svg data-slot="progress-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} {...props}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-muted" />
      {share > 0 && (
        <circle data-slot="progress-ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={`${length * share} ${length}`} className={RING_INK[tone]} />
      )}
    </svg>
  );
}

export { StatTile, ProgressRing };
