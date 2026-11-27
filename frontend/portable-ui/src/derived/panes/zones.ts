// Drop zones: which DockTarget the pointer is over while a tab is held, and what dropping there does.
//
// Zones are resolved against the geometry as displayed, which a held tab never changes: the panes
// keep their places and sizes, and the edges and gaps are bands of one size laid on top of
// everything. What is drawn on top answers first (the first hit wins):
//   1. the band along an edge of the area       -> dock along that window edge
//   2. the band over a divider                  -> a new group in it, along the whole divider
//   3. a tab bar (and the header row under it)  -> join that group as a tab, at the slot under the pointer
//   4. a strip (a group folded away)            -> a tab there, and the strip opens
//   5. a card's body: its outer band             -> split beside that group on that side
//                     its centre                 -> join that group as a tab
//
// Each hit's `zone` is the target itself: an edge or gap band, the band of a card a split takes, a
// card's centre, its tab bar. The move is simulated on the model, so a move the model refuses is
// known before the drop. Where the pane lands is outlined (`preview`) on the layout as it is now:
// the group a tab joins, the side of a group a split takes, a box on the gap a new group goes into,
// the edge it docks along. The whole result, drawn small (`after`), rides at the pointer with the
// label.
//
// The edge and gap bands never overlap: the top and bottom bands run the area's whole width, the
// side bands between them, and a gap's band stops where an edge band or a crossing gap's band
// starts.

import { computeGeometry, contains, REST, type Geometry, type Metrics, type Rect } from './geometry';
import { DEFAULT_SHARE, findNode, findStackOf, movePane, OpError, openPane, runOf, type DockTarget, type Layout, type LayoutNode, type Side, type StackNode } from './model';

/** Horizontal slots of a group's tabs, relative to its tab bar's left edge (measured when the drag starts). */
export type TabSlots = Map<string, { left: number; width: number }[]>;

export interface Hit {
  key: string;
  target: DockTarget;
  zone: Rect;
  /** For a tab-bar hit, the insertion marker between two tabs. */
  marker?: Rect;
}

export interface DropPlan extends Hit {
  label: string;
  /** Where the pane lands, on the layout as it is now (none for a refusal or a drop that changes nothing). */
  preview: Rect | null;
  /** Why the model refuses this drop (the zone and the label are drawn in the danger colour). */
  refused?: string;
  /** The drop would change nothing ('Already here'). */
  noop: boolean;
  /** The layout after the drop, for the map at the pointer (as it is now when the drop changes
   *  nothing or is refused). */
  after?: LayoutMap;
}

/** A layout drawn small: each group's box (a folded one as its strip), the dragged pane's marked. In
 *  the map's own pixels: `area` is the map's size. */
export interface LayoutMap {
  area: Rect;
  boxes: { id: string; rect: Rect; mine: boolean; strip?: boolean }[];
}

/** The map's width; its height follows the area's shape, within these bounds. */
export const MAP_W = 136;
const MAP_H = { min: 56, max: 112 };

/** The map is laid out at its own size, not shrunk from the screen: the same room between two boxes
 *  as between a box and the map's edge, a strip thick enough to see, every edge on a whole pixel
 *  (the outer boxes had touched the edges and were cut off at the corners). */
export const MAP_METRICS: Metrics = { ...REST, gap: 3, inset: 3, header: 0, strip: 7 };

export function layoutMap(layout: Layout, paneId: string, area: Rect): LayoutMap {
  const h = Math.round(Math.max(MAP_H.min, Math.min(MAP_H.max, (MAP_W * area.h) / Math.max(1, area.w))));
  const geo = computeGeometry(layout.root, { x: 0, y: 0, w: MAP_W, h }, MAP_METRICS);
  const mine = findStackOf(layout.root, paneId)?.id;
  return {
    area: geo.area,
    boxes: [
      ...[...geo.stacks.values()].map((s) => ({ id: s.id, rect: s.card, mine: s.id === mine })),
      ...[...geo.strips.values()].map((s) => ({ id: s.id, rect: s.rect, mine: !!mine && s.groups.includes(mine), strip: true })),
    ],
  };
}

/** How much of a card's body, from each edge, splits instead of adding a tab. */
export const SIDE_BAND = 0.3;
export const SIDE_BAND_MAX = 140;
/** How thick every edge and gap band is: thin while the tab is still over its own pane (reordering
 *  or splitting it needs no more), then this, every band the same, laid on top of the panes. */
export const BANDS = { compact: 6, open: 24 } as const;
export type Bands = number;

