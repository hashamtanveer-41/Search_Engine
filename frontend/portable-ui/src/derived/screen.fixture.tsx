// The lesson screen, put together from the library: the sidebar, the top bar and the panes. This
// is the screen mockup, kept live: it changes when the components do.
import { useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Mark } from '../base/mark';
import { Callout } from './widgets/callout';
import { MathCard } from './widgets/blocks';
import { Question } from './widgets/question';
import { Sidebar, type SidebarChapter, type SidebarLink, type SidebarProps } from './sidebar';
import { usePaneLayout } from './panes/store';
import { Workspace } from './panes/Workspace';
import { collapseNode, emptyLayout, openPane, stacks, type Layout } from './panes/model';

const TITLES: Record<string, string> = {
  continuity: 'Continuity', eps: 'Epsilon–delta', practice: 'Chapter practice', 'one-sided': 'One-sided limits', review: 'Review sheet', past: 'Past paper 2024',
};

function Page({ kind }: { kind: string }) {
  if (kind === 'practice') {
    return (
      <article className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-4 px-6 py-7">
        <span className="ui-caption">Chapter 02 / Practice</span>
        <h1 className="text-2xl font-semibold tracking-tight">Check your understanding</h1>
        <Question number={3} prompt="Let f(x) = (x² − 4)/(x − 2) for x ≠ 2, and f(2) = 3. What happens at x = 2?"
          options={[{ id: 'a', text: 'f is continuous at 2' }, { id: 'b', text: 'The limit is 4, so it is removable' }, { id: 'c', text: 'The limit does not exist' }]}
          answer="b" hint="Compare the limit at 2 with f(2)." explanation="f(2) = 3 but the limit is 4." />
      </article>
    );
  }
  return (
    <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-6 py-7 @[640px]/pane:px-10">
      <span className="flex items-center gap-2 ui-caption">Topic 03 / 05 · Lecture 04<Mark size="sm" tone="info" icon={<BookOpen />} label="Reading · 40%" detail="About 6 minutes left" side="right" /></span>
      <h1 className="text-3xl font-semibold tracking-tight">{TITLES[kind] ?? kind}</h1>
      <p className="text-[15px] leading-7 text-muted-foreground">A function is continuous at a point when nothing surprising happens there: the value is exactly what the nearby values were heading towards.</p>
      <MathCard kind="definition" name="Continuity" latex="\lim_{x\to a} f(x) = f(a)">f is <b>continuous at a</b> when f(a) is defined, the limit exists, and they agree.</MathCard>
      <Callout purpose="warning">A limit existing at a does not make f continuous there: f(a) still has to match it.</Callout>
      <MathCard kind="theorem" name="Intermediate value" latex="f(a) < k < f(b) \implies \exists c \in (a,b):\ f(c) = k">If f is continuous on [a, b], it takes every value between f(a) and f(b).</MathCard>
    </article>
  );
}

/** Continuity with Epsilon–delta behind it, the practice beside, and One-sided limits folded away. */
function lesson(): Layout {
  let l = openPane(emptyLayout(), 'one-sided', TITLES['one-sided']).layout;
  const folded = stacks(l.root)[0].id;
  l = openPane(l, 'eps', TITLES.eps, { kind: 'beside', nodeId: folded, side: 'right', share: 0.8 }).layout;
  const main = stacks(l.root)[1].id;
  l = openPane(l, 'continuity', TITLES.continuity, { kind: 'stack', stackId: main }).layout;
  l = openPane(l, 'practice', TITLES.practice, { kind: 'beside', nodeId: main, side: 'right', share: 0.42 }).layout;
  l = collapseNode(l, folded).layout;
  const cont = Object.values(l.panes).find((p) => p.kind === 'continuity')!.id;
  return { ...l, activePane: cont };
}

function Screen({ use, alt }: { use: <T>(c: string, k: string) => T; alt?: boolean }) {
  const [layout, apply, history] = usePaneLayout('screen-fixture', { persist: false, initial: lesson });
  // The sidebar collapses and expands for real, beside the panes, as in the app.
  const [collapsed, setCollapsed] = useState(false);
  const sidebar: SidebarProps = {
    course: use<SidebarProps['course']>('data/course', 'course'), links: use<SidebarLink[]>('data/course', 'links'), chapters: use<SidebarChapter[]>('data/course', 'chapters'),
    current: 'continuity', collapsed, onCollapsedChange: setCollapsed, onOpen: () => undefined, user: { name: 'Sam', role: 'Admin · 3 classes' },
  };
  return (
    <div className="flex h-[860px] w-[1440px] overflow-hidden border" data-alt={alt || undefined}>
      <Sidebar {...sidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3 text-[13px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2 truncate">Limits<span aria-hidden>›</span><b className="font-medium text-foreground">Continuity</b></span>
          <span className="ml-auto"><Mark tone="ok" icon={<RefreshCw />} label="Synced" detail="Progress saved to your account" side="bottom" /></span>
        </div>
        <div className="min-h-0 flex-1">
          <Workspace layout={layout} apply={apply} history={history} label="Notes" render={(pane) => <Page kind={pane.kind} />} detail={() => 'Chapter 02'} />
        </div>
      </div>
    </div>
  );
}

export default defineFixtures({
  component: 'derived/screen',
  title: 'Lesson screen (the mockup, live)',
  deps: ['data/course'],
  frame: { width: 1460 },
  cases: {
    desktop: ({ use }) => <Screen use={use} />,
    'alt held': ({ use }) => <Screen use={use} alt />,
  },
  play: {
    'alt held': [{ wait: 500 }, { keydown: 'Alt' }, { wait: 900 }],
  },
});
