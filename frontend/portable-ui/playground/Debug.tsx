// The top bar's Debug button and its dialog: switches that take the library's shortcuts out (frames
// skipped off screen, motion), checks that show what it does unseen (layout shifts), and the
// playground's own storage. Each setting is
// saved in this browser and applied by debug-settings.ts.
import * as React from 'react';
import { Bug, RotateCcw } from 'lucide-react';
import { Button } from '../src/base/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../src/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../src/base/select';
import { Switch } from '../src/base/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '../src/base/tooltip';
import {
  changedFromDefaults, debugSettings, pendingReload, playgroundStorage, resetPlaygroundStorage, useDebugSettings,
  type DebugSettings, type Motion,
} from './debug-settings';
import './debug.css';

const set = (patch: Partial<DebugSettings>) => debugSettings.set(patch);

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);
export function DebugButton({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const s = useDebugSettings();
  const changed = changedFromDefaults(s).length;
  return (
    <Dialog defaultOpen={defaultOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Debug options" data-testid="debug-button" className="relative">
              <Bug />
              {changed > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-warn" />}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Debug{changed ? ` · ${changed} changed` : ''}</TooltipContent>
      </Tooltip>
      <DialogContent className="flex max-h-[min(760px,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4">
          <DialogTitle>Debug</DialogTitle>
          <DialogDescription>Saved in this browser. Changes apply at once unless marked “on reload”.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3"><DebugPanel /></div>
        <DebugFooter />
      </DialogContent>
    </Dialog>
  );
}

function DebugFooter() {
  const s = useDebugSettings();
  const pending = pendingReload(s).length > 0;
  return (
    <DialogFooter className="border-t px-5 py-3">
      <Button variant="ghost" size="sm" disabled={changedFromDefaults(s).length === 0} onClick={() => debugSettings.reset()}><RotateCcw />Reset to defaults</Button>
      <Button variant={pending ? 'default' : 'outline'} size="sm" onClick={() => location.reload()}>{pending ? 'Reload to apply' : 'Reload'}</Button>
    </DialogFooter>
  );
}

/** Every option, by what it is about. */
export function DebugPanel() {
  const s = useDebugSettings();
  return (
    <div className="flex flex-col gap-5" data-testid="debug-panel">
      <Group title="Drawing">
        <Toggle k="skipOffscreen" s={s} title="Skip off-screen frames" detail="The browser neither lays out nor paints a widget frame out of view. Off: all of them, all the time." />
      </Group>
      <Group title="Motion">
        <Row title="Reduce motion" detail="As if the system asked for less motion: the library, the lessons and CSS all follow.">
          <Select value={s.motion} onValueChange={(v) => set({ motion: v as Motion })}>
            <SelectTrigger size="sm" aria-label="Reduce motion" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="reduce">Always</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Toggle k="slowMotion" s={s} title="Animations 5× slower" detail="Every CSS transition and animation, to watch one through." />
      </Group>
      <Group title="Checks">
        <Toggle k="layoutShifts" s={s} title="Outline layout shifts" detail="Each box that moves without being pressed: where it went, and (dashed) where it was, with a running score in the corner.">
          {!layoutShiftsSupported() && <p className="mt-1 text-xs text-warn">This browser does not report layout shifts (Chrome and Edge do).</p>}
        </Toggle>
      </Group>
      <Group title="Page">
        <Toggle k="helpers" s={s} title="Page helpers" detail="Press feedback, truncation tips and scroll fades." reload />
        <Storage />
        <Build />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ title, detail, reload = false, children, below }: { title: string; detail: React.ReactNode; reload?: boolean; children?: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {title}
            {reload && <span className="ml-2 rounded border px-1 py-px align-[1px] text-[10px] font-normal text-muted-foreground">on reload</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
        </div>
        {children && <div className="flex shrink-0 items-center gap-2 pt-0.5">{children}</div>}
      </div>
      {below}
    </div>
  );
}

type Flag = { [K in keyof DebugSettings]: DebugSettings[K] extends boolean ? K : never }[keyof DebugSettings];

function Toggle({ k, s, title, detail, reload, children }: { k: Flag; s: DebugSettings; title: string; detail: string; reload?: boolean; children?: React.ReactNode }) {
  return (
    <Row title={title} detail={detail} reload={reload} below={children}>
      <Switch checked={s[k]} onCheckedChange={(on) => set({ [k]: on })} aria-label={title} />
    </Row>
  );
}

function Storage() {
  const [keys, setKeys] = React.useState(playgroundStorage);
  React.useEffect(() => debugSettings.subscribe(() => setKeys(playgroundStorage())), []);
  const bytes = keys.reduce((n, k) => n + k.bytes, 0);
  return (
    <Row
      title="Playground storage"
      detail={<>{keys.length} keys, {kb(bytes)}: the theme you were on, the panes’ layout, the frames’ heights. <span className="font-mono">{keys.map(({ key }) => key).join(' · ')}</span></>}
    >
      <Button variant="outline" size="sm" onClick={resetPlaygroundStorage}>Forget and reload</Button>
    </Row>
  );
}

function Build() {
  const built = new Date(__PG_BUILT__).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return <Row title="Build" detail={<span className="font-mono">portable-ui {__PG_VERSION__}{__PG_COMMIT__ ? ` · ${__PG_COMMIT__}` : ''} · built {built}</span>} />;
}

// ------------------------------------------------------------------ layout shifts

type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] };
type Outline = { id: number; rect: DOMRectReadOnly; was?: boolean };
type Score = { count: number; total: number; last: string };

export const layoutShiftsSupported = () => typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('layout-shift');

/** A box that moved, in words: its tag and what names it (id, data-slot), or its first
 *  class when nothing does. */
function describe(node: Node | null): string {
  if (!(node instanceof Element)) return node?.nodeName.toLowerCase() ?? 'something';
  const names = [
    node.id && `#${node.id}`,
    node.getAttribute('data-slot') && `[${node.getAttribute('data-slot')}]`,
    node.getAttribute('data-part') && `[${node.getAttribute('data-part')}]`,
  ].filter(Boolean).join('');
  const cls = typeof node.className === 'string' ? node.className.split(/\s+/).find(Boolean) : undefined;
  return `${node.tagName.toLowerCase()}${names || (cls ? `.${cls}` : '')}`;
}

/** The score in the corner (its own text changing width is no shift of the page's). */
const ownBox = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest('[data-pg-shifts]') != null;

/** While on: every layout shift outlined where it happened, and the page's running score. */
export function LayoutShifts() {
  const [outlines, setOutlines] = React.useState<Outline[]>([]);
  const [score, setScore] = React.useState<Score>({ count: 0, total: 0, last: '' });
  React.useEffect(() => {
    if (!layoutShiftsSupported()) return;
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const seen = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as ShiftEntry[]) {
        const sources = e.sources.filter((src) => !ownBox(src.node));
        if (e.hadRecentInput || !sources.length) continue;
        const drawn: Outline[] = sources.flatMap((src) => [{ id: next++, rect: src.previousRect, was: true }, { id: next++, rect: src.currentRect }]);
        const last = sources.map((src) => describe(src.node)).join(', ');
        console.debug(`playground: layout shift ${e.value.toFixed(4)}`, sources.map((src) => src.node));
        setScore((sc) => ({ count: sc.count + 1, total: sc.total + e.value, last }));
        setOutlines((o) => [...o, ...drawn]);
        const ids = new Set(drawn.map((d) => d.id));
        const t = setTimeout(() => { timers.delete(t); setOutlines((o) => o.filter((d) => !ids.has(d.id))); }, 1600);
        timers.add(t);
      }
    });
    seen.observe({ type: 'layout-shift', buffered: false });
    return () => { seen.disconnect(); for (const t of timers) clearTimeout(t); };
  }, []);
  return (
    <>
      {outlines.map((o) => o.rect.width > 0 && o.rect.height > 0 && (
        <div key={o.id} className="pg-shift" data-was={o.was || undefined} style={{ left: o.rect.x, top: o.rect.y, width: o.rect.width, height: o.rect.height }} />
      ))}
      <div className="fixed bottom-3 left-3 z-[2147483647] flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border bg-background/95 py-1 pr-1 pl-2.5 text-xs shadow-md" data-testid="layout-shift-score" data-pg-shifts="">
        <span className="size-2 shrink-0 rounded-full bg-bad" aria-hidden />
        <span className="shrink-0 tabular-nums">{score.count} {score.count === 1 ? 'shift' : 'shifts'} · {score.total.toFixed(3)}</span>
        {score.last && <span className="min-w-0 truncate font-mono text-muted-foreground">{score.last}</span>}
        <Button variant="ghost" size="xs" onClick={() => setScore({ count: 0, total: 0, last: '' })}>Reset</Button>
      </div>
    </>
  );
}
