// The notification stacks, top right (the store is notify.ts). One stack per type, errors first.
// Collapsed, a stack shows its newest notification with up to two more peeking out under it, and a
// "+N" pill for the ones beyond; under the pointer (or with focus inside) it opens into a list.
// Only the notification under the pointer (or focus) stops its timer.
//
// A finger has no hover: a tap on a closed stack of two or more opens it, and it
// stays open, every timer in it stopped, until a tap outside it or on "Show less"; a tap on a card
// of an open stack (or a lone one) does what a click does. Its buttons are finger-sized there.
// Every move is a transition, so a stack that opens and closes again turns round mid-way.
import * as React from 'react';
import { ChevronUp, Circle, CircleAlert, CircleCheck, Info, Trash2, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { landing, useDrag, useSpring } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Count, type CountTone } from './count';
import { clickTarget, dismiss, dismissAll, expandNotice, holdNotice, showStack, whenSaid, TONE_ORDER, useNotices, type Notice, type NotifyTone } from './notify';

const ICON: Record<NotifyTone, LucideIcon | null> = { error: CircleAlert, warning: TriangleAlert, success: CircleCheck, info: Info, neutral: null };
const INK: Record<NotifyTone, string> = { error: 'var(--bad)', warning: 'var(--warn)', success: 'var(--ok)', info: 'var(--info)', neutral: 'var(--neutral)' };
const COUNT_TONE: Record<NotifyTone, CountTone> = { error: 'bad', warning: 'warn', success: 'ok', info: 'info', neutral: 'neutral' };
const PLURAL: Record<NotifyTone, string> = { error: 'errors', warning: 'warnings', success: 'done', info: 'updates', neutral: 'more' };
const ONE: Record<NotifyTone, string> = { error: 'error', warning: 'warning', success: 'done', info: 'update', neutral: 'notification' };
/** "5 errors", "1 update": what a stack holds, said in its header. */
const counted = (tone: NotifyTone, n: number) => `${n} ${n === 1 ? ONE[tone] : tone === 'neutral' ? 'notifications' : PLURAL[tone]}`;
/** How far each notification under the front one peeks out, and how much smaller it is. */
const PEEK = 10;
const SHRINK = 0.05;
const GAP = 8;
/** The room an opened stack leaves under it, to the window's bottom (px). */
const ROOM_BELOW = 16;
/** The header above an opened stack (44 px), and the gap under it. */
const HEAD = 44 + GAP;
/** Longest a gone header takes to fade out (its transition is --dur-quick, 240 ms). */
const HEAD_FADE = 400;
/** An opened stack shows this many; the rest wait behind its +N pill (a click shows them all). */
const OPEN_MAX = 5;

function Notifications({ visible = 3, className }: { visible?: number; className?: string }) {
  const notices = useNotices();
  const stacks = TONE_ORDER.map((tone) => [tone, notices.filter((n) => n.tone === tone)] as const).filter(([, list]) => list.length);
  return (
    <section aria-label="Notifications" data-slot="notifications"
      className={cn('pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-3', className)}>
      {stacks.map(([tone, list]) => <Stack key={tone} tone={tone} list={list} visible={visible} />)}
    </section>
  );
}

