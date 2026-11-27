// Step-by-step playback for widgets that replay something (an exchange, a queue, a trace): the
// state, and the bar that drives it (back, play/pause, next, a slider over the steps and "3 / 12").
// The bar has one width whatever the step, so it never shifts as it plays.
import * as React from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '../../base/button';
import { Slider } from '../../base/slider';

export function usePlayback(total: number, reducedMotion: boolean, ms = 1300) {
  const [at, setAt] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  React.useEffect(() => {
    if (!playing || at >= total - 1) return;
    const timer = window.setTimeout(() => setAt((n) => Math.min(n + 1, total - 1)), reducedMotion ? ms * 1.7 : ms);
    return () => window.clearTimeout(timer);
  }, [at, playing, total, reducedMotion, ms]);
  return {
    at,
    total,
    playing: playing && at < total - 1,
    go: (n: number) => { setPlaying(false); setAt(Math.max(0, Math.min(total - 1, n))); },
    toggle: () => { if (at >= total - 1) { setAt(0); setPlaying(true); } else setPlaying((v) => !v); },
  };
}
export type Playback = ReturnType<typeof usePlayback>;

/** The bar: back, play/pause, next; what is happening now (one line, the rest on hover and in
 *  the widget's Details); a slider over the steps once there are enough of them to need one; the
 *  count; start over. Every part has a fixed width, so the bar never shifts as it plays. */
export function PlaybackBar({ playback: p, label = 'Step', format, status, sliderFrom = 7, count }: {
  playback: Playback; label?: string; format?: (at: number) => React.ReactNode; status?: React.ReactNode; sliderFrom?: number;
  /** What the count says (default "n/total"), e.g. when the first position is not a step. */
  count?: (at: number, total: number) => React.ReactNode;
}) {
  const [hint, setHint] = React.useState<string | undefined>();
  const statusRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { setHint(statusRef.current?.textContent ?? undefined); }, [status]);
  const onKeys = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.target instanceof HTMLElement && ev.target.closest('[data-slot=slider]')) return;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); p.go(p.at - 1); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); p.go(p.at + 1); }
  };
  return (
    <div className="flex w-full min-w-0 items-center gap-1" onKeyDown={onKeys}>
      <Button variant="ghost" size="icon-sm" aria-label="Back" disabled={p.at === 0} onClick={() => p.go(p.at - 1)}><ChevronLeft /></Button>
      <Button variant="default" size="icon-sm" aria-label={p.playing ? 'Pause' : 'Play'} onClick={p.toggle}>{p.playing ? <Pause /> : <Play />}</Button>
      <Button variant="ghost" size="icon-sm" aria-label="Next" disabled={p.at >= p.total - 1} onClick={() => p.go(p.at + 1)}><ChevronRight /></Button>
      <div ref={statusRef} data-slot="playback-status" aria-live={p.playing ? 'off' : 'polite'} className="mx-2 min-w-0 flex-1 truncate text-[12.5px]" title={hint}>{status}</div>
      {p.total >= sliderFrom && (
        <Slider className="w-32 shrink-0" min={0} max={p.total - 1} step={1} value={[p.at]} onValueChange={([v]) => p.go(v)}
          aria-label={label} showValue={format ? (v) => format(v) : (v) => `${v + 1}`} />
      )}
      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">{count ? count(p.at, p.total) : `${p.at + 1}/${p.total}`}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Start over" disabled={p.at === 0} onClick={() => p.go(0)}><RotateCcw /></Button>
    </div>
  );
}
