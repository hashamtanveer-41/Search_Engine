import { defineFixtures } from '../../fixture';
import { CodeListing, type ListingLine } from './code-listing';
import { WidgetFrame } from './frame';
import { Pane } from './pane';
import { PlaybackBar, usePlayback } from './stepper';

// A config diff: removed lines bad, added ok, the changed value marked inside its line.
const DIFF: ListingLine[] = [
  'server:',
  '  port: 8080',
  { text: '-  workers: 2', tone: 'bad', end: 'removed' },
  { spans: [{ text: '+  workers: ' }, { text: '8', tone: 'ok' }], tone: 'ok', end: 'added' },
  '  timeout: 30s',
  'cache:',
  { spans: [{ text: '  ttl: ' }, { text: '0', tone: 'bad', title: 'a TTL of 0 never caches' }], end: 'lint: 0 disables the cache' },
];

// A failing script, stepped through to the line that throws.
const SCRIPT = `async function checkout(cart) {
  const total = cart.items.reduce((s, i) => s + i.price, 0);
  const user = await getUser(cart.userId);
  if (!user.address) throw new Error('no address');
  return charge(user.card, total);
}`;
const STEPS = [
  { line: 2, note: 'Sum the prices: total = 42.50.' },
  { line: 3, note: 'Fetch the user (await).' },
  { line: 4, note: 'user.address is undefined: it throws.' },
];

function Stepped() {
  const p = usePlayback(STEPS.length, false, 1200);
  const step = STEPS[p.at];
  const failing = p.at === STEPS.length - 1;
  return (
    <WidgetFrame id="fx-listing-step" kind="Debugger" title="Why checkout fails" height={170}
      controls={<PlaybackBar playback={p} label="Step" status={<span><b>Line {step.line}</b> — {step.note}</span>} />}>
      <CodeListing code={SCRIPT} label="JavaScript code" current={step.line}
        onPick={(line) => p.go(STEPS.findIndex((st) => st.line === line))} pickable={STEPS.map((st) => st.line)}
        lines={failing ? SCRIPT.split('\n').map((t, i) => (i === 3 ? { spans: [{ text: '  if (' }, { text: '!user.address', tone: 'bad' as const }, { text: ") throw new Error('no address');" }], end: 'TypeError' } : t)) : undefined} />
    </WidgetFrame>
  );
}

export default defineFixtures({
  component: 'derived/views/code-listing',
  title: 'Code listing',
  frame: { width: 760 },
  cases: {
    'diff with marks': () => (
      <WidgetFrame id="fx-listing-diff" kind="Review" title="config.yaml" height={200}>
        <Pane title={<>changes in <b>config.yaml</b></>} aside="2 changed, 1 warning"><CodeListing lines={DIFF} label="YAML diff" /></Pane>
      </WidgetFrame>
    ),
    'stepped to a line': () => <Stepped />,
  },
  play: {
    'stepped to a line': [{ wait: 400 }, { click: '.ui-listing-line >> nth=3' }, { wait: 700 }, { drag: { from: '.ui-listing-line >> nth=3', by: [0, -30] } }, { wait: 700 }, { hold: { on: '.ui-listing-line >> nth=2', ms: 600 } }, { wait: 600 }],
  },
});
