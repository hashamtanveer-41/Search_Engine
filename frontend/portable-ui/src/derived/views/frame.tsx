// WidgetFrame: the shell every lesson widget sits in.
//
// Rules it enforces, so each widget does not have to:
// - A fixed size. The stage has one height, whatever happens inside; nothing a reader clicks makes
//   the widget grow or shrink, so the page never jumps. Long content scrolls inside the stage.
// - Controls stay put: a bar along the bottom, always in the same place.
// - Extras are sheets, not growth: "About" (assumptions, how to read it) and "Details" (the full
//   table, the transcript) slide in over the whole page from the right (a widget can be too small to
//   hold them) and scroll on their own.
// - `fit`: the stage is as tall as its content (up to maxHeight, then it scrolls), for widgets whose
//   content is text that flows (questions); there is no resize edge then.
// - The reader may resize: drag the bottom edge (or focus it and use the arrow keys; double-click
//   puts it back), or open the widget full screen. The size is remembered for the visit.
import * as React from 'react';
import { Info, Maximize2, Minimize2, PanelRight } from 'lucide-react';
import { Button } from '../../base/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../base/sheet';
import { cn } from '../../lib/utils';
import './frame.css';

export interface WidgetFrameProps {
  id: string;
  /** What kind of widget this is, said small above the title ("Replay", "Queue"). */
  kind: string;
  title: React.ReactNode;
  /** The stage's height at rest, in px. */
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Right of the title: the widget's own switches (a toggle group, a select). */
  actions?: React.ReactNode;
  /** The bar along the bottom: playback, sliders, check buttons. */
  controls?: React.ReactNode;
  /** Tints the bar: how an answer went (`ok`, `bad`) or a note (`info`). */
  controlsTone?: 'ok' | 'bad' | 'info';
  /** The stage is as tall as its content (up to maxHeight), instead of a fixed, resizable height. */
  fit?: boolean;
  /** A drawer of assumptions and how to read the widget. */
  about?: React.ReactNode;
  /** A drawer of everything at once: the full table, the transcript. */
  details?: React.ReactNode;
  detailsLabel?: string;
  /** Under the stage, above the controls: one line that says what is happening now (fixed height). */
  status?: React.ReactNode;
  /** How many lines the status may take (its height is reserved, so it never changes). */
  statusLines?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
}

const KEY_STEP = 24;

function useRemembered(key: string, initial: number): [number, (n: number) => void] {
  const [value, setValue] = React.useState(() => {
    try { const v = Number(sessionStorage.getItem(key)); return v > 0 ? v : initial; } catch { return initial; }
  });
  return [value, (n: number) => { setValue(n); try { sessionStorage.setItem(key, String(n)); } catch { /* private window */ } }];
}

