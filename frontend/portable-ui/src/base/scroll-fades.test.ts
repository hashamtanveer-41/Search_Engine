import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FADE, fadesFor } from './scroll-fades';

const box = (over: Partial<Parameters<typeof fadesFor>[0]>) => ({ scrollTop: 0, scrollLeft: 0, scrollHeight: 100, scrollWidth: 100, clientHeight: 100, clientWidth: 100, ...over });

describe('scroll fades where CSS cannot drive them', () => {
  it('fades nothing on a surface that does not scroll', () => {
    expect(fadesFor(box({}))).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('fades the bottom at rest and grows the top in over the first px scrolled', () => {
    expect(fadesFor(box({ scrollHeight: 400 }))).toMatchObject({ top: 0, bottom: FADE });
    expect(fadesFor(box({ scrollHeight: 400, scrollTop: 10 })).top).toBe(10);
    expect(fadesFor(box({ scrollHeight: 400, scrollTop: 300 }))).toMatchObject({ top: FADE, bottom: 0 });
  });

  it('works sideways too, for both axes at once', () => {
    expect(fadesFor(box({ scrollWidth: 300, scrollHeight: 300, scrollLeft: 190, scrollTop: 5 }))).toEqual({ top: 5, bottom: FADE, left: FADE, right: 10 });
  });
});

describe('an axis a surface does not scroll along', () => {
  it('is marked still, so a fade a scroll timeline held (it stopped scrolling) is off; scrolling again, it is not', async () => {
    const { markStill } = await import('./scroll-fades');
    const el = document.createElement('div');
    const size = (scrollWidth: number, clientWidth: number) => {
      Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
      Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
    };
    size(400, 100);
    markStill(el);
    expect(el.hasAttribute('data-still-x')).toBe(false);
    size(300, 300); // the card grew: its tab fits
    markStill(el);
    expect(el.hasAttribute('data-still-x')).toBe(true);
    expect(el.hasAttribute('data-still-y')).toBe(true);
    size(400, 100);
    markStill(el);
    expect(el.hasAttribute('data-still-x')).toBe(false);
  });
});

describe('which surfaces fade', () => {
  it('anything that scrolls on its own, on either axis', async () => {
    const { scrollsOnItsOwn } = await import('./scroll-fades');
    expect(scrollsOnItsOwn({ overflowX: 'hidden', overflowY: 'auto' })).toBe(true);
    expect(scrollsOnItsOwn({ overflowX: 'scroll', overflowY: 'visible' })).toBe(true);
    expect(scrollsOnItsOwn({ overflowX: 'hidden', overflowY: 'hidden' })).toBe(false);
    expect(scrollsOnItsOwn({ overflowX: 'visible', overflowY: 'visible' })).toBe(false);
  });
});

describe('watching the page', () => {
  // idle callbacks run by hand; the observer's own callbacks are microtasks
  let idle: (() => void)[] = [];
  const settle = async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
  const runIdle = () => { const run = idle; idle = []; run.forEach((fn) => fn()); };
  const scroller = (id: string) => { const el = document.createElement('div'); el.id = id; el.style.overflowY = 'auto'; return el; };

  beforeAll(async () => {
    (window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = (fn: () => void) => { idle.push(fn); return idle.length; };
    document.body.innerHTML = '';
    document.body.append(scroller('at-start'));
    const { installScrollFades } = await import('./scroll-fades');
    installScrollFades();
  });
  afterEach(() => { vi.restoreAllMocks(); runIdle(); });
  afterAll(() => { delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback; document.body.innerHTML = ''; });

  it('tags what scrolls when it is installed', () => {
    expect(document.getElementById('at-start')!.hasAttribute('data-scroll-fade')).toBe(true);
  });

  it('tags a scrolling element added later, in an idle moment, not in the frame it came', async () => {
    const wrap = document.createElement('section');
    const inner = scroller('later');
    wrap.append(document.createElement('p'), inner);
    document.body.append(wrap);
    await settle();
    expect(inner.hasAttribute('data-scroll-fade')).toBe(false);
    expect(idle).toHaveLength(1);
    runIdle();
    expect(inner.hasAttribute('data-scroll-fade')).toBe(true);
    expect(inner.style.getPropertyValue('--fade-inset-top')).toBe('0px');
    expect(wrap.hasAttribute('data-scroll-fade')).toBe(false);
  });

  it('looks only at what was added: no computed style for the elements already there', async () => {
    const old = document.createElement('div');
    for (let i = 0; i < 20; i++) old.append(document.createElement('span'));
    document.body.append(old);
    await settle();
    runIdle();
    const styles = vi.spyOn(window, 'getComputedStyle');
    const fresh = scroller('fresh');
    fresh.append(document.createElement('i'));
    old.append(fresh);
    await settle();
    runIdle();
    const looked = styles.mock.calls.map(([el]) => el);
    expect(looked).toEqual(expect.arrayContaining([fresh, fresh.firstElementChild]));
    expect(looked.every((el) => el === fresh || fresh.contains(el))).toBe(true);
    expect(fresh.hasAttribute('data-scroll-fade')).toBe(true);
  });

  it('batches a burst of changes into one idle pass, and skips what left again', async () => {
    const a = scroller('a'), b = scroller('b'), gone = scroller('gone');
    document.body.append(a);
    document.body.append(b);
    document.body.append(gone);
    gone.remove();
    await settle();
    expect(idle).toHaveLength(1);
    const styles = vi.spyOn(window, 'getComputedStyle');
    runIdle();
    expect(styles.mock.calls.map(([el]) => el)).not.toContain(gone);
    expect([a, b].every((el) => el.hasAttribute('data-scroll-fade'))).toBe(true);
  });

  it('measures the sticky header of a table that appears inside a surface already there', async () => {
    const surface = scroller('table-host');
    document.body.append(surface);
    await settle();
    runIdle();
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th style="position: sticky">A</th></tr></thead><tbody><tr><td>1</td></tr></tbody>';
    vi.spyOn(HTMLTableSectionElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 32, width: 100 } as DOMRect);
    surface.append(table);
    await settle();
    runIdle();
    expect(surface.style.getPropertyValue('--fade-inset-top')).toBe('32px');
  });

  it('leaves alone what floats over the page and what is inside a drawing', async () => {
    const menu = scroller('menu');
    menu.setAttribute('data-slot', 'dropdown-menu-content');
    document.body.append(menu);
    await settle();
    runIdle();
    expect(menu.hasAttribute('data-scroll-fade')).toBe(false);
  });
});
