// Scroll fades (styles.css, "Scroll fades"): a mask on every scrolling surface, sized by four custom
// properties. This does two things, on load, on resize and as surfaces appear:
// - measures each surface's sticky parts (a table's header row, a sticky first column) into
//   --fade-inset-top / --fade-inset-left, so a fade starts after them, never over them;
// - where CSS scroll-driven animations are missing (Safari before 26), sets the four fade sizes from
//   the scroll position itself;
// - marks the axes a surface does not scroll along (data-still-x, data-still-y), as it resizes, so it
//   has no fades there: a scroll timeline left with no range holds the fade it had (//   a pane whose card grew wide enough for its one tab kept that tab's left edge faded).
// At start-up it looks at the whole page; after that only at what was added and the surfaces around
// what changed, batched into an idle moment (requestIdleCallback, at most IDLE_TIMEOUT ms late).
// Call `installScrollFades()` once, at start-up (once per document, however often it is called).

/** The surfaces that fade: anything this finds scrolling (tagged data-scroll-fade), and the known
 *  ones from the first paint (the same list as styles.css). */
export const SCROLL_SURFACES = ['[data-scroll-fade]',
  '.overflow-auto', '.overflow-y-auto', '.overflow-x-auto', '.overflow-scroll',
  "[data-slot='ui-pane-body']", "[data-slot='scroll-area-viewport']", "[data-slot='widget-stage'][data-fit]",
  "[data-slot='dropdown-menu-scroll']", "[data-slot='select-viewport']",
  '.ui-listing.is-read', '.ui-grid-scroll', '.ui-rail', '.ui-board-list', '.ui-layer-fields', '.ui-layers-nest',
  '.table-scroll', '.data-scroll', '.annotated-notes', '.annotated-passage', '.scenario-main', '.source-panel-body',
  '.timeline-detail', '.trace-note', '.tc-outline', '.er-map-tables', '.datawidget-trail', '.pane-body', '.block-code pre', '.block-math',
].map((s) => `${s}:not([data-no-scroll-fade], [data-slot$='-content'])`).join(', ');

/** How long a fade is, and over how much scrolling it grows in (px). */
export const FADE = 28;

/** The four fades for a scroll position: each grows in over the first FADE px from its edge. */
export function fadesFor(b: { scrollTop: number; scrollLeft: number; scrollHeight: number; scrollWidth: number; clientHeight: number; clientWidth: number }) {
  const ramp = (n: number) => Math.max(0, Math.min(FADE, n));
  const restY = b.scrollHeight - b.clientHeight - b.scrollTop, restX = b.scrollWidth - b.clientWidth - b.scrollLeft;
  const scrollsY = b.scrollHeight > b.clientHeight + 1, scrollsX = b.scrollWidth > b.clientWidth + 1;
  return {
    top: scrollsY ? ramp(b.scrollTop) : 0, bottom: scrollsY ? ramp(restY) : 0,
    left: scrollsX ? ramp(b.scrollLeft) : 0, right: scrollsX ? ramp(restX) : 0,
  };
}

/** How far a surface's sticky header row and sticky first column reach into it (px). */
export function stickyInsets(el: HTMLElement): { top: number; left: number } {
  const head = el.querySelector<HTMLElement>(':scope > table > thead, :scope > div > table > thead');
  const top = head && getComputedStyle(head.querySelector('th') ?? head).position === 'sticky' ? head.getBoundingClientRect().height : 0;
  const firstCell = el.querySelector<HTMLElement>(':scope > table > tbody > tr > :first-child, :scope > div > table > tbody > tr > :first-child');
  const left = firstCell && getComputedStyle(firstCell).position === 'sticky' ? firstCell.getBoundingClientRect().width : 0;
  return { top: Math.round(top), left: Math.round(left) };
}

/** Writes a length to a custom property, unless it has that value already (a write restyles the
 *  surface; the properties are declared not inherited in styles.css, so never what is inside it). */
const setLength = (el: HTMLElement, name: string, px: number) => {
  const value = `${px}px`;
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
};

/** Marks the axes `el` does not scroll along: their fades are off (styles.css). */
export function markStill(el: HTMLElement) {
  const x = el.scrollWidth <= el.clientWidth + 1, y = el.scrollHeight <= el.clientHeight + 1;
  if (el.hasAttribute('data-still-x') !== x) el.toggleAttribute('data-still-x', x);
  if (el.hasAttribute('data-still-y') !== y) el.toggleAttribute('data-still-y', y);
}

const inset = (el: HTMLElement) => {
  const { top, left } = stickyInsets(el);
  setLength(el, '--fade-inset-top', top);
  setLength(el, '--fade-inset-left', left);
};

/** Whether an element scrolls on its own (its overflow is auto or scroll on either axis). */
export function scrollsOnItsOwn(style: Pick<CSSStyleDeclaration, 'overflowX' | 'overflowY'>): boolean {
  return [style.overflowX, style.overflowY].some((o) => o === 'auto' || o === 'scroll');
}

