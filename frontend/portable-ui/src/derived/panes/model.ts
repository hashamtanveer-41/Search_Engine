// The layout model: one grid of columns and rows, groups of tabs that each take a block of its
// cells, and every way it changes.
//
// This file is the whole truth of the workspace. It knows nothing about React, the DOM or pixels;
// the view only ever projects it. Every operation is transactional: it works on a copy and either
// returns a complete, valid, normalised layout or throws an OpError and leaves the input untouched.
//
// The grid (groups never hold groups; the container assigns the columns and rows):
// the window is cut into columns and rows (`cols`, `rows`: their shares of it), and each group takes
// a rectangle of whole cells, columns c0 to c1 and rows r0 to r1 (the ends not included). A divider
// is always a stretch of one grid line, so two dividers that meet in a line are that one line: they
// move together, and sharing evenly evens out the columns (or rows) themselves.
//
// Invariants (checked by `validate`, restored by `normalize`):
//   - every cell belongs to exactly one group, and every group has at least one cell;
//   - every line between two columns (or rows) is the edge of some group: a line nothing needs goes;
//   - the shares along each axis are positive and sum to 1, and at least one track of each is open;
//   - every group's `active` is one of its panes; every pane appears exactly once;
//   - `activePane` is a pane in the grid (or null when it is empty).
//
// A column or a row can be folded into a strip (`fold`): its share stays what it was (the size it
// comes back at), and while folded its room goes to the open track beside it on its `fold` side, so
// every other group keeps its size. A group all of whose columns (or rows) are folded is drawn as a
// strip. Folding takes a band no group crosses (`bandOf`), so every group is wholly in it or wholly
// out of it: the whole column (or row) on that side folds, with every group in it.

export type Axis = 'row' | 'column'; // row: side by side (the columns, cut by upright lines); column: stacked (the rows)
export type Side = 'left' | 'right' | 'top' | 'bottom';
export type Direction = 'left' | 'right' | 'up' | 'down';

export interface Pane {
  id: string;
  /** What the pane shows (a page kind plus its argument, e.g. 'file:src/App.tsx'). The model never looks inside. */
  kind: string;
  title: string;
  /** Opened by a single click and not kept yet: the next single click shows its page here instead of
   *  opening another tab. Kept when double-clicked, dragged, or typed in. Drawn in italics. */
  preview?: boolean;
  /** Its colour, one of PANE_COLORS (panes.css): given when it opens, kept for its life; its tab
   *  shows it, and so does its strip or box when it is folded. */
  color?: number;
}

/** How many colours panes are given (panes.css --pane-c0 to --pane-c7). */
export const PANE_COLORS = 8;

/** A pane's colour (one opened before panes had colours gets one from its id). */
export const colorOf = (pane: Pane | undefined): number =>
  !pane ? 0 : (typeof pane.color === 'number' ? pane.color : [...pane.id].reduce((h, c) => h + c.charCodeAt(0), 0)) % PANE_COLORS;

/** The colour for a new pane: the one fewest open panes have (the first of those, and the palette
 *  puts the most unlike first), so panes seldom share one. */
function freshColor(layout: Layout): number {
  const used = new Array<number>(PANE_COLORS).fill(0);
  for (const p of Object.values(layout.panes)) if (typeof p.color === 'number') used[p.color % PANE_COLORS]++;
  return used.indexOf(Math.min(...used));
}

/** Panes opened before panes had colours, given one each, in reading order, as `freshColor` would
 *  have (two of them had landed on the same one). */
function withColours(layout: Layout): Layout {
  const bare = readingOrder(layout.root).filter((id) => layout.panes[id] && typeof layout.panes[id].color !== 'number');
  if (!bare.length) return layout;
  const next = { ...layout, panes: { ...layout.panes } };
  for (const id of bare) next.panes[id] = { ...next.panes[id], color: freshColor(next) };
  return next;
}

export type FoldSide = 'before' | 'after';

/** A column (or a row) of the grid: its share of the window, and, folded into a strip, the side
 *  whose open track holds its room meanwhile. */
export interface Track {
  size: number;
  fold?: FoldSide;
}

/** A group: panes sharing one card, shown as tabs, over a block of the grid's cells. Exactly one is
 *  in front (`active`). */
export interface StackNode {
  type: 'stack';
  id: string;
  panes: string[];
  active: string;
  /** Columns c0 to c1 and rows r0 to r1, the ends not included. */
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/** The container: its columns and rows, and the groups that share its cells. */
export interface GridNode {
  type: 'grid';
  id: string;
  cols: Track[];
  rows: Track[];
  /** In reading order: top to bottom, then left to right. */
  groups: StackNode[];
}

export type LayoutNode = StackNode | GridNode;

export interface Layout {
  root: GridNode | null;
  panes: Record<string, Pane>;
  activePane: string | null;
  nextId: number;
}

/** Where a dragged, opened or reopened pane lands. */
export type DockTarget =
  /** Join a group as a tab, at `index` (the end when omitted). */
  | { kind: 'stack'; stackId: string; index?: number }
  /** A new single-pane group beside a group, taking `share` of it. */
  | { kind: 'beside'; nodeId: string; side: Side; share?: number }
  /** A new group along a whole window edge. */
  | { kind: 'edge'; side: Side; share?: number }
  /** A new group in the divider between two groups that meet along `axis`, along the whole stretch of it. */
  | { kind: 'gap'; axis: Axis; before: string; after: string };

export interface Limits {
  /** Smallest width and height a group may have, as a fraction of the window. */
  minShare: number;
  /** …or, given, the smallest width and height on their own (a workspace sets them from px). */
  minW?: number;
  minH?: number;
  /** Most columns (and rows) the grid may have. */
  maxTracks: number;
}

export const DEFAULT_SHARE = 0.35;
export const MIN_SHARE_ARG = 0.15;
export const MAX_SHARE_ARG = 0.85;
/** A pane dropped into a gap takes this fraction of each neighbour's size. */
export const GAP_GIVE = 1 / 3;
/** A split uses a line already inside the group when one is this close to where it would cut (a
 *  share of the group), so its edge lines up with the rest of the grid. */
export const REUSE_LINE = 0.2;
export const DEFAULT_LIMITS: Limits = { minShare: 0.12, maxTracks: 12 };
export const RELAXED: Limits = { minShare: 0, maxTracks: Infinity };
/** Two lines closer than this are one line. */
const EPS = 1e-9;
export const GRID_ID = 'grid';
const AXES: Axis[] = ['row', 'column'];

export type OpErrorCode = 'unknown-pane' | 'unknown-target' | 'too-small' | 'too-many' | 'last-open' | 'invalid';

export class OpError extends Error {
  readonly code: OpErrorCode;
  constructor(code: OpErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface OpResult {
  layout: Layout;
  /** False when the operation left the layout exactly as it was. */
  changed: boolean;
}

/** What `closePane` remembers so the pane can be put back where it was. */
export interface ClosedPane {
  pane: Pane;
  restore: DockTarget | null;
}

// ---------------------------------------------------------------- helpers

export const sideAxis = (side: Side): Axis => (side === 'left' || side === 'right' ? 'row' : 'column');
const isBefore = (side: Side) => side === 'left' || side === 'top';
const clampShare = (share: number | undefined) =>
  share !== undefined && Number.isFinite(share) ? Math.min(MAX_SHARE_ARG, Math.max(MIN_SHARE_ARG, share)) : DEFAULT_SHARE;
export const across = (axis: Axis): Axis => (axis === 'row' ? 'column' : 'row');

const copyPlain = <T>(value: T): T =>
  Array.isArray(value)
    ? (value.map(copyPlain) as T)
    : value !== null && typeof value === 'object'
      ? (Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyPlain(v)])) as T)
      : value;

export const cloneLayout = (layout: Layout): Layout => copyPlain(layout);

function freshId(layout: Layout, prefix: string): string {
  const id = `${prefix}${layout.nextId}`;
  layout.nextId += 1;
  return id;
}

export const emptyLayout = (): Layout => ({ root: null, panes: {}, activePane: null, nextId: 1 });

/** The columns (`row`) or the rows (`column`). */
export const tracksOf = (grid: GridNode, axis: Axis): Track[] => (axis === 'row' ? grid.cols : grid.rows);

/** A group's first track and the one after its last, along an axis. */
export const spanOf = (g: StackNode, axis: Axis): [number, number] => (axis === 'row' ? [g.c0, g.c1] : [g.r0, g.r1]);

