// Small charts, drawn by us in SVG and HTML ("too plain, add more widgets and stats
// stuff that helps"; "build from our components"). Each shows real numbers only, says them in words
// as well (an accessible name, the values beside the marks, a table for a screen reader), is drawn
// with the theme's tokens alone so it reads the same in light and dark, and fits a 360px phone.
//
// - BurnUpChart: how much there is against how much is done, day by day (or week by week): two
//   lines from the start to today, dated marks (milestones) as ticks with their names, today marked;
//   pointed at or stepped through with the arrow keys, a day's numbers show.
// - DonutChart: shares of a whole (tasks by status), with its legend of counts and percentages.
// - StackedBarList: a row per thing (a member), its bar split into parts (done, open, late) on one
//   scale, its numbers in words beside it, the row's name leading somewhere.
//
// Marks follow one spec: 2px lines, hairline grid in the border colour, a 2px gap between touching
// parts, the end dots ringed in the card's colour, numbers and labels in text colours (never in the
// series colour).
import * as React from 'react';
import { cn } from '../lib/utils';

/** The colours a chart's parts take: meaning (ok, info, warn, bad), a quiet grey for what is still to
 *  do (deeper in dark, so it stays apart from the blue), and the six series colours. */
export const CHART_COLOR = {
  rest: 'var(--chart-rest)', ok: 'var(--ok)', info: 'var(--info)', warn: 'var(--warn)', bad: 'var(--bad)',
  series: (n: 1 | 2 | 3 | 4 | 5 | 6) => `var(--series-${n})`,
} as const;
/** On every chart's root: defines `--chart-rest` for the theme. */
export const CHART_VARS = '[--chart-rest:var(--muted-foreground)] dark:[--chart-rest:color-mix(in_oklab,var(--muted-foreground)_72%,var(--card))]';

// ---------------------------------------------------------------- dates and scales

const DAY_MS = 86_400_000;
/** A YYYY-MM-DD day as a whole number of days (UTC, so no clock or zone moves it). */
export const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const dayDate = (iso: string) => new Date(dayNumber(iso) * DAY_MS);
const shortDay = (iso: string) => dayDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = (iso: string) => dayDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const isoOfDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Whole-number ticks from 0 past `max`: at most about `count` steps of 1, 2 or 5 (× 10ⁿ). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** The element's width as it is laid out, kept current; `fallback` until it is measured (and in
 *  jsdom, which lays nothing out). */
function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(Math.round(w)); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, width];
}

/** About how wide a label is at 11px Geist (no layout to measure in a test, or before paint). */
const textWidth = (text: string) => text.length * 6.1;
/** A label cut to `width` px, with an ellipsis. */
function fit(text: string, width: number): string | null {
  if (textWidth(text) <= width) return text;
  const chars = Math.floor(width / 6.1) - 1;
  return chars >= 4 ? `${text.slice(0, chars).trimEnd()}…` : null;
}