export function WidgetFrame({
  id, kind, title, height = 300, minHeight = 160, maxHeight = 900, actions, controls, controlsTone, fit = false, about, details, detailsLabel = 'Details',
  status, statusLines = 2, className, children,
}: WidgetFrameProps) {
  const [stage, setStage] = useRemembered(`ui-widget-height:${id}`, height);
  const [drawer, setDrawer] = React.useState<'about' | 'details' | null>(null);
  const [full, setFull] = React.useState(false);
  // Full screen raises the frame into the browser's top layer where it stands (a manual popover), so
  // nothing it sits in (a container query's box, a pane that scrolls) can hold it or draw over it.
  // It stays in its place in the page, so what finds its parts there (a widget's arrows, which look for
  // a graph's boxes inside the block that drew them) still does, and nothing in it is drawn afresh.
  const frameRef = React.useRef<HTMLElement>(null);
  const [skippable, setSkippable] = React.useState(false);
  React.useEffect(() => {
    // (the frame after its first paint: by then it has been laid out, and its size is remembered)
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setSkippable(true)); });
    return () => cancelAnimationFrame(id);
  }, []);
  const scrimRef = React.useRef<HTMLDivElement>(null);
  const [room, setRoom] = React.useState(0);
  const goFull = (on: boolean) => {
    // (the room it took on the page is kept while it is up, so the page doesn't jump)
    if (on) setRoom(frameRef.current?.offsetHeight ?? 0);
    setFull(on);
  };
  React.useLayoutEffect(() => {
    // the scrim goes up first, so the frame stands over it; it takes every press on the page behind
    const up = [scrimRef.current, frameRef.current].filter((el): el is HTMLDivElement | HTMLElement => !!el && typeof el.showPopover === 'function');
    if (!full || up.length < 2) return;
    for (const el of up) { el.setAttribute('popover', 'manual'); el.showPopover(); }
    return () => {
      for (const el of up.reverse()) {
        if (el.matches(':popover-open')) el.hidePopover();
        el.removeAttribute('popover');
      }
    };
  }, [full]);
  const clamp = (n: number) => Math.max(minHeight, Math.min(maxHeight, Math.round(n)));

  React.useEffect(() => {
    // The sheet closes itself on Escape; this is for full screen.
    if (!full || drawer) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      goFull(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [full, drawer]);

  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || full) return;
    e.preventDefault();
    const start = e.clientY, base = stage, el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let frame = 0, next = base;
    const move = (ev: PointerEvent) => { next = clamp(base + ev.clientY - start); if (!frame) frame = requestAnimationFrame(() => { frame = 0; setStage(next); }); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const drawerContent = drawer === 'about' ? about : drawer === 'details' ? details : null;
  const shell = (
    <>
      {/* the room it took, kept while it is up, and the scrim over the page behind it (a press there
          leaves full screen) */}
      {full && <div aria-hidden className="my-6" style={{ height: room }} />}
      {full && <div ref={scrimRef} aria-hidden data-slot="widget-scrim" className="fixed inset-0 m-0 h-auto w-auto border-0 bg-black/30 p-0" onClick={() => goFull(false)} />}
      <section
        ref={frameRef}
        data-slot="widget-frame"
        data-full={full || undefined}
        aria-labelledby={`${id}-title`}
        className={cn(
          'not-prose my-6 flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground',
          // off screen, the browser neither lays it out nor paints it (a page of plots and graphs
          // scrolls with only the ones in view drawn), keeping the size it last had; only once it
          // has been laid out for real, so no guess at its height ever moves what is below it
          !full && skippable && '[contain-intrinsic-size:auto_420px] [content-visibility:auto]',
          full && 'fixed inset-4 z-[61] m-0 h-auto w-auto p-0 shadow-2xl md:inset-8',
          className,
        )}
      >
        {/* A finger's 44 px on a touch screen, for its buttons. */}
        <header className="flex h-9 shrink-0 items-center gap-2.5 border-b pr-1.5 pl-3 pointer-coarse:h-12">
          <span className="ui-caption shrink-0">{kind}</span>
          <h4 id={`${id}-title`} className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</h4>
          {actions && <div className="flex shrink-0 items-center gap-1.5 self-stretch">{actions}</div>}
          <div className="flex shrink-0 items-center pointer-coarse:gap-2">
            {about && (
              <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" aria-label="About this widget" aria-pressed={drawer === 'about'} title="About"
                onClick={() => setDrawer(drawer === 'about' ? null : 'about')}><Info /></Button>
            )}
            {details && (
              <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" aria-label={detailsLabel} aria-pressed={drawer === 'details'} title={detailsLabel}
                onClick={() => setDrawer(drawer === 'details' ? null : 'details')}><PanelRight /></Button>
            )}
            <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11 pointer-coarse:[&_svg:not([class*='size-'])]:size-5" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen (Esc)' : 'Full screen'}
              onClick={() => goFull(!full)}>{full ? <Minimize2 /> : <Maximize2 />}</Button>
          </div>
        </header>

        <div data-slot="widget-stage" data-fit={fit || undefined} className={cn('relative min-h-0', fit ? 'overflow-auto' : 'overflow-hidden', full && 'flex-1')}
          style={full ? undefined : fit ? { maxHeight } : { height: stage }}>
          {children}
        </div>
        {/* What the sheet shows, kept in the page while it is closed: for print and for assistive technology. */}
        {about && <div data-slot="widget-about" hidden className="print:block">{about}</div>}
        {details && <div data-slot="widget-details" hidden className="print:block">{details}</div>}

        {status !== undefined && (
          <div data-slot="widget-status" aria-live="polite" className="shrink-0 overflow-hidden border-t px-4 py-2 text-[13px] leading-5"
            style={{ height: statusLines * 20 + 16 }}>
            <div className={statusLines === 1 ? 'truncate' : statusLines === 2 ? 'line-clamp-2' : 'line-clamp-3'}>{status}</div>
          </div>
        )}

        {!full && !fit && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the widget"
            aria-valuenow={stage}
            aria-valuemin={minHeight}
            aria-valuemax={maxHeight}
            tabIndex={0}
            data-slot="widget-resize"
            title="Drag to resize · double-click to reset"
            onPointerDown={onResizeDown}
            onDoubleClick={() => setStage(height)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setStage(clamp(stage + (e.key === 'ArrowUp' ? -KEY_STEP : KEY_STEP))); }
              if (e.key === 'Home') setStage(minHeight);
              if (e.key === 'End') setStage(maxHeight);
            }}
            className="group relative h-0 shrink-0 cursor-row-resize outline-none"
          >
            <span aria-hidden className="absolute inset-x-0 -top-1.5 h-3" />
            <span aria-hidden className="absolute -top-[3px] left-1/2 h-[5px] w-10 -translate-x-1/2 rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </div>
        )}

        {controls && (
          <div data-slot="widget-controls" data-tone={controlsTone}
            className={cn('flex min-h-11 shrink-0 items-center gap-2 border-t bg-muted/40 px-3 py-1.5 transition-colors duration-(--dur-quick)',
              'data-[tone=ok]:border-t-ok-line data-[tone=ok]:bg-ok-soft data-[tone=bad]:border-t-bad-line data-[tone=bad]:bg-bad-soft data-[tone=info]:bg-info-soft/60')}>
            {controls}
          </div>
        )}
      </section>
    </>
  );

  return (
    <>
      {shell}

      {/* About and Details: a sheet over the whole page (a widget can be too small to hold them). */}
      <Sheet open={!!drawerContent} onOpenChange={(open) => { if (!open) setDrawer(null); }}>
        <SheetContent side="right" data-part="widget-sheet" className="flex w-[min(460px,92vw)] flex-col gap-0 p-0 sm:max-w-none">
          <div className="flex h-12 shrink-0 items-center border-b px-4 pr-12">
            <SheetTitle className="min-w-0 truncate text-[14px]">{drawer === 'about' ? 'About' : detailsLabel}<span className="ml-2 font-normal text-muted-foreground">· {title}</span></SheetTitle>
          </div>
          <SheetDescription className="sr-only">{drawer === 'about' ? 'How to read this widget' : detailsLabel}</SheetDescription>
          {drawer === 'about' && <div data-part="widget-sheet-about" className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[13.5px] leading-relaxed">{about}</div>}
          {drawer === 'details' && <div data-part="widget-sheet-details" className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[13.5px] leading-relaxed">{details}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
}