function Stack({ tone, list, visible }: { tone: NotifyTone; list: Notice[]; visible: number }) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  // Opened by a finger: kept open, and its timers stopped, while it is read.
  const [touched, setTouched] = React.useState(false);
  const [all, setAll] = React.useState(false);
  const open = hover || focus || pinned;
  const root = React.useRef<HTMLDivElement | null>(null);
  const pointer = React.useRef('mouse');
  const close = () => { setPinned(false); setTouched(false); };
  React.useEffect(() => { if (!open) { setAll(false); setTouched(false); } }, [open]);
  // A press outside an opened (pinned) stack closes it.
  React.useEffect(() => {
    if (!pinned) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [pinned]);

  // Each card's height, measured, so the open list and the collapsed peek sit exactly.
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const observer = React.useMemo(() => typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    setHeights((h) => {
      const next = { ...h };
      for (const e of entries) next[(e.target as HTMLElement).dataset.notice!] = Math.round(e.target.getBoundingClientRect().height);
      return next;
    });
  }), []);
  React.useEffect(() => () => observer?.disconnect(), [observer]);
  const measure = React.useCallback((el: HTMLDivElement | null) => { if (el) observer?.observe(el); }, [observer]);

  const shown = list.filter((n) => !n.leaving);
  const limit = open ? (all ? Infinity : OPEN_MAX) : visible;
  // What is on show counts down: the front one collapsed, every listed one opened.
  const onShow = open ? Math.min(shown.length, limit) : 1;
  React.useEffect(() => { showStack(tone, onShow); }, [tone, onShow]);
  React.useEffect(() => () => showStack(tone, 1), [tone]);
  const hiddenCount = Math.max(0, shown.length - limit);
  // Emptied (Clear all, or the last one swiped away), it closes at once: its header goes with the cards,
  // never saying "0 done" while they leave, and the next one to come is not met by an open stack
  // (the header stayed, and Clear all felt as if it had done nothing).
  React.useEffect(() => { if (!shown.length) close(); }, [shown.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened by a finger, or with the pointer on its header, every one in it waits to be read
  // (over the header, every timer stops; over a card, that card's).
  const [overHead, setOverHead] = React.useState(false);
  const reading = open && (touched || overHead) ? shown.map((n) => n.id).join(' ') : '';
  React.useEffect(() => {
    const ids = reading ? reading.split(' ') : [];
    for (const id of ids) holdNotice(id, true, 'stack');
    return () => { for (const id of ids) holdNotice(id, false, 'stack'); };
  }, [reading]);
  const h = (n: Notice) => heights[n.id] ?? 68;
  // Where each card was last placed, for it to leave from.
  const left = React.useRef(new Map<string, number>());
  React.useEffect(() => { for (const id of left.current.keys()) if (!list.some((n) => n.id === id)) left.current.delete(id); });
  let y = 0;
  const place = new Map<string, { y: number; scale: number; opacity: number; z: number }>();
  shown.forEach((n, i) => {
    if (open && i < limit) { place.set(n.id, { y, scale: 1, opacity: 1, z: 100 - i }); y += h(n) + GAP; }
    else if (open) place.set(n.id, { y: Math.max(0, y - GAP - h(n)), scale: 0.95, opacity: 0, z: 0 });
    else place.set(n.id, { y: i * PEEK, scale: 1 - i * SHRINK, opacity: i < visible ? 1 - i * 0.15 : 0, z: 100 - i });
  });
  const front = shown[0];
  const stackHeight = open ? Math.max(0, y - GAP) : (front ? h(front) + Math.min(shown.length - 1, visible - 1) * PEEK : 0);
  // Opened, a stack of two or more can be cleared at once.
  const showClear = open && shown.length > 1;
  // Closed, a stack says only that there is more than one, by the cards under its front one; how many
  // is said by its header, once it is opened: hovered or focused, or tapped. The header holds the count,
  // Clear all, the ones beyond five and (opened by a finger) Show less, where a thumb finds them at
  // once, staying put however many there are (no +N pill, on a phone or a desktop).
  // A lone notification has nothing to count, unless a finger opened it (its pile was pressed).
  const header = open && shown.length > (touched ? 0 : 1);
  const head = header ? HEAD : 0;
  // Gone (cleared, Show less, a tap outside), the header fades out as it was, while the cards move or
  // leave: kept a moment, as its last look, untouchable.
  // Set in the same render the header goes in, so the element stays and its opacity can run down.
  const [fading, setFading] = React.useState(false);
  const [hadHeader, setHadHeader] = React.useState(header);
  if (hadHeader !== header) { setHadHeader(header); setFading(!header); }
  const lastHead = React.useRef<React.ReactNode>(null);
  if (!header && overHead) setOverHead(false);
  // (its transition's end removes it; this, if that never comes)
  React.useEffect(() => {
    if (!fading) return;
    const done = setTimeout(() => setFading(false), HEAD_FADE);
    return () => clearTimeout(done);
  }, [fading]);

  // Opened, it is never taller than the window below it: past that it scrolls, its header staying at
  // the top (all of them listed ran off the screen). Closed, it is back at its top.
  const [room, setRoom] = React.useState(Infinity);
  const scroller = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const el = root.current;
    if (!open || !el) { if (scroller.current) scroller.current.scrollTop = 0; return; }
    const measure = () => setRoom(Math.max(120, window.innerHeight - el.getBoundingClientRect().top - ROOM_BELOW));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);
  const tall = head + stackHeight;
  const scrolls = open && tall > room;

  return (
    <div ref={root} data-slot="notification-stack" data-tone={tone} data-open={open || undefined} data-scrolls={scrolls || undefined}
      className="pointer-events-auto relative"
      style={{ height: scrolls ? room : tall }}
      // A finger's pointer comes and goes with each touch: it opens nothing by entering and closes
      // nothing by leaving.
      onPointerDownCapture={(e) => { pointer.current = e.pointerType; }}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType !== 'touch') { setHover(false); setPinned(false); } }}
      onClickCapture={(e) => {
        // A finger's tap on a closed stack of two or more opens it, rather than acting on its front card.
        if (open || pointer.current !== 'touch' || shown.length < 2 || (e.target as Element).closest('[data-notice-control]')) return;
        e.preventDefault();
        e.stopPropagation();
        setPinned(true);
        setTouched(true);
      }}
      // Opened by keyboard focus; the focus a tap gives the button it lands on is not a request to open.
      onFocus={(e) => { if ((e.target as Element).matches?.(':focus-visible')) setFocus(true); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false); }}>
      {/* The cards, in a box that scrolls them under the header when they are taller than the room; it
          keeps room each side for their corner badges and shadows. (The header is not in it: it stays.) */}
      <div ref={scroller} data-slot="notification-stack-scroll"
        className={cn('absolute inset-0', scrolls && '-mx-4 overflow-y-auto overscroll-contain px-4 [scrollbar-width:thin]')}>
      <div data-slot="notification-stack-body" className="relative" style={{ height: tall }}>
      {list.map((n) => {
        const p = place.get(n.id);
        // A leaving card goes from where it was, whatever the stack does meanwhile.
        const y = p ? p.y + head : left.current.get(n.id) ?? head;
        if (p) left.current.set(n.id, y);
        const away = open ? !!p && p.opacity === 0 : n !== front;
        // a new arrival of one already in the stack is drawn anew (notify.ts arrivals)
        return <Card key={`${n.id}.${n.arrivals ?? 0}`} notice={n} measure={measure} height={h(n)} exact={open && all} y={y} scale={p?.scale ?? 1} opacity={p ? p.opacity : 0} z={p?.z ?? 0} back={away}
          onExpand={() => { expandNotice(n.id); setPinned(true); if (pointer.current === 'touch') setTouched(true); }} />;
      })}
      </div>
      </div>
      {(header || fading) && (
        <div data-slot="notification-head" role="group" aria-label="Notification actions"
          data-gone={!header || undefined} aria-hidden={!header || undefined} inert={!header || undefined}
          onTransitionEnd={(e) => { if (!header && e.target === e.currentTarget && e.propertyName === 'opacity') setFading(false); }}
          onPointerEnter={(e) => { if (e.pointerType !== 'touch') setOverHead(true); }}
          onPointerLeave={(e) => { if (e.pointerType !== 'touch') setOverHead(false); }}
          // A finger's header has four parts; narrower than 26rem (a phone), Clear all and Show less are
          // their icons, so the count is never cut short ("6 notifi…").
          className="@container/head absolute inset-x-0 top-0 z-[110] flex h-11 items-stretch divide-x overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          {header ? (lastHead.current = (
            <>
              <span className="flex min-w-0 flex-1 items-center pl-3.5 text-[13px] font-medium"><span className="truncate">{counted(tone, shown.length)}</span></span>
              {showClear && (
                <BarButton part="notification-clear" onClick={() => dismissAll(tone)} icon={Trash2} compact={touched}>Clear all</BarButton>
              )}
              {hiddenCount > 0 && (
                <BarButton part="notification-more" onClick={() => setAll(true)} ink={INK[tone]}
                  label={`${hiddenCount} more ${tone === 'neutral' ? 'notifications' : PLURAL[tone]}: show all`}>
                  +{hiddenCount} more
                </BarButton>
              )}
              {touched && <BarButton part="notification-less" onClick={close} icon={ChevronUp} control compact>Show less</BarButton>}
            </>
          )) : lastHead.current}
        </div>
      )}
    </div>
  );
}

