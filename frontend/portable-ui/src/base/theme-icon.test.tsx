import { afterEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { bezier, outline, ThemeIcon } from './theme-icon';

afterEach(() => { document.documentElement.removeAttribute('data-theme'); });

describe('the theme icon', () => {
  it("is Lucide's sun in outline: a ring of 4 and eight rays, 2px, round ends", () => {
    const { container } = render(<ThemeIcon />);
    const svg = container.querySelector('svg')!;
    expect([svg.getAttribute('fill'), svg.getAttribute('stroke-width'), svg.getAttribute('stroke-linecap'), svg.getAttribute('stroke-linejoin')]).toEqual(['none', '2', 'round', 'round']);
    expect(svg.querySelector('path.sun')?.getAttribute('d')).toBe(outline({ r: 4, bx: 26, by: -2 }));
    expect(svg.querySelectorAll('.sun-beams line')).toHaveLength(8);
    expect(svg.hasAttribute('data-theme-morph')).toBe(true);
  });

  it("as a moon, its outline is Lucide's: arcs of 9 and of the bite meeting at (12, 3) and (21, 12), joined round", () => {
    const d = outline({ r: 9, bx: 16.5, by: 7.5 });
    const points = [...d.matchAll(/[MA][^MAZ]*?(-?[\d.]+) (-?[\d.]+)(?=[AZ])/g)].map((m) => [Math.round(+m[1]), Math.round(+m[2])]);
    expect(points).toEqual(expect.arrayContaining([[12, 3], [21, 12]]));
    // the ring's arc the long way round (large), the bite's the short way
    expect(d).toMatch(/A9 9 0 1 \d/);
    expect(d).toMatch(/A6\.364 6\.364 0 0 \d/);
  });

  it('a ring the bite does not reach is a whole circle', () => {
    expect(outline({ r: 4, bx: 26, by: -2 })).toBe('M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z');
  });

  it('opens on the theme the page is in', () => {
    document.documentElement.dataset.theme = 'dark';
    const { container } = render(<ThemeIcon />);
    expect(container.querySelector('path.sun')?.getAttribute('d')).toBe(outline({ r: 9, bx: 16.5, by: 7.5 }));
  });

  it("eases as Open Props' curves do", () => {
    const ease = bezier(0.25, 0, 0.3, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.7585, 3);
    // the elastic one goes past the end before it settles
    const elastic = bezier(0.5, 1.25, 0.75, 1.25);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(elastic))).toBeGreaterThan(1);
    void act;
  });
});
