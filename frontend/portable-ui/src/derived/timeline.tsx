// A timeline on a real scale of days ("today is bugged, out proper time scale,
// zooming out and panning around, create a widget in the ui library for this"): its items (a
// project's milestones, say) placed by their dates, today drawn where it falls, ticks that follow the
// zoom (days, weeks, months, quarters). It zooms around the pointer (Ctrl/⌘ and the wheel, a pinch,
// the + and − buttons, + and − keys) and pans (a drag, a sideways scroll, ← and →); Today and Fit all
// bring it back. Its items are links in date order, each saying itself in full to a screen reader.
// What is out of view says so at the edge it is past: the nearest item there as a
// chip on the line ("‹ Plan · 16 Nov", "+2" more), which brings it into view; today's pill sits on
// the date axis, clear of the cards, and held at the edge with an arrow while today is off it.
import * as React from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Maximize2, Minus, Plus } from 'lucide-react';
import { Button } from '../base/button';
import { cn } from '../lib/utils';

export type TimelineTone = 'neutral' | 'ok' | 'bad' | 'info' | 'warn';
export interface TimelineItem {
  key: string;
  /** Its day, YYYY-MM-DD. */
  date: string;
  title: string;
  tone?: TimelineTone;
  /** A word for its state, beside its title (Done, Late, Next). */
  state?: string;
  /** A line under its title (its date in words, a countdown). */
  detail?: string;
  href?: string;
  /** How far it is: a small bar under it. */
  progress?: { done: number; total: number };
}

export interface TimelineProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Names the timeline for a screen reader. */
  label: string;
  items: TimelineItem[];
  /** YYYY-MM-DD. */
  today: string;
}

// ------------------------------------------------------------------ the scale (pure, tested)

const DAY_MS = 86_400_000;
/** Days since 1 Jan 1970 (UTC) of a YYYY-MM-DD day. */
export const dayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const dateOf = (day: number) => new Date(Math.floor(day) * DAY_MS);

/** What the timeline shows: its first day (fractional) and how many days across. */
export type TimelineView = { start: number; span: number };
export const MIN_SPAN = 7;
export const MAX_SPAN = 1100;

/** Every item and today in view, with a margin either side; at least three weeks across. */
export function fitView(days: number[]): TimelineView {
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  const span = Math.min(MAX_SPAN, Math.max(21, (hi - lo) * 1.16));
  return { start: (lo + hi) / 2 - span / 2, span };
}

/** Where a day falls across `width` pixels. */
export const xOf = (day: number, view: TimelineView, width: number) => ((day - view.start) / view.span) * width;

/** Zoomed by `factor` (under 1: in) with the day under `anchor` (0–1 across) staying under it. */
export function zoomView(view: TimelineView, factor: number, anchor = 0.5): TimelineView {
  const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, view.span * factor));
  const at = view.start + view.span * anchor;
  return { start: at - span * anchor, span };
}

/** Moved by `days`, never past `bounds` (the items and today) by more than most of its own width. */
export function panView(view: TimelineView, days: number, bounds: [number, number]): TimelineView {
  const min = bounds[0] - view.span * 0.9;
  const max = bounds[1] - view.span * 0.1;
  return { ...view, start: Math.min(max, Math.max(min, view.start + days)) };
}

export type Tick = { day: number; label: string; major: boolean };
export type TickStep = 'day' | 'week' | 'month' | 'quarter';

