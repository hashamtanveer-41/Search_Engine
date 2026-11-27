// Field: a form control with its label above it, an optional hint under it and an error that
// replaces nothing (it is added under the hint, in the bad tone, and read out). The label's htmlFor,
// the control's id and its aria-describedby are wired by the Field: the ui controls read them from
// field-context.ts; a native <input>/<select>/<textarea> child is given them directly. One control
// per Field. FieldGroup lays several fields out in a row that wraps (one a line on a phone);
// FieldCheck is a checkbox or switch with its label beside it, on one line.
//
//   <Field label="Lecture title" hint="Students see this in the sidebar." error={err}><Input /></Field>
//   <FieldCheck label="Email me when a lesson is added"><Switch /></FieldCheck>
import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { FieldContext, useFieldControl, type FieldControl } from './field-context';
import { Label } from './label';

export { useFieldControl, type FieldControl };

type Part = 'hint' | 'error';
interface FieldParts { id: string; mark(part: Part, on: boolean): void }
const FieldPartsContext = React.createContext<FieldParts | null>(null);

const hintId = (id: string) => `${id}-hint`;
const errorId = (id: string) => `${id}-error`;
const blank = (node: React.ReactNode) => node === null || node === undefined || node === false || node === '';

/** The id, describedby and invalid state one Field (or FieldCheck) hands its control. */
function useFieldWiring(own: string | undefined, children: React.ReactNode, hint: React.ReactNode, error: React.ReactNode) {
  const auto = React.useId();
  const only = React.Children.count(children) === 1 && React.isValidElement<{ id?: unknown }>(children) ? children : null;
  const childId = typeof only?.props.id === 'string' ? only.props.id : undefined;
  const id = own ?? childId ?? auto;
  // A FieldHint or FieldError placed by hand inside the Field says it is there, so the control is
  // described by it too.
  const [placed, setPlaced] = React.useState<Record<Part, boolean>>({ hint: false, error: false });
  const mark = React.useCallback((part: Part, on: boolean) => setPlaced((p) => (p[part] === on ? p : { ...p, [part]: on })), []);
  const hasHint = !blank(hint) || placed.hint;
  const hasError = !blank(error) || placed.error;
  const control = React.useMemo<FieldControl>(() => ({
    id,
    describedBy: [hasHint && hintId(id), hasError && errorId(id)].filter(Boolean).join(' ') || undefined,
    invalid: hasError,
  }), [id, hasHint, hasError]);
  const parts = React.useMemo<FieldParts>(() => ({ id, mark }), [id, mark]);
  // A native element cannot read the context: it is handed the wiring instead.
  const wired = only && typeof only.type === 'string' ? <NativeControl element={only as React.ReactElement<NativeProps>} /> : children;
  return { id, control, parts, wired };
}

type NativeProps = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: React.AriaAttributes['aria-invalid'] };
function NativeControl({ element }: { element: React.ReactElement<NativeProps> }) {
  const props = useFieldControl(element.props);
  return React.cloneElement(element, { id: props.id, 'aria-describedby': props['aria-describedby'], 'aria-invalid': props['aria-invalid'] });
}

export interface FieldProps extends Omit<React.ComponentProps<'div'>, 'id'> {
  /** The label above the control. Leave it out to place a FieldLabel yourself. */
  label?: React.ReactNode;
  /** A muted line under the control. */
  hint?: React.ReactNode;
  /** What is wrong, under the hint; the control is marked invalid while it is set. */
  error?: React.ReactNode;
  /** The control's id (otherwise the child's own id, otherwise a generated one). */
  id?: string;
  /** Shows a quiet "(optional)" after the label. */
  optional?: boolean;
}

