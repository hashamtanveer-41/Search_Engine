// Switching the page's theme ("no transition on theme switch, instant switch,
// freeze the whole page, change theme, then draw again"). Every transition on the page is off while
// the theme changes, so nothing fades from one theme's colours to the other's: each switch started
// some 550 colour transitions on a lesson, and the frames they ran in took up to 380 ms. The theme
// is written to <html> straight away, before React draws anything for it, and the page's style is
// worked out once with the transitions off; then they are back. The theme button's own icon
// ([data-theme-morph], base/theme-icon.tsx) is left out: it moves (19 Nov).
//
// Then the page crossfades: with view transitions the browser takes a picture of it
// in the old theme, the theme changes as above (one style pass, no element transitioning), and the
// picture fades into the page in the new one; the theme button's icon is drawn over both, morphing
// (styles.css "Theme switch"). No view transitions, or reduced motion: the switch is instant.

export type ThemeName = 'light' | 'dark';

/** No transition anywhere but the theme button's sun and moon, for the one style pass the theme
 *  changes in. */
const FREEZE = ':not([data-theme-morph],[data-theme-morph] *),::before,::after{transition:none!important}';

/** How long the page takes to crossfade from one theme to the other (styles.css says it too). */
export const THEME_FADE_MS = 300;

type Transitioning = Document & { startViewTransition?(update: () => void): { finished: Promise<unknown> } };

/** The theme a crossfade is on its way to, its change not made yet: asked for it again (React's own
 *  effect, a moment after the click), there is nothing to do; a second crossfade would cut the first
 *  short and take its styles with it. Which switch is the latest: only that one's end unmarks. */
let going: ThemeName | null = null;
let latest = 0;

/** Puts the page in `theme`, crossfading where the browser can (a no-op when it is in it already). */
export function applyTheme(theme: ThemeName, doc: Document = document) {
  const root = doc.documentElement;
  if (going === theme || (going === null && root.dataset.theme === theme && root.style.colorScheme === theme)) return;
  const mine = ++latest;
  const change = () => {
    if (latest === mine) going = null;
    const freeze = doc.createElement('style');
    freeze.setAttribute('data-theme-switch', '');
    freeze.textContent = FREEZE;
    doc.head.append(freeze);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    // The page's style worked out now, with every transition off: each colour takes its new value.
    if (doc.body) void doc.defaultView?.getComputedStyle(doc.body).color;
    setTimeout(() => freeze.remove(), 0);
  };
  const start = (doc as Transitioning).startViewTransition;
  const still = !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof start !== 'function' || still) { change(); return; }
  // Marked while it plays, so the crossfade's own styles are this one's alone.
  going = theme;
  root.setAttribute('data-theme-fading', '');
  const done = () => { if (latest === mine) root.removeAttribute('data-theme-fading'); };
  start.call(doc, change).finished.then(done, done);
}
