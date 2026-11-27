// Whether Alt is held with the keys the workspace's: "hints" (show where each key goes), "field"
// (Alt is held in a text field: the keys are the field's, so nothing shows), or "off".
//
// - Alt's own key repeating changes nothing (someone back from Alt+Tab is holding Alt for the
//   window switcher; its repeats must not bring hints up).
// - Ctrl or Cmd joining ends it (Alt+Ctrl is the system's; AltGr arrives as Ctrl+Alt); letting go
//   of them again with Alt still down brings it back. Shift makes no difference.
// - Focus moving while Alt is held counts: into a field, the hints go; out, they return.
// - Window blur and a hidden page end it.
// - While hints show, a lone Alt's keydown and keyup are prevented, or the browser would show (or
//   focus) its menu bar on release.
import { useEffect, useState } from 'react';
import { isTypingTarget } from './keymap';

export type AltState = 'off' | 'hints' | 'field';

export function nextAltState(prev: AltState, e: { type: string; key?: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean }, typing: boolean): AltState {
  if (e.type === 'blur') return 'off';
  if (e.type === 'focus') return prev === 'off' ? 'off' : typing ? 'field' : 'hints';
  if (e.key === 'Alt' && e.repeat) return prev;
  // Browsers differ on whether Alt's own event counts itself in altKey: go by the event type.
  const altDown = e.key === 'Alt' ? e.type === 'keydown' : !!e.altKey;
  if (!altDown || e.ctrlKey || e.metaKey) return 'off';
  return typing ? 'field' : 'hints';
}

export function useAltState(enabled = true): AltState {
  const [state, setState] = useState<AltState>('off');
  useEffect(() => {
    if (!enabled) return;
    let current: AltState = 'off';
    const set = (next: AltState) => { if (next !== current) setState((current = next)); };
    const onKey = (e: KeyboardEvent) => {
      const before = current;
      const next = nextAltState(current, e, isTypingTarget(e.target));
      if (e.key === 'Alt' && (e.type === 'keydown' ? next : before) === 'hints') e.preventDefault();
      set(next);
    };
    const onFocus = (e: FocusEvent) => set(nextAltState(current, { type: 'focus' }, isTypingTarget(e.type === 'focusout' ? e.relatedTarget : e.target)));
    const off = () => set('off');
    const onVis = () => { if (document.hidden) off(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('focusin', onFocus, true);
    window.addEventListener('focusout', onFocus, true);
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('focusin', onFocus, true);
      window.removeEventListener('focusout', onFocus, true);
      window.removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', onVis);
      setState('off');
    };
  }, [enabled]);
  return state;
}
