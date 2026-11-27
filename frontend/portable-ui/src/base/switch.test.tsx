import { describe, expect, it } from 'vitest';
import { switchLook } from './switch';

// A track 28px inside, a 14px knob.
const INNER = 28;
const SIZE = 14;
const inside = (l: { x: number; width: number }) => l.x >= -1e-9 && l.x + l.width <= INNER + 1e-9;

describe('the switch knob', () => {
  it('is a circle at either end, whichever way it leans', () => {
    for (const p of [0, 1]) {
      for (const lean of [-1, 0, 1]) {
        const l = switchLook(p, lean, INNER, SIZE);
        expect(l.width).toBeCloseTo(SIZE);
        expect(l.height).toBeCloseTo(SIZE);
      }
    }
  });

  it('is stretched and flattened by where it is, the most half way across', () => {
    const quarter = switchLook(0.25, 1, INNER, SIZE);
    const half = switchLook(0.5, 1, INNER, SIZE);
    expect(quarter.width).toBeGreaterThan(SIZE);
    expect(half.width).toBeGreaterThan(quarter.width);
    expect(half.height).toBeLessThan(quarter.height);
    expect(half.height).toBeLessThan(SIZE);
    // The same at the same place going either way: it is not about speed.
    expect(switchLook(0.25, -1, INNER, SIZE).width).toBeCloseTo(quarter.width);
    expect(switchLook(0.75, 1, INNER, SIZE).width).toBeCloseTo(quarter.width);
  });

  it('grows towards the side it is heading for', () => {
    // A longer track, so there is room behind it as well as ahead.
    const right = switchLook(0.5, 1, 44, SIZE);
    const left = switchLook(0.5, -1, 44, SIZE);
    const round = 0.5 * (44 - SIZE);
    // Heading right, its left edge is where a round knob's would be; heading left, its right edge.
    expect(right.x).toBeCloseTo(round);
    expect(left.x + left.width).toBeCloseTo(round + SIZE);
  });

  it('never leaves the track: not stretched past an end, not when a spring overshoots', () => {
    for (const p of [-0.4, -0.05, 0, 0.2, 0.5, 0.8, 0.95, 1, 1.05, 1.4]) {
      for (const lean of [-1, -0.5, 0, 0.5, 1]) expect(inside(switchLook(p, lean, INNER, SIZE))).toBe(true);
    }
  });
});
