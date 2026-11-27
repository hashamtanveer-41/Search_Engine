import * as React from 'react';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { defineFixtures } from '../fixture';
import { InlineField } from './inline-field';

function Named({ start, fill, className }: { start: string; fill?: boolean; className?: string }) {
  const [value, setValue] = React.useState(start);
  return <InlineField value={value} onChange={setValue} label="Space name" fill={fill} className={className} />;
}

export default defineFixtures({
  component: 'base/inline-field',
  title: 'InlineField',
  frame: { width: 420, padding: 24 },
  cases: {
    'on a card: runs its width': () => (
      <div className="grid gap-1 rounded-xl border bg-card p-3">
        <span className="flex min-w-0 items-center gap-2">
          <LayoutGrid aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1"><Named start="Exam prep" fill className="font-semibold tracking-tight" /></span>
        </span>
        <span className="px-1 text-[13px] text-muted-foreground">Click the name twice to rename it.</span>
      </div>
    ),
    'in a breadcrumb: hugs its text': () => (
      <nav className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Named start="Space 2" />
        <ChevronRight aria-hidden className="size-3 opacity-60" />
        <span>Shipping a small app</span>
        <ChevronRight aria-hidden className="size-3 opacity-60" />
        <b className="font-medium text-foreground">Practice</b>
      </nav>
    ),
    'read only: no onChange': () => <InlineField value="Reading" className="font-semibold" />,
  },
});
