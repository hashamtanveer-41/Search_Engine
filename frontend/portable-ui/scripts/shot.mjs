#!/usr/bin/env node
// Screenshot any fixture of the library:
//
//   npm run shot -- base/button                 every case of a component
//   npm run shot -- base/button:variants        one case
//   npm run shot -- derived/views/code-listing --theme dark --width 900
//   npm run shot -- playground/debug:cache --page --reload 2 --url http://127.0.0.1:4173   its third load
//   npm run shot -- --list                      every fixture and case
//   npm run shot -- --app "theme=dark&size=phone"   the playground itself, at a link
//
// Animation (a case's play script runs, if it has one: clicks, keys, drags, scrolls, waits):
//   npm run shot -- derived/views/code-listing:"stepped to a line" --video [--duration 4s]     MP4 (WebM without ffmpeg)
//   npm run shot -- derived/views/code-listing:"stepped to a line" --images --every 250ms      a PNG every 250 ms
//   npm run shot -- derived/views/code-listing:"stepped to a line" --images --every 10f        every 10th frame (60 fps)
//   npm run shot -- derived/views/frame:"drawers and bar" --images --page         the whole viewport (sheets over the page)
//   npm run shot -- derived/views/question --video --grow 200                 room below for a widget that grows
//   npm run shot -- derived/views/code-listing:"diff with marks" --part .ui-listing-line   one part of a case
//
// It only makes files: it prints the path of each one it wrote, one per line, for whatever runs it.
//
// It starts the playground's Vite dev server (or uses --url), opens `?fixture=…` in headless
// Chromium and saves a PNG of just the fixture (default: shots/<component>-<case>.png). A fixture
// that is missing, or borrows from one that is, renders as a "needs a fixture" card and the tool
// says so (exit code 2), instead of failing silently; so does a component or case that isn't there.
import { execFileSync } from 'node:child_process'; // ffmpeg, to make the MP4
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true; };

const themeGiven = args.includes('--theme');
const theme = flag('theme', 'light');
const width = Number(flag('width', '1100'));
const scale = Number(flag('scale', '2'));
const outArg = flag('out', null);
const baseUrl = flag('url', null);
const list = bool('list');
// The playground's own page at this query (route.ts: `theme=…&size=…`), not a fixture.
const app = flag('app', null);
const video = bool('video');
const images = bool('images');
// Frames (or a PNG) of the whole viewport, not just the case: for what opens over the page (sheets, dialogs).
const wholePage = bool('page');
// Load the case this many more times in the same browser before the PNG: what a cache keeps shows
// on a later load (the playground's maths cache, playground/debug:cache).
const reloads = Number(flag('reload', '0'));
// Extra height below the case for videos and frames of a widget that grows as it is used (px).
const grow = Number(flag('grow', '0'));
// A PNG of one part of the case (a CSS selector inside it), e.g. one section of a long lesson.
const part = flag('part', null);
const every = flag('every', '250ms');
const duration = flag('duration', null);

/** "250ms", "1.5s" or "10f" (frames at 60 fps) → milliseconds. */
function ms(text) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|f)?$/.exec(String(text).trim());
  if (!m) throw new Error(`Not a duration: ${text} (use 250ms, 1.5s or 10f)`);
  const n = Number(m[1]);
  return m[2] === 's' ? n * 1000 : m[2] === 'f' ? n * 1000 / 60 : n;
}

