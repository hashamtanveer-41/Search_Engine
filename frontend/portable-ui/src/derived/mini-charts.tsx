// Small charts for a card that says several things at once (a project's "Where it stands"; asked for as: "can be combined into one card and have more visual appeal, don't have to be KPI, can be in
// charts"): one rounded bar of shares (SegmentBar: done, doing, to do), a column a day (DayColumns: the
// week ahead, the late ones first) and labelled bars side by side (BarRows: this week's time against
// last week's). Every bar is round at both ends ("not rounded"); each chart says what it
// shows in words for a screen reader, and its numbers are printed beside it, never only drawn.
import * as React from 'react';
import { cn } from '../lib/utils';
import { CHART_COLOR, CHART_VARS, ChartKey } from './charts';

// ------------------------------------------------------------------ one bar of shares

export interface Segment { key: string; label: string; value: number; color: string }
export interface SegmentBarProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Read out before its parts ("Tasks: 2 done, 1 doing, 3 to do"). */
  label: string;
  segments: Segment[];
  /** Its key under it, each part's name and number (default), or none (the numbers are said beside it). */
  legend?: boolean;
  /** The bar's thickness, px. */
  thickness?: number;
}

function SegmentBar({ label, segments, legend = true, thickness = 10, className, ...props }: SegmentBarProps) {
  const total = segments.reduce((n, s) => n + Math.max(0, s.value), 0);
  const shown = segments.filter((s) => s.value > 0);
  const words = `${label}: ${total ? segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ') : 'none'}`;
  return (
    <div data-slot="segment-bar" className={cn('grid min-w-0 gap-2', CHART_VARS, className)} {...props}>
      <div role="img" aria-label={words} data-slot="segment-bar-track" className="flex gap-[2px] overflow-hidden rounded-full bg-muted" style={{ height: thickness }}>
        {shown.map((s) => (
          <span key={s.key} data-slot="segment-bar-part" data-key={s.key} title={`${s.label}: ${s.value}`} className="h-full min-w-[4px]"
            style={{ flexGrow: s.value, flexBasis: 0, background: s.color }} />
        ))}
      </div>
      {legend && (
        <ul aria-hidden className="flex flex-wrap gap-x-3.5 gap-y-1">
          {segments.map((s) => <li key={s.key}><ChartKey color={s.color}>{s.label} <span className="text-foreground tabular-nums">{s.value}</span></ChartKey></li>)}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ a column a day

export type DayColumnTone = 'neutral' | 'ok' | 'info' | 'warn' | 'bad';
export interface DayColumn {
  key: string;
  /** Under it: "Late", "Today", "Thu". */
  label: string;
  value: number;
  tone?: DayColumnTone;
  /** Said when pointed at, and read out in place of the label ("Thursday 19 November"). */
  title?: string;
  /** Set apart from the rest by a gap (the late ones, before the days). */
  apart?: boolean;
  /** Its label in the text colour (today). */
  strong?: boolean;
}
export interface DayColumnsProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  label: string;
  columns: DayColumn[];
  /** The tallest bar's height, px. */
  height?: number;
}

const COLUMN_INK: Record<DayColumnTone, string> = { neutral: CHART_COLOR.rest, ok: CHART_COLOR.ok, info: CHART_COLOR.info, warn: CHART_COLOR.warn, bad: CHART_COLOR.bad };

function DayColumns({ label, columns, height = 56, className, ...props }: DayColumnsProps) {
  const top = Math.max(1, ...columns.map((c) => c.value));
  const words = `${label}: ${columns.map((c) => `${c.title ?? c.label} ${c.value}`).join(', ')}`;
  return (
    <div data-slot="day-columns" role="img" aria-label={words} className={cn('flex min-w-0 items-end gap-1.5 px-1', CHART_VARS, className)} {...props}>
      {columns.map((c) => (
        <div key={c.key} data-slot="day-column" data-key={c.key} data-tone={c.tone ?? 'neutral'} title={`${c.title ?? c.label}: ${c.value}`}
          // The day picked out (today) a little wider, so its longer label ("Today") has room beside the next.
          className={cn('grid min-w-0 justify-items-center gap-1', c.strong ? 'flex-[1.5_1_0%]' : 'flex-1', c.apart && 'me-2.5')}>
          <span className={cn('text-[11px] leading-none tabular-nums', c.value ? 'font-medium text-foreground' : 'text-muted-foreground/70')}>{c.value}</span>
          <span className="flex w-full max-w-7 items-end" style={{ height }}>
            {/* Nothing that day: a low pill, so the day is still there. */}
            <span data-slot="day-column-bar" className="block w-full rounded-full"
              style={c.value ? { height: Math.max(6, (c.value / top) * height), background: COLUMN_INK[c.tone ?? 'neutral'] } : { height: 4, background: 'var(--muted)' }} />
          </span>
          {/* Whole, never cut. */}
          <span data-slot="day-column-label" className={cn('text-[11px] leading-none whitespace-nowrap', c.strong ? 'font-semibold text-foreground' : c.tone === 'bad' && c.value ? 'font-medium text-bad' : 'text-muted-foreground')}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ labelled bars

export interface BarRowsItem {
  key: string;
  label: React.ReactNode;
  value: number;
  /** The value in words, at the end ("3.5 h"). */
  display: React.ReactNode;
  color?: string;
}
export interface BarRowsProps extends Omit<React.ComponentProps<'ul'>, 'children'> {
  label: string;
  rows: BarRowsItem[];
  /** The scale's end; the largest value when not given. */
  max?: number;
}

function BarRows({ label, rows, max, className, ...props }: BarRowsProps) {
  const top = Math.max(1, max ?? 0, ...rows.map((r) => r.value));
  return (
    <ul data-slot="bar-rows" aria-label={label} className={cn('grid min-w-0 gap-2', CHART_VARS, className)} {...props}>
      {rows.map((r) => (
        <li key={r.key} data-key={r.key} className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-baseline justify-between gap-2 text-[12.5px]">
            <span className="min-w-0 truncate text-muted-foreground">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.display}</span>
          </span>
          <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-muted">
            {r.value > 0 && <span data-slot="bar-rows-fill" className="block h-full min-w-2 rounded-full" style={{ width: `${(r.value / top) * 100}%`, background: r.color ?? CHART_COLOR.info }} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { SegmentBar, DayColumns, BarRows };
