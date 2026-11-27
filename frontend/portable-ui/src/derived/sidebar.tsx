// The course sidebar, full (272px) or compact (a 64px rail). Full: the course (its mark, its whole
// title, code and term; a menu of the other classes when there are any), search, the main links with
// their marks, and the learning path, a progress ring per chapter and a status dot per lesson (read,
// reading, not yet), lessons open in a pane marked so, "open beside" on hover. Compact: the course's
// mark, icons with tooltips and the chapter rings; a ring opens its lessons in a flyout. The toggle
// between the two is at the bottom in both. The rail's rows stand where the full sidebar's do (the
// course's block as tall, a row for "Learning path" with the count read in it), so collapsing or
// expanding moves the icons across, never up or down.
import * as React from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronsUpDown, Columns2, PanelLeftClose, PanelLeftOpen, Search, Settings, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '../base/avatar';
import { Button } from '../base/button';
import { Count } from '../base/count';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../base/dropdown-menu';
import { Mark, type MarkTone } from '../base/mark';
import { Popover, PopoverContent, PopoverTrigger } from '../base/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../base/tooltip';
import { cn } from '../lib/utils';
import { Keys } from '../keys/Keys';
import { keyName } from '../keys/combo';
import { useHeld } from '../keys/held';
import { SpringWidth } from './spring-width';
import { dragStore } from './panes/dragStore';

/** A finger holding a lesson or a page dragged out of the sidebar does not scroll it (or the page)
 *  as it moves. Registered with the sidebar, not when the drag starts: a touch's scrolling is decided
 *  as it lands, by the listeners there then (on the phone the drag was cancelled). */
function useNoScrollWhileDragging(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hold = (e: TouchEvent) => { if (dragStore.get().held) e.preventDefault(); };
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, [ref]);
}

export type TopicStatus = 'read' | 'reading' | 'todo';
export interface SidebarTopic { id: string; title: string; status: TopicStatus }
export interface SidebarChapter { id: string; number: string; title: string; topics: SidebarTopic[] }
export interface SidebarLink {
  id: string; label: string; icon: LucideIcon; mark?: { tone: MarkTone; icon: LucideIcon; label: string; detail?: string; count?: number };
  /** The link has a view of its own the sidebar can show (a class's projects): pointed at or focused,
   *  its icon becomes a button that goes inside (`onInside`), saying this. */
  inside?: string;
}

export interface SidebarCourse { id?: string; code: string; term: string; title: string }

export interface SidebarProps {
  course: SidebarCourse;
  /** Out of the course to the app's own pages (My classes, Account, admin): a row above the course,
   *  a button at the top of the rail (from a class there was no plain way out). */
  back?: { label: string; href: string };
  /** Every class the person can switch to, this one included: with more than one, the course
   * opens a menu of them. */
  courses?: SidebarCourse[];
  onCourse?(course: SidebarCourse): void;
  links: SidebarLink[];
  chapters: SidebarChapter[];
  current?: string;
  /** The main link whose page is showing: highlighted, as the lesson showing is. */
  currentLink?: string;
  /** The chapter whose own page is showing: its row highlighted (and open), as a lesson's is
   *  ("highlight this"). */
  currentChapter?: string;
  collapsed: boolean;
  onCollapsedChange(collapsed: boolean): void;
  /** What the button that collapses it says: in a phone's menu, which has no rail, it closes the
   *  menu ('Close menu', it only toggled its tip there). */
  collapseLabel?: string;
  /** A lesson clicked, and how (`howOf`): here, a tab of the focused pane, a new space, a new
   *  browser tab. */
  onOpen(topicId: string, how: OpenAs): void;
  /** Opens a chapter's own page ("clicking on circle should open the page"): its
   *  ring, its row with Option held, the rail's chapter title; `window` with Cmd/Ctrl. */
  onChapter?(chapterId: string, how: 'here' | 'window'): void;
  /** A main link clicked, the same way. */
  onLink?(id: string, how: OpenAs): void;
  /** A press on a lesson or a main link, which may become a drag into the panes (the app starts it;
   *  a press that does not move is a click). */
  onDragStart?(item: { topic: string } | { link: string }, e: React.PointerEvent<HTMLElement>): void;
  /** The spaces, under the main links (`rail`: the collapsed sidebar), in a row as tall in both. */
  spaces?(rail: boolean): React.ReactNode;
  /** A pane dropped on the sidebar is removed from its space; this says so while one is held over
   *  it ("Remove from Reading"). */
  dropToRemove?: string;
  /** Where a lesson or a main link's page is open (spaces.tsx `SpaceSpots`), at its row's end in
   *  the full sidebar: nothing when it is open nowhere. */
  whereOf?(item: { topic: string } | { link: string }): React.ReactNode;
  onSearch?(): void;
  /** The footer's settings button (the account page, say). */
  onSettings?(): void;
  /** A link's go-inside button pressed (`SidebarLink.inside`): the app shows that view (`view`). */
  onInside?(id: string): void;
  /** What the sidebar shows in place of the links, the spaces and the learning path (a class's
   *  projects, SidebarInside): the page and the space showing are not changed by it. The rail keeps
   *  the course's own. */
  view?: React.ReactNode;
  user: { name: string; role: string };
}

