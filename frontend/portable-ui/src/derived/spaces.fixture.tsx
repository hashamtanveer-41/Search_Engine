// Spaces, the mockup, kept live: a space is a saved layout of lessons, listed in
// the sidebar as tiles, with a gear that opens the Spaces page (a menu, in the collapsed sidebar).
// Home, the Workbook, Review cards and the Formula sheet are pages: drawn full-size over the panes,
// their link lit. Lessons and pages are dragged from the sidebar into the panes; a pane dropped on
// the sidebar leaves its space. Option/Alt-click opens a new space, Shift-click a tab of the
// focused pane, Cmd/Ctrl-click a new browser tab.
import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BookOpen, ClipboardList, Copy, Eye, Home, LayoutGrid, NotebookPen } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Button } from '../base/button';
import { Question } from './widgets/question';
import { MathCard } from './widgets/blocks';
import { Sidebar, type OpenAs, type SidebarChapter, type SidebarLink, type SidebarProps } from './sidebar';
import { usePaneLayout } from './panes/store';
import { Workspace, type Bring, type MoveTo } from './panes/Workspace';
import { closePane, emptyLayout, openPane, stacks, type Layout } from './panes/model';
import { openPage } from './panes/open';
import { closeSpace, enterSpace, newSpace, READING, renameSpace, useSpaces, type SpaceList } from './panes/spaces';
import { loadLayout, saveLayout } from './panes/store';
import { SpaceCards, SpacesMenu, SpaceTiles, useAreaAspect, type SpaceView } from './spaces';
import type { BringPage } from './panes/zones';

const PAGES: ReadonlySet<string> = new Set(['home', 'workbook', 'cards', 'sheet', 'spaces']);
const TITLES: Record<string, string> = {
  home: 'Home', workbook: 'Workbook', cards: 'Review cards', sheet: 'Formula sheet', spaces: 'Spaces',
  continuity: 'Continuity', eps: 'Epsilon–delta', practice: 'Chapter practice', 'one-sided': 'One-sided limits', limit: 'What a limit is',
  numbers: 'Numbers and sets', functions: 'Functions', rate: 'Rate of change', past: 'Past paper 2024', summary: 'Limits, in one page',
};
const ICONS: Record<string, ComponentType> = { home: Home, cards: Copy, workbook: NotebookPen, sheet: ClipboardList, spaces: LayoutGrid };
const NOW = Date.UTC(2026, 10, 19, 12);
const KEY = 'spaces-fixture/v2';
const keyOf = (id: string) => `${KEY}/${id}`;

/** Continuity and Epsilon–delta as tabs, the practice beside them. */
function reading(): Layout {
  let l = openPane(emptyLayout(), 'eps', TITLES.eps).layout;
  const main = stacks(l.root)[0].id;
  l = openPane(l, 'continuity', TITLES.continuity, { kind: 'stack', stackId: main }).layout;
  l = openPane(l, 'practice', TITLES.practice, { kind: 'beside', nodeId: main, side: 'right', share: 0.38 }).layout;
  return l;
}
function exam(): Layout {
  let l = openPane(emptyLayout(), 'past', TITLES.past).layout;
  l = openPane(l, 'summary', TITLES.summary, { kind: 'beside', nodeId: stacks(l.root)[0].id, side: 'right', share: 0.4 }).layout;
  return l;
}
const FIRST: Record<string, () => Layout> = { [READING]: reading, 'space-1': exam };
const firstList = (): SpaceList => ({ spaces: [{ id: READING, name: 'Reading', used: NOW }, { id: 'space-1', name: 'Exam prep', used: NOW - 2 * 86400000 }], current: READING });

// ------------------------------------------------------------------ the pages

