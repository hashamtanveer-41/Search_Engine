// Pixel geometry: the model's grid projected onto an area of the screen.
//
// Every card (a group: tab bar + header + body), every divider, every strip and the room along the
// area's edges come from this one function, so the renderer, the drop zones and the drop preview
// can never disagree about where things are.
//
// Each column and row of the grid gets its share of the area, less a gap at every line between
// them; folded ones side by side are one strip's thickness together (no gap between them), and the
// open one holding their room has the rest. A group covers its columns and rows and the gaps between
// them. Folded groups drawn over one another (a band of two rows folded, or the corner where a
// folded row meets a folded column) are one strip: , "use one box only and say 2".

import { foldedAlong, heirOf, runs, shownShares, stripAxis, type Axis, type GridNode, type Run, type StackNode, type Track } from './model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Metrics {
  /** Space between two cards side by side. The divider is this whole gap. */
  gap: number;
  /** Space between the cards and the area's edges. */
  inset: number;
  /** Height of a card's tab row. */
  tabBar: number;
  /** Height of the header row under the tabs. A group with a single tab has none: its tab row is its header. */
  header: number;
  /** Thickness of a strip (a column or row folded away). */
  strip: number;
}

/** Cards sit close together, and stay so while a tab is held: the drop targets grow, not the gaps. */
export const REST: Metrics = { gap: 8, inset: 6, tabBar: 36, header: 30, strip: 36 };

export interface StackBox {
  id: string;
  card: Rect;
  tabBar: Rect;
  header: Rect;
  body: Rect;
}

/** A divider: a stretch of a grid line between groups (model.ts `runs`), in pixels. */
export interface GapBox extends Run {
  /** The same divider from one layout to the next while the groups at its start stay. */
  key: string;
  rect: Rect;
}

export interface StripBox {
  /** The first of its groups, in reading order. */
  id: string;
  rect: Rect;
  /** 'row': a strip standing up, between groups side by side; 'column': one lying down. */
  axis: Axis;
  /** Folded both ways (where a folded row meets a folded column): a square, saying how many pages. */
  corner: boolean;
  /** Every group folded into it, in reading order, and their panes. */
  groups: string[];
  panes: string[];
  front: string;
  /** Where a pane dropped onto the strip becomes a tab. */
  stackId: string;
}

export interface Geometry {
  area: Rect;
  inner: Rect;
  nodes: Map<string, Rect>;
  stacks: Map<string, StackBox>;
  gaps: GapBox[];
  strips: Map<string, StripBox>;
  /** Each folded group's strip, by id. */
  folded: Map<string, string>;
  /** Where each column (`row`) and row (`column`) starts and ends. */
  tracks: Record<Axis, { from: number; to: number }[]>;
}

export const contains = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export const gapKey = (run: Pick<Run, 'axis' | 'before' | 'after'>) => `${run.axis}:${run.before[0].id}:${run.after[0].id}`;

/** Where the tracks along one axis go between `start` and `start + extent`: folded ones side by
 *  side are one strip's thickness together, each of them all of it (the open one holding their room
 *  has the rest); a gap at every other line. Boundaries are rounded from the running total so sizes
 *  never drift and edges stay crisp. */
