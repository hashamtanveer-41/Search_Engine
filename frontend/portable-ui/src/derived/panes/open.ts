// Where a click opens a page (the reference's §3.3 and §3.4), as one model operation:
//
// - a page already open comes forward (opening its strip if it is folded), never twice;
// - into an empty layout it opens as an ordinary pane;
// - 'go' (a plain click): a preview tab in the active group. The next plain click replaces that
//   preview instead of adding another tab, so going down a list shows each item in one tab;
// - 'tab': an ordinary tab at the end of the active group;
// - 'beside': a pane of its own beside the active one (35 %), or a tab when there is no room.
import { activatePane, findStackOf, openPane, OpError, retargetPane, type Layout, type OpResult } from './model';

export type OpenPageHow = 'go' | 'tab' | 'beside';

export const BESIDE_SHARE = 0.35;

/** `color`: the colour it opens in (a tool keeps its own in every space); the least used otherwise. */
export function openPage(layout: Layout, kind: string, title: string, how: OpenPageHow = 'go', { color }: { color?: number } = {}): OpResult {
  const existing = Object.values(layout.panes).find((p) => p.kind === kind);
  if (existing) return activatePane(layout, existing.id);
  const stack = layout.activePane ? findStackOf(layout.root, layout.activePane) : null;
  if (!stack) return openPane(layout, kind, title, undefined, { color });
  if (how === 'beside') {
    try { return openPane(layout, kind, title, { kind: 'beside', nodeId: stack.id, side: 'right', share: BESIDE_SHARE }, { color }); } catch (e) { if (!(e instanceof OpError)) throw e; }
  }
  if (how === 'go') {
    const prior = stack.panes.find((p) => layout.panes[p].preview);
    if (prior) return retargetPane(layout, prior, kind, title, true);
    return openPane(layout, kind, title, { kind: 'stack', stackId: stack.id }, { preview: true, color });
  }
  return openPane(layout, kind, title, { kind: 'stack', stackId: stack.id }, { color });
}
