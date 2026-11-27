// SearchInput: the ui Input with a search icon in front and, while there is text, a clear (X)
// button at the end. Controlled: `value` and `onValueChange`. Escape clears it when there is text
// (and goes no further, so a dialog around it stays open); empty, Escape is left to whatever is
// around it. The clear button puts the focus back in the input. `ref` is the input's.
//
//   <SearchInput aria-label="Search lessons" placeholder="Search lessons" value={q} onValueChange={setQ} />
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Input } from './input';

export interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  value: string;
  onValueChange(value: string): void;
  /** The clear button's accessible name (default "Clear search"). */
  clearLabel?: string;
  /** Classes for the input itself; `className` is for the box around it. */
  inputClassName?: string;
}

function SearchInput({ value, onValueChange, clearLabel = 'Clear search', className, inputClassName, onKeyDown, ref, ...props }: SearchInputProps) {
  const input = React.useRef<HTMLInputElement | null>(null);
  const setRef = React.useCallback((el: HTMLInputElement | null) => {
    input.current = el;
    if (typeof ref === 'function') return ref(el);
    if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = el;
  }, [ref]);
  const clear = () => {
    onValueChange('');
    input.current?.focus();
  };
  return (
    <div data-slot="search-input" className={cn('relative w-full min-w-0', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        {...props}
        ref={setRef}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || e.key !== 'Escape' || !value) return;
          e.preventDefault();
          e.stopPropagation();
          onValueChange('');
        }}
        className={cn('ps-8 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none', value && 'pe-9', inputClassName)}
      />
      {value && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={clearLabel} data-slot="search-input-clear"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          // Keep the focus in the input while pressing; the click puts it back anyway.
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}>
          <X />
        </Button>
      )}
    </div>
  );
}

export { SearchInput };