function Field({ label, hint, error, id: own, optional, className, children, ...props }: FieldProps) {
  const { control, parts, wired } = useFieldWiring(own, children, hint, error);
  return (
    <FieldPartsContext.Provider value={parts}>
      <FieldContext.Provider value={control}>
        <div data-slot="field" data-invalid={control.invalid || undefined} className={cn('grid min-w-0 content-start gap-1.5 text-[13px]', className)} {...props}>
          {!blank(label) && <FieldLabel>{label}{optional && <span className="font-normal text-muted-foreground">(optional)</span>}</FieldLabel>}
          {wired}
          {!blank(hint) && <FieldHint>{hint}</FieldHint>}
          {!blank(error) && <FieldError>{error}</FieldError>}
        </div>
      </FieldContext.Provider>
    </FieldPartsContext.Provider>
  );
}

/** The Field's label, pointing at its control. */
function FieldLabel({ className, htmlFor, ...props }: React.ComponentProps<typeof Label>) {
  const parts = React.useContext(FieldPartsContext);
  return <Label data-slot="field-label" htmlFor={htmlFor ?? parts?.id} className={cn('gap-1 text-[13px] leading-snug font-medium', className)} {...props} />;
}

/** Placed by hand inside a Field, a part tells the Field it is there (for aria-describedby). */
function usePart(part: Part, shown: boolean) {
  const parts = React.useContext(FieldPartsContext);
  React.useLayoutEffect(() => {
    if (!parts || !shown) return;
    parts.mark(part, true);
    return () => parts.mark(part, false);
  }, [parts, part, shown]);
  return parts;
}

/** A muted line describing the control. */
function FieldHint({ className, id, children, ...props }: React.ComponentProps<'p'>) {
  const parts = usePart('hint', !blank(children));
  if (blank(children)) return null;
  return <p data-slot="field-hint" id={id ?? (parts ? hintId(parts.id) : undefined)} className={cn('text-[12.5px] leading-snug text-muted-foreground', className)} {...props}>{children}</p>;
}

/** What is wrong with the control, in the bad tone, read out as it appears. Nothing when empty. */
function FieldError({ className, id, children, ...props }: React.ComponentProps<'p'>) {
  const parts = usePart('error', !blank(children));
  if (blank(children)) return null;
  return (
    <p data-slot="field-error" role="alert" id={id ?? (parts ? errorId(parts.id) : undefined)}
      className={cn('flex items-start gap-1 text-[12.5px] leading-snug font-medium text-bad [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0', className)} {...props}>
      <CircleAlert aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Fields side by side, wrapping: one a line on a phone, each its natural width (at least 12rem)
 *  from sm up. A Field with `className="sm:flex-1"` takes the room left. */
function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="field-group"
      className={cn(
        'flex flex-wrap items-start gap-3',
        '*:data-[slot=field]:flex-1 *:data-[slot=field]:basis-full sm:*:data-[slot=field]:min-w-48 sm:*:data-[slot=field]:flex-none sm:*:data-[slot=field]:basis-auto',
        className,
      )}
      {...props} />
  );
}

export interface FieldCheckProps extends Omit<React.ComponentProps<'div'>, 'id'> {
  /** The words beside the box or switch; pressing them toggles it. */
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  id?: string;
  /** A single Checkbox or Switch. */
  children: React.ReactNode;
}

/** A checkbox or switch with its label beside it on one line (and a hint under the label). */
function FieldCheck({ label, hint, error, id: own, className, children, ...props }: FieldCheckProps) {
  const { control, parts, wired } = useFieldWiring(own, children, hint, error);
  return (
    <FieldPartsContext.Provider value={parts}>
      <FieldContext.Provider value={control}>
        <div data-slot="field-check" data-invalid={control.invalid || undefined} className={cn('flex min-w-0 items-start gap-2 text-[13.5px]', className)} {...props}>
          {/* The control sits on the label's first line. */}
          <span className="flex h-5 shrink-0 items-center">{wired}</span>
          <div className="grid min-w-0 gap-0.5">
            <FieldLabel className="text-[13.5px] leading-5 font-normal">{label}</FieldLabel>
            {!blank(hint) && <FieldHint>{hint}</FieldHint>}
            {!blank(error) && <FieldError>{error}</FieldError>}
          </div>
        </div>
      </FieldContext.Provider>
    </FieldPartsContext.Provider>
  );
}

export { Field, FieldLabel, FieldHint, FieldError, FieldGroup, FieldCheck };
