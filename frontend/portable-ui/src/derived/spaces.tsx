// Spaces, drawn (; the model is panes/spaces.ts): the sidebar's tiles, one square
// for each space with a map of its panes and a gear that opens the Spaces page, and that page's
// cards. Ctrl+Alt+← and → step through the spaces and Ctrl+Alt+1–9 opens one, from anywhere.
import * as React from 'react';
import { Check, ChevronDown, LayoutGrid, Pencil, Plus, Settings, SquareDashed, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '../base/button';
import { InlineField } from '../base/inline-field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../base/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../base/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../base/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../base/tooltip';
import { cn } from '../lib/utils';
import { reducedMotion } from '../lib/motion';
import { keyName, type Combo } from '../keys/combo';
import { computeGeometry, REST } from './panes/geometry';
import { PHONE_QUERY } from './panes/Workspace';
import { colorOf, stacks, type Layout, type Pane } from './panes/model';

/** A space as the tiles and the cards show it. */
export interface SpaceView {
  id: string;
  name: string;
  icon: LucideIcon;
  /** How many pages it holds. */
  count: number;
  /** When it was last open (ms). */
  used: number;
  layout: Layout;
}

// ------------------------------------------------------------------ the keys

/** The keys that step through the spaces or open one, and which. */
export function spaceKeyOf(e: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>): { step: number } | { index: number } | null {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey) return null;
  if (e.key === 'ArrowRight') return { step: 1 };
  if (e.key === 'ArrowLeft') return { step: -1 };
  const digit = /^Digit([1-9])$/.exec(e.code);
  return digit ? { index: Number(digit[1]) - 1 } : null;
}

