// Full text for cut-off text: anything shown with an ellipsis (one line, `truncate`) or clamped to a few
// lines (`line-clamp-*`) shows its whole text in a tooltip when the pointer rests on it, or when it
// has keyboard focus. Text that fits shows nothing. Elements with their own `title` keep theirs.
// Call `installTruncationTips()` once, at start-up; it works for every element, present and future.

const DELAY = 350;

export type TextBox = { textOverflow: string; lineClamp: string; scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };

/** Whether text in a box is cut off: wider than the box with an ellipsis, or taller with a line clamp. */
export function cutOff(b: TextBox): boolean {
  const clipsX = b.textOverflow === 'ellipsis' && b.scrollWidth > b.clientWidth + 1;
  const clamped = !!b.lineClamp && b.lineClamp !== 'none';
  return clipsX || (clamped && b.scrollHeight > b.clientHeight + 1);
}

/** Whether an element's text is cut off. */
export function isCutOff(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  return cutOff({ textOverflow: style.textOverflow, lineClamp: style.webkitLineClamp, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
}

/** The nearest cut-off element at or above `target` (a few levels: the text's own box, not the page). */
export function cutOffAt(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
    if (el.hasAttribute('title') || el.closest('[data-no-truncation-tip]')) return null;
    if (isCutOff(el)) return el as HTMLElement;
  }
  return null;
}

let installed = false;
export function installTruncationTips(doc: Document = document) {
  if (installed || !doc.body) return;
  installed = true;
  const tip = doc.createElement('div');
  tip.setAttribute('role', 'tooltip');
  tip.dataset.slot = 'truncation-tip';
  tip.hidden = true;
  doc.body.appendChild(tip);
  let timer = 0;
  /** The cut-off text the tip is showing for. */
  let current: HTMLElement | null = null;
  /** What the pointer (or focus) is on, until it has rested there. */
  let resting: Element | null = null;

  const hide = () => { window.clearTimeout(timer); resting = null; if (current) current.removeAttribute('aria-describedby'); current = null; tip.hidden = true; };
  const show = (el: HTMLElement) => {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return;
    tip.textContent = text;
    tip.hidden = false;
    // Above the text if there is room, else below; kept inside the window.
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
    const above = r.top - t.height - 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${above > 8 ? above : r.bottom + 6}px`;
    tip.id ||= 'ui-truncation-tip';
    el.setAttribute('aria-describedby', tip.id);
  };
  // Nothing is measured as the pointer passes over things, only once it has rested on one. A read
  // of an element's size on every pointerover forced a layout for each thing the pointer crossed,
  // and for each thing that moved under it while it lay still (a pane folding, a sidebar
  // collapsing: 18 ms of one such move, 16 Nov).
  const consider = (target: EventTarget | null) => {
    const el = target instanceof Element ? target : null;
    if (el && (el === resting || current?.contains(el))) return;
    hide();
    if (!el) return;
    resting = el;
    timer = window.setTimeout(() => {
      if (resting !== el) return;
      const cut = cutOffAt(el);
      if (!cut) return;
      current = cut;
      show(cut);
    }, DELAY);
  };
  doc.addEventListener('pointerover', (e) => consider(e.target), true);
  doc.addEventListener('focusin', (e) => consider(e.target), true);
  doc.addEventListener('pointerdown', hide, true);
  doc.addEventListener('scroll', hide, true);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
  // Off the text the tip is for; or, before one shows, out of the window altogether.
  doc.addEventListener('pointerout', (e) => { const to = e.relatedTarget as Node | null; if (current ? !current.contains(to) : !to) hide(); }, true);
}
