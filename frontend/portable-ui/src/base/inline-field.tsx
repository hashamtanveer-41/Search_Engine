// InlineField: a name that reads as text and renames in place (a space's name on its card and in the
// top bar, ). It is a field all the while, read-only until renamed, so renaming
// moves nothing: underlined on hover, a first click says "Click again to rename" (the tip points at
// the text itself, not the middle of a wide field), the second makes it editable with the text
// selected. Enter or leaving it keeps the new value (trimmed; an empty one keeps the old), Escape the
// old. Until it is renamed a click does not focus it, so no caret blinks in the text.
//
// `fill` runs the width of its container (a card); otherwise it hugs its text, growing as it is
// typed (a breadcrumb). `editing` can be held by the app (a name to type as soon as it is made, a
// Rename button elsewhere); otherwise the two clicks run it. Without `onChange` it is plain text.
// Left empty, it keeps the old name and calls `onEmpty`.
import * as React from 'react';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/** How long the first click's "Click again" stands. */
export const INLINE_ARMED_MS = 3000;

export interface InlineFieldProps {
  value: string;
  /** A new value, trimmed and not empty. Without it the name cannot be renamed. */
  onChange?(value: string): void;
  /** Left empty (Enter or leaving it, not Escape): the old value stays, and this hears of it (a space
   *  just made and given no name is removed, ). */
  onEmpty?(): void;
  /** What it names, for screen readers while it is edited ("Space name"). */
  label?: string;
  editing?: boolean;
  onEditingChange?(editing: boolean): void;
  /** The tip after the first click. */
  hint?: string;
  hintSide?: 'top' | 'bottom';
  maxLength?: number;
  /** Runs its container's width; otherwise it hugs its text. */
  fill?: boolean;
  /** The text's size and weight (both the field and the copy the tip points at). */
  className?: string;
}

function InlineField({ value, onChange, onEmpty, label = 'Name', editing: held, onEditingChange, hint = 'Click again to rename', hintSide = 'top', maxLength = 40, fill, className }: InlineFieldProps) {
  const [own, setOwn] = React.useState(false);
  const editing = held ?? own;
  const setEditing = (on: boolean) => { if (held === undefined) setOwn(on); onEditingChange?.(on); };
  const [armed, setArmed] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const field = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), INLINE_ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);
  React.useEffect(() => {
    if (editing) { field.current?.focus(); field.current?.select(); } else setDraft(value);
  }, [editing, value]);
  const done = (keep: boolean) => {
    const next = draft.trim();
    if (keep && next && next !== value) onChange?.(next);
    else setDraft(value);
    setEditing(false);
    if (keep && !next) onEmpty?.();
    // Still focused (for the keyboard), but no longer selected, and from its first letter.
    const el = field.current;
    if (el) { el.setSelectionRange(0, 0); el.scrollLeft = 0; }
  };
  const text = cn('border border-transparent px-1.5', className);
  return (
    <span data-slot="inline-field" data-editing={editing || undefined}
      // Its padding hangs out into the margins (-mx), so the text lines up with the text round it: as
      // wide as the room it is given plus those margins, no wider.
      className={cn('relative -mx-1.5 min-w-0', fill ? 'flex flex-1' : 'inline-grid max-w-[calc(100%+0.75rem)]')}>
      {/* Hugging its text: an invisible copy of it sizes the field, a space wider so the caret at the
          end never scrolls the first letter out. */}
      {!fill && <span aria-hidden className={cn('invisible col-start-1 row-start-1 truncate whitespace-pre', text)}>{`${draft} `}</span>}
      {/* size 1: a field's own default width (about 20 characters) would widen the grid it hugs. */}
      <input ref={field} value={draft} readOnly={!editing} maxLength={maxLength} spellCheck={false} size={fill ? undefined : 1}
        aria-label={editing ? label : onChange ? `${value}, click twice to rename` : value}
        className={cn('h-7 w-full min-w-0 truncate rounded-md bg-transparent outline-none transition-colors', text,
          !fill && 'col-start-1 row-start-1',
          editing ? 'border-input bg-background' : onChange ? 'cursor-pointer caret-transparent select-none decoration-muted-foreground/60 underline-offset-4 hover:underline' : 'pointer-events-none')}
        onChange={(e) => setDraft(e.target.value)}
        onMouseDown={(e) => { if (!editing) e.preventDefault(); }}
        onClick={() => {
          if (editing || !onChange) return;
          if (armed) { setArmed(false); setEditing(true); } else setArmed(true);
        }}
        onKeyDown={(e) => {
          if (!editing) { if (e.key === 'Enter' && onChange) { e.preventDefault(); setEditing(true); } return; }
          if (e.key === 'Enter') { e.preventDefault(); done(true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        }}
        onBlur={() => { setArmed(false); if (editing) done(true); }}
        onPointerLeave={() => setArmed(false)} />
      <TooltipProvider delayDuration={0}>
        <Tooltip open={armed && !editing}>
          <TooltipTrigger asChild>
            <span aria-hidden data-inline-anchor className={cn('pointer-events-none invisible absolute inset-y-0 left-0 max-w-full truncate whitespace-pre', text)}>{value}</span>
          </TooltipTrigger>
          <TooltipContent side={hintSide}>{hint}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

export { InlineField };
