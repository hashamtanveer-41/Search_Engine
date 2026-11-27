#!/usr/bin/env node
// Frame timing of the panes (derived/panes/Workspace) against a 120 Hz budget.
//
//   npm run measure:panes                                     the built playground (ui/dist/playground)
//   npm run measure:panes -- --dir /tmp/pg                    a playground built elsewhere
//   npm run measure:panes -- --url http://127.0.0.1:5174/     a running server (dev or preview)
//   npm run measure:panes -- --runs 5 --cpu 2 --out after.json --compare before.json
//   npm run measure:panes -- --scenario drop                  one scenario, or several: --scenario fold,expand
//   npm run measure:panes -- --no-trace                       rAF and LoAF only, no CDP trace
//   npm run measure:panes -- --traces /tmp/traces             keep each run's trace (DevTools' Performance panel)
//   npm run measure:panes -- --scenario fold --explain        say what the heavy frames did: for every frame
//                                                             after the first that laid out or worked over 4 ms,
//                                                             when it was, what ran in it, and what in the page
//                                                             asked for the layout (best with --minify false)
//
// It builds nothing: build the playground first, e.g.
//   npx vite build --config playground/vite.config.ts --outDir /tmp/pg              (numbers)
//   npx vite build --config playground/vite.config.ts --outDir /tmp/pg --minify false  (profiling)
// Without --url it serves --dir (default ui/dist/playground, where `npm run build:playground`
// writes; else ui/playground/dist) on a free local port.
//
// It opens the Workspace fixture alone (`?fixture=derived/panes/Workspace&case=…&bare`) in headless
// Chromium (/usr/bin/chromium, or $CHROMIUM_PATH) with vsync and the frame-rate limit off, so frames
// are not held to 60 a second: each frame takes as long as its work. Per run it records every
// requestAnimationFrame callback time, the long-animation-frame entries (LoAF: script time and
// style/layout time, but only for frames over 50 ms), when the pointer went down and up, and a CDP
// trace, which has every frame (BeginMainThreadFrame to the next) and the script, style and layout
// in each: the numbers come from the trace (--no-trace: from rAF and LoAF). Scenarios:
//   drop     ("tab drag" case)          the last tab dragged to the area's top edge and let go
//   group    ("tab joins a group" case) the lone right tab dragged onto the middle group's centre
//   divider  ("divider drag" case)      the divider dragged 200 px left over 1 s
//   screen   (derived/screen "desktop")  as drop, on the lesson screen fixture: the sidebar beside
//                                        the panes, as in the app (its SpringWidth re-renders too)
// Folding (a group into its strip and back) and the sidebar's collapse:
//   fold        ("fold" case)            the divider pulled 80 px past the left group's smallest size
//                                        and let go: the pull (the fold follows the pointer) and the
//                                        spring shut after it
//   foldback    ("fold" case)            pulled 30 px past and let go: it springs back
//   foldkey     ("fold" case)            Alt+- folds the active group
//   expand      ("fold" case)            a click on the strip opens it again
//   expandkey   ("fold" case)            Alt+= opens every strip
//   pullopen    ("fold" case)            the strip's divider pulled 250 px away from it and let go
//   sidebar-collapse, sidebar-expand     (derived/sidebar "collapse and expand") the toggle clicked
//   screen-collapse, screen-expand       (derived/screen "desktop") the same beside the panes, as in
//                                        the app: the panes lay out once, at their new width
// For each it reports the work in the first frame (the one holding what set it off: pointerup, the
// key or the click; LoAF script plus style/layout when the frame was long, else the frame's own
// length), how many frames in the window (that frame and the 400 ms after it; for a drag marked
// whole, the drag too) are over the 8.33 ms of a 120 Hz display and the 16.7 ms of 60 Hz, the worst
// frame and the median one; and, for the frames after the first: how many laid anything out (a
// move that is transform, clip-path and opacity only lays out nothing), the most main-thread work
// in one, and the longest.
//
// "The first frame" there is the first one drawn: everything up to the first paint after what set
// it off was handled (its script, then the style, the one layout and the paint of what it changed;
// the trace sometimes has that in one frame and sometimes in two). In a drag marked whole it is
// the frame of the first move. A fold pulled by hand then has two more moments that do real work,
// and --explain names them: the move that crosses the smallest size (the page beside is laid out,
// once, as it will be folded) and, at rest, React taking the layout the fold has already drawn.
//
// Headless Chromium draws in software, on a shared box: absolute numbers are pessimistic. Compare
// runs on the same machine (before and after a change, --compare); that difference is what counts.
// Work (script, style, layout) is the main thread's own CPU time from the trace, so other load on
// the machine does not inflate it; a frame's length is wall-clock, and does grow with that load.
// Measure the two builds one after the other, not hours apart.
// --cpu N slows the CPU N times (CDP Emulation.setCPUThrottlingRate), to look like a slower laptop.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
if (args.includes('--help') || args.includes('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^#!.*\n/, '').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

const runs = Math.max(1, Number(flag('runs', '3')));
const cpu = Number(flag('cpu', '1'));
const out = flag('out', null);
const compare = flag('compare', null);
const only = flag('scenario', null);
const givenUrl = flag('url', null);
// --no-trace: rAF and LoAF only (LoAF sees only frames over 50 ms; the trace sees every frame)
const tracing = !args.includes('--no-trace');
// --traces DIR: keep each run's trace there (<scenario>-<run>.json, opens in DevTools' Performance panel)
const keepTraces = flag('traces', null);
// --explain: what each heavy frame did (it traces invalidations and their stacks, which slows the page a little)
const explain = args.includes('--explain');
const dir = resolve(flag('dir', [join(root, 'dist/playground'), join(root, 'playground/dist')].find((d) => existsSync(join(d, 'index.html'))) ?? join(root, 'dist/playground')));

const BUDGET_120 = 1000 / 120, BUDGET_60 = 1000 / 60;
/** After pointerup, how long the window runs (ms). */
const AFTER = 400;
const FIXTURE = 'derived/panes/Workspace';

// ------------------------------------------------------------------ a static server over the build

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.md': 'text/markdown' };

function serve(base) {
  if (!existsSync(join(base, 'index.html'))) {
    console.error(`No build at ${base} (no index.html). Build the playground first:\n  npx vite build --config playground/vite.config.ts --outDir ${base}`);
    process.exit(2);
  }
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(base, path);
    if (!file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ------------------------------------------------------------------ in the page

/** Installed before the page's own code: the rAF clock, LoAF entries and pointer times. */
function instrument() {
  const w = window;
  w.__m = { frames: [], loaf: [], downs: [], ups: [], keys: [], clicks: [], moves: [], on: false, loafSupported: false };
  const m = w.__m;
  const tick = () => { if (m.on) m.frames.push(performance.now()); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  addEventListener('pointerdown', () => { if (m.on) m.downs.push(performance.now()); }, true);
  addEventListener('pointerup', () => { if (m.on) m.ups.push(performance.now()); }, true);
  addEventListener('pointermove', () => { if (m.on && !m.moves.length) m.moves.push(performance.now()); }, true);
  addEventListener('keydown', () => { if (m.on) m.keys.push(performance.now()); }, true);
  addEventListener('click', () => { if (m.on) m.clicks.push(performance.now()); }, true);
  try {
    m.loafSupported = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!m.on) continue;
        const scripts = (e.scripts ?? []).map((s) => ({ duration: s.duration, forced: s.forcedStyleAndLayoutDuration, invoker: s.invoker, source: s.sourceFunctionName || s.sourceURL?.split('/').pop() }));
        m.loaf.push({ start: e.startTime, duration: e.duration, renderStart: e.renderStart, styleAndLayoutStart: e.styleAndLayoutStart, blocking: e.blockingDuration, scripts });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* no LoAF: frame lengths only */ }
}

// ------------------------------------------------------------------ the numbers

const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** A LoAF entry's main-thread work: its scripts, plus the style and layout of its rendering. */
const loafWork = (e) => {
  const script = e.scripts.reduce((t, s) => t + s.duration, 0);
  const styleLayout = e.styleAndLayoutStart ? e.start + e.duration - e.styleAndLayoutStart : 0;
  const forced = e.scripts.reduce((t, s) => t + (s.forced ?? 0), 0);
  return { script, styleLayout, forced, work: script + styleLayout };
};

/** What sets a scenario off, by its `trigger`: where the page recorded it. */
const MARKS = { pointerup: 'ups', keydown: 'keys', click: 'clicks' };

/** One run's numbers: the first frame (the one holding the trigger), and every frame in
 *  [from, trigger + AFTER]. */
function analyse(m, from, trigger = 'pointerup') {
  const up = m[MARKS[trigger]].at(-1);
  if (up === undefined) throw new Error(`no ${trigger} was recorded`);
  const f = m.frames;
  // frame i is the interval (f[i-1], f[i]]: what ran between two rAF callbacks
  const lengths = [];
  for (let i = 1; i < f.length; i++) if (f[i] >= from && f[i - 1] <= up + AFTER) lengths.push({ end: f[i], length: f[i] - f[i - 1] });
  const k = f.findIndex((t) => t > up);
  const dropFrame = k > 0 ? { start: f[k - 1], end: f[k], length: f[k] - f[k - 1] } : null;
  // the LoAF entries that hold pointerup or start inside the drop frame
  const inDrop = dropFrame ? m.loaf.filter((e) => (e.start <= up && e.start + e.duration >= up) || (e.start >= dropFrame.start && e.start < dropFrame.end)) : [];
  const parts = inDrop.map(loafWork);
  const loaf = parts.length ? { script: parts.reduce((t, p) => t + p.script, 0), styleLayout: parts.reduce((t, p) => t + p.styleLayout, 0), forced: parts.reduce((t, p) => t + p.forced, 0) } : null;
  const ls = lengths.map((x) => x.length);
  return {
    dropWork: loaf ? loaf.script + loaf.styleLayout : dropFrame?.length ?? 0,
    dropWorkFrom: loaf ? 'loaf' : 'frame',
    dropFrame: dropFrame?.length ?? 0,
    dropLoaf: loaf,
    frames: ls.length,
    over120: ls.filter((l) => l > BUDGET_120).length,
    over60: ls.filter((l) => l > BUDGET_60).length,
    worst: ls.length ? Math.max(...ls) : 0,
    median: median(ls),
    // the slowest scripts of the long frames in the window, for finding what to fix
    slowScripts: m.loaf.filter((e) => e.start + e.duration >= from && e.start <= up + AFTER).flatMap((e) => e.scripts).sort((a, b) => b.duration - a.duration).slice(0, 5)
      .map((s) => ({ ms: round(s.duration), forced: round(s.forced ?? 0), invoker: s.invoker, source: s.source })),
  };
}

// ------------------------------------------------------------------ the trace: every frame's work

const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel'];
/** Trace events that run script, and those that compute style and layout. */
const JS = new Set(['FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'FireIdleCallback', 'RunMicrotasks', 'EvaluateScript', 'v8.callFunction']);
const STYLE_LAYOUT = new Set(['UpdateLayoutTree', 'Layout']);

const EXPLAIN_CATEGORIES = ['disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline.invalidationTracking'];
async function startTrace(cdp) {
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: explain ? [...TRACE_CATEGORIES, ...EXPLAIN_CATEGORIES] : TRACE_CATEGORIES } });
}

/** Where in the page's code a trace event came from: the innermost frames of its stack. */
const whence = (e) => {
  const stack = e.args?.data?.stackTrace ?? e.args?.beginData?.stackTrace ?? [];
  return stack.slice(0, 4).map((f) => `${f.functionName || '(anonymous)'}:${f.lineNumber}`).join(' < ');
};

/** What ran in the frame from `a` to `b` (µs): the events dispatched, the timers and animation
 *  frames, and who asked for each layout. */
function story(main, a, b) {
  const inside = main.filter((e) => e.ts >= a && e.ts < b);
  const count = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
  const ran = count(inside.filter((e) => e.ph === 'X' && (e.name === 'EventDispatch' || e.name === 'TimerFire' || e.name === 'FireAnimationFrame' || e.name === 'RunMicrotasks'))
    .map((e) => (e.name === 'EventDispatch' ? e.args?.data?.type : e.name)));
  const layouts = inside.filter((e) => e.name === 'Layout' && e.ph === 'X').map((e) => `${round(e.dur / 1000, 2)} ms, ${e.args?.beginData?.dirtyObjects ?? '?'} of ${e.args?.beginData?.totalObjects ?? '?'} objects${whence(e) ? `, forced by ${whence(e)}` : ''}`);
  const asked = count(inside.filter((e) => e.name === 'LayoutInvalidationTracking' || e.name === 'InvalidateLayout')
    .map((e) => `${e.args?.data?.nodeName ?? ''} ${e.args?.data?.reason ?? ''} ← ${whence(e) || '?'}`.trim())).slice(0, 6);
  // style: how many elements were restyled, and why the most of them were
  const styled = inside.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  const why = count(inside.filter((e) => e.name === 'StyleRecalcInvalidationTracking').map((e) => `${e.args?.data?.reason ?? '?'}${e.args?.data?.extraData ? ` (${e.args.data.extraData})` : ''}`)).slice(0, 4);
  const style = styled.length ? `${styled.reduce((t, e) => t + (e.args?.elementCount ?? 0), 0)} elements, ${round(styled.reduce((t, e) => t + e.dur, 0) / 1000, 2)} ms${why.length ? `: ${why.join('; ')}` : ''}` : '';
  return { ran, layouts, asked, style };
}

async function endTrace(cdp) {
  const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  const chunks = [];
  for (;;) {
    const r = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
    chunks.push(r.base64Encoded ? Buffer.from(r.data, 'base64').toString() : r.data);
    if (r.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  const t = JSON.parse(chunks.join(''));
  return t.traceEvents ?? t;
}

/** Time of `[a, b]` inside `[lo, hi]` (µs). */
const clip = (a, b, lo, hi) => Math.max(0, Math.min(b, hi) - Math.max(a, lo));

/**
 * One run's numbers from the trace. A frame runs from one BeginMainThreadFrame on the page's main
 * thread to the next; its work is the script that ran in it (the outermost script events) plus
 * the style and layout outside that script (style and layout forced inside it are part of the
 * script's time, and counted again on their own as `forced`).
 */
function traceNumbers(events, whole, trigger = 'pointerup') {
  const ptr = (type) => events.filter((e) => e.name === 'EventDispatch' && e.ph === 'X' && e.args?.data?.type === type).sort((a, b) => a.ts - b.ts);
  const up = ptr(trigger).at(-1);
  if (!up) throw new Error(`the trace has no ${trigger}`);
  const main = events.filter((e) => e.pid === up.pid && e.tid === up.tid);
  const starts = main.filter((e) => e.name === 'BeginMainThreadFrame').map((e) => e.ts).sort((a, b) => a - b);
  const complete = main.filter((e) => e.ph === 'X' && e.dur > 0).sort((a, b) => a.ts - b.ts);
  // An event's work is its thread time (`tdur`: the CPU the main thread spent in it), not how long
  // it lasted on the wall: on a busy machine the thread is often waiting its turn.
  const cpu = (e) => e.tdur ?? e.dur;
  // the outermost script events (one inside another counts once)
  const js = [];
  for (const e of complete) {
    if (!JS.has(e.name)) continue;
    const last = js.at(-1);
    if (last && e.ts < last.end) { last.end = Math.max(last.end, e.ts + e.dur); continue; }
    js.push({ ts: e.ts, end: e.ts + e.dur, cpu: cpu(e) });
  }
  const style = complete.filter((e) => STYLE_LAYOUT.has(e.name)).map((e) => ({ ts: e.ts, end: e.ts + e.dur, cpu: cpu(e), forced: js.some((j) => e.ts >= j.ts && e.ts < j.end) }));
  const layouts = complete.filter((e) => e.name === 'Layout').map((e) => ({ ts: e.ts, end: e.ts + e.dur, cpu: cpu(e) }));
  /** The share of an event's work that falls in the frame from `a` to `b`. */
  const work = (x, a, b) => (x.end > x.ts ? x.cpu * clip(x.ts, x.end, a, b) / (x.end - x.ts) : 0);
  const frameAt = (a, b) => {
    const script = js.reduce((t, j) => t + work(j, a, b), 0);
    const forced = style.filter((x) => x.forced).reduce((t, x) => t + work(x, a, b), 0);
    const styleLayout = style.filter((x) => !x.forced).reduce((t, x) => t + work(x, a, b), 0);
    // layout alone (forced or not): a move by transform, clip-path and opacity has none
    const layout = layouts.reduce((t, x) => t + work(x, a, b), 0);
    return { start: a, length: (b - a) / 1000, script: script / 1000, styleLayout: styleLayout / 1000, forced: forced / 1000, layout: layout / 1000, work: (script + styleLayout) / 1000 };
  };
  const frames = [];
  for (let i = 1; i < starts.length; i++) frames.push(frameAt(starts[i - 1], starts[i]));
  const drop = frames.find((f) => f.start <= up.ts && f.start + f.length * 1000 > up.ts) ?? null;
  // a whole drag: from the press, or (pressed before the trace began) from its first move
  const from = whole ? (ptr('pointerdown')[0]?.ts ?? ptr('pointermove')[0]?.ts ?? up.ts) : (drop?.start ?? up.ts);
  const inWindow = frames.filter((f) => f.start >= from && f.start <= up.ts + AFTER * 1000);
  const ls = inWindow.map((f) => f.length);
  // every frame after the first one drawn: for a drag, the first move's; else the frame of the first
  // paint after the trigger was handled (what it changed is on screen from there)
  const painted = whole ? null : main.find((e) => e.name === 'Paint' && e.ph === 'X' && e.ts > up.ts + (up.dur ?? 0));
  const first = painted ? frames.find((f) => f.start <= painted.ts && f.start + f.length * 1000 > painted.ts) : null;
  const rest = first ? inWindow.filter((f) => f.start > first.start) : inWindow.slice(1);
  const r = (f) => f && { length: round(f.length), work: round(f.work), script: round(f.script), styleLayout: round(f.styleLayout), forced: round(f.forced), layout: round(f.layout, 2) };
  return {
    dropWork: drop?.work ?? 0,
    dropFrame: drop?.length ?? 0,
    drop: r(drop),
    frames: ls.length,
    over120: ls.filter((l) => l > BUDGET_120).length,
    over60: ls.filter((l) => l > BUDGET_60).length,
    worst: ls.length ? Math.max(...ls) : 0,
    median: median(ls),
    medianWork: median(inWindow.map((f) => f.work)),
    workOver120: inWindow.filter((f) => f.work > BUDGET_120).length,
    restFrames: rest.length,
    restLayouts: rest.filter((f) => f.layout > 0.05).length,
    restWorstWork: rest.length ? Math.max(...rest.map((f) => f.work)) : 0,
    restWorst: rest.length ? Math.max(...rest.map((f) => f.length)) : 0,
    restOver120: rest.filter((f) => f.length > BUDGET_120).length,
    // the three after the first that worked most, and when (ms from what set it off)
    restHeaviest: [...rest].sort((a, b) => b.work - a.work).slice(0, 3).map((f) => ({ at: round((f.start - up.ts) / 1000), ...r(f) })),
    // the window's frames, longest first, for finding what to fix
    longest: [...inWindow].sort((a, b) => b.length - a.length).slice(0, 5).map(r),
    // --explain: every frame after the first that laid out or worked over 4 ms, in order
    story: explain ? rest.filter((f) => f.layout > 0.05 || f.work > 4).map((f) => ({ at: round((f.start - up.ts) / 1000), ...r(f), ...story(main, f.start, f.start + f.length * 1000) })) : undefined,
  };
}

// ------------------------------------------------------------------ the scenarios

const box = async (loc) => { const b = await loc.boundingBox(); if (!b) throw new Error(`not on the page: ${loc}`); return b; };
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** A move every ~16 ms from `a` to `b` over `ms` (the button as it is). */
async function glide(page, a, b, ms) {
  const n = Math.max(2, Math.round(ms / 16));
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n);
    const wait = t0 + (ms * i) / n - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
}

/** Down at `a`, a move every ~16 ms to `b` over `ms`, a short hold there, then up. */
async function drag(page, a, b, ms, hold = 200) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // past the drag threshold first, so the drag has begun before the long move
  await page.mouse.move(a.x + 8, a.y + 8, { steps: 2 });
  const n = Math.max(2, Math.round(ms / 16));
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n);
    const wait = t0 + (ms * i) / n - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.up();
}

const SCENARIOS = {
  drop: {
    title: 'drop: last tab to the top edge',
    case: 'tab drag',
    async run(page) {
      const tab = await box(page.locator('[data-tab-bar] [role=tab]').last());
      const area = await box(page.locator('.pane-area').first());
      return () => drag(page, centre(tab), { x: area.x + area.width / 2, y: area.y + 8 }, 600);
    },
  },
  group: {
    title: 'drop into a group: onto its centre',
    case: 'tab joins a group',
    async run(page) {
      const tab = await box(page.locator('[data-tab-bar]').nth(2).locator('[role=tab]').first());
      const card = await box(page.locator('.pane-card').nth(1));
      return () => drag(page, centre(tab), centre(card), 800);
    },
  },
  divider: {
    title: 'divider: 200 px over 1 s',
    case: 'divider drag',
    // the whole drag is in the window, not only what follows the release
    whole: true,
    async run(page) {
      const d = centre(await box(page.locator('[data-divider]').first()));
      return () => drag(page, d, { x: d.x - 200, y: d.y }, 1000, 0);
    },
  },
  screen: {
    title: 'drop beside the sidebar (derived/screen)',
    // the lesson screen: the sidebar (SpringWidth) and the panes, as the app draws them
    fixture: 'derived/screen',
    case: 'desktop',
    viewport: { width: 1500, height: 900 },
    async run(page) {
      const tab = await box(page.locator('[data-tab-bar] [role=tab]').last());
      const area = await box(page.locator('.pane-area').first());
      return () => drag(page, centre(tab), { x: area.x + area.width / 2, y: area.y + 8 }, 600);
    },
  },
};

// Folding. The "fold" case is two groups side by side in a 1060 px area: the left one is active.
/** The smallest a group gets before it folds, as a share of its split (model.ts, DEFAULT_LIMITS). */
const MIN_SHARE = 0.12;
/** Presses on the first divider and takes it to `short` px short of the left group's smallest
 *  size (untimed: that part is a plain resize, which lays the pages out live); returns where the
 *  pointer is and the way on (left). */
async function toSmallest(page, short) {
  const d = centre(await box(page.locator('[data-divider]').first()));
  const area = await box(page.locator('.pane-area').first());
  const at = { x: area.x + area.width * MIN_SHARE + short, y: d.y };
  await page.mouse.move(d.x, d.y);
  await page.mouse.down();
  await glide(page, d, at, 300);
  await page.waitForTimeout(150);
  return at;
}
/** Folds the active (left) group with Alt+-, and waits for it to arrive (untimed). */
async function folded(page) {
  await page.keyboard.press('Alt+Minus');
  await page.locator('[data-strip]').first().waitFor();
  await page.waitForTimeout(600);
}

Object.assign(SCENARIOS, {
  fold: {
    title: 'fold: pulled 80 px past the smallest size, let go',
    case: 'fold',
    whole: true,
    async run(page) {
      const at = await toSmallest(page, 1);
      return async () => { await glide(page, at, { x: at.x - 81, y: at.y }, 500); await page.mouse.up(); };
    },
  },
  foldback: {
    title: 'fold: pulled 30 px past, let go (springs back)',
    case: 'fold',
    whole: true,
    async run(page) {
      const at = await toSmallest(page, 1);
      return async () => { await glide(page, at, { x: at.x - 31, y: at.y }, 400); await page.waitForTimeout(120); await page.mouse.up(); };
    },
  },
  foldkey: {
    title: 'fold: Alt+-',
    case: 'fold',
    trigger: 'keydown',
    async run(page) { return () => page.keyboard.press('Alt+Minus'); },
  },
  expand: {
    title: 'expand: a click on the strip',
    case: 'fold',
    trigger: 'click',
    async run(page) {
      await folded(page);
      const strip = centre(await box(page.locator('[data-strip]').first()));
      await page.mouse.move(strip.x, strip.y);
      await page.waitForTimeout(100);
      return () => page.mouse.click(strip.x, strip.y);
    },
  },
  expandkey: {
    title: 'expand: Alt+=',
    case: 'fold',
    trigger: 'keydown',
    async run(page) { await folded(page); return () => page.keyboard.press('Alt+Equal'); },
  },
  pullopen: {
    title: "expand: the strip's divider pulled 250 px away, let go",
    case: 'fold',
    whole: true,
    async run(page) {
      await folded(page);
      const d = centre(await box(page.locator('[data-divider]').first()));
      await page.mouse.move(d.x, d.y);
      await page.mouse.down();
      return async () => { await glide(page, d, { x: d.x + 250, y: d.y }, 500); await page.mouse.up(); };
    },
  },
  'sidebar-collapse': {
    title: 'sidebar: collapse to the rail',
    fixture: 'derived/sidebar',
    case: 'collapse and expand',
    ready: '[data-slot=sidebar]',
    trigger: 'click',
    async run(page) { return () => page.locator('[aria-label="Compact sidebar"]').click(); },
  },
  'sidebar-expand': {
    title: 'sidebar: expand from the rail',
    fixture: 'derived/sidebar',
    case: 'collapse and expand',
    ready: '[data-slot=sidebar]',
    trigger: 'click',
    async run(page) {
      await page.locator('[aria-label="Compact sidebar"]').click();
      await page.waitForTimeout(700);
      return () => page.locator('[aria-label="Expand sidebar"]').click();
    },
  },
  'screen-collapse': {
    title: 'sidebar beside the panes: collapse',
    fixture: 'derived/screen',
    case: 'desktop',
    viewport: { width: 1500, height: 900 },
    trigger: 'click',
    async run(page) { return () => page.locator('[aria-label="Compact sidebar"]').click(); },
  },
  'screen-expand': {
    title: 'sidebar beside the panes: expand',
    fixture: 'derived/screen',
    case: 'desktop',
    viewport: { width: 1500, height: 900 },
    trigger: 'click',
    async run(page) {
      await page.locator('[aria-label="Compact sidebar"]').click();
      await page.waitForTimeout(700);
      return () => page.locator('[aria-label="Expand sidebar"]').click();
    },
  },
});

// ------------------------------------------------------------------ main

/** A run's numbers, rounded for the JSON. */
function tidy(x) {
  const o = { ...x, dropWork: round(x.dropWork), dropFrame: round(x.dropFrame), worst: round(x.worst), median: round(x.median) };
  if (x.medianWork !== undefined) o.medianWork = round(x.medianWork);
  if (x.dropLoaf) o.dropLoaf = { script: round(x.dropLoaf.script), styleLayout: round(x.dropLoaf.styleLayout), forced: round(x.dropLoaf.forced) };
  if (x.raf) o.raf = tidy(x.raf);
  return o;
}

function chromiumPath() {
  for (const p of [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (p && existsSync(p)) return p;
  throw new Error('No Chromium found: set CHROMIUM_PATH.');
}

const server = givenUrl ? null : await serve(dir);
const base = givenUrl ?? `http://127.0.0.1:${server.address().port}/`;
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const results = { tracing, url: base, dir: givenUrl ? null : dir, cpu, runs, chromium: browser.version(), when: new Date().toISOString(), budgets: { hz120: BUDGET_120, hz60: BUDGET_60 }, scenarios: {} };

try {
  for (const [key, sc] of Object.entries(SCENARIOS)) {
    if (only && !only.split(',').includes(key)) continue;
    const all = [];
    const context = await browser.newContext({ viewport: sc.viewport ?? { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(instrument);
    for (let r = 0; r < runs; r++) {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      const href = `${base}?${new URLSearchParams({ fixture: sc.fixture ?? FIXTURE, case: sc.case, bare: '' })}`;
      await page.goto(href, { waitUntil: 'load' });
      await page.locator(sc.ready ?? '.pane-area [data-tab-bar] [role=tab]').first().waitFor();
      if (await page.locator('[data-fixture-error]').count()) throw new Error(`${href}: the fixture did not render`);
      // fonts, KaTeX and the first springs settle before anything is timed
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(800);
      const go = await sc.run(page);
      if (tracing) await startTrace(cdp);
      await page.evaluate(() => { window.__m.on = true; });
      await page.waitForTimeout(100);
      await go();
      await page.waitForTimeout(AFTER + 150);
      const m = await page.evaluate(() => { window.__m.on = false; return window.__m; });
      const trace = tracing ? await endTrace(cdp) : null;
      if (trace && keepTraces) writeFileSync(join(keepTraces, `${key}-${r + 1}.json`), JSON.stringify({ traceEvents: trace }));
      if (!m.loafSupported) results.noLoaf = true;
      const trigger = sc.trigger ?? 'pointerup';
      const raf = analyse(m, sc.whole ? m.downs[0] ?? m.moves[0] : m[MARKS[trigger]].at(-1), trigger);
      // the trace's numbers when there is one; the rAF and LoAF ones beside them either way
      all.push(trace ? { ...traceNumbers(trace, sc.whole, trigger), raf } : raf);
      await page.close();
    }
    await context.close();
    const pick = (k) => all.map((x) => x[k]);
    results.scenarios[key] = {
      title: sc.title,
      dropWork: round(median(pick('dropWork'))), dropWorkMin: round(Math.min(...pick('dropWork'))), dropWorkMax: round(Math.max(...pick('dropWork'))),
      dropForced: tracing ? round(median(all.map((x) => x.drop?.forced ?? 0))) : '–', workOver120: tracing ? round(median(pick('workOver120'))) : '–',
      over120: round(median(pick('over120'))), over60: round(median(pick('over60'))), frames: round(median(pick('frames'))),
      worst: round(Math.max(...pick('worst'))), median: round(median(pick('median'))),
      restLayouts: tracing ? round(median(pick('restLayouts'))) : '–', restWorstWork: tracing ? round(Math.max(...pick('restWorstWork'))) : '–',
      restWorst: tracing ? round(Math.max(...pick('restWorst'))) : '–', restOver120: tracing ? round(median(pick('restOver120'))) : '–',
      source: tracing ? 'trace' : 'raf+loaf',
      runs: all.map(tidy),
    };
  }
} finally {
  await browser.close();
  server?.close();
}

// ------------------------------------------------------------------ the report

const before = compare ? JSON.parse(readFileSync(compare, 'utf8')) : null;
const cols = ['scenario', 'first frame work ms', 'forced ms', '>8.33 ms (120 Hz)', '>16.7 ms (60 Hz)', 'work >8.33', 'worst ms', 'median ms', 'frames', 'after 1st: laid out', 'most work ms', 'longest ms', '>8.33'];
const cell = (k, s, b) => {
  const now = `${s[k]}${k === 'dropWork' ? ` (${s.dropWorkMin}–${s.dropWorkMax})` : ''}`;
  return b ? `${b[k] ?? "?"} → ${now}` : now;
};
const rows = Object.entries(results.scenarios).map(([k, s]) => {
  const b = before?.scenarios?.[k];
  return [k, cell('dropWork', s, b), cell('dropForced', s, b), cell('over120', s, b), cell('over60', s, b), cell('workOver120', s, b), cell('worst', s, b), cell('median', s, b), cell('frames', s, b),
    cell('restLayouts', s, b), cell('restWorstWork', s, b), cell('restWorst', s, b), cell('restOver120', s, b)];
});
const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i]).length)));
const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
console.log(`${results.chromium} · ${runs} run(s) each · cpu ×${cpu} · ${base}${before ? ` · before → after (${compare})` : ''}`);
console.log(line(cols));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
rows.forEach((r) => console.log(line(r)));
console.log('first frame work: script + style/layout in the frame holding what set it off (pointerup, the key, the click), median of the runs (min–max); forced: style/layout forced inside its script.');
console.log('>8.33 / >16.7: frames in the window longer than a 120 / 60 Hz frame; work >8.33: frames whose main-thread work alone is over it (median per run). worst: of all runs.');
console.log('work is the main thread\'s CPU time (other load on the machine does not inflate it); a frame\'s length is wall-clock (it does).');
console.log('after 1st: the frames after the first one drawn (through the first paint after what set it off was handled; in a drag, the first move). laid out: how many ran a layout (median per run); most work: the most main-thread work in one; longest: the longest (both of all runs); >8.33: how many were longer than a 120 Hz frame (median per run).');
console.log(tracing ? 'from a CDP trace (every frame); the rAF and LoAF numbers are in the JSON too.' : 'from rAF and LoAF: a drop frame under 50 ms has no LoAF entry, so its work is the frame length.');
if (!tracing && results.noLoaf) console.log('(no long-animation-frame support: the drop frame work is the frame length)');
if (explain) {
  for (const [k, s] of Object.entries(results.scenarios)) {
    const run = s.runs[0];
    console.log(`\n${k}: the frames after the first that laid out or worked over 4 ms (run 1; ms from what set it off)`);
    for (const f of run.story ?? []) {
      console.log(`  ${String(f.at).padStart(7)} ms  work ${f.work} (script ${f.script}, style and layout ${f.styleLayout}, layout ${f.layout})  ran: ${f.ran.join(', ') || '–'}`);
      if (f.style && f.styleLayout > 4) console.log(`             style: ${f.style}`);
      for (const l of f.layouts) console.log(`             layout: ${l}`);
      for (const a of f.asked) console.log(`             asked by: ${a}`);
    }
    if (!run.story?.length) console.log('  none');
  }
}
if (out) { writeFileSync(out, JSON.stringify(results, null, 2)); console.log(`wrote ${out}`); }
