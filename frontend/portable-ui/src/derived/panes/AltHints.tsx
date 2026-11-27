// While Alt is held (and the keys are the workspace's), every key that goes somewhere is drawn
// where it goes: on the pane it would focus, not on the pane it leaves. The key alone, no "Alt"
// (Alt is held already) and no words. The four split keys sit on the edges of the active card;
// its close and zoom buttons show W and ↵.
//
// The arrows go to the pane that way, [ and ] to the one before and after in reading order. When
// several keys land on one pane, one is drawn: an arrow first, then [ or ].
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { ArrowBigUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { Geometry, Rect } from './geometry';
import { findStackOf, neighbourStack, shownOrder, type Layout } from './model';

type Key = '←' | '→' | '↑' | '↓' | '[' | ']';
const ARROWS = new Set<Key>(['←', '→', '↑', '↓']);
/** Within this much room between the card and the area's edge, a split hint sits inside the edge instead. */
const DIVIDER_ROOM = 12;
const EDGE_MARGIN = 2;

export function focusTargets(layout: Layout, geo: Geometry): Map<string, Key> {
  const out = new Map<string, { key: Key; rank: number }>();
  const active = layout.activePane;
  const stack = active ? findStackOf(layout.root, active) : null;
  if (!active || !stack) return new Map();
  const from = geo.stacks.get(stack.id);
  const centre = (id: string) => {
    const s = findStackOf(layout.root, id);
    const b = s && geo.stacks.get(s.id);
    return b ? { x: b.card.x + b.card.w / 2, y: b.card.y + b.card.h / 2, stack: s!.id } : null;
  };
  const add = (paneId: string | undefined, key: Key) => {
    if (!paneId || paneId === active) return;
    const c = centre(paneId);
    const f = from && { x: from.card.x + from.card.w / 2, y: from.card.y + from.card.h / 2 };
    let agrees = true;
    if (c && f && c.stack !== stack.id && ARROWS.has(key)) {
      const dx = c.x - f.x;
      const dy = c.y - f.y;
      agrees = key === '←' ? dx < -1 : key === '→' ? dx > 1 : key === '↑' ? dy < -1 : dy > 1;
    }
    const rank = (ARROWS.has(key) ? 0 : 2) + (agrees ? 0 : 1);
    const prev = out.get(paneId);
    if (!prev || rank < prev.rank) out.set(paneId, { key, rank });
  };
  const order = shownOrder(layout.root);
  const i = order.indexOf(active);
  add(order[i - 1], '[');
  add(order[i + 1], ']');
  add(neighbourStack(layout.root, stack.id, 'left')?.active, '←');
  add(neighbourStack(layout.root, stack.id, 'right')?.active, '→');
  add(neighbourStack(layout.root, stack.id, 'up')?.active, '↑');
  add(neighbourStack(layout.root, stack.id, 'down')?.active, '↓');
  return new Map([...out].map(([k, v]) => [k, v.key]));
}

const ICONS: Record<string, ReactNode> = {
  '←': <ArrowLeft strokeWidth={2.75} />, '→': <ArrowRight strokeWidth={2.75} />, '↑': <ArrowUp strokeWidth={2.75} />, '↓': <ArrowDown strokeWidth={2.75} />,
  Shift: <ArrowBigUp strokeWidth={2.5} />,
};
const caps = (key: string) => key.split(' ').map((k, i) => <span key={i} className="alt-cap">{ICONS[k] ?? k}</span>);

type Pill = { id: string; at: { x: number; y: number }; anchor: 'centre' | 'start' | 'end' | 'top' | 'bottom'; caps: string; kind: 'go' | 'badge' | 'edge' };

export function AltHints({ layout, geo, area, zoomed }: { layout: Layout; geo: Geometry; area: HTMLElement | null; zoomed: boolean }) {
  const targets = zoomed ? new Map<string, Key>() : focusTargets(layout, geo);
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const targetKey = [...targets.keys()].join(',');

  // A tab behind another has no body to draw on: its key sits on the tab, in place of its ×. The
  // active card's close and zoom buttons are measured too.
  useLayoutEffect(() => {
    if (!area) return;
    const base = area.getBoundingClientRect();
    const out = new Map<string, Rect>();
    const measure = (k: string, el: Element | null) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      out.set(k, { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    };
    for (const id of targets.keys()) measure(id, area.querySelector(`[data-tab="${id}"]`));
    const active = layout.activePane;
    if (active) {
      measure('close', area.querySelector(`[data-tab="${active}"] .pane-tab-close`));
      measure('zoom', area.querySelector(`.pane-card[data-active] [data-zoom]`));
    }
    setRects(out);
  }, [targetKey, area, layout.activePane, geo]);

  const active = layout.activePane;
  const stack = active ? findStackOf(layout.root, active) : null;
  const box = stack ? geo.stacks.get(stack.id) : null;
  if (!box) return null;

  const pills: Pill[] = [];
  for (const [id, k] of targets) {
    const s = findStackOf(layout.root, id);
    const b = s && geo.stacks.get(s.id);
    if (!s || !b) continue;
    if (s.active === id) pills.push({ id, at: { x: b.body.x + b.body.w / 2, y: b.body.y + b.body.h / 2 }, anchor: 'centre', caps: k, kind: 'go' });
    else {
      const t = rects.get(id);
      if (t) pills.push({ id, at: { x: t.x + t.w - 16, y: t.y + t.h / 2 }, anchor: 'centre', caps: k, kind: 'badge' });
    }
  }
  for (const [k, cap] of [['close', 'W'], ['zoom', '↩']] as const) {
    const r = rects.get(k);
    if (r) pills.push({ id: k, at: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, anchor: 'centre', caps: cap, kind: 'badge' });
  }

  // The split keys on the active card's edges: on the hairline beyond each edge, or just inside the
  // workspace's edge when the card reaches it.
  const c = box.card;
  const a = geo.area;
  const mid = { x: c.x + c.w / 2, y: box.body.y + box.body.h / 2 };
  const room = (n: number) => n > DIVIDER_ROOM;
  pills.push(
    room(c.x - a.x) ? { id: 'split-left', at: { x: c.x, y: mid.y }, anchor: 'centre', caps: '/', kind: 'edge' } : { id: 'split-left', at: { x: a.x + EDGE_MARGIN, y: mid.y }, anchor: 'start', caps: '/', kind: 'edge' },
    room(a.x + a.w - (c.x + c.w)) ? { id: 'split-right', at: { x: c.x + c.w, y: mid.y }, anchor: 'centre', caps: '\\', kind: 'edge' } : { id: 'split-right', at: { x: a.x + a.w - EDGE_MARGIN, y: mid.y }, anchor: 'end', caps: '\\', kind: 'edge' },
    room(c.y - a.y) ? { id: 'split-up', at: { x: mid.x, y: c.y }, anchor: 'centre', caps: 'Shift /', kind: 'edge' } : { id: 'split-up', at: { x: mid.x, y: box.body.y + EDGE_MARGIN }, anchor: 'top', caps: 'Shift /', kind: 'edge' },
    room(a.y + a.h - (c.y + c.h)) ? { id: 'split-down', at: { x: mid.x, y: c.y + c.h }, anchor: 'centre', caps: 'Shift \\', kind: 'edge' } : { id: 'split-down', at: { x: mid.x, y: a.y + a.h - EDGE_MARGIN }, anchor: 'bottom', caps: 'Shift \\', kind: 'edge' },
  );

  return (
    <div className="alt-hints" aria-hidden data-testid="alt-hints">
      {pills.map((p) => (
        <div key={p.id} className={`alt-hint alt-hint-${p.kind}`} data-anchor={p.anchor} data-target={p.id} style={{ left: p.at.x, top: p.at.y }}>{caps(p.caps)}</div>
      ))}
    </div>
  );
}