/** Ctrl+Alt+arrows and Ctrl+Alt+1–9 open a space, from anywhere on the page. */
function useSpaceKeys(ids: string[], current: string | null, onSpace: (id: string) => void) {
  const latest = React.useRef({ ids, current, onSpace });
  latest.current = { ids, current, onSpace };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = spaceKeyOf(e);
      if (!k) return;
      const { ids: all, current: on, onSpace: open } = latest.current;
      const i = Math.max(0, all.indexOf(on ?? ''));
      const to = 'step' in k ? all[(((i + k.step) % all.length) + all.length) % all.length] : all[k.index];
      if (!to) return;
      e.preventDefault();
      open(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// ------------------------------------------------------------------ a space's map

/** A space drawn small, laid out at the map's own size: each group in its front page's colour, with
 *  that page's icon when there is room for it, and how many tabs it holds when that is two or more
 *. `room` is the space round and between the boxes. */
export function SpaceMap({ layout, icon, w = 240, h = 112, room = 4, mark, ring, animate = false }: {
  layout: Layout; icon?(pane: Pane): React.ReactNode; w?: number; h?: number; room?: number;
  /** A pane to point out: only its box takes its colour, the others are grey. */
  mark?: string;
  /** A pane ringed, the others keeping their colours (the active one, in a shortcut acted out). */
  ring?: string;
  /** Boxes move to a new layout and new ones fade in, rather than jumping (shortcuts/); the map as
   *  first drawn is drawn at once. */
  animate?: boolean;
}) {
  const drawn = React.useRef(false);
  React.useEffect(() => { drawn.current = true; }, []);
  const animating = React.useRef(animate);
  animating.current = animate;
  // A box that appears after the map was first drawn, while it animates (a split's new pane).
  const appear = React.useCallback((el: HTMLSpanElement | null) => {
    if (el && drawn.current && animating.current && !reducedMotion()) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }, []);
  const geo = computeGeometry(layout.root, { x: 0, y: 0, w, h }, { ...REST, gap: room, inset: room, header: 0, strip: room * 2 });
  const groups = new Map(stacks(layout.root).map((s) => [s.id, s]));
  const boxes = [
    ...[...geo.stacks.values()].map((s) => ({ id: s.id, rect: s.card, front: groups.get(s.id)?.active, count: groups.get(s.id)?.panes.length ?? 0, panes: groups.get(s.id)?.panes ?? [] })),
    ...[...geo.strips.values()].map((s) => ({ id: s.id, rect: s.rect, front: s.front, count: s.panes.length, panes: s.panes })),
  ];
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div aria-hidden data-slot="space-map" data-animate={animate || undefined} className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }}>
      {boxes.map((b) => {
        const marked = mark !== undefined && b.panes.includes(mark);
        const pane = marked ? layout.panes[mark!] : mark !== undefined ? undefined : b.front ? layout.panes[b.front] : undefined;
        const roomy = b.rect.w >= 24 && b.rect.h >= 24;
        const many = b.count >= 2 && b.rect.w >= 9 && b.rect.h >= 9;
        return (
          <span key={b.id} ref={appear} data-color={pane ? colorOf(pane) : undefined} data-tabs={many ? b.count : undefined} data-marked={marked || undefined}
            data-ringed={(ring !== undefined && b.front === ring) || undefined}
            className="absolute flex items-center justify-center gap-1 rounded-[3px] [&_svg]:size-4"
            style={{ left: pct(b.rect.x, w), top: pct(b.rect.y, h), width: pct(b.rect.w, w), height: pct(b.rect.h, h), color: 'var(--pc)', background: 'var(--ps, var(--muted))', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--pc, var(--border)) 45%, transparent)' }}>
            {pane && icon && roomy ? icon(pane) : null}
            {many && <span className={cn('font-mono leading-none font-semibold tabular-nums', roomy ? 'text-[11px]' : 'text-[9px]')}>{b.count}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** The pane area's width over its height when the app does not say: a laptop's, less the sidebar. */
export const AREA_ASPECT = 1.6;
/** A map's width and height for `aspect` (the pane area's shape, so the map is the layout's),
 *  `across` wide or, with `tall`, that tall. Kept between a tall phone and a wide screen. */
export function mapSize(aspect: number, across: number, tall = false): { w: number; h: number } {
  const a = Math.min(3, Math.max(0.5, Number.isFinite(aspect) && aspect > 0 ? aspect : AREA_ASPECT));
  return tall ? { w: Math.round(across * a), h: across } : { w: across, h: Math.round(across / a) };
}

/** A ref for the pane area, and its width over its height as it is now (it follows the window and
 *  the sidebar): the maps are drawn in that shape. */
export function useAreaAspect(): [React.RefCallback<HTMLElement>, number] {
  const [aspect, setAspect] = React.useState(AREA_ASPECT);
  const observer = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setAspect(Math.round((r.width / r.height) * 100) / 100); };
    observer.current = new ResizeObserver(read);
    observer.current.observe(el);
    read();
  }, []);
  return [ref, aspect];
}

// ------------------------------------------------------------------ where a page is open

/** A page open in a space: which space, and which of its panes. */
export interface SpaceSpot { space: string; name: string; layout: Layout; pane: string }

/** Where a lesson or a page is open, beside its row in the sidebar: one small icon
 *  in its pane's colour, its tooltip naming the space, a click opening it there; open in more than
 *  one space, "+N" beside it opens a menu of them all to pick from. */
export function SpaceSpots({ spots, onSpot }: { spots: SpaceSpot[]; onSpot(spot: SpaceSpot): void }) {
  if (!spots.length) return null;
  const first = spots[0];
  const colour = (s: SpaceSpot) => { const pane = s.layout.panes[s.pane]; return pane ? colorOf(pane) : undefined; };
  return (
    <TooltipProvider delayDuration={200}>
      <span data-slot="space-spots" className="flex shrink-0 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" data-spot={first.space} data-color={colour(first)} aria-label={`In ${first.name}, open it there`} onClick={(e) => { e.stopPropagation(); onSpot(first); }}
              className="relative grid size-5 place-items-center rounded-[5px] text-[var(--pc,var(--muted-foreground))] outline-none hover:bg-accent ui-focus pointer-coarse:size-9 pointer-coarse:after:absolute pointer-coarse:after:-inset-1">
              <LayoutGrid aria-hidden className="size-3.5 pointer-coarse:size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">In {first.name}</TooltipContent>
        </Tooltip>
        {spots.length > 1 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button type="button" data-spot-more aria-label={`In ${spots.length} spaces: pick one`} onClick={(e) => e.stopPropagation()}
                    className="h-5 rounded-[5px] px-1 font-mono text-[10px] font-semibold text-muted-foreground outline-none hover:bg-accent data-[state=open]:bg-accent ui-focus">+{spots.length - 1}</button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">In {spots.map((s) => s.name).join(', ')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="right" align="start" className="min-w-44" data-spots-menu>
              {spots.map((s) => (
                <DropdownMenuItem key={s.space} onSelect={() => onSpot(s)}>
                  <i aria-hidden data-color={colour(s)} className="size-2 shrink-0 rounded-full bg-[var(--pc,var(--muted-foreground))]" />
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </TooltipProvider>
  );
}

// ------------------------------------------------------------------ the sidebar's tiles

/** A tile with a tab held over it (panes/useTabDrag.ts: a tab dropped there moves to that space). */
const DROP_OVER = 'data-[drop-over]:shadow-[0_0_0_2px_var(--info)] data-[drop-over]:bg-info-soft';

export interface SpaceTilesProps {
  spaces: SpaceView[];
  /** The space showing; null while a page is (no tile is ringed then). */
  current: string | null;
  /** The space the panes are in, even while a page shows over them: the keys step from it. */
  last: string;
  onSpace(id: string): void;
  /** The gear: the Spaces page. */
  onManage(): void;
  /** The Spaces page is showing. */
  managing?: boolean;
  /** The collapsed sidebar: one column. */
  column?: boolean;
  /** The pane area's width over its height: each map is drawn in that shape. */
  aspect?: number;
}

export function SpaceTiles({ spaces, current, last, onSpace, onManage, managing, column, aspect = AREA_ASPECT }: SpaceTilesProps) {
  // As tall as the row has room for; as wide as the pane area's shape makes that.
  const size = mapSize(aspect, 30, true);
  useSpaceKeys(spaces.map((s) => s.id), current ?? last, onSpace);
  return (
    <div data-slot="space-tiles" role="group" aria-label="Spaces" className={cn('flex min-w-0 items-center gap-1', column ? 'flex-col' : 'w-full')}>
      {/* The tiles take the row, so the gear is always at its right end. */}
      <div className={cn('flex min-w-0 items-center gap-1.5 pointer-coarse:gap-2', column ? 'flex-col' : 'flex-1 overflow-x-auto px-0.5 py-1 [scrollbar-width:none]')}>
        {spaces.map((s, i) => {
          const on = s.id === current;
          const pages = Object.values(s.layout.panes).map((p) => p.title);
          return (
            <button key={s.id} type="button" data-space={s.id} aria-current={on ? 'page' : undefined} onClick={() => onSpace(s.id)}
              aria-label={`${s.name}, ${s.count} ${s.count === 1 ? 'page' : 'pages'}`}
              title={`${s.name}${pages.length ? `: ${pages.join(', ')}` : ' (empty)'}${i < 9 ? `\n${keyName(`Ctrl+Alt+${i + 1}` as Combo)}` : ''}`}
              data-pane-drop={on ? undefined : s.id} data-pane-drop-label={on ? undefined : `Move to ${s.name}`}
              className={cn('grid h-10 shrink-0 place-items-center rounded-lg border bg-background p-[3px] outline-none transition-[box-shadow,background-color] ui-focus pointer-coarse:h-11 pointer-coarse:min-w-11', DROP_OVER,
                on ? 'border-info shadow-[0_0_0_1px_var(--info)]' : 'hover:border-foreground/30')}>
              {s.count
                ? <span className="block" style={{ width: size.w }}><SpaceMap layout={s.layout} w={size.w} h={size.h} room={2} /></span>
                // Empty: a dashed frame, not the grid that marks where a page is open.
                : <span className="grid place-items-center" style={{ width: size.w, height: size.h }}><SquareDashed aria-hidden className="size-4 text-muted-foreground" /></span>}
            </button>
          );
        })}
        {/* One space alone: its name and how many pages it has beside its tile, so the row is not bare. */}
        {spaces.length === 1 && !column && (
          // Its name opens it too (the tile is named for screen readers already).
          <button type="button" tabIndex={-1} aria-hidden onClick={() => onSpace(spaces[0].id)} className="grid min-w-0 self-stretch content-center text-left leading-tight outline-none">
            <span className="truncate text-[13px] font-medium">{spaces[0].name}</span>
            <span className="truncate text-xs text-muted-foreground">{spaces[0].count} {spaces[0].count === 1 ? 'page' : 'pages'}</span>
          </button>
        )}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Manage spaces" title="Manage spaces" aria-current={managing ? 'page' : undefined} onClick={onManage}
        className={cn('shrink-0 text-muted-foreground', managing && 'bg-info-soft text-info hover:bg-info-soft')}><Settings /></Button>
    </div>
  );
}

// ------------------------------------------------------------------ the collapsed sidebar's menu

/** The collapsed sidebar has no room for the tiles: one spaces icon, opening a menu with Manage
 *  spaces on top and the spaces under it. */
export function SpacesMenu({ spaces, current, last, onSpace, onManage, managing, aspect = AREA_ASPECT }: Omit<SpaceTilesProps, 'column'>) {
  const size = mapSize(aspect, 22, true);
  useSpaceKeys(spaces.map((s) => s.id), current ?? last, onSpace);
  const showing = current ? spaces.find((s) => s.id === current) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" data-spaces-menu="" aria-label={showing ? `Spaces, ${showing.name} open` : 'Spaces'} title="Spaces"
          className={cn('relative h-[34px] w-10 shrink-0 rounded-lg data-[state=open]:bg-accent', (current || managing) && 'bg-info-soft hover:bg-info-soft')}>
          <LayoutGrid aria-hidden />
          {spaces.length > 1 && <span aria-hidden className="absolute right-1 bottom-0.5 font-mono text-[10px] font-semibold text-muted-foreground">{spaces.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-64">
        <DropdownMenuItem onSelect={onManage} className="font-medium"><Settings aria-hidden />Manage spaces</DropdownMenuItem>
        <DropdownMenuSeparator />
        {spaces.map((s) => (
          <DropdownMenuItem key={s.id} data-space={s.id} aria-current={s.id === current ? 'page' : undefined} onSelect={() => onSpace(s.id)}>
            <span aria-hidden className="grid h-7 shrink-0 place-items-center rounded-md border bg-background p-[2px]">
              {s.count
                ? <span className="block" style={{ width: size.w }}><SpaceMap layout={s.layout} w={size.w} h={size.h} room={2} /></span>
                : <SquareDashed className="size-3.5 text-muted-foreground" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{s.count}</span>
            {s.id === current ? <Check aria-hidden className="size-4" /> : <span className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------------ the phone's spaces

/** The spaces on a phone, which has none in its sidebar: the space's name in the
 *  top bar, opening a sheet from the bottom with Manage spaces on top and the spaces under it. */
export function SpacesSheet({ spaces, current, onSpace, onManage, aspect = AREA_ASPECT }: {
  spaces: SpaceView[]; current: string; onSpace(id: string): void; onManage(): void; aspect?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const showing = spaces.find((s) => s.id === current);
  const size = mapSize(aspect, 26, true);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" data-spaces-sheet aria-label={`${showing?.name ?? 'Space'}: your spaces`}
          className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 font-medium text-foreground outline-none ui-focus pointer-coarse:min-h-11 pointer-coarse:px-2">
          <span className="truncate">{showing?.name ?? 'Spaces'}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[80dvh] gap-0 rounded-t-2xl p-0">
        <SheetTitle className="px-4 pt-4 pb-2 text-base">Spaces</SheetTitle>
        <ul className="grid gap-0.5 overflow-y-auto px-2 pb-5">
          <li>
            <button type="button" onClick={() => { setOpen(false); onManage(); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left text-sm font-medium outline-none hover:bg-accent ui-focus">
              <Settings aria-hidden className="size-4 text-muted-foreground" />Manage spaces
            </button>
          </li>
          {spaces.map((s) => (
            <li key={s.id}>
              <button type="button" data-space={s.id} aria-current={s.id === current ? 'page' : undefined} onClick={() => { setOpen(false); onSpace(s.id); }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-accent aria-[current=page]:bg-accent ui-focus">
                <span aria-hidden className="grid shrink-0 place-items-center rounded-md border bg-background p-[3px]">
                  {s.count
                    ? <span className="block" style={{ width: size.w }}><SpaceMap layout={s.layout} w={size.w} h={size.h} room={2} /></span>
                    : <span className="grid place-items-center" style={{ width: size.w, height: size.h }}><SquareDashed className="size-3.5 text-muted-foreground" /></span>}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.count} {s.count === 1 ? 'page' : 'pages'}</span>
                </span>
                {s.id === current && <Check aria-hidden className="size-4 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ the Spaces page's cards

/** "now", "12 min ago", "3 h ago", "yesterday", "4 days ago". */
export function usedAgo(used: number, now = Date.now()): string {
  const min = Math.floor((now - used) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export interface SpaceCardsProps {
  spaces: SpaceView[];
  icon?(pane: Pane): React.ReactNode;
  onSpace(id: string): void;
  onRename?(id: string, name: string): void;
  /** Deletes a space (asked first); not offered for the last one. */
  onDelete?(id: string): void;
  /** Makes a space; its id, when given back, has its card's name ready to type. */
  onNew?(): string | void;
  now?: number;
  /** The pane area's width over its height: each map is drawn in that shape. */
  aspect?: number;
}

/** Whether a modifier key (Shift, Option/Alt, Ctrl, Cmd) is held, from the keys and the pointer. */
function useModifierHeld() {
  const [held, setHeld] = React.useState(false);
  React.useEffect(() => {
    const read = (e: KeyboardEvent | PointerEvent) => setHeld(e.shiftKey || e.altKey || e.ctrlKey || e.metaKey);
    const off = () => setHeld(false);
    window.addEventListener('keydown', read);
    window.addEventListener('keyup', read);
    window.addEventListener('pointermove', read);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', read);
      window.removeEventListener('keyup', read);
      window.removeEventListener('pointermove', read);
      window.removeEventListener('blur', off);
    };
  }, []);
  return held;
}

/** How long a delete button stays armed for its second press. */
export const ARMED_MS = 3000;

/** Deletes on a second press: the first turns it into a confirm, a tooltip saying so; with a modifier
 *  key held it shows the confirm already and deletes at once. On a phone, where a
 *  second press on a small button is easy to miss, one tap asks in a dialog (20 Nov). */
function DeleteButton({ name, onDelete }: { name: string; onDelete(): void }) {
  const [armed, setArmed] = React.useState(false);
  const held = useModifierHeld();
  const phone = usePhone();
  const [asking, setAsking] = React.useState(false);
  // The tip open of itself (hover, focus), apart from armed.
  const [tip, setTip] = React.useState(false);
  const sure = armed || held;
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);
  if (phone) {
    return (
      <>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} className="text-muted-foreground" onClick={() => setAsking(true)}><Trash2 /></Button>
        <Dialog open={asking} onOpenChange={setAsking}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>The space and how its pages are laid out go. The lessons and pages in it stay in the course.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAsking(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { setAsking(false); onDelete(); }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  // Smooth: the tip keeps one box and crossfades its words and colour, the icon
  // crossfades with a little scale, and leaving lets the tip fade out as it was before it disarms
  // (it used to flip back to "Delete space" on its way out, two tips in a row).
  const look = armed ? 'confirm' : held ? 'held' : 'plain';
  const open = tip || armed;
  const [shown, setShown] = React.useState(look);
  React.useEffect(() => { if (open) setShown(look); }, [open, look]);
  const plain = shown === 'held' ? 'Delete, without asking' : 'Delete space';
  const swap = 'col-start-1 row-start-1 transition-[opacity,scale] duration-200 ease-out';
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip open={open} onOpenChange={setTip}>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" data-armed={sure || undefined} aria-label={armed ? `Confirm deleting ${name}` : `Delete ${name}`}
            className={cn('text-muted-foreground', sure && 'bg-bad-soft text-bad hover:bg-bad-soft hover:text-bad')}
            onClick={(e) => {
              if (armed || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) { setArmed(false); onDelete(); }
              else setArmed(true);
            }}
            onPointerLeave={() => { setTip(false); setArmed(false); }} onBlur={() => { setTip(false); setArmed(false); }}>
            <span className="grid place-items-center">
              <Trash2 aria-hidden className={cn(swap, sure && 'scale-50 opacity-0')} />
              <Check aria-hidden className={cn(swap, !sure && 'scale-50 opacity-0')} />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" tone={shown === 'plain' ? undefined : 'bad'} className="transition-[background-color,color] duration-200">
          <span className="grid justify-items-center">
            <span aria-hidden={shown === 'confirm' || undefined} className={cn(swap, shown === 'confirm' && 'opacity-0')}>{plain}</span>
            <span aria-hidden={shown !== 'confirm' || undefined} className={cn(swap, shown !== 'confirm' && 'opacity-0')}>Confirm deletion</span>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The Spaces page's cards. A page is showing, so none of them is current (page › space › pane,
 *  ). */
function usePhone(): boolean {
  const [phone, setPhone] = React.useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches);
  React.useEffect(() => {
    const list = window.matchMedia?.(PHONE_QUERY);
    if (!list) return;
    const change = () => setPhone(list.matches);
    change();
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, []);
  return phone;
}

export function SpaceCards({ spaces, icon, onSpace, onRename, onDelete, onNew, now = Date.now(), aspect = AREA_ASPECT }: SpaceCardsProps) {
  // On a phone each card is a row, a small map beside the name (a phone-shaped map
  // across the card filled the screen).
  const phone = usePhone();
  const size = phone ? mapSize(aspect, 72, true) : mapSize(aspect, 240);
  const [editing, setEditing] = React.useState<string | null>(null);
  // The space just made, being named: left with no name, it is removed.
  const [fresh, setFresh] = React.useState<string | null>(null);
  const deletable = !!onDelete && spaces.length > 1;
  return (
    <div data-slot="space-cards" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {spaces.map((s) => {
        const pages = Object.values(s.layout.panes).map((p) => p.title);
        const busy = editing === s.id;
        return (
          <div key={s.id} data-space={s.id} className={cn('group relative rounded-xl border bg-card p-3 transition-colors hover:border-info/50', phone ? 'flex items-center gap-3' : 'grid content-start gap-3')}>
            {!busy && <button type="button" onClick={() => onSpace(s.id)} aria-label={`Open the ${s.name} space`} className="absolute inset-0 z-[1] rounded-xl outline-none ui-focus" />}
            <div className="shrink-0 rounded-lg bg-background" style={phone ? { width: size.w } : undefined}>
              {s.count ? <SpaceMap layout={s.layout} icon={icon} w={size.w} h={size.h} />
                : <div className="grid place-items-center text-xs text-muted-foreground" style={{ aspectRatio: `${size.w} / ${size.h}` }}>Empty</div>}
            </div>
            <div className="grid min-w-0 flex-1 gap-1 px-1">
              <span className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
                <s.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {/* Over the card's open button, as its rename and delete are; on a phone a tap on the
                    name opens the space, and only the pencil renames (a 28 px field to aim at). */}
                <span className={cn('relative z-[2] flex min-w-0 flex-1', phone && !busy && 'pointer-events-none')}>
                  <InlineField fill value={s.name} label="Space name" className="font-semibold tracking-tight" editing={busy}
                    onEditingChange={(on) => { setEditing(on ? s.id : null); if (!on) setFresh(null); }} onChange={onRename ? (name) => onRename(s.id, name) : undefined}
                    onEmpty={s.id === fresh && deletable ? () => onDelete!(s.id) : undefined} />
                </span>
              </span>
              <span className="truncate text-[13px] text-muted-foreground">{pages.join(', ') || 'No lessons yet: open one from the sidebar, or drag it here'}</span>
              {/* Rename and delete on the card, as ghost buttons (not in a menu). */}
              <span className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
                <span className="mr-auto">{s.count} {s.count === 1 ? 'page' : 'pages'} · {usedAgo(s.used, now)}</span>
                {/* They stay while the name is edited: nothing moves. */}
                {(onRename || deletable) && (
                  <span className={cn('relative z-[2] -mr-1 flex items-center', phone ? 'gap-2' : 'gap-0.5')}>
                    {onRename && (
                      <Button variant="ghost" size={phone ? 'icon-sm' : 'icon-xs'} aria-label={`Rename ${s.name}`} title="Rename" aria-pressed={busy}
                        className={cn('text-muted-foreground', busy && 'bg-accent text-foreground')}
                        // While renaming, the field keeps the keyboard: a press here does not end it.
                        onMouseDown={(e) => { if (busy) e.preventDefault(); }}
                        onClick={() => { if (!busy) setEditing(s.id); }}><Pencil /></Button>
                    )}
                    {deletable && <DeleteButton name={s.name} onDelete={() => onDelete!(s.id)} />}
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })}
      {onNew && (
        <button type="button" onClick={() => { const id = onNew(); if (id) { setEditing(id); setFresh(id); } }} className={cn('grid place-items-center content-center gap-2 rounded-xl border border-dashed p-3', phone ? 'min-h-16' : 'min-h-40', 'text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/60 ui-focus')}>
          <Plus className="size-5" aria-hidden /><span className="font-medium text-foreground">New space</span><span className="text-xs">An empty layout to fill</span>
        </button>
      )}
    </div>
  );
}
