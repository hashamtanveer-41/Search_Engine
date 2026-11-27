import { afterEach, describe, expect, it } from 'vitest';
import { cutOffAt, isCutOff } from './truncation';

afterEach(() => { document.body.innerHTML = ''; });

const sized = (el: HTMLElement, box: { sw: number; cw: number; sh?: number; ch?: number }) => {
  Object.defineProperty(el, 'scrollWidth', { value: box.sw });
  Object.defineProperty(el, 'clientWidth', { value: box.cw });
  Object.defineProperty(el, 'scrollHeight', { value: box.sh ?? 20 });
  Object.defineProperty(el, 'clientHeight', { value: box.ch ?? 20 });
};

describe('truncation tips', () => {
  it('knows text cut off with an ellipsis from text that fits', () => {
    document.body.innerHTML = '<span id="cut" style="text-overflow: ellipsis; overflow: hidden">GET /authorize?client_id=…</span><span id="fits" style="text-overflow: ellipsis">ok</span>';
    sized(document.getElementById('cut')!, { sw: 300, cw: 120 });
    sized(document.getElementById('fits')!, { sw: 20, cw: 120 });
    expect(isCutOff(document.getElementById('cut')!)).toBe(true);
    expect(isCutOff(document.getElementById('fits')!)).toBe(false);
  });

  it('finds the cut-off box from a child, and leaves elements with their own title alone', () => {
    document.body.innerHTML = '<div id="box" style="text-overflow: ellipsis"><b id="inner">long text</b></div><div id="titled" title="x" style="text-overflow: ellipsis"><i id="t">long</i></div>';
    sized(document.getElementById('box')!, { sw: 300, cw: 100 });
    sized(document.getElementById('titled')!, { sw: 300, cw: 100 });
    expect(cutOffAt(document.getElementById('inner'))?.id).toBe('box');
    expect(cutOffAt(document.getElementById('t'))).toBeNull();
  });
});

describe('truncation tips: on the page', () => {
  it('measures nothing as the pointer passes over things, only once it has rested; then shows the whole text', async () => {
    const { vi } = await import('vitest');
    const { installTruncationTips } = await import('./truncation');
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<span id="cut" style="text-overflow: ellipsis; overflow: hidden">A long title that does not fit</span><span id="other">ok</span>';
      const cut = document.getElementById('cut')!, other = document.getElementById('other')!;
      sized(cut, { sw: 300, cw: 120 });
      sized(other, { sw: 20, cw: 120 });
      installTruncationTips();
      const tip = document.querySelector<HTMLElement>('[data-slot="truncation-tip"]')!;
      const styles = vi.spyOn(window, 'getComputedStyle');
      const over = (el: Element) => el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      // Passing over one thing after another: nothing is read.
      for (let i = 0; i < 20; i++) { over(i % 2 ? cut : other); vi.advanceTimersByTime(16); }
      expect(styles).not.toHaveBeenCalled();
      expect(tip.hidden).toBe(true);
      // Rested on the cut-off text: read once, and its whole text shows.
      over(cut);
      vi.advanceTimersByTime(400);
      expect(styles).toHaveBeenCalled();
      expect(tip.hidden).toBe(false);
      expect(tip.textContent).toBe('A long title that does not fit');
      expect(cut.getAttribute('aria-describedby')).toBe(tip.id);
      // On to something else: it goes.
      over(other);
      expect(tip.hidden).toBe(true);
      vi.advanceTimersByTime(400);
      expect(tip.hidden).toBe(true);
    } finally { vi.useRealTimers(); vi.restoreAllMocks(); }
  });
});