/** A button in the header above an opened stack: as tall as the header, as wide as its words. */
function BarButton({ part, onClick, icon: Icon, ink, label, control, compact, children }: {
  part: string; onClick(): void; icon?: LucideIcon; ink?: string; label?: string;
  /** Not a tap that opens the stack (it closes it). */
  control?: boolean;
  /** In a narrow header, its icon alone (its words still there for a screen reader, and as its title). */
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" data-part={part} data-notice-control={control || undefined} onClick={onClick} aria-label={label}
      title={compact && typeof children === 'string' ? children : undefined}
      className="flex min-w-0 shrink-0 cursor-pointer items-center justify-center gap-1.5 px-3 text-[12px] font-medium whitespace-nowrap text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground active:bg-accent pointer-coarse:text-[13px]"
      style={ink ? { color: ink } : undefined}>
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      <span className={cn('truncate', compact && '@max-[26rem]/head:sr-only')}>{children}</span>
    </button>
  );
}

/** The most copies a pile shows under its icon, and the gap from one to the next (px), least and most.
 *  How many, and how far apart, is the room the card has under the icon: a one-line
 *  card (46px) keeps two copies 3.5px apart, clear of its edge; a taller one shows more, a little further
 *  apart. */
const PILE_COPIES = 4;
const PILE_GAP: [number, number] = [3, 4];
/** Where the icon ends (the card's top padding, its offset and its size), and the room kept between
 *  a pile and the card's bottom edge (its time bar and 8px), in px. */
