// Everything drawn while a tab is held: a box where the pane will land on the layout as it is now
// (or the zone under the pointer, when it cannot go there or is already there) and the insertion
// marker between two tabs. A drop on a divider or a window edge lights that line softly as well
//. The edges and gaps that take a drop are not drawn while nothing is over
// them. What the drop does rides at the pointer: a map of the whole
// layout after it, the dragged pane's group marked, over a pill saying it (or why it cannot).

import { useLayoutEffect, useRef } from 'react';
import type { Geometry, Rect } from './geometry';
import { useSpring } from '../../lib/motion';
import { BANDS, edgeBand, gapBand, type LayoutMap } from './zones';
import type { DockTarget } from './model';
import { useDrag } from './dragStore';
import { rectStyle } from './rectStyle';

/** A new place (a gap, an edge) is drawn flush, as a pane (or the side of one) is: no room round it
 *. */
const PREVIEW_INSET = 0;

const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, w: Math.max(0, r.w - 2 * by), h: Math.max(0, r.h - 2 * by) });

/** How thick the lit line of a divider or edge a drop goes into is. */
const EDGE_LINE = 3;

/** The line a drop goes into: the divider between two groups, or a window edge (none for a drop on a
 *  group). Centred on a divider, inside the area along an edge. */
export function dropLine(target: DockTarget, geo: Geometry): Rect | null {
  const t = EDGE_LINE;
  if (target.kind === 'gap') {
    const g = geo.gaps.find((x) => x.axis === target.axis && x.before.some((s) => s.id === target.before) && x.after.some((s) => s.id === target.after));
    if (!g) return null;
    return g.axis === 'row'
      ? { x: g.rect.x + g.rect.w / 2 - t / 2, y: g.rect.y, w: t, h: g.rect.h }
      : { x: g.rect.x, y: g.rect.y + g.rect.h / 2 - t / 2, w: g.rect.w, h: t };
  }
  if (target.kind === 'edge') {
    const a = geo.area;
    if (target.side === 'left') return { x: a.x, y: a.y, w: t, h: a.h };
    if (target.side === 'right') return { x: a.x + a.w - t, y: a.y, w: t, h: a.h };
    if (target.side === 'top') return { x: a.x, y: a.y, w: a.w, h: t };
    return { x: a.x, y: a.y + a.h - t, w: a.w, h: t };
  }
  return null;
}

export function DragOverlay() {
  const held = useDrag((s) => s.held);
  const geo = useDrag((s) => s.geo);
  const plan = useDrag((s) => s.plan);
  const open = useDrag((s) => s.open);
  if (!held || !geo) return null;
  const targets = dropTargets(geo, open ? BANDS.open : BANDS.compact, !open);
  const state = !plan ? '' : plan.refused ? 'refused' : plan.noop ? 'noop' : 'ok';
  const onCard = !!plan && /^(tab|beside|centre|strip):/.test(plan.key);
  const preview = plan?.preview ? (onCard ? plan.preview : inset(plan.preview, PREVIEW_INSET)) : null;
  const line = preview && plan ? dropLine(plan.target, geo) : null;
  // Only what the drop would do is drawn ("too much on the screen at once"): the
  // box where the pane would land, or, for a place that cannot take it or where it is already, that
  // zone in its state. The edges and gaps are found by moving there, as in VS Code; nothing marks
  // them all the while a tab is held.
  const zone = plan && !preview && targets.some((t) => t.key === plan.key) ? plan.zone : null;
  return (
    <div className='drag-overlay' data-open={open || undefined} data-zone={plan?.key ?? ''} data-state={state} aria-hidden>
      {zone ? <SpringBox key={plan!.key} className='zone-hint' rect={zone} data-key={plan!.key} data-hovered data-state={state} /> : null}
      {line ? <div className='drop-line' style={rectStyle(line)} /> : null}
      {preview ? <SpringBox className={`drop-preview ${onCard ? 'on-card' : 'new-place'}`} rect={preview} data-state={state} /> : null}
      {plan?.marker ? <div className='tab-marker' style={rectStyle(plan.marker)} /> : null}
    </div>
  );
}

/** The preview box and the zones glide to a new place on a quick spring (about 100 ms), from
 *  wherever they are: nothing else moves while a tab is held. */
const GLIDE = { stiffness: 3600, damping: 120 };

