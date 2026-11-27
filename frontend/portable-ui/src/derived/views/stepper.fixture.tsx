import { defineFixtures } from '../../fixture';
import { cn } from '../../lib/utils';
import { WidgetFrame } from './frame';
import { PlaybackBar, usePlayback } from './stepper';

const STAGES = [
  { name: 'Checkout', note: 'Clone the commit that was pushed.' },
  { name: 'Install', note: 'Restore the dependency cache, install what changed.' },
  { name: 'Test', note: '584 tests across 44 files.' },
  { name: 'Build', note: 'Bundle the app and the playground.' },
  { name: 'Deploy', note: 'Start a preview and route its domain.' },
];

function Pipeline({ stages = STAGES }: { stages?: typeof STAGES }) {
  const p = usePlayback(stages.length, false, 900);
  return (
    <WidgetFrame id={`fx-stepper-${stages.length}`} kind="Pipeline" title="A deploy, step by step" height={120}
      controls={<PlaybackBar playback={p} label="Stage" format={(i) => stages[i].name} status={<span><b>{stages[p.at].name}</b> — {stages[p.at].note}</span>} />}>
      <ol className="flex h-full items-center gap-2 px-4">
        {stages.map((s, i) => (
          <li key={s.name} className={cn('flex-1 rounded-md border px-2 py-2 text-center text-xs transition-colors', i < p.at && 'border-ok-line bg-ok-soft', i === p.at && 'border-info bg-info-soft font-semibold')}>{s.name}</li>
        ))}
      </ol>
    </WidgetFrame>
  );
}

export default defineFixtures({
  component: 'derived/views/stepper',
  title: 'Stepper',
  frame: { width: 760 },
  cases: {
    'few steps': () => <Pipeline />,
    'many steps (slider)': () => <Pipeline stages={[...STAGES, ...STAGES.map((s) => ({ ...s, name: `${s.name} (prod)` }))]} />,
  },
  play: { 'few steps': [{ wait: 300 }, { click: 'button[aria-label="Play"]' }, { wait: 4500 }] },
});
