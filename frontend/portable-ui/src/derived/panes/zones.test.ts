import { describe, expect, it } from 'vitest';
import { computeGeometry, REST } from './geometry';
import { emptyLayout, findStackOf, moveLine, openPane, type Layout } from './model';
import { BANDS, edgeBand, gapBand, hitTest, layoutMap, MAP_METRICS, MAP_W, planDrop, SIDE_BAND_MAX } from './zones';

const area = { x: 0, y: 0, w: 1200, h: 800 };

function two(): { l: Layout; a: string; b: string } {
  let l = emptyLayout();
  const ra = openPane(l, 'a', 'Alpha');
  l = ra.layout;
  const rb = openPane(l, 'b', 'Beta', { kind: 'beside', nodeId: findStackOf(l.root, ra.paneId)!.id, side: 'right', share: 0.5 });
  return { l: rb.layout, a: ra.paneId, b: rb.paneId };
}

describe('geometry', () => {
  it('cards sit 6px in from the area and 8px apart', () => {
    const { l } = two();
    const rest = computeGeometry(l.root, area, REST);
    const cards = [...rest.stacks.values()].map((s) => s.card);
    expect(cards[0].x).toBe(6);
    expect(cards[1].x - (cards[0].x + cards[0].w)).toBe(8);
  });

  it('a one-tab group has no header row; a group of tabs has a 30px one under its 36px tab bar', () => {
    let { l, a } = two();
    let g = computeGeometry(l.root, area, REST);
    expect(g.stacks.get(findStackOf(l.root, a)!.id)!.header.h).toBe(0);
    l = openPane(l, 'c', 'Gamma', { kind: 'stack', stackId: findStackOf(l.root, a)!.id }).layout;
    g = computeGeometry(l.root, area, REST);
    const box = g.stacks.get(findStackOf(l.root, a)!.id)!;
    expect([box.tabBar.h, box.header.h]).toEqual([36, 30]);
  });

  it('edges are rounded from a running total, so sizes never drift', () => {
    let { l } = two();
    l = moveLine(l, 'row', 1, 1 / 3).layout;
    const g = computeGeometry(l.root, area, REST);
    for (const s of g.stacks.values()) expect(Number.isInteger(s.card.x) && Number.isInteger(s.card.w)).toBe(true);
  });
});

