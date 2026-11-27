import { BookOpen, Bot, Check, Clock, Layers, Pause, RefreshCw, Sparkles, X } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { Mark } from './mark';

export default defineFixtures({
  component: 'base/mark',
  frame: { width: 520, padding: 16 },
  cases: {
    states: () => (
      <div className="flex flex-wrap gap-5">
        <Mark tone="ok" icon={<Check />} label="Done" /><Mark tone="info" icon={<RefreshCw />} label="Running" /><Mark tone="neutral" icon={<Clock />} label="Queued" />
        <Mark tone="warn" icon={<Pause />} label="Paused" /><Mark tone="bad" solid icon={<X />} label="Failed" /><Mark tone="info" solid icon={<Sparkles />} label="New" />
        <Mark tone="thm" icon={<Bot />} label="Agent-assisted" /><Mark tone="ok" icon={<BookOpen />} label="Read" /><Mark tone="warn" icon={<Layers />} label="Cards due" count={8} />
      </div>
    ),
  },
});
