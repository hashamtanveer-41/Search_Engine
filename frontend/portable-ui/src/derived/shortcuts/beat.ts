// A shortcut acted out on a loop (the shortcuts guide's stage): a moment as things are, then each
// press in turn (the keys go down and the scene moves on a step), a hold on the result, and again.
import * as React from 'react';

export interface Beat {
  /** Presses so far this round: 0 before the first. */
  step: number;
  /** The keys are down right now. */
  pressed: boolean;
}

/** Before the first press (at once, near enough: ), before the first of each round
 *  after (a moment to see things as they were), between presses, how long a press holds the keys
 *  down, and the hold on the result before the round starts over (ms). */
export const BEAT = { first: 120, lead: 700, every: 1000, down: 220, hold: 1600 };

export function useBeat(presses = 1): Beat {
  const [beat, setBeat] = React.useState<Beat>({ step: 0, pressed: false });
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const at = (ms: number, then: () => void) => { timer = setTimeout(then, ms); };
    const press = (n: number, lead: number) => at(n === 1 ? lead : BEAT.every - BEAT.down, () => {
      setBeat({ step: n, pressed: true });
      at(BEAT.down, () => {
        setBeat({ step: n, pressed: false });
        if (n < presses) press(n + 1, lead);
        else at(BEAT.hold, () => { setBeat({ step: 0, pressed: false }); press(1, BEAT.lead); });
      });
    });
    press(1, BEAT.first);
    return () => clearTimeout(timer);
  }, [presses]);
  return beat;
}