function setSpan(g: StackNode, axis: Axis, a: number, b: number) {
  if (axis === 'row') { g.c0 = a; g.c1 = b; } else { g.r0 = a; g.r1 = b; }
}

export function* walk(node: LayoutNode | null): Generator<LayoutNode> {
  if (!node) return;
  yield node;
  if (node.type === 'grid') yield* node.groups;
}

export const stacks = (root: LayoutNode | null): StackNode[] => (!root ? [] : root.type === 'stack' ? [root] : root.groups);

/** Panes in reading order: groups top to bottom and left to right, tabs left to right. */
export const readingOrder = (root: LayoutNode | null): string[] => stacks(root).flatMap((s) => s.panes);

export function findNode(root: LayoutNode | null, id: string): LayoutNode | null {
  for (const n of walk(root)) if (n.id === id) return n;
  return null;
}

export const findStackOf = (root: LayoutNode | null, paneId: string): StackNode | null =>
  stacks(root).find((s) => s.panes.includes(paneId)) ?? null;

const groupOf = (grid: GridNode | null, id: string): StackNode | null => grid?.groups.find((g) => g.id === id) ?? null;

/** Where each line is, from 0 to 1, by the tracks' own shares (a folded track at the size it comes back at). */
export function edges(tracks: Track[]): number[] {
  const out = [0];
  for (const t of tracks) out.push(out[out.length - 1] + t.size);
  return out;
}

/** Which group each cell is in: `cells[row][col]` ('' for none and '*' for two, in a broken grid). */
export function cellsOf(grid: GridNode): string[][] {
  const cells = grid.rows.map(() => grid.cols.map(() => ''));
  for (const g of grid.groups)
    for (let r = g.r0; r < g.r1; r++) for (let c = g.c0; c < g.c1; c++) if (cells[r]?.[c] !== undefined) cells[r][c] = cells[r][c] ? '*' : g.id;
  return cells;
}

// ----------------------------------------------------------------- strips

/** The open track holding folded track `i`'s room: nearest on its `fold` side, else the other. */
export function heirOf(tracks: Track[], i: number): number {
  const first = tracks[i]?.fold === 'after' ? 1 : -1;
  for (const dir of [first, -first])
    for (let j = i + dir; j >= 0 && j < tracks.length; j += dir) if (!tracks[j].fold) return j;
  return -1;
}

/** Shares as shown: a folded track has none; its heir carries it on top of its own. */
export function shownShares(tracks: Track[]): number[] {
  const out = tracks.map((t) => (t.fold ? 0 : t.size));
  tracks.forEach((t, i) => {
    if (!t.fold) return;
    const h = heirOf(tracks, i);
    if (h >= 0) out[h] += t.size;
  });
  return out;
}

/** Whether every track of a group along an axis is folded: it is a strip that way. */
export function foldedAlong(grid: GridNode, g: StackNode, axis: Axis): boolean {
  const [a, b] = spanOf(g, axis);
  const t = tracksOf(grid, axis);
  for (let i = a; i < b; i++) if (!t[i]?.fold) return false;
  return true;
}

/** A group drawn as a strip: all its columns folded ('row': a strip standing up, between groups
 *  side by side), or all its rows ('column': one lying down). */
export function stripAxis(grid: GridNode, g: StackNode): Axis | null {
  return foldedAlong(grid, g, 'row') ? 'row' : foldedAlong(grid, g, 'column') ? 'column' : null;
}

/** Every group folded into a strip. */
export function foldedNodes(root: LayoutNode | null): Set<string> {
  const out = new Set<string>();
  if (root?.type === 'grid') for (const g of root.groups) if (stripAxis(root, g)) out.add(g.id);
  return out;
}

export function isPaneFolded(root: LayoutNode | null, paneId: string): boolean {
  const stack = findStackOf(root, paneId);
  return !!stack && foldedNodes(root).has(stack.id);
}

/** The panes that are shown, in reading order (those folded into strips are left out). */
export function shownOrder(root: LayoutNode | null): string[] {
  const away = foldedNodes(root);
  return stacks(root)
    .filter((s) => !away.has(s.id))
    .flatMap((s) => s.panes);
}

/** Tracks `a` to `b` widened until no group crosses either end: a band every group is wholly in or
 *  wholly out of, which folds as one. */
export function bandOf(grid: GridNode, axis: Axis, a: number, b: number): [number, number] {
  for (let changed = true; changed; ) {
    changed = false;
    for (const h of grid.groups) {
      const [x, y] = spanOf(h, axis);
      if (x < a && y > a) { a = x; changed = true; }
      if (x < b && y > b) { b = y; changed = true; }
    }
  }
  return [a, b];
}

/** Whether tracks `a` to `b` can fold: something in them is open, and something outside them stays open. */
export function canFoldBand(grid: GridNode, axis: Axis, a: number, b: number): boolean {
  const t = tracksOf(grid, axis);
  return t.some((x, i) => i >= a && i < b && !x.fold) && t.some((x, i) => (i < a || i >= b) && !x.fold);
}

/** The pane in front of a group. */
const frontOf = (g: StackNode): string => g.active;

/** Opens the strip `paneId` is folded into (and what folded with it) so it can be seen. The axes
 *  that opened, so a strip that comes back too big can be fitted. */
function reveal(layout: Layout, paneId: string, only?: Axis): Axis[] {
  const grid = layout.root;
  const g = findStackOf(grid, paneId);
  if (!grid || !g) return [];
  const opened: Axis[] = [];
  for (const axis of only ? [only] : AXES) {
    const t = tracksOf(grid, axis);
    const [a, b] = spanOf(g, axis);
    if (!t.slice(a, b).some((x) => x.fold)) continue;
    const [x, y] = bandOf(grid, axis, a, b);
    for (let i = x; i < y; i++) delete t[i].fold;
    opened.push(axis);
  }
  return opened;
}

// ------------------------------------------------------------- normalize

/** Track `i` goes: its share to track `into`, and every group's span closes over it. A group left
 *  with no track is the caller's to have prevented. */
function dropTrack(grid: GridNode, axis: Axis, i: number, into: number) {
  const tracks = tracksOf(grid, axis);
  const gone = tracks[i];
  const kept = tracks[into];
  if (gone.size > EPS && !(gone.fold && kept.fold)) delete kept.fold;
  kept.size += gone.size;
  tracks.splice(i, 1);
  for (const g of grid.groups) {
    const [a, b] = spanOf(g, axis);
    setSpan(g, axis, a > i ? a - 1 : a, b > i ? b - 1 : b);
  }
}

/** One axis put right: tracks of no size go (the lines either side of one become one line), then
 *  every line no group has an edge on; the shares sum to 1, and one track at least is open. */
function tidy(grid: GridNode, axis: Axis) {
  const tracks = () => tracksOf(grid, axis);
  for (const t of tracks()) if (!(t.size > 0) || !Number.isFinite(t.size)) t.size = 0;
  for (let i = tracks().length - 1; i >= 0 && tracks().length > 1; i--) {
    if (tracks()[i].size > EPS) continue;
    if (grid.groups.some((g) => { const [a, b] = spanOf(g, axis); return a === i && b === i + 1; })) continue;
    dropTrack(grid, axis, i, i + 1 < tracks().length ? i + 1 : i - 1);
  }
  for (let line = tracks().length - 1; line >= 1; line--) {
    const used = grid.groups.some((g) => { const [a, b] = spanOf(g, axis); return a === line || b === line; });
    if (!used) dropTrack(grid, axis, line, line - 1);
  }
  let sum = tracks().reduce((s, t) => s + t.size, 0);
  if (!(sum > 0)) {
    for (const t of tracks()) t.size = 1;
    sum = tracks().length;
  }
  for (const t of tracks()) t.size /= sum;
  if (tracks().every((t) => t.fold)) {
    const biggest = tracks().reduce((best, t, i, all) => (t.size > all[best].size ? i : best), 0);
    delete tracks()[biggest].fold;
  }
}

/** Restores every structural invariant. Pure: returns a new grid. */
export function normalize(root: GridNode | null): GridNode | null {
  if (!root) return null;
  const grid = copyPlain(root);
  grid.groups = grid.groups
    .filter((g) => g.panes.length > 0)
    .map((g) => (g.panes.includes(g.active) ? g : { ...g, active: g.panes[0] }));
  if (!grid.groups.length) return null;
  for (const axis of AXES) tidy(grid, axis);
  grid.groups.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
  return grid;
}

