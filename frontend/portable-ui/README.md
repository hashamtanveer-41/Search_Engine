# portable-ui

A React component library, and a playground that shows it. It is shadcn/ui components restyled (Geist, black and white with semantic
colour, marks), plus panes, a sidebar, charts, a board and the small pieces they are built from. It ships as TypeScript and CSS
source, so the app that uses it builds it, and it has no ties to any one app.

## Use it

Copy this folder into the project (say `vendor/portable-ui`) and depend on it:

```json
"dependencies": { "portable-ui": "file:vendor/portable-ui" }
```

The app needs:

- `react` and `react-dom` 19 (peers);
- Tailwind CSS v4 (with Vite, `@tailwindcss/vite`), and `@import 'portable-ui/styles.css';` once in its CSS;
- with Vite, `resolve: { dedupe: ['react', 'react-dom'] }`, so a second React never gets in through this folder's own `node_modules`.

Import from `portable-ui/base` (the components) and `portable-ui/derived` (what is built from them).

## Playground

```sh
npm run dev:playground      # installs once, then http://127.0.0.1:5174
npm run build:playground    # a static build in dist/playground
```

The playground shows every component, to try hover, focus, keyboard, menus, dialogs and toasts. The bar at the top switches light/dark and the frame size (phone, tablet, desktop).

