// The Phone and Tablet frames' touch screen (touch.ts): what the page hears when a mouse is a finger.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emulateTouch } from './touch';

let undo: () => void = () => {};
let heard: string[] = [];
const listen = (el: EventTarget, types: string[]) => {
  for (const type of types) el.addEventListener(type, (e) => heard.push(`${type}${(e as PointerEvent).pointerType ? `:${(e as PointerEvent).pointerType}` : ''}`));
};
/** The mouse's own events (jsdom's are all untrusted: the emulation is told these are the mouse's). */
const mouse = (target: EventTarget, type: string, init: PointerEventInit = {}) => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, ...init });
  (event as unknown as { mine: boolean }).mine = true;
  target.dispatchEvent(event);
};

beforeEach(() => {
  heard = [];
  // jsdom has no PointerEvent: without one, pointer events carry no pointerId or pointerType.
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string; isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'mouse'; this.isPrimary = init.isPrimary ?? false; }
  });
  window.matchMedia = ((q: string) => ({ matches: q === '(min-width: 0px)', media: q })) as unknown as typeof window.matchMedia;
  undo = emulateTouch(window, { real: (e) => !!(e as unknown as { mine?: boolean }).mine });
});
afterEach(() => { undo(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('a mouse in a Phone or Tablet frame', () => {
  it('makes the page a touch screen: finger-sized, and no hover', () => {
    expect(document.documentElement.dataset.pointer).toBe('coarse');
    expect(matchMedia('(pointer: coarse)').matches).toBe(true);
    expect(matchMedia('(any-pointer: coarse)').matches).toBe(true);
    expect(matchMedia('(pointer: fine)').matches).toBe(false);
    expect(matchMedia('(hover: hover)').matches).toBe(false);
    expect(matchMedia('(hover: none)').matches).toBe(true);
    undo();
    expect(document.documentElement.dataset.pointer).toBeUndefined();
    undo = () => {};
  });

  it('a tap is a finger\'s: the page hears touch pointer events and touch events, then the mouse events a phone sends after a tap', () => {
    document.body.innerHTML = '<button>Save</button>';
    const button = document.querySelector('button')!;
    listen(button, ['pointerover', 'pointerdown', 'pointerup', 'pointerout', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'mousemove']);
    mouse(button, 'pointerdown');
    mouse(button, 'mousedown');
    mouse(button, 'pointerup');
    mouse(button, 'mouseup');
    expect(heard).toEqual(['pointerover:touch', 'touchstart', 'pointerdown:touch', 'pointerup:touch', 'pointerout:touch', 'touchend', 'mousedown', 'mouseup']);
  });

  it('a finger in the air is not there: moving with no button pressed sends nothing', () => {
    document.body.innerHTML = '<button>Save</button>';
    const button = document.querySelector('button')!;
    listen(button, ['pointermove', 'pointerover', 'pointerenter', 'mousemove', 'mouseover']);
    mouse(button, 'pointerover', { buttons: 0 });
    mouse(button, 'pointerenter', { buttons: 0 });
    mouse(button, 'pointermove', { buttons: 0 });
    mouse(button, 'mousemove', { buttons: 0 });
    expect(heard).toEqual([]);
  });

  it('a drag pans what scrolls under it: the page hears a cancel, and the click after it is kept from the page', () => {
    document.body.innerHTML = '<div id="list" style="overflow-y: auto"><button>Row</button></div>';
    const list = document.getElementById('list')!, row = list.querySelector('button')!;
    Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    listen(row, ['pointercancel', 'pointermove', 'click']);
    mouse(row, 'pointerdown', { clientX: 50, clientY: 200 });
    mouse(row, 'pointermove', { clientX: 50, clientY: 150 });
    mouse(row, 'pointermove', { clientX: 50, clientY: 100 });
    expect(heard).toEqual(['pointercancel:touch']);
    expect(list.scrollTop).toBe(100);
    mouse(row, 'pointerup', { clientX: 50, clientY: 100 });
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(heard).toEqual(['pointercancel:touch']);
  });

  it('a sideways drag on a row that keeps it (touch-action: pan-y, a tab row) stays the page\'s', () => {
    document.body.innerHTML = '<div id="page" style="overflow-x: auto"><div id="tabs" style="touch-action: pan-y"><button>Tab</button></div></div>';
    const page = document.getElementById('page')!, tab = page.querySelector('button')!;
    Object.defineProperties(page, { scrollWidth: { value: 1000 }, clientWidth: { value: 300 } });
    listen(tab, ['pointercancel', 'pointermove']);
    mouse(tab, 'pointerdown', { clientX: 50, clientY: 20 });
    mouse(tab, 'pointermove', { clientX: 80, clientY: 20 });
    mouse(tab, 'pointermove', { clientX: 120, clientY: 20 });
    expect(heard).toEqual(['pointermove:touch', 'pointermove:touch']);
    expect(page.scrollLeft).toBe(0);
  });

  it('a touchmove the page cancels (the scrub, holding a line) keeps the finger from panning', () => {
    document.body.innerHTML = '<div id="list" style="overflow-y: auto"><div id="code">line</div></div>';
    const list = document.getElementById('list')!, code = document.getElementById('code')!;
    Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    code.addEventListener('touchmove', (e) => e.preventDefault());
    listen(code, ['pointercancel', 'pointermove']);
    mouse(code, 'pointerdown', { clientX: 50, clientY: 200 });
    mouse(code, 'pointermove', { clientX: 50, clientY: 150 });
    expect(heard).toEqual(['pointermove:touch']);
    expect(list.scrollTop).toBe(0);
  });
});