function finish(layout: Layout): Layout {
  layout.root = normalize(layout.root);
  const order = readingOrder(layout.root);
  if (!layout.activePane || !order.includes(layout.activePane)) layout.activePane = order[0] ?? null;
  return layout;
}

// -------------------------------------------------------------- validate

/** Every broken invariant as a sentence (empty when the layout is valid). Run on anything loaded. */
export function validate(layout: Layout): string[] {
  const problems: string[] = [];
  const seenPanes = new Set<string>();
  const grid = layout.root;
  if (grid && grid.type !== 'grid') problems.push('the layout is not a grid');
  else if (grid) {
    for (const axis of AXES) {
      const name = axis === 'row' ? 'column' : 'row';
      const t = tracksOf(grid, axis);
      if (!Array.isArray(t) || !t.length) { problems.push(`the grid has no ${name}s`); continue; }
      if (t.some((x) => !(x.size > 0) || !Number.isFinite(x.size))) problems.push(`a ${name} has no size`);
      const sum = t.reduce((s, x) => s + x.size, 0);
      if (Math.abs(sum - 1) > 1e-6) problems.push(`the ${name}s sum to ${sum}`);
      if (t.every((x) => x.fold)) problems.push(`every ${name} is folded`);
      for (let line = 1; line < t.length; line++)
        if (!grid.groups.some((g) => spanOf(g, axis).includes(line))) problems.push(`the line before ${name} ${line} is the edge of no group`);
    }
    const seenIds = new Set<string>([grid.id]);
    for (const g of grid.groups) {
      if (seenIds.has(g.id)) problems.push(`duplicate id ${g.id}`);
      seenIds.add(g.id);
      if (!(g.c0 >= 0 && g.c0 < g.c1 && g.c1 <= grid.cols.length && g.r0 >= 0 && g.r0 < g.r1 && g.r1 <= grid.rows.length))
        problems.push(`group ${g.id} is not a block of the grid`);
      if (g.panes.length === 0) problems.push(`empty group ${g.id}`);
      if (!g.panes.includes(g.active)) problems.push(`group ${g.id} has an active pane it does not hold`);
      for (const p of g.panes) {
        if (seenPanes.has(p)) problems.push(`pane ${p} appears twice`);
        seenPanes.add(p);
        if (!layout.panes[p]) problems.push(`pane ${p} has no definition`);
      }
    }
    if (Array.isArray(grid.cols) && Array.isArray(grid.rows))
      cellsOf(grid).forEach((row, r) => row.forEach((id, c) => {
        if (id === '') problems.push(`cell ${c},${r} is in no group`);
        if (id === '*') problems.push(`cell ${c},${r} is in two groups`);
      }));
  }
  for (const id of Object.keys(layout.panes)) if (!seenPanes.has(id)) problems.push(`pane ${id} is defined but not in the grid`);
  if (grid && (!layout.activePane || !seenPanes.has(layout.activePane))) problems.push('the active pane is not in the grid');
  if (!grid && layout.activePane) problems.push('an empty layout has an active pane');
  return problems;
}

// ---------------------------------------------------------------- limits

export interface UnitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const running = (shares: number[]) => {
  const p = [0];
  for (const s of shares) p.push(p[p.length - 1] + s);
  return p;
};

/** Each group's rectangle as a fraction of the window, as shown (no gaps; a strip has no size). */
export function unitRects(root: LayoutNode | null): Map<string, UnitRect> {
  const out = new Map<string, UnitRect>();
  if (root?.type !== 'grid') return out;
  const xs = running(shownShares(root.cols));
  const ys = running(shownShares(root.rows));
  out.set(root.id, { x: 0, y: 0, w: 1, h: 1 });
  for (const g of root.groups) out.set(g.id, { x: xs[g.c0], y: ys[g.r0], w: xs[g.c1] - xs[g.c0], h: ys[g.r1] - ys[g.r0] });
  return out;
}

/** Where a line is as shown (strips at no size), from 0 to 1. */
export function shownLine(grid: GridNode, axis: Axis, line: number): number {
  return running(shownShares(tracksOf(grid, axis)))[line];
}

/** The groups smaller than the limits allow, in either direction. Strips are not counted. */
export function smallStacks(layout: Layout, limits: Limits = DEFAULT_LIMITS): string[] {
  const rects = unitRects(layout.root);
  const away = foldedNodes(layout.root);
  return stacks(layout.root)
    .filter((s) => {
      if (away.has(s.id)) return false;
      const r = rects.get(s.id)!;
      return r.w + 1e-9 < (limits.minW ?? limits.minShare) || r.h + 1e-9 < (limits.minH ?? limits.minShare);
    })
    .map((s) => s.id);
}

export function checkLimits(layout: Layout, limits: Limits = DEFAULT_LIMITS) {
  const grid = layout.root;
  if (grid && (grid.cols.length > limits.maxTracks || grid.rows.length > limits.maxTracks))
    throw new OpError('too-many', `The window holds at most ${limits.maxTracks} columns and ${limits.maxTracks} rows`);
  if (smallStacks(layout, limits).length)
    throw new OpError('too-small', `That would make a pane smaller than ${Math.round(limits.minShare * 100)}% of the window`);
}

const fits = (layout: Layout, limits: Limits) => smallStacks(layout, limits).length === 0;

/** Strips that just opened come back at their old size; if that leaves a pane too small, the
 *  columns (or rows) are shared out evenly, the way a double-click on a divider does. Best effort. */
function fitOpened(layout: Layout, opened: Axis[], limits: Limits) {
  const lim = { ...RELAXED, minShare: limits.minShare > 0 ? limits.minShare : DEFAULT_LIMITS.minShare };
  if (!opened.length || fits(layout, lim) || !layout.root) return;
  const exact = copyPlain(layout.root);
  for (const axis of new Set(opened)) evenOut(layout.root, axis);
  layout.root = normalize(layout.root);
  if (!fits(layout, lim)) layout.root = exact;
}

function commit(before: Layout, after: Layout, limits: Limits, opened: Axis[] = []): OpResult {
  finish(after);
  const problems = validate(after);
  if (problems.length) throw new OpError('invalid', `Layout invariant broken: ${problems.join('; ')}`);
  fitOpened(after, opened, limits);
  checkLimits(after, limits);
  const changed =
    JSON.stringify(before.root) !== JSON.stringify(after.root) ||
    before.activePane !== after.activePane ||
    JSON.stringify(before.panes) !== JSON.stringify(after.panes);
  return { layout: changed ? after : before, changed };
}

// ------------------------------------------------------------- dividers

/** A divider: a stretch of one grid line where the groups either side of it differ. */
export interface Run {
  axis: Axis;
  /** The line it is on: between tracks `line - 1` and `line` along `axis`. */
  line: number;
  /** The tracks across it that it runs along, `from` to `to` (not included). */
  from: number;
  to: number;
  /** The groups either side of it, in order along it. */
  before: StackNode[];
  after: StackNode[];
}

/** Every divider of the grid: upright lines first, left to right, then lying ones, top to bottom. */
export function runs(grid: GridNode | null): Run[] {
  const out: Run[] = [];
  if (!grid) return out;
  const cells = cellsOf(grid);
  const byId = new Map(grid.groups.map((g) => [g.id, g]));
  for (const axis of AXES) {
    const n = tracksOf(grid, axis).length;
    const m = tracksOf(grid, across(axis)).length;
    const at = (t: number, x: number) => (axis === 'row' ? cells[x][t] : cells[t][x]);
    for (let line = 1; line < n; line++) {
      let start = -1;
      for (let x = 0; x <= m; x++) {
        const divides = x < m && at(line - 1, x) !== at(line, x);
        if (divides && start < 0) start = x;
        if (divides || start < 0) continue;
        const from = start;
        const side = (t: number) => [...new Set(Array.from({ length: x - from }, (_, i) => at(t, from + i)))].map((id) => byId.get(id)!);
        out.push({ axis, line, from, to: x, before: side(line - 1), after: side(line) });
        start = -1;
      }
    }
  }
  return out;
}

/** The divider where groups `before` and `after` meet along `axis`. */
export const runOf = (grid: GridNode | null, axis: Axis, before: string, after: string): Run | null =>
  runs(grid).find((r) => r.axis === axis && r.before.some((g) => g.id === before) && r.after.some((g) => g.id === after)) ?? null;