How it is drawn is a link (`playground/route.ts`): `?theme=dark` wins over the saved theme (then the saved one, then the system's; the fixture view does the same), and `?size=phone` draws it in a frame that wide. A saved choice is used only while it is still valid.

`?fixture=<component>[&case=<name>][&bare]` shows one fixture set or case alone (`?fixtures` lists them, and any problem in the fixture files, such as one id defined twice: the first is kept). A component or case that isn't there says **Not found**. `npm run shot` screenshots and records cases from it, and `npm run shot -- --app "theme=dark"` the playground itself at a link; it exits 2 when what it was asked for didn't draw.

The bug button in the bar opens **Debug** (`playground/Debug.tsx`, saved per browser as `pg/debug`): stop skipping off-screen frames, reduce motion or slow every animation 5×, outline layout shifts with a running score, turn the page helpers off (on reload), and forget the playground's storage. The playground's side of these is `playground/debug-settings.ts`; the app never sets it.

## Layout

| Folder | What is in it |
| --- | --- |
| `src/base/` | [shadcn/ui](https://ui.shadcn.com) components (new-york-v4), copied in with their Radix behaviour and restyled: button (with a `success` variant), input, textarea, label, select, checkbox, radio group, switch, tabs, accordion, tooltip, popover, dropdown menu, dialog, sheet, progress, skeleton, kbd, avatar, separator, toaster (sonner). Plus the library’s own: `mark.tsx` (badges), `count.tsx` (the number pill every badge uses), `notify.ts` + `notifications.tsx`, `press.ts`. Base pieces are built from each other (dialog, sheet and notification controls are `Button`s; marks use `Tooltip` and `Count`), so each look has one source of truth. |
| `src/derived/` | Built from base. `card.tsx`, `alert.tsx`, `board.tsx` (a board's columns and cards), `stat-tile.tsx` (a number at a glance as a tile, and a share as a ring), `charts.tsx` (our own small SVG charts: a burn-up, a donut, stacked bars; tokens only, each said in words and in a table too), `milestone-track.tsx` (milestones on one line with today marked; down the page when narrow), `sidebar.tsx` (full and compact), `panes/` (tabs, splits, drag a tab to split, dividers; a phone layout of its own), `widgets/` (callout, question, lesson blocks), and `views/` (code listing, frame, pane, question, stepper, view lock). |
| `src/styles.css` | The Tailwind v4 theme: tokens for light and dark, the semantic colours, motion, toasts. |
| `playground/` | The Vite app behind `npm run dev:playground`. |

## Design rules

- **Font:** Geist, and Geist Mono for numbers, counts and keys.
- **Black and white, with semantic colour** only where it means something: green right/done, amber caution/draft/due, red wrong/failed, blue information/running/"you are here". In lessons: blue definitions, violet theorems, teal intuition/examples, amber "watch out", green takeaways.
- **Focus grows the outline:** a 2px ring in the outline's own colour at full opacity (no pale halo). Invalid fields do the same in red.
- **Marks, not badges:** an icon on a tinted rounded-square tile, never text inside; the words are in a tooltip that opens at once on hover and on keyboard focus. Counts sit on the corner. Every state has its own icon, so marks read without colour.
- **Motion:** checkbox ticks draw themselves, radio dots spring in, the tab pill slides between tabs, accordion panels rise in; all of it stands still under reduced motion.
- **Notifications** (`notify()` in `base/notify.ts`, shown by `<Notifications />`): top right, one stack per type (errors first, then warnings, success, info). A stack collapses under its newest notification, with up to two peeking out and a +N pill for the rest, and opens under the pointer or keyboard, showing its top 5 (+N for the rest; click for all). Only the notifications on show count down (the front one collapsed, every listed one opened), so none expires unseen; the one under the pointer stops (not its whole stack). A notification presses like a button (grows slightly, never moving anything) and can be dragged sideways: past 90px or with a flick it leaves, otherwise it springs back. Clicking a notification runs its `onClick`, else its type's route (`setNotificationRoutes`). An identical notification (type, title, description, action) is counted on the open one instead: a badge centred on its top-right corner, and it comes to the front with its time started over; clicking the badge splits it back into one notification per arrival, each with its own time. Dragged away, a notification leaves the way it was dragged. An opened stack of two or more can be cleared at once. Each notification says when it arrived ("just now", "4 min ago", "yesterday 14:05"; the full date on hover).
- **Press feedback** (`installPressFeedback()` in `base/press.ts`, call once): every button. Held down, everything inside the button (label, icons) grows slightly and fades a little (scale); a filled button's outline (primary, secondary, outline, destructive, success) also grows outward by 2px into a soft ring (box-shadow), a ghost button's fill deepens, a link only dims. All ease back on release. Nothing re-lays out and nothing moves.
- **Focus:** a 3px ring at 35% of the ring colour (red for invalid and destructive, a mark's own colour for marks); bordered elements also darken their border. Inset where the element fills a row or sits in something that clips (accordion rows, sidebar lessons, pane tabs); menu items keep their highlight instead.
- **Motion rules:** one curve family (`--ease-settle`, and `--ease-pop` for small things appearing); almost everything is a transition, so a click mid-way redirects it from where it is (tab indicator, accordion, sidebar chapters, solution spoilers, panes, toasts). Keyframes only for one-offs (press feedback, a toast's time bar).
- **Tabs (macOS-style):** the indicator moves on press; dragged, it follows the pointer freely and can sit between two tabs, then settles on the one nearest the pointer (the end tab when let go beyond the list). The line variant stretches toward the press, leading edge first. Tabs have no focus ring: the indicator shows focus.
- **Panes sit flush:** one hairline between them; the pane you are in has a blue line on its tab.
- **Scrub** (`useScrub()` in `base/scrub.ts`): press anywhere along a row of stops and the nearest is chosen; hold and drag, the indicator follows the pointer freely; let go, it settles on the nearest (the end one past either end). Tabs and a code listing's current line use it.
- **Scroll fades:** every scrolling surface fades at an edge it can scroll past, growing over the first 28px; both axes, corners blended; a sticky table header stays sharp (styles.css, CSS scroll timelines; `data-no-scroll-fade` opts out).
- **Cut-off text** (`installTruncationTips()` in `base/truncation.ts`, call once): anything ending in an ellipsis or clamped shows its full text in a tooltip on hover or focus.
- **View lock** (`derived/views/view-lock.tsx`): graphs, plots, maps and 3D views do not zoom, pan or turn until unlocked; a try shakes the lock and lights the widget for a second. Scrolling containers have no lock.
- **Questions:** as tall as their content; the bar says what to do, then how it went (tinted), with the next thing to press; hint and solution are header tools; a set goes one question at a time with progress segments and never resizes.
- **Widgets while loading** hold their size (the height they last rendered at, else a typical one for their kind). About and Details open as a sheet over the page.

## Checks

```sh
npm test            # vitest (jsdom): marks, motion hooks, notifications, press feedback, question, callouts, pane model, drop zones, layout storage
npm run typecheck
```

Third-party code and licences: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