/** What is never tagged: a box that floats over the page (a menu, a popover; its mask would clip its
 *  shadow), a zoomed copy, and anything inside an SVG drawing. */
const NOT_TAGGED = "[data-no-scroll-fade], [data-slot$='-content'], [data-slot^='zoom-'], svg *";

const tagOne = (el: Element) => {
  if (el.hasAttribute('data-scroll-fade') || el.matches(NOT_TAGGED)) return;
  if (scrollsOnItsOwn(getComputedStyle(el))) el.setAttribute('data-scroll-fade', '');
};

/** Tags every element in `root` (itself too) that scrolls on its own, so it fades like the rest
 *  (no list to keep up). */
export function tagWithin(root: Element) {
  tagOne(root);
  for (const el of root.querySelectorAll('*')) tagOne(el);
}

/** The surfaces in `root`, itself included. */
const surfacesIn = (root: Element): HTMLElement[] => {
  const found = [...root.querySelectorAll<HTMLElement>(SCROLL_SURFACES)];
  if (root instanceof HTMLElement && root.matches(SCROLL_SURFACES)) found.unshift(root);
  return found;
};

const apply = (el: HTMLElement) => {
  const f = fadesFor(el);
  el.style.setProperty('--fade-top', `${f.top}px`);
  el.style.setProperty('--fade-bottom', `${f.bottom}px`);
  el.style.setProperty('--fade-left', `${f.left}px`);
  el.style.setProperty('--fade-right', `${f.right}px`);
};

/** Runs `fn` when the page is idle, or after `timeout` ms at the latest (setTimeout where there is no
 *  requestIdleCallback: Safari). */
const whenIdle = (fn: () => void, timeout: number) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, Math.min(timeout, 50));
};

/** How long a batch of changes may wait for an idle moment (ms). */
export const IDLE_TIMEOUT = 150;

const installedOn = new WeakSet<Document>();
export function installScrollFades(doc: Document = document) {
  if (installedOn.has(doc) || !doc.body) return;
  installedOn.add(doc);
  const native = typeof CSS !== 'undefined' && !!CSS.supports?.('animation-timeline: scroll()');
  // A surface that changes size may start or stop scrolling: its still axes, and (without scroll
  // timelines) its fades, again. Reading its scroll size here costs no layout: it has just had one.
  const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    for (const e of entries) { const el = e.target as HTMLElement; markStill(el); if (!native) apply(el); }
  });
  const watched = new WeakSet<Element>();
  const settle = (el: HTMLElement) => {
    inset(el);
    markStill(el);
    if (sized && !watched.has(el)) { watched.add(el); sized.observe(el); }
    if (!native) apply(el);
  };
  // The whole page, once at start-up and on a resize (seldom, and never mid-gesture).
  const all = () => { tagWithin(doc.body); doc.querySelectorAll<HTMLElement>(SCROLL_SURFACES).forEach(settle); };
  // After that, only what changed. A pane drop moves whole subtrees: scanning the page then (every
  // element's computed style, every surface's sticky parts) was ~19 ms of the frame after the drop
  // (16 Nov). Now the nodes added are tagged, the surfaces in them and around the changed ones are
  // measured, and all of it waits for an idle moment, never the frame of the change itself.
  let added = new Set<Element>();
  let changed = new Set<Node>();
  let queued = false;
  let resized = false;
  const flush = () => {
    queued = false;
    const roots = added, targets = changed;
    added = new Set();
    changed = new Set();
    if (resized) { resized = false; all(); return; }
    const surfaces = new Set<HTMLElement>();
    for (const root of roots) {
      if (!root.isConnected) continue;
      // inside another added node: its scan covers this one
      let inside = false;
      for (let p = root.parentElement; p && !inside; p = p.parentElement) inside = roots.has(p);
      if (inside) continue;
      tagWithin(root);
      surfacesIn(root).forEach((el) => surfaces.add(el));
    }
    // A surface whose content changed (a header row added, rows taken away): its sticky parts may
    // have; without CSS scroll timelines, every surface around the change may scroll differently.
    for (const t of targets) {
      const el = t instanceof Element ? t : t.parentElement;
      if (!el?.isConnected) continue;
      for (let s = el.closest<HTMLElement>(SCROLL_SURFACES); s; s = native ? null : s.parentElement?.closest<HTMLElement>(SCROLL_SURFACES) ?? null) surfaces.add(s);
    }
    surfaces.forEach(settle);
  };
  const soon = () => { if (!queued) { queued = true; whenIdle(flush, IDLE_TIMEOUT); } };
  if (!native) doc.addEventListener('scroll', (e) => { const el = e.target; if (el instanceof HTMLElement && el.matches(SCROLL_SURFACES)) apply(el); }, true);
  window.addEventListener('resize', () => { resized = true; soon(); });
  new MutationObserver((records) => {
    for (const r of records) {
      changed.add(r.target);
      r.addedNodes.forEach((n) => { if (n instanceof Element) added.add(n); });
    }
    soon();
  }).observe(doc.body, { childList: true, subtree: true });
  all();
}
