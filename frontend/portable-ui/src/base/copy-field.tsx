// CopyField: a value to hand on (an invite link, a class code, an API key's id) in monospace, with a
// Copy button that writes it to the clipboard and shows a tick for a moment. If the clipboard
// refuses (no permission, an insecure page), the value is selected so it can be copied by hand.
// `onCopied(ok)` says which happened (to show a notification, say). `label` names the value for
// screen readers ("Invite link") and the button ("Copy invite link"); inside a Field, the Field's
// label names it instead. A value of several lines (a shell setup: `export A=…` then `export B=…`)
// is shown whole, one line under another, in a read-only text area; one line stays a single field.
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { useFieldControl } from './field-context';

/** How long the tick stays after a copy. */
export const COPIED_MS = 1500;

export interface CopyFieldProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  value: string;
  label?: string;
  onCopied?(ok: boolean): void;
}

function CopyField({ value, label, onCopied, className, ...props }: CopyFieldProps) {
  const [copied, setCopied] = React.useState(false);
  const input = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const lines = value.split('\n').length;
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const wired = useFieldControl<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: React.AriaAttributes['aria-invalid'] }>({});
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // No clipboard here: select it, so Ctrl+C (or a long press) copies it.
      input.current?.focus();
      input.current?.select();
    }
    if (ok) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }
    onCopied?.(ok);
  };
  return (
    <div data-slot="copy-field"
      className={cn(
        'flex min-w-0 gap-2 rounded-md border bg-muted/50 p-1.5 ps-3 has-[[data-slot=copy-field-value]:focus-visible]:border-ring has-[[data-slot=copy-field-value]:focus-visible]:ring-[3px] has-[[data-slot=copy-field-value]:focus-visible]:ring-ring/35',
        lines > 1 ? 'items-start' : 'items-center',
        className,
      )}
      {...props}>
      {lines > 1 ? (
        <textarea ref={input} {...wired} readOnly value={value} rows={lines} wrap="off" aria-label={wired.id ? undefined : label}
          data-slot="copy-field-value"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 resize-none self-center overflow-x-auto border-0 bg-transparent p-0 font-mono text-[12.5px] leading-5 text-foreground outline-none" />
      ) : (
        <input ref={input} {...wired} readOnly value={value} aria-label={wired.id ? undefined : label}
          data-slot="copy-field-value"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 font-mono text-[12.5px] text-foreground outline-none" />
      )}
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label ? `Copy ${label.toLowerCase()}` : undefined} data-copied={copied || undefined}>
        {copied ? <Check aria-hidden className="text-ok" /> : <Copy aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <span role="status" className="sr-only">{copied ? 'Copied' : ''}</span>
    </div>
  );
}

export { CopyField };
