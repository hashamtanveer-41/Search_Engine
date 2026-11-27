// Lesson callouts, one per group purpose a lesson has:
// note, intuition, warning ("Watch out") and takeaway. Each is set off by a coloured rule and tint,
// and by its label and icon, so it reads without colour too. A takeaway asks first: the reader says
// it in their own words, then reveals it.
import * as React from 'react';
import { CircleCheck, Info, Lightbulb, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button } from '../../base/button';
import { cn } from '../../lib/utils';

export type CalloutPurpose = 'note' | 'intuition' | 'warning' | 'takeaway';

const PURPOSES: Record<CalloutPurpose, { label: string; icon: LucideIcon; className: string }> = {
  note: { label: 'Note', icon: Info, className: 'border-info bg-info-soft [&_[data-slot=callout-label]]:text-info' },
  intuition: { label: 'Intuition', icon: Lightbulb, className: 'border-ex bg-ex-soft [&_[data-slot=callout-label]]:text-ex' },
  warning: { label: 'Watch out', icon: TriangleAlert, className: 'border-tip bg-tip-soft [&_[data-slot=callout-label]]:text-tip' },
  takeaway: { label: 'Takeaway', icon: CircleCheck, className: 'border-ok bg-ok-soft [&_[data-slot=callout-label]]:text-ok' },
};

function Callout({ purpose, title, className, children, ...props }: React.ComponentProps<'aside'> & { purpose: CalloutPurpose; title?: string }) {
  const p = PURPOSES[purpose];
  const Icon = p.icon;
  const [shown, setShown] = React.useState(purpose !== 'takeaway');
  return (
    <aside data-slot="callout" data-purpose={purpose} aria-label={title ?? p.label}
      className={cn('rounded-r-lg border-l-[3px] px-4 py-3.5 text-[14.5px] leading-relaxed', p.className, className)} {...props}>
      <div data-slot="callout-label" className="ui-caption mb-1 flex items-center gap-1.5 font-semibold">
        <Icon aria-hidden className="size-3.5" />
        {title ?? p.label}
      </div>
      {shown ? children : (
        <div className="grid justify-items-start gap-2">
          <p className="text-muted-foreground">Before you look: what is the one thing to remember here? Say it in a sentence.</p>
          <Button size="sm" variant="outline" onClick={() => setShown(true)}>Show the takeaway</Button>
        </div>
      )}
    </aside>
  );
}

export { Callout };