const ICON_END = 30;
const PILE_CLEAR = 11;

/** How many copies a pile under the icon shows, and how far apart, in a card this tall. The last copy is
 *  drawn smaller, so it ends 2px above its own step. */
export function pileShape(count: number, height: number): { copies: number; gap: number } {
  const room = Math.max(0, height - ICON_END - PILE_CLEAR) + 2;
  const copies = Math.max(1, Math.min(count - 1, PILE_COPIES, Math.floor(room / PILE_GAP[0])));
  return { copies, gap: Math.min(PILE_GAP[1], Math.max(PILE_GAP[0], room / copies)) };
}

/** Identical notifications, counted: the card's icon piled, one copy peeking out
 *  under it for each arrival, as many as the card has room for (pileShape), and the number in a badge on the card's top-left
 *  corner (PileCount). A type with no icon piles a plain ring. Pressed, the card
 *  splits into one per arrival, each with its time, and the stack stays open. */
function Pile({ notice: n, height, onExpand }: { notice: Notice; height: number; onExpand(): void }) {
  const Icon = ICON[n.tone] ?? Circle;
  const ink = INK[n.tone];
  const { copies, gap } = pileShape(n.count, height);
  return (
    <button key={n.count} type="button" data-notice-control data-part="notification-count" onClick={onExpand}
      aria-label={`${n.count} times: show each`} title="Show each"
      className="pointer-events-auto relative mt-0.5 flex shrink-0 cursor-pointer flex-col items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 before:absolute before:-inset-2 before:content-[''] pointer-coarse:before:-inset-3">
      <span data-slot="notification-pile" className="relative size-4">
        {Array.from({ length: copies }, (_, i) => i + 1).reverse().map((k) => (
          <Icon key={k} aria-hidden className="absolute inset-0 size-4 rounded-full bg-popover"
            // each fainter and smaller by its place in the pile, down to nearly nothing at the last
            // (16%, 75% across: 0.85 and 58% half way, tuned by eye)
            style={{ color: ink, transform: `translateY(${k * gap}px) scale(${1 - 0.25 * (k / copies) ** 0.74})`, opacity: 1 - (0.84 * k) / copies, zIndex: copies + 1 - k }} />
        ))}
        <Icon aria-hidden className="relative size-4 rounded-full bg-popover" style={{ color: ink, zIndex: copies + 1 }} />
      </span>
    </button>
  );
}

