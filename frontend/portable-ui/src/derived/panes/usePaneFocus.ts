// The active pane is where the keyboard is, both ways round.
//
// - A press or a focus in a pane makes it active.
// - Focus that lands in another pane counts as the person's only if they pressed in that pane, or
//   pressed Tab, within the last second (or clicked into a frame there). A page that focuses itself
//   (a terminal that connects and grabs focus a moment after a click elsewhere) does not take the
//   active pane: focus is given back.
// - When the active pane changes without focus moving (a keyboard command, a close, a move), focus
//   follows it into the pane: to what was focused there last, else the pane itself. Focus the
//   person put outside the panes (the search, a menu, a dialog) is left alone.
// - A frame swallows clicks (the page never sees the press): the window's blur says focus went
//   into a frame, and the frame's pane becomes active.

import { useEffect, useRef, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react';

export const INTENT_MS = 1000;

const paneOf = (el: Element | null) => el?.closest<HTMLElement>('[data-pane-body]')?.dataset.paneBody ?? null;
/** The pane an element belongs to, its card's chrome included (a tab, the header row). */
const ownerOf = (el: Element | null) => paneOf(el) ?? el?.closest<HTMLElement>('[data-front]')?.dataset.front ?? null;

export function usePaneFocus(opts: { area: () => HTMLElement | null; activePane: string | null; inactive: boolean; activate(paneId: string): void }) {
  const press = useRef<{ pane: string | null; at: number }>({ pane: null, at: -Infinity });
  const tabAt = useRef(-Infinity);
  const kept = useRef<Map<string, HTMLElement>>(new Map());
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') tabAt.current = performance.now();
    };
    const onBlur = () =>
      setTimeout(() => {
        const el = document.activeElement;
        const area = o.current.area();
        if (el instanceof HTMLIFrameElement && area?.contains(el) && !o.current.inactive) {
          const id = paneOf(el);
          if (id) o.current.activate(id);
        }
      }, 0);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Focus follows the active pane.
  useEffect(() => {
    const { activePane, inactive, area } = o.current;
    if (!activePane || inactive) return;
    const root = area();
    const body = root?.querySelector<HTMLElement>(`[data-pane-body='${activePane}']`);
    if (!body) return;
    const needsFocus = () => {
      const focused = document.activeElement;
      const lost = !focused || focused === document.body || focused === document.documentElement;
      const owner = ownerOf(focused);
      const inOtherPane = !!owner && owner !== activePane;
      return lost || inOtherPane;
    };
    if (!needsFocus()) return;
    const last = kept.current.get(activePane);
    const target = last?.isConnected && body.contains(last) ? last : body;
    // After the layout has drawn the pane where it now is, and only if nothing else took focus
    // meanwhile (a menu that just opened, a dialog): focus somebody put somewhere stays there.
    requestAnimationFrame(() => needsFocus() && target.focus({ preventScroll: true }));
  }, [opts.activePane, opts.inactive]);

  return {
    onPointerDownCapture(e: ReactPointerEvent) {
      if (o.current.inactive) return;
      const id = paneOf(e.target as Element);
      press.current = { pane: id, at: performance.now() };
      if (id) o.current.activate(id);
    },
    onFocusCapture(e: FocusEvent) {
      const { inactive, activePane, activate } = o.current;
      if (inactive) return;
      const target = e.target as HTMLElement;
      const id = paneOf(target);
      if (!id) return;
      if (id === activePane) {
        if (!(target instanceof HTMLIFrameElement)) kept.current.set(id, target);
        return;
      }
      const now = performance.now();
      const theirs = (press.current.pane === id && now - press.current.at < INTENT_MS) || now - tabAt.current < INTENT_MS;
      if (theirs) {
        if (!(target instanceof HTMLIFrameElement)) kept.current.set(id, target);
        activate(id);
        return;
      }
      // The page focused itself: give the keyboard back to the active pane.
      setTimeout(() => {
        const area = o.current.area();
        const body = activePane && area?.querySelector<HTMLElement>(`[data-pane-body='${activePane}']`);
        if (!body || paneOf(document.activeElement) !== id) return;
        const last = kept.current.get(activePane!);
        (last?.isConnected && body.contains(last) ? last : body).focus({ preventScroll: true });
      }, 0);
    },
  };
}