export function hitTest(x: number, y: number, geo: Geometry, slots: TabSlots, bands: Bands = BANDS.open): Hit | null {
  const { area } = geo;
  if (!contains(area, x, y)) return null;

  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    if (contains(edgeBand(area, side, bands), x, y)) return { key: `edge:${side}`, target: { kind: 'edge', side }, zone: edgeBand(area, side, bands) };
  }

  for (const g of geo.gaps) {
    if ([...g.before, ...g.after].some((s) => geo.folded.has(s.id))) continue;
    const band = gapBand(g.rect, g.axis, area, bands);
    if (contains(band, x, y)) return { key: `gap:${g.key}`, target: { kind: 'gap', axis: g.axis, before: g.before[0].id, after: g.after[0].id }, zone: band };
  }

  for (const s of geo.stacks.values()) {
    if (!contains({ ...s.tabBar, h: s.tabBar.h + s.header.h }, x, y)) continue;
    const tabs = slots.get(s.id) ?? [];
    const rel = x - s.tabBar.x;
    const index = tabs.filter((t) => t.left + t.width / 2 < rel).length;
    const mx =
      s.tabBar.x +
      (index < tabs.length ? tabs[index].left : tabs.length ? tabs[tabs.length - 1].left + tabs[tabs.length - 1].width : 0);
    return {
      key: `tab:${s.id}:${index}`,
      target: { kind: 'stack', stackId: s.id, index },
      zone: { ...s.tabBar, h: s.tabBar.h + s.header.h },
      marker: { x: mx - 1, y: s.tabBar.y + 6, w: 2, h: s.tabBar.h - 12 },
    };
  }

  for (const s of geo.strips.values()) {
    if (!contains(s.rect, x, y)) continue;
    return { key: `strip:${s.id}`, target: { kind: 'stack', stackId: s.stackId }, zone: s.rect };
  }


  for (const s of geo.stacks.values()) {
    if (!contains(s.card, x, y)) continue;
    const b = s.body;
    const bandX = Math.min(b.w * SIDE_BAND, SIDE_BAND_MAX);
    const bandY = Math.min(b.h * SIDE_BAND, SIDE_BAND_MAX);
    const d: [Side, number, number][] = [
      ['left', x - b.x, bandX],
      ['right', b.x + b.w - x, bandX],
      ['top', y - b.y, bandY],
      ['bottom', b.y + b.h - y, bandY],
    ];
    // The nearest edge relative to its band wins, so corners split the way the pointer leans.
    const inBand = d.filter(([, dist, band]) => dist < band).sort((a, c) => a[1] / a[2] - c[1] / c[2]);
    if (inBand.length) {
      const side = inBand[0][0];
      const zone =
        side === 'left' ? { ...b, w: bandX }
        : side === 'right' ? { ...b, x: b.x + b.w - bandX, w: bandX }
        : side === 'top' ? { ...b, h: bandY }
        : { ...b, y: b.y + b.h - bandY, h: bandY };
      return { key: `beside:${s.id}:${side}`, target: { kind: 'beside', nodeId: s.id, side }, zone };
    }
    const centre = { x: b.x + bandX, y: b.y + bandY, w: b.w - 2 * bandX, h: b.h - 2 * bandY };
    return { key: `centre:${s.id}`, target: { kind: 'stack', stackId: s.id }, zone: centre };
  }
  return null;
}

/** The band along one edge of the area that docks there, laid over the panes: the top and bottom
 *  ones the area's whole width, the side ones between them. */
export function edgeBand(area: Rect, side: Side, size: Bands = BANDS.open): Rect {
  const between = { y: area.y + size, h: Math.max(0, area.h - 2 * size) };
  switch (side) {
    case 'left':
      return { x: area.x, w: size, ...between };
    case 'right':
      return { x: area.x + area.w - size, w: size, ...between };
    case 'top':
      return { x: area.x, y: area.y, w: area.w, h: size };
    case 'bottom':
      return { x: area.x, y: area.y + area.h - size, w: area.w, h: size };
  }
}

/** The band over a gap that puts a new group there: `size` across, centred on the gap. Along the
 *  gap it stops short of what its ends meet: an edge band where it runs to the area's side (an end
 *  within a band of it), else the band of the gap it crosses (half a band past that gap's middle). */
export function gapBand(gap: Rect, axis: 'row' | 'column', area: Rect, size: Bands = BANDS.open): Rect {
  const half = size / 2;
  if (axis === 'row') {
    const top = gap.y <= area.y + size ? area.y + size : gap.y + half;
    const bottom = gap.y + gap.h >= area.y + area.h - size ? area.y + area.h - size : gap.y + gap.h - half;
    return { x: Math.round(gap.x + gap.w / 2 - half), y: top, w: size, h: Math.max(0, bottom - top) };
  }
  const left = gap.x <= area.x + size ? area.x + size : gap.x + half;
  const right = gap.x + gap.w >= area.x + area.w - size ? area.x + area.w - size : gap.x + gap.w - half;
  return { x: left, y: Math.round(gap.y + gap.h / 2 - half), w: Math.max(0, right - left), h: size };
}

function nameOf(layout: Layout, node: LayoutNode | null): string {
  if (!node || node.type !== 'stack') return 'the pane';
  return `“${layout.panes[node.active]?.title ?? 'pane'}”`;
}

/** The groups on one side of a divider: one by its name, several by how many and where. */
function namesOf(layout: Layout, groups: StackNode[], where: string): string {
  return groups.length === 1 ? nameOf(layout, groups[0]) : `the ${groups.length} panes ${where}`;
}

const sideWord = (side: Side) => (side === 'top' ? 'above' : side === 'bottom' ? 'below' : `${side} of`);

