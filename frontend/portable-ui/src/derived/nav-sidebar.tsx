// The sidebar of the app's areas outside a class (My classes, Account, the admin panel): a
// mark, search, groups of links with an icon each and what is waiting there, and the person at the
// foot with settings and the compact toggle. Same frame and look as the reader's Sidebar; compact,
// it is a rail of icons with tooltips. A place inside the app with pages of its own (a project, like
// a class) uses it too: a way back above it (‹ Projects), its own mark, name and what it belongs to.
import * as React from 'react';
import { ChevronLeft, Columns2, PanelLeftClose, PanelLeftOpen, Search, Settings, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '../base/avatar';
import { Button } from '../base/button';
import { Count } from '../base/count';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../base/tooltip';
import { cn } from '../lib/utils';
import { Keys } from '../keys/Keys';
import { keyName } from '../keys/combo';
import { SpringWidth } from './spring-width';
import { LINK_ICON, linkRow, IconSwap } from './sidebar';

export interface NavItem { id: string; label: string; icon: LucideIcon; href: string; count?: number }
export interface NavGroup { label?: string; items: NavItem[] }

export interface NavSidebarProps {
  /** What the area is ("Admin", "Settings"), beside the mark. */
  title: string;
  /** Under the title: what the area is, or what it belongs to (a project's class, a link to it). */
  subtitle?: React.ReactNode;
  /** In place of the default mark (the title's initial in a tile): the place's own (a project's). */
  mark?: React.ReactNode;
  /** Out to the area above (a project's "‹ Projects"): a row above the title, a button at the top
   *  of the rail, as the course sidebar's way out to My classes. */
  back?: { label: string; href: string };
  groups: NavGroup[];
  current?: string;
  collapsed: boolean;
  onCollapsedChange(collapsed: boolean): void;
  onSearch?(): void;
  onSettings?(): void;
  user: { name: string; role: string };
  /** A link clicked, before it is followed: the place may take it another way (a project's page
   *  Shift- or Alt-clicked opens beside the one showing) and prevent the click. */
  onItemClick?(item: NavItem, e: React.MouseEvent<HTMLAnchorElement>): void;
  /** A link pressed, which may become a drag (a project's page dragged into the page, to open beside
   *  it). Given, the links are not the browser's to drag, nor a long press's to preview. */
  onItemPointerDown?(item: NavItem, e: React.PointerEvent<HTMLAnchorElement>): void;
  /** The page showing beside the current one (a project's split): marked, quietly. */
  beside?: string;
  /** The way back leads to a place the sidebar can show inside it (a project's class): pointed at or
   *  focused, its arrow becomes a button that goes inside (`onBackInside`), saying this. */
  backInside?: string;
  onBackInside?(): void;
  /** What the sidebar shows in place of the place's pages (its class's lessons, SidebarInside); the
   *  page showing is not changed by it. The rail keeps the place's own. */
  view?: React.ReactNode;
  /** Under Search, above the pages, always shown (a project's check-in, ): the full
   *  sidebar's `lead`, and the rail's own small one, `leadRail`. */
  lead?: React.ReactNode;
  leadRail?: React.ReactNode;
}

/** What a link does besides being followed, as the place asks. */
function itemProps({ onItemClick, onItemPointerDown }: NavSidebarProps, it: NavItem) {
  return {
    ...(onItemClick ? { onClick: (e: React.MouseEvent<HTMLAnchorElement>) => onItemClick(it, e) } : {}),
    ...(onItemPointerDown ? { onPointerDown: (e: React.PointerEvent<HTMLAnchorElement>) => onItemPointerDown(it, e), draggable: false } : {}),
  };
}
const DRAGGABLE = 'select-none [-webkit-touch-callout:none]';

/** The mark when a place gives none: the title's initial, in a tile that follows the theme. */
function DefaultMark({ title }: { title: string }) {
  return (
    <span aria-hidden className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-[15px] leading-none font-semibold text-background">
      {title.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function NavSidebar(props: NavSidebarProps) {
  return <TooltipProvider delayDuration={0}><SpringWidth flip={props.collapsed}>{props.collapsed ? <NavRail {...props} /> : <NavFull {...props} />}</SpringWidth></TooltipProvider>;
}

function NavFull(props: NavSidebarProps) {
  const { title, subtitle, mark, back, groups, current, beside, onCollapsedChange, onSearch, onSettings, user, backInside, onBackInside, view, lead } = props;
  const inside = backInside && onBackInside;
  return (
    <aside data-slot="sidebar" aria-label="Navigation" className="flex h-full w-[272px] shrink-0 flex-col border-r bg-sidebar">
      {back && (
        <div className={cn('px-2.5 pt-2.5', inside && 'group/back relative')} data-inside={inside ? 'back' : undefined}>
          {/* Pointed at, the way back's arrow goes inside instead (a class sidebar's Projects does the
              same the other way round), part of the row so it grows when pressed; → on the keyboard
              goes inside too; always there on a touch screen. */}
          <Button asChild variant="ghost" className={cn(linkRow(false), 'h-8 text-[13px] text-muted-foreground hover:text-foreground')}
            icon={inside ? <IconSwap icon={<ChevronLeft aria-hidden className={LINK_ICON} />} group="back" /> : <ChevronLeft aria-hidden className={LINK_ICON} />}
            iconLabel={inside ? backInside : undefined}
            onIconClick={inside ? (e) => { e.preventDefault(); onBackInside!(); } : undefined}
            aria-keyshortcuts={inside ? 'ArrowRight' : undefined}
            onKeyDown={inside ? (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); onBackInside!(); } } : undefined}>
            <a href={back.href} data-slot="sidebar-back">{back.label}</a>
          </Button>
        </div>
      )}
      <div className={cn('flex items-center gap-2.5 px-3.5 pb-3', back ? 'pt-1.5' : 'pt-4')}>
        <span data-flip="mark" className="shrink-0">{mark ?? <DefaultMark title={title} />}</span>
        <span className="min-w-0">
          {/* A place's own name, whole, on two lines when it needs them (as a course's title). */}
          <strong className="line-clamp-2 text-[14px] leading-[1.3] font-semibold">{title}</strong>
          {subtitle && <small className="mt-0.5 block truncate text-[12px] text-muted-foreground">{subtitle}</small>}
        </span>
      </div>
      {onSearch && (
        // The icon sits over the box, not in it: collapsing or expanding, the box fades as a whole
        // and the icon travels (spring-width.tsx). Centred by its margins, not a transform (the
        // travel is one), so it lines up with the word on a touch screen's taller box too.
        <div className="relative mx-3.5 mb-2.5 grid">
          <Button variant="outline" onClick={onSearch} className="h-[34px] justify-start gap-2 border-input bg-background pr-2.5 pl-8 text-[13px] font-normal text-muted-foreground shadow-none">
            {/* Not on a touch screen, whatever width it gives the page (sidebar.tsx). */}
            <span className="flex-1 text-left">Search</span><Keys combo="Mod+K" data-shortcut className="pointer-coarse:hidden" />
          </Button>
          <Search aria-hidden data-flip="search" className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-3.5 text-muted-foreground" />
        </div>
      )}
      {lead && <div data-slot="sidebar-lead" className="mx-3.5 mb-2.5">{lead}</div>}
      {view ? <nav aria-label="Sections" data-slot="sidebar-view" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">{view}</nav> : (
      <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {groups.map((g, i) => (
          <div key={g.label ?? i} className="grid gap-0.5 pt-2">
            {g.label && <span className="ui-caption px-2 pt-2 pb-1">{g.label}</span>}
            {g.items.map((it) => {
              const here = it.id === current;
              return (
                // The course sidebar's link row (sidebar.tsx linkRow), so the two sidebars look and
                // press alike.
                <Button key={it.id} asChild variant="ghost" className={cn(linkRow(here), props.onItemPointerDown && DRAGGABLE)}>
                  <a href={it.href} aria-current={here ? 'page' : undefined} data-beside={it.id === beside || undefined} {...itemProps(props, it)}>
                    <it.icon aria-hidden data-flip={`item:${it.id}`} className={LINK_ICON} /><span>{it.label}</span>
                    {!!it.count && <Count className="ml-auto" value={it.count} tone="info" size="sm" ring={false} />}
                    {/* Showing beside the page (a project's split): a quiet mark, not the current page's blue. */}
                    {it.id === beside && <span title="Open beside" className={cn('flex text-muted-foreground', !it.count && 'ml-auto')}><Columns2 aria-hidden className="size-3.5" /><span className="sr-only">, open beside</span></span>}
                  </a>
                </Button>
              );
            })}
          </div>
        ))}
      </nav>
      )}
      <div className="flex items-center gap-2.5 border-t px-3 py-2.5">
        <Avatar aria-hidden data-flip="avatar" className="size-7"><AvatarFallback className="text-[11px] font-semibold">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-tight font-medium">{user.name}<small className="block truncate text-[11.5px] font-normal text-muted-foreground">{user.role}</small></span>
        <span className="flex shrink-0 items-center gap-0.5">
          {onSettings && <Button variant="ghost" size="icon-sm" aria-label="Settings" onClick={onSettings}><Settings /></Button>}
          <Tooltip>
            <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Compact sidebar" onClick={() => onCollapsedChange(true)}><PanelLeftClose data-flip="toggle" /></Button></TooltipTrigger>
            <TooltipContent side="top">Compact sidebar</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </aside>
  );
}

function NavRail(props: NavSidebarProps) {
  const { title, mark, back, groups, current, beside, onCollapsedChange, onSearch, user, leadRail } = props;
  const tip = (label: string, node: React.ReactElement) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <aside data-slot="sidebar" data-collapsed="" aria-label="Navigation" className="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3.5">
      {back && tip(back.label, <Button asChild variant="ghost" size="icon-sm" className="mb-1"><a href={back.href} aria-label={back.label} data-slot="sidebar-back"><ChevronLeft aria-hidden /></a></Button>)}
      {tip(title, <span role="img" aria-label={title} data-flip="mark" className="mb-2">{mark ?? <DefaultMark title={title} />}</span>)}
      {onSearch && tip(`Search · ${keyName('Mod+K')}`, <Button variant="ghost" size="icon-lg" aria-label="Search" onClick={onSearch}><Search data-flip="search" /></Button>)}
      {leadRail}
      {groups.flatMap((g) => g.items).map((it) => tip(it.label,
        <Button key={it.id} asChild variant="ghost" size="icon-lg" className={cn('relative', it.id === current && 'bg-info-soft text-info', it.id === beside && 'bg-muted', props.onItemPointerDown && DRAGGABLE)}>
          <a href={it.href} aria-label={it.id === beside ? `${it.label}, open beside` : it.label} aria-current={it.id === current ? 'page' : undefined} data-beside={it.id === beside || undefined} {...itemProps(props, it)}>
            <it.icon data-flip={`item:${it.id}`} />
            {!!it.count && <Count aria-hidden value={it.count} tone="info" size="sm" className="absolute top-1.5 right-1" />}
          </a>
        </Button>))}
      <div className="mt-auto grid justify-items-center gap-2">
        {tip('Expand sidebar', <Button variant="ghost" size="icon-lg" aria-label="Expand sidebar" onClick={() => onCollapsedChange(false)}><PanelLeftOpen data-flip="toggle" /></Button>)}
        <Avatar aria-label={user.name} data-flip="avatar" className="size-7"><AvatarFallback className="text-[11px] font-semibold">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
      </div>
    </aside>
  );
}