/** The groups either side of line `line` along `axis` at track `at` across it, and every other
 *  group on the line beside them as far as they reach: the least of the line that can move on its
 *  own (Alt on a divider), leaving no hole. */
export function stretchOf(grid: GridNode, axis: Axis, line: number, at: number): Set<string> {
  const touching = grid.groups.filter((g) => spanOf(g, axis).includes(line));
  const out = new Set<string>();
  let [u, v] = [at, at + 1];
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of touching) {
      const [s, e] = spanOf(g, across(axis));
      if (out.has(g.id) || s >= v || e <= u) continue;
      out.add(g.id);
      u = Math.min(u, s);
      v = Math.max(v, e);
      changed = true;
    }
  }
  return out;
}

/** The grid with line `line` along `axis` moved to `pos` (a share, from 0 to 1): every group edge on
 *  it moves, or only those of the groups in `only` (a stretch pulled away from the rest of its line).
 *  The grid is drawn again from the groups' edges: a line it passes is passed, and one it lands on
 *  exactly is the same line from then on. Unchecked (`moveLine` checks it; a drag clamps first). */
export function withLine(root: GridNode, axis: Axis, line: number, pos: number, only?: ReadonlySet<string>): GridNode {
  const grid = copyPlain(root);
  const tracks = tracksOf(grid, axis);
  const e = edges(tracks);
  const ends = grid.groups.map((g) => {
    const [a, b] = spanOf(g, axis);
    const moves = !only || only.has(g.id);
    return [a === line && moves ? pos : e[a], b === line && moves ? pos : e[b]];
  });
  const lines: number[] = [];
  for (const x of [0, 1, ...ends.flat()].sort((p, q) => p - q)) if (!lines.length || x - lines[lines.length - 1] > EPS) lines.push(x);
  const index = (x: number) => lines.findIndex((l) => Math.abs(l - x) <= EPS);
  // Each track keeps the fold of the one its middle was in (a dragged line never enters a folded one).
  const next: Track[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const mid = (lines[i] + lines[i + 1]) / 2;
    const was = tracks.find((_, j) => mid >= e[j] && mid < e[j + 1]);
    next.push(was?.fold ? { size: lines[i + 1] - lines[i], fold: was.fold } : { size: lines[i + 1] - lines[i] });
  }
  if (axis === 'row') grid.cols = next;
  else grid.rows = next;
  grid.groups.forEach((g, i) => setSpan(g, axis, index(ends[i][0]), index(ends[i][1])));
  return grid;
}

/** Moves a line (a divider drag, its arrow keys): see `withLine`. Refused when a pane would get too small. */
export function moveLine(layout: Layout, axis: Axis, line: number, pos: number, limits = DEFAULT_LIMITS, only?: ReadonlySet<string>): OpResult {
  const grid = layout.root;
  if (!grid || line < 1 || line >= tracksOf(grid, axis).length) throw new OpError('unknown-target', `No line ${line}`);
  if (!(pos > 0 && pos < 1)) throw new OpError('too-small', 'A pane cannot be resized to nothing');
  const next = cloneLayout(layout);
  next.root = withLine(grid, axis, line, pos, only);
  if (next.root.groups.some((g) => g.c0 >= g.c1 || g.r0 >= g.r1)) throw new OpError('too-small', 'A pane cannot be resized to nothing');
  return commit(layout, next, limits);
}

/** The space along `axis` shared out so that the groups across each row (column) of the other axis
 *  come out the same size. Each edge where groups meet is one unknown (they move it together); edges
 *  that come out at the same place are one line, and a column that needs another split than the one
 *  beside it gets a stretch of line of its own (three panes beside two, a
 *  double-click on the line between them should give the three a third each). Least squares, so a
 *  group across columns that want different splits comes out between them. In place; false when it
 *  cannot (a folded track along the axis, or a group it would turn inside out). */
function evenEdges(grid: GridNode, axis: Axis): boolean {
  const tracks = tracksOf(grid, axis);
  if (tracks.some((t) => t.fold)) return false;
  const n = tracks.length;
  const groups = grid.groups;
  // The edges, 2i the start of group i and 2i + 1 its end, joined where groups meet.
  const parent = groups.flatMap((_, i) => [2 * i, 2 * i + 1]);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  groups.forEach((g, i) => groups.forEach((h, j) => {
    const [u, v] = spanOf(g, across(axis));
    const [p, q] = spanOf(h, across(axis));
    if (i !== j && spanOf(g, axis)[1] === spanOf(h, axis)[0] && u < q && p < v) parent[find(2 * i + 1)] = find(2 * j);
  }));
  const e = edges(tracks);
  const fixed = new Map<number, number>();
  const unknown = new Map<number, number>();
  const now: number[] = [];
  groups.forEach((g, i) => {
    const [a, b] = spanOf(g, axis);
    for (const [edge, line] of [[2 * i, a], [2 * i + 1, b]]) {
      const c = find(edge);
      if (line === 0) fixed.set(c, 0);
      else if (line === n) fixed.set(c, 1);
      else if (!unknown.has(c)) { unknown.set(c, unknown.size); now.push(e[line]); }
    }
  });
  // The size each group should have: an even share of each row (column) of tracks across it.
  const want = groups.map(() => [] as number[]);
  for (let x = 0; x < tracksOf(grid, across(axis)).length; x++) {
    const inRow = groups.map((g, i) => (spanOf(g, across(axis))[0] <= x && x < spanOf(g, across(axis))[1] ? i : -1)).filter((i) => i >= 0);
    for (const i of inRow) want[i].push(1 / inRow.length);
  }
  // Least squares over the edges' places (a hair's pull to where they are, so it is never
  // undetermined): the normal equations, solved by elimination.
  const k = unknown.size;
  const M = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  groups.forEach((_, i) => {
    const target = want[i].reduce((s, w) => s + w, 0) / want[i].length;
    const row = new Map<number, number>();
    let rhs = target;
    for (const [edge, sign] of [[2 * i + 1, 1], [2 * i, -1]]) {
      const c = find(edge);
      if (fixed.has(c)) rhs -= sign * fixed.get(c)!;
      else row.set(unknown.get(c)!, (row.get(unknown.get(c)!) ?? 0) + sign);
    }
    for (const [r, a] of row) {
      for (const [c, b] of row) M[r][c] += a * b;
      M[r][k] += a * rhs;
    }
  });
  for (let i = 0; i < k; i++) { M[i][i] += 1e-9; M[i][k] += 1e-9 * now[i]; }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  const at = (edge: number) => { const c = find(edge); return fixed.has(c) ? fixed.get(c)! : M[unknown.get(c)!][k] / M[unknown.get(c)!][unknown.get(c)!]; };
  const ends = groups.map((_, i) => [at(2 * i), at(2 * i + 1)]);
  if (ends.some(([a, b]) => !(b - a > 1e-6) || !Number.isFinite(a) || !Number.isFinite(b))) return false;
  // The lines: every edge, once; edges within a hair of each other are one line.
  const lines: number[] = [];
  for (const x of [0, 1, ...ends.flat()].sort((p, q) => p - q)) if (!lines.length || x - lines[lines.length - 1] > 1e-7) lines.push(x);
  lines[lines.length - 1] = 1;
  const index = (x: number) => lines.findIndex((l) => Math.abs(l - x) <= 1e-7);
  const next = lines.slice(1).map((l, i) => ({ size: l - lines[i] }));
  if (axis === 'row') grid.cols = next;
  else grid.rows = next;
  groups.forEach((g, i) => setSpan(g, axis, index(ends[i][0]), index(ends[i][1])));
  return true;
}

/** Shares the space along `axis` out evenly: by the groups' edges (`evenEdges`), or, with strips
 *  along it, by the open tracks themselves, folded ones keeping their shares. In place. */
function evenOut(grid: GridNode, axis: Axis) {
  if (!evenEdges(grid, axis)) evenTracks(grid, axis);
}

/** The open tracks along `axis` shared so that the groups across each row (column) of the other
 *  axis come out the same size, as near as the grid allows. Folded tracks keep their shares. In place. */
