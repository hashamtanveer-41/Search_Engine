// A practice question: choose, check, and see which was right. The chosen wrong answer turns red
// and the right one green, each with a mark; a hint is there before checking.
import * as React from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '../../base/radio-group';
import { Button } from '../../base/button';
import { Mark } from '../../base/mark';
import { cn } from '../../lib/utils';

export interface QuestionProps {
  number?: number;
  prompt: React.ReactNode;
  options: { id: string; text: React.ReactNode }[];
  answer: string;
  hint?: React.ReactNode;
  /** Said under the options after a wrong answer. */
  explanation?: React.ReactNode;
  onAnswered?(correct: boolean): void;
  className?: string;
}

function Question({ number, prompt, options, answer, hint, explanation, onAnswered, className }: QuestionProps) {
  const [choice, setChoice] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [hinted, setHinted] = React.useState(false);
  const id = React.useId();
  const right = checked && choice === answer;
  return (
    <section data-slot="question" aria-labelledby={`${id}-prompt`} className={cn('rounded-xl border bg-card p-4', className)}>
      {number !== undefined && <div className="ui-caption">Question {number}</div>}
      <p id={`${id}-prompt`} className="mt-1.5 mb-1 text-[14.5px] leading-relaxed">{prompt}</p>
      <RadioGroup value={choice ?? ''} onValueChange={(v) => { if (!checked) setChoice(v); }} className="gap-2" aria-labelledby={`${id}-prompt`}>
        {options.map((o) => {
          const state = !checked ? (choice === o.id ? 'chosen' : '') : o.id === answer ? 'right' : o.id === choice ? 'wrong' : '';
          return (
            <label key={o.id} data-state={state || undefined}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                state === 'chosen' && 'border-foreground',
                state === 'right' && 'border-[1.5px] border-ok bg-ok-soft',
                state === 'wrong' && 'border-[1.5px] border-bad bg-bad-soft',
                checked && 'cursor-default')}>
              <RadioGroupItem value={o.id} disabled={checked && o.id !== choice} />
              <span className="flex-1">{o.text}</span>
              {state === 'right' && <Mark tone="ok" size="sm" icon={<Check />} label="Correct answer" side="left" />}
              {state === 'wrong' && <Mark tone="bad" solid size="sm" icon={<X />} label="Your answer" detail="Not quite" side="left" />}
            </label>
          );
        })}
      </RadioGroup>
      {hinted && hint && !checked && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-tip bg-tip-soft px-3 py-2 text-sm"><Lightbulb className="mt-0.5 size-4 text-tip" aria-hidden />{hint}</p>
      )}
      <div className="mt-3.5 flex items-center justify-between gap-3" aria-live="polite">
        {!checked ? (
          hint ? <Button variant="link" size="sm" className="px-0" onClick={() => setHinted(true)} disabled={hinted}>Show a hint</Button> : <span />
        ) : (
          <span className={cn('text-sm font-medium', right ? 'text-ok' : 'text-bad')}>{right ? 'Right.' : <>Not quite. {explanation}</>}</span>
        )}
        {!checked
          ? <Button size="sm" disabled={!choice} onClick={() => { setChecked(true); onAnswered?.(choice === answer); }}>Check answer</Button>
          : <Button size="sm" variant="outline" onClick={() => { setChecked(false); setChoice(null); setHinted(false); }}>Try again</Button>}
      </div>
    </section>
  );
}

export { Question };