/** A small key: a swatch or a line in a colour, and what it stands for. */
export function ChartKey({ color, shape = 'square', children, className }: { color: string; shape?: 'square' | 'line' | 'diamond'; children: React.ReactNode; className?: string }) {
  return (
    <span data-slot="chart-key" className={cn('inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground', className)}>
      <span aria-hidden className={cn('shrink-0', shape === 'line' ? 'h-0.5 w-3.5 rounded-full' : shape === 'diamond' ? 'size-2 rotate-45 rounded-[1.5px]' : 'size-2.5 rounded-[3px]')} style={{ background: color }} />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- burn-up

export type BurnUpPoint = { date: string; total: number; done: number };
export type ChartMarkTone = 'ok' | 'bad' | 'info' | 'neutral';
/** A date to mark on the time axis (a milestone), with its name. */
export type ChartMark = { date: string; label: string; tone?: ChartMarkTone };
const MARK_COLOR: Record<ChartMarkTone, string> = { ok: 'var(--ok)', bad: 'var(--bad)', info: 'var(--info)', neutral: 'var(--muted-foreground)' };

export interface BurnUpChartProps extends Omit<React.ComponentProps<'figure'>, 'children'> {
  /** In date order, one a day or a week; the last is today's. */
  points: BurnUpPoint[];
  /** Where the time axis ends, past the last point (the last milestone's date). */
  end?: string;
  marks?: ChartMark[];
  today?: string;
  /** What it shows: its accessible name and its table's caption. */
  label: string;
  totalLabel?: string;
  doneLabel?: string;
  /** The plot's height with its axes, px. */
  height?: number;
}

const M = { right: 30, bottom: 24, left: 30 };

function BurnUpChart({ points, end, marks = [], today, label, totalLabel = 'Tasks', doneLabel = 'Done', height = 220, className, ...props }: BurnUpChartProps) {
  const [box, width] = useWidth<HTMLDivElement>(560);
  const [active, setActive] = React.useState<number | null>(null);
  const tableId = React.useId();
  if (!points.length) {
    return <figure data-slot="burn-up" className={cn('grid min-h-24 place-items-center text-[13px] text-muted-foreground', className)} {...props}>Nothing to draw yet.</figure>;
  }
  const first = dayNumber(points[0].date);
  const lastPoint = points[points.length - 1];
  // At least a week across, so a project's first days are not one squeezed dot.
  const last = Math.max(dayNumber(lastPoint.date), end ? dayNumber(end) : 0, today ? dayNumber(today) : 0, first + 6);
  const shownMarks = marks.filter((m) => { const n = dayNumber(m.date); return n >= first && n <= last; });
  const top = shownMarks.length ? 40 : 14;
  const W = Math.max(width, 240);
  const plotW = W - M.left - M.right;
  const plotH = height - top - M.bottom;
  const max = Math.max(1, ...points.map((p) => p.total));
  const ticks = niceTicks(max, plotH < 120 ? 3 : 4);
  const yTop = ticks[ticks.length - 1];
  const x = (iso: string) => M.left + ((dayNumber(iso) - first) / (last - first)) * plotW;
  const y = (v: number) => top + plotH - (v / yTop) * plotH;
  const line = (key: 'total' | 'done') => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const area = `${line('done')}L${x(lastPoint.date).toFixed(1)},${y(0)}L${x(points[0].date).toFixed(1)},${y(0)}Z`;

  // Dates along the bottom: the start, the end, and evenly between as room allows; today is said
  // there too ("Today", under its line), and a date too close to it gives way.
  const slots = Math.max(1, Math.min(6, Math.floor(plotW / 92)));
  const todayX = today ? x(today) : null;
  const xTicks = [...new Set(Array.from({ length: slots + 1 }, (_, i) => Math.round(first + ((last - first) * i) / slots)))].map(isoOfDay)
    .filter((d) => todayX === null || Math.abs(x(d) - todayX) > 44);

  // Marks' names over the plot in two lanes, cut to fit; a name with no room is left to the table.
  const lanes = [-Infinity, -Infinity];
  const placed = [...shownMarks].sort((a, b) => dayNumber(a.date) - dayNumber(b.date)).map((m) => {
    const cx = x(m.date);
    // The whole name in either lane, else cut to the room there is.
    for (const [lane, cut] of [[0, false], [1, false], [0, true], [1, true]] as const) {
      const text = cut ? fit(m.label, 2 * (cx - lanes[lane] - 8)) : fit(m.label, 150);
      if (!text) continue;
      const w = textWidth(text);
      const left = Math.max(M.left - 10, Math.min(cx - w / 2, W - w));
      if (left >= lanes[lane] + 8) {
        lanes[lane] = left + w;
        return { mark: m, cx, text, lx: left + w / 2, lane };
      }
    }
    return { mark: m, cx, text: null, lx: cx, lane: 0 };
  });

  const at = active === null ? null : points[active];
  const say = (p: BurnUpPoint) => `${longDay(p.date)}: ${p.total} ${totalLabel.toLowerCase()}, ${p.done} ${doneLabel.toLowerCase()}`;
  const summary = `${label}. ${lastPoint.done} of ${lastPoint.total} ${totalLabel.toLowerCase()} ${doneLabel.toLowerCase()} on ${shortDay(lastPoint.date)}; ${points[0].total} on ${shortDay(points[0].date)}.`;
  const nearest = (px: number) => {
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i; });
    return best;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const i = active ?? points.length - 1;
    const next = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(Math.max(0, Math.min(points.length - 1, next)));
  };

  return (
    <figure data-slot="burn-up" className={cn('relative m-0 grid min-w-0 gap-2', CHART_VARS, className)} {...props}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <ChartKey color="var(--chart-rest)" shape="line">{totalLabel}</ChartKey>
        <ChartKey color="var(--ok)" shape="line">{doneLabel}</ChartKey>
        {shownMarks.length > 0 && <ChartKey color="var(--muted-foreground)" shape="diamond">Milestones</ChartKey>}
      </div>
      <div ref={box} className="relative min-w-0">
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary} aria-describedby={tableId} tabIndex={0}
          className="block max-w-full overflow-visible rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
          onKeyDown={onKey} onFocus={() => setActive((a) => a ?? points.length - 1)} onBlur={() => setActive(null)}>
          {/* The grid and the counts up the side. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{t}</text>
            </g>
          ))}
          {xTicks.map((d) => (
            <text key={d} x={x(d)} y={height - 6} textAnchor={x(d) < M.left + 20 ? 'start' : x(d) > W - M.right - 20 ? 'end' : 'middle'} className="fill-muted-foreground text-[11px]">{shortDay(d)}</text>
          ))}
          {/* Milestones: a hairline at the date, a diamond on top in its tone, its name over it. */}
          {placed.map(({ mark, cx, text, lx, lane }) => (
            <g key={`${mark.date}-${mark.label}`} data-slot="burn-up-mark">
              <line x1={cx} x2={cx} y1={top} y2={y(0)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <rect x={cx - 3.5} y={top - 3.5} width={7} height={7} rx={1.5} transform={`rotate(45 ${cx} ${top})`} fill={MARK_COLOR[mark.tone ?? 'neutral']} stroke="var(--card)" strokeWidth={2} />
              {text && <text x={lx} y={top - 10 - lane * 13} textAnchor="middle" className="fill-muted-foreground text-[11px]">{text}<title>{`${mark.label}, ${shortDay(mark.date)}`}</title></text>}
            </g>
          ))}
          {todayX !== null && (
            <g data-slot="burn-up-today">
              <line x1={todayX} x2={todayX} y1={top} y2={y(0)} stroke="var(--foreground)" strokeOpacity={0.45} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={todayX} y={height - 6} textAnchor={todayX < M.left + 20 ? 'start' : todayX > W - M.right - 20 ? 'end' : 'middle'} className="fill-foreground text-[11px] font-medium">Today</text>
            </g>
          )}
          <path d={area} fill="var(--ok)" fillOpacity={0.1} />
          <path data-slot="burn-up-total" d={line('total')} fill="none" stroke="var(--chart-rest)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path data-slot="burn-up-done" d={line('done')} fill="none" stroke="var(--ok)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* Where each line ends, with its number: the total over its dot, done under its own. */}
          {(['total', 'done'] as const).map((key) => (
            <g key={key}>
              <circle cx={x(lastPoint.date)} cy={y(lastPoint[key])} r={4} fill={key === 'done' ? 'var(--ok)' : 'var(--chart-rest)'} stroke="var(--card)" strokeWidth={2} />
              <text x={x(lastPoint.date) + 7} y={y(lastPoint[key]) + (key === 'total' ? -7 : 13)} className="fill-foreground text-[11.5px] font-medium tabular-nums">{lastPoint[key]}</text>
            </g>
          ))}
          {at && (
            <g data-slot="burn-up-cursor" pointerEvents="none">
              <line x1={x(at.date)} x2={x(at.date)} y1={top} y2={y(0)} stroke="var(--foreground)" strokeOpacity={0.3} strokeWidth={1} />
              <circle cx={x(at.date)} cy={y(at.total)} r={4} fill="var(--chart-rest)" stroke="var(--card)" strokeWidth={2} />
              <circle cx={x(at.date)} cy={y(at.done)} r={4} fill="var(--ok)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
          <rect x={M.left} y={top} width={plotW} height={plotH} fill="transparent"
            onPointerMove={(e) => { const r = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect(); setActive(nearest(((e.clientX - r.left) / (r.width || W)) * W)); }}
            onPointerLeave={() => setActive(null)} />
        </svg>
        {at && (
          <div data-slot="burn-up-tip" aria-hidden
            className="pointer-events-none absolute z-10 grid gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-[12px] whitespace-nowrap text-popover-foreground shadow-md"
            style={{ top: Math.max(0, top - 6), left: x(at.date) + 160 > W ? Math.max(0, x(at.date) - 158) : x(at.date) + 10 }}>
            <span className="font-medium">{longDay(at.date)}</span>
            <ChartKey color="var(--chart-rest)" shape="line" className="text-[12px]">{totalLabel}: <span className="text-foreground tabular-nums">{at.total}</span></ChartKey>
            <ChartKey color="var(--ok)" shape="line" className="text-[12px]">{doneLabel}: <span className="text-foreground tabular-nums">{at.done}</span></ChartKey>
          </div>
        )}
        <p className="sr-only" aria-live="polite">{at ? say(at) : ''}</p>
      </div>
      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">{totalLabel}</th><th scope="col">{doneLabel}</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.date}><th scope="row">{shortDay(p.date)}</th><td>{p.total}</td><td>{p.done}</td></tr>)}</tbody>
        {shownMarks.length > 0 && <tfoot>{shownMarks.map((m) => <tr key={`${m.date}-${m.label}`}><th scope="row">{shortDay(m.date)}</th><td colSpan={2}>{m.label}</td></tr>)}</tfoot>}
      </table>
    </figure>
  );
}

// ---------------------------------------------------------------- donut

/** One part of a whole: its name, how many, its colour (a CHART_COLOR). */
export type ChartSlice = { key: string; label: string; value: number; color: string };

export interface DonutChartProps extends React.ComponentProps<'div'> {
  slices: ChartSlice[];
  /** What it shows, read out with its numbers. */
  label: string;
  /** In the hole: the whole's number, say. */
  center?: React.ReactNode;
  size?: number;
  thickness?: number;
}

const share = (value: number, total: number) => (total ? `${Math.round((value / total) * 100)}%` : '0%');

function DonutChart({ slices, label, center, size = 132, thickness = 16, className, ...props }: DonutChartProps) {
  const [active, setActive] = React.useState<string | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const shown = slices.filter((s) => s.value > 0);
  // A 2px gap between touching parts.
  const gap = shown.length > 1 ? 2 : 0;
  let start = 0;
  const arcs = shown.map((s) => {
    const len = (s.value / total) * C;
    const arc = { slice: s, dash: `${Math.max(0.5, len - gap)} ${C}`, offset: -start };
    start += len;
    return arc;
  });
  const words = `${label}: ${slices.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`;
  return (
    <div data-slot="donut" className={cn('flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4', CHART_VARS, className)} {...props}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={words} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={thickness} />
          {arcs.map(({ slice, dash, offset }) => (
            <circle key={slice.key} data-slot="donut-slice" data-key={slice.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={slice.color} strokeWidth={thickness}
              strokeDasharray={dash} strokeDashoffset={offset} opacity={active && active !== slice.key ? 0.3 : 1}
              className="transition-opacity" onPointerEnter={() => setActive(slice.key)} onPointerLeave={() => setActive(null)}>
              <title>{`${slice.label}: ${slice.value} (${share(slice.value, total)})`}</title>
            </circle>
          ))}
        </svg>
        {center && <div aria-hidden className="pointer-events-none absolute inset-0 grid place-content-center text-center">{center}</div>}
      </div>
      <ul aria-label={label} className="grid min-w-[10rem] flex-1 gap-1.5">
        {slices.map((s) => (
          <li key={s.key} data-slot="donut-legend" data-key={s.key} onPointerEnter={() => setActive(s.key)} onPointerLeave={() => setActive(null)}
            className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto_3rem] items-center gap-2 rounded-md px-1.5 py-1 text-[13px] transition-colors', active === s.key && 'bg-muted')}>
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value}</span>
            <span className="text-end text-muted-foreground tabular-nums">{share(s.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- stacked bars

export type BarSeries = { key: string; label: string; color: string };
export type BarRow = {
  key: string;
  /** Its name as text: what its bar is read out as. */
  name: string;
  /** Its name as drawn (with a picture, "(you)"); `name` when not given. */
  label?: React.ReactNode;
  /** Before the name: an avatar. */
  lead?: React.ReactNode;
  /** Where the row's name leads. */
  href?: string;
  values: Record<string, number>;
  /** At the end of the row's line: its numbers in words. */
  aside?: React.ReactNode;
};

export interface StackedBarListProps extends React.ComponentProps<'div'> {
  series: BarSeries[];
  rows: BarRow[];
  /** What the list is, read out. */
  label: string;
  /** The longest bar's value (the most any row has, unless given). */
  max?: number;
}

function StackedBarList({ series, rows, label, max, className, ...props }: StackedBarListProps) {
  const sum = (r: BarRow) => series.reduce((n, s) => n + (r.values[s.key] ?? 0), 0);
  const top = Math.max(1, max ?? 0, ...rows.map(sum));
  return (
    <div data-slot="stacked-bars" className={cn('grid min-w-0 gap-3', CHART_VARS, className)} {...props}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => <ChartKey key={s.key} color={s.color}>{s.label}</ChartKey>)}
      </div>
      <ul aria-label={label} className="grid gap-3">
        {rows.map((r) => {
          const total = sum(r);
          const parts = series.filter((s) => (r.values[s.key] ?? 0) > 0);
          const words = `${r.name}: ${series.map((s) => `${r.values[s.key] ?? 0} ${s.label.toLowerCase()}`).join(', ')}`;
          const name = <span className="truncate">{r.label ?? r.name}</span>;
          return (
            <li key={r.key} data-slot="stacked-bars-row" data-key={r.key} className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 items-center gap-2 text-[13.5px]">
                {r.lead && <span className="flex shrink-0">{r.lead}</span>}
                {r.href
                  ? <a href={r.href} className="flex min-w-0 rounded-sm text-foreground no-underline hover:underline ui-focus">{name}</a>
                  : <span className="flex min-w-0">{name}</span>}
                {r.aside && <span className="ms-auto shrink-0 text-[12.5px] text-muted-foreground tabular-nums">{r.aside}</span>}
              </div>
              {total === 0 ? <div role="img" aria-label={words} className="h-2.5 w-6 rounded-full bg-muted" /> : (
                // One rounded track, its parts clipped by it: round at both ends ("not rounded").
                <div role="img" aria-label={words} data-slot="stacked-bars-bar" className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" style={{ width: `${(total / top) * 100}%` }}>
                  {parts.map((s) => (
                    <span key={s.key} data-slot="stacked-bars-part" data-key={s.key} title={`${s.label}: ${r.values[s.key]}`}
                      className="h-full min-w-[3px]"
                      style={{ flexGrow: r.values[s.key], flexBasis: 0, background: s.color }} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { BurnUpChart, DonutChart, StackedBarList };