/** How many: a badge centred on the card's top-left corner, above the pile, from the second arrival on
 *. It pops when the number goes up; the pile's own label says it to a screen reader. */
function PileCount({ notice: n }: { notice: Notice }) {
  if (n.count < 2) return null;
  return <Count key={n.count} aria-hidden data-part="notification-count-badge" value={n.count} tone={COUNT_TONE[n.tone]}
    className="absolute top-0 left-0 z-20 -translate-x-1/2 -translate-y-1/2" />;
}

/** Dragged this far sideways (or flicked this fast, px/ms), a notification goes. */

// A card is pressed like a button: held, it grows slightly (the `scale` property: drawn bigger,
// never moving anything around it), and a release opens it. Dragged sideways it follows the
// pointer; let go, and where its speed would carry it decides: past half its width it leaves that
// way, otherwise it springs back (lib/motion).
function Card({ notice: n, measure, height, exact, y, scale, opacity, z, back, onExpand }: {
  notice: Notice; measure(el: HTMLDivElement | null): void;
  /** How tall it is (measured): its pile fits the room under its icon. */
  height: number;
  /** Every one of its stack listed: it says the time it came, to the second. */
  exact: boolean;
  y: number; scale: number; opacity: number; z: number; back: boolean; onExpand(): void;
}) {
  const Icon = ICON[n.tone];
  const go = clickTarget(n);
  const [pressed, setPressed] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const dragged = React.useRef(false);
  const el = React.useRef<HTMLDivElement | null>(null);
  // Its sideways position is a spring: under the finger while dragged, then back or away at the
  // speed it was let go with. It fades as it goes.
  const x = useSpring(0, (v) => {
    const card = el.current;
    if (!card) return;
    card.style.setProperty('--drag-x', `${v}px`);
    card.style.filter = v ? `opacity(${Math.max(0, 1 - Math.abs(v) / ((card.offsetWidth || 300) * 0.9)).toFixed(3)})` : '';
  });
  // Leaving (dragged, flicked, closed or timed out): it goes off the way it was sent.
  React.useEffect(() => {
    if (n.leaving) x.to((n.away ?? 1) * ((el.current?.offsetWidth || 300) + 48), { config: { stiffness: 520, damping: 44 } });
  }, [n.leaving, n.away, x]);

  const drag = useDrag({
    axis: 'x',
    threshold: 5,
    ignore: '[data-notice-control]',
    onStart: () => { if (back || n.leaving) return false; dragged.current = true; setPressed(false); setDragging(true); },
    onMove: (d) => x.set(d),
    onEnd: (d, velocity) => {
      setDragging(false);
      const width = el.current?.offsetWidth || 300;
      // Where the flick would carry it: past half its width either way and it leaves that way.
      const end = landing(d, velocity, [-width, 0, width]);
      if (end !== 0) { x.velocity = velocity; dismiss(n.id, end < 0 ? -1 : 1); }
      else x.to(0, { velocity });
    },
  });
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || back || n.leaving) return;
    // The close and action buttons are pressed on their own.
    if ((e.target as Element).closest('[data-notice-control]')) return;
    dragged.current = false;
    setPressed(true);
    const release = () => { setPressed(false); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    drag.onPointerDown(e);
  };

  return (
    <div ref={(node) => { el.current = node; measure(node); }} data-notice={n.id} data-slot="notification" data-tone={n.tone} data-leaving={n.leaving || undefined}
      data-pressed={pressed || undefined} data-dragging={dragging || undefined}
      role={n.tone === 'error' ? 'alert' : 'status'} aria-hidden={back || n.leaving || undefined} inert={back || n.leaving || undefined}
      className="absolute inset-x-0 top-0 touch-pan-y rounded-xl border bg-popover text-popover-foreground shadow-lg select-none"
      onPointerDown={onPointerDown}
      // Under a mouse its timer waits; a finger's stack holds them while it is open (Stack).
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') holdNotice(n.id, true); }}
      onPointerLeave={(e) => { if (e.pointerType !== 'touch') holdNotice(n.id, false); }}
      onFocus={() => holdNotice(n.id, true, 'focus')}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) holdNotice(n.id, false, 'focus'); }}
      // The click that ends a drag is not a click on the notification.
      onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } }}
      style={{
        transform: `translateY(${y}px) scale(${scale})`, opacity, zIndex: z,
        ['--notice-ink' as string]: INK[n.tone],
      }}>
      {go && <button type="button" aria-label={`Open: ${n.title}`} className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35" onClick={go} />}
      <div className="pointer-events-none relative flex items-start gap-2.5 py-3 pr-10 pl-3.5 text-[13px] pointer-coarse:pr-12">
        {n.count > 1 ? <Pile notice={n} height={height} onExpand={onExpand} /> : Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color: INK[n.tone] }} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 font-medium break-words">{n.title}</span>
            <When at={n.at} exact={exact} />
          </div>
          {n.description && <div className="mt-0.5 text-muted-foreground">{n.description}</div>}
        </div>
        {n.action && (
          // centred on the title's line, not hanging from its top (24px tall, a finger's 32px)
          <Button variant="outline" size="xs" data-notice-control className="pointer-events-auto -my-0.5 shrink-0 pointer-coarse:-my-1.5 pointer-coarse:h-8 pointer-coarse:px-3"
            onClick={() => { n.action!.onClick(); dismiss(n.id); }}>{n.action.label}</Button>
        )}
      </div>
      <Button variant="ghost" size="icon-xs" data-notice-control aria-label={`Close: ${n.title}`} onClick={() => dismiss(n.id)}
        className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground pointer-coarse:top-1 pointer-coarse:right-1 pointer-coarse:size-9">
        <X aria-hidden />
      </Button>
      <PileCount notice={n} />
      {/* The time bar, clipped to the card's rounded corners (the card itself does not clip, so its badge can sit on the corner). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div key={n.count} data-slot="notification-time" className="absolute bottom-0 left-0 h-[3px] w-full origin-left"
          style={{ background: INK[n.tone], ['--notice-ms' as string]: `${n.ms}ms`, animationPlayState: n.running ? 'running' : 'paused' }} />
      </div>
    </div>
  );
}

/** "3 min ago", kept current; the full date and time on hover and for assistive technology. */
/** When it came: "just now", "5 min ago"…, or (`exact`, every one of its stack listed, where a burst all
 *  "just now" tells them apart by nothing) the time to the second. */
function When({ at, exact = false }: { at: number; exact?: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  const full = new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <time dateTime={new Date(at).toISOString()} title={full} data-slot="notification-when" data-exact={exact || undefined}
      className="ml-auto shrink-0 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
      {exact ? new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : whenSaid(at, now)}
    </time>
  );
}

export { Notifications };
