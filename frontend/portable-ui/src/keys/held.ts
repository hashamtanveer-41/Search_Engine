// Whether a modifier is held right now (keydown and keyup on the window, and the pointer's own moves,
// for a key that went down while another window had the focus; a blur lets go): for a control that
// behaves otherwise while it is, as a tab that drags as its link with ⌥ / Alt.
import * as React from 'react';
import { isMac, type Modifier } from './combo';

const FLAG: Record<Exclude<Modifier, 'Mod'>, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'> = { Alt: 'altKey', Shift: 'shiftKey', Ctrl: 'ctrlKey', Meta: 'metaKey' };

/** `any`: whichever of ⌘ ⌥ ⇧ ⌃ (a link that drags as one with any of them held, ). */
export function useHeld(mod: Modifier | 'any'): boolean {
  const [held, setHeld] = React.useState(false);
  React.useEffect(() => {
    const flags = mod === 'any' ? Object.values(FLAG) : [FLAG[mod === 'Mod' ? (isMac() ? 'Meta' : 'Ctrl') : mod]];
    const key = (e: KeyboardEvent | PointerEvent) => setHeld(flags.some((f) => e[f]));
    const off = () => setHeld(false);
    const on = ['keydown', 'keyup', 'pointermove', 'pointerover'] as const;
    for (const type of on) window.addEventListener(type, key, { capture: true, passive: true });
    window.addEventListener('blur', off);
    return () => { for (const type of on) window.removeEventListener(type, key, { capture: true }); window.removeEventListener('blur', off); };
  }, [mod]);
  return held;
}
