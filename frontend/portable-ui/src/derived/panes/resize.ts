// Divider maths, pure. A drag moves a grid line (model.ts `withLine`): the groups with an edge on it
// change size, everything else stays put.

import { DEFAULT_LIMITS, edges, smallStacks, tracksOf, unitRects, withLine, type Axis, type Layout, type Limits } from './model';

/** Whether the model accepts line `line` at `pos`: no pane goes under the minimum size, no group
 *  turns inside out, and the line goes into no folded track (a strip's divider opens the strip
 *  instead). A pane already under the minimum one way (the window got smaller) may grow that way,
 *  never shrink, so it never holds the line still; the other way it is held to the minimum as usual. */
export function accepts(layout: Layout, axis: Axis, line: number, pos: number, limits: Limits = DEFAULT_LIMITS, only?: ReadonlySet<string>): boolean {
  const grid = layout.root;
  if (!grid) return false;
  const tracks = tracksOf(grid, axis);
  const e = edges(tracks);
  const from = e[line];
  if (!(pos > 0 && pos < 1) || from === undefined) return false;
  const lo = Math.min(from, pos), hi = Math.max(from, pos);
  if (tracks.some((t, i) => t.fold && e[i] < hi && e[i + 1] > lo)) return false;
  if (tracks[line - 1]?.fold || tracks[line]?.fold) return false;
  const next = { ...layout, root: withLine(grid, axis, line, pos, only) };
  if (next.root.groups.some((g) => g.c0 >= g.c1 || g.r0 >= g.r1)) return false;
  const was = unitRects(grid), now = unitRects(next.root);
  const minW = limits.minW ?? limits.minShare, minH = limits.minH ?? limits.minShare;
  return smallStacks(next, limits).every((id) => {
    const a = was.get(id), b = now.get(id);
    if (!a || !b) return false;
    const wide = b.w + 1e-9 >= minW || (a.w + 1e-9 < minW && b.w >= a.w - 1e-9);
    const tall = b.h + 1e-9 >= minH || (a.h + 1e-9 < minH && b.h >= a.h - 1e-9);
    return wide && tall;
  });
}

/** `to`, or the furthest the line can go towards it from where it is: it stops at the minimum size
 *  instead of refusing the whole move (16 bisections: well under a pixel). */
export function clampLine(layout: Layout, axis: Axis, line: number, to: number, limits: Limits = DEFAULT_LIMITS, only?: ReadonlySet<string>): number {
  const from = edges(tracksOf(layout.root!, axis))[line];
  const ok = (t: number) => accepts(layout, axis, line, from + (to - from) * t, limits, only);
  if (ok(1)) return to;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return from + (to - from) * lo;
}

/** Where the line is now, and the nearest and furthest it may go (aria-valuemin/max), from 0 to 1. */
export function bounds(layout: Layout, axis: Axis, line: number, limits: Limits = DEFAULT_LIMITS) {
  const value = edges(tracksOf(layout.root!, axis))[line];
  return { value, min: clampLine(layout, axis, line, 1e-6, limits), max: clampLine(layout, axis, line, 1 - 1e-6, limits) };
}

/** The other lines along the same axis a line moving to `pos` would land on, when within `snap`:
 *  there it is that line from then on (the two are one). */
export function snapLine(layout: Layout, axis: Axis, line: number, pos: number, snap: number): number {
  const e = edges(tracksOf(layout.root!, axis));
  let best = pos;
  let d = snap;
  e.forEach((x, k) => {
    if (k === 0 || k === e.length - 1 || k === line) return;
    if (Math.abs(x - pos) <= d) { d = Math.abs(x - pos); best = x; }
  });
  return best;
}
