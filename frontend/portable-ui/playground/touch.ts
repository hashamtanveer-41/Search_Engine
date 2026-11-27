// The playground's Phone and Tablet frames act like the device, not only its width (// "the phone one should act like a phone, not just resized"). Inside the frame a mouse is a finger,
// as a browser's device mode has it:
//
// - The page says it is under a finger (`data-pointer="coarse"` on <html>): Tailwind's
//   `pointer-coarse:`, `pointer-fine:` and `hover:` read it (src/styles.css), and `matchMedia` answers
//   pointer and hover queries as a phone's. Controls are finger-sized; nothing reacts to hover.
// - The mouse's own events are kept from the page. A press is sent as a touch: the pointer events of
//   a finger (pointerType 'touch', held on what it pressed), touchstart, touchmove and touchend, and,
//   for a tap, the mousedown and mouseup a phone sends after it. Moving with no button pressed sends
//   nothing: a finger in the air is not there.
// - A drag pans what it is on, as a finger does: the nearest thing that scrolls that way, unless
//   `touch-action` keeps the finger for the page (a tab row's sideways drag) or a touchmove is
//   cancelled (the scrub, holding a line). The page gets a pointercancel, and a flick carries on.
// - A round cursor where the finger is, no scrollbars taking room, no text selected by a drag.
//
// The wheel still scrolls, for convenience. Installed from main.tsx, before the page is drawn.

/** How far a finger moves before it is a pan, not a press (px). */
const SLOP = 8;
/** A flick's speed lost each millisecond after the finger lifts (a phone's scroll friction). */
const FRICTION = 0.998;

const COARSE: [RegExp, string][] = [
  [/\((any-)?pointer:\s*coarse\)/g, '(min-width: 0px)'],
  [/\((any-)?pointer:\s*fine\)/g, '(min-width: 99999px)'],
  [/\((any-)?hover:\s*hover\)/g, '(min-width: 99999px)'],
  [/\((any-)?hover:\s*none\)/g, '(min-width: 0px)'],
];

const STYLE = `
  html[data-pointer='coarse'], html[data-pointer='coarse'] * {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Ccircle cx='14' cy='14' r='11' fill='rgba(120,120,120,.3)' stroke='rgba(80,80,80,.7)' stroke-width='1.5'/%3E%3C/svg%3E") 14 14, default !important;
    scrollbar-width: none;
  }
  html[data-pointer='coarse'] body { user-select: none; -webkit-user-select: none; }
  html[data-pointer='coarse'] :is(input, textarea, [contenteditable='true']) { user-select: text; -webkit-user-select: text; }
`;

type Axis = 'x' | 'y';

/** Whether `touch-action` from the element up to (and including) the scroller lets a finger pan that way. */
function pans(from: Element, scroller: Element, axis: Axis): boolean {
  for (let el: Element | null = from; el; el = el.parentElement) {
    const action = getComputedStyle(el).touchAction || 'auto';
    if (action === 'none') return false;
    if (action !== 'auto' && action !== 'manipulation' && !action.includes(axis === 'x' ? 'pan-x' : 'pan-y') && !action.includes(axis === 'x' ? 'pan-left' : 'pan-up') && !action.includes(axis === 'x' ? 'pan-right' : 'pan-down')) return false;
    if (el === scroller) break;
  }
  return true;
}

/** The nearest element that can still scroll by `delta` along the axis, the page's own included. */
function scrollerFor(from: Element, axis: Axis, delta: number): Element | null {
  const page = document.scrollingElement;
  for (let el: Element | null = from; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    const scrolls = el === page || overflow === 'auto' || overflow === 'scroll';
    if (!scrolls) continue;
    const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
    const max = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
    if (max > 0 && (delta > 0 ? pos < max - 0.5 : pos > 0.5)) return el;
  }
  return null;
}

/** The events the emulation sends itself: never taken for the mouse's own. */
const sent = new WeakSet<Event>();

export interface TouchOptions {
  /** Whether an event is the mouse's own (the browser's); tests, where none is, say which are. */
  real?(e: Event): boolean;
}