function evenTracks(grid: GridNode, axis: Axis) {
  const tracks = tracksOf(grid, axis);
  const open = tracks.map((t, i) => (t.fold ? -1 : i)).filter((i) => i >= 0);
  if (open.length < 2) return;
  const total = open.reduce((s, i) => s + tracks[i].size, 0);
  // The size each group should have: an even share of each row (column) of tracks across it.
  const want = new Map<StackNode, number[]>();
  const cross = tracksOf(grid, across(axis)).length;
  for (let x = 0; x < cross; x++) {
    const inRow = grid.groups.filter((g) => {
      const [a, b] = spanOf(g, across(axis));
      const [p, q] = spanOf(g, axis);
      return a <= x && x < b && tracks.slice(p, q).some((t) => !t.fold);
    });
    for (const g of inRow) want.set(g, [...(want.get(g) ?? []), total / inRow.length]);
  }
  // Least squares over the open shares, pulled a little toward even (so it is never undetermined),
  // their sum fixed: the normal equations and one Lagrange row, solved by elimination.
  const n = open.length;
  const col = new Map(open.map((t, i) => [t, i]));
  const M = Array.from({ length: n + 1 }, () => new Array<number>(n + 2).fill(0));
  const pull = 1e-4;
  for (const [g, ws] of want) {
    const target = ws.reduce((s, w) => s + w, 0) / ws.length;
    const [p, q] = spanOf(g, axis);
    const idx: number[] = [];
    for (let t = p; t < q; t++) { const i = col.get(t); if (i !== undefined) idx.push(i); }
    for (const i of idx) {
      for (const j of idx) M[i][j] += 1;
      M[i][n + 1] += target;
    }
  }
  for (let i = 0; i < n; i++) {
    M[i][i] += pull;
    M[i][n + 1] += pull * (total / n);
    M[i][n] = 1;
    M[n][i] = 1;
  }
  M[n][n + 1] = total;
  for (let c = 0; c <= n; c++) {
    let piv = c;
    for (let r = c + 1; r <= n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r <= n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n + 1; k++) M[r][k] -= f * M[c][k];
    }
  }
  const solved = open.map((_, i) => (Math.abs(M[i][i]) < 1e-12 ? total / n : M[i][n + 1] / M[i][i]));
  // A share that comes out at (or under) nothing closes: the lines either side of it are one line now.
  const sizes = solved.map((x) => (x < 1e-4 ? 0 : x));
  const sum = sizes.reduce((a, b) => a + b, 0);
  const empty = grid.groups.some((g) => {
    const [p, q] = spanOf(g, axis);
    let w = 0;
    for (let t = p; t < q; t++) { const i = col.get(t); w += i === undefined ? tracks[t].size : sizes[i]; }
    return w <= EPS;
  });
  open.forEach((t, i) => { tracks[t].size = empty || !(sum > 0) ? total / n : (sizes[i] * total) / sum; });
}

/** Shares the columns (`row`) or rows (`column`) out evenly: a double-click on a divider. The groups
 *  across every row come out the same, not every child of a split (two columns on
 *  the left and one on the right came out 50/50), and a column of three beside one of two gets a
 *  third each, its line coming away from theirs. Strips stay folded. */
export function equalize(layout: Layout, axis: Axis): OpResult {
  if (!layout.root) return { layout, changed: false };
  const next = cloneLayout(layout);
  evenOut(next.root!, axis);
  return commit(layout, next, RELAXED);
}

// ------------------------------------------------------------ insertion

function newStack(layout: Layout, paneId: string, reuseId?: string): StackNode {
  return { type: 'stack', id: reuseId ?? freshId(layout, 'g'), panes: [paneId], active: paneId, c0: 0, c1: 1, r0: 0, r1: 1 };
}

/** The line along `axis` at `pos` (a share from 0 to 1): its index, made when there is none by
 *  cutting the track `pos` falls in (both halves keep its fold, and every group across it spans both). */
function lineAt(grid: GridNode, axis: Axis, pos: number): number {
  const tracks = tracksOf(grid, axis);
  const e = edges(tracks);
  const found = e.findIndex((x) => Math.abs(x - pos) <= EPS);
  if (found >= 0) return found;
  const i = tracks.findIndex((_, k) => pos > e[k] && pos < e[k + 1]);
  const t = tracks[i];
  tracks.splice(i, 1, { ...t, size: pos - e[i] }, { ...t, size: e[i + 1] - pos });
  for (const g of grid.groups) {
    const [a, b] = spanOf(g, axis);
    setSpan(g, axis, a > i ? a + 1 : a, b > i ? b + 1 : b);
  }
  return i + 1;
}

function insertBeside(layout: Layout, targetId: string, side: Side, fresh: StackNode, share: number) {
  const grid = layout.root!;
  const target = groupOf(grid, targetId);
  if (!target) throw new OpError('unknown-target', `No group ${targetId}`);
  const axis = sideAxis(side);
  const e = edges(tracksOf(grid, axis));
  const [a, b] = spanOf(target, axis);
  const w = e[b] - e[a];
  const cut = isBefore(side) ? e[a] + w * share : e[b] - w * share;
  // A line already inside the group near there is used, so the new edge lines up with the grid.
  let line = -1;
  for (let k = a + 1; k < b; k++)
    if (Math.abs(e[k] - cut) <= w * REUSE_LINE && (line < 0 || Math.abs(e[k] - cut) < Math.abs(e[line] - cut))) line = k;
  if (line < 0) line = lineAt(grid, axis, cut);
  const [a2, b2] = spanOf(target, axis);
  if (isBefore(side)) { setSpan(fresh, axis, a2, line); setSpan(target, axis, line, b2); }
  else { setSpan(target, axis, a2, line); setSpan(fresh, axis, line, b2); }
  setSpan(fresh, across(axis), ...spanOf(target, across(axis)));
  grid.groups.push(fresh);
}

function insertAtEdge(layout: Layout, side: Side, fresh: StackNode, share: number) {
  const grid = layout.root!;
  const axis = sideAxis(side);
  const tracks = tracksOf(grid, axis);
  for (const t of tracks) t.size *= 1 - share;
  const n = tracks.length;
  if (isBefore(side)) {
    tracks.unshift({ size: share });
    for (const g of grid.groups) { const [a, b] = spanOf(g, axis); setSpan(g, axis, a + 1, b + 1); }
    setSpan(fresh, axis, 0, 1);
  } else {
    tracks.push({ size: share });
    setSpan(fresh, axis, n, n + 1);
  }
  setSpan(fresh, across(axis), 0, tracksOf(grid, across(axis)).length);
  grid.groups.push(fresh);
}

function insertInGap(layout: Layout, target: Extract<DockTarget, { kind: 'gap' }>, fresh: StackNode) {
  const grid = layout.root!;
  const run = runOf(grid, target.axis, target.before, target.after);
  if (!run) throw new OpError('unknown-target', 'No divider there');
  const { axis } = run;
  const e = edges(tracksOf(grid, axis));
  const size = (g: StackNode) => { const [a, b] = spanOf(g, axis); return e[b] - e[a]; };
  const at = e[run.line];
  // Both measured before either cut (a cut moves the spans after it along).
  const left = at - GAP_GIVE * Math.min(...run.before.map(size));
  const right = at + GAP_GIVE * Math.min(...run.after.map(size));
  const from = lineAt(grid, axis, left);
  const to = lineAt(grid, axis, right);
  for (const g of run.before) setSpan(g, axis, spanOf(g, axis)[0], from);
  for (const g of run.after) setSpan(g, axis, to, spanOf(g, axis)[1]);
  setSpan(fresh, axis, from, to);
  setSpan(fresh, across(axis), run.from, run.to);
  grid.groups.push(fresh);
}

function place(layout: Layout, paneId: string, target: DockTarget, reuseStackId?: string) {
  if (!layout.root) {
    layout.root = { type: 'grid', id: GRID_ID, cols: [{ size: 1 }], rows: [{ size: 1 }], groups: [newStack(layout, paneId, reuseStackId)] };
    return;
  }
  switch (target.kind) {
    case 'stack': {
      const stack = groupOf(layout.root, target.stackId);
      if (!stack) throw new OpError('unknown-target', `No group ${target.stackId}`);
      const at = target.index === undefined ? stack.panes.length : Math.max(0, Math.min(stack.panes.length, target.index));
      stack.panes.splice(at, 0, paneId);
      stack.active = paneId;
      return;
    }
    case 'beside':
      return insertBeside(layout, target.nodeId, target.side, newStack(layout, paneId, reuseStackId), clampShare(target.share));
    case 'edge':
      return insertAtEdge(layout, target.side, newStack(layout, paneId, reuseStackId), clampShare(target.share));
    case 'gap':
      return insertInGap(layout, target, newStack(layout, paneId, reuseStackId));
  }
}

