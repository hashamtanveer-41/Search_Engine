// CodeListing: code with line numbers, in its own scroll. Any line can be the current one (lit, with a
// marker in the gutter so it is not told by colour alone) and is kept in view by scrolling the listing
// only, never the page; lines and parts of lines can carry a tone. The current line (or run of lines)
// is a highlight with its number as the pointer, the same in every listing; with `onPick` it can be
// moved like the tabs (base/scrub.ts): press a line to jump to it, or hold and drag the pointer,
// which follows and settles on the nearest line that can be picked. It is read-only: nothing in a
// lesson is typed in and run. It knows nothing about languages: what it shows is text.
import * as React from 'react';
import { useScrub } from '../../base/scrub';
import { cn } from '../../lib/utils';
import './code-listing.css';

export type ListingTone = 'info' | 'ok' | 'warn' | 'bad' | 'thm';

/** A part of a line; `tone` marks it (a matched clause, an error under a token). */
export type ListingSpan = { text: string; tone?: ListingTone; title?: string };

/** A line: its text, or its parts; a tone for the whole line; something at its end (a note, a value). */
export type ListingLine = string | { text?: string; spans?: ListingSpan[]; tone?: ListingTone; end?: React.ReactNode; title?: string };

export interface CodeListingProps {
  /** The code, as one string (split on newlines) or line by line. */
  code?: string;
  lines?: ListingLine[];
  /** What a screen reader calls it ("Python code", "SQL source"). */
  label: string;
  /** The current line or lines (1-based): lit, marked, and kept in view. */
  current?: number | number[];
  /** The gutter mark for the current line ("▶"); `false` lights it without a marker column. */
  marker?: React.ReactNode | false;
  /** The number of the first line (a listing that starts mid-file). */
  start?: number;
  /** Line height in px (22 at rest; 20 for a denser editor). */
  lineHeight?: number;
  /** Scroll smoothly to the current line (off for reduced motion). */
  smooth?: boolean;
  /** Pressing or dragging to a line picks it (only `pickable` lines, when given). */
  onPick?(line: number): void;
  /** The lines that can be picked (default: all). */
  pickable?: number[];
  className?: string;
}

const toneClass = (t?: ListingTone) => (t ? `ui-tone-${t}` : undefined);

const PAD_TOP = 8;

export function CodeListing({ code, lines: given, label, current, marker = '▶', start = 1, lineHeight = 22, smooth = true, onPick, pickable, className }: CodeListingProps) {
  const lines: ListingLine[] = given ?? (code ?? '').replace(/\n$/, '').split('\n');
  const now = new Set(current === undefined ? [] : Array.isArray(current) ? current : [current]);
  const scroller = React.useRef<HTMLDivElement>(null);
  const first = Math.min(...now);
  // Keep the (first) current line in view, scrolling the listing only.
  React.useEffect(() => {
    const el = scroller.current;
    const line = el?.querySelector<HTMLElement>('[data-current]');
    if (!el || !line) return;
    const top = line.offsetTop, bottom = top + line.offsetHeight;
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), behavior: smooth ? 'smooth' : 'auto' });
    }
  }, [first, smooth]);
  // Notes at the ends of lines stand in one column, left-aligned, just past the longest line.
  const texts = lines.map((raw) => (typeof raw === 'string' ? raw : raw.spans ? raw.spans.map((s) => s.text).join('') : raw.text ?? ''));
  const notes = lines.some((raw) => typeof raw !== 'string' && raw.end !== undefined);
  const style = { '--listing-line': `${lineHeight}px`, '--listing-code': `${Math.max(1, ...texts.map((t) => t.replace(/\t/g, '    ').length))}ch` } as React.CSSProperties;
  const markers = marker !== false && current !== undefined;
  // The movable bar: one current line, and a way to pick.
  // One current line, or a run of them (a clause over several lines): the bar spans the run, the
  // pointer sits on its first line.
  const run = [...now].sort((a, b) => a - b);
  const single = run.length && run[run.length - 1] - run[0] + 1 === run.length ? run[0] : undefined;
  const span = single === undefined ? 1 : run.length;
  // Every listing with a current line (or run of lines) draws it the same way, pointer included;
  // with `onPick` the pointer can also be pressed and dragged.
  const bar = single !== undefined;
  const choices = pickable ?? lines.map((_, i) => start + i);
  const [dragY, setDragY] = React.useState<number | null>(null);
  const scrub = useScrub({
    axis: 'y',
    stops: () => choices.map((n) => PAD_TOP + (n - start) * lineHeight + lineHeight / 2),
    onPick: (i) => { const n = choices[i]; if (n !== undefined && n !== single) onPick?.(n); },
    onDrag: setDragY,
  });
  const barTop = dragY !== null ? dragY - lineHeight / 2 : single !== undefined ? PAD_TOP + (single - start) * lineHeight : 0;


  return (
    <div ref={scroller} data-slot="code-listing" data-notes={notes || undefined} className={cn('ui-listing is-read', markers && !bar && 'has-markers', bar && 'has-bar', bar && onPick && 'is-pickable', className)} style={style}
      onPointerDown={bar && onPick ? scrub.onPointerDown : undefined}>
      <pre aria-label={label}>
        {bar && <div aria-hidden data-slot="listing-bar" data-dragging={dragY !== null || undefined} className="ui-listing-bar" style={{ top: barTop, height: lineHeight * (dragY !== null ? 1 : span) }} />}
        {/* The pointer is the line's own number: a solid tag over the number column with a point into
            the code, so nothing sits between the mark and the line. Dragged, it shows the number of
            the line it is nearest. */}
        {bar && marker !== false && (
          <span aria-hidden className="ui-listing-pointer" data-dragging={dragY !== null || undefined} style={{ top: barTop + 2, height: lineHeight - 4 }}>
            {dragY !== null ? start + Math.max(0, Math.min(lines.length - 1, Math.round((dragY - PAD_TOP - lineHeight / 2) / lineHeight))) : single}
          </span>
        )}
        {lines.map((raw, i) => {
          const line = typeof raw === 'string' ? { text: raw } : raw;
          const n = start + i;
          const lit = now.has(n);
          const spans = line.spans ?? [{ text: line.text ?? '' }];
          const empty = spans.every((s) => s.text.length === 0);
          return (
            <div key={i} className={cn('ui-listing-line', toneClass(line.tone))} data-current={lit ? '' : undefined} aria-current={lit ? 'step' : undefined} title={line.title}>
              {markers && !bar && <span className="ui-listing-marker" aria-hidden>{lit ? marker : ''}</span>}
              <span className="ui-listing-number" aria-hidden>{n}</span>
              <code>
                {empty ? ' ' : spans.map((s, j) => (s.tone ? <mark key={j} className={toneClass(s.tone)} title={s.title}>{s.text}</mark> : <span key={j}>{s.text}</span>))}
              </code>
              {line.end !== undefined && <span className="ui-listing-end">{line.end}</span>}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