/** The sidebar with a pane held over it, which a drop would remove from its space. */
const DROP_TO_REMOVE = 'transition-colors data-[drop-over]:bg-bad-soft data-[drop-over]:shadow-[inset_-2px_0_0_var(--bad)]';

/** How a lesson or a page opens: a click's keys (`howOf`), or the row's beside button. */
export type OpenAs = 'here' | 'beside' | 'tab' | 'space' | 'window';

/** Cmd/Ctrl: a new browser tab; Option/Alt: a new space; Shift: a tab of the focused pane. */
export const howOf = (e: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): OpenAs =>
  e.metaKey || e.ctrlKey ? 'window' : e.altKey ? 'space' : e.shiftKey ? 'tab' : 'here';

/** A click, or a middle click (a new browser tab, as for a link). */
const clicks = (open: (how: OpenAs) => void) => ({
  onClick: (e: React.MouseEvent) => open(howOf(e)),
  onAuxClick: (e: React.MouseEvent) => { if (e.button === 1) { e.preventDefault(); open('window'); } },
  onMouseDown: (e: React.MouseEvent) => { if (e.button === 1) e.preventDefault(); },
});

const progressOf = (c: SidebarChapter) => (c.topics.length ? c.topics.filter((t) => t.status === 'read').length / c.topics.length : 0);

const courseKey = (c: SidebarCourse) => c.id ?? `${c.code} · ${c.term}`;
const MARK_TINTS = ['bg-info-soft text-info', 'bg-ok-soft text-ok', 'bg-thm-soft text-thm', 'bg-warn-soft text-warn'];

/** A class's mark: its title's first letter, on a tint its code picks, so two classes tell apart at a
 *  glance. The sum of the code's characters: codes that differ only in their number (MATH 101,
 *  MATH 102) land on different tints. */
