// How the next navigation should open: in the pane being read ('here'), in a new pane beside it
// ('beside') or as another tab of its group ('tab'). Set just before the address changes; the
// workspace that follows the address takes it once.
export type OpenHow = 'here' | 'beside' | 'tab';

let next: OpenHow | null = null;

export function takeIntent(): OpenHow {
  const how = next ?? 'here';
  next = null;
  return how;
}

/** Goes to `hash` and opens it `how`. The same address again still counts as a navigation. */
export function openAt(hash: string, how: OpenHow) {
  next = how;
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = hash;
}

/** Shift-click opens beside, Alt-click a tab; a plain click (or a browser gesture) is left alone. */
export function howFromClick(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; button: number }): OpenHow | null {
  if (e.button !== 0 || e.ctrlKey || e.metaKey) return null;
  return e.shiftKey ? 'beside' : e.altKey ? 'tab' : null;
}