function targetExists(root: GridNode | null, target: DockTarget): boolean {
  switch (target.kind) {
    case 'stack':
      return !!groupOf(root, target.stackId);
    case 'beside':
      return !!groupOf(root, target.nodeId);
    case 'edge':
      return !!root;
    case 'gap':
      return !!runOf(root, target.axis, target.before, target.after);
  }
}

// --------------------------------------------------------------- removal

const SIDES: Side[] = ['left', 'top', 'right', 'bottom'];
const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** The groups touching `g` on one side. */
function neighboursOn(grid: GridNode, g: StackNode, side: Side): StackNode[] {
  const axis = sideAxis(side);
  const [a, b] = spanOf(g, axis);
  const [x, y] = spanOf(g, across(axis));
  return grid.groups.filter((h) => {
    if (h === g) return false;
    const [p, q] = spanOf(h, axis);
    const [u, v] = spanOf(h, across(axis));
    return (isBefore(side) ? q === a : p === b) && u < y && v > x;
  });
}

/** Group `g` leaves the grid. Its cells go to the groups on one side of it that fit it exactly
 *  (towards `toward` first, then one group before several, then left, above, right, below); open
 *  groups, not strips. When none fit (groups wound round it like a pinwheel), its columns (or rows)
 *  go and the groups across them close over them. Who took its room, and from which side. */
function removeGroup(grid: GridNode, g: StackNode, toward?: string): { by: StackNode[]; side: Side } | null {
  const options = SIDES.map((side) => {
    const by = neighboursOn(grid, g, side);
    const axis = sideAxis(side);
    const [x, y] = spanOf(g, across(axis));
    const exact = by.length > 0 && by.every((h) => { const [u, v] = spanOf(h, across(axis)); return u >= x && v <= y; });
    return { side, by, ok: exact && !by.some((h) => !!stripAxis(grid, h)) };
  }).filter((o) => o.ok);
  const towards = (o: { by: StackNode[] }) => (toward && o.by.some((h) => h.id === toward) ? 0 : 1);
  const lone = (o: { by: StackNode[] }) => (o.by.length === 1 ? 0 : 1);
  options.sort((p, q) => towards(p) - towards(q) || lone(p) - lone(q));
  grid.groups = grid.groups.filter((h) => h !== g);
  const best = options[0];
  if (best) {
    const axis = sideAxis(best.side);
    const [a, b] = spanOf(g, axis);
    for (const h of best.by) {
      const [p, q] = spanOf(h, axis);
      if (isBefore(best.side)) setSpan(h, axis, p, b);
      else setSpan(h, axis, a, q);
    }
    return { by: best.by, side: best.side };
  }
  for (const axis of AXES) {
    const [a, b] = spanOf(g, axis);
    if (grid.groups.some((h) => { const [p, q] = spanOf(h, axis); return p >= a && q <= b; })) continue;
    tracksOf(grid, axis).splice(a, b - a);
    const shift = (x: number) => (x >= b ? x - (b - a) : x > a ? a : x);
    for (const h of grid.groups) {
      const [p, q] = spanOf(h, axis);
      setSpan(h, axis, shift(p), shift(q));
    }
    return null;
  }
  // Never met in practice: the rest side by side, in one row.
  grid.cols = grid.groups.map(() => ({ size: 1 / grid.groups.length }));
  grid.rows = [{ size: 1 }];
  grid.groups.forEach((h, i) => { h.c0 = i; h.c1 = i + 1; h.r0 = 0; h.r1 = 1; });
  return null;
}

/** A lone pane that is a whole column (or row) of its own, dropped beside a group along that axis:
 *  its share goes to that group's tracks, so every other group keeps its size ([1|2|3], 3 right of
 *  1 -> [1|3|2], 2 as wide as before). Whether it did. */
function handOver(grid: GridNode, source: StackNode, target: DockTarget): boolean {
  if (target.kind !== 'beside') return false;
  const axis = sideAxis(target.side);
  const dest = groupOf(grid, target.nodeId);
  const [a, b] = spanOf(source, axis);
  const [x, y] = spanOf(source, across(axis));
  if (!dest || x !== 0 || y !== tracksOf(grid, across(axis)).length) return false;
  const tracks = tracksOf(grid, axis);
  const [p, q] = spanOf(dest, axis);
  if (tracks.slice(a, b).some((t) => t.fold) || tracks.slice(p, q).some((t) => t.fold)) return false;
  const freed = tracks.slice(a, b).reduce((s, t) => s + t.size, 0);
  const own = tracks.slice(p, q).reduce((s, t) => s + t.size, 0);
  for (let i = p; i < q; i++) tracks[i].size += (freed * tracks[i].size) / own;
  grid.groups = grid.groups.filter((h) => h !== source);
  tracks.splice(a, b - a);
  for (const h of grid.groups) {
    const [s, e] = spanOf(h, axis);
    setSpan(h, axis, s >= b ? s - (b - a) : s, e >= b ? e - (b - a) : e);
  }
  return true;
}

// ------------------------------------------------------------ operations

/** Opens a new pane. Without a target it becomes a tab of the active pane's group. */
export function openPane(
  layout: Layout,
  kind: string,
  title: string,
  target?: DockTarget,
  options: { preview?: boolean; limits?: Limits; color?: number } = {},
): OpResult & { paneId: string } {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const next = cloneLayout(layout);
  const paneId = freshId(next, 'p');
  next.panes[paneId] = { id: paneId, kind, title, color: options.color ?? freshColor(next), ...(options.preview ? { preview: true } : {}) };
  const fallback: DockTarget | null = next.activePane ? { kind: 'stack', stackId: findStackOf(next.root, next.activePane)!.id } : null;
  const where = target ?? fallback;
  if (where && next.root && !targetExists(next.root, where)) throw new OpError('unknown-target', 'The place to open the pane is gone');
  place(next, paneId, where ?? { kind: 'edge', side: 'right' });
  next.activePane = paneId;
  return { ...commit(layout, next, limits, reveal(next, paneId)), paneId };
}

/** Shows something else in an existing pane: the tab keeps its place, only its page changes. */
export function retargetPane(layout: Layout, paneId: string, kind: string, title: string, preview?: boolean): OpResult {
  const pane = layout.panes[paneId];
  if (!pane || !findStackOf(layout.root, paneId)) throw new OpError('unknown-pane', `No pane ${paneId}`);
  const next = cloneLayout(layout);
  next.panes[paneId] = { id: paneId, kind, title, ...(pane.color !== undefined ? { color: pane.color } : {}), ...(preview ? { preview: true } : {}) };
  findStackOf(next.root, paneId)!.active = paneId;
  next.activePane = paneId;
  return commit(layout, next, RELAXED);
}

/** A preview pane becomes an ordinary one (double-clicked, dragged, typed in). */
export function keepPane(layout: Layout, paneId: string): OpResult {
  const pane = layout.panes[paneId];
  if (!pane) throw new OpError('unknown-pane', `No pane ${paneId}`);
  if (!pane.preview) return { layout, changed: false };
  const next = cloneLayout(layout);
  delete next.panes[paneId].preview;
  return { layout: next, changed: true };
}

/** Makes a pane the shown tab of its group and the active pane. A pane in a strip opens first. */
export function activatePane(layout: Layout, paneId: string, options: { reveal?: boolean } = {}): OpResult {
  const next = cloneLayout(layout);
  const stack = findStackOf(next.root, paneId);
  if (!stack) throw new OpError('unknown-pane', `No pane ${paneId}`);
  stack.active = paneId;
  next.activePane = paneId;
  const opened = options.reveal === false ? [] : reveal(next, paneId);
  return commit(layout, next, RELAXED, opened);
}

/**
 * Moves a pane: a removal followed by an insert.
 *
 * The room it leaves: a lone pane's group goes (`removeGroup`, towards where it is going), or, a
 * whole column of its own dropped beside a group, gives that group its share (`handOver`).
 */
/** Every page in one group, in reading order, the one in use in front: a space as a phone first
 *  shows it, from the desktop's layout (one pane, not the desktop's splits). */
export function onePane(layout: Layout): Layout {
  const groups = stacks(layout.root);
  if (groups.length < 2) return layout;
  let out = layout;
  for (const g of groups.slice(1)) for (const id of g.panes) out = movePane(out, id, { kind: 'stack', stackId: groups[0].id }).layout;
  return layout.activePane && out.panes[layout.activePane] ? activatePane(out, layout.activePane).layout : out;
}