/** Runs a case's play script against the page; selectors are looked up inside the case. */
async function play(page, steps) {
  // Scoped to the case; `>>` chains, so Playwright engines (`text=`, `role=`) work as well as CSS.
  // What opens over the page (popovers, sheets) is outside the case: looked up in the page then.
  const at = (sel) => page.locator("[data-fixture-root]").locator(sel)
    .or(page.locator(`[data-radix-popper-content-wrapper] ${sel}, [role=dialog] ${sel}`)).first();
  for (const step of steps) {
    if ('wait' in step) await page.waitForTimeout(step.wait);
    else if ('click' in step) await at(step.click).click();
    else if ('dblclick' in step) await at(step.dblclick).dblclick();
    else if ('hover' in step) await at(step.hover).hover();
    else if ('press' in step) await page.keyboard.press(step.press);
    else if ('keydown' in step) await page.keyboard.down(step.keydown);
    else if ('keyup' in step) await page.keyboard.up(step.keyup);
    else if ('type' in step) await at(step.type[0]).fill(step.type[1]);
    else if ('scroll' in step) await at(step.scroll[0]).evaluate((el, top) => { el.scrollTop = top; }, step.scroll[1]);
    else if ('hold' in step) {
      // Press on a spot of an element (x, y as fractions of its box) and keep it down for `ms`.
      const b = await at(step.hold.on).boundingBox();
      if (!b) continue;
      await page.mouse.move(b.x + b.width * (step.hold.x ?? 0.5), b.y + b.height * (step.hold.y ?? 0.5));
      await page.mouse.down(); await page.waitForTimeout(step.hold.ms ?? 800); await page.mouse.up();
    }
    else if ('drag' in step) {
      const from = await at(step.drag.from).boundingBox();
      if (!from) continue;
      const fx = from.x + from.width / 2, fy = from.y + from.height / 2;
      let tx = fx + (step.drag.by?.[0] ?? 0), ty = fy + (step.drag.by?.[1] ?? 0);
      if (step.drag.to) { const to = await at(step.drag.to).boundingBox(); if (to) { tx = to.x + to.width / 2; ty = to.y + to.height / 2; } }
      await page.mouse.move(fx, fy); await page.mouse.down();
      // `ms`: a slow drag, spread over that long (frames catch it midway); otherwise a quick one.
      if (step.drag.ms) {
        const n = Math.max(2, Math.round(step.drag.ms / 33));
        for (let i = 1; i <= n; i++) { await page.mouse.move(fx + (tx - fx) * i / n, fy + (ty - fy) * i / n); await page.waitForTimeout(step.drag.ms / n); }
      } else await page.mouse.move(tx, ty, { steps: 24 });
      await page.mouse.up();
    }
  }
}
const scriptLength = (steps) => steps.reduce((t, s) => t + ('wait' in s ? s.wait : 'hold' in s ? (s.hold.ms ?? 800) : 'drag' in s && s.drag.ms ? s.drag.ms : 300), 0);
const target = args[0];

if (!list && !target && app === null) {
  console.error('usage: npm run shot -- <component>[:<case>] [--theme dark] [--width 1100] [--out file.png] [--video [--duration 4s] | --images --every 250ms|10f] | --list | --app "<query>"');
  process.exit(64);
}

/** A Chromium to drive: $CHROMIUM_PATH, Playwright's own download, or the system one. */
function chromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(cache, dir, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (existsSync(p)) return p;
  throw new Error('No Chromium found: set CHROMIUM_PATH, or run `npx playwright install chromium`.');
}

