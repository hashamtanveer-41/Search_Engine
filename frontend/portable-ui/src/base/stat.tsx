// Stat: one number at a glance (workers online, lessons published, students enrolled), as a tile
// with its label under it and an optional hint. StatGroup lays tiles out in a grid that fits as
// many as there is room for, each at least 120px wide. `tone` colours the number by meaning.
//
//   <StatGroup aria-label="Workers at a glance"><Stat label="Online" value={4} tone="ok" /></StatGroup>
import * as React from 'react';
import { cn } from '../lib/utils';

export type StatTone = 'neutral' | 'ok' | 'info' | 'warn' | 'bad';

const INK: Record<StatTone, string> = {
  neutral: 'text-foreground',
  ok: 'text-ok',
  info: 'text-info',
  warn: 'text-warn',
  bad: 'text-bad',
};

/** A list of Stat tiles, in a grid that wraps (as many 120px-or-wider columns as fit). */
function StatGroup({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot="stat-group" className={cn('grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3', className)} {...props} />;
}

export interface StatProps extends Omit<React.ComponentProps<'li'>, 'children' | 'value'> {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatTone;
}

function Stat({ label, value, hint, tone = 'neutral', className, ...props }: StatProps) {
  return (
    <li data-slot="stat" data-tone={tone} className={cn('grid min-w-0 content-start gap-0.5 rounded-xl border bg-card p-4', className)} {...props}>
      <strong data-slot="stat-value" className={cn('text-2xl leading-tight font-semibold tracking-tight tabular-nums', INK[tone])}>{value}</strong>
      <span data-slot="stat-label" className="text-xs text-muted-foreground">{label}</span>
      {hint !== undefined && hint !== null && hint !== false && <small data-slot="stat-hint" className="text-[11.5px] text-muted-foreground/80">{hint}</small>}
    </li>
  );
}

export { StatGroup, Stat };