export function movePane(layout: Layout, paneId: string, target: DockTarget, limits = DEFAULT_LIMITS): OpResult {
  if (!layout.panes[paneId]) throw new OpError('unknown-pane', `No pane ${paneId}`);
  if (!targetExists(layout.root, target)) throw new OpError('unknown-target', 'The drop target is gone');
  const next = cloneLayout(layout);
  // A preview that is dragged somewhere is being kept there.
  if (next.panes[paneId].preview) delete next.panes[paneId].preview;
  const grid = next.root!;
  const source = findStackOf(grid, paneId)!;
  const alone = source.panes.length === 1;

  // Reordering inside its own group.
  if (target.kind === 'stack' && target.stackId === source.id) {
    const from = source.panes.indexOf(paneId);
    let to = target.index === undefined ? source.panes.length - 1 : target.index;
    if (to > from) to -= 1;
    source.panes.splice(from, 1);
    source.panes.splice(Math.max(0, Math.min(source.panes.length, to)), 0, paneId);
    source.active = paneId;
    next.activePane = paneId;
    return commit(layout, next, limits);
  }

  if (alone) {
    // A lone pane dropped beside its own group, or in a divider of its own, goes nowhere.
    if (target.kind === 'beside' && target.nodeId === source.id) return { layout, changed: false };
    if (grid.groups.length === 1) return { layout, changed: false }; // the only pane in the window
    if (target.kind === 'gap' && (target.before === source.id || target.after === source.id)) return { layout, changed: false };
  }

  source.panes.splice(source.panes.indexOf(paneId), 1);
  if (alone) {
    const toward = target.kind === 'beside' ? target.nodeId : target.kind === 'stack' ? target.stackId : target.kind === 'gap' ? target.before : undefined;
    if (!handOver(grid, source, target)) removeGroup(grid, source, toward);
    next.root = normalize(grid);
    if (!targetExists(next.root, target)) throw new OpError('unknown-target', 'The drop target is gone');
  } else if (source.active === paneId) {
    source.active = source.panes[0];
  }

  // A lone pane keeps its group's id, so the view animates the same card to its new place.
  place(next, paneId, target, alone ? source.id : undefined);
  next.activePane = paneId;
  return commit(layout, next, limits, reveal(next, paneId));
}

/** Closes a pane and remembers where it was. A group closing gives its cells to the groups beside it. */
export function closePane(layout: Layout, paneId: string): OpResult & { closed: ClosedPane } {
  const pane = layout.panes[paneId];
  if (!pane) throw new OpError('unknown-pane', `No pane ${paneId}`);
  const next = cloneLayout(layout);
  const grid = next.root!;
  const stack = findStackOf(grid, paneId)!;
  const index = stack.panes.indexOf(paneId);
  let restore: DockTarget | null = null;
  if (stack.panes.length > 1) {
    restore = { kind: 'stack', stackId: stack.id, index };
    stack.panes.splice(index, 1);
    // The tab to its right comes forward (the left one when it was the last).
    if (stack.active === paneId) stack.active = stack.panes[Math.min(index, stack.panes.length - 1)];
    if (next.activePane === paneId) next.activePane = stack.active;
  } else if (grid.groups.length === 1) {
    next.root = null;
    next.activePane = null;
  } else {
    const was = unitRects(grid);
    const size = (id: string, axis: Axis) => { const r = was.get(id)!; return axis === 'row' ? r.w : r.h; };
    const n = { cols: grid.cols.length, rows: grid.rows.length };
    const { c0, c1, r0, r1 } = stack;
    const took = removeGroup(grid, stack);
    if (took) {
      const axis = sideAxis(took.side);
      const side = opposite[took.side];
      const whole = axis === 'row' ? r0 === 0 && r1 === n.rows : c0 === 0 && c1 === n.cols;
      const atEdge = side === 'right' ? c1 === n.cols : side === 'left' ? c0 === 0 : side === 'bottom' ? r1 === n.rows : r0 === 0;
      const mine = size(stack.id, axis);
      // One group took it: it comes back beside that one at the share it had of the two. Several
      // took a whole column (or row) along a window edge: it comes back along that edge.
      if (took.by.length === 1) restore = { kind: 'beside', nodeId: took.by[0].id, side, share: mine / (mine + size(took.by[0].id, axis)) };
      else if (whole && atEdge) restore = { kind: 'edge', side, share: mine };
      else restore = { kind: 'beside', nodeId: took.by[0].id, side, share: mine / (mine + size(took.by[0].id, axis)) };
    }
    if (next.activePane === paneId) next.activePane = took?.by[0] ? frontOf(took.by[0]) : null;
  }
  delete next.panes[paneId];
  const opened = next.activePane && next.activePane !== layout.activePane ? reveal(next, next.activePane) : [];
  return { ...commit(layout, next, RELAXED, opened), closed: { pane, restore } };
}

/** Puts a closed pane back where it was; along the right edge when that place is gone. */
export function reopenPane(layout: Layout, closed: ClosedPane, limits = DEFAULT_LIMITS): OpResult {
  const next = cloneLayout(layout);
  next.panes[closed.pane.id] = closed.pane;
  const target = closed.restore && targetExists(next.root, closed.restore) ? closed.restore : { kind: 'edge' as const, side: 'right' as const };
  place(next, closed.pane.id, target);
  next.activePane = closed.pane.id;
  try {
    return commit(layout, next, limits, reveal(next, closed.pane.id));
  } catch (e) {
    if (!(e instanceof OpError) || (e.code !== 'too-small' && e.code !== 'too-many')) throw e;
    // Never lose a pane: when its old place is too small now, it comes back as a tab.
    const again = cloneLayout(layout);
    again.panes[closed.pane.id] = closed.pane;
    const stack = again.activePane ? findStackOf(again.root, again.activePane) : null;
    place(again, closed.pane.id, stack ? { kind: 'stack', stackId: stack.id } : { kind: 'edge', side: 'right' });
    again.activePane = closed.pane.id;
    return commit(layout, again, RELAXED, reveal(again, closed.pane.id));
  }
}

// ------------------------------------------------------------- folding

/** The ways group `g` can fold: along each axis, the band around it (`bandOf`) when something else
 *  stays open; the one taking fewest other groups with it first, columns before rows. */
function foldOptions(grid: GridNode, g: StackNode): { axis: Axis; band: [number, number] }[] {
  return AXES.map((axis) => {
    const band = bandOf(grid, axis, ...spanOf(g, axis));
    const others = grid.groups.filter((h) => { const [p, q] = spanOf(h, axis); return h !== g && p >= band[0] && q <= band[1]; }).length;
    return { axis, band, others, ok: canFoldBand(grid, axis, ...band) };
  })
    .filter((o) => o.ok)
    .sort((p, q) => p.others - q.others)
    .map(({ axis, band }) => ({ axis, band }));
}

/** Whether group `nodeId` can be folded into a strip: not when it is all the space shows. */
export function canCollapse(layout: Layout, nodeId: string): boolean {
  const grid = layout.root;
  const g = groupOf(grid, nodeId);
  return !!grid && !!g && !stripAxis(grid, g) && foldOptions(grid, g).length > 0;
}

/** Folds tracks `a` to `b` along an axis (with the band around them: `bandOf`) into strips; their
 *  room goes to the open track on the `heir` side (before them when there is one, unless said). The
 *  active pane, if it is folded away, moves to the group that grew. */
export function collapseTracks(layout: Layout, axis: Axis, a: number, b: number, heir?: FoldSide): OpResult {
  const grid0 = layout.root;
  if (!grid0) throw new OpError('unknown-target', 'Nothing to fold');
  const [x, y] = bandOf(grid0, axis, a, b);
  if (!canFoldBand(grid0, axis, x, y)) throw new OpError('last-open', 'At least one pane stays open');
  const next = cloneLayout(layout);
  const grid = next.root!;
  const tracks = tracksOf(grid, axis);
  const side = heir ?? (tracks.slice(0, x).some((t) => !t.fold) ? 'before' : 'after');
  for (let i = x; i < y; i++) tracks[i].fold = side;
  // Focus moves to a group that grew (beside the band, nearest the active one), unless it is in one.
  const h = heirOf(tracks, x);
  const grew = grid.groups.filter((g) => { const [p, q] = spanOf(g, axis); return p <= h && h < q && !stripAxis(grid, g); });
  const active = next.activePane ? findStackOf(grid, next.activePane) : null;
  if (active && !grew.includes(active)) {
    const [u, v] = spanOf(active, across(axis));
    const to = grew.find((g) => { const [s, e] = spanOf(g, across(axis)); return s < v && e > u; }) ?? grew[0] ?? grid.groups.find((g) => !stripAxis(grid, g));
    if (to) next.activePane = frontOf(to);
  }
  return commit(layout, next, RELAXED);
}

