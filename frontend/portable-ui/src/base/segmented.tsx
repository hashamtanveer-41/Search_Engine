// Segmented: one choice out of a few, side by side in a muted track (a view: "As readers see it",
// "Text and comments", "What changed"; a period: Week, Term). Built on the ui ToggleGroup (single), so the
// arrow keys move between items and Space or Enter chooses, and a screen reader hears a choice of one;
// it cannot be emptied: pressing the chosen item again keeps it. It looks and moves as the tabs' list
// does, by the same code (base/track.tsx): the chosen item's pill slides between items on springs, and
// press-and-drag moves it (a finger too). An item's `count` is shown with the ui Count.
//
//   <Segmented aria-label="View" value={view} onValueChange={setView}>
//     <SegmentedItem value="lesson">As readers see it</SegmentedItem>
//     <SegmentedItem value="flagged" count={3}>Flagged</SegmentedItem>
//   </Segmented>
import * as React from 'react';
import { cn } from '../lib/utils';
import { Count } from './count';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';
import { ITEM, PILL, TRACK, useTrack } from './track';

/** A single-choice value that cannot be emptied: controlled by `value` when given, else its own. */
export function useSingleChoice(value: string | undefined, defaultValue: string | undefined, onValueChange?: (value: string) => void) {
  const [own, setOwn] = React.useState(defaultValue ?? '');
  const current = value ?? own;
  const choose = (next: string) => {
    // Radix offers '' when the chosen item is pressed again: a choice stays made.
    if (!next || next === current) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  return [current, choose] as const;
}

type SegmentedSize = 'sm' | 'default';
const SizeContext = React.createContext<SegmentedSize>('default');

export interface SegmentedProps extends Omit<React.ComponentProps<'div'>, 'defaultValue' | 'dir' | 'onChange'> {
  value?: string;
  defaultValue?: string;
  onValueChange?(value: string): void;
  disabled?: boolean;
  size?: SegmentedSize;
}

function Segmented({ value, defaultValue, onValueChange, size = 'default', disabled, className, children, ref, onPointerDown, ...props }: SegmentedProps) {
  const [current, choose] = useSingleChoice(value, defaultValue, onValueChange);
  const track = useTrack<HTMLDivElement>({
    items: '[data-slot="segmented-item"]',
    chosen: '[data-state="on"]',
    pick: (item) => { if (item.dataset.value) choose(item.dataset.value); },
    onPointerDown,
  });
  const setRoot = React.useCallback((el: HTMLDivElement | null) => {
    track.ref.current = el;
    if (typeof ref === 'function') return ref(el);
    if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el;
  }, [ref, track.ref]);

  return (
    <SizeContext.Provider value={size}>
      <ToggleGroup
        {...props}
        ref={setRoot}
        type="single"
        spacing={0.5}
        value={current}
        onValueChange={choose}
        disabled={disabled}
        data-slot="segmented"
        onPointerDown={track.onPointerDown}
        // Never wider than the room it has: on a narrow screen its items scroll inside it, and the page
        // does not scroll sideways (a playground card on a phone did, 17 Nov).
        className={cn(TRACK, size === 'sm' ? 'h-8' : 'h-9', className)}>
        {track.box && (
          <span ref={track.indicator} aria-hidden data-slot="segmented-indicator" className={PILL}
            style={{ top: track.box.y, height: track.box.h }} />
        )}
        {children}
      </ToggleGroup>
    </SizeContext.Provider>
  );
}

export interface SegmentedItemProps extends React.ComponentProps<typeof ToggleGroupItem> {
  /** A number shown after the label (items waiting, results). */
  count?: number;
}

function SegmentedItem({ count, className, children, ...props }: SegmentedItemProps) {
  const size = React.useContext(SizeContext);
  return (
    <ToggleGroupItem
      {...props}
      data-slot="segmented-item"
      data-value={props.value}
      className={cn(
        ITEM,
        'h-full min-w-0 shadow-none hover:bg-transparent',
        size === 'sm' ? 'px-2 text-xs' : 'px-2.5 text-sm',
        // The pill under it is what raises it.
        'data-[state=on]:bg-transparent data-[state=on]:text-foreground dark:data-[state=on]:text-foreground',
        className,
      )}>
      {children}
      {count !== undefined && <Count value={count} size="sm" />}
    </ToggleGroupItem>
  );
}

export { Segmented, SegmentedItem };
