import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import { installPressFeedback } from '../src/base/press';
import { installListSprings, installOpenSprings } from '../src/lib/motion';
import { installTruncationTips } from '../src/base/truncation';
import { installScrollFades } from '../src/base/scroll-fades';
import { installDebug } from './debug-settings';
import { emulateTouch } from './touch';
import { themeFor } from './route';

// Motion is part of the components, not a helper: always on.
installOpenSprings();
installListSprings();

// the Debug dialog's settings first: they decide what the rest installs and draws
const debug = installDebug();
if (debug.helpers) {
  installPressFeedback();
  installTruncationTips();
  installScrollFades();
}

// `?fixture=…` (or `?fixtures`) shows fixtures on their own; anything else is the playground. Both
// draw in the URL's theme, else the saved one, else the system's (before the first paint). Each is
// loaded only when asked for: every fixture is in FixtureView's (the library's cases among them),
// none of them is in the playground's.
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
const FixtureView = lazy(() => import('./FixtureView').then((m) => ({ default: m.FixtureView })));
const query = new URLSearchParams(location.search);
// Inside a Phone or Tablet frame a mouse is a finger, from before anything is drawn (touch.ts).
if (query.get('embed') === 'touch') emulateTouch();
document.documentElement.dataset.theme = themeFor(location.search);
const fixtures = query.has('fixture') || query.has('fixtures');

createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={null}>{fixtures ? <FixtureView component={query.get('fixture')} name={query.get('case')} bare={query.has('bare')} /> : <App />}</Suspense></StrictMode>,
);
