// A shortcut drawn as its key caps, the platform's (combo.ts): <Keys combo="Mod+K" /> is ⌘ K on a Mac
// and Ctrl K elsewhere. Several are alternatives ("Mod+Shift+Z" or "Ctrl+Y"). A screen reader hears
// it in words ("Command K"), not the symbols.
import * as React from 'react';
import { Kbd, KbdGroup } from '../base/kbd';
import { cn } from '../lib/utils';
import { isMac, keyCaps, keyName, keySpoken, type Combo } from './combo';

export interface KeysProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  combo: Combo | Combo[];
  /** Draw for a Mac or not; the platform's when not given (the playground and tests set it). */
  mac?: boolean;
  /** The first combo's keys drawn held down (a shortcut acted out, shortcuts/). */
  pressed?: boolean;
}

export function Keys({ combo, mac = isMac(), pressed = false, className, ...props }: KeysProps) {
  const combos = Array.isArray(combo) ? combo : [combo];
  return (
    <KbdGroup data-slot="keys" role="img" aria-label={combos.map((c) => keySpoken(c, mac)).join(' or ')} title={combos.map((c) => keyName(c, mac)).join(' or ')}
      className={cn('whitespace-nowrap', className)} {...props}>
      {combos.map((c, i) => (
        <React.Fragment key={c}>
          {i > 0 && <span aria-hidden className="px-0.5 text-xs text-muted-foreground">or</span>}
          {keyCaps(c, mac).map((cap, j) => (
            <Kbd key={j} aria-hidden data-pressed={(pressed && i === 0) || undefined}
              className="transition-[background-color,color,translate] duration-150 data-[pressed]:translate-y-px data-[pressed]:bg-foreground data-[pressed]:text-background">{cap}</Kbd>
          ))}
        </React.Fragment>
      ))}
    </KbdGroup>
  );
}