/** Folds the column or row a group is in (the whole band around it: everything in it folds with it)
 *  into strips: along `axis` when given, else the way that takes fewest other groups with it. */
export function collapseNode(layout: Layout, nodeId: string, heir?: FoldSide, axis?: Axis): OpResult {
  const grid = layout.root;
  const g = groupOf(grid, nodeId);
  if (!grid || !g) throw new OpError('unknown-target', `No group ${nodeId}`);
  if (stripAxis(grid, g)) return { layout, changed: false };
  const option = foldOptions(grid, g).find((o) => !axis || o.axis === axis);
  if (!option) throw new OpError('last-open', 'At least one pane stays open');
  return collapseTracks(layout, option.axis, ...option.band, heir);
}

/** The layout as a zoomed group shows it (a view: nothing is saved): every column and row it is not
 *  in folded into strips, their room going toward it, so it fills the rest. Undone, each comes back
 *  as it was (zooming folds the others, it does not hide them). */
export function foldedAround(root: GridNode, keepId: string): GridNode {
  const keep = groupOf(root, keepId);
  if (!keep) return root;
  const grid = copyPlain(root);
  for (const axis of AXES) {
    const [a, b] = spanOf(keep, axis);
    tracksOf(grid, axis).forEach((t, i) => {
      if (i >= a && i < b) delete t.fold;
      else t.fold = i < a ? 'after' : 'before';
    });
  }
  return grid;
}

/** Opens a strip at exactly the size it had (with what folded with it); `paneId` (one of its panes)
 *  comes forward. Along `axis` only, when given (a strip's divider pulled away from it). */
export function expandNode(layout: Layout, nodeId: string, paneId?: string, limits = DEFAULT_LIMITS, axis?: Axis): OpResult {
  const node = groupOf(layout.root, nodeId);
  if (!node) throw new OpError('unknown-target', `No group ${nodeId}`);
  const front = paneId && node.panes.includes(paneId) ? paneId : frontOf(node);
  const next = cloneLayout(layout);
  const opened = reveal(next, front, axis);
  findStackOf(next.root, front)!.active = front;
  next.activePane = front;
  return commit(layout, next, limits, opened);
}

/** Opens every strip, each at the size it had. The active pane stays. */
export function expandAll(layout: Layout, limits = DEFAULT_LIMITS): OpResult {
  const next = cloneLayout(layout);
  const opened: Axis[] = [];
  if (next.root)
    for (const axis of AXES)
      for (const t of tracksOf(next.root, axis))
        if (t.fold) { delete t.fold; opened.push(axis); }
  return commit(layout, next, limits, opened);
}

// ------------------------------------------------------------ direction

/** The group next to `stackId` in a direction: the nearest that overlaps it across (ties: most overlap). */
export function neighbourStack(root: LayoutNode | null, stackId: string, dir: Direction): StackNode | null {
  const rects = unitRects(root);
  const from = rects.get(stackId);
  if (!from) return null;
  const eps = 1e-6;
  const away = foldedNodes(root);
  let best: { s: StackNode; d: number; overlap: number } | null = null;
  for (const s of stacks(root)) {
    if (s.id === stackId || away.has(s.id)) continue;
    const r = rects.get(s.id)!;
    const horizontal = dir === 'left' || dir === 'right';
    const d = horizontal
      ? dir === 'left' ? from.x - (r.x + r.w) : r.x - (from.x + from.w)
      : dir === 'up' ? from.y - (r.y + r.h) : r.y - (from.y + from.h);
    const overlap = horizontal
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x);
    if (d < -eps || overlap <= eps) continue;
    if (!best || d < best.d - eps || (Math.abs(d - best.d) <= eps && overlap > best.overlap)) best = { s, d, overlap };
  }
  return best?.s ?? null;
}

/** Splits the active pane: the same page again, beside it. */
export function splitPane(layout: Layout, paneId: string, side: Side, limits = DEFAULT_LIMITS): OpResult & { paneId: string } {
  const pane = layout.panes[paneId];
  const stack = findStackOf(layout.root, paneId);
  if (!pane || !stack) throw new OpError('unknown-pane', `No pane ${paneId}`);
  return openPane(layout, pane.kind, pane.title, { kind: 'beside', nodeId: stack.id, side, share: 0.5 }, { limits });
}

// ------------------------------------------------------- older layouts

interface TreeStack { type: 'stack'; id: string; panes: string[]; active: string; collapsed?: boolean; heir?: FoldSide }
interface TreeSplit { type: 'split'; id: string; axis: Axis; children: TreeNode[]; weights: number[]; collapsed?: boolean; heir?: FoldSide }
type TreeNode = TreeStack | TreeSplit;

/** A layout saved before the grid (a tree of splits within splits): the same groups at the same
 *  sizes, on a grid. A folded node stays folded when the grid has a band that is exactly it. */
export function fromTree(root: TreeNode | null): GridNode | null {
  if (!root) return null;
  const rects = new Map<TreeNode, UnitRect>();
  const lay = (node: TreeNode, r: UnitRect) => {
    rects.set(node, r);
    if (node.type !== 'split') return;
    const total = node.weights.reduce((a, b) => a + b, 0) || 1;
    let off = 0;
    node.children.forEach((child, i) => {
      const w = (node.weights[i] ?? 0) / total;
      lay(child, node.axis === 'row' ? { x: r.x + off * r.w, y: r.y, w: r.w * w, h: r.h } : { x: r.x, y: r.y + off * r.h, w: r.w, h: r.h * w });
      off += w;
    });
  };
  lay(root, { x: 0, y: 0, w: 1, h: 1 });
  const leaves = [...rects.keys()].filter((n): n is TreeStack => n.type === 'stack');
  const linesOf = (ends: number[]) => {
    const out: number[] = [];
    for (const x of ends.sort((a, b) => a - b)) if (!out.length || x - out[out.length - 1] > 1e-7) out.push(x);
    out[0] = 0;
    out[out.length - 1] = 1;
    return out;
  };
  const xs = linesOf(leaves.flatMap((s) => { const r = rects.get(s)!; return [r.x, r.x + r.w, 0, 1]; }));
  const ys = linesOf(leaves.flatMap((s) => { const r = rects.get(s)!; return [r.y, r.y + r.h, 0, 1]; }));
  const near = (lines: number[], x: number) => lines.reduce((best, l, i) => (Math.abs(l - x) < Math.abs(lines[best] - x) ? i : best), 0);
  const trackList = (lines: number[]): Track[] => lines.slice(1).map((l, i) => ({ size: l - lines[i] }));
  const grid: GridNode = {
    type: 'grid', id: GRID_ID, cols: trackList(xs), rows: trackList(ys),
    groups: leaves.map((s) => {
      const r = rects.get(s)!;
      return { type: 'stack', id: s.id, panes: [...s.panes], active: s.active, c0: near(xs, r.x), c1: near(xs, r.x + r.w), r0: near(ys, r.y), r1: near(ys, r.y + r.h) };
    }),
  };
  const fold = (node: TreeNode, axis: Axis | null) => {
    if (node.collapsed && axis) {
      const r = rects.get(node)!;
      const lines = axis === 'row' ? xs : ys;
      const a = near(lines, axis === 'row' ? r.x : r.y);
      const b = near(lines, axis === 'row' ? r.x + r.w : r.y + r.h);
      const [x, y] = bandOf(grid, axis, a, b);
      if (x === a && y === b && canFoldBand(grid, axis, a, b)) for (let i = a; i < b; i++) tracksOf(grid, axis)[i].fold = node.heir ?? 'before';
      return;
    }
    if (node.type === 'split') for (const c of node.children) fold(c, node.axis);
  };
  fold(root, null);
  return normalize(grid);
}

/** A layout as saved, whichever model saved it: one saved as a tree comes back on the grid, and
 *  panes saved before panes had colours get one each. */
export function migrateLayout(layout: Layout): Layout {
  const root = layout.root as unknown as { type?: string } | null;
  const grid = !root || root.type === 'grid' ? layout : { ...layout, root: fromTree(root as unknown as TreeNode) };
  return withColours(grid);
}