describe('drop zones', () => {
  const setup = () => {
    const { l, a, b } = two();
    const geo = computeGeometry(l.root, area, REST);
    return { l, a, b, geo };
  };

  it("the bands come first (they are drawn on top), then the tab bar, then a card's bands", () => {
    const { geo, l, a, b } = setup();
    const card = geo.stacks.get(findStackOf(l.root, a)!.id)!;
    // The top band covers the top of the tab bar; below it, the tab bar.
    expect(hitTest(card.tabBar.x + 40, BANDS.open - 1, geo, new Map())?.key).toBe('edge:top');
    expect(hitTest(card.tabBar.x + 40, BANDS.open + 4, geo, new Map())?.key).toMatch(/^tab:/);
    expect(hitTest(5, 400, geo, new Map())?.key).toBe('edge:left');
    const gap = geo.gaps[0].rect;
    expect(hitTest(gap.x + gap.w / 2, 400, geo, new Map())?.key).toMatch(/^gap:/);
    const right = geo.stacks.get(findStackOf(l.root, b)!.id)!;
    expect(hitTest(right.body.x + BANDS.open / 2 + 10, right.body.y + right.body.h / 2, geo, new Map())?.key).toMatch(/^beside:.*:left$/);
    expect(hitTest(card.body.x + card.body.w / 2, card.body.y + card.body.h / 2, geo, new Map())?.key).toMatch(/^centre:/);
  });

  it('the edges and gaps are bands laid over the panes, so a held tab needs no room made for it', () => {
    const { geo, l, a } = setup();
    const card = geo.stacks.get(findStackOf(l.root, a)!.id)!.card;
    // Inside the left card, within the band: still the edge.
    expect(card.x).toBeLessThan(BANDS.open - 1);
    expect(hitTest(BANDS.open - 1, 400, geo, new Map())?.key).toBe('edge:left');
    expect(hitTest(BANDS.open + 1, 400, geo, new Map())?.key).not.toBe('edge:left');
    expect(hitTest(400, area.h - BANDS.open + 1, geo, new Map())?.key).toBe('edge:bottom');
    // A gap 8px wide answers a band centred on it, as thick as the edges' bands.
    const gap = geo.gaps[0].rect;
    const mid = gap.x + gap.w / 2;
    expect(hitTest(mid - BANDS.open / 2 + 1, 400, geo, new Map())?.key).toMatch(/^gap:/);
    expect(hitTest(mid - BANDS.open / 2 - 1, 400, geo, new Map())?.key).not.toMatch(/^gap:/);
    const zone = hitTest(mid, 400, geo, new Map())!.zone;
    expect([zone.w, edgeBand(area, 'left').w, edgeBand(area, 'top').h]).toEqual([BANDS.open, BANDS.open, BANDS.open]);
  });

  it("a card's side band is 30% of it, at most 140px", () => {
    const { geo, l, a } = setup();
    const body = geo.stacks.get(findStackOf(l.root, a)!.id)!.body;
    expect(hitTest(body.x + SIDE_BAND_MAX - 2, body.y + body.h / 2, geo, new Map())?.key).toMatch(/beside/);
    expect(hitTest(body.x + SIDE_BAND_MAX + 2, body.y + body.h / 2, geo, new Map())?.key).toMatch(/centre/);
  });

  it('the insertion marker sits between the two tabs whose midpoints the pointer is between', () => {
    const { geo, l, a } = setup();
    const id = findStackOf(l.root, a)!.id;
    const bar = geo.stacks.get(id)!.tabBar;
    const slots = new Map([[id, [{ left: 0, width: 100 }, { left: 100, width: 100 }]]]);
    const hit = hitTest(bar.x + 140, BANDS.open + 4, geo, slots)!;
    expect(hit.target).toEqual({ kind: 'stack', stackId: id, index: 1 });
    expect(hit.marker!.x).toBe(bar.x + 100 - 1);
  });

  it('the plan is the simulated result: a refusal is known before the drop', () => {
    let { l, a, b } = two();
    // A tab of b's group (so its leaving frees no room) dropped on the left band of a, which is 20% wide.
    const c = openPane(l, 'c', 'Gamma', { kind: 'stack', stackId: findStackOf(l.root, b)!.id });
    l = moveLine(c.layout, 'row', 1, 0.2).layout;
    const geo = computeGeometry(l.root, area, REST);
    const card = geo.stacks.get(findStackOf(l.root, a)!.id)!;
    const hit = hitTest(card.body.x + 30, card.body.y + 100, geo, new Map())!;
    const plan = planDrop(l, c.paneId, hit, geo);
    expect(plan.refused).toMatch(/smaller than 12%/);
  });

  /** Alpha | Beta | Gamma, Gamma alone on the right. */
  const three = () => {
    const { l: two_, a, b } = two();
    const c = openPane(two_, 'c', 'Gamma', { kind: 'beside', nodeId: findStackOf(two_.root, b)!.id, side: 'right', share: 0.33 });
    const l = c.layout;
    return { l, a, b, c: c.paneId, geo: computeGeometry(l.root, area, REST) };
  };
  const middle = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;

  it('joining a group: its centre is the zone; the map shows the layout once the pane’s own group closes', () => {
    const { l, a, b, c, geo } = three();
    const beta = geo.stacks.get(findStackOf(l.root, b)!.id)!;
    const hit = hitTest(...middle(beta.body), geo, new Map())!;
    // The centre: the body less its side bands.
    const bx = Math.min(beta.body.w * 0.3, SIDE_BAND_MAX);
    const by = Math.min(beta.body.h * 0.3, SIDE_BAND_MAX);
    expect(hit.zone).toEqual({ x: beta.body.x + bx, y: beta.body.y + by, w: beta.body.w - 2 * bx, h: beta.body.h - 2 * by });
    const plan = planDrop(l, c, hit, geo);
    expect(plan.label).toBe('Add as a tab of “Beta”');
    // Where it lands, on the layout as it is: Beta's group.
    expect(plan.preview).toEqual(beta.card);
    // The map: two groups left, Alpha's and Beta's (now holding Gamma), Beta's marked.
    expect(plan.after!.area).toEqual({ x: 0, y: 0, w: MAP_W, h: Math.round((MAP_W * area.h) / area.w) });
    expect(plan.after!.boxes.map((x) => x.mine)).toEqual([false, true]);
    expect(plan.after!.boxes.map((x) => x.id)).toEqual([findStackOf(l.root, a)!.id, findStackOf(l.root, b)!.id]);
  });

  it('a drop that leaves the groups as they are still maps them: the layout as it is now', () => {
    let { l, a, b } = two();
    const c = openPane(l, 'c', 'Gamma', { kind: 'stack', stackId: findStackOf(l.root, b)!.id });
    l = c.layout;
    const geo = computeGeometry(l.root, area, REST);
    const alpha = geo.stacks.get(findStackOf(l.root, a)!.id)!;
    const plan = planDrop(l, c.paneId, hitTest(...middle(alpha.body), geo, new Map())!, geo);
    expect(plan.label).toBe('Add as a tab of “Alpha”');
    expect(plan.after!.boxes.map((x) => x.rect)).toEqual(layoutMap(l, c.paneId, area).boxes.map((x) => x.rect));
    // Gamma's place after the drop: Alpha's group.
    expect(plan.after!.boxes.find((x) => x.mine)!.id).toBe(findStackOf(l.root, a)!.id);
  });

  it('a split: the band on that side of the group is the zone, and the map shows the layout it leaves', () => {
    const { l, a, c, geo } = three();
    const alpha = geo.stacks.get(findStackOf(l.root, a)!.id)!;
    const hit = hitTest(alpha.body.x + alpha.body.w - BANDS.open / 2 - 10, alpha.body.y + alpha.body.h / 2, geo, new Map())!;
    expect(hit.key).toMatch(/^beside:.*:right$/);
    const band = Math.min(alpha.body.w * 0.3, SIDE_BAND_MAX);
    expect(hit.zone).toEqual({ ...alpha.body, x: alpha.body.x + alpha.body.w - band, w: band });
    const plan = planDrop(l, c, hit, geo);
    expect(plan.label).toBe('Split right of “Alpha”');
    // Where it lands: the right 35% of Alpha, the share a split gives the new pane.
    const share = Math.round(alpha.card.w * 0.35);
    expect(plan.preview).toEqual({ ...alpha.card, x: alpha.card.x + alpha.card.w - share, w: share });
    expect(plan.after!.boxes.filter((x) => x.mine)).toHaveLength(1);
  });

  it('a gap: the landing box is centred on it', () => {
    const { l, c, geo } = three();
    const gap = geo.gaps.find((g) => g.axis === 'row' && g.line === 1)!;
    const plan = planDrop(l, c, hitTest(gap.rect.x + gap.rect.w / 2, 400, geo, new Map())!, geo);
    expect(Math.abs(plan.preview!.x + plan.preview!.w / 2 - (gap.rect.x + gap.rect.w / 2))).toBeLessThanOrEqual(1);
    expect(plan.preview!.h).toBe(gap.rect.h);
  });

  it('no two bands overlap: corners belong to the top and bottom bands, a gap stops at the bands it meets', () => {
    // Alpha | (Beta over Gamma): a vertical gap the full height, a horizontal one in the right column.
    let { l, b } = two();
    l = openPane(l, 'c', 'Gamma', { kind: 'beside', nodeId: findStackOf(l.root, b)!.id, side: 'bottom', share: 0.5 }).layout;
    const geo = computeGeometry(l.root, area, REST);
    const rects = [
      ...(['top', 'bottom', 'left', 'right'] as const).map((side) => edgeBand(area, side)),
      ...geo.gaps.map((g) => gapBand(g.rect, g.axis, area)),
    ];
    const overlap = (p: typeof area, q: typeof area) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `${i} and ${j}`).toBe(false);
    // The corners: the top band's, then the bottom band's.
    expect(hitTest(2, 2, geo, new Map())?.key).toBe('edge:top');
    expect(hitTest(2, area.h - 2, geo, new Map())?.key).toBe('edge:bottom');
  });

  it('the edge and gap bands are thin until the tab leaves its own pane, then all one size', () => {
    const { geo } = setup();
    expect([BANDS.compact, BANDS.open]).toEqual([6, 24]);
    expect(hitTest(15, 400, geo, new Map(), BANDS.compact)?.key).not.toBe('edge:left');
    expect(hitTest(15, 400, geo, new Map(), BANDS.open)?.key).toBe('edge:left');
    const gap = geo.gaps[0].rect;
    expect(hitTest(gap.x - 6, 400, geo, new Map(), BANDS.compact)?.key).not.toMatch(/^gap:/);
    expect(hitTest(gap.x - 6, 400, geo, new Map(), BANDS.open)?.key).toMatch(/^gap:/);
  });

  it('a refused drop maps the layout as it is, the pane in its own group', () => {
    let { l, a, b } = two();
    const c = openPane(l, 'c', 'Gamma', { kind: 'stack', stackId: findStackOf(l.root, b)!.id });
    l = moveLine(c.layout, 'row', 1, 0.2).layout;
    const geo = computeGeometry(l.root, area, REST);
    const card = geo.stacks.get(findStackOf(l.root, a)!.id)!;
    const plan = planDrop(l, c.paneId, hitTest(card.body.x + 30, card.body.y + 100, geo, new Map())!, geo);
    expect(plan.refused).toBeTruthy();
    expect(plan.preview).toBeNull();
    expect(plan.after).toEqual(layoutMap(l, c.paneId, area));
  });

  it('a drop that would change nothing says so', () => {
    const { l, a, geo } = setup();
    const card = geo.stacks.get(findStackOf(l.root, a)!.id)!;
    const hit = hitTest(card.body.x + 30, card.body.y + 100, geo, new Map())!;
    expect(planDrop(l, a, hit, geo)).toMatchObject({ noop: true, label: 'Already here' });
  });

  it('labels say what the drop does in words', () => {
    const { l, b, geo } = setup();
    expect(planDrop(l, b, hitTest(5, 400, geo, new Map())!, geo).label).toBe('Dock along the left edge');
  });
});

