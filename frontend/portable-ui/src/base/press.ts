// Press feedback, for every button variant. While one is held down (pointer, or Enter/Space), its
// content grows slightly and fades a little, and: a button with a fill of its own (primary,
// secondary, outline, destructive, success) has its outline grow outward by 2px into a soft ring;
// a ghost button takes a darker fill where its hover fill was; a link only dims. All ease back when
// released. They are
// box-shadow and scale, so nothing re-lays out or moves, and transitions, so a quick tap shows a
// little of them and a long press all of them (styles.css, "Press").
// Call `installPressFeedback()` once, at start-up.

const PRESSABLE = '[data-slot="button"]';

/** The pressable button an event reached; null when it was not one. */
export function pressTarget(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(PRESSABLE) : null;
  return el && !el.matches(':disabled, [aria-disabled="true"], [data-disabled]') ? el : null;
}

/** Holds `el` pressed. */
export function pressDown(el: HTMLElement) {
  el.dataset.pressed = '';
}

export function pressUp(el: HTMLElement) {
  delete el.dataset.pressed;
}

let installed = false;
export function installPressFeedback(doc: Document = document) {
  if (installed) return;
  installed = true;
  let held: HTMLElement | null = null;
  const release = () => { if (held) pressUp(held); held = null; };
  doc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = pressTarget(e.target);
    if (!el) return;
    release();
    held = el;
    pressDown(el);
  }, true);
  doc.addEventListener('pointerup', release, true);
  doc.addEventListener('pointercancel', release, true);
  doc.defaultView?.addEventListener('blur', release);
  doc.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    const el = pressTarget(e.target);
    if (!el) return;
    release();
    held = el;
    pressDown(el);
  }, true);
  doc.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') release(); }, true);
}