let server = null;
async function start() {
  if (baseUrl) return baseUrl.replace(/\/$/, '');
  const { createServer } = await import('vite');
  server = await createServer({ configFile: join(root, 'playground/vite.config.ts'), server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  return server.resolvedUrls.local[0].replace(/\/$/, '');
}

const { chromium: pw } = await import('playwright-core');
const url = await start();
const browser = await pw.launch({ executablePath: chromium() });
let exit = 0;
try {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (list) {
    await page.goto(`${url}/?fixtures&theme=${theme}`);
    await page.waitForSelector('main ul');
    const rows = await page.$$eval('main li', (lis) => lis.map((li) => { const [head, ...cases] = [...li.querySelectorAll('a')].map((a) => a.textContent); return `${head}: ${cases.join(', ')}`; }));
    console.log(rows.join('\n'));
  } else if (app !== null) {
    const query = new URLSearchParams(app.replace(/^\?/, ''));
    if (themeGiven && !query.has('theme')) query.set('theme', theme);
    await page.goto(`${url}/${query.size ? `?${query}` : ''}`);
    await page.waitForSelector('header, main', { timeout: 30000 });
    // A size frame loads the playground a second time: allow it longer, and draw what is there.
    await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => console.error('shot: still loading after 90s, drawn as it is'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const slug = [...query].map(([k, v]) => (v ? `${k}-${v}` : k)).join('-').replace(/[^\w.-]+/g, '_');
    const out = resolve(outArg ?? join(root, 'shots', `app${slug ? `-${slug}` : ''}.png`));
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(out);
    if (errors.length) { console.error(`page errors:\n  ${errors.join('\n  ')}`); exit = 3; }
  } else if (video || images) {
    const [component, name] = target.split(':');
    if (!name) throw new Error('Video and frames need one case: <component>:<case>');
    const query = new URLSearchParams({ fixture: component, case: name, theme, bare: '' });
    const caseUrl = `${url}/?${query}`;
    // Measure the case at rest, so the recording is exactly its size.
    await page.goto(caseUrl);
    await page.waitForSelector('[data-fixture-bare]');
    // The case publishes its play script once it has drawn; one that isn't there, or fails, says so instead.
    await page.waitForFunction(() => window.__fixturePlay !== undefined || document.querySelector('[data-fixture-error]'));
    const broken = await page.$$eval('[data-fixture-error]', (els) => els.map((e) => e.innerText.trim().replace(/\s*\n\s*/g, ': ')));
    if (broken.length) {
      console.error(`not recorded:\n  ${broken.join('\n  ')}`);
      await browser.close(); await server?.close();
      process.exit(2);
    }
    // Widgets load lazily: let them arrive and settle before measuring.
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const box = await page.locator('[data-fixture-bare]').boundingBox();
    const steps = await page.evaluate(() => window.__fixturePlay ?? []);
    const size = { width: Math.max(200, Math.ceil(box.width) + 2), height: Math.max(120, Math.ceil(box.height) + 2 + grow) };
    const length = duration ? ms(duration) : scriptLength(steps) + 1200;
    const base = join(root, 'shots', `${component.replaceAll('/', '-')}-${name}${theme === 'dark' ? '-dark' : ''}`);
    mkdirSync(dirname(base), { recursive: true });
    if (video) {
      const dir = `${base}-video`;
      const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir, size } });
      const rec = await ctx.newPage();
      rec.on('pageerror', (e) => errors.push(String(e)));
      await rec.goto(caseUrl);
      await rec.waitForSelector('[data-fixture-bare]');
      await rec.waitForLoadState('networkidle');
      await rec.waitForTimeout(500);
      const started = Date.now();
      await play(rec, steps);
      await rec.waitForTimeout(Math.max(300, length - (Date.now() - started)));
      const raw = await rec.video().path();
      await ctx.close();
      let out = `${base}.webm`;
      try {
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', `${base}.mp4`]);
        out = `${base}.mp4`;
      } catch { execFileSync('cp', [raw, out]); }
      console.log(out);
    } else {
      const step = ms(every), dir = `${base}-frames`;
      mkdirSync(dir, { recursive: true });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(caseUrl);
      await page.waitForSelector('[data-fixture-bare]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const target = page.locator('[data-fixture-bare]');
      const started = Date.now();
      const running = play(page, steps);
      const frames = [];
      for (let t = 0, i = 0; t <= length; t += step, i++) {
        const wait = started + t - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
        const file = join(dir, `frame-${String(i).padStart(3, '0')}-${Math.round(t)}ms.png`);
        await (wholePage ? page : target).screenshot({ path: file });
        frames.push(file);
      }
      await running;
      console.log(frames.join('\n'));
    }
    if (errors.length) { console.error(`page errors:\n  ${errors.join('\n  ')}`); exit = 3; }
  } else {
    const [component, name] = target.split(':');
    const query = new URLSearchParams({ fixture: component, theme, ...(name ? { case: name } : {}) });
    await page.goto(`${url}/?${query}`);
    await page.waitForSelector('main', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < reloads; i++) {
      await page.waitForTimeout(800);
      await page.reload();
      await page.waitForSelector('main', { timeout: 30000 });
      await page.waitForLoadState('networkidle');
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const missing = await page.$$eval('[data-fixture-error]', (els) => els.map((e) => e.innerText.trim().replace(/\s*\n\s*/g, ': ')));
    const out = resolve(outArg ?? join(root, 'shots', `${component.replaceAll('/', '-')}${name ? `-${name}` : ''}${theme === 'dark' ? '-dark' : ''}.png`));
    mkdirSync(dirname(out), { recursive: true });
    const box = await page.$(part ? `${name ? `[data-fixture-case="${name}"] ` : ''}${part}` : name ? `[data-fixture-case="${name}"]` : 'main');
    await (wholePage ? page : box ?? page).screenshot({ path: out });
    console.log(out);
    if (missing.length) { console.error(`not drawn:\n  ${missing.join('\n  ')}`); exit = 2; }
    if (errors.length) { console.error(`page errors:\n  ${errors.join('\n  ')}`); exit = exit || 3; }
  }
} finally {
  await browser.close();
  await server?.close();
}
process.exit(exit);
