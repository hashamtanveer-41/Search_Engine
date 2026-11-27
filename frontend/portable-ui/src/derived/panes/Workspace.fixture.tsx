import { useEffect, useRef, useState } from 'react';
import { defineFixtures } from '../../fixture';
import { Button } from '../../base/button';
import { Callout } from '../widgets/callout';
import { MathCard } from '../widgets/blocks';
import { Workspace, type PaneInfo } from './Workspace';
import { openPage } from './open';
import { emptyLayout, openPane, stacks, type Layout } from './model';
import { usePaneLayout } from './store';

const TITLES: Record<string, string> = {
  continuity: 'Continuity', limits: 'Limits', ivt: 'Intermediate value', squeeze: 'Squeeze theorem', 'one-sided': 'One-sided limits',
  'limits-2': 'Limits', notes: 'My notes',
};
const CHAPTERS: Record<string, string> = { limits: 'Chapter 1', 'limits-2': 'Chapter 4' };

/** A page that reflows with its width: prose, KaTeX, callouts. */
function Page({ kind, info }: { kind: string; info: PaneInfo }) {
  if (kind === 'notes') {
    return (
      <article className="grid gap-3 px-6 py-7">
        <h1 className="text-2xl font-semibold tracking-tight">My notes</h1>
        <textarea data-notes aria-label="Notes" className="min-h-40 rounded-md border p-3 text-[15px]" onInput={(e) => info.setDirty(e.currentTarget.value !== '')} />
      </article>
    );
  }
  return (
    <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-6 py-7 @[640px]/pane:px-10">
      <h1 className="text-2xl font-semibold tracking-tight">{TITLES[kind] ?? kind}</h1>
      <p className="text-[15px] leading-7 text-muted-foreground">A function is continuous at a point when nothing surprising happens there: the value is exactly what the nearby values were heading towards.</p>
      <MathCard kind="definition" name="Continuity" latex="\lim_{x\to a} f(x) = f(a)">f is <b>continuous at a</b> when f(a) is defined, the limit exists, and they agree.</MathCard>
      <Callout purpose="warning">A limit existing at a does not make f continuous there: f(a) still has to match it.</Callout>
      <MathCard kind="theorem" name="Intermediate value" latex="f(a) < k < f(b) \implies \exists c \in (a,b):\ f(c) = k">If f is continuous on [a, b], it takes every value between f(a) and f(b).</MathCard>
    </article>
  );
}

/** Two lessons side by side and a third as a tab; kept in memory, so every shot starts the same. */
function start(): Layout {
  let l = openPane(emptyLayout(), 'continuity', TITLES.continuity).layout;
  const left = stacks(l.root)[0].id;
  l = openPane(l, 'limits', TITLES.limits, { kind: 'beside', nodeId: left, side: 'right', share: 0.5 }).layout;
  return openPane(l, 'ivt', TITLES.ivt, { kind: 'stack', stackId: left }).layout;
}

/** Three groups: the squeeze theorem alone on the right, to be dragged into the middle group. */
function three(): Layout {
  const l = start();
  return openPane(l, 'squeeze', TITLES.squeeze, { kind: 'beside', nodeId: stacks(l.root)[1].id, side: 'right', share: 0.33 }).layout;
}

/** A layout: three columns of two, on one grid, so the line across the middle is one
 *  line and the columns share evenly. */
function sixUp(): Layout {
  let l = openPane(emptyLayout(), 'continuity', TITLES.continuity).layout;
  const g = (i: number) => stacks(l.root)[i].id;
  l = openPane(l, 'squeeze', TITLES.squeeze, { kind: 'beside', nodeId: g(0), side: 'bottom', share: 0.5 }).layout;
  l = openPane(l, 'limits', TITLES.limits, { kind: 'edge', side: 'right', share: 0.34 }).layout;
  l = openPane(l, 'ivt', TITLES.ivt, { kind: 'beside', nodeId: g(0), side: 'right', share: 0.5 }).layout;
  l = openPane(l, 'one-sided', TITLES['one-sided'], { kind: 'beside', nodeId: stacks(l.root).find((s) => s.panes.length && l.panes[s.active].kind === 'squeeze')!.id, side: 'right', share: 0.5 }).layout;
  return openPane(l, 'notes', TITLES.notes, { kind: 'beside', nodeId: stacks(l.root).find((s) => l.panes[s.active].kind === 'limits')!.id, side: 'bottom', share: 0.5 }).layout;
}

/** Two pages called "Limits" (chapters 1 and 4), and a notes page to type in. */
function sameTitles(): Layout {
  let l = start();
  l = openPane(l, 'limits-2', TITLES['limits-2'], { kind: 'stack', stackId: stacks(l.root)[1].id }).layout;
  return openPane(l, 'notes', TITLES.notes, { kind: 'stack', stackId: stacks(l.root)[0].id }).layout;
}

const LAYOUTS = [{ label: 'Two side by side', make: start }, { label: 'One lesson', make: () => openPane(emptyLayout(), 'continuity', TITLES.continuity).layout }];

