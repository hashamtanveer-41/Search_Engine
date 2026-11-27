// Track: a row of choices with one pill under the chosen one. The tabs' list (base/tabs.tsx) and the
// segmented control (base/segmented.tsx) are the same row, drawn and moved by this one piece of code
// (the two looked alike, and only the tabs could be dragged).
//
// The pill (or underline, for the tabs' "line") is one element, positioned by its left and right
// edges, that moves the moment an item is pressed. Dragged, it follows the pointer (a finger too)
// freely, like macOS: it can sit between two items, taking a width between theirs; let go and the
// item nearest the pointer is chosen (the end one when let go beyond the row, above or below it
// included) and it settles there. Its moves are springs, so a new press mid-move redirects it from
// wherever it is. The line stretches toward the press: its leading edge goes first and the trailing
// edge catches up. The pill sits under the labels, so they stay readable wherever it is.
//
//   const track = useTrack<HTMLDivElement>({ items: '[data-slot="x-item"]', chosen: '[data-state="on"]', pick: (el) => choose(el) });
//   <div ref={track.ref} onPointerDown={track.onPointerDown} className={TRACK}>
//     {track.box && <span ref={track.indicator} className={PILL} style={track.place} />}
//     …items
//   </div>
import * as React from 'react';
import { SPRINGS, useSpring, VelocityTracker } from '../lib/motion';
import { useScrub } from './scrub';

/** The muted row (its height and padding are the caller's). It never grows wider than its room: its
 *  items scroll inside it. A finger drags the pill sideways at once and scrolls the page up and down,
 *  unless the row scrolls sideways itself; a long press is not a selection or a menu (base/scrub.ts). */
export const TRACK = 'relative inline-flex w-fit max-w-full min-w-0 items-center overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground select-none [scrollbar-width:none] [-webkit-touch-callout:none] not-data-scrolls:touch-pan-y';
/** The pill under the chosen item. */
export const PILL = 'pointer-events-none absolute z-0 rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30';
/** An item: over the pill, muted until chosen. */
export const ITEM = 'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent font-medium whitespace-nowrap text-foreground/60 transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4';

export interface TrackOptions {
  /** The row's items. */
  items: string;
  /** Which of them is chosen (matched on an item). */
  chosen: string;
  /** Choose an item: the one pressed, or the one nearest where a drag was let go. */
  pick(item: HTMLElement): void;
  /** An underline under the chosen item instead of a pill. */
  line?: boolean;
  onPointerDown?(e: React.PointerEvent<HTMLElement>): void;
}

export interface TrackBox { x: number; y: number; w: number; h: number; listW: number; item: HTMLElement }