export function placeTracks(tracks: Track[], start: number, extent: number, m: Metrics): { from: number; to: number }[] {
  const units: number[][] = [];
  tracks.forEach((t, i) => {
    if (t.fold && i > 0 && tracks[i - 1].fold) units[units.length - 1].push(i);
    else units.push([i]);
  });
  const free = Math.max(0, extent - m.gap * (units.length - 1));
  const shares = shownShares(tracks);
  const sizes = units.map((u) => (tracks[u[0]].fold ? m.strip : shares[u[0]] * free));
  units.forEach((u) => {
    if (!tracks[u[0]].fold) return;
    const h = heirOf(tracks, u[0]);
    const k = units.findIndex((v) => v.includes(h));
    if (k >= 0) sizes[k] -= m.strip;
  });
  const out: { from: number; to: number }[] = new Array(tracks.length);
  let acc = 0;
  let prevEnd = start;
  units.forEach((u, k) => {
    const from = k === 0 ? start : prevEnd + m.gap;
    acc += Math.max(0, sizes[k]);
    const to = k === units.length - 1 ? start + extent : Math.max(from, Math.round(start + acc + m.gap * k));
    for (const i of u) out[i] = { from, to };
    prevEnd = to;
  });
  return out;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
/** The box round all of them (null for none). */
export const joinRects = (rects: (Rect | undefined)[]): Rect | null =>
  rects.reduce<Rect | null>((acc, r) => (!r ? acc : acc ? union(acc, r) : r), null);

const boxOf = (g: StackNode, xs: { from: number; to: number }[], ys: { from: number; to: number }[]): Rect => ({
  x: xs[g.c0].from,
  y: ys[g.r0].from,
  w: xs[g.c1 - 1].to - xs[g.c0].from,
  h: ys[g.r1 - 1].to - ys[g.r0].from,
});

export function computeGeometry(root: GridNode | null, area: Rect, m: Metrics): Geometry {
  const inner: Rect = {
    x: area.x + m.inset,
    y: area.y + m.inset,
    w: Math.max(0, area.w - 2 * m.inset),
    h: Math.max(0, area.h - 2 * m.inset),
  };
  const geo: Geometry = { area, inner, nodes: new Map(), stacks: new Map(), gaps: [], strips: new Map(), folded: new Map(), tracks: { row: [], column: [] } };
  if (!root) return geo;
  const xs = placeTracks(root.cols, inner.x, inner.w, m);
  const ys = placeTracks(root.rows, inner.y, inner.h, m);
  geo.tracks = { row: xs, column: ys };
  geo.nodes.set(root.id, inner);
  // Folded groups drawn over one another become one strip (their boxes joined).
  const strips: { groups: StackNode[]; rect: Rect; corner: boolean }[] = [];
  for (const g of root.groups) {
    const r = boxOf(g, xs, ys);
    geo.nodes.set(g.id, r);
    const strip = stripAxis(root, g);
    if (strip) {
      const corner = foldedAlong(root, g, 'row') && foldedAlong(root, g, 'column');
      strips.push({ groups: [g], rect: r, corner });
      continue;
    }
    const bar = Math.min(m.tabBar, r.h);
    const head = g.panes.length > 1 ? Math.min(m.header, r.h - bar) : 0;
    geo.stacks.set(g.id, {
      id: g.id,
      card: r,
      tabBar: { x: r.x, y: r.y, w: r.w, h: bar },
      header: { x: r.x, y: r.y + bar, w: r.w, h: head },
      body: { x: r.x, y: r.y + bar + head, w: r.w, h: Math.max(0, r.h - bar - head) },
    });
  }
  // Joined until none overlap (a group can bridge two).
  for (let i = 0; i < strips.length; i++)
    for (let j = i + 1; j < strips.length; j++) {
      if (!overlaps(strips[i].rect, strips[j].rect)) continue;
      const [a, b] = [strips[i], strips.splice(j, 1)[0]];
      a.groups.push(...b.groups);
      a.rect = union(a.rect, b.rect);
      a.corner &&= b.corner;
      j = i;
    }
  for (const s of strips) {
    s.groups.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    const first = s.groups[0];
    const id = first.id;
    geo.strips.set(id, {
      id,
      rect: s.rect,
      axis: s.corner ? 'row' : s.rect.h >= s.rect.w ? 'row' : 'column',
      corner: s.corner,
      groups: s.groups.map((g) => g.id),
      panes: s.groups.flatMap((g) => g.panes),
      front: first.active,
      stackId: id,
    });
    for (const g of s.groups) geo.folded.set(g.id, id);
  }
  for (const run of runs(root)) {
    // A line inside a strip (between two folded tracks) is not a divider: there is nothing to pull.
    const t = run.axis === 'row' ? root.cols : root.rows;
    if (t[run.line - 1].fold && t[run.line].fold) continue;
    const along = run.axis === 'row' ? xs : ys;
    const cross = run.axis === 'row' ? ys : xs;
    const lo = along[run.line - 1].to;
    const hi = along[run.line].from;
    const a = cross[run.from].from;
    const b = cross[run.to - 1].to;
    const rect = run.axis === 'row' ? { x: lo, y: a, w: hi - lo, h: b - a } : { x: a, y: lo, w: b - a, h: hi - lo };
    geo.gaps.push({ ...run, key: gapKey(run), rect });
  }
  return geo;
}
