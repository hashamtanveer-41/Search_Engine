import { afterEach, describe, expect, it, vi } from 'vitest';
import { landing, project, Spring, SPRINGS, stepSpring, VelocityTracker } from './motion';

afterEach(() => vi.unstubAllGlobals());

/** rAF driven by hand: each call to `frame(ms)` runs one frame that much later. */
function manualFrames() {
  let now = 0;
  let queued: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { queued.push(fn); return queued.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { queued = []; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    frame(ms = 16) { now += ms; const run = queued; queued = []; run.forEach((fn) => fn(now)); },
    get pending() { return queued.length; },
  };
}

describe('springs', () => {
  it('settle on their target without a set length', () => {
    let [x, v] = [0, 0];
    for (let i = 0; i < 120; i++) [x, v] = stepSpring(x, v, 1, SPRINGS.settle, 1 / 60);
    expect(x).toBeCloseTo(1, 3);
    expect(v).toBeCloseTo(0, 2);
  });

  it('keep the speed they are handed: a fast flick gets further in the same time', () => {
    const slow = stepSpring(0, 0, 1, SPRINGS.settle, 0.05)[0];
    const fast = stepSpring(0, 8, 1, SPRINGS.settle, 0.05)[0];
    expect(fast).toBeGreaterThan(slow);
  });

  it('can be sent elsewhere mid-way, carrying on from where they are', () => {
    const frames = manualFrames();
    const seen: number[] = [];
    const s = new Spring(0, (v) => seen.push(v));
    s.to(1);
    for (let i = 0; i < 5; i++) frames.frame();
    const mid = s.value;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    s.to(0);
    frames.frame();
    // No jump: the next value is near where it was, not at either end.
    expect(Math.abs(seen[seen.length - 1] - mid)).toBeLessThan(0.2);
    for (let i = 0; i < 200; i++) frames.frame();
    expect(s.value).toBe(0);
    expect(s.moving).toBe(false);
  });

  it('stop where they are when held, and report coming to rest', () => {
    const frames = manualFrames();
    const s = new Spring(0, () => undefined);
    const rested = vi.fn();
    s.to(1);
    frames.frame();
    s.set(0.3);
    expect(s.held).toBe(true);
    expect(frames.pending).toBe(0);
    s.onRest(rested);
    s.to(1);
    for (let i = 0; i < 200; i++) frames.frame();
    expect(rested).toHaveBeenCalledOnce();
  });

  it('jump straight to the target under reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const s = new Spring(0, () => undefined);
    s.to(1);
    expect(s.value).toBe(1);
    expect(s.moving).toBe(false);
  });
});

describe('flicks', () => {
  it('measure speed from the last moments of a drag', () => {
    const t = new VelocityTracker();
    t.add(0, 0); t.add(10, 10); t.add(20, 20);
    expect(t.velocity()).toBeCloseTo(1000);
  });

  it('carry further the faster they go, and land on the nearest snap to that', () => {
    expect(project(0, 0)).toBe(0);
    expect(project(0, 1000)).toBeGreaterThan(project(0, 500));
    // Barely moved but flicked hard toward closed: it closes.
    expect(landing(0.9, -3000 / 300, [0, 1])).toBe(0);
    // Dragged most of the way but let go gently: it stays where it is nearest.
    expect(landing(0.4, 0, [0, 1])).toBe(0);
    expect(landing(0.6, 0, [0, 1])).toBe(1);
  });
});

describe('list springs', () => {
  it('keep a removed row on screen while it leaves, then take it away', async () => {
    const frames = manualFrames();
    const { installListSprings } = await import('./motion');
    document.body.innerHTML = '<table class="data-table"><tbody><tr id="a"><td>A</td></tr><tr id="b"><td>B</td></tr></tbody></table>';
    installListSprings();
    const b = document.getElementById('b')!;
    b.remove();
    await Promise.resolve();
    expect(b.isConnected).toBe(true);
    expect(b.dataset.leaving).toBe('');
    for (let i = 0; i < 200; i++) frames.frame();
    expect(b.isConnected).toBe(false);
  });

  it('take a removed row away for good: its own leaving is not a new arrival or a new removal', async () => {
    const frames = manualFrames();
    const { installListSprings } = await import('./motion');
    document.body.innerHTML = '<ul data-spring-list><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul>';
    installListSprings();
    const list = document.querySelector('ul')!;
    const b = document.getElementById('b')!;
    b.remove();
    await Promise.resolve();
    // Held on screen while it leaves, fading only downward: never sprung in as if it were new.
    const seen: number[] = [];
    for (let i = 0; i < 200; i++) {
      frames.frame();
      if (b.isConnected) seen.push(Number(b.style.opacity || '1'));
      await Promise.resolve();
    }
    expect(seen.every((o, i) => i === 0 || o <= seen[i - 1] + 1e-9)).toBe(true);
    for (let i = 0; i < 50; i++) { frames.frame(); await Promise.resolve(); }
    expect(b.isConnected).toBe(false);
    expect([...list.children].map((c) => c.id)).toEqual(['a', 'c']);
    expect(frames.pending).toBe(0);
  });

  it('leave nothing behind when rows are hidden and shown again and again (a filter switched quickly)', async () => {
    const frames = manualFrames();
    const { installListSprings } = await import('./motion');
    document.body.innerHTML = '<ul data-spring-list></ul>';
    installListSprings();
    const list = document.querySelector('ul')!;
    const rows = () => ['x', 'y', 'z'].map((id) => Object.assign(document.createElement('li'), { id, textContent: id }));
    for (let round = 0; round < 6; round++) {
      list.replaceChildren(...rows());
      await Promise.resolve();
      for (let i = 0; i < 3; i++) frames.frame();
      list.querySelectorAll('li:not([data-leaving])').forEach((li) => li.remove());
      await Promise.resolve();
      for (let i = 0; i < 3; i++) frames.frame();
    }
    for (let i = 0; i < 400; i++) { frames.frame(); await Promise.resolve(); }
    expect(list.children.length).toBe(0);
    expect(frames.pending).toBe(0);
  });

  it('are installed once per page, however often start-up asks', async () => {
    const frames = manualFrames();
    const { installListSprings } = await import('./motion');
    document.body.innerHTML = '<ul data-spring-list><li id="a">A</li></ul>';
    installListSprings();
    installListSprings();
    const a = document.getElementById('a')!;
    a.remove();
    await Promise.resolve();
    expect(document.querySelectorAll('#a').length).toBe(1);
    for (let i = 0; i < 300; i++) { frames.frame(); await Promise.resolve(); }
    expect(a.isConnected).toBe(false);
  });

  it('let a row that only moved stay as it is', async () => {
    manualFrames();
    const { installListSprings } = await import('./motion');
    document.body.innerHTML = '<table class="data-table"><tbody><tr id="a"><td>A</td></tr><tr id="b"><td>B</td></tr></tbody></table>';
    installListSprings();
    const tbody = document.querySelector('tbody')!;
    tbody.insertBefore(document.getElementById('b')!, document.getElementById('a'));
    await Promise.resolve();
    expect(document.getElementById('b')!.dataset.leaving).toBeUndefined();
    expect(tbody.children.length).toBe(2);
  });
});
