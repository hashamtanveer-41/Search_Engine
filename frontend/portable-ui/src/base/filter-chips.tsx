// FilterChips: a wrapping row of pill-shaped toggles that narrow a list (the reader's lesson kinds,
// What's new's kinds), each with an optional count. `type="single"` (the default) picks one; like
// Segmented it cannot be emptied unless `allowEmpty` (give it an "All" chip instead).
// `type="multiple"` picks any number, none included. Built on the ui ToggleGroup, so the arrow keys
// move between chips and Space or Enter presses one. A pressed chip is in the info tone.
//
//   <FilterChips aria-label="Show" value={kind} onValueChange={setKind}>
//     <FilterChip value="all" count={42}>All</FilterChip>
//     <FilterChip value="lesson" count={18}>Lessons</FilterChip>
//   </FilterChips>
import * as React from 'react';
import { cn } from '../lib/utils';
import { useSingleChoice } from './segmented';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

type Base = Omit<React.ComponentProps<'div'>, 'defaultValue' | 'dir' | 'onChange'> & { disabled?: boolean };

export type FilterChipsProps = Base & (
  | { type?: 'single'; value?: string; defaultValue?: string; onValueChange?(value: string): void; allowEmpty?: boolean }
  | { type: 'multiple'; value?: string[]; defaultValue?: string[]; onValueChange?(value: string[]): void; allowEmpty?: never }
);

const ROW = 'flex-wrap';

function FilterChips(props: FilterChipsProps) {
  if (props.type === 'multiple') {
    const { type: _type, allowEmpty: _allowEmpty, className, ...rest } = props;
    return <ToggleGroup {...rest} type="multiple" spacing={2} data-slot="filter-chips" className={cn(ROW, className)} />;
  }
  return <SingleFilterChips {...props} />;
}

function SingleFilterChips({ type: _type, value, defaultValue, onValueChange, allowEmpty = false, className, ...rest }: Extract<FilterChipsProps, { type?: 'single' }>) {
  const [current, choose] = useSingleChoice(value, defaultValue, onValueChange);
  const [free, setFree] = React.useState(defaultValue ?? '');
  if (allowEmpty) {
    const shown = value ?? free;
    return (
      <ToggleGroup {...rest} type="single" spacing={2} data-slot="filter-chips" className={cn(ROW, className)}
        value={shown}
        onValueChange={(next) => { if (value === undefined) setFree(next); onValueChange?.(next); }} />
    );
  }
  return <ToggleGroup {...rest} type="single" spacing={2} data-slot="filter-chips" className={cn(ROW, className)} value={current} onValueChange={choose} />;
}

export interface FilterChipProps extends React.ComponentProps<typeof ToggleGroupItem> {
  /** How many items this chip would show. */
  count?: number;
}

function FilterChip({ count, className, children, ...props }: FilterChipProps) {
  return (
    <ToggleGroupItem
      {...props}
      data-slot="filter-chip"
      data-value={props.value}
      className={cn(
        'group/chip h-7 pointer-coarse:h-11 min-w-0 gap-1.5 rounded-full border border-border bg-background px-3 text-[12.5px] font-medium text-foreground shadow-none',
        "hover:bg-accent hover:text-accent-foreground [&_svg:not([class*='size-'])]:size-3.5",
        'data-[state=on]:border-info-line data-[state=on]:bg-info-soft data-[state=on]:text-info hover:data-[state=on]:bg-info-soft hover:data-[state=on]:text-info',
        className,
      )}>
      {children}
      {count !== undefined && (
        <span data-slot="filter-chip-count" className="font-mono text-[11px] text-muted-foreground tabular-nums group-data-[state=on]/chip:text-info/80">{count}</span>
      )}
    </ToggleGroupItem>
  );
}

export { FilterChips, FilterChip };
