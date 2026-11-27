// The grid in pixels (geometry.ts): folded columns and rows, and the strips they make.
import { describe, expect, it } from 'vitest';
import { computeGeometry, REST } from './geometry';
import type { GridNode } from './model';

const g = (id: string, c0: number, c1: number, r0: number, r1: number) => ({ type: 'stack' as const, id, panes: [id], active: id, c0, c1, r0, r1 });
const area = { x: 0, y: 0, w: 1000, h: 800 };

describe('strips', () => {
  // A over a C two rows tall, beside B over D over E; the bottom two rows and the right column folded.
  const grid: GridNode = {
    type: 'grid', id: 'grid',
    cols: [{ size: 0.7 }, { size: 0.3, fold: 'before' }],
    rows: [{ size: 0.5 }, { size: 0.25, fold: 'before' }, { size: 0.25, fold: 'before' }],
    groups: [g('A', 0, 1, 0, 1), g('B', 1, 2, 0, 1), g('C', 0, 1, 1, 3), g('D', 1, 2, 1, 2), g('E', 1, 2, 2, 3)],
  };
  const geo = computeGeometry(grid, area, REST);

  it('two rows folded side by side are one strip thick, not two', () => {
    expect(geo.strips.get('C')!.rect.h).toBe(REST.strip);
    expect(geo.strips.get('C')!.axis).toBe('column');
  });

  it('where the folded row meets the folded column the groups are one square box, with both their pages', () => {
    const corner = [...geo.strips.values()].find((s) => s.corner)!;
    expect(corner.groups).toEqual(['D', 'E']);
    expect(corner.panes).toEqual(['D', 'E']);
    expect([corner.rect.w, corner.rect.h]).toEqual([REST.strip, REST.strip]);
    expect(geo.folded.get('E')).toBe(corner.id);
    expect(geo.strips).toHaveProperty('size', 3);
  });

  it('no divider is drawn inside a strip', () => {
    expect(geo.gaps.filter((x) => x.axis === 'column' && x.line === 2)).toEqual([]);
  });
});
