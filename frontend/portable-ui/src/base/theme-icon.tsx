// The theme button's icon: a sun that becomes a moon (the page switches at once,
// the theme button alone animates), drawn as the app's own icons are: Lucide's sun and moon, an
// outline 2px wide with round ends and joins ("in line with the icons being used elsewhere"). The
// motion is web.dev's "Building a theme switch component" (Adam Argyle), with its timings and Open
// Props' easings: going dark the sun's ring grows (4 to 9) and its rays turn away and fade, then a
// bite slides in from the top right to make the crescent; going light the bite slides off at once,
// the ring springs back and the rays spring out.
//
// The ring and the bite are one outline (`outline`): where the two circles cross, the ring's arc away
// from the bite and the bite's arc inside the ring, joined round, as Lucide draws its moon; the ring
// alone while they do not meet. It follows <html data-theme> (a MutationObserver), not React, and its
// clock moves at most STEP_MS a frame: the switch restyles the whole page, and React draws after it,
// so the first frames can be long; on the wall clock (a CSS transition's) the growing ring was over
// before it was ever drawn. Slow frames slow it down; none of it is skipped.
import * as React from 'react';
import { cn } from '../lib/utils';

/** Lucide's sun's eight rays. */
const RAYS: [number, number, number, number][] = [
  [12, 2, 12, 4], [12, 20, 12, 22], [4.93, 4.93, 6.34, 6.34], [17.66, 17.66, 19.07, 19.07],
  [2, 12, 4, 12], [20, 12, 22, 12], [6.34, 17.66, 4.93, 19.07], [19.07, 4.93, 17.66, 6.34],
];
/** The ring's radius and the bite's centre: Lucide's sun (a ring of 4, the bite far off to the top
 *  right), and Lucide's moon (a ring of 9 with a bite of 6.364 about (16.5, 7.5): its arcs meet at
 *  (12, 3) and (21, 12)). */
type Shape = { r: number; bx: number; by: number; /** the rays' turn (degrees) and opacity */ turn: number; rays: number };
const SUN: Shape = { r: 4, bx: 26, by: -2, turn: 0, rays: 1 };
const MOON: Shape = { r: 9, bx: 16.5, by: 7.5, turn: -25, rays: 0 };
const BITE = 6.364;

/** An easing curve, cubic-bezier(x1, y1, x2, y2): the share of the way at a share of the time. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
    return at(y1, y2, t);
  };
}
// Open Props' --ease-3, --ease-out-5, --ease-elastic-out-3 and -4.
const EASE_3 = bezier(0.25, 0, 0.3, 1);
const EASE_OUT_5 = bezier(0, 0, 0, 1);
const ELASTIC_3 = bezier(0.5, 1.25, 0.75, 1.25);
const ELASTIC_4 = bezier(0.5, 1.5, 0.75, 1.25);
type Part = { delay: number; time: number; ease: (x: number) => number };
/** How each part goes, by where it is going (the article's): seconds of delay and of motion. */
const GOING: Record<'dark' | 'light', Record<'ring' | 'bite' | 'turn' | 'rays', Part>> = {
  dark: {
    ring: { delay: 0, time: 0.25, ease: EASE_3 }, bite: { delay: 0.25, time: 0.5, ease: EASE_OUT_5 },
    turn: { delay: 0, time: 0.15, ease: ELASTIC_4 }, rays: { delay: 0, time: 0.15, ease: EASE_3 },
  },
  light: {
    ring: { delay: 0, time: 0.5, ease: ELASTIC_3 }, bite: { delay: 0, time: 0.25, ease: EASE_OUT_5 },
    turn: { delay: 0, time: 0.5, ease: ELASTIC_4 }, rays: { delay: 0, time: 0.5, ease: EASE_3 },
  },
};

const f = (n: number) => +n.toFixed(3);