/** The step the ticks take at this zoom: as fine as leaves room for their labels. */
export function tickStep(pxPerDay: number): TickStep {
  if (pxPerDay >= 44) return 'day';
  if (pxPerDay >= 9) return 'week';
  if (pxPerDay >= 2.4) return 'month';
  return 'quarter';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The ticks across a view: each day, each Monday, each month's first or each quarter's. Major: a
 *  Monday among days, a month's first week among weeks, a January among months. */
export function ticksOf(view: TimelineView, width: number): Tick[] {
  const step = tickStep(width / view.span);
  const from = Math.floor(view.start) - 1;
  const to = Math.ceil(view.start + view.span) + 1;
  const out: Tick[] = [];
  if (step === 'day' || step === 'week') {
    for (let day = from; day <= to; day++) {
      const d = dateOf(day);
      const monday = d.getUTCDay() === 1;
      if (step === 'week' && !monday) continue;
      out.push({
        day,
        label: step === 'day' ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}` : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
        major: step === 'day' ? monday : d.getUTCDate() <= 7,
      });
    }
    return out;
  }
  const first = dateOf(from);
  for (let m = first.getUTCMonth(), y = first.getUTCFullYear(); ; m++) {
    const d = new Date(Date.UTC(y, m, 1));
    const day = Math.round(d.getTime() / DAY_MS);
    if (day > to) break;
    if (day < from) continue;
    if (step === 'quarter' && d.getUTCMonth() % 3 !== 0) continue;
    const jan = d.getUTCMonth() === 0;
    out.push({ day, label: jan || step === 'quarter' ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()], major: jan });
  }
  return out;
}

/** How wide an item's card is: narrower on a phone. */
export const labelWidth = (width: number) => (width < 480 ? 128 : 156);
const GAP = 6;

/** Where each item's card goes: its left edge (centred on its mark, kept inside the track) and its
 *  side of the line (0 below, 1 above), or no card (-1) when neither side has room for it there, or
 *  its mark is out of view. The items that matter most are placed first (`rank`, low first: the next
 *  one, a late one, then the nearest today), so that when they crowd, those keep their cards and the
 *  rest show as their marks (zooming out: a zoom in shows them). */
export function placeLabels(xs: number[], width: number, rank: number[]): { left: number; lane: number }[] {
  const w = labelWidth(width);
  const taken: [number, number][][] = [[], []];
  const out = xs.map((x) => ({ left: Math.min(Math.max(x - w / 2, 4), Math.max(4, width - w - 4)), lane: -1 }));
  const order = xs.map((_, i) => i).sort((a, b) => rank[a] - rank[b] || xs[a] - xs[b]);
  for (const i of order) {
    if (xs[i] < -2 || xs[i] > width + 2) continue;
    const from = out[i].left - GAP;
    const to = out[i].left + w + GAP;
    const lane = [0, 1].find((l) => taken[l].every(([a, b]) => to <= a || from >= b));
    if (lane === undefined) continue;
    taken[lane].push([out[i].left, out[i].left + w]);
    out[i].lane = lane;
  }
  return out;
}

const TONE_RANK: Record<TimelineTone, number> = { info: 0, bad: 1, warn: 2, neutral: 3, ok: 4 };

// ------------------------------------------------------------------ the widget

const TONE: Record<TimelineTone, { mark: string; word: string }> = {
  neutral: { mark: 'border-2 border-muted-foreground/70 bg-card', word: 'text-muted-foreground' },
  ok: { mark: 'bg-ok', word: 'text-ok' },
  bad: { mark: 'bg-bad', word: 'text-bad' },
  info: { mark: 'bg-info ring-4 ring-info/20', word: 'text-info' },
  warn: { mark: 'bg-warn', word: 'text-warn' },
};

const HEIGHT = 216;
const LINE_Y = 106;
const AXIS = 26;
const CARD_H = 68;

const shortDay = (day: number) => dateOf(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = (day: number) => dateOf(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
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

function Timeline({ label, items, today, className, ...props }: TimelineProps) {
  const todayDay = dayOf(today);
  const sorted = React.useMemo(() => [...items].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)), [items]);
  const days = React.useMemo(() => [...sorted.map((i) => dayOf(i.date)), todayDay], [sorted, todayDay]);
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  const [view, setView] = React.useState<TimelineView>(() => fitView(days));
  const viewRef = React.useRef(view);
  viewRef.current = view;
  // Other items (a milestone added, a date changed): back to all of them.
  const fitKey = days.join(',');
  React.useEffect(() => { setView(fitView(fitKey.split(',').map(Number))); }, [fitKey]);
  const [track, width] = useWidth(800);
  const ticks = ticksOf(view, width);
  const xs = sorted.map((i) => xOf(dayOf(i.date), view, width));
  // The next one first, then late, soon, upcoming, done; among those, the nearest today first.
  const ranks = sorted.map((i) => TONE_RANK[i.tone ?? 'neutral'] * 100_000 + Math.abs(dayOf(i.date) - todayDay));
  const places = placeLabels(xs, width, ranks);
  const marksOnly = places.filter((p, i) => p.lane < 0 && xs[i] >= -2 && xs[i] <= width + 2).length;
  const cardW = labelWidth(width);
  const todayX = xOf(todayDay, view, width);
  const step = tickStep(width / view.span);
  // Past each edge: how many, and the nearest one, which its chip brings to the middle.
  const offLeft = sorted.filter((_, i) => xs[i] < -2);
  const offRight = sorted.filter((_, i) => xs[i] > width + 2);
  const edges = [
    { side: 'left' as const, items: offLeft, nearest: offLeft[offLeft.length - 1] },
    { side: 'right' as const, items: offRight, nearest: offRight[0] },
  ].filter((e) => e.nearest);
  const todayOff = todayX < 0 ? 'left' : todayX > width ? 'right' : null;

  const zoom = (factor: number, anchor = 0.5) => setView((v) => zoomView(v, factor, anchor));
  const pan = (count: number) => setView((v) => panView(v, count, [lo, hi]));
  const toToday = () => setView((v) => ({ ...v, start: todayDay - v.span / 2 }));
  const toItem = (item: TimelineItem) => setView((v) => ({ ...v, start: dayOf(item.date) - v.span / 2 }));
  const fitAll = () => setView(fitView(days));

  // Ctrl/⌘ and the wheel zoom around the pointer, a sideways scroll pans; an up-and-down scroll stays
  // the page's (the wheel is not taken from the page unless it is meant for the timeline).
  React.useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const box = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setView((v) => zoomView(v, Math.exp(e.deltaY * 0.0025), (e.clientX - box.left) / box.width));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const moved = panView(viewRef.current, (dx / box.width) * viewRef.current.span, [lo, hi]);
        // At its end the swipe is the browser's (back and forward), not swallowed.
        if (moved.start === viewRef.current.start) return;
        e.preventDefault();
        setView(moved);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [track, lo, hi]);

  // A drag pans, two fingers pinch; a drag that moved does not also follow the item it began on.
  const pointers = React.useRef(new Map<number, number>());
  const dragged = React.useRef(false);
  const pinch = React.useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, e.clientX);
    dragged.current = false;
    pinch.current = null;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const was = pointers.current.get(e.pointerId);
    if (was === undefined) return;
    const box = e.currentTarget.getBoundingClientRect();
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const gap = Math.max(1, Math.abs(a - b));
      const before = pinch.current;
      if (before) setView((v) => zoomView(v, before / gap, ((a + b) / 2 - box.left) / box.width));
      pinch.current = gap;
      dragged.current = true;
      return;
    }
    const dx = e.clientX - was;
    if (!dragged.current && Math.abs(dx) < 3) { pointers.current.set(e.pointerId, was); return; }
    if (!dragged.current) e.currentTarget.setPointerCapture?.(e.pointerId);
    dragged.current = true;
    setView((v) => panView(v, (-dx / box.width) * v.span, [lo, hi]));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onClickCapture = (e: React.MouseEvent) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => pan(-view.span * 0.15), ArrowRight: () => pan(view.span * 0.15),
      '+': () => zoom(0.7), '=': () => zoom(0.7), '-': () => zoom(1 / 0.7),
      Home: fitAll, '0': fitAll, t: toToday, T: toToday,
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };

  // What an item says to a screen reader, in full: its links are its list, in date order.
  const says = (item: TimelineItem) => `${item.title}${item.state ? `, ${item.state.toLowerCase()}` : ''}: ${longDay(dayOf(item.date))}${item.progress ? `, ${item.progress.done} of ${item.progress.total} done` : ''}`;

  return (
    <div data-slot="timeline" className={cn('relative grid min-w-0 gap-2', className)} {...props}>
      <div className="flex flex-wrap items-center gap-1">
        <span data-slot="timeline-step" className="me-auto text-[12.5px] text-muted-foreground">
          {{ day: 'Day by day', week: 'Week by week', month: 'Month by month', quarter: 'By quarter' }[step]}
          {marksOnly > 0
            ? <span data-slot="timeline-more"> · zoom in to read {marksOnly === 1 ? '1 more' : `${marksOnly} more`}</span>
            : <span className="pointer-coarse:hidden max-sm:hidden"> · drag to move, Ctrl/⌘ and scroll to zoom</span>}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out (−)" disabled={view.span >= MAX_SPAN} onClick={() => zoom(1 / 0.7)}><Minus /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in (+)" disabled={view.span <= MIN_SPAN} onClick={() => zoom(0.7)}><Plus /></Button>
        <Button type="button" variant="outline" size="sm" title="Today in the middle (T)" onClick={toToday}><Crosshair aria-hidden />Today</Button>
        <Button type="button" variant="outline" size="sm" title="Everything in view (0)" onClick={fitAll}><Maximize2 aria-hidden />Fit all</Button>
      </div>
      <div ref={track} data-slot="timeline-track" role="group" tabIndex={0} aria-label={label} aria-description="← and → move it, + and − zoom, T is today, 0 shows all"
        aria-keyshortcuts="ArrowLeft ArrowRight + - T 0"
        onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}
        className="relative cursor-grab touch-pan-y overflow-hidden rounded-lg border bg-muted/30 outline-none select-none active:cursor-grabbing focus-visible:ring-[3px] focus-visible:ring-ring/35"
        style={{ height: HEIGHT }}>
        {ticks.map((t) => {
          const x = xOf(t.day, view, width);
          return (
            <React.Fragment key={t.day}>
              <span aria-hidden data-slot="timeline-tick" className={cn('absolute top-0 w-px', t.major ? 'bg-border' : 'bg-border/50')} style={{ left: x, bottom: AXIS }} />
              <span aria-hidden className={cn('absolute bottom-1.5 -translate-x-1/2 text-[11px] whitespace-nowrap tabular-nums', t.major ? 'font-medium text-foreground/80' : 'text-muted-foreground')} style={{ left: x }}>{t.label}</span>
            </React.Fragment>
          );
        })}
        <span aria-hidden className="absolute inset-x-0 h-0.5 bg-border" style={{ top: LINE_Y - 1 }} />
        <span aria-hidden data-slot="timeline-today" className="absolute top-0 w-0.5 bg-info" style={{ left: todayX - 1, bottom: AXIS - 4 }} />
        {/* On the axis, over the day's own label, never over a card; held at the edge while today is off it. */}
        {todayOff ? (
          <button type="button" data-slot="timeline-today-pill" data-off={todayOff} aria-label="Show today" title="Show today (T)" onClick={toToday}
            className={cn('absolute bottom-1 z-[2] flex items-center gap-0.5 rounded-full bg-info px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-xs ui-focus', todayOff === 'left' ? 'left-1.5' : 'right-1.5')}>
            {todayOff === 'left' && <ChevronLeft aria-hidden className="size-3" />}Today{todayOff === 'right' && <ChevronRight aria-hidden className="size-3" />}
          </button>
        ) : (
          <span aria-hidden data-slot="timeline-today-pill" className="absolute bottom-1 z-[2] -translate-x-1/2 rounded-full bg-info px-2 py-0.5 text-[11px] font-semibold text-white shadow-xs" style={{ left: todayX }}>Today</span>
        )}
        <span data-slot="timeline-today-words" className="sr-only">Today: {longDay(todayDay)}</span>
        {sorted.map((item, i) => {
          const x = xs[i];
          const tone = TONE[item.tone ?? 'neutral'];
          const { left, lane } = places[i];
          const below = lane === 0;
          const share = item.progress?.total ? item.progress.done / item.progress.total : null;
          const Tag = item.href ? 'a' : 'span';
          const link = item.href ? { href: item.href, draggable: false } : {};
          const mark = cn('absolute size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]', tone.mark);
          // No room for its card: its mark alone, still a link, named and titled.
          if (lane < 0) {
            return (
              <Tag key={item.key} {...link} data-slot="timeline-mark" data-key={item.key} data-tone={item.tone ?? 'neutral'} aria-label={says(item)}
                title={[item.title, item.state, item.detail].filter(Boolean).join(' · ')} className={cn(mark, item.href && 'ui-focus hover:scale-125')} style={{ left: x, top: LINE_Y }} />
            );
          }
          return (
            <React.Fragment key={item.key}>
              <span aria-hidden data-slot="timeline-stem" className="absolute w-px bg-border" style={{ left: x, top: below ? LINE_Y : LINE_Y - 14, height: 14 }} />
              <span aria-hidden data-slot="timeline-mark" data-key={item.key} data-tone={item.tone ?? 'neutral'} className={mark} style={{ left: x, top: LINE_Y }} />
              <Tag {...link} data-slot="timeline-item" data-key={item.key} data-lane={below ? 'below' : 'above'} aria-label={says(item)}
                className={cn('absolute grid content-start gap-0.5 rounded-md border bg-card px-2 py-1.5 text-start text-foreground no-underline shadow-xs', item.href && 'hover:border-foreground/25 ui-focus')}
                style={{ left, width: cardW, height: CARD_H, top: below ? LINE_Y + 14 : LINE_Y - 14 - CARD_H }}>
                <span className="flex min-w-0 items-baseline gap-1.5 text-[12.5px] font-semibold">
                  <span className="truncate">{item.title}</span>
                  {item.state && <span className={cn('shrink-0 text-[11px] font-medium', tone.word)}>{item.state}</span>}
                </span>
                {item.detail && <span className="truncate text-[11.5px] text-muted-foreground">{item.detail}</span>}
                {share !== null && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-ok" style={{ width: `${share * 100}%` }} /></span>
                    {item.progress!.done}/{item.progress!.total}
                  </span>
                )}
              </Tag>
            </React.Fragment>
          );
        })}
        {edges.map(({ side, items: past, nearest }) => (
          <button key={side} type="button" data-slot="timeline-edge" data-side={side} onClick={() => toItem(nearest)}
            aria-label={`${past.length === 1 ? '' : `${past.length} more ${side === 'left' ? 'earlier' : 'later'}; `}show ${says(nearest)}`}
            title={past.map((i) => `${i.title} · ${shortDay(dayOf(i.date))}`).join('\n')}
            className={cn('absolute z-[2] flex max-w-[45%] -translate-y-1/2 items-center gap-1 rounded-full border bg-card py-0.5 text-[11px] font-medium text-foreground shadow-xs hover:border-foreground/25 ui-focus',
              side === 'left' ? 'left-1.5 ps-1 pe-2' : 'right-1.5 ps-2 pe-1')}
            style={{ top: LINE_Y }}>
            {side === 'left' && <ChevronLeft aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
            <span className={cn('size-2 shrink-0 rotate-45 rounded-[1px]', TONE[nearest.tone ?? 'neutral'].mark)} aria-hidden />
            <span className="truncate">{nearest.title}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{shortDay(dayOf(nearest.date))}</span>
            {past.length > 1 && <span className="shrink-0 rounded-full bg-muted px-1 text-muted-foreground tabular-nums">+{past.length - 1}</span>}
            {side === 'right' && <ChevronRight aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export { Timeline };
