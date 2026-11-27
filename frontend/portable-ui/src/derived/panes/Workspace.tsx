// Panes: pages in groups of tabs, groups side by side or stacked, after the tabbed layout reference
// pack (its model, geometry, drop zones and drag are in this folder). Everything is drawn from one
// geometry pass and positioned absolutely; pages are a flat list keyed by pane id beside the cards,
// never inside them, so moving a pane only changes its coordinates and keeps its scroll and state.
//
// Desktop: drag a tab to another group, to a side of one (a split), to a divider or a window edge;
// drag a divider (or arrows on it) to resize, double-click it to share evenly. The groups sit on one
// grid (model.ts), so a divider is a grid line: dragging it moves every stretch of that line. A tab's
// × closes it with an Undo notice. A pane moves by dragging its tab (Shift+arrows no longer move it:
// ).
//
// Phone (PHONE_QUERY): our own layout, not the pack's. One page fills the screen; a floating bar at
// the bottom names it and says "2 of 4" (swipe it to go to the next or previous); tapping it opens a
// sheet of every open page, where one can be shown below the other with a handle between them. The
// phone's view never changes the desktop layout.
import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ErrorInfo, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, Ellipsis, FileText, Maximize2, Minimize2, PanelBottom, PanelBottomClose, PanelRight, PanelRightClose, Plus, X } from 'lucide-react';
import { computeGeometry, gapKey, joinRects, REST, type GapBox, type Geometry, type Metrics, type Rect, type StripBox } from './geometry';
import {
  across, activatePane, bandOf, canCollapse, colorOf, canFoldBand, closePane, collapseNode, collapseTracks, edges, equalize, expandNode, keepPane, findNode, findStackOf, foldedAlong,
  movePane, moveLine, readingOrder, reopenPane, runs, shownLine, shownOrder, spanOf, stretchOf, neighbourStack, foldedNodes, expandAll, splitPane, tracksOf, withLine,
  OpError, RELAXED, type Axis, type ClosedPane, type FoldSide, type GridNode, type Layout, type LayoutNode, type OpResult, type Pane, type Side, type StackNode,
  foldedAround, DEFAULT_LIMITS, emptyLayout, openPane, type DockTarget, type Limits } from './model';

/** The id a page brought in from outside drags under: it is no pane yet. */
const BRING_ID = '\u0000brought';
/** On the phone, the place past the last page the bar swipes to: the empty view, to open something
 *  new from. */
const BLANK = '\u0000blank';
import { bounds, clampLine, snapLine } from './resize';
import { planBring, type BringPage, type DropPlan, type Hit } from './zones';
import type { Apply, PaneHistory } from './store';
import { bindingFor, isTypingTarget, type PaneKeyCommands } from './keymap';
import { Keys } from '../../keys/Keys';
import { useAltState } from './useAltState';
import { AltHints } from './AltHints';
import { usePaneFocus } from './usePaneFocus';
import { DragOverlay, Ghost } from './DragOverlay';
import { dragStore, useDrag } from './dragStore';
import { rectStyle } from './rectStyle';
import { landing, project, usePresence, useSpring, useDrag as useAxisDrag, VelocityTracker } from '../../lib/motion';
import { useTabDrag } from './useTabDrag';
import { mix, PaneMotion, type Fold, type FoldPart, type MotionKind, type MotionTarget } from './motion';
import { notify } from '../../base/notify';
import { Button } from '../../base/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../base/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '../../base/dropdown-menu';
import './panes.css';

/** Below this width the phone layout is used. The CSS uses the same number. */
/** A phone: narrower than 600 px, or a touch screen under 460 px tall (on its side; a tablet on its
 *  side is taller). The same as the styles' `phone` variant (styles.css), which the frame goes by, so
 *  the two never disagree (sideways, a phone's top bar sat over a desktop's panes,
 *  their tabs through the page; then a tablet on its side got a phone's bar). */
export const PHONE_QUERY = '(max-width: 599px), (max-height: 460px) and (pointer: coarse)';
/** A tablet's size, either way up (or a desktop window as narrow): the desktop's panes, its sidebar
 *  starting as the rail so they have the room. Phones are left to PHONE_QUERY. */
export const TABLET_QUERY = '(min-width: 600px) and (max-width: 1023px)';
/** Cards here have no header row under the tabs: a page draws its own. */
const AT_REST: Metrics = { ...REST, gap: 1, inset: 0, header: 0 };
const KEY_STEP = 16;
const KEY_STEP_BIG = 80;
const PHONE_HANDLE = 14;
/** A window resize is over after this long without another. */
export const RESIZE_QUIET_MS = 150;
/** The shares stay on a divider this long after an even share or an arrow key. */
export const EVEN_LABEL_MS = 1100;
/** The smallest a group may be dragged to before it folds (px): its tab bar and a few lines of page
 *  (groups got very small before folding); at most `most` of the area, so two fit. */
const MIN_PANE = { w: 280, h: 160, most: 0.4 };
/** A flick that would carry a divider this far past the smallest size folds that side into a strip
 *  (and, with reduced motion, a pull this far past it does, on letting go). */
export const COLLAPSE_PAST = 48;
/** A strip's divider let go this far away from it opens the strip. */
export const STRIP_PULL = 24;
/** A divider let go faster than this (px a second) goes on the way it was going. */
export const FLICK = 250;
/** Arrow presses on a divider closer together than this are one undo step. */
export const KEY_BURST_MS = 600;
/** A line dragged this close to another lands on it, and the two are one line from then on. */
export const SNAP_PX = 8;

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export type PaneInfo = {
  active: boolean;
  visible: boolean;
  /** The page has unsaved changes: its tab shows a dot in place of ×. */
  setDirty(dirty: boolean): void;
  /** A preview becomes an ordinary tab (typing in it does this already). */
  keep(): void;
};
/** The active pane's frame shows this long after the active group changes. */
export const FRAME_GLIDE_MS = 900;
/** A pane brought forward from outside (a link, the sidebar) or dropped glows this long. */
export const GLOW_MS = 900;
/** What rides the layout's motion (motion.ts), by key: a group's card and a strip keep their layout
 *  and are cut, a page too, a divider and the active-pane frame are stretched. */
const motionKey = (kind: 'card' | 'body' | 'strip' | 'gap' | 'frame', id = '') => `${kind}:${id}`;
/** A line being dragged: where it has got to (`only`: the groups of the stretch pulled away alone). */
type LiveLine = { axis: Axis; line: number; pos: number; only?: ReadonlySet<string> };
/** The divider `held` in another layout (one a drag has drawn): the stretch between the same groups,
 *  whatever it is named there (a line that lands on another is part of that one, named after it). */
const sameDivider = (g: Geometry, held: GapBox): GapBox | undefined =>
  g.gaps.find((x) => x.key === held.key)
  ?? g.gaps.find((x) => x.axis === held.axis && x.before.some((s) => held.before.some((b) => b.id === s.id)) && x.after.some((s) => held.after.some((a) => a.id === s.id)));
/** Where the label of the divider `held` goes on `r` (where its line is now): along the line, the
 *  middle of the stretch in hand, wherever the line it is part of reaches (landed on
 *  another line, the label jumped to the middle of the two). */
const labelSpot = (r: Rect, held: GapBox): Rect =>
  held.axis === 'row' ? { x: r.x, y: held.rect.y, w: r.w, h: held.rect.h } : { x: held.rect.x, y: r.y, w: held.rect.w, h: r.h };
/** A line's place as its divider's label says it: [33, 67]. */
const lineShares = (pos: number): [number, number] => { const a = Math.round(pos * 100); return [a, 100 - a]; };

interface Props {
  layout: Layout;
  apply: Apply;
  /** Undo and redo (from `usePaneLayout`): Mod+Z and Mod+Shift+Z, and a drag or a burst of keys as one step. */
  history?: PaneHistory;
  /** The page a pane shows. */
  render(pane: Pane, info: PaneInfo): ReactNode;
  /** A second line for a pane on the phone's sheet (a chapter, say); it also tells apart two tabs
   * with the same title. */
  detail?(pane: Pane): string | undefined;
  /** Names the workspace for assistive technology ("Notes"). */
  label: string;
  /** Ready-made layouts the empty screen offers ("Two side by side"). */
  layouts?: { label: string; make(): Layout }[];
  /** Opens the app's search (Ctrl/⌘+K), for the empty screen's "Search" button. The workspace has no
   * search of its own, and no shortcuts dialog: the app's list the pane keys (PANE_SHORTCUTS). */
  onSearch?(): void;
  /** A pane's icon on a strip (a folded group); a page icon when not given. */
  icon?(pane: Pane): ReactNode;
  /** A page that crashed: reported, and only its own pane shows the error. */
  onCrash?(title: string, error: Error): void;
  /** What shows with no pane open, in place of the built-in screen (layouts, open a page, reopen). */
  empty?: ReactNode;
  /** The other places a pane can go (the app's spaces): its menu's "Move to space" lists them, and a
   *  new one; `onMove` moves the pane (`to` null: a new space). */
  moveTo?: MoveTo;
  /** Set to a function that starts dragging a page in from outside the panes (the sidebar's lessons
   *  and links, ): the same hints, map and label as a tab's drag, and it opens where
   *  it is dropped; a page already open is dragged as its own tab. */
  bring?: { current: Bring | null };
  /** A drag brought in from outside has started moving (the app shows the panes, if a page was
   *  drawn over them). */
  onBringStart?(): void;
  /** Under something else (a page drawn over the panes): it takes no keys and draws no Alt hints,
   *  as if it were not there (Option over a page drew the space's hints on it, and
   *  its keys changed the space). A drag brought in still works. */
  dormant?: boolean;
  /** A page the app draws over the panes. A lesson or a page brought in from the
   *  sidebar lands on it, not in the space under it: one that can be a pane makes a new space of the
   *  two (`onDrop` gets its layout), planned and drawn as a drop into that page alone would be; one
   *  that cannot (Home, the Spaces page) refuses it in red, `refuse` saying why, and `onRefuse`
   *  hears of it whether it was dropped there or let go anywhere else. */
  cover?: Cover;
}

export type Cover =
  | {
    page: BringPage; onDrop(layout: Layout, brought: BringPage): void;
    /** Each half of the page puts the page brought in beside it on that side, its ghost that half
     *  (a project's page alone, "a pane should be able to be dropped at either
     *  side"); else only its edges do, and its middle makes a tab. */
    halves?: boolean;
    /** What the drop's label starts with: what dropping makes ("New space: " by default). */
    makes?: string;
  }
  | { refuse: string; onRefuse(brought: BringPage): void };

/** A page drawn over the panes, laid out as a space of its own: what a page brought onto it is planned on. */
interface Covering { layout: Layout; paneId: string; stackId: string; geo: Geometry }

function coverSpace(page: BringPage, area: Rect): Covering {
  const made = openPane(emptyLayout(), page.kind, page.title, undefined, { color: page.color });
  const stackId = findStackOf(made.layout.root, made.paneId)!.id;
  return { layout: made.layout, paneId: made.paneId, stackId, geo: computeGeometry(made.layout.root, area, AT_REST) };
}

export interface MoveTo {
  places: { id: string; name: string }[];
  onMove(paneId: string, to: string | null): void;
  /** Places outside the spaces a pane can go ("a pane is a pane and can be
   *  transferred between them"): beside a page of a project of the class, say. Asked per pane; the
   *  menu then says "Move to…". */
  beside?(pane: Pane): { id: string; name: string }[];
  onBeside?(paneId: string, to: string): void;
  /** A page brought from outside, dropped on another space's chip or tile (`to` null: a new one). */
  onBring?(page: BringPage, to: string | null): void;
}

export type Bring = (page: BringPage, e: ReactPointerEvent<HTMLElement>) => void;

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const change = () => setMatch(list.matches);
    change();
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, [query]);
  return match;
}

const nodeName = (layout: Layout, node: StackNode): string => layout.panes[node.active]?.title ?? 'pane';
/** The groups on one side of a divider: one by its name, several by how many. */
const namesOf = (layout: Layout, groups: StackNode[]): string => (groups.length === 1 ? nodeName(layout, groups[0]) : `${groups.length} panes`);