function CourseMark({ course, className }: { course: SidebarCourse; className?: string }) {
  const tint = MARK_TINTS[[...course.code].reduce((h, ch) => h + ch.charCodeAt(0), 0) % MARK_TINTS.length];
  return (
    <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-[15px] font-semibold', tint, className)}>
      {course.title.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

/** The classes to switch to, the one shown ticked. */
function CourseMenu({ course, courses, onCourse, side }: { course: SidebarCourse; courses: SidebarCourse[]; onCourse?(c: SidebarCourse): void; side?: 'bottom' | 'right' }) {
  return (
    <DropdownMenuContent side={side} align="start" className="w-[244px] p-1.5">
      <DropdownMenuLabel className="ui-caption px-2 pt-1 pb-1.5">Your classes</DropdownMenuLabel>
      {courses.map((c) => {
        const here = courseKey(c) === courseKey(course);
        return (
          <DropdownMenuItem key={courseKey(c)} className="gap-2.5 py-1.5" onSelect={() => { if (!here) onCourse?.(c); }}>
            <CourseMark course={c} className="size-7 rounded-md text-[13px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{c.title}</span>
              <small className="block truncate text-[11.5px] text-muted-foreground">{c.term ? `${c.code} · ${c.term}` : c.code}</small>
            </span>
            {here && <Check aria-label="This class" className="text-info" />}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}

/** A chapter's progress: green when it is all read, blue while under way, a faint ring before.
 *  Its size is its own, inline: inside a Button, the rule that makes any icon without a size-*
 *  class 16px drew a 32px ring at 16, under a number as wide as it (17 Nov). */
function Ring({ value, size = 20, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 1 ? 'var(--ok)' : 'var(--info)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0 -rotate-90"
      style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value >= 1 ? 'var(--ok-line)' : 'var(--info-line)'} strokeWidth={3} />
      {value > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${c * Math.min(1, value)} ${c}`} />}
    </svg>
  );
}

function StatusDot({ status }: { status: TopicStatus }) {
  return (
    <span aria-hidden className={cn('size-2 shrink-0 rounded-full',
      status === 'read' && 'bg-ok',
      status === 'reading' && 'bg-info shadow-[0_0_0_3px_var(--info-line)]',
      status === 'todo' && 'shadow-[inset_0_0_0_1.5px_var(--muted-foreground)]')} />
  );
}

const STATUS_WORD: Record<TopicStatus, string> = { read: 'read', reading: 'reading', todo: 'not read yet' };

/** A link's row in a sidebar (Home, Workbook; My classes, Users…), the same in the course's sidebar
 *  and the app's (nav-sidebar.tsx, they had drifted apart). */
export const linkRow = (current: boolean) => cn('h-[34px] w-full justify-start gap-2.5 rounded-lg px-2 text-[13.5px] text-foreground/80 has-[svg]:px-2',
  // The current page keeps its blue when pointed at, deeper (the ghost button's grey, and its dark
  // theme's, would replace it).
  current && 'bg-info-soft font-medium text-foreground hover:bg-info-soft-hover dark:hover:bg-info-soft-hover');
/** Its icon: 18 px on a touch screen, as beside any label there. */
export const LINK_ICON = 'size-4 pointer-coarse:size-[18px] text-muted-foreground';
/** A row's icon that gives way to a "go inside" arrow when the row is pointed at or focused (always on
 *  a touch screen): both in the button's icon place, so they grow with it when it is pressed. */
export function IconSwap({ icon, group }: { icon: React.ReactNode; group: 'link' | 'back' }) {
  const show = group === 'link' ? 'group-hover/link:opacity-100 group-focus-within/link:opacity-100' : 'group-hover/back:opacity-100 group-focus-within/back:opacity-100';
  const hide = group === 'link' ? 'group-hover/link:opacity-0 group-focus-within/link:opacity-0' : 'group-hover/back:opacity-0 group-focus-within/back:opacity-0';
  return (
    <span className="relative grid size-4 place-items-center pointer-coarse:size-[18px]">
      <span className={cn('grid place-items-center transition-opacity pointer-coarse:opacity-0', hide)}>{icon}</span>
      <span aria-hidden data-slot="sidebar-inside" className={cn('absolute -inset-1 grid cursor-pointer place-items-center rounded-md bg-background text-foreground opacity-0 shadow-xs ring-1 ring-border transition-opacity pointer-coarse:opacity-100', show)}>
        <ArrowRight className="size-3" />
      </span>
    </span>
  );
}

function TopicRow({ topic, current, onOpen, onDragStart, where, inFlyout = false }: { topic: SidebarTopic; current: boolean; onOpen: SidebarProps['onOpen']; onDragStart?: SidebarProps['onDragStart']; where?: React.ReactNode; inFlyout?: boolean }) {
  return (
    // On a touch screen the row is a finger's 44 px, but its highlight, drawn behind it, stays the
    // 32 px it is with a mouse, as does the bar beside it (the taller one looked heavy).
    <div className={cn('group/topic relative isolate flex h-8 pointer-coarse:h-11 items-center text-[13px]',
      // The highlight reaches past the chapter's line, the current one's bar inside it;
      // in the rail's flyout, which has no line, it is the row's.
      'before:absolute before:inset-y-0 before:right-0 before:-z-10 before:rounded-md pointer-coarse:before:inset-y-1.5', inFlyout ? 'before:left-0' : 'before:-left-5',
      current ? 'font-semibold text-foreground before:bg-info-soft' : 'text-muted-foreground hover:text-foreground hover:before:bg-accent')}>
      {current && !inFlyout && <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-[13px] w-0.5 rounded bg-info pointer-coarse:top-3 pointer-coarse:bottom-3" />}
      <Button variant="ghost" className="h-full min-w-0 flex-1 justify-start gap-2.5 rounded-md px-2 text-[13px] font-[inherit] text-inherit hover:bg-transparent hover:text-inherit has-[svg]:px-2"
        aria-current={current ? 'page' : undefined} aria-label={`${topic.title}, ${STATUS_WORD[topic.status]}`}
        {...clicks((how) => onOpen(topic.id, how))} onPointerDown={(e) => onDragStart?.({ topic: topic.id }, e)}>
        <StatusDot status={topic.status} />
        <span className="truncate">{topic.title}</span>
      </Button>
      {/* Where it is open (a tiny map of each space, its pane lit), or, open nowhere, a way to open it beside. */}
      {where ? <span className="mr-1">{where}</span> : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Shown on hover, so not on a touch screen: there it was an unseen target at the row's end. */}
            <Button variant="ghost" size="icon-xs" className="mr-1 opacity-0 group-hover/topic:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden" aria-label={`Open ${topic.title} beside`}
              onClick={() => onOpen(topic.id, 'beside')}><Columns2 /></Button>
          </TooltipTrigger>
          <TooltipContent side="right">Open beside · or drag the lesson there</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** How tall the full sidebar's course block was last drawn, for the rail's to match. Before the full
 *  one has been drawn (a page that opens collapsed): a title of more than about 26 letters takes two
 *  lines there. */
let courseBlock: number | null = null;
const courseBlockFor = (course: SidebarCourse) => courseBlock ?? (course.title.length > 26 ? 88 : 70);

/** Which chapters are open (their lessons listed): the full sidebar's, kept for the rail too, which
 *  keeps their lessons' rows. */
type Opened = { open: ReadonlySet<string>; setOpen: React.Dispatch<React.SetStateAction<Set<string>>> };

function Sidebar(props: SidebarProps) {
  const holding = props.currentChapter ?? props.chapters.find((c) => c.topics.some((t) => t.id === props.current))?.id;
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(holding ? [holding] : []));
  React.useEffect(() => { if (holding) setOpen((o) => (o.has(holding) ? o : new Set([...o, holding]))); }, [holding]);
  return (
    <TooltipProvider delayDuration={0}>
      <SpringWidth flip={props.collapsed}>{props.collapsed ? <Rail {...props} open={open} setOpen={setOpen} /> : <Full {...props} open={open} setOpen={setOpen} />}</SpringWidth>
    </TooltipProvider>
  );
}

/** Keeps `courseBlock` up to date with how tall `el` is drawn (no read of the page of its own). */
function useCourseBlock(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => { const h = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? 0); if (h > 0) courseBlock = h; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}

function Full({ course, back, courses, onCourse, links, chapters, current, currentLink, currentChapter, onChapter, onCollapsedChange, collapseLabel = 'Compact sidebar', onOpen, onLink, onDragStart, spaces, dropToRemove, whereOf, onSearch, onSettings, user, open, setOpen, onInside, view }: SidebarProps & Opened) {
  const read = chapters.reduce((n, c) => n + c.topics.filter((t) => t.status === 'read').length, 0);
  const total = chapters.reduce((n, c) => n + c.topics.length, 0);
  // Option held: a chapter's row opens its page instead of its lessons, its arrow says so.
  const opening = useHeld('Alt') && !!onChapter;
  const block = React.useRef<HTMLDivElement>(null);
  useCourseBlock(block);
  const aside = React.useRef<HTMLElement>(null);
  useNoScrollWhileDragging(aside);
  // The whole title, on two lines when it needs them; the code and term under it.
  const heading = (
    <>
      <span data-flip="mark" className="shrink-0"><CourseMark course={course} /></span>
      <span className="min-w-0 flex-1">
        <strong className="line-clamp-2 text-[14px] leading-[1.3] font-semibold">{course.title}</strong>
        <small className="mt-0.5 block truncate text-[12px] text-muted-foreground">{course.term ? `${course.code} · ${course.term}` : course.code}</small>
      </span>
    </>
  );
  return (
    <aside ref={aside} data-slot="sidebar" aria-label="Course" data-pane-drop={dropToRemove ? 'sidebar' : undefined} data-pane-drop-label={dropToRemove}
      className={cn('flex h-full w-[272px] shrink-0 flex-col border-r bg-sidebar', DROP_TO_REMOVE)}>
      {back && (
        <div className="px-2.5 pt-2.5">
          <Button asChild variant="ghost" className={cn(linkRow(false), 'h-8 text-[13px] text-muted-foreground hover:text-foreground')}>
            <a href={back.href} data-slot="sidebar-back"><ChevronLeft aria-hidden className={LINK_ICON} />{back.label}</a>
          </Button>
        </div>
      )}
      <div ref={block} className={cn('px-2 pb-2', back ? 'pt-1' : 'pt-3')}>
        {courses && courses.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" title={course.title} className="h-auto w-full justify-start gap-2.5 rounded-lg p-1.5 text-left whitespace-normal data-[state=open]:bg-accent has-[svg]:p-1.5">
                {heading}
                <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <CourseMenu course={course} courses={courses} onCourse={onCourse} />
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2.5 p-1.5">{heading}</div>
        )}
      </div>
      {/* The icon sits over the box, not in it: collapsing or expanding, the box fades as a whole
          and the icon travels (spring-width.tsx). */}
      {/* Its edges and its icon line up with the links' below (it sat 5 px right of
          them, and high on a touch screen): the nav's inset, the rows' icon inset and size. */}
      <div className="relative mx-2.5 mb-2.5 grid">
        <Button variant="outline" onClick={onSearch} className="h-[34px] justify-start gap-2 border-input bg-background pr-2.5 pl-[34px] text-[13px] font-normal text-muted-foreground shadow-none pointer-coarse:pl-9">
          {/* The key is shown where there is a keyboard: not on a touch screen, phone or tablet,
              whatever width it gives the page ("desktop site" on a phone included). */}
          <span className="flex-1 text-left">Search</span><Keys combo="Mod+K" data-shortcut className="pointer-coarse:hidden" />
        </Button>
        <Search aria-hidden data-flip="search" className="pointer-events-none absolute inset-y-0 left-2 my-auto size-4 text-muted-foreground pointer-coarse:size-[18px]" />
      </div>
      {view ? <nav aria-label="Course" data-slot="sidebar-view" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">{view}</nav> : (
      <nav aria-label="Course" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {links.map((l) => {
          const inside = l.inside && onInside;
          // Its icon, pointed at or focused, is a way inside ("when hovered, show a go
          // inside icon instead of the projects icon"), part of the row so it grows with it when pressed
          // ("the arrow should enlarge with the button"); the rest of the row still opens its page; → on
          // the keyboard goes inside. On a touch screen, which has no pointing at, the arrow is always there.
          return (
            <div key={l.id} className={cn(inside && 'group/link')} data-inside={inside ? l.id : undefined}>
              <Button variant="ghost" {...clicks((how) => onLink?.(l.id, how))} onPointerDown={(e) => onDragStart?.({ link: l.id }, e)}
                aria-current={l.id === currentLink ? 'page' : undefined}
                className={cn(linkRow(l.id === currentLink), inside && 'w-full')}
                icon={inside ? <IconSwap icon={<l.icon aria-hidden data-flip={`link:${l.id}`} className={LINK_ICON} />} group="link" /> : <l.icon aria-hidden data-flip={`link:${l.id}`} className={LINK_ICON} />}
                iconLabel={inside ? l.inside : undefined}
                onIconClick={inside ? (e) => { e.preventDefault(); onInside(l.id); } : undefined}
                aria-keyshortcuts={inside ? 'ArrowRight' : undefined}
                onKeyDown={inside ? (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); onInside(l.id); } } : undefined}>
                <span>{l.label}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {whereOf?.({ link: l.id })}
                  {l.mark && <Mark size="sm" tone={l.mark.tone} icon={<l.mark.icon />} label={l.mark.label} detail={l.mark.detail} count={l.mark.count} side="right" />}
                </span>
              </Button>
            </div>
          );
        })}
        {/* The spaces, as tall a row as the collapsed sidebar's, so nothing under them moves. */}
        {spaces && <div className="mt-1.5 flex h-12 items-center">{spaces(false)}</div>}
        <div className="ui-caption flex items-center px-2 pt-4 pb-1.5">
          Learning path<span className="ml-auto font-normal text-muted-foreground tabular-nums">{read} of {total} read</span>
        </div>
        {chapters.map((c) => {
          const expanded = open.has(c.id);
          return (
            <div key={c.id}>
              {/* The ring opens the chapter's page; the rest of the row opens and closes its lessons, or,
                  with Option held (the arrow says so), opens the page too. */}
              <div data-slot="chapter-row" aria-current={c.id === currentChapter ? 'page' : undefined}
                className={cn('group/chapter flex h-9 items-center rounded-lg hover:bg-accent dark:hover:bg-accent/50',
                  c.id === currentChapter && 'bg-info-soft font-semibold hover:bg-info-soft-hover dark:hover:bg-info-soft-hover')}>
                {onChapter ? (
                  <button type="button" aria-label={`Open ${c.title}`} title="Open the chapter’s page" onClick={(e) => onChapter(c.id, e.metaKey || e.ctrlKey ? 'window' : 'here')}
                    className="ms-1 grid size-7 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 ui-focus">
                    <span data-flip={`chapter:${c.id}`} className="inline-flex"><Ring value={progressOf(c)} /></span>
                  </button>
                ) : <span data-flip={`chapter:${c.id}`} className="ms-2 inline-flex shrink-0"><Ring value={progressOf(c)} /></span>}
                <Button variant="ghost" aria-expanded={expanded} title={opening ? 'Open the chapter’s page' : undefined}
                  onClick={(e) => {
                    if (onChapter && (e.altKey || e.metaKey || e.ctrlKey)) { onChapter(c.id, e.altKey ? 'here' : 'window'); return; }
                    setOpen((o) => { const n = new Set(o); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
                  }}
                  className={cn('h-9 min-w-0 flex-1 justify-start gap-2.5 rounded-lg ps-1.5 pe-2 text-[13.5px] hover:bg-transparent dark:hover:bg-transparent has-[svg]:pe-2',
                    expanded || c.id === currentChapter ? 'text-foreground' : 'text-foreground/80')}>
                  <span className="w-4 font-mono text-[11px] text-muted-foreground">{c.number}</span>
                  <span className="truncate">{c.title}</span>
                  {opening
                    ? <ArrowUpRight aria-hidden data-slot="chapter-open-icon" className="ml-auto size-3.5 text-info" />
                    : <ChevronDown aria-hidden className={cn('ml-auto size-3.5 text-muted-foreground transition-transform duration-300 ease-(--ease-settle)', !expanded && '-rotate-90')} />}
                </Button>
              </div>
              {/* Always there and opened by a transition (styles.css), so a click mid-way turns it round. */}
              <div data-slot="disclosure" data-open={expanded || undefined}>
                <div>
                  <div className="my-0.5 mb-1.5 ml-[18px] border-l pl-3">
                    {c.topics.map((t) => <TopicRow key={t.id} topic={t} current={t.id === current} onOpen={onOpen} onDragStart={onDragStart} where={whereOf?.({ topic: t.id })} />)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      )}
      <div className="flex items-center gap-2.5 border-t px-3 py-2.5">
        <Avatar aria-hidden data-flip="avatar" className="size-7"><AvatarFallback className="text-[11px] font-semibold">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <span className="min-w-0 flex-1 text-[13px] leading-tight font-medium">{user.name}<small className="block text-[11.5px] font-normal text-muted-foreground">{user.role}</small></span>
        <span className="flex shrink-0 items-center gap-0.5 pointer-coarse:gap-2">
          {onSettings && <Button variant="ghost" size="icon-sm" aria-label="Settings" onClick={onSettings}><Settings /></Button>}
          <Tooltip>
            <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={collapseLabel} onClick={() => onCollapsedChange(true)}><PanelLeftClose data-flip="toggle" /></Button></TooltipTrigger>
            <TooltipContent side="top">{collapseLabel}</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </aside>
  );
}

function Rail({ course, back, courses, onCourse, links, chapters, current, currentLink, currentChapter, onChapter, onCollapsedChange, onOpen, onLink, onDragStart, spaces, dropToRemove, onSearch, user, open }: SidebarProps & Opened) {
  const holding = currentChapter ?? chapters.find((c) => c.topics.some((t) => t.id === current))?.id;
  const read = chapters.reduce((n, c) => n + c.topics.filter((t) => t.status === 'read').length, 0);
  const total = chapters.reduce((n, c) => n + c.topics.length, 0);
  const [flyout, setFlyout] = React.useState<string | null>(null);
  const tip = (label: string, node: React.ReactElement) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <aside data-slot="sidebar" data-collapsed="" aria-label="Course" data-pane-drop={dropToRemove ? 'sidebar' : undefined} data-pane-drop-label={dropToRemove}
      className={cn('flex h-full w-16 shrink-0 flex-col items-center border-r bg-sidebar', DROP_TO_REMOVE)}>
      {/* Each row as tall as the full sidebar's: the course's block, search, a link, "Learning path",
          a chapter. */}
      {back && (
        <div className="flex w-full shrink-0 justify-center pt-2.5">
          {tip(back.label, <Button asChild variant="ghost" size="icon-sm"><a href={back.href} aria-label={back.label} data-slot="sidebar-back"><ChevronLeft aria-hidden /></a></Button>)}
        </div>
      )}
      <div className={cn('flex w-full shrink-0 items-center justify-center pb-2', back ? 'pt-1' : 'pt-3')} style={{ height: courseBlockFor(course) }}>
      {courses && courses.length > 1 ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label={`${course.title}, ${course.code} · ${course.term}`} className="rounded-lg"><span data-flip="mark" className="inline-flex"><CourseMark course={course} /></span></Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{course.title} · switch class</TooltipContent>
          </Tooltip>
          <CourseMenu course={course} courses={courses} onCourse={onCourse} side="right" />
        </DropdownMenu>
      ) : tip(course.title, <span role="img" aria-label={`${course.title}, ${course.code} · ${course.term}`} data-flip="mark"><CourseMark course={course} /></span>)}
      </div>
      <div className="mb-2.5 flex h-[34px] shrink-0 items-center">
        {tip(`Search · ${keyName('Mod+K')}`, <Button variant="ghost" aria-label="Search" onClick={onSearch} className="h-[34px] w-10 rounded-lg"><Search data-flip="search" /></Button>)}
      </div>
      <nav aria-label="Course" className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto pb-3">
      {links.map((l) => tip(l.mark?.count !== undefined ? `${l.label} · ${l.mark.label}` : l.label,
        // No padding: its badge's corner is the button's, pressed or not (button.tsx).
        <Button key={l.id} variant="ghost" className={cn('relative h-[34px] w-10 shrink-0 rounded-lg p-0 has-[svg]:p-0', l.id === currentLink && 'bg-info-soft hover:bg-info-soft')}
          aria-label={l.mark?.count !== undefined ? `${l.label}, ${l.mark.count} ${l.mark.label}` : l.label} aria-current={l.id === currentLink ? 'page' : undefined}
          {...clicks((how) => onLink?.(l.id, how))} onPointerDown={(e) => onDragStart?.({ link: l.id }, e)}>
          <l.icon data-flip={`link:${l.id}`} />
          {l.mark?.count !== undefined && <Count aria-hidden value={l.mark.count} tone={l.mark.tone} size="sm" className="absolute top-0.5 right-0.5" />}
        </Button>))}
      {spaces && <div className="mt-1.5 flex h-12 w-full shrink-0 items-center justify-center">{spaces(true)}</div>}
      {/* Where the full sidebar says "Learning path": how many lessons are read, so the rings under
          it stay where they were. */}
      <div className="ui-caption shrink-0 pt-4 pb-1.5 tabular-nums" title={`Learning path · ${read} of ${total} read`} aria-label={`Learning path, ${read} of ${total} read`}>
        {read}/{total}
      </div>
      {chapters.map((c) => (
        <React.Fragment key={c.id}>
        <Popover open={flyout === c.id} onOpenChange={(o) => setFlyout(o ? c.id : null)}>
          <PopoverTrigger asChild>
            <Button variant="ghost" aria-label={`${c.number} ${c.title}, ${Math.round(progressOf(c) * 100)}% read`}
              className={cn('relative h-9 w-10 shrink-0 rounded-lg', c.id === holding && 'bg-info-soft hover:bg-info-soft')}>
              <span data-flip={`chapter:${c.id}`} className="inline-flex"><Ring value={progressOf(c)} size={32} /></span>
              <span aria-hidden className="absolute font-mono text-[11px] font-semibold">{c.number}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-64 p-1.5">
            {/* Its title opens the chapter's page; how much is read, the ring says. */}
            {onChapter ? (
              <button type="button" data-slot="chapter-title" onClick={(e) => { setFlyout(null); onChapter(c.id, e.metaKey || e.ctrlKey ? 'window' : 'here'); }}
                className="flex w-full items-center gap-2 rounded-md px-2 pt-1.5 pb-2 text-start text-[13px] font-semibold hover:bg-accent ui-focus">
                <Ring value={progressOf(c)} size={18} /><span className="min-w-0 flex-1">{c.number} · {c.title}</span>
                <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <div className="flex items-center gap-2 px-2 pt-1.5 pb-2 text-[13px] font-semibold"><Ring value={progressOf(c)} size={18} />{c.number} · {c.title}</div>
            )}
            {c.topics.map((t) => <TopicRow key={t.id} topic={t} current={t.id === current} inFlyout onOpen={(id, how) => { setFlyout(null); onOpen(id, how); }}
              onDragStart={(item, e) => { onDragStart?.(item, e); }} />)}
          </PopoverContent>
        </Popover>
        {/* A chapter open in the full sidebar keeps its lessons' rows here: each one's dot where its
            row was, so the rings under it stay put; a click opens the lesson. */}
        {open.has(c.id) && (
          <div className="mt-0.5 mb-1.5 flex shrink-0 flex-col items-center">
            {c.topics.map((t) => tip(t.title,
              <Button key={t.id} variant="ghost" aria-label={`${t.title}, ${STATUS_WORD[t.status]}`} aria-current={t.id === current ? 'page' : undefined}
                className={cn('h-8 w-10 rounded-md', t.id === current && 'bg-info-soft hover:bg-info-soft')}
                {...clicks((how) => onOpen(t.id, how))} onPointerDown={(e) => onDragStart?.({ topic: t.id }, e)}>
                <StatusDot status={t.status} />
              </Button>))}
          </div>
        )}
        </React.Fragment>
      ))}
      </nav>
      <div className="mt-auto grid shrink-0 justify-items-center gap-2 pb-3.5">
        {tip('Expand sidebar', <Button variant="ghost" size="icon-lg" aria-label="Expand sidebar" onClick={() => onCollapsedChange(false)}><PanelLeftOpen data-flip="toggle" /></Button>)}
        <Avatar aria-label={user.name} data-flip="avatar" className="size-7"><AvatarFallback className="text-[11px] font-semibold">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ a view inside a link

/** A view the sidebar shows inside one of its links (a class's projects, ), the
 *  course's links, spaces and learning path out of the way: a way back to them at the top, its name,
 *  then its groups. The page and the space showing stay as they are. */
function SidebarInside({ back, title, children }: { back: { label: string; onBack(): void }; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div data-slot="sidebar-inside-view" className="grid gap-0.5 pt-0.5">
      <Button variant="ghost" className={cn(linkRow(false), 'h-8 text-[13px] text-muted-foreground hover:text-foreground')} onClick={back.onBack}>
        <ChevronLeft aria-hidden className={LINK_ICON} /><span className="truncate">{back.label}</span>
      </Button>
      <div className="ui-caption flex items-center px-2 pt-3 pb-1.5">{title}</div>
      {children}
    </div>
  );
}

/** One of the view's groups (a project): its title, opening to its rows as a chapter does. */
function SidebarInsideGroup({ title, detail, icon, open: given, defaultOpen = false, onOpenChange, children }: {
  title: string; detail?: React.ReactNode; icon?: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?(open: boolean): void; children: React.ReactNode;
}) {
  const [own, setOwn] = React.useState(defaultOpen);
  const open = given ?? own;
  const toggle = () => { setOwn(!open); onOpenChange?.(!open); };
  return (
    <div data-slot="sidebar-inside-group">
      <Button variant="ghost" aria-expanded={open} onClick={toggle}
        className={cn('h-auto min-h-9 w-full justify-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] whitespace-normal has-[svg]:px-2', open ? 'text-foreground' : 'text-foreground/80')}>
        {icon && <span aria-hidden className="inline-flex shrink-0">{icon}</span>}
        <span className="grid min-w-0 flex-1">
          <span className="truncate">{title}</span>
          {detail && <small className="truncate text-[11.5px] font-normal text-muted-foreground">{detail}</small>}
        </span>
        <ChevronDown aria-hidden className={cn('ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-(--ease-settle)', !open && '-rotate-90')} />
      </Button>
      <div data-slot="disclosure" data-open={open || undefined}>
        <div>
          <div className="my-0.5 mb-1.5 ml-[18px] border-l pl-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A row of a group, which opens and drags as a lesson's row does: a click (with its keys, `howOf`)
 *  opens it, a press that moves brings it into the panes, and, pointed at, it opens beside. */
function SidebarInsideRow({ label, icon: Icon, current = false, where, onOpen, onDragStart }: {
  label: string; icon: LucideIcon; current?: boolean; where?: React.ReactNode; onOpen(how: OpenAs): void; onDragStart?(e: React.PointerEvent<HTMLElement>): void;
}) {
  return (
    <div data-slot="sidebar-inside-row" className={cn('group/topic relative isolate flex h-8 items-center text-[13px] pointer-coarse:h-11',
      'before:absolute before:inset-y-0 before:right-0 before:-left-5 before:-z-10 before:rounded-md pointer-coarse:before:inset-y-1.5',
      current ? 'font-semibold text-foreground before:bg-info-soft' : 'text-muted-foreground hover:text-foreground hover:before:bg-accent')}>
      <Button variant="ghost" className="h-full min-w-0 flex-1 justify-start gap-2.5 rounded-md px-2 text-[13px] font-[inherit] text-inherit hover:bg-transparent hover:text-inherit has-[svg]:px-2"
        aria-current={current ? 'page' : undefined} {...clicks(onOpen)} onPointerDown={(e) => onDragStart?.(e)}>
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </Button>
      {where ? <span className="mr-1">{where}</span> : (
        <Button variant="ghost" size="icon-xs" className="mr-1 opacity-0 group-hover/topic:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden" aria-label={`Open ${label} beside`}
          title="Open beside · or drag it there" onClick={() => onOpen('beside')}><Columns2 /></Button>
      )}
    </div>
  );
}

export { Sidebar, Ring, SidebarInside, SidebarInsideGroup, SidebarInsideRow };
