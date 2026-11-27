import { describe, expect, it } from 'vitest';
import { boundView, SCROLL_MARGIN, zoomFades } from './view-lock';
import { FADE } from '../../base/scroll-fades';

describe('zoomed views fade where the content runs past the edge', () => {
  it('fades nothing at rest', () => {
    expect(zoomFades({ scale: 1, x: 0, y: 0 }, 400, 300)).toEqual({ top: 0, left: 0, bottom: 0, right: 0 });
  });
  it('fades every edge the zoomed content runs past, up to the fade length', () => {
    expect(zoomFades({ scale: 2, x: -200, y: -10 }, 400, 300)).toEqual({ top: 10, left: FADE, bottom: FADE, right: FADE });
  });
  it('panned right, the left edge has nothing past it', () => {
    expect(zoomFades({ scale: 1, x: 50, y: 0 }, 400, 300)).toMatchObject({ left: 0, right: FADE });
  });
});

describe('a pan stops at four corners, the scroll margin past the content', () => {
  const m = { x: 80, y: 60 };
  it('at rest, moves at most the margin each way', () => {
    expect(boundView({ scale: 1, x: 500, y: -500 }, 400, 300, m)).toEqual({ scale: 1, x: 80, y: -60 });
    expect(boundView({ scale: 1, x: -30, y: 20 }, 400, 300, m)).toEqual({ scale: 1, x: -30, y: 20 });
  });
  it('zoomed in, lets the content run to its own far edge and the margin past it', () => {
    // twice the size: 800 x 600 of content in a 400 x 300 pane
    expect(boundView({ scale: 2, x: -1000, y: -1000 }, 400, 300, m)).toEqual({ scale: 2, x: -480, y: -360 });
    expect(boundView({ scale: 2, x: 1000, y: 1000 }, 400, 300, m)).toEqual({ scale: 2, x: 80, y: 60 });
    expect(boundView({ scale: 2, x: -200, y: -100 }, 400, 300, m)).toEqual({ scale: 2, x: -200, y: -100 });
  });
  it('defaults to SCROLL_MARGIN', () => {
    expect(boundView({ scale: 1, x: 1e4, y: 1e4 }, 400, 300)).toEqual({ scale: 1, x: SCROLL_MARGIN.x, y: SCROLL_MARGIN.y });
  });
});
