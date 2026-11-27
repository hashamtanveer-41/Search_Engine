// The pane shortcuts acted out (guide.tsx) on a small map of three panes, with the layout model's own
// operations: a split opens the same page beside the active one, a close takes it away, Zoom folds
// the others into strips, focus moves the ring; a tab's keys on a strip of tabs.
import * as React from 'react';
import { BookOpen, Copy, NotebookPen } from 'lucide-react';
import { SpaceMap } from '../spaces';
import {
  activatePane, closePane, collapseNode, emptyLayout, equalize, expandAll, findStackOf, foldedAround, moveLine, neighbourStack,
  openPane, reopenPane, shownOrder, splitPane, type Direction, type Layout, type Pane,
} from '../panes/model';
import { paneShortcuts } from '../panes/keymap';
import { MiniLines, MiniAppear } from './scenes';
import type { ShortcutRow, ShortcutSection } from './guide';
import type { Beat } from './beat';

const ICONS: Record<string, React.ComponentType> = { lesson: BookOpen, workbook: NotebookPen, cards: Copy };
const icon = (pane: Pane) => { const Icon = ICONS[pane.kind] ?? BookOpen; return <Icon />; };
const stackOf = (l: Layout, pane: string) => findStackOf(l.root, pane)!.id;

/** A lesson on the left, the Workbook over review cards on the right; the lesson active. */
function threePanes() {
  const a = openPane(emptyLayout(), 'lesson', 'Lesson', undefined, { color: 0 });
  const b = openPane(a.layout, 'workbook', 'Workbook', { kind: 'beside', nodeId: stackOf(a.layout, a.paneId), side: 'right', share: 0.42 }, { color: 3 });
  const c = openPane(b.layout, 'cards', 'Review cards', { kind: 'beside', nodeId: stackOf(b.layout, b.paneId), side: 'bottom', share: 0.5 }, { color: 5 });
  return { layout: activatePane(c.layout, a.paneId).layout, a: a.paneId, b: b.paneId, c: c.paneId };
}

/** The layouts a shortcut goes through, one per press after the first; none for a key that is not
 *  played on the map. */
export function paneFrames(id: string): Layout[] {
  const { layout: l, a, b, c } = threePanes();
  const on = (pane: string) => activatePane(l, pane).layout;
  const focus = (...panes: string[]) => panes.map(on);
  const go = (from: string, dir: Direction) => {
    const n = neighbourStack(l.root, stackOf(l, from), dir);
    return focus(from, n ? n.active : from);
  };
  const zoomed = (x: Layout, pane: string): Layout => ({ ...x, root: foldedAround(x.root!, stackOf(x, pane)) });
  const split = splitPane(l, a, 'right').layout;
  switch (id) {
    case 'split-right': return [l, split];
    case 'split-down': return [l, splitPane(l, a, 'bottom').layout];
    case 'split-left': return [l, splitPane(l, a, 'left').layout];
    case 'split-up': return [l, splitPane(l, a, 'top').layout];
    case 'close': return [l, closePane(l, a).layout];
    case 'reopen': { const shut = closePane(l, b); return [shut.layout, reopenPane(shut.layout, shut.closed).layout]; }
    case 'zoom': return [l, zoomed(l, a)];
    case 'unzoom': return [zoomed(l, a), l];
    // The lesson's column: the Workbook's would fold the whole right side, which looks like a zoom.
    case 'collapse': return [l, collapseNode(l, stackOf(l, a)).layout];
    case 'expand': { const folded = collapseNode(l, stackOf(l, a)).layout; return [folded, expandAll(folded).layout]; }
    case 'focus-left': return go(b, 'left');
    case 'focus-right': return go(a, 'right');
    case 'focus-up': return go(c, 'up');
    case 'focus-down': return go(b, 'down');
    case 'next': return focus(...shownOrder(l.root));
    case 'previous': return focus(...shownOrder(l.root).reverse());
    case 'undo': return [split, l];
    case 'redo': return [l, split];
    case 'divider-move': return [l, ...[0.53, 0.48, 0.43].map((at) => moveLine(l, 'row', 1, at).layout)];
    case 'divider-even': { const wide = moveLine(l, 'row', 1, 0.72).layout; return [wide, equalize(wide, 'row').layout]; }
    default: return [];
  }
}