export function Workspace({ layout, apply, history, render, detail, label, onSearch, layouts, icon, onCrash, empty, moveTo, bring, onBringStart, dormant = false, cover }: Props) {
  const phone = useMedia(PHONE_QUERY);
  // A phone on its side shows a pair side by side, not one over the other: the
  // layout keeps them upper and lower; turning the phone turns the split.
  const sideways = useMedia('(orientation: landscape)') && phone;
  const areaRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  // The smallest a group may be dragged to before it folds, from px (MIN_PANE), so a divider stops at a
  // pane that still has room for its tabs and some page, on any window (the model's own minimum is a
  // share of the window, too small on a large one and too short on a wide one).
  const limits = useRef<Limits>(DEFAULT_LIMITS);
  limits.current = area.w > 0 && area.h > 0
    ? { ...DEFAULT_LIMITS, minW: Math.min(MIN_PANE.most, Math.max(DEFAULT_LIMITS.minShare, MIN_PANE.w / area.w)), minH: Math.min(MIN_PANE.most, Math.max(DEFAULT_LIMITS.minShare, MIN_PANE.h / area.h)) }
    : DEFAULT_LIMITS;
  // `instant`: positions jump instead of sliding (the first frame, a window resize, a divider drag).
  const [instant, setInstant] = useState(true);
  const [resizing, setResizing] = useState(false);
  // A line being dragged, drawn outside React (one write per move), here so a render mid-drag draws the same.
  const live = useRef<LiveLine | null>(null);
  const [shares, setShares] = useState<{ gapKey: string; settled: boolean; text?: string } | null>(null);
  // One group filling the area, every other folded into its strip around it (model.ts foldedAround).
  // A view, not an arrangement: it is not in the layout or saved.
  const [zoomedPane, setZoomed] = useState<string | null>(null);
  const zoomedStack = zoomedPane && !phone ? findStackOf(layout.root, zoomedPane) : null;
  const zoomed = zoomedStack ? zoomedPane : null;
  const held = useDrag((s) => s.held);
  const dragPaneId = useDrag((s) => s.paneId);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const shownRoot = useMemo<GridNode | null>(() => {
    if (zoomedStack) return foldedAround(layout.root!, zoomedStack.id);
    const m = live.current;
    return m && layout.root ? withLine(layout.root, m.axis, m.line, m.pos, m.only) : layout.root;
  }, [layout.root, live.current, zoomedStack]); // eslint-disable-line react-hooks/exhaustive-deps
  // One geometry, held tab or not: the panes never move to make room for a drop.
  const geo = useMemo(() => computeGeometry(shownRoot, { x: 0, y: 0, w: area.w, h: area.h }, AT_REST), [shownRoot, area.w, area.h]);

  // ------------------------------------------------------------------ motion (motion.ts)
  // Every page lays out once, at its new size, when the layout changes; the cards, strips, dividers
  // and the frame go there from where they were drawn, and the pages ride by transform, on one
  // spring. Not while the window is resized or a divider dragged (they follow the pointer), and not
  // on the phone (its own view). The dropped pane is not animated: it is at its new place at once.
  const animate = !instant && !resizing && !held;
  const motion = useMemo(() => new PaneMotion((moving) => {
    // While things travel the area behind them is the page's colour: a gap opening between two
    // moving edges never shows as a grey block.
    if (areaRef.current) areaRef.current.toggleAttribute('data-moving', moving);
  }), []);
  const liveLabel = useMemo(() => labelStore(), []);
  useEffect(() => () => motion.stop(), [motion]);
  /** The pane just dropped: drawn at its place at once, then pulsed and focused. */
  const dropped = useRef<string | null>(null);
  /** What a gesture starts the next layout change with: held at this much of the way, or let go at
   *  this speed (motion.ts). */
  const starting = useRef<{ hold?: number; velocity?: number } | null>(null);
  /** A divider pulled past the smallest size draws the fold itself until it has arrived (the layout
   *  changes then): what React renders meanwhile is not drawn. */
  const owned = useRef(false);
  /** The layout as last drawn from a render: what a strip that came or went is told from. */
  const shown = useRef<{ root: GridNode | null; geo: Geometry; els: Map<string, HTMLElement> } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  /** What is on the page, by motion key. */
  const onScreenEls = () => {
    const els = new Map<string, HTMLElement>();
    for (const node of areaRef.current?.querySelectorAll<HTMLElement>('[data-motion]') ?? []) els.set(node.dataset.motion!, node);
    return els;
  };
  /** Where a layout puts everything that is on the page. */
  const targetsOf = (root: GridNode | null, g: Geometry, els: Map<string, HTMLElement>, activePane: string | null) => {
    const targets = new Map<string, MotionTarget>();
    const add = (key: string, kind: MotionKind, rect: Rect) => { const el = els.get(key); if (el) targets.set(key, { el, kind, rect }); };
    for (const box of g.stacks.values()) {
      add(motionKey('card', box.id), 'box', box.card);
      const stack = findNode(root, box.id);
      if (stack?.type !== 'stack') continue;
      add(motionKey('body', stack.active), 'page', box.body);
      if (activePane && stack.panes.includes(activePane)) add(motionKey('frame'), 'line', box.card);
    }
    for (const strip of g.strips.values()) add(motionKey('strip', strip.id), 'box', strip.rect);
    for (const gap of g.gaps) add(motionKey('gap', gap.key), 'line', gap.rect);
    return targets;
  };
  /** The groups of a node that folds or opens: each card and the page showing in it, as `g` has them. */
  const partsOf = (node: LayoutNode, g: Geometry, els: Map<string, HTMLElement>): FoldPart[] => (node.type === 'stack' ? [node] : node.groups).flatMap((s) => {
    const box = g.stacks.get(s.id);
    if (!box) return [];
    const key = motionKey('card', s.id), pageKey = motionKey('body', s.active);
    return [{ key, pageKey, card: els.get(key), page: els.get(pageKey), open: box.card, body: box.body }];
  });
  /** Groups `ids` going into `strip` (`to` 1, from where `open` has them) or coming out of it (`to` 0,
   *  to where `open` has them): one fold, whatever else the strip holds. */
  const foldInto = (strip: StripBox, ids: string[], to: 0 | 1, open: { root: GridNode | null; geo: Geometry; els: Map<string, HTMLElement> }, stripEl: HTMLElement | undefined): Fold | null => {
    const group = joinRects(ids.map((id) => open.geo.nodes.get(id)));
    if (!ids.length || !group) return null;
    const stripKey = motionKey('strip', strip.id);
    return { id: strip.id, to, group, strip: strip.rect, stripKey, stripEl, parts: ids.flatMap((id) => { const n = findNode(open.root, id); return n ? partsOf(n, open.geo, open.els) : []; }) };
  };

  // ------------------------------------------------------------------ folding
  // A group folds into its strip, and grows back out of it, on the panes' one spring (motion.ts):
  // the layout changes first, everything is laid out once as it will be, and the group's card and
  // page, kept as they were laid out, are cut to the shrinking box and fade over the strip's colour
  // while the strip's title fades in. The menu, the keys, a click on a strip, undo: any change that
  // folds or opens one plays it, told from the strips that came or went since the last render.
  // A divider pulled past the smallest size drives the same drawing with the pointer:
  // the strip it becomes is on the page from the start of the pull (`foldPreview`, one
  // render, not one a move) and the layout changes once it has arrived.
  const foldPreview = useMemo(() => valueStore<StripBox[]>([]), []);

  // ------------------------------------------------------------------ the area's size
  // The first size is not a change: nothing slides in from nowhere. A window resize after it: the
  // cards follow the window at once (no slide trailing it) and the pages lay out live; the slides
  // come back once it has been still for RESIZE_QUIET_MS. When it last changed is not state:
  // nothing is drawn differently when the quiet ends, and a render of the workspace then fell in
  // the middle of a sidebar's collapse (which is a resize of this area).
  const areaSize = useRef<{ w: number; h: number } | null>(null);
  const resizedAt = useRef(-Infinity);
  useLayoutEffect(() => {
    const el = areaRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const next = { w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) };
      const prev = areaSize.current;
      if (prev && prev.w === next.w && prev.h === next.h) return;
      areaSize.current = next;
      // The first real size is not a resize either: an area that measured nothing (hidden, say)
      // must not pin its pages at that nothing.
      if (!prev || !prev.w || !prev.h) { setInstant(true); setArea(next); requestAnimationFrame(() => setInstant(false)); return; }
      // Drawn before this frame paints, so the cards never lag the window by a frame (a grey sliver).
      // The pages follow the window live, unpinned, as they do a divider.
      resizedAt.current = performance.now();
      flushSync(() => setArea(next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bringing a pane forward is not worth an undo step.
  const activate = (id: string) => {
    if (layoutRef.current.activePane === id) return;
    fromInside.current = true;
    apply((l) => activatePane(l, id), { record: false });
  };
  const close = (id: string) => {
    const title = layoutRef.current.panes[id]?.title ?? 'pane';
    let closed: ReturnType<typeof closePane>['closed'] | null = null;
    const next = apply((l) => { const r = closePane(l, id); closed = r.closed; return r; });
    if (next && closed) {
      const keep = closed;
      closedRef.current = [...closedRef.current, keep].slice(-20);
      notify({ title: `Closed “${title}”`, action: { label: 'Undo', onClick: () => apply((l) => reopenPane(l, keep)) } });
    }
  };

  // A preview becomes an ordinary tab: double-clicked, typed in, or asked by its page.
  const keep = useCallback((id: string) => { if (layoutRef.current.panes[id]?.preview) apply((l) => keepPane(l, id), { record: false }); }, [apply]);

  // Pages with unsaved changes (a dot in place of their tab's ×), as they say.
  const [dirty, setDirtySet] = useState<ReadonlySet<string>>(() => new Set());
  const setDirty = useCallback((id: string, d: boolean) => setDirtySet((prev) => {
    if (prev.has(id) === d) return prev;
    const next = new Set(prev);
    if (d) next.add(id); else next.delete(id);
    return next;
  }), []);

  // Zoom: the pane's group fills the area; Escape (or the button again) puts the layout back.
  // Going to a pane outside the zoomed group puts it back too.
  const toggleZoom = (id: string) => {
    if (zoomed) { setZoomed(null); return; }
    if (Object.keys(layoutRef.current.panes).length < 2) return;
    activate(id);
    setZoomed(id);
  };
  const activeInZoom = !zoomedStack || !layout.activePane || zoomedStack.panes.includes(layout.activePane);
  useEffect(() => { if (zoomedPane && (!zoomedStack || !activeInZoom)) setZoomed(null); }, [zoomedPane, zoomedStack, activeInZoom]);
  useEffect(() => {
    if (!zoomed || dormant) return;
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      // Escape belongs to an open menu, dialog or field first.
      if ((ev.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], [role=dialog], [role=menu]')) return;
      setZoomed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed, dormant]);

  // The layout changes; the group shrinks into its strip, or grows out of it, from there (see folding).
  const fold = (nodeId: string, heir?: FoldSide) => apply((l) => collapseNode(l, nodeId, heir));
  const unfold = (nodeId: string, paneId?: string) => apply((l) => expandNode(l, nodeId, paneId));
  /** A strip or box pressed (a pane in it, when one was picked): zoomed, that pane is zoomed instead
   *; otherwise its strip opens. A pane of a box of several opens its own group. */
  const onStrip = (stripId: string, paneId?: string) => {
    const l = layoutRef.current;
    const group = paneId ? findStackOf(l.root, paneId) : findNode(l.root, stripId);
    if (!group || group.type !== 'stack') return;
    const pane = paneId ?? group.active;
    if (zoomed) { activate(pane); setZoomed(pane); return; }
    unfold(group.id, pane);
  };
  const split = (id: string, side: Side) => {
    if (zoomed) setZoomed(null);
    apply((l) => splitPane(l, id, side));
  };
  const closeOthers = (id: string) => {
    const stack = findStackOf(layoutRef.current.root, id);
    for (const other of stack?.panes ?? []) if (other !== id) apply((l) => closePane(l, other));
  };

  // What a card calls, the same functions for the life of the workspace (they call the latest of
  // the ones above): a card is drawn again when its group or the layout changes, not each time the
  // workspace renders for a reason of its own (a drag ending, the frame's glide, a divider's tip).
  // Such a render in the middle of a move, or as one arrives, was most of a frame.
  const latest = useRef({ activate, close, apply, split, toggleZoom, fold, closeOthers, keep });
  latest.current = { activate, close, apply, split, toggleZoom, fold, closeOthers, keep };
  const card = useMemo(() => ({
    activate: (id: string) => latest.current.activate(id),
    close: (id: string) => latest.current.close(id),
    cmd: {
      split: (id: string, side: Side) => latest.current.split(id, side),
      zoom: (id: string) => latest.current.toggleZoom(id),
      fold: (stackId: string) => { latest.current.fold(stackId); },
      closeOthers: (id: string) => latest.current.closeOthers(id),
      keep: (id: string) => latest.current.keep(id),
    },
  }), []);

  // ------------------------------------------------------------------ tab drag
  const startTabDrag = useTabDrag({
    area: () => areaRef.current,
    layout: () => layoutRef.current,
    geo: () => geo,
    metrics: AT_REST,
    ghost: () => ghostRef.current,
    activate,
    // The pages stay at full strength while a tab is held: only the drop preview is drawn over them.
    // A page dragged from the sidebar that was open already: the app shows the panes.
    onHold: () => { if (fromOutside.current) onBringStart?.(); },
    onRelease: () => { fromOutside.current = false; },
    // At its new place at once (the preview showed it there), then pulsed and focused; the rest of
    // the layout settles around it.
    onDrop: (id, plan) => { if (zoomed) setZoomed(null); dropped.current = id; apply((l) => movePane(l, id, plan.target)); },
    onRefused: (message) => notify({ tone: 'warning', title: 'It does not fit there', description: message }),
    // Onto the sidebar: closed. Onto a space's chip or tile: moved to that space
    // ('new': a new one).
    onMoveOut: (id, to) => {
      if (to === 'sidebar') { latest.current.close(id); return; }
      if (!moveTo || to === 'here') return;
      if (zoomed) setZoomed(null);
      moveTo.onMove(id, to === 'new' ? null : to);
    },
    // A lesson dragged out of the sidebar is not closed by being over the sidebar it came from.
    ignores: (place) => place === 'here' || (place === 'sidebar' && fromOutside.current),
  });

  // A page brought in from outside (the sidebar): dragged as a tab is, and opened where it drops.
  const fromOutside = useRef(false);
  const bringing = useRef<BringPage | null>(null);
  const openBrought = (target?: DockTarget) => {
    const page = bringing.current;
    if (!page) return;
    if (zoomed) setZoomed(null);
    setBlank(false);
    const open = Object.values(layoutRef.current.panes).find((p) => p.kind === page.kind);
    if (open && !target) { activate(open.id); return; }
    const next = apply((l) => openPane(l, page.kind, page.title, target, { color: page.color }));
    const id = next && Object.values(next.panes).find((p) => p.kind === page.kind)?.id;
    if (id) dropped.current = id;
  };
  // The page drawn over the panes, if any (`cover`), as a space of its own while a page is brought.
  const coverRef = useRef(cover);
  coverRef.current = cover;
  const covering = useRef<Covering | null>(null);
  /** Which half of the page the pointer is over, for a cover that splits by halves (null: it does not). */
  const halfOf = (g: Geometry, at: { x: number; y: number }): Side | null => {
    const c = coverRef.current;
    if (!c || !('page' in c) || !c.halves || phone) return null;
    return at.x < g.area.x + g.area.w / 2 ? 'left' : 'right';
  };
  /** A page brought onto the page drawn over the panes. */
  const planCover = (hit: Hit, g: Geometry, point: { x: number; y: number }): DropPlan => {
    const c = coverRef.current!;
    const page = bringing.current!;
    const whole = { key: 'cover', target: { kind: 'stack', stackId: covering.current?.stackId ?? '' } as DockTarget, zone: g.area };
    if ('refuse' in c) return { ...whole, label: c.refuse, refused: c.refuse, preview: g.area, noop: false };
    const cov = covering.current!;
    if (page.kind === cov.layout.panes[cov.paneId].kind) return { ...whole, label: 'Already here', preview: null, noop: true };
    // An edge of the page is a side of it; on a phone, where one page shows at a time, anywhere on it
    // puts the page brought in beside it.
    const half = halfOf(g, point);
    const at: Hit = phone ? whole
      : half ? { key: `half:${half}`, target: { kind: 'beside', nodeId: cov.stackId, side: half }, zone: half === 'left' ? { ...g.area, w: g.area.w / 2 } : { ...g.area, x: g.area.x + g.area.w / 2, w: g.area.w / 2 } }
      : hit.target.kind === 'edge' ? { ...hit, target: { kind: 'beside', nodeId: cov.stackId, side: hit.target.side } } : { ...hit, marker: undefined };
    const plan = planBring(cov.layout, page, at, g, AT_REST);
    if (plan.refused) return plan;
    const makes = c.makes ?? 'New space: ';
    return { ...plan, label: phone ? `${makes.replace(/:\s*$/, '')} with ${c.page.title}` : `${makes}${plan.label}` };
  };
  const startBring = useTabDrag({
    area: () => areaRef.current,
    layout: () => covering.current?.layout ?? layoutRef.current,
    geo: () => covering.current?.geo ?? geo,
    metrics: AT_REST,
    ghost: () => ghostRef.current,
    activate: () => undefined,
    onHold: () => onBringStart?.(),
    onRelease: (moved) => {
      const page = bringing.current;
      const c = coverRef.current;
      bringing.current = null;
      covering.current = null;
      if (!moved && page && c && 'refuse' in c) c.onRefuse(page);
    },
    plan: (hit, g, at) => (coverRef.current ? planCover(hit, g, at) : planBring(layoutRef.current, bringing.current!, hit, g, AT_REST)),
    keyOf: (hit, g, at) => { const half = halfOf(g, at); return half ? `half:${half}` : hit.key; },
    onDrop: (_id, plan) => {
      const c = coverRef.current;
      const cov = covering.current;
      const page = bringing.current;
      if (c && 'page' in c && cov && page) { c.onDrop(openPane(cov.layout, page.kind, page.title, plan.target, { color: page.color }).layout, page); return; }
      openBrought(plan.target);
    },
    // Refused by the page over the panes: that page says so (onRelease), not a warning.
    onRefused: (message) => { if (!coverRef.current) notify({ tone: 'warning', title: 'It does not fit there', description: message }); },
    // Onto an empty space: opened there. Onto a space's tile: opened in that space.
    onMoveOut: (_id, to) => {
      const page = bringing.current;
      if (!page) return;
      if (to === 'here') openBrought();
      else moveTo?.onBring?.(page, to === 'new' ? null : to);
    },
    ignores: (place) => place === 'sidebar' || (place === 'here' && !!coverRef.current),
  });
  const tabDown = useCallback((id: string, e: ReactPointerEvent<HTMLElement>) => { fromOutside.current = false; startTabDrag(id, e); }, [startTabDrag]);
  if (bring) {
    bring.current = (page, e) => {
      const c = coverRef.current;
      // A page that refuses is laid out as one too: all of it answers, even over an empty space.
      covering.current = c ? coverSpace('page' in c ? c.page : { kind: '\u0000cover', title: '' }, geo.area) : null;
      // On the phone a page is held (a long press) and dropped anywhere on the screen, where it
      // opens as the page showing; a page already open comes forward. On a desktop
      // one open already is dragged as its own tab, unless a page is drawn over the panes: it lands
      // on that page.
      const open = Object.values(layoutRef.current.panes).find((p) => p.kind === page.kind);
      if (!phone && !c && open) { fromOutside.current = true; startTabDrag(open.id, e, { soft: true }); return; }
      bringing.current = page;
      startBring(BRING_ID, e, phone ? { title: page.title } : { soft: true, title: page.title });
    };
  }

  // ------------------------------------------------------------------ dividers
  // A divider is a stretch of a grid line (model.ts): dragging any of it moves the whole line, every
  // stretch of it together (dividers that line up are one line). Held with Alt, only
  // the stretch under the pointer moves, pulled away from the rest. Let go within SNAP_PX of another
  // line, it lands on it, and the two are one line from then on.
  /** Pixels for the whole window's share along an axis: the area less the gaps between its tracks. */
  const freeAlong = (axis: Axis, l: Layout = layoutRef.current) => {
    const n = l.root ? tracksOf(l.root, axis).length : 1;
    return Math.max(1, (axis === 'row' ? area.w : area.h) - 2 * AT_REST.inset - AT_REST.gap * (n - 1));
  };
  /** The label on a divider while it is dragged. What it says renders when that changes; where it
   *  is is written straight to it, once per move. */
  const labelAt = (label: LiveLabel | null, gap?: Rect) => {
    liveLabel.set(label);
    if (gap) liveLabel.move(gap.x + gap.w / 2, gap.y + gap.h / 2, area);
  };
  /** A divider drag draws the layout itself, once per move, outside React: every card, page, strip,
   *  divider and the frame with the line where it has reached (motion.place). Its label is drawn by
   *  its own subscriber. React renders once, on release. */
  const drawLive = (move: LiveLine | null, held: GapBox, text?: string) => {
    live.current = move;
    if (!areaRef.current) return;
    const l = layoutRef.current;
    const root = move && l.root ? withLine(l.root, move.axis, move.line, move.pos, move.only) : l.root;
    const g = computeGeometry(root, { x: 0, y: 0, w: area.w, h: area.h }, AT_REST);
    const els = onScreenEls();
    for (const [key, t] of targetsOf(root, g, els, l.activePane)) motion.place(key, t.el, t.rect);
    // A page that leaves the layout from here (its group folds) stays laid out as it is now.
    for (const box of g.stacks.values()) { const stack = findNode(root, box.id); if (stack?.type === 'stack') lastRect.current.set(stack.active, box.body); }
    const at = sameDivider(g, held);
    // Landed on another line, the divider in hand is part of that one, named after it: drawn there
    // all the same, under the pointer (it stayed where it was, 9px short, and its
    // label went, so the lines looked as if they would not meet).
    const el = els.get(motionKey('gap', held.key));
    if (at && el && at.key !== held.key) motion.place(motionKey('gap', held.key), el, at.rect);
    labelAt(at && root ? { axis: at.axis, shares: lineShares(shownLine(root, at.axis, at.line)), text } : null, at && labelSpot(at.rect, held));
  };
  /** Puts the layout back as it was before a gesture changed it (a strip pulled open, then shut). */
  const revert = (before: Layout) => { if (!history?.undo()) apply(() => ({ layout: before, changed: true })); };
  const onDividerDown = (gap: GapBox, e: ReactPointerEvent<HTMLDivElement>) => {
    const grid = layout.root;
    if (e.button !== 0 || !grid) return;
    e.preventDefault();
    const { axis, line } = gap;
    const horizontal = axis === 'row';
    // A strip's divider: which side of it the strip is on (until the pull has opened it all the way).
    let stripSide: FoldSide | null = gap.before.every((s) => foldedAlong(grid, s, axis)) ? 'before' : gap.after.every((s) => foldedAlong(grid, s, axis)) ? 'after' : null;
    const free = freeAlong(axis, layout);
    // Alt: the stretch under the pointer alone, pulled away from the rest of its line (it never
    // folds anything): the groups either side of it there, and as far along as they reach.
    const only = e.altKey && !stripSide ? stretchAt(gap, e.clientX, e.clientY)?.ids : undefined;
    const base = edges(tracksOf(grid, axis))[line];
    let start = horizontal ? e.clientX : e.clientY;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    const box = { x: 0, y: 0, w: area.w, h: area.h };
    const before = layoutRef.current;
    // With reduced motion nothing follows the pointer past the smallest size, or out of a strip: it
    // folds, or opens, on letting go, and fades in where it is.
    const still = reducedMotion();
    let last = base;
    let started = false;
    // How fast the divider is going: let go mid-flick and it carries on, as far as that speed would
    // take it (a flick past the smallest size folds that side away).
    const speed = new VelocityTracker();
    let at = start;
    let collapse: FoldSide | null = null;
    let open: string | null = null;
    /** Pulled past the smallest size: the column (or row) on `side` of the line on its way into its
     *  strips with the pointer (`t`: how far, 0 to 1; `sign`: which way the pointer pulls it). */
    let folding: { side: FoldSide; name: string; folds: Fold[]; from: GridNode; g0: Geometry; g1: Geometry; span: number; sign: number; t: number } | null = null;
    /** A strip's divider pulled away from it: the strip, opening with the pointer. */
    let opening: { g1: Geometry; span: number; t: number } | null = null;
    // The cards follow the pointer exactly (no slide), and so do the pages: they lay out live at
    // every size, never pinned or dimmed while a divider moves ("don't freeze pane
    // when resizing"). It starts after 1px, so a bare click (or a double-click) changes nothing.
    let endGesture: (() => void) | undefined;
    const begin = () => {
      started = true;
      endGesture = history?.gesture();
      setInstant(true);
      setResizing(true);
    };
    /** The drag is over: React draws the layout it now has. */
    const settle = () => {
      endGesture?.();
      live.current = null;
      liveLabel.set(null);
      setResizing(false);
      setInstant(false);
    };
    const gapIn = (g: Geometry) => sameDivider(g, gap)?.rect;
    /** The label on the divider, where a fold held at `t` between two layouts draws it. */
    const labelOn = (text: string, g0: Geometry, g1: Geometry, t: number) => {
      const a = gapIn(g0), b = gapIn(g1);
      const r = a && b ? mix(a, b, t) : a ?? b;
      labelAt({ axis, shares: [0, 0], text }, r && labelSpot(r, gap));
    };
    /** A move let go at `v` (shares of the way a second) at `t` of the way, turned round: its speed
     *  towards the other end, as a share of what is left to go back over. */
    const backSpeed = (v: number, t: number) => Math.max(-20, Math.min(20, -v / Math.max(t, 0.05)));
    /** The layout with the line at `pos` (as the drag has it). */
    const movedTo = (l: Layout, pos: number): Layout => (l.root && Math.abs(pos - base) > 1e-12 ? { ...l, root: withLine(l.root, axis, line, pos, only) } : l);
    /** What folds when the line is pulled on past the smallest size towards `side`: the column (or
     *  row) on that side of it, as far as the groups in it reach (model.ts bandOf). Nothing when a
     *  group crosses the line there, or it is all that is open, or only a stretch is being pulled. */
    const bandBeside = (l: Layout, pos: number, side: FoldSide): [number, number] | null => {
      const g = l.root;
      if (!g || only) return null;
      const k = edges(tracksOf(g, axis)).findIndex((x) => Math.abs(x - pos) < 1e-9);
      if (k <= 0 || k >= tracksOf(g, axis).length) return null;
      const [a, b] = side === 'before' ? bandOf(g, axis, k - 1, k) : bandOf(g, axis, k, k + 1);
      if ((side === 'before' ? b : a) !== k || !canFoldBand(g, axis, a, b)) return null;
      return [a, b];
    };
    /** The layout with the line at `pos` and the column (row) on `side` of it folded into strips. */
    const foldedAt = (l: Layout, pos: number, side: FoldSide): OpResult => {
      const moved = Math.abs(pos - base) > 1e-12 ? moveLine(l, axis, line, pos, RELAXED, only).layout : l;
      const band = bandBeside(moved, pos, side);
      if (!band) throw new OpError('last-open', 'At least one pane stays open');
      return collapseTracks(moved, axis, band[0], band[1], side === 'before' ? 'after' : 'before');
    };
    const bandName = (l: Layout, side: FoldSide) => {
      const band = bandBeside(movedTo(l, last), last, side);
      const moved = movedTo(l, last).root;
      if (!band || !moved) return 'pane';
      const inBand = moved.groups.filter((s) => { const [p, q] = spanOf(s, axis); return p >= band[0] && q <= band[1]; });
      return inBand.length === 1 ? nodeName(l, inBand[0]) : `${inBand.length} panes`;
    };
    /** Past the smallest size, the column (row) on `side` starts into its strips. Everything is laid
     *  out once, as it will be folded, and drawn as it is: from here the pointer holds the fold. */
    const beginFold = (side: FoldSide, sign: number) => {
      const l = layoutRef.current;
      const from = movedTo(l, last);
      let after: Layout;
      try { after = foldedAt(l, last, side).layout; } catch { return; }
      if (!from.root || !after.root) return;
      const g0 = computeGeometry(from.root, box, AT_REST);
      const g1 = computeGeometry(after.root, box, AT_REST);
      const strips = [...g1.strips.values()].filter((s) => s.groups.some((id) => !g0.folded.has(id)));
      if (!strips.length) return;
      // The strips it becomes go on the page now: one render, not one a move.
      flushSync(() => foldPreview.set(strips));
      const els = onScreenEls();
      const folds = strips
        .map((strip) => foldInto(strip, strip.groups.filter((id) => !g0.folded.has(id)), 1, { root: from.root, geo: g0, els }, els.get(motionKey('strip', strip.id))))
        .filter((f): f is Fold => !!f);
      if (!folds.length) { foldPreview.set([]); return; }
      owned.current = true;
      motion.update(targetsOf(after.root, g1, els, after.activePane), { animate: true, folds, hold: 0 });
      // How far the pull goes: from the band's width open to its strips'.
      const extent = (g: Geometry) => Math.max(...folds.map((f) => { const r = g.nodes.get(f.id); return r ? (horizontal ? r.x + r.w : r.y + r.h) : 0; }))
        - Math.min(...folds.map((f) => { const r = g.nodes.get(f.id); return r ? (horizontal ? r.x : r.y) : 0; }));
      folding = { side, name: bandName(l, side), folds, from: from.root, g0, g1, span: Math.max(1, extent(g0) - extent(g1)), sign, t: 0 };
    };
    /** Back inside the smallest size, still held: the layout as the divider has it, live again. */
    const backInside = () => {
      const f = folding!;
      folding = null;
      owned.current = false;
      motion.update(targetsOf(f.from, f.g0, onScreenEls(), layoutRef.current.activePane), { animate: false, folds: f.folds.map((x) => ({ ...x, to: 0 as const })) });
      foldPreview.set([]);
    };
    /** A strip's divider: pulled away from the strip, the strip opens with the pointer. The layout
     *  it opens to is laid out once, as the pull starts, and held where the pointer is. */
    const pull = (pos: number) => {
      const l = layoutRef.current;
      const away = stripSide === 'before' ? pos - start : start - pos;
      const node = (stripSide === 'before' ? gap.before : gap.after)[0];
      if (still) {
        open = away > STRIP_PULL ? node.id : null;
        drawLive(null, gap, open ? `Expand ${nodeName(l, node)}` : 'Pull away to expand');
        return;
      }
      if (!opening && away > 1) {
        let result: ReturnType<typeof expandNode> | null = null;
        try { result = expandNode(l, node.id, undefined, undefined, axis); } catch { /* no room to open: the pull does nothing */ }
        const g1 = result?.changed ? computeGeometry(result.layout.root, box, AT_REST) : null;
        const group = g1?.nodes.get(node.id), strip = geo.strips.get(geo.folded.get(node.id) ?? '')?.rect;
        if (result && g1 && group && strip) {
          const span = Math.max(1, horizontal ? group.w - strip.w : group.h - strip.h);
          const opened = result;
          starting.current = { hold: Math.min(1, away / span) };
          let next: Layout | null = null;
          flushSync(() => { next = apply(() => opened); });
          if (next && next !== l) opening = { g1, span, t: 0 };
          else starting.current = null;
        }
      }
      if (opening && away <= 0) {
        // Pushed back onto the strip: folded as it was.
        opening = null;
        flushSync(() => revert(before));
      }
      if (!opening) { labelAt({ axis, shares: [0, 0], text: 'Pull away to expand' }, gap.rect); return; }
      if (away >= opening.span) {
        // Pulled all the way open: it is open, at the size it had, and from here the divider
        // resizes it like any other (and, pushed back past its smallest size, folds it again).
        start += stripSide === 'before' ? opening.span : -opening.span;
        opening = null;
        stripSide = null;
        motion.finish();
        return false;
      }
      opening.t = Math.min(1, away / opening.span);
      motion.hold(opening.t);
      labelOn(away > STRIP_PULL ? `Expand ${nodeName(l, node)}` : 'Pull away to expand', geo, opening.g1, opening.t);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (ev.buttons === 0) { end(true); return; } // a release we never heard
      const pos = horizontal ? ev.clientX : ev.clientY;
      if (!started && Math.abs(pos - start) < 1) return;
      if (!started) begin();
      at = pos;
      speed.add(pos, ev.timeStamp || performance.now());
      const l = layoutRef.current;
      if (stripSide && pull(pos) !== false) return;
      const want = base + (pos - start) / free;
      // Near another line it lands on it: the two are one line from then on.
      const to = only ? want : snapLine(l, axis, line, want, SNAP_PX / free);
      last = clampLine(l, axis, line, to, limits.current, only);
      const past = Math.abs(last - to) > 1e-9 ? (want - last) * free : 0;
      const side: FoldSide = past < 0 ? 'before' : 'after';
      const can = Math.abs(past) > 1 && !!bandBeside(movedTo(l, last), last, side);
      if (still) {
        collapse = can && Math.abs(past) > COLLAPSE_PAST ? side : null;
        drawLive({ axis, line, pos: last, only }, gap, collapse ? `Let go to collapse ${bandName(l, side)}` : undefined);
        return;
      }
      // Pulled on past the smallest size, the side it runs into goes on with the pointer: it shrinks
      // into its strips, kept as it is laid out and fading by how far it has gone (motion.ts), and
      // nothing lays out on the way. Let go past half way (or flicked there) and it folds; short of
      // it, it springs back.
      if (folding && (!can || folding.side !== side)) backInside();
      if (!folding) {
        drawLive({ axis, line, pos: last, only }, gap);
        if (can) beginFold(side, Math.sign(past));
      }
      if (!folding) return;
      folding.t = Math.min(1, Math.abs(past) / folding.span);
      motion.hold(folding.t);
      labelOn(`${folding.t >= 0.5 ? 'Let go to collapse' : 'Collapse'} ${folding.name}`, folding.g0, folding.g1, folding.t);
    };
    function end(commit: boolean) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', onEscape, true);
      try { el.releasePointerCapture(pointerId); } catch { /* gone */ }
      if (!started) return;
      if (folding) {
        // On from where the pointer left it, at its speed: into the strips, or back to the line
        // (laid out as it was before the pull, once). The layout changes when it has arrived, so
        // nothing renders on the way.
        const f = folding;
        folding = null;
        const v = commit ? (speed.velocity() * f.sign) / f.span : 0;
        const shut = commit && f.t + Math.max(-0.5, Math.min(0.5, v * 0.15)) >= 0.5;
        if (shut) motion.release(v);
        else motion.update(targetsOf(f.from, f.g0, onScreenEls(), layoutRef.current.activePane), { animate: true, folds: f.folds.map((x) => ({ ...x, to: 0 as const })), velocity: backSpeed(v, f.t) });
        motion.onRest(() => {
          owned.current = false;
          flushSync(() => {
            if (shut) apply((l) => foldedAt(l, last, f.side));
            else if (commit && last !== base) apply((l) => moveLine(l, axis, line, last, RELAXED, only));
            foldPreview.set([]);
            settle();
          });
        });
        return;
      }
      if (opening) {
        // On from where the pointer left it: open, at the size it had; or shut again (the layout
        // as it was, laid out once), when it was let go close to the strip or flicked back at it.
        const o = opening;
        opening = null;
        const out = commit ? speed.velocity() * (stripSide === 'before' ? 1 : -1) : 0;
        if (commit && (out > FLICK || (out > -FLICK && o.t * o.span > STRIP_PULL))) {
          motion.release(out / o.span);
          motion.onRest(() => flushSync(settle));
        } else {
          starting.current = { velocity: backSpeed(out / o.span, o.t) };
          flushSync(() => { revert(before); settle(); });
        }
        return;
      }
      if (commit && !stripSide) carry();
      if (commit && open) apply((l) => expandNode(l, open!, undefined, undefined, axis));
      else if (commit && collapse) apply((l) => foldedAt(l, last, collapse!));
      else if (commit && last !== base) apply((l) => moveLine(l, axis, line, last, RELAXED, only));
      // React draws the layout it now has; whatever the drag drew elsewhere (a flick carried on, a
      // fold, a cancel) goes there from where it is (motion.ts).
      settle();
    }
    /** Let go while moving: the line goes on to where the flick would carry it (at most a few
     *  hundred pixels), and the panes spring there. Whether it did. */
    function carry() {
      const v = speed.velocity();
      if (Math.abs(v) < FLICK) return false;
      const endAt = start + Math.max(-320, Math.min(320, project(at, v) - start));
      const l = layoutRef.current;
      const want = base + (endAt - start) / free;
      const allowed = clampLine(l, axis, line, want, limits.current, only);
      const past = Math.abs(allowed - want) > 1e-9 ? (want - allowed) * free : 0;
      if (Math.abs(past) > COLLAPSE_PAST) {
        const side: FoldSide = past < 0 ? 'before' : 'after';
        if (bandBeside(movedTo(l, allowed), allowed, side)) { last = allowed; collapse = side; return true; }
      }
      if (Math.abs(allowed - last) * free < 0.5) return false;
      last = allowed;
      return true;
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      // Its speed as it lets go: held still since its last move, it is not a flick.
      if (started) speed.add(at, ev.timeStamp || performance.now());
      end(true);
    };
    const cancel = () => end(false);
    const onEscape = (ev: globalThis.KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    // Losing the window, or Escape, puts the divider back where it was.
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onEscape, true);
  };
  /** The stretch of `gap`'s line an Alt-drag from this point moves on its own (model.ts stretchOf):
   *  its groups, and where it is drawn. */
  const stretchAt = (gap: GapBox, clientX: number, clientY: number): { ids: Set<string>; rect: Rect } | null => {
    const grid = layoutRef.current.root;
    if (!grid || !areaRef.current) return null;
    const r = areaRef.current.getBoundingClientRect();
    const at = gap.axis === 'row' ? clientY - r.top : clientX - r.left;
    const cross = geo.tracks[across(gap.axis)];
    const track = Math.max(0, cross.findIndex((t) => at < t.to + AT_REST.gap));
    const ids = stretchOf(grid, gap.axis, gap.line, track);
    const spans = grid.groups.filter((g) => ids.has(g.id)).map((g) => spanOf(g, across(gap.axis)));
    if (!spans.length) return null;
    const from = cross[Math.min(...spans.map((x) => x[0]))].from, to = cross[Math.max(...spans.map((x) => x[1])) - 1].to;
    const rect = gap.axis === 'row' ? { x: gap.rect.x, y: from, w: gap.rect.w, h: to - from } : { x: from, y: gap.rect.y, w: to - from, h: gap.rect.h };
    return { ids, rect };
  };
  // Alt (Option) held over a divider: only the stretch an Alt-drag would move is lit, not its whole
  // line. Alt pressed or let go while the pointer is there switches it at once.
  const [altPart, setAltPart] = useState<Rect | null>(null);
  const hovered = useRef<{ gap: GapBox; x: number; y: number } | null>(null);
  const hoverDivider = (gap: GapBox | null, e?: { clientX: number; clientY: number; altKey: boolean }) => {
    hovered.current = gap && e ? { gap, x: e.clientX, y: e.clientY } : null;
    const part = gap && e?.altKey ? stretchAt(gap, e.clientX, e.clientY)?.rect ?? null : null;
    setAltPart((was) => (was && part && was.x === part.x && was.y === part.y && was.w === part.w && was.h === part.h ? was : part));
  };
  useEffect(() => {
    const onKey = (ev: globalThis.KeyboardEvent) => {
      const h = hovered.current;
      if (ev.key === 'Alt' && h) hoverDivider(h.gap, { clientX: h.x, clientY: h.y, altKey: ev.type === 'keydown' });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  });
  // The divider's tooltip, where the pointer came in (a divider can be as tall as the window).
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const showTip = (clientX: number, clientY: number) => {
    const r = areaRef.current!.getBoundingClientRect();
    setTip({ x: clientX - r.left, y: clientY - r.top });
  };
  // The line under the pointer: every stretch of it lights up, so it reads as the one line it is.
  const [hotLine, setHotLine] = useState<string | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The shares, shown for a moment after an even share or an arrow key. */
  const flashLabel = (g: GapBox) => {
    const k = g.key;
    setShares({ gapKey: k, settled: true });
    clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setShares((l) => (l?.settled && l.gapKey === k ? null : l)), EVEN_LABEL_MS);
  };
  const onEqualize = (g: GapBox) => { if (apply((l) => equalize(l, g.axis))) flashLabel(g); };
  const onDividerKey = (gap: GapBox, e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const l = layout;
    if (!l.root) return;
    const { axis, line } = gap;
    const horizontal = axis === 'row';
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
    const free = freeAlong(axis, l);
    const pos = edges(tracksOf(l.root, axis))[line];
    let to: number;
    if (e.key === dec || e.key === inc) to = pos + ((e.shiftKey ? KEY_STEP_BIG : KEY_STEP) * (e.key === dec ? -1 : 1)) / free;
    else if (e.key === 'Home') to = 1e-6;
    else if (e.key === 'End') to = 1 - 1e-6;
    else if (e.key === 'Enter') { e.preventDefault(); onEqualize(gap); return; }
    else return;
    e.preventDefault();
    const allowed = clampLine(l, axis, line, to, limits.current);
    if (Math.abs(allowed - pos) * free < 0.5) return;
    // A burst of presses (a held arrow) is one undo step: it ends KEY_BURST_MS after the last.
    if (!burst.current.end) burst.current.end = history?.gesture();
    clearTimeout(burst.current.timer);
    burst.current.timer = setTimeout(endBurst, KEY_BURST_MS);
    if (apply((x) => moveLine(x, axis, line, allowed, RELAXED))) flashLabel(gap);
  };
  const burst = useRef<{ end?: () => void; timer?: ReturnType<typeof setTimeout> }>({});
  const endBurst = () => { clearTimeout(burst.current.timer); burst.current.end?.(); burst.current = {}; };
  useEffect(() => () => clearTimeout(burst.current.timer), []);

  // ------------------------------------------------------------------ the keymap (keymap.ts)
  // Alt keys for the panes, Mod+Z / Mod+Shift+Z for the layout's history. They stand aside where
  // the keyboard types, under a dialog, while an input method composes, for a key the page already
  // handled, and while a tab is held; layout changes act once per press, moves repeat.
  const closedRef = useRef<ClosedPane[]>([]);
  const commands: PaneKeyCommands = {
    splitActive: (side) => { const id = layoutRef.current.activePane; if (id) split(id, side); },
    closeActive: () => { const id = layoutRef.current.activePane; if (id) close(id); },
    reopen: () => {
      const last = closedRef.current.pop();
      if (!last) { notify({ title: 'Nothing to reopen' }); return; }
      if (apply((l) => reopenPane(l, last))) notify({ title: `Reopened “${last.pane.title}”` });
    },
    focusCycle: (step) => {
      const l = layoutRef.current;
      const order = zoomed ? readingOrder(l.root) : shownOrder(l.root);
      const next = l.activePane ? order[order.indexOf(l.activePane) + step] : undefined;
      if (!next) return;
      if (zoomed) setZoomed(next);
      activate(next);
    },
    focusDirection: (dir) => {
      const l = layoutRef.current;
      const stack = !zoomed && l.activePane ? findStackOf(l.root, l.activePane) : null;
      const n = stack && neighbourStack(l.root, stack.id, dir);
      if (n) activate(n.active);
    },
    zoomActive: () => { const id = layoutRef.current.activePane; if (id) toggleZoom(id); },
    collapseActive: () => {
      const l = layoutRef.current;
      const stack = l.activePane ? findStackOf(l.root, l.activePane) : null;
      if (!stack) return;
      if (!canCollapse(l, stack.id)) { notify({ tone: 'warning', title: 'At least one pane stays open' }); return; }
      fold(stack.id);
    },
    expandAll: () => {
      if (!foldedNodes(layoutRef.current.root).size) { notify({ title: 'No pane is collapsed here' }); return; }
      apply((l) => expandAll(l));
    },
    undo: () => historyStep(false),
    redo: () => historyStep(true),
  };
  const historyStep = (redo: boolean) => {
    const h = history;
    if (!h) return;
    endBurst();
    setZoomed(null);
    const done = redo ? h.redo() : h.undo();
    notify({ title: done ? (redo ? 'Redid the layout change' : 'Undid the last layout change') : redo ? 'Nothing to redo' : 'Nothing to undo' });
  };
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  useEffect(() => {
    if (phone || dormant) return;
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (dragStore.get().held) return; // a drag owns the keyboard
      const typing = isTypingTarget(ev.target);
      const underDialog = !!document.querySelector('[aria-modal="true"], [role="dialog"][data-state="open"]');
      // Escape in a text field inside a pane leaves the field: the keyboard goes to the pane, and
      // the workspace's keys work again.
      if (ev.key === 'Escape' && typing && !ev.defaultPrevented && !underDialog) {
        const body = (ev.target as Element).closest<HTMLElement>('[data-pane-body]');
        if (body && areaRef.current?.contains(body)) { ev.preventDefault(); body.focus({ preventScroll: true }); return; }
      }
      const b = bindingFor(ev, { typing, composing: ev.isComposing, handled: ev.defaultPrevented, underDialog, repeat: ev.repeat });
      if (!b) return;
      if (b.group === 'History' && !history) return;
      ev.preventDefault();
      b.run(commandsRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone, !!history, dormant]);

  // ------------------------------------------------------------------ focus and announcements
  // Only a deliberate focus (a press, or Tab) makes a pane active; when the active pane changes
  // without focus moving (a key, a close, a move), focus follows it in (usePaneFocus).
  const focus = usePaneFocus({ area: () => areaRef.current, activePane: phone ? null : layout.activePane, inactive: phone, activate });
  // A polite line for a screen reader: which pane is active now, and zoom going on and off.
  const [announce, setAnnounce] = useState('');
  const spoken = useRef<{ pane: string | null; zoomed: string | null }>({ pane: layout.activePane, zoomed });
  useEffect(() => {
    const was = spoken.current;
    spoken.current = { pane: layout.activePane, zoomed };
    const pane = layout.activePane ? layout.panes[layout.activePane] : null;
    if (zoomed && !was.zoomed && pane) setAnnounce(`Zoomed “${pane.title}”. Escape restores the layout.`);
    else if (!zoomed && was.zoomed) setAnnounce('Restored the layout');
    else if (pane && was.pane !== pane.id) {
      const order = shownOrder(layout.root);
      const i = order.indexOf(pane.id);
      setAnnounce(i >= 0 ? `${pane.title}, pane ${i + 1} of ${order.length}` : pane.title);
    }
  }, [layout.activePane, zoomed]);
  // Each divider's line, where it is as shown and the nearest and furthest it may go (a percentage
  // of the window from its left or top), once a line.
  const dividerValues = useMemo(() => {
    const out = new Map<string, { value: number; min: number; max: number }>();
    const grid = layout.root;
    if (!grid) return out;
    const lines = new Map<string, { value: number; min: number; max: number }>();
    for (const run of runs(grid)) {
      const id = `${run.axis}:${run.line}`;
      if (!lines.has(id)) {
        const b = bounds(layout, run.axis, run.line, limits.current);
        const off = shownLine(grid, run.axis, run.line) - b.value;
        lines.set(id, { value: Math.round((b.value + off) * 100), min: Math.round((b.min + off) * 100), max: Math.round((b.max + off) * 100) });
      }
      out.set(gapKey(run), lines.get(id)!);
    }
    return out;
  }, [layout]);

  // ------------------------------------------------------------------ the phone's own view
  const order = readingOrder(layout.root);
  // Two groups one over the other show together on the phone, as they do on a desktop:
  // one stop on the bar, which names both, and a swipe moves them together. "Below" in the
  // sheet makes that split in the layout itself, so the maps, the desktop and the other devices have
  // it too. The divider's place here is the phone's own, starting from the layout's.
  const pairs = useMemo(() => (phone ? phonePairs(layout) : []), [phone, layout]);
  const [ratio, setRatio] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  // While a swipe on the bar is in play (the finger is down, or the page is still settling), the
  // pages either side are drawn beside the one showing, so the next comes in with the finger instead
  // of a gap that the page then jumps into.
  const [swiping, setSwiping] = useState(false);
  // Past the last page: the empty view (`empty`), to open something new from. Anything opened (or a
  // page brought forward) leaves it.
  const [blank, setBlank] = useState(false);
  useEffect(() => { setBlank(false); }, [layout.activePane, phone]);
  const pairOf = (top: string) => pairs.find((p) => p.top === top);
  /** The stop a page is at: a pair's lower page is at its upper one's. */
  const stopOf = (id: string) => pairs.find((p) => p.bottom === id)?.top ?? id;
  const slots = phone && layout.activePane ? [...order.filter((id) => !pairs.some((p) => p.bottom === id)), BLANK] : order;
  const blankShown = phone && blank && !!layout.activePane;
  const shownPair = !blankShown && layout.activePane ? pairOf(stopOf(layout.activePane)) ?? null : null;
  const below = shownPair?.bottom ?? null;
  useEffect(() => { setRatio(null); }, [shownPair?.top, shownPair?.bottom]);
  const shownRatio = ratio ?? shownPair?.share ?? 0.5;
  const extent = sideways ? area.w : area.h;
  const splitAt = Math.round(extent * shownRatio - PHONE_HANDLE / 2);
  const phoneRects = useMemo(() => {
    const out = new Map<string, Rect>();
    if (!layout.activePane) return out;
    // A stop drawn whole: its page, or the pair, one above the other.
    const draw = (id: string) => {
      const pair = pairs.find((p) => p.top === id);
      if (!pair) { out.set(id, { x: 0, y: 0, w: area.w, h: area.h }); return; }
      const at = pair.top === shownPair?.top ? splitAt : Math.round(extent * pair.share - PHONE_HANDLE / 2);
      if (sideways) {
        out.set(id, { x: 0, y: 0, w: at, h: area.h });
        out.set(pair.bottom, { x: at + PHONE_HANDLE, y: 0, w: Math.max(0, area.w - at - PHONE_HANDLE), h: area.h });
        return;
      }
      out.set(id, { x: 0, y: 0, w: area.w, h: at });
      out.set(pair.bottom, { x: 0, y: at + PHONE_HANDLE, w: area.w, h: Math.max(0, area.h - at - PHONE_HANDLE) });
    };
    const here = stopOf(layout.activePane);
    // On the empty view, the last stop is only drawn beside it while the bar is swiped.
    if (blankShown) { if (swiping) draw(here); return out; }
    draw(here);
    if (swiping) {
      const at = slots.indexOf(here);
      for (const id of [slots[at - 1], slots[at + 1]]) if (id && id !== BLANK && !out.has(id)) draw(id);
    }
    return out;
  }, [layout.activePane, pairs, shownPair?.top, area.w, area.h, splitAt, sideways, swiping, blankShown, slots.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const peekOf = (id: string): 'prev' | 'next' | undefined => {
    if (!phone || !swiping || !layout.activePane) return undefined;
    const at = blankShown ? slots.length - 1 : slots.indexOf(stopOf(layout.activePane));
    const stop = stopOf(id);
    return stop === slots[at - 1] ? 'prev' : stop === slots[at + 1] ? 'next' : undefined;
  };
  /** The sheet's Below: `id` into a group of its own under the group showing, in the layout; `null`
   *  (Stop showing below): the lower page back into the upper group, as a tab. */
  const showBelow = (id: string | null) => {
    const top = shownPair?.top ?? layout.activePane;
    if (!top) return;
    const upper = findStackOf(layout.root, top);
    if (!upper) return;
    const target: DockTarget | null = id === null ? (shownPair ? { kind: 'stack', stackId: upper.id } : null)
      : id !== top ? { kind: 'beside', nodeId: upper.id, side: 'bottom', share: 0.5 } : null;
    const moving = id ?? shownPair?.bottom;
    if (!target || !moving) return;
    // One step: moved, and the page that was showing still the one in use.
    apply((l) => {
      const moved = movePane(l, moving, target);
      const front = activatePane(moved.layout, top);
      return { ...front, changed: moved.changed || front.changed };
    });
  };
  /** The divider pulled to an end: that page closes, the other has the screen. */
  const closeHalf = (half: 'top' | 'bottom') => {
    if (!shownPair) return;
    const gone = shownPair[half];
    const stays = half === 'top' ? shownPair.bottom : shownPair.top;
    const title = layout.panes[gone]?.title ?? 'The page';
    setRatio(null);
    activate(stays);
    close(gone);
    notify({ tone: 'neutral', title: `Closed ${title}`, action: { label: 'Reopen', onClick: () => commands.reopen() } });
  };

  // ------------------------------------------------------------------ bodies
  // A page that is not showing keeps the size and place it would show at (its group's body; on the
  // phone, the screen), hidden. It used to collapse to 0×0 at the corner, so showing it (a tab
  // brought forward, a pane moved into a split, a swipe) grew it from that corner with its page laid
  // out squeezed on the way (16 Nov). Its last real place is kept for a page in no group (a strip).
  const seen = useRef(new Set<string>());
  const lastRect = useRef(new Map<string, Rect>());
  const bodyRect = (id: string): Rect | null => {
    if (phone) return phoneRects.get(id) ?? null;
    const stack = findStackOf(shownRoot, id);
    return stack && stack.active === id ? (geo.stacks.get(stack.id)?.body ?? null) : null;
  };
  const restRect = (id: string): Rect => {
    if (phone) return phoneRects.get(layout.activePane ?? '') ?? { x: 0, y: 0, w: area.w, h: area.h };
    const stack = findStackOf(shownRoot, id);
    return (stack && geo.stacks.get(stack.id)?.body) ?? lastRect.current.get(id) ?? { x: 0, y: 0, w: area.w, h: area.h };
  };
  // On the phone the pages either side of the one showing are loaded ahead, so a swipe brings in a
  // page that is ready, not one that starts loading as it arrives.
  const near = new Set<string>();
  if (phone && layout.activePane) {
    const at = order.indexOf(layout.activePane);
    for (const id of [order[at - 1], order[at + 1]]) if (id) near.add(id);
  }
  const bodies = Object.keys(layout.panes).sort().map((id) => {
    const rect = area.w > 0 ? bodyRect(id) : null;
    if (rect) { seen.current.add(id); lastRect.current.set(id, rect); }
    if (area.w > 0 && near.has(id)) seen.current.add(id);
    if (!seen.current.has(id)) return null;
    const pane = layout.panes[id];
    return (
      <PaneBody key={id} pane={pane} rect={rect ?? restRect(id)} visible={!!rect} active={id === layout.activePane && !blankShown}
        render={render} onCrash={onCrash} labelled={!phone} setDirty={setDirty} keep={keep}
        peek={peekOf(id)} paired={!!shownPair && (id === shownPair.top || id === shownPair.bottom)} />
    );
  });

  const activeStack = layout.activePane ? findStackOf(shownRoot, layout.activePane)?.id : undefined;
  const emptyView = empty ?? (
    <EmptyPanes layouts={layouts} onLayout={(make) => apply(() => ({ layout: make(), changed: true }))}
      onSearch={onSearch}
      lastClosed={closedRef.current[closedRef.current.length - 1]?.pane.title} onReopen={() => commands.reopen()} />
  );
  const activeBox = activeStack && !phone ? geo.stacks.get(activeStack) : undefined;

  // The frame round the active pane: for FRAME_GLIDE_MS after the active group changes, so the eye
  // follows it. A pane brought forward from outside the workspace (a link, the sidebar, a preview
  // replaced) glows once instead.
  const [gliding, setGliding] = useState(false);
  // The group the frame was last drawn round (the motion effect below snaps it to a new one).
  const framedStack = useRef(activeStack);
  const lastActiveStack = useRef(activeStack);
  useEffect(() => {
    const was = lastActiveStack.current;
    lastActiveStack.current = activeStack;
    if (!activeStack || was === activeStack) return;
    setGliding(true);
    const t = setTimeout(() => setGliding(false), FRAME_GLIDE_MS);
    return () => clearTimeout(t);
  }, [activeStack]);
  const [glow, setGlow] = useState<{ id: string; n: number } | null>(null);
  const shownPage = layout.activePane ? `${layout.activePane}:${layout.panes[layout.activePane]?.kind}` : '';
  const lastShown = useRef(shownPage);
  const fromInside = useRef(false);
  useEffect(() => {
    const was = lastShown.current;
    lastShown.current = shownPage;
    const inside = fromInside.current;
    fromInside.current = false;
    if (!was || !shownPage || was === shownPage || inside || !layout.activePane) return;
    const id = layout.activePane;
    setGlow((g) => ({ id, n: (g?.n ?? 0) + 1 }));
  }, [shownPage]);
  useEffect(() => {
    if (!glow) return;
    const t = setTimeout(() => setGlow((g) => (g === glow ? null : g)), GLOW_MS);
    return () => clearTimeout(t);
  }, [glow]);
  const glowStack = glow ? findStackOf(shownRoot, glow.id)?.id : undefined;
  const glowBox = glowStack && !phone ? geo.stacks.get(glowStack) : undefined;

  // Two open pages with the same title say where each one is (`detail`).
  const where = useMemo(() => {
    const byTitle = new Map<string, Pane[]>();
    for (const p of Object.values(layout.panes)) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p]);
    const out = new Map<string, string>();
    for (const same of byTitle.values()) if (same.length > 1) for (const p of same) { const d = detail?.(p); if (d) out.set(p.id, d); }
    return out;
  }, [layout.panes, detail]);
  // After every render, what React moved goes there from where it was drawn (motion.ts). A pane
  // just dropped is at its place at once: it pulses, and focus goes into it. A strip that came or
  // went since the last render: its group folds into it, or grows out of it.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || phone) { motion.stop(); shown.current = null; return; }
    // A fold the pointer holds draws everything itself until it has arrived; the layout it leaves
    // is drawn then.
    if (owned.current) return;
    motion.layer = layerRef.current;
    const els = onScreenEls();
    const targets = targetsOf(shownRoot, geo, els, layout.activePane);
    const id = dropped.current;
    dropped.current = null;
    const home = id ? findStackOf(shownRoot, id) : null;
    const snap = new Set(id ? [motionKey('body', id), ...(home ? [motionKey('card', home.id), motionKey('frame')] : [])] : []);
    // The frame does not travel from the pane that was active to the new one: it is drawn on the new
    // one at once, a highlight, not a move. It follows its card only while the
    // layout itself moves.
    if (framedStack.current !== activeStack) snap.add(motionKey('frame'));
    framedStack.current = activeStack;
    const prev = shown.current;
    shown.current = { root: shownRoot, geo, els };
    const folds: Fold[] = [];
    // Each strip, the groups that went into it since (or came out of it), as one fold.
    for (const strip of prev ? geo.strips.values() : []) {
      const fold = foldInto(strip, strip.groups.filter((id) => !prev!.geo.folded.has(id) && prev!.geo.nodes.has(id)), 1, prev!, els.get(motionKey('strip', strip.id)));
      if (fold) folds.push(fold);
    }
    for (const strip of prev ? prev.geo.strips.values() : []) {
      const fold = foldInto(strip, strip.groups.filter((id) => !geo.folded.has(id) && geo.nodes.has(id)), 0, { root: shownRoot, geo, els }, prev!.els.get(motionKey('strip', strip.id)));
      if (fold) folds.push(fold);
    }
    // The pane that is active after a fold is so because of it: it does not glow as one brought
    // forward from outside does.
    if (folds.length) fromInside.current = true;
    const start = starting.current;
    starting.current = null;
    // Not while the window is being resized, nor just after: the cards follow it at once.
    const still = performance.now() - resizedAt.current >= RESIZE_QUIET_MS;
    motion.update(targets, { animate: (animate && still) || !!start, snap, folds, hold: start?.hold, velocity: start?.velocity });
    if (id && layout.panes[id]) {
      setGlow((g) => ({ id, n: (g?.n ?? 0) + 1 }));
      // A frame later: focusing now would force the new layout inside this one.
      requestAnimationFrame(() => document.getElementById(`panel-${id}`)?.focus({ preventScroll: true }));
    }
  });

  const labelGap = shares && !held ? geo.gaps.find((g) => g.key === shares.gapKey) : undefined;
  const labelShares = labelGap && shownRoot ? lineShares(shownLine(shownRoot, labelGap.axis, labelGap.line)) : null;
  
  return (
    <div
      ref={areaRef}
      className="pane-area"
      // An empty space takes a page brought in from outside anywhere on it.
      data-pane-drop={layout.root && !phone ? undefined : 'here'} data-pane-drop-label={layout.root && !phone ? undefined : 'Open it here'}
      data-empty={layout.root ? undefined : ''}
      role="region"
      aria-label={label}
      data-phone={phone || undefined}
      data-held={held || undefined}
      data-animate={animate || undefined}
      data-resizing={resizing || undefined}
      onPointerDownCapture={focus.onPointerDownCapture}
      onInputCapture={(e) => {
        // Typing in a preview keeps it.
        const id = (e.target as Element).closest<HTMLElement>('[data-pane-body]')?.dataset.paneBody;
        if (id) keep(id);
      }}
      onFocusCapture={focus.onFocusCapture}
    >
      <div className="sr-only" aria-live="polite" aria-atomic data-testid="pane-announce">{announce}</div>
      <div ref={layerRef} className="pane-ghosts" aria-hidden />
      {!layout.root ? emptyView : null}
      {!phone && [...geo.stacks.values()].map((box) => {
        const stack = findNode(shownRoot, box.id);
        if (!stack || stack.type !== 'stack') return null;
        return (
          <Card key={box.id} stack={stack} rect={box.card} barHeight={box.tabBar.h} layout={layout} active={box.id === activeStack} dragPaneId={dragPaneId}
            onTabPointerDown={tabDown} onActivate={card.activate} onClose={card.close}
            zoomed={!!zoomed} canFold={!zoomed && canCollapse(layout, stack.id)} where={where} dirty={dirty}
            cmd={card.cmd} icon={icon} moveTo={moveTo} />
        );
      })}
      {!phone && [...geo.strips.values()].map((s) => <Strip key={s.id} strip={s} layout={layout} icon={icon} zoomed={!!zoomed} onExpand={onStrip} />)}
      {!phone && <FoldPreview store={foldPreview} layout={layout} icon={icon} />}
      {bodies}
      {!phone && !held && !zoomed && geo.gaps.map((g) => {
        const key = g.key;
        const v = dividerValues.get(key) ?? { value: 50, min: 0, max: 100 };
        const before = namesOf(layout, g.before);
        const after = namesOf(layout, g.after);
        const line = `${g.axis}:${g.line}`;
        return (
          <div key={key} className={`pane-divider pane-divider-${g.axis}`} style={rectStyle(g.rect)} role="separator" tabIndex={0}
            aria-orientation={g.axis === 'row' ? 'vertical' : 'horizontal'} aria-label={`Resize ${before} and ${after}`}
            aria-valuenow={v.value} aria-valuemin={v.min} aria-valuemax={v.max} aria-valuetext={`${v.value}% from the ${g.axis === 'row' ? 'left' : 'top'}`}
            data-divider={key} data-line={line} data-hot={(hotLine === line && !altPart) || undefined} data-alt={(hotLine === line && !!altPart) || undefined} data-motion={motionKey('gap', key)}
            onPointerEnter={(e) => { setHotLine(line); if (!e.buttons) hoverDivider(g, e); if (e.pointerType !== 'touch' && !e.buttons && !motion.moving) showTip(e.clientX, e.clientY); }}
            onPointerMove={(e) => { if (!e.buttons && (e.altKey || altPart)) hoverDivider(g, e); else if (!e.buttons) hovered.current = { gap: g, x: e.clientX, y: e.clientY }; }}
            onPointerLeave={() => { setHotLine(null); setTip(null); hoverDivider(null); }}
            onFocus={(e) => {
              // Keyboard focus only (a click's focus is not a request for the tip), at the divider's middle.
              if (!e.currentTarget.matches(':focus-visible')) return;
              const r = e.currentTarget.getBoundingClientRect();
              showTip(r.left + r.width / 2, r.top + r.height / 2);
            }}
            onBlur={() => setTip(null)}
            onPointerDown={(e) => { setTip(null); onDividerDown(g, e); }} onDoubleClick={() => onEqualize(g)} onKeyDown={(e) => onDividerKey(g, e)} />
        );
      })}
      
      {!phone && !held && <LiveSplitLabel store={liveLabel} />}
      {!phone && labelGap && labelShares && (
        <SplitLabel axis={labelGap.axis} shares={labelShares} text={shares!.text} settled={shares!.settled}
          style={{ left: labelGap.rect.x + labelGap.rect.w / 2, top: labelGap.rect.y + labelGap.rect.h / 2 }} />
      )}
      {activeBox && <div className="pane-frame" data-motion={motionKey('frame')} data-show={(gliding && !held) || undefined} aria-hidden style={rectStyle(activeBox.card)} />}
      {glowBox && <Glow key={glow!.n} rect={glowBox.card} />}
      {!phone && tip && !resizing && !held && <DividerTip at={tip} />}
      {!phone && altPart && !resizing && !held && !zoomed && <div className="pane-divider-part" data-testid="divider-part" aria-hidden style={rectStyle(altPart)} />}
      {/* Not while a divider is dragged: Alt there pulls one stretch of a line away (onDividerDown). */}
      {!phone && !dormant && <AltLayer show={!held && !resizing} layout={layout} geo={geo} area={areaRef} zoomed={!!zoomed} />}
      {(!phone || cover) && <DragOverlay />}
      <Ghost refEl={(el) => { ghostRef.current = el; }} />
      {phone && shownPair && (
        <PhoneHandle top={splitAt} height={extent} sideways={sideways} ratio={shownRatio} onRatio={setRatio} onClose={closeHalf}
          above={layout.panes[shownPair.top].title} below={layout.panes[shownPair.bottom].title} />
      )}
      {/* The empty view past the last page: showing, or coming in beside it as the bar is swiped. */}
      {phone && layout.activePane && (blankShown || (swiping && slots[slots.length - 2] === stopOf(layout.activePane))) && (
        <div className="pane-body" data-phone-blank data-active={blankShown || undefined} data-peek={blankShown ? undefined : 'next'}
          aria-hidden={!blankShown || undefined} style={rectStyle({ x: 0, y: 0, w: area.w, h: area.h })}
          onClick={(e) => { if ((e.target as Element).closest('button, a')) setBlank(false); }}>
          {emptyView}
        </div>
      )}
      {/* Not under a page drawn over the panes: it is this space's, not the page's. */}
      {phone && layout.activePane && !dormant && (
        <PhoneBar layout={layout} order={order} slots={slots} current={blankShown ? BLANK : stopOf(layout.activePane)} pairOf={pairOf} below={below} sideways={sideways} detail={detail} icon={icon} open={sheet} onOpen={setSheet}
          onActivate={activate} onSlot={(id) => { if (id === BLANK) setBlank(true); else { setBlank(false); activate(id); } }}
          onClose={close} onBelow={showBelow} onSwiping={setSwiping} />
      )}
    </div>
  );
}

// -------------------------------------------------------------------- Alt held

/** The hints while Alt is held (AltHints.tsx), and the active pane's frame with them (panes.css).
 *  Whether Alt is held is this component's own: pressing Alt and letting it go renders the hints,
 *  not the workspace. Alt+- lets go of Alt while the fold it started is on its way, and a render of
 *  the whole workspace there was a frame the fold did not have. */
function AltLayer({ show, layout, geo, area, zoomed }: { show: boolean; layout: Layout; geo: Geometry; area: { current: HTMLDivElement | null }; zoomed: boolean }) {
  const hints = useAltState() === 'hints' && show;
  useLayoutEffect(() => {
    const el = area.current;
    el?.toggleAttribute('data-alt-hints', hints);
    return () => el?.removeAttribute('data-alt-hints');
  }, [area, hints]);
  return hints && layout.activePane ? <AltHints layout={layout} geo={geo} area={area.current} zoomed={zoomed} /> : null;
}

// -------------------------------------------------------------------- nothing open

/** No pane is open: it says so, and offers the ways back. Closing the last pane lands here; nothing
 *  reopens on its own. */
function EmptyPanes({ layouts, onLayout, onSearch, lastClosed, onReopen }: {
  layouts?: Props['layouts']; onLayout(make: () => Layout): void; onSearch?(): void; lastClosed?: string; onReopen(): void;
}) {
  return (
    <div className="pane-empty" data-testid="pane-empty">
      <h2 className="text-lg font-semibold">No panes are open</h2>
      <p className="text-sm text-muted-foreground">{layouts?.length ? 'Start with a layout, or open any page.' : 'Open any page to start.'}</p>
      {!!layouts?.length && (
        <div className="flex flex-wrap justify-center gap-2">
          {layouts.map((l) => <Button key={l.label} variant="outline" size="sm" onClick={() => onLayout(l.make)}>{l.label}</Button>)}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {onSearch && <Button size="sm" onClick={onSearch}>Search for a page <Keys combo="Mod+K" className="ml-1" aria-hidden /></Button>}
        {lastClosed && (
          <Button variant="outline" size="sm" data-reopen onClick={onReopen}>Reopen “{lastClosed}” <Keys combo="Alt+Shift+T" className="ml-1" aria-hidden /></Button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- desktop card

interface CardProps {
  stack: StackNode;
  rect: Rect;
  barHeight: number;
  layout: Layout;
  active: boolean;
  dragPaneId: string | null;
  onTabPointerDown(paneId: string, e: ReactPointerEvent<HTMLElement>): void;
  onActivate(paneId: string): void;
  onClose(paneId: string): void;
  zoomed: boolean;
  /** Whether the group may fold into a strip (the last open one may not). */
  canFold: boolean;
  cmd: { split(paneId: string, side: Side): void; zoom(paneId: string): void; fold(stackId: string): void; closeOthers(paneId: string): void; keep(paneId: string): void };
  /** Where a tab is, for two tabs with the same title. */
  where: ReadonlyMap<string, string>;
  dirty: ReadonlySet<string>;
  /** A page's icon (a page icon when not given). */
  icon: Props['icon'];
  moveTo?: MoveTo;
}

/** Scrolls a tab bar (and nothing else: scrollIntoView scrolls every box around it too) so a tab is
 *  wholly in it. */
function revealTab(bar: HTMLElement | null, paneId: string) {
  const tab = bar?.querySelector<HTMLElement>(`[data-tab="${paneId}"]`);
  if (!bar || !tab) return;
  const b = bar.getBoundingClientRect(), t = tab.getBoundingClientRect();
  if (t.left < b.left) bar.scrollLeft -= b.left - t.left;
  else if (t.right > b.right) bar.scrollLeft += t.right - b.right;
}


const Card = memo(function Card({ stack, rect, barHeight, layout, active, dragPaneId, onTabPointerDown, onActivate, onClose, zoomed, canFold, cmd, where, dirty, icon, moveTo }: CardProps) {
  const barRef = useRef<HTMLDivElement>(null);
  // The tab in front is scrolled into view when it changes: in its own bar, and nothing around it.
  useEffect(() => { revealTab(barRef.current, stack.active); }, [stack.active]);
  const onKey = (id: string, e: KeyboardEvent<HTMLButtonElement>) => {
    const i = stack.panes.indexOf(id);
    let to: string | undefined;
    if (e.key === 'ArrowRight') to = stack.panes[(i + 1) % stack.panes.length];
    else if (e.key === 'ArrowLeft') to = stack.panes[(i - 1 + stack.panes.length) % stack.panes.length];
    else if (e.key === 'Home') to = stack.panes[0];
    else if (e.key === 'End') to = stack.panes[stack.panes.length - 1];
    else if (e.key === 'Delete') { e.preventDefault(); onClose(id); return; }
    if (!to) return;
    e.preventDefault();
    onActivate(to);
    barRef.current?.querySelector<HTMLElement>(`#tab-${to}`)?.focus({ preventScroll: true });
    revealTab(barRef.current, to);
  };
  const [menu, setMenu] = useState(false);
  const front = layout.panes[stack.active];
  // Where else the page in front can go (a project's split), asked only while its menu is open.
  const elsewhere = menu && front && moveTo?.beside ? moveTo.beside(front) : [];
  return (
    <div className="pane-card" data-motion={motionKey('card', stack.id)} data-active={active || undefined} data-front={stack.active} style={rectStyle(rect)}>
      <div className="pane-head" style={{ height: barHeight }}>
        <div ref={barRef} className="pane-tabs" data-scroll-fade role="tablist" aria-label="Open pages" data-tab-bar={stack.id}
          onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
          {stack.panes.map((id) => {
            const pane = layout.panes[id];
            const selected = id === stack.active;
            const at = where.get(id);
            const unsaved = dirty.has(id);
            return (
              <div key={id} className="pane-tab" data-tab={id} data-selected={selected || undefined} data-dragging={dragPaneId === id || undefined}
                data-preview={pane.preview || undefined} data-dirty={unsaved || undefined}
                onContextMenu={(e) => { e.preventDefault(); onActivate(id); setMenu(true); }}>
                <button type="button" role="tab" id={`tab-${id}`} aria-selected={selected} aria-controls={`panel-${id}`} tabIndex={selected ? 0 : -1}
                  title={pane.preview ? `${pane.title} (preview)\nThe next click shows its page here · double-click to keep it` : `${pane.title}\nDrag to move it beside another page · middle-click to close`}
                  onPointerDown={(e) => onTabPointerDown(id, e)} onClick={() => onActivate(id)} onDoubleClick={() => cmd.keep(id)}
                  onKeyDown={(e) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); onActivate(id); setMenu(true); } else onKey(id, e); }}
                  onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(id); } }}>
                  <span className="pane-tab-icon" data-color={colorOf(pane)} aria-hidden>{icon?.(pane) ?? <FileText />}</span>
                  <span className="pane-tab-title">{pane.title}</span>
                  {at && <span className="pane-tab-where">{at}</span>}
                  {pane.preview && <span className="sr-only">, preview</span>}
                  {unsaved && <span className="sr-only">, unsaved changes</span>}
                </button>
                <Button variant="ghost" size="icon-xs" className="pane-tab-close" data-no-drag aria-label={`Close ${pane.title}`} aria-hidden title={unsaved ? 'Close · it has unsaved changes' : 'Close'} tabIndex={-1} onClick={() => onClose(id)}>
                  <X aria-hidden className="pane-tab-x" />
                  {unsaved && <span className="pane-tab-dot" aria-hidden />}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="pane-actions" data-no-drag data-motion-end="x">
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Pane actions for ${front?.title}`} title="Pane actions"><Ellipsis aria-hidden /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60" data-pane-menu>
              <DropdownMenuItem onSelect={() => cmd.split(stack.active, 'left')}>Split left</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cmd.split(stack.active, 'right')}>Split right</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cmd.split(stack.active, 'top')}>Split up</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cmd.split(stack.active, 'bottom')}>Split down</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => cmd.zoom(stack.active)} disabled={!zoomed && Object.keys(layout.panes).length < 2}>{zoomed ? 'Restore' : 'Zoom'}{zoomed && <DropdownMenuShortcut>Esc</DropdownMenuShortcut>}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cmd.fold(stack.id)} disabled={!canFold}>
                <span className="grid">Collapse to a strip{!canFold && !zoomed && <small className="text-muted-foreground">The last open pane stays open</small>}</span>
              </DropdownMenuItem>
              {moveTo && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{elsewhere.length ? 'Move to…' : 'Move to space'}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-44" data-move-menu>
                    {moveTo.places.map((p) => <DropdownMenuItem key={p.id} onSelect={() => moveTo.onMove(stack.active, p.id)}>{p.name}</DropdownMenuItem>)}
                    {moveTo.places.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={() => moveTo.onMove(stack.active, null)}>New space</DropdownMenuItem>
                    {elsewhere.length > 0 && <DropdownMenuSeparator />}
                    {elsewhere.map((p) => <DropdownMenuItem key={p.id} data-move-beside={p.id} onSelect={() => moveTo.onBeside?.(stack.active, p.id)}>{p.name}</DropdownMenuItem>)}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              {front?.preview && <DropdownMenuItem onSelect={() => cmd.keep(stack.active)}>Keep open</DropdownMenuItem>}
              {stack.panes.length > 1 && <DropdownMenuItem onSelect={() => cmd.closeOthers(stack.active)}>Close other tabs</DropdownMenuItem>}
              <DropdownMenuItem variant="destructive" onSelect={() => onClose(stack.active)}>Close</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(zoomed || Object.keys(layout.panes).length > 1) && (
            <Button variant="ghost" size="icon-xs" data-zoom aria-pressed={zoomed} aria-label={zoomed ? 'Restore the layout' : `Zoom ${front?.title}`} title={zoomed ? 'Restore (Esc)' : 'Zoom'}
              onClick={() => cmd.zoom(stack.active)}>
              {zoomed ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

// -------------------------------------------------------------------- strip

// A group folded into a strip: as thick as a tab bar, its front page's title written along it. A
// click anywhere on it brings it back at the size it had; an icon brings that page back in front.
// The keyboard's way in is the strip's own button.
function Strip({ strip, layout, icon, onExpand, zoomed, preview }: {
  strip: StripBox; layout: Layout; icon: Props['icon']; onExpand(nodeId: string, paneId?: string): void;
  /** Zoomed: pressing it zooms its pane instead of opening it (the words say so). */
  zoomed?: boolean;
  /** The strip a group is being pulled into: drawn, not yet there (nothing to press or to read out). */
  preview?: boolean;
}) {
  const titles = strip.panes.map((p) => layout.panes[p]?.title ?? '');
  const front = layout.panes[strip.front];
  const verb = zoomed ? 'Zoom' : 'Expand';
  if (strip.corner) {
    // Where a folded row meets a folded column: one square, its page's icon or how many there are,
    // a dot in each one's colour under the number ("use one box only and say 2 in
    // the center of it"). Several: a menu of them, to pick the one to zoom (or open).
    const several = strip.panes.length > 1;
    const face = several ? (
      <>
        <span>{strip.panes.length}</span>
        <span className="pane-strip-dots" aria-hidden>{strip.panes.slice(0, 4).map((p) => <i key={p} data-color={colorOf(layout.panes[p])} />)}</span>
      </>
    ) : (icon?.(front) ?? <FileText aria-hidden />);
    return (
      <div className="pane-strip pane-strip-corner" data-strip={preview ? undefined : strip.id} data-fold-preview={preview || undefined} data-motion={motionKey('strip', strip.id)}
        role={preview ? undefined : 'group'} aria-label={preview ? undefined : `Collapsed: ${titles.join(', ')}`} aria-hidden={preview || undefined} inert={preview || undefined} style={rectStyle(strip.rect)}
        title={preview ? undefined : titles.join(', ')}>
        {several && !preview ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pane-strip-count" aria-label={`${titles.length} pages: ${titles.join(', ')}`}>{face}</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="min-w-48">
              {strip.panes.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => onExpand(strip.id, p)}>
                  <span className="pane-icon-tile" data-color={colorOf(layout.panes[p])} data-front={p === strip.front || undefined} aria-hidden>{icon?.(layout.panes[p]) ?? <FileText />}</span>
                  {verb} {layout.panes[p]?.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button type="button" className="pane-strip-count" data-color={several ? undefined : colorOf(front)} aria-label={`${verb} ${titles.join(', ')}`} onClick={() => onExpand(strip.id)}>{face}</button>
        )}
      </div>
    );
  }
  return (
    <div className={`pane-strip pane-strip-${strip.axis}`} data-strip={preview ? undefined : strip.id} data-fold-preview={preview || undefined} data-motion={motionKey('strip', strip.id)}
      role={preview ? undefined : 'group'} aria-label={preview ? undefined : `Collapsed: ${titles.join(', ')}`} aria-hidden={preview || undefined} inert={preview || undefined} style={rectStyle(strip.rect)}
      title={preview ? undefined : zoomed ? 'Collapsed: click to zoom it instead' : 'Collapsed: click to expand it at the size it had'} onClick={(e) => { if (!(e.target as Element).closest('button')) onExpand(strip.id); }}>
      <button type="button" className="pane-strip-open" aria-label={`${verb} ${front?.title}`} onClick={() => onExpand(strip.id)}>
        <span>{front?.title}</span>
      </button>
      <div className="pane-strip-icons" data-motion-end={strip.axis === 'row' ? 'y' : 'x'}>
        {strip.panes.map((p) => (
          <Button key={p} variant="ghost" size="icon-xs" data-front={p === strip.front || undefined} data-color={colorOf(layout.panes[p])} aria-label={`${verb} ${layout.panes[p]?.title}`} title={layout.panes[p]?.title}
            onClick={() => onExpand(strip.id, p)}>
            {icon?.(layout.panes[p]) ?? <FileText aria-hidden />}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The strip a group is being pulled into, on the page from the start of the pull: unseen
 *  (panes.css) until the fold draws it (motion.ts), and the real strip's twin when it arrives. */
function FoldPreview({ store, layout, icon }: { store: ReturnType<typeof valueStore<StripBox[]>>; layout: Layout; icon: Props['icon'] }) {
  const strips = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <>{strips.map((strip) => <Strip key={strip.id} strip={strip} layout={layout} icon={icon} onExpand={() => undefined} preview />)}</>;
}

// -------------------------------------------------------------------- one page

// A page lays out once at its new size when the layout changes, and rides there by transform
// (motion.ts).
const PaneBody = memo(function PaneBody({ pane, rect, visible, active, render, onCrash, labelled, setDirty, keep, peek, paired }: {
  pane: Pane; rect: Rect; visible: boolean; active: boolean; render: Props['render']; onCrash: Props['onCrash']; labelled: boolean;
  setDirty(id: string, dirty: boolean): void; keep(id: string): void;
  /** On the phone, mid-swipe: the page beside the one showing, on that side (drawn, not yet read). */
  peek?: 'prev' | 'next';
  /** On the phone: one of the two pages showing, one above the other (they swipe together). */
  paired?: boolean;
}) {
  const info = useMemo<PaneInfo>(() => ({ active, visible, setDirty: (d) => setDirty(pane.id, d), keep: () => keep(pane.id) }), [active, visible, setDirty, keep, pane.id]);
  return (
    <div className="pane-body" id={`panel-${pane.id}`} tabIndex={-1} role="tabpanel" aria-labelledby={labelled ? `tab-${pane.id}` : undefined} aria-label={labelled ? undefined : pane.title}
      data-pane-body={pane.id} data-active={active || undefined} data-hidden={!visible || undefined} data-motion={motionKey('body', pane.id)}
      data-peek={peek} data-paired={paired || undefined} aria-hidden={!visible || !!peek || undefined} style={rectStyle(rect)}>
      <PanePage pane={pane} info={info} render={render} onCrash={onCrash} />
    </div>
  );
});

/** The page itself: rendered again when what it shows changes, not when its pane moves. */
const PanePage = memo(function PanePage({ pane, info, render, onCrash }: { pane: Pane; info: PaneInfo; render: Props['render']; onCrash: Props['onCrash'] }) {
  return <PaneBoundary title={pane.title} onCrash={onCrash}>{render(pane, info)}</PaneBoundary>;
});

class PaneBoundary extends Component<{ title: string; onCrash?: Props['onCrash']; children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`pane “${this.props.title}” crashed`, error, info.componentStack);
    this.props.onCrash?.(this.props.title, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="pane-error" role="alert">
          <strong>“{this.props.title}” stopped working.</strong>
          <span>{this.state.error.message}</span>
          <Button variant="outline" size="sm" onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}>Reload this pane</Button>
        </div>
      );
    }
    return <div key={this.state.attempt} className="pane-page">{this.props.children}</div>;
  }
}

// -------------------------------------------------------------------- the glow

/** A pane brought forward from outside, or dropped: its frame lights up and fades, on springs. With
 *  reduced motion it stays lit for GLOW_MS instead. */
function Glow({ rect }: { rect: Rect }) {
  const ref = useRef<HTMLDivElement>(null);
  const light = useSpring(0, (v) => { if (ref.current) ref.current.style.opacity = Math.max(0, Math.min(1, v)).toFixed(3); });
  useLayoutEffect(() => {
    if (reducedMotion()) { light.jump(1); return; }
    light.onRest(() => light.to(0, { config: { stiffness: 120, damping: 22 } }));
    light.to(1, { config: { stiffness: 900, damping: 50 } });
  }, [light]);
  return <div ref={ref} className="pane-glow" aria-hidden style={{ ...rectStyle(rect), opacity: 0 }} />;
}

// -------------------------------------------------------------------- divider label

type LiveLabel = { axis: 'row' | 'column'; shares: [number, number]; text?: string };
/** Something on the page while a gesture runs (a divider's label, the strip a fold becomes), with
 *  its own subscriber: it renders when it changes, and the workspace does not. */
function valueStore<T>(initial: T, equal: (a: T, b: T) => boolean = Object.is) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) { if (equal(next, value)) return; value = next; for (const f of subs) f(); },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}
/** A dragged divider's label: what it says is rendered when that changes; where it is (`move`) is
 *  written straight to it, a transform, so a move renders nothing and lays out nothing. */
function labelStore() {
  const store = valueStore<LiveLabel | null>(null, (a, b) => a === b || (!!a && !!b && a.axis === b.axis && a.text === b.text && a.shares[0] === b.shares[0] && a.shares[1] === b.shares[1]));
  let el: HTMLElement | null = null;
  let at = { x: 0, y: 0 };
  let within = { w: 0, h: 0 };
  // Centred on the point, and kept inside the area (a divider pulled to its edge): its own size is
  // the percentages, so nothing is measured.
  const along = (v: number, size: number) => (size ? `min(max(${v.toFixed(1)}px - 50%, 4px), ${(size - 4).toFixed(1)}px - 100%)` : `calc(${v.toFixed(1)}px - 50%)`);
  const draw = () => { if (el) el.style.transform = `translate(${along(at.x, within.w)}, ${along(at.y, within.h)})`; };
  return {
    ...store,
    move(x: number, y: number, area: { w: number; h: number }) { at = { x, y }; within = area; draw(); },
    ref(node: HTMLElement | null) { el = node; draw(); },
  };
}
function LiveSplitLabel({ store }: { store: ReturnType<typeof labelStore> }) {
  const v = useSyncExternalStore(store.subscribe, store.get, store.get);
  return v ? <SplitLabel axis={v.axis} shares={v.shares} text={v.text} settled={false} at={store.ref} style={{ left: 0, top: 0 }} /> : null;
}

/** The two shares on a divider while it is dragged, and for a moment after an even share. */
function SplitLabel({ axis, shares, text, settled, style, at }: {
  axis: 'row' | 'column'; shares: [number, number]; text?: string; settled: boolean; style: CSSProperties; at?(el: HTMLElement | null): void;
}) {
  return (
    <div ref={at} className="split-label" data-settled={settled || undefined} style={style} aria-live="polite" data-testid="split-label">
      {text ?? <><span>{shares[0]}%</span><span className="split-label-sep" aria-hidden>{axis === 'row' ? '|' : '—'}</span><span>{shares[1]}%</span></>}
    </div>
  );
}

function DividerTip({ at }: { at: { x: number; y: number } }) {
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild><span className="pane-tip-anchor" style={{ left: at.x - 6, top: at.y - 6 }} aria-hidden /></TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8} className="grid gap-0.5 text-left">
          <span className="font-medium">Drag to resize</span>
          <span className="opacity-70">Double-click to share the space evenly</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// -------------------------------------------------------------------- phone

export interface PhonePair { top: string; bottom: string; share: number }

/** On a phone, the pages shown two at a time: the front pages of two groups one over the other, as
 *  wide as each other (a top and bottom split on a desktop), the upper one's share of the height. */
export function phonePairs(layout: Layout): PhonePair[] {
  if (!layout.root) return [];
  const g = computeGeometry(layout.root, { x: 0, y: 0, w: 1000, h: 1000 }, AT_REST);
  const boxes = [...g.stacks.entries()].filter(([id]) => !g.folded.has(id)).map(([id, s]) => ({ id, r: s.card }))
    .sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
  const used = new Set<string>();
  const out: PhonePair[] = [];
  for (const a of boxes) {
    if (used.has(a.id)) continue;
    const b = boxes.find((x) => x !== a && !used.has(x.id) && Math.abs(x.r.x - a.r.x) < 1 && Math.abs(x.r.w - a.r.w) < 1
      && x.r.y > a.r.y && x.r.y - (a.r.y + a.r.h) < 4);
    if (!b) continue;
    const upper = findNode(layout.root, a.id);
    const lower = findNode(layout.root, b.id);
    if (upper?.type !== 'stack' || lower?.type !== 'stack') continue;
    used.add(a.id);
    used.add(b.id);
    out.push({ top: upper.active, bottom: lower.active, share: a.r.h / (a.r.h + b.r.h) });
  }
  return out;
}

/** How near an end the divider closes that page (a share of the height), and how near it can go. */
export const PHONE_CLOSE_AT = 0.15;
/** How far up from the bottom the bar and its margin reach: a label there would be under it. */
const PHONE_BAR_ROOM = 120;
const PHONE_REACH = 0.04;

/** The divider between two pages on a phone. Dragged, the two share the height (each keeps a fifth);
 *  pulled to the top or the bottom, the page there dims and says it closes, and
 *  letting go closes it. */
/** The divider between a pair. `top` and `height` are along the split: down it, or across it on a
 *  phone on its side (`sideways`: the pair side by side, the divider upright, dragged sideways). */
function PhoneHandle({ top, height, sideways = false, ratio, onRatio, onClose, above, below }: {
  top: number; height: number; sideways?: boolean; ratio: number; onRatio(r: number): void; onClose(half: 'top' | 'bottom'): void; above: string; below: string;
}) {
  const clamp = (r: number) => Math.min(0.8, Math.max(0.2, r));
  const [closing, setClosing] = useState<'top' | 'bottom' | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const start = sideways ? e.clientX : e.clientY;
    const base = ratio;
    let at = ratio;
    el.setPointerCapture(e.pointerId);
    const halfAt = (r: number) => (r < PHONE_CLOSE_AT ? 'top' : r > 1 - PHONE_CLOSE_AT ? 'bottom' : null);
    const move = (ev: PointerEvent) => {
      at = Math.min(1 - PHONE_REACH, Math.max(PHONE_REACH, base + ((sideways ? ev.clientX : ev.clientY) - start) / Math.max(1, height)));
      onRatio(at);
      setClosing(halfAt(at));
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      setClosing(null);
      const half = ev.type === 'pointerup' ? halfAt(at) : null;
      if (half) onClose(half); else onRatio(clamp(at));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <>
      {/* The half that closes dims; what it says sits by the divider, on the side that stays: the
          closing half can be a sliver, under the bar. */}
      {closing && <div className="phone-closing" aria-hidden style={sideways
        ? (closing === 'top' ? { top: 0, bottom: 0, left: 0, width: top } : { top: 0, bottom: 0, left: top + PHONE_HANDLE, right: 0 })
        : (closing === 'top' ? { top: 0, height: top } : { top: top + PHONE_HANDLE, bottom: 0 })} />}
      {closing && (
        <span className="phone-closing-label" aria-hidden style={sideways
          ? { top: 12, left: closing === 'top' ? top + PHONE_HANDLE + (height - top - PHONE_HANDLE) / 2 : top / 2 }
          : closing === 'top' ? { top: top + PHONE_HANDLE + 12 } : { top: Math.min(top - 38, height - PHONE_BAR_ROOM) }}>
          Close {closing === 'top' ? above : below}
        </span>
      )}
      <div className="phone-handle" data-sideways={sideways || undefined} style={sideways ? { left: top, width: PHONE_HANDLE } : { top, height: PHONE_HANDLE }}
        role="separator" tabIndex={0} aria-orientation={sideways ? 'vertical' : 'horizontal'}
        aria-label={`Resize ${above} and ${below}`} aria-valuenow={Math.round(ratio * 100)} aria-valuemin={20} aria-valuemax={80}
        data-closing={closing ?? undefined}
        onPointerDown={down}
        onKeyDown={(e) => {
          const back = sideways ? 'ArrowLeft' : 'ArrowUp', on = sideways ? 'ArrowRight' : 'ArrowDown';
          if (e.key === back || e.key === on) { e.preventDefault(); onRatio(clamp(ratio + (e.key === back ? -0.05 : 0.05))); }
        }}>
        <span aria-hidden />
      </div>
    </>
  );
}

function PhoneBar({ layout, order, slots, current, pairOf, below, sideways = false, detail, icon, open, onOpen, onActivate, onSlot, onClose, onBelow, onSwiping }: {
  layout: Layout; order: string[];
  /** A phone on its side: the second page of a pair is beside, not below. */
  sideways?: boolean;
  /** Two pages shown one above the other (the stop at the upper one): one stop, named by both. */
  pairOf(top: string): PhonePair | undefined;
  /** A page's icon, drawn in its pane's colour, as on its tab. */
  icon?: Props['icon'];
  /** What the bar swipes through: the open pages, then the empty view (BLANK). */
  slots: string[]; current: string;
  below: string | null; detail?: Props['detail']; open: boolean;
  onOpen(open: boolean): void; onActivate(id: string): void; onSlot(id: string): void; onClose(id: string): void; onBelow(id: string | null): void;
  onSwiping(swiping: boolean): void;
}) {
  const active = layout.activePane!;
  const index = slots.indexOf(current);
  const stops = slots.filter((s) => s !== BLANK).length;
  const titleOf = (id: string) => {
    if (id === BLANK) return 'Open something here';
    const pair = pairOf(id);
    return pair ? `${layout.panes[id].title} above ${layout.panes[pair.bottom].title}` : layout.panes[id].title;
  };
  const iconOf = (id: string) => {
    const pane = layout.panes[id];
    return pane
      ? <span className="pane-tab-icon" data-color={colorOf(pane)} aria-hidden>{icon?.(pane) ?? <FileText />}</span>
      : <span className="pane-tab-icon" aria-hidden><Plus /></span>;
  };
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>('[data-current] button')?.focus();
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onOpen]);

  // Swiping the bar moves the page under it with the finger (--phone-swipe on the area), with the
  // pages either side beside it (the Workspace draws them while `onSwiping`), and the bar's title and
  // count slide across with it, the next one coming in as this one goes. Let go, and where the
  // swipe's speed would carry it decides: the next or previous page comes in from that side at that
  // speed, or the page springs back. With nothing that way it gives a little and no more.
  // With reduced motion nothing travels: the same swipe cross-fades instead (--phone-fade-prev/next,
  // and the titles' opacity), and letting go finishes the fade. A fade is not motion, and a cut on
  // letting go is the jarring part, so the settle runs either way (`gesture`).
  const area = () => barRef.current?.closest<HTMLElement>('.pane-area') ?? null;
  const width = () => area()?.clientWidth || 360;
  const slide = useSpring(0, (x) => {
    const el = area();
    const p = x / width();
    el?.style.setProperty('--phone-swipe', `${x}px`);
    // Reduced motion fades through: this page is gone by 60% of the way, the next one comes in over
    // the last 60%, so the two are never both clear at once. in(f) = out(1 - f): the page that
    // becomes current on letting go carries on at the same opacity.
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    el?.style.setProperty('--phone-fade-out', clamp(1 - Math.abs(p) / 0.6).toFixed(4));
    el?.style.setProperty('--phone-fade-prev', clamp((p - 0.4) / 0.6).toFixed(4));
    el?.style.setProperty('--phone-fade-next', clamp((-p - 0.4) / 0.6).toFixed(4));
    drawTitles(p);
  });
  // The titles in the bar: this page's, and either side's a slot away. Each slides by a share of the
  // bar's width and fades as it leaves the middle; with reduced motion it only fades.
  const drawTitles = (p: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const reduced = reducedMotion();
    const travel = reduced ? 0 : bar.clientWidth * 0.45;
    for (const slot of bar.querySelectorAll<HTMLElement>('[data-title-slot]')) {
      const at = p + Number(slot.dataset.titleSlot);
      slot.style.translate = `${(at * travel).toFixed(2)}px 0`;
      // Sliding, each fades as it leaves the middle; fading through (reduced motion), as the pages do.
      slot.style.opacity = Math.max(0, 1 - Math.abs(at) * (reduced ? 1 / 0.6 : 1.2)).toFixed(4);
    }
  };
  // The slots are drawn by the spring alone (React gives them no style): after the page changes they
  // are new slots, put where the spring is before they are painted.
  useLayoutEffect(() => { drawTitles(slide.value / width()); }); // eslint-disable-line react-hooks/exhaustive-deps
  const resist = (x: number) => ((x < 0 && !slots[index + 1]) || (x > 0 && !slots[index - 1]) ? x * 0.2 : x);
  const settle = (velocity: number) => {
    slide.onRest(() => { if (slide.target === 0 && !slide.held) onSwiping(false); });
    slide.to(0, { velocity, gesture: true });
  };
  const swipe = useAxisDrag({
    axis: 'x',
    onStart: () => { onSwiping(true); },
    onMove: (x) => slide.set(resist(x)),
    onEnd: (x, velocity) => {
      const w = width();
      const end = landing(resist(x), velocity, [-w, 0, w]);
      const to = end < 0 ? slots[index + 1] : end > 0 ? slots[index - 1] : undefined;
      if (!to) { settle(velocity); return; }
      // The new page sits where it would in a row of pages, beside the one leaving, and comes on.
      slide.set(resist(x) + (end < 0 ? w : -w));
      onSlot(to);
      settle(velocity);
    },
  });

  // The list of open pages slides up on a spring, and drags back down by its top.
  const { present, spring: sheet } = usePresence(open, (p) => {
    sheetRef.current?.style.setProperty('translate', `0 ${((1 - p) * 100).toFixed(3)}%`);
    scrimRef.current?.style.setProperty('opacity', String(Math.max(0, Math.min(1, p))));
  });
  const height = () => sheetRef.current?.offsetHeight || 400;
  const pull = useAxisDrag({
    axis: 'y',
    ignore: 'button',
    onMove: (y) => sheet.set(y > 0 ? 1 - y / height() : 1 - (y / height()) * 0.1),
    onEnd: (y, velocity) => {
      const p = 1 - Math.max(0, y) / height();
      const v = -velocity / height();
      if (landing(p, v, [0, 1]) === 0) { sheet.velocity = v; onOpen(false); }
      else sheet.to(1, { velocity: v });
    },
  });
  return (
    <>
      <button ref={barRef} type="button" className="phone-bar" aria-haspopup="dialog" aria-expanded={open}
        aria-label={current === BLANK ? 'An empty page, to open something here. Show open pages' : `${titleOf(current)}, ${index + 1} of ${stops} open. Show open pages`}
        onPointerDown={swipe.onPointerDown}
        onClick={() => onOpen(true)}>
        <span className="phone-bar-slots">
          {([-1, 0, 1] as const).map((k) => {
            const id = slots[index + k];
            if (!id) return null;
            const pair = id === BLANK ? undefined : pairOf(id);
            return (
              <span key={id} data-title-slot={k} aria-hidden={k !== 0 || undefined}>
                {/* Two pages, one above the other: both named, as they sit, the one in use stronger. */}
                {pair
                  ? (
                    <span className="phone-bar-pair">
                      {[pair.top, pair.bottom].map((p) => (
                        <span key={p} className="phone-bar-title" data-in-use={p === active || undefined}>{iconOf(p)}<span className="truncate">{layout.panes[p].title}</span></span>
                      ))}
                    </span>
                  )
                  : <span className="phone-bar-title">{iconOf(id)}<span className="truncate">{titleOf(id)}</span></span>}
                {id === BLANK ? <span className="phone-bar-count">new</span>
                  : stops > 1 && <span className="phone-bar-count">{index + k + 1} of {stops}</span>}
              </span>
            );
          })}
        </span>
      </button>
      {present && (
        <div ref={scrimRef} className="phone-sheet-scrim" style={{ opacity: sheet.value }} onClick={(e) => e.target === e.currentTarget && onOpen(false)}>
          <div ref={sheetRef} className="phone-sheet" role="dialog" aria-modal="true" aria-label="Open pages" style={{ translate: `0 ${(1 - sheet.value) * 100}%` }}>
            <div className="phone-sheet-grab" aria-hidden onPointerDown={pull.onPointerDown}><span /></div>
            <div className="phone-sheet-head" onPointerDown={pull.onPointerDown}>
              <strong>Open notes</strong>
              <Button variant="ghost" size="sm" onClick={() => onOpen(false)} aria-label="Close the list">Done <ChevronDown aria-hidden /></Button>
            </div>
            <ul>
              {order.map((id) => {
                const pane = layout.panes[id];
                const where = detail?.(pane);
                return (
                  <li key={id} className="phone-card" data-current={id === active || undefined} data-below={id === below || undefined}>
                    <button type="button" className="phone-card-main" onClick={() => { onActivate(id); onOpen(false); }} aria-current={id === active ? 'page' : undefined}>
                      <strong className="flex items-center">{iconOf(id)}{pane.title}</strong>
                      {where && <small>{where}</small>}
                      {id === active ? <em>Showing</em> : id === below ? <em>{sideways ? 'Beside' : 'Below'}</em> : null}
                    </button>
                    {id !== active && (
                      id === below
                        ? <Button variant="ghost" className="phone-card-action h-auto rounded-none" onClick={() => onBelow(null)} aria-label={`Stop showing ${pane.title} ${sideways ? 'beside' : 'below'}`}>{sideways ? <PanelRightClose aria-hidden /> : <PanelBottomClose aria-hidden />}</Button>
                        : <Button variant="ghost" className="phone-card-action h-auto flex-col gap-0.5 rounded-none" onClick={() => { onBelow(id); onOpen(false); }} aria-label={`Show ${pane.title} ${sideways ? 'beside' : 'below'}`}>{sideways ? <PanelRight aria-hidden /> : <PanelBottom aria-hidden />}<span>{sideways ? 'Beside' : 'Below'}</span></Button>
                    )}
                    <Button variant="ghost" className="phone-card-action h-auto rounded-none" onClick={() => onClose(id)} aria-label={`Close ${pane.title}`}><X aria-hidden /></Button>
                  </li>
                );
              })}
            </ul>
            <p className="phone-sheet-hint">Swipe the bar to move between pages.</p>
          </div>
        </div>
      )}
    </>
  );
}
