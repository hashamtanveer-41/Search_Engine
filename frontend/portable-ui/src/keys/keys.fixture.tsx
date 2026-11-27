import { defineFixtures } from '../fixture';
import { Keys } from './Keys';
import type { Combo } from './combo';

const SAMPLES: [Combo | Combo[], string][] = [
  ['Mod+K', 'Search'],
  ['Mod+/', 'Keyboard shortcuts'],
  ['Alt+Shift+T', 'Reopen the last closed pane'],
  [['Mod+Shift+Z', 'Mod+Y'], 'Redo'],
  ['Ctrl+Alt+Left', 'The space before'],
  ['Esc', 'Close'],
];

function Table({ mac }: { mac: boolean }) {
  return (
    <dl className="grid gap-2 text-[13.5px]">
      {SAMPLES.map(([combo, what]) => (
        <div key={what} className="flex items-center gap-3"><dt className="w-40 shrink-0"><Keys combo={combo} mac={mac} /></dt><dd className="m-0">{what}</dd></div>
      ))}
    </dl>
  );
}

export default defineFixtures({
  component: 'keys/Keys',
  title: 'Keys',
  frame: { width: 420, padding: 20 },
  cases: {
    'on a Mac': () => <Table mac />,
    'on Windows and Linux': () => <Table mac={false} />,
  },
});