function MapScene({ frames, beat }: { frames: Layout[]; beat: Beat }) {
  const frame = frames[Math.min(beat.step, frames.length - 1)];
  // Moving only while a press plays: shown anew, or starting over, it is drawn as it is.
  return <SpaceMap layout={frame} icon={icon} w={320} h={220} room={6} ring={frame.activePane ?? undefined} animate={beat.step > 0} />;
}

const TABS = [{ kind: 'lesson', color: 0 }, { kind: 'workbook', color: 3 }, { kind: 'cards', color: 5 }];

/** One pane's group of three tabs: `focus` is the tab the keys are on, `gone` one closed, `menu` its
 *  menu open under it. */
function TabScene({ focus, gone, menu = false }: { focus: number; gone?: number; menu?: boolean }) {
  return (
    <span className="relative flex h-full flex-col overflow-hidden rounded-md border bg-background shadow-xs">
      <span className="flex h-[22%] shrink-0 items-end gap-[3%] border-b px-[4%]">
        {TABS.map((t, i) => {
          const Icon = ICONS[t.kind];
          return (
            <span key={t.kind} data-color={t.color} data-gone={i === gone || undefined} data-focused={i === focus || undefined}
              className="flex h-[78%] w-[28%] items-center gap-[8%] overflow-hidden rounded-t-md px-[4%] outline-2 -outline-offset-2 outline-transparent transition-[width,opacity,outline-color] duration-300 data-[focused]:outline-primary data-[gone]:w-0 data-[gone]:px-0 data-[gone]:opacity-0 [&_svg]:size-3.5"
              style={{ background: i === 0 ? 'var(--ps)' : undefined, color: 'var(--pc)' }}>
              <Icon /><span className="h-1.5 flex-1 rounded-full bg-muted-foreground/25" />
            </span>
          );
        })}
      </span>
      <span className="flex-1 p-[6%]"><MiniLines widths={[44, 90, 82, 88, 60]} /></span>
      <MiniAppear shown={menu} className="top-[20%] left-[33%] grid w-[38%] gap-[10%] p-[4%]"><MiniLines widths={[80, 64, 72, 50]} className="gap-2" /></MiniAppear>
    </span>
  );
}

/** A scene for each pane key, and how many presses a round takes. */
function paneScene(id: string): Pick<ShortcutRow, 'scene' | 'presses'> {
  if (id === 'tab-move') return { scene: (b) => <TabScene focus={[0, 1, 2, 0][b.step]} />, presses: 3 };
  if (id === 'tab-close') return { scene: (b) => <TabScene focus={b.step ? 2 : 1} gone={b.step ? 1 : undefined} /> };
  if (id === 'tab-menu') return { scene: (b) => <TabScene focus={1} menu={b.step > 0} /> };
  const frames = paneFrames(id);
  if (frames.length < 2) return {};
  return { scene: (beat) => <MapScene frames={frames} beat={beat} />, presses: frames.length - 1 };
}

/** The workspace's keys (keymap.ts) as the guide's sections, each acted out. A scene that cannot be
 *  built (the model refused an operation) is left out and reported; its row stays. */
export function paneShortcutSections(onSceneError?: (id: string, error: unknown) => void): ShortcutSection[] {
  const sections = new Map<string, ShortcutRow[]>();
  for (const k of paneShortcuts()) {
    let scene: Pick<ShortcutRow, 'scene' | 'presses'> = {};
    try { scene = paneScene(k.id); } catch (error) { onSceneError?.(k.id, error); }
    sections.set(k.group, [...(sections.get(k.group) ?? []), { id: k.id, combo: k.combo, what: k.what, short: k.short, ...scene }]);
  }
  return [...sections].map(([title, rows]) => ({ title, rows }));
}