/** The outline of a ring of `r` about (12, 12) with a bite of BITE about (bx, by) taken out of it. */
export function outline({ r, bx, by }: Pick<Shape, 'r' | 'bx' | 'by'>): string {
  const dx = bx - 12, dy = by - 12, d = Math.hypot(dx, dy);
  const ring = `M${f(12 - r)} 12a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  if (d >= r + BITE || d <= Math.abs(r - BITE) || r <= 0) return ring;
  // Where the two circles cross.
  const a = (r * r - BITE * BITE + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a));
  const mx = 12 + (a * dx) / d, my = 12 + (a * dy) / d;
  const p = { x: mx + (h * dy) / d, y: my - (h * dx) / d }, q = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  /** The arc about (cx, cy) from `from` to `to` that passes `via`: its large-arc and sweep flags. */
  const flags = (cx: number, cy: number, from: { x: number; y: number }, to: { x: number; y: number }, via: number) => {
    const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const t0 = Math.atan2(from.y - cy, from.x - cx), span = turn(Math.atan2(to.y - cy, to.x - cx) - t0);
    const sweep = turn(via - t0) < span ? 1 : 0;
    const length = sweep ? span : 2 * Math.PI - span;
    return `${length > Math.PI ? 1 : 0} ${sweep}`;
  };
  // The ring's arc away from the bite, then the bite's arc back inside the ring.
  const away = Math.atan2(-dy, -dx), toward = Math.atan2(12 - by, 12 - bx);
  return `M${f(p.x)} ${f(p.y)}A${f(r)} ${f(r)} 0 ${flags(12, 12, p, q, away)} ${f(q.x)} ${f(q.y)}`
    + `A${BITE} ${BITE} 0 ${flags(bx, by, q, p, toward)} ${f(p.x)} ${f(p.y)}Z`;
}

const isDark = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The most the morph's clock moves in one frame (ms): a long frame does not skip it ahead. */
const STEP_MS = 34;

const raysOf = (s: Shape) => ({ transform: `rotate(${f(s.turn)} 12 12)`, opacity: `${f(Math.max(0, Math.min(1, s.rays)))}` });

export function ThemeIcon({ className }: { className?: string }) {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const path = React.useRef<SVGPathElement>(null);
  const beams = React.useRef<SVGGElement>(null);
  const [first] = React.useState(() => (isDark() ? MOON : SUN));
  React.useEffect(() => {
    let now: Shape = first;
    let frame = 0;
    const draw = (s: Shape) => {
      now = s;
      path.current?.setAttribute('d', outline(s));
      const rays = raysOf(s);
      beams.current?.setAttribute('transform', rays.transform);
      beams.current?.setAttribute('opacity', rays.opacity);
    };
    // From where it is drawn to the theme's shape, each part on its own curve.
    const go = () => {
      cancelAnimationFrame(frame);
      const dark = isDark(), to = dark ? MOON : SUN, from = now;
      if (reduced()) { draw(to); return; }
      const how = GOING[dark ? 'dark' : 'light'];
      const end = Math.max(...Object.values(how).map((p) => p.delay + p.time));
      let last = -1, s = 0;
      const step = (t: number) => {
        if (last >= 0) s += Math.min(t - last, STEP_MS) / 1000;
        last = t;
        const at = (p: Part) => p.ease(Math.min(1, Math.max(0, (s - p.delay) / p.time)));
        const mix = (a: number, b: number, k: number) => a + (b - a) * k;
        const ring = at(how.ring), bite = at(how.bite);
        draw({ r: mix(from.r, to.r, ring), bx: mix(from.bx, to.bx, bite), by: mix(from.by, to.by, bite), turn: mix(from.turn, to.turn, at(how.turn)), rays: mix(from.rays, to.rays, at(how.rays)) });
        if (s < end) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    if ((isDark() ? MOON : SUN) !== first) draw(isDark() ? MOON : SUN);
    const watch = new MutationObserver(go);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { watch.disconnect(); cancelAnimationFrame(frame); };
  }, [first]);
  return (
    // A name of its own (each must be unique on the page) and the class the crossfade knows it by:
    // drawn over the fading page, morphing, rather than faded with it (styles.css "Theme switch").
    <svg className={cn('sun-and-moon', className)} data-theme-morph="" aria-hidden width="24" height="24" viewBox="0 0 24 24"
      style={{ viewTransitionName: `theme-icon-${id}`, viewTransitionClass: 'theme-icon' } as React.CSSProperties}
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path ref={path} className="sun" d={outline(first)} />
      <g ref={beams} className="sun-beams" {...raysOf(first)}>
        {RAYS.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      </g>
    </svg>
  );
}