function PageView({ kind, cards }: { kind: string; cards: ReactNode }) {
  if (kind === 'spaces') {
    return (
      <article className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-6 py-7 @[640px]/pane:px-10">
        <header className="grid gap-2">
          <span className="ui-caption">DEMO 100</span>
          <h1 className="text-3xl font-semibold tracking-tight">Spaces</h1>
          <p className="text-[15px] leading-7 text-muted-foreground">Each space keeps its own layout of lessons. Open one here or from the sidebar's tiles (Ctrl+Alt+← →), and drag lessons or pages into it from the sidebar.</p>
        </header>
        {cards}
      </article>
    );
  }
  if (kind === 'cards') {
    return (
      <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-6 py-7 @[640px]/pane:px-10">
        <span className="ui-caption">DEMO 100 · Review</span>
        <h1 className="text-3xl font-semibold tracking-tight">Review cards</h1>
        <span className="text-sm"><b className="text-base">8</b> due (2 new) · 24 cards</span>
        <div className="grid gap-5 rounded-xl border border-l-4 border-l-info bg-card p-6">
          <span className="ui-caption">Definition · New</span>
          <span className="text-xl font-semibold tracking-tight"><span className="text-muted-foreground">State the definition:</span> Continuity</span>
          <Button variant="outline" className="h-10"><Eye /> Turn the card</Button>
        </div>
      </article>
    );
  }
  if (kind === 'workbook') {
    return (
      <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-6 py-7 @[640px]/pane:px-10">
        <span className="ui-caption">DEMO 100 · Workbook</span>
        <h1 className="text-3xl font-semibold tracking-tight">Workbook</h1>
        <Question number={4} prompt="Let f(x) = (x² − 4)/(x − 2) for x ≠ 2, and f(2) = 3. What happens at x = 2?"
          options={[{ id: 'a', text: 'f is continuous at 2' }, { id: 'b', text: 'The limit is 4, so it is removable' }, { id: 'c', text: 'The limit does not exist' }]}
          answer="b" hint="Compare the limit at 2 with f(2)." explanation="f(2) = 3 but the limit is 4." />
      </article>
    );
  }
  return (
    <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-6 py-7 @[640px]/pane:px-10">
      <span className="ui-caption">{PAGES.has(kind) ? 'DEMO 100' : 'Chapter 02 · Limits'}</span>
      <h1 className="text-3xl font-semibold tracking-tight">{kind === 'home' ? 'Calculus, illustrated' : TITLES[kind] ?? kind}</h1>
      <p className="text-[15px] leading-7 text-muted-foreground">A function is continuous at a point when nothing surprising happens there: the value is exactly what the nearby values were heading towards.</p>
      <MathCard kind="definition" name="Continuity" latex="\lim_{x\to a} f(x) = f(a)">f is <b>continuous at a</b> when f(a) is defined, the limit exists, and they agree.</MathCard>
    </article>
  );
}

// ------------------------------------------------------------------ the screen