export function useTrack<T extends HTMLElement>({ items, chosen, pick, line = false, onPointerDown }: TrackOptions) {
  const ref = React.useRef<T>(null);
  const node = React.useRef<HTMLSpanElement | null>(null);
  // Where the chosen item sits in the row, kept current as items change or resize.
  const [box, setBox] = React.useState<TrackBox | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      // A row that scrolls sideways keeps its finger scroll (and a finger held on it scrubs).
      el.toggleAttribute('data-scrolls', el.scrollWidth > el.clientWidth + 1);
      const on = el.querySelector<HTMLElement>(`${items}${chosen}`);
      setBox((b) => {
        if (!on) return null;
        const next = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight, listW: el.clientWidth, item: on };
        return b && b.item === on && b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h && b.listW === next.listW ? b : next;
      });
    };
    // The row, and each item: a row as wide as its room keeps its size while its items grow (the
    // Workbook's counts arriving, a font loading), which moved the chosen one out from over its line
    // (it rested between two tabs on a fresh load).
    const sizes = new ResizeObserver(place);
    const watch = () => { sizes.disconnect(); sizes.observe(el); el.querySelectorAll(items).forEach((t) => sizes.observe(t)); };
    watch();
    place();
    const changes = new MutationObserver((found) => { if (found.some((m) => m.type === 'childList')) watch(); place(); });
    changes.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    return () => { changes.disconnect(); sizes.disconnect(); };
  }, [items, chosen]);

  // Its two edges are springs: a press sends both to the new item from wherever they are, a drag
  // holds them under the pointer and its speed carries into the settle. The line's leading edge is
  // the stiffer one, so it stretches toward the press and the trailing edge catches up.
  const leftEdge = useSpring(0, (v) => node.current?.style.setProperty('left', `${v}px`));
  const rightEdge = useSpring(0, (v) => node.current?.style.setProperty('right', `${v}px`));
  // Until the chosen item is laid out (a hidden pane), the next placement jumps; so does one where the
  // same item only moved or changed size (the row laid out anew under it): the pill stays with it.
  const placed = React.useRef(false);
  const last = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (!box || !node.current) return;
    const left = box.x, right = box.listW - box.x - box.w;
    const same = last.current === box.item;
    last.current = box.item;
    if (!placed.current || !box.w || same) { placed.current = box.w > 0; leftEdge.jump(left); rightEdge.jump(right); return; }
    const toRight = left > leftEdge.value;
    const lead = { stiffness: 700, damping: 52 }, trail = { stiffness: 260, damping: 30 };
    leftEdge.to(left, line ? { config: toRight ? trail : lead } : { config: SPRINGS.settle });
    rightEdge.to(right, line ? { config: toRight ? lead : trail } : { config: SPRINGS.settle });
  }, [box, line, leftEdge, rightEdge]);
  // Drawn where the springs are the moment it attaches.
  const indicator = React.useCallback((el: HTMLSpanElement | null) => {
    node.current = el;
    if (!el) return;
    el.style.left = `${leftEdge.value}px`;
    el.style.right = `${rightEdge.value}px`;
  }, [leftEdge, rightEdge]);
  const speed = React.useRef(new VelocityTracker());

  // Dragged, the pill follows the pointer: written straight onto it, with no React render and no
  // choosing on the way (the item nearest the pointer is chosen on release, like macOS), so nothing
  // else on the page has to keep up. The press-and-drag itself is the shared scrub (base/scrub.ts),
  // the same as a code listing's current line.
  const enabled = () => [...(ref.current?.querySelectorAll<HTMLElement>(items) ?? [])].filter((t) => !t.matches(':disabled, [data-disabled]'));
  const draw = (x: number) => {
    const list = ref.current, el = node.current, all = enabled();
    if (!list || !el || !all.length) return;
    const centres = all.map((t) => t.offsetLeft + t.offsetWidth / 2);
    // Its width eases between the two items either side of the pointer.
    let i = centres.findIndex((c) => c > x);
    if (i === -1) i = all.length;
    const ia = Math.max(0, i - 1), ib = Math.min(all.length - 1, i);
    const f = centres[ib] === centres[ia] ? 0 : Math.min(1, Math.max(0, (x - centres[ia]) / (centres[ib] - centres[ia])));
    const width = all[ia].offsetWidth + (all[ib].offsetWidth - all[ia].offsetWidth) * f;
    const left = x - width / 2;
    speed.current.add(left);
    leftEdge.set(left);
    rightEdge.set(list.clientWidth - left - width);
  };
  const settle = () => {
    const list = ref.current;
    // Settle on the chosen item (the same one again included) from wherever the drag left it, at the
    // speed it was going.
    const on = list?.querySelector<HTMLElement>(`${items}${chosen}`);
    const v = speed.current.velocity();
    speed.current.reset();
    if (list && on) {
      leftEdge.to(on.offsetLeft, { velocity: v, config: SPRINGS.settle });
      rightEdge.to(list.clientWidth - on.offsetLeft - on.offsetWidth, { velocity: -v, config: SPRINGS.settle });
    }
  };
  const scrubber = useScrub({
    axis: 'x',
    ignore: '[data-no-scrub]',
    stops: () => enabled().map((t) => t.offsetLeft + t.offsetWidth / 2),
    onPick: (i) => { const t = enabled()[i]; if (t && !t.matches(chosen)) pick(t); },
    onDrag: (x) => {
      if (x === null) { requestAnimationFrame(settle); return; }
      draw(x);
    },
  });
  const press = (e: React.PointerEvent<T>) => {
    onPointerDown?.(e);
    scrubber.onPointerDown(e);
  };
  return { ref, box, indicator, onPointerDown: press };
}