export function emulateTouch(win: Window = window, { real: fromMouse = (e) => e.isTrusted }: TouchOptions = {}): () => void {
  const isMouse = (e: Event) => !sent.has(e) && fromMouse(e);
  const doc = win.document;
  const root = doc.documentElement;
  root.dataset.pointer = 'coarse';
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.head.append(style);

  const media = win.matchMedia?.bind(win);
  if (media) win.matchMedia = (query: string) => media(COARSE.reduce((q, [from, to]) => q.replace(from, to), query));

  let press: {
    id: number; target: Element; x0: number; y0: number; x: number; y: number; t: number;
    pan: { el: Element; axis: Axis } | null; vx: number; vy: number;
    /** No pan for this press: a touchmove was cancelled, or the pointer was cancelled. */
    held: boolean; startPrevented: boolean; downPrevented: boolean;
  } | null = null;
  let fling = 0;

  const send = (target: EventTarget, type: string, e: MouseEvent, extra: PointerEventInit = {}) => {
    const down = type === 'pointerdown' || type === 'pointermove';
    const event = new PointerEvent(type, {
      bubbles: !/enter|leave/.test(type), cancelable: !/enter|leave|cancel/.test(type), composed: true,
      pointerId: (e as PointerEvent).pointerId ?? 1, pointerType: 'touch', isPrimary: true, width: 20, height: 20,
      pressure: down ? 0.5 : 0, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
      button: type === 'pointermove' ? -1 : 0, buttons: down ? 1 : 0, ...extra,
    });
    sent.add(event);
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const touch = (type: string, e: MouseEvent, target: Element, cancelable = true) => {
    const point = { identifier: (e as PointerEvent).pointerId ?? 1, target, clientX: e.clientX, clientY: e.clientY, pageX: e.pageX, pageY: e.pageY, screenX: e.screenX, screenY: e.screenY, radiusX: 10, radiusY: 10, force: type === 'touchend' ? 0 : 1, rotationAngle: 0 };
    const event = new Event(type, { bubbles: true, cancelable, composed: true });
    const lifted = type === 'touchend' || type === 'touchcancel';
    Object.assign(event, { touches: lifted ? [] : [point], targetTouches: lifted ? [] : [point], changedTouches: [point] });
    sent.add(event);
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  /** A finger coming down on, or lifting off, an element: over and enter, or out and leave, for it and those around it. */
  const arrive = (target: Element, e: MouseEvent, leaving: boolean) => {
    const chain: Element[] = [];
    for (let el: Element | null = target; el; el = el.parentElement) chain.push(el);
    if (leaving) {
      send(target, 'pointerout', e, { relatedTarget: null });
      for (const el of chain) send(el, 'pointerleave', e, { relatedTarget: null });
    } else {
      send(target, 'pointerover', e, { relatedTarget: null });
      for (const el of chain.reverse()) send(el, 'pointerenter', e, { relatedTarget: null });
    }
  };
  /** One click, a moment from now, kept from the page (after a pan, or a press that stopped a flick). */
  const swallowClick = () => {
    const stop = (ev: Event) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
    win.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => win.removeEventListener('click', stop, { capture: true }), 400);
  };
  const stopFling = () => { if (fling) { cancelAnimationFrame(fling); fling = 0; return true; } return false; };
  const flick = (el: Element, axis: Axis, v: number) => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      v *= FRICTION ** dt;
      if (Math.abs(v) < 0.02) { fling = 0; return; }
      if (axis === 'x') el.scrollLeft += v * dt; else el.scrollTop += v * dt;
      fling = requestAnimationFrame(step);
    };
    fling = requestAnimationFrame(step);
  };

  // The mouse's hovering, and its own mouse events: a finger has neither.
  const quiet = (e: Event) => { if (isMouse(e)) e.stopImmediatePropagation(); };

  const onDown = (e: PointerEvent) => {
    if (!isMouse(e) || e.pointerType !== 'mouse') return;
    e.stopImmediatePropagation();
    if (e.button !== 0) return;
    const target = e.target as Element;
    // A finger is held on what it pressed until it lifts.
    try { target.setPointerCapture(e.pointerId); } catch { /* gone */ }
    // A press while a flick runs only stops it.
    const stopped = stopFling();
    press = { id: e.pointerId, target, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, pan: null, vx: 0, vy: 0, held: stopped, startPrevented: false, downPrevented: false };
    if (stopped) swallowClick();
    arrive(target, e, false);
    press.startPrevented = touch('touchstart', e, target);
    press.downPrevented = send(target, 'pointerdown', e);
  };

  const onMove = (e: PointerEvent) => {
    if (!isMouse(e) || e.pointerType !== 'mouse') return;
    e.stopImmediatePropagation();
    // A finger in the air is not there; a release that was missed (outside the frame) lifts it.
    if (!press) return;
    if (!(e.buttons & 1)) { onUp(e); return; }
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    const dt = Math.max(1, e.timeStamp - press.t);
    press.vx = 0.6 * press.vx + 0.4 * (-dx / dt);
    press.vy = 0.6 * press.vy + 0.4 * (-dy / dt);
    press.x = e.clientX; press.y = e.clientY; press.t = e.timeStamp;
    if (press.pan) {
      if (press.pan.axis === 'x') press.pan.el.scrollLeft -= dx; else press.pan.el.scrollTop -= dy;
      return;
    }
    const prevented = touch('touchmove', e, press.target);
    if (prevented) press.held = true;
    const tx = e.clientX - press.x0, ty = e.clientY - press.y0;
    if (!press.held && !press.startPrevented && Math.hypot(tx, ty) > SLOP) {
      const axis: Axis = Math.abs(tx) > Math.abs(ty) ? 'x' : 'y';
      const el = scrollerFor(press.target, axis, axis === 'x' ? -tx : -ty);
      if (el && pans(press.target, el, axis)) {
        // The browser takes the finger: the page hears a cancel, and nothing more of this press.
        press.pan = { el, axis };
        send(press.target, 'pointercancel', e);
        arrive(press.target, e, true);
        touch('touchcancel', e, press.target, false);
        swallowClick();
        if (axis === 'x') el.scrollLeft -= tx; else el.scrollTop -= ty;
        return;
      }
      // Not a pan this way (touch-action keeps it, or nothing scrolls): the page has the finger.
      press.held = true;
    }
    send(press.target, 'pointermove', e);
  };

  const onUp = (e: PointerEvent) => {
    if (!isMouse(e) || e.pointerType !== 'mouse') return;
    e.stopImmediatePropagation();
    const p = press;
    press = null;
    if (!p) return;
    if (p.pan) {
      // Let go moving: it carries on.
      const v = p.pan.axis === 'x' ? p.vx : p.vy;
      if (e.timeStamp - p.t < 80 && Math.abs(v) > 0.1) flick(p.pan.el, p.pan.axis, v);
      return;
    }
    if (e.type === 'pointercancel') { send(p.target, 'pointercancel', e); arrive(p.target, e, true); touch('touchcancel', e, p.target, false); return; }
    const upPrevented = send(p.target, 'pointerup', e);
    arrive(p.target, e, true);
    const endPrevented = touch('touchend', e, p.target);
    // A tap: the mouse events a phone sends after it (Radix's tabs choose on mousedown), and its click.
    if (p.startPrevented || endPrevented) { swallowClick(); return; }
    if (!p.downPrevented && !upPrevented) {
      const init: MouseEventInit = { bubbles: true, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: 0 };
      for (const [type, buttons] of [['mousedown', 1], ['mouseup', 0]] as const) {
        const event = new MouseEvent(type, { ...init, buttons });
        sent.add(event);
        p.target.dispatchEvent(event);
      }
    }
  };

  const mouse = ['mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave'];
  const pointerQuiet = ['pointerover', 'pointerout', 'pointerenter', 'pointerleave'];
  win.addEventListener('pointerdown', onDown, true);
  win.addEventListener('pointermove', onMove, true);
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('pointercancel', onUp, true);
  for (const type of [...mouse, ...pointerQuiet]) win.addEventListener(type, quiet, true);
  return () => {
    stopFling();
    delete root.dataset.pointer;
    style.remove();
    if (media) win.matchMedia = media;
    win.removeEventListener('pointerdown', onDown, true);
    win.removeEventListener('pointermove', onMove, true);
    win.removeEventListener('pointerup', onUp, true);
    win.removeEventListener('pointercancel', onUp, true);
    for (const type of [...mouse, ...pointerQuiet]) win.removeEventListener(type, quiet, true);
  };
}