/** What the overlay's label says a drop does, in words a screen reader can announce too. */
export function labelFor(layout: Layout, paneId: string, target: DockTarget): string {
  switch (target.kind) {
    case 'stack': {
      const own = findStackOf(layout.root, paneId)?.id === target.stackId;
      return own ? 'Reorder tab' : `Add as a tab of ${nameOf(layout, findNode(layout.root, target.stackId))}`;
    }
    case 'beside':
      return `Split ${sideWord(target.side)} ${nameOf(layout, findNode(layout.root, target.nodeId))}`;
    case 'edge':
      return `Dock along the ${target.side} edge`;
    case 'gap': {
      const run = runOf(layout.root, target.axis, target.before, target.after);
      if (!run) return 'Between two panes';
      const row = target.axis === 'row';
      return `Between ${namesOf(layout, run.before, row ? 'on the left' : 'above')} and ${namesOf(layout, run.after, row ? 'on the right' : 'below')}`;
    }
  }
}

/** Where the pane lands, drawn on the layout as it is now (`geo`). `landed` is its rectangle in the
 *  layout after the drop. */
function outline(hit: Hit, geo: Geometry, landed: Rect | null): Rect | null {
  const t = hit.target;
  switch (t.kind) {
    case 'stack':
      // The group it joins (a folded one: its strip).
      return geo.stacks.get(t.stackId)?.card ?? hit.zone;
    case 'beside': {
      // The share of the group a split gives the new pane, on that side.
      const r = geo.stacks.get(t.nodeId)?.card ?? geo.nodes.get(t.nodeId);
      if (!r) return landed;
      const across = t.side === 'left' || t.side === 'right' ? r.w : r.h;
      const size = Math.round(across * (t.share ?? DEFAULT_SHARE));
      if (t.side === 'left') return { ...r, w: size };
      if (t.side === 'right') return { ...r, x: r.x + r.w - size, w: size };
      if (t.side === 'top') return { ...r, h: size };
      return { ...r, y: r.y + r.h - size, h: size };
    }
    case 'gap': {
      // Its size after the drop, centred on the gap (and no wider than its two neighbours' average).
      const g = geo.gaps.find((x) => x.axis === t.axis && x.before.some((s) => s.id === t.before) && x.after.some((s) => s.id === t.after));
      const before = g && geo.nodes.get(g.before[0].id);
      const after = g && geo.nodes.get(g.after[0].id);
      if (!g || !before || !after || !landed) return landed;
      if (g.axis === 'row') {
        const w = Math.min(landed.w, Math.round((before.w + after.w) / 2));
        return { x: Math.round(g.rect.x + g.rect.w / 2 - w / 2), y: g.rect.y, w, h: g.rect.h };
      }
      const h = Math.min(landed.h, Math.round((before.h + after.h) / 2));
      return { x: g.rect.x, y: Math.round(g.rect.y + g.rect.h / 2 - h / 2), w: g.rect.w, h };
    }
    case 'edge':
      return landed;
  }
}

/** Simulates the drop and describes it. Cheap; still, call it only when the hovered zone changes.
 *  `metrics` are the ones `geo` was drawn with. */
/** A page not open yet, brought in from outside the panes (the sidebar, ). */
export interface BringPage { kind: string; title: string; color?: number }

/** What dropping a page brought in from outside does at `hit`: it opens there (a tab of a group,
 *  beside one, along an edge, between two), drawn as a tab's drop is. */
export function planBring(layout: Layout, page: BringPage, hit: Hit, geo: Geometry, metrics: Metrics = REST): DropPlan {
  try {
    const result = openPane(layout, page.kind, page.title, hit.target, { color: page.color });
    const label = labelFor(result.layout, result.paneId, hit.target);
    const after = layoutMap(result.layout, result.paneId, geo.area);
    const stack = findStackOf(result.layout.root, result.paneId);
    const landed = stack ? (computeGeometry(result.layout.root, geo.area, metrics).stacks.get(stack.id)?.card ?? null) : null;
    return { ...hit, label, preview: outline(hit, geo, landed), noop: false, after };
  } catch (e) {
    if (e instanceof OpError) return { ...hit, label: labelFor(layout, '', hit.target), preview: null, refused: e.message, noop: false, after: layoutMap(layout, '', geo.area) };
    throw e;
  }
}

export function planDrop(layout: Layout, paneId: string, hit: Hit, geo: Geometry, metrics: Metrics = REST): DropPlan {
  const label = labelFor(layout, paneId, hit.target);
  try {
    const result = movePane(layout, paneId, hit.target);
    const after = layoutMap(result.layout, paneId, geo.area);
    if (!result.changed) return { ...hit, label: 'Already here', preview: null, noop: true, after };
    const stack = findStackOf(result.layout.root, paneId);
    const landed = stack ? (computeGeometry(result.layout.root, geo.area, metrics).stacks.get(stack.id)?.card ?? null) : null;
    return { ...hit, label, preview: outline(hit, geo, landed), noop: false, after };
  } catch (e) {
    if (e instanceof OpError) return { ...hit, label, preview: null, refused: e.message, noop: false, after: layoutMap(layout, paneId, geo.area) };
    throw e;
  }
}
