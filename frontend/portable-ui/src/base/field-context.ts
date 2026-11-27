// What a Field (field.tsx) tells the control inside it: the id its label points at, the hint and
// error that describe it, and whether it is invalid. The ui controls (Input, Textarea,
// SelectTrigger, Checkbox, Switch, SearchInput, CopyField) read it with useFieldControl, so
// `<Field label="Name"><Input /></Field>` is wired with no ids written by hand. Its own module so the
// controls can read it without importing field.tsx (which imports Label).
import * as React from 'react';

export interface FieldControl {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

export const FieldContext = React.createContext<FieldControl | null>(null);

type ControlProps = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: React.AriaAttributes['aria-invalid'] };

/** A control's props with its Field's id, aria-describedby and aria-invalid filled in. What the
 *  caller passed wins; aria-describedby is joined with the Field's. Outside a Field, unchanged. */
export function useFieldControl<P extends ControlProps>(props: P): P {
  const field = React.useContext(FieldContext);
  if (!field) return props;
  const describedBy = [props['aria-describedby'], field.describedBy].filter(Boolean).join(' ') || undefined;
  return {
    ...props,
    id: props.id ?? field.id,
    'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
  };
}