describe('the layout map', () => {
  it('is laid out at its own size: whole pixels, as much room at the edges as between two boxes', () => {
    // Alpha | (Beta over Gamma), Gamma dragged.
    let { l, b } = two();
    const rc = openPane(l, 'c', 'Gamma', { kind: 'beside', nodeId: findStackOf(l.root, b)!.id, side: 'bottom', share: 0.5 });
    l = rc.layout;
    const map = layoutMap(l, rc.paneId, area);
    expect(map.area).toEqual({ x: 0, y: 0, w: MAP_W, h: Math.round((MAP_W * 800) / 1200) });
    const r = map.boxes.map((x) => x.rect);
    expect(r.flatMap((x) => [x.x, x.y, x.w, x.h]).every(Number.isInteger)).toBe(true);
    const room = MAP_METRICS.inset;
    expect(Math.min(...r.map((x) => x.x))).toBe(room);
    expect(Math.min(...r.map((x) => x.y))).toBe(room);
    expect(map.area.w - Math.max(...r.map((x) => x.x + x.w))).toBe(room);
    expect(map.area.h - Math.max(...r.map((x) => x.y + x.h))).toBe(room);
    const [alpha, beta, gamma] = r.sort((p, q) => p.x - q.x || p.y - q.y);
    expect(beta.x - (alpha.x + alpha.w)).toBe(MAP_METRICS.gap);
    expect(gamma.y - (beta.y + beta.h)).toBe(MAP_METRICS.gap);
    expect(map.boxes.filter((x) => x.mine)).toHaveLength(1);
  });
});