function Demo({ resize, links, layouts, phone, initial = start }: { resize?: boolean; links?: boolean; layouts?: boolean; phone?: boolean; initial?: () => Layout }) {
  const [layout, apply, history] = usePaneLayout('fixture', { persist: false, initial });
  const [width, setWidth] = useState(phone ? 390 : 1060);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // Stands in for dragging the window's edge: the area changes size every frame for 1.2 s.
  const shrink = () => {
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1200);
      setWidth(Math.round(1060 - 340 * Math.sin(p * Math.PI)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  return (
    <div className="grid gap-2">
      {resize && <Button size="sm" variant="outline" className="w-fit" data-resize onClick={shrink}>Resize the window</Button>}
      {links && (
        // Stands in for the sidebar: a plain click opens a preview, the next replaces it.
        <div className="flex gap-2">
          {['squeeze', 'one-sided'].map((k) => (
            <Button key={k} size="sm" variant="outline" data-link={k} onClick={() => apply((l) => openPage(l, k, TITLES[k]))}>{TITLES[k]}</Button>
          ))}
        </div>
      )}
      <div style={{ width, height: phone ? 760 : 560 }} className="border">
        <Workspace layout={layout} apply={apply} history={history} label="Notes" render={(pane, info) => <Page kind={pane.kind} info={info} />}
          detail={(pane) => CHAPTERS[pane.kind]} layouts={layouts ? LAYOUTS : undefined} />
      </div>
    </div>
  );
}

export default defineFixtures({
  component: 'derived/panes/Workspace',
  title: 'Panes',
  frame: { width: 1080 },
  cases: {
    'side by side': () => <Demo />,
    'window resize': () => <Demo resize />,
    'divider drag': () => <Demo />,
    'tab drag': () => <Demo />,
    'tab joins a group': () => <Demo initial={three} />,
    grid: () => <Demo initial={sixUp} />,
    'divider hover': () => <Demo />,
    fold: () => <Demo />,
    'pane menu': () => <Demo />,
    zoom: () => <Demo />,
    undo: () => <Demo />,
    'preview tabs': () => <Demo links />,
    'same titles and unsaved': () => <Demo initial={sameTitles} />,
    'alt held': () => <Demo />,
    keys: () => <Demo />,
    // Under 700px it is the phone's own layout: one page, the bar with "2 of 3", the sheet. No panes.
    phone: () => <Demo phone />,
    'nothing open': () => <Demo initial={() => openPane(emptyLayout(), 'limits', TITLES.limits).layout} layouts />,
  },
  play: {
    // Closing the last pane leaves the ways back: a layout, or reopen what just closed.
    'nothing open': [{ wait: 300 }, { click: '[aria-label="Close Limits"]' }, { wait: 1500 }, { click: '[data-reopen]' }, { wait: 1000 }],
    // Holding Alt: each key drawn on the pane it goes to; the split keys on the active card's edges.
    'alt held': [{ wait: 300 }, { keydown: 'Alt' }, { wait: 1500 }, { keyup: 'Alt' }, { wait: 300 }],
    // Alt+] to the right pane, Alt+\\ splits it, Alt+W closes the split, Alt+Shift+T brings it back.
    keys: [{ wait: 400 }, { press: 'Alt+ArrowRight' }, { wait: 800 }, { press: 'Alt+Backslash' }, { wait: 900 }, { press: 'Alt+KeyW' }, { wait: 900 }, { press: 'Alt+Shift+KeyT' }, { wait: 900 }, { press: 'Alt+Enter' }, { wait: 900 }, { press: 'Alt+Enter' }, { wait: 800 }],
    // A click opens an italic preview, the next click shows its page in the same tab (it glows),
    // a double-click keeps it, and the click after that opens a new preview beside it.
    'preview tabs': [{ wait: 300 }, { click: '[data-link=squeeze]' }, { wait: 1000 }, { click: '[data-link=one-sided]' }, { wait: 1000 },
      { dblclick: '[data-tab-bar] [data-preview] [role=tab]' }, { wait: 600 }, { click: '[data-link=squeeze]' }, { wait: 1200 }],
    // Typing in the notes puts a dot in place of its tab's ×.
    'same titles and unsaved': [{ wait: 300 }, { type: ['[data-notes]', 'Remember the squeeze theorem'] }, { wait: 900 }],
    // A drag, then Ctrl+Z takes it back in one step and Ctrl+Shift+Z puts it back again.
    undo: [{ wait: 300 }, { drag: { from: '[data-divider]', by: [-300, 0], ms: 900 } }, { wait: 700 }, { press: 'Control+z' }, { wait: 900 }, { press: 'Control+Shift+z' }, { wait: 900 }],
    // Past the smallest size the left group folds into a strip; a click on the strip opens it again.
    fold: [{ wait: 300 }, { drag: { from: '[data-divider]', by: [-520, 0], ms: 1600 } }, { wait: 900 }, { click: '[data-strip]' }, { wait: 900 }],
    'pane menu': [{ wait: 300 }, { click: '[aria-label^="Pane actions"]' }, { wait: 1200 }],
    zoom: [{ wait: 300 }, { click: '[aria-label^="Zoom"]' }, { wait: 900 }, { press: 'Escape' }, { wait: 900 }],
    // The tip at the pointer, not the native title; Enter on the focused divider shares evenly.
    'divider hover': [{ wait: 300 }, { hover: '[data-divider]' }, { wait: 900 }],
    // Mid-resize the pages keep their old size (clipped) and the cards follow at once, no void.
    'window resize': [{ wait: 300 }, { click: '[data-resize]' }, { wait: 1600 }],
    // Pinned and dimmed while the divider moves, the live shares on it, one layout on release.
    'divider drag': [{ wait: 300 }, { drag: { from: '[data-divider]', by: [-260, 0], ms: 1400 } }, { wait: 800 }],
    'tab drag': [{ wait: 300 }, { drag: { from: '[data-tab-bar] [role=tab]', by: [620, 220], ms: 1600 } }, { wait: 800 }],
    // The lone right pane dropped into the middle group: a window inside that group, where it is now.
    'tab joins a group': [{ wait: 300 }, { drag: { from: '[data-tab-bar] >> nth=2 >> [role=tab]', to: '.pane-card >> nth=1', ms: 5000 } }, { wait: 900 }],
  },
});