function Spaces({ use, start = null, collapsed: startCollapsed = false }: { use: <T>(c: string, k: string) => T; start?: string | null; collapsed?: boolean }) {
  const [list, setList] = useSpaces(KEY, { persist: false, initial: firstList });
  const space = list.spaces.find((s) => s.id === list.current);
  const [layout, apply, history] = usePaneLayout(keyOf(list.current), { initial: FIRST[list.current] ?? emptyLayout });
  const [page, setPage] = useState<string | null>(start);
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const bring = useRef<Bring | null>(null);
  const layoutOf = (id: string) => (id === list.current ? layout : loadLayout(keyOf(id)).layout.root ? loadLayout(keyOf(id)).layout : (FIRST[id]?.() ?? emptyLayout()));
  const views: SpaceView[] = list.spaces.map((s) => {
    const l = layoutOf(s.id);
    return { id: s.id, name: s.name, used: s.used, icon: s.id === READING ? BookOpen : LayoutGrid, count: Object.keys(l.panes).length, layout: l };
  });
  const openSpace = (id: string) => { setList((l) => enterSpace(l, id, NOW)); setPage(null); };
  const putIn = (p: BringPage, to: string | null) => {
    const made = to ? null : newSpace(list, NOW);
    const target = to ?? made!.id;
    saveLayout(keyOf(target), openPage(layoutOf(target), p.kind, p.title, 'tab', { color: p.color }).layout);
    setList(() => enterSpace(made ? made.list : list, target, NOW));
    setPage(null);
  };
  const moveTo: MoveTo = {
    places: list.spaces.filter((s) => s.id !== list.current).map((s) => ({ id: s.id, name: s.name })),
    onMove: (paneId, to) => { const pane = layout.panes[paneId]; if (!pane) return; apply((l) => closePane(l, paneId)); putIn(pane, to); },
    onBring: putIn,
  };
  const open = (kind: string, as: OpenAs) => {
    if (as === 'window') { window.open(window.location.href, '_blank', 'noopener'); return; }
    if (as === 'space') { putIn({ kind, title: TITLES[kind] ?? kind }, null); return; }
    if (PAGES.has(kind) && as === 'here') { setPage(kind); return; }
    setPage(null);
    apply((l) => openPage(l, kind, TITLES[kind] ?? kind, as === 'tab' ? 'tab' : as === 'beside' ? 'beside' : 'go'));
  };
  const active = layout.activePane ? layout.panes[layout.activePane] : undefined;
  const [areaRef, aspect] = useAreaAspect();
  const tiles = { aspect, spaces: views, current: page ? null : list.current, last: list.current, onSpace: openSpace, onManage: () => setPage('spaces'), managing: page === 'spaces' };
  const sidebar: SidebarProps = {
    course: use<SidebarProps['course']>('data/course', 'course'), links: use<SidebarLink[]>('data/course', 'links'), chapters: use<SidebarChapter[]>('data/course', 'chapters'),
    current: page ? undefined : active?.kind, currentLink: page && page !== 'spaces' ? page : undefined,
    collapsed, onCollapsedChange: setCollapsed, user: { name: 'Sam', role: 'Admin · 3 classes' },
    onOpen: (id, as) => open(id, as), onLink: (id, as) => open(id, as),
    onDragStart: (item, e) => { const kind = 'topic' in item ? item.topic : item.link; bring.current?.({ kind, title: TITLES[kind] ?? kind }, e); },
    spaces: (rail) => (rail ? <SpacesMenu {...tiles} /> : <SpaceTiles {...tiles} />),
    dropToRemove: page ? undefined : `Remove from ${space?.name ?? 'this space'}`,
  };
  const cards = (
    <SpaceCards spaces={views} aspect={aspect} now={NOW} onSpace={openSpace} onNew={() => { const made = newSpace(list, NOW, { open: false }); setList(() => made.list); return made.id; }}
      onRename={(id, name) => setList((l) => renameSpace(l, id, name))} onDelete={(id) => { saveLayout(keyOf(id), emptyLayout()); setList((l) => closeSpace(l, id)); }}
      icon={(p) => { const I = ICONS[p.kind]; return I ? <I /> : undefined; }} />
  );
  const crumb = page ? ['DEMO 100', TITLES[page]] : [space?.name ?? 'Space', ...(active ? [active.title] : [])];
  return (
    <div className="flex h-[860px] w-[1440px] overflow-hidden border">
      <Sidebar {...sidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 text-[13px] text-muted-foreground">
          {crumb.map((c, i) => <span key={`${i}${c}`} className={i === crumb.length - 1 ? 'font-medium text-foreground' : undefined}>{i > 0 && <span aria-hidden className="mr-2">›</span>}{c}</span>)}
        </div>
        <div ref={areaRef} className="relative min-h-0 flex-1">
          <div className="h-full" inert={!!page} aria-hidden={page ? true : undefined}>
            <Workspace key={list.current} layout={layout} apply={apply} history={history} label={space?.name ?? 'Space'} moveTo={moveTo}
              bring={bring} onBringStart={() => setPage(null)}
              dormant={!!page}
              icon={(p) => { const I = ICONS[p.kind]; return I ? <I /> : undefined; }}
              render={(pane) => <PageView kind={pane.kind} cards={cards} />} />
          </div>
          {page && (
            <div data-page={page} className="pane-body absolute inset-0 z-10 overflow-y-auto bg-background">
              <div className="pane-page"><PageView kind={page} cards={cards} /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default defineFixtures({
  component: 'derived/spaces',
  title: 'Spaces (the mockup, live)',
  deps: ['data/course'],
  frame: { width: 1460 },
  cases: {
    'a space': ({ use }) => <Spaces use={use} />,
    'the Workbook page': ({ use }) => <Spaces use={use} start="workbook" />,
    'the Spaces page': ({ use }) => <Spaces use={use} start="spaces" />,
    'collapsed': ({ use }) => <Spaces use={use} collapsed />,
  },
});