function SpringBox({ rect, className, ...data }: { rect: Rect; className: string } & Record<`data-${string}`, string | boolean | undefined>) {
  const ref = useRef<HTMLDivElement>(null);
  const from = useRef<Rect>(rect);
  const to = useRef<Rect>(rect);
  const drawn = useRef<Rect>(rect);
  const glide = useSpring(1, (p) => {
    const a = from.current, b = to.current;
    const r = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p };
    drawn.current = r;
    const s = ref.current?.style;
    if (s) { s.left = `${r.x}px`; s.top = `${r.y}px`; s.width = `${r.w}px`; s.height = `${r.h}px`; }
  }, GLIDE);
  useLayoutEffect(() => {
    const b = to.current;
    if (b.x === rect.x && b.y === rect.y && b.w === rect.w && b.h === rect.h) return;
    from.current = drawn.current;
    to.current = rect;
    glide.jump(0);
    glide.to(1);
  }, [rect.x, rect.y, rect.w, rect.h, glide]); // eslint-disable-line react-hooks/exhaustive-deps
  // React draws the first place; the spring draws every later one.
  return <div ref={ref} className={className} {...data} style={rectStyle(drawn.current)} />;
}

/** A thin bar: this thick, this far in from each end of its band. */
const BAR = { thick: 4, along: 8 };

/** A thin bar down the middle of a band (`vertical`: the band runs top to bottom), or flush with the
 *  area's edge for an edge band. */
function bar(r: Rect, vertical: boolean, flush?: 'start' | 'end'): Rect {
  const t = BAR.thick;
  const across = (size: number) => (flush === 'start' ? 0 : flush === 'end' ? size - t : (size - t) / 2);
  return vertical
    ? { x: r.x + across(r.w), y: r.y + BAR.along, w: t, h: Math.max(2, r.h - 2 * BAR.along) }
    : { x: r.x + BAR.along, y: r.y + across(r.h), w: Math.max(2, r.w - 2 * BAR.along), h: t };
}

/** The edge and gap targets, each at the size it answers to, or as a thin bar (`thin`). */
function dropTargets(geo: Geometry, bands: number, thin: boolean) {
  const out: { key: string; rect: Rect }[] = [];
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const r = edgeBand(geo.area, side, bands);
    out.push({ key: `edge:${side}`, rect: thin ? bar(r, side === 'left' || side === 'right', side === 'left' || side === 'top' ? 'start' : 'end') : r });
  }
  for (const g of geo.gaps) {
    if ([...g.before, ...g.after].some((s) => geo.folded.has(s.id))) continue;
    const r = gapBand(g.rect, g.axis, geo.area, bands);
    out.push({ key: `gap:${g.key}`, rect: thin ? bar(r, g.axis === 'row') : r });
  }
  return out;
}

/** What is under the pointer, moved by transform from the drag (never by a React render): over a
 *  place to drop, the map of the layout the drop leaves over the pill saying what it does (or why
 *  it cannot); elsewhere, just the pane's name. */
export function Ghost({ refEl }: { refEl: (el: HTMLDivElement | null) => void }) {
  const held = useDrag((s) => s.held);
  const title = useDrag((s) => s.title);
  const plan = useDrag((s) => s.plan);
  const away = useDrag((s) => s.away);
  const state = !plan ? '' : plan.refused ? 'refused' : plan.noop ? 'noop' : 'ok';
  const map = plan?.after ?? null;
  return (
    <div ref={refEl} className='ghost' data-plan={plan || away ? '' : undefined} hidden={!held} aria-hidden>
      {away ? <span className='ghost-pill' data-state='ok'>{away}</span> : !plan ? title : (
        <>
          {map ? <div className='ghost-map-frame'><MiniMap map={map} /></div> : null}
          <span className='ghost-pill' data-state={state}>{plan.refused ?? plan.label}</span>
        </>
      )}
    </div>
  );
}

/** How round a box's corners are in the map (a strip's half that); the frame's are this plus the
 *  room round the boxes, so the two curves run side by side. */
const MAP_RADIUS = 3;

/** Drawn at its own size (zones.ts `layoutMap`), so each box's outline lies inside it on whole pixels. */
function MiniMap({ map }: { map: LayoutMap }) {
  const { area } = map;
  return (
    <svg className='ghost-map' width={area.w} height={area.h} viewBox={`${area.x} ${area.y} ${area.w} ${area.h}`}>
      {map.boxes.map((b) => {
        const t = b.mine ? 0.75 : 0.5;
        return (
          <rect key={b.id} x={b.rect.x + t} y={b.rect.y + t} width={Math.max(0, b.rect.w - 2 * t)} height={Math.max(0, b.rect.h - 2 * t)}
            rx={b.strip ? MAP_RADIUS / 2 : MAP_RADIUS} data-mine={b.mine || undefined} data-strip={b.strip || undefined} />
        );
      })}
    </svg>
  );
}
