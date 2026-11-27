// Combobox: a text field with suggestions under it, in the app's own look (not the browser's datalist,
// which draws its own grey list, differently in every browser and badly on a phone). Typing filters
// the suggestions; ↑ ↓ move through them; Enter takes the one marked, or else what was typed (with
// `allowCreate`) or the first that matches it; Escape closes the list (and goes no further, so a dialog around it stays open); a click or a
// tap takes one. The list opens in a popover at the end of <body>, so a card or a scrolling pane round
// the field never clips it, and it turns round when there is no room under the field.
//
// Controlled: `value` is what is typed, `onValueChange` follows it; `onChoose` gets what was taken
// (an option's value, or the typed text). The field keeps the focus throughout, so a phone's keyboard
// stays up.
//
//   <Combobox aria-label="Add a tag" value={text} onValueChange={setText} options={tags}
//     onChoose={(tag) => { add(tag); setText(''); }} allowCreate placeholder="Add a tag" />
import * as React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { Input } from './input';
import { Popover, PopoverAnchor, PopoverContent } from './popover';

export type ComboboxOption = string | { value: string; label?: React.ReactNode; detail?: React.ReactNode };

type Row = { key: string; value: string; label: React.ReactNode; detail?: React.ReactNode; create?: boolean };

const valueOf = (o: ComboboxOption) => (typeof o === 'string' ? o : o.value);
const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The default filter: the option's value contains what is typed, case aside. */
export const comboboxMatches = (option: string, query: string) => option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

export interface ComboboxProps extends Omit<React.ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'size'> {
  value: string;
  onValueChange(value: string): void;
  options: readonly ComboboxOption[];
  /** An option taken, or (with `allowCreate`) the text typed, on Enter. */
  onChoose(value: string): void;
  /** Enter with nothing marked takes what was typed, and the list ends with an "Add …" row for it. */
  allowCreate?: boolean;
  /** The "Add …" row's words for the typed text (default: Add “text”). */
  createLabel?(text: string): React.ReactNode;
  /** Whether an option shows for what is typed (default: it contains the text, case aside). */
  filter?(option: string, query: string): boolean;
  /** Said in the list when nothing matches and nothing can be added. Nothing: the list stays shut. */
  emptyText?: React.ReactNode;
  /** The list's accessible name (default: the field's aria-label). */
  listLabel?: string;
  size?: 'sm' | 'default';
  /** Classes for the box round the field; `inputClassName` for the field, `contentClassName` for the list. */
  inputClassName?: string;
  contentClassName?: string;
}

function Combobox({
  value, onValueChange, options, onChoose, allowCreate = false, createLabel, filter = comboboxMatches, emptyText, listLabel, size = 'default',
  className, inputClassName, contentClassName, onKeyDown, onFocus, onBlur, disabled, id, ref, ...props
}: ComboboxProps) {
  const auto = React.useId();
  const listId = `${id ?? auto}-list`;
  const optionId = (i: number) => `${id ?? auto}-option-${i}`;
  const anchor = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  // A finger or a mouse pressed in the list: the field's blur that may follow is not a leaving.
  const pressing = React.useRef(false);

  const typed = value.trim();
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    const v = valueOf(o);
    const key = v.toLocaleLowerCase();
    if (seen.has(key) || (typed && !filter(v, typed))) continue;
    seen.add(key);
    rows.push({ key: `o:${v}`, value: v, label: typeof o === 'string' ? v : o.label ?? v, detail: typeof o === 'string' ? undefined : o.detail });
  }
  if (allowCreate && typed && !options.some((o) => same(valueOf(o), typed))) {
    rows.push({ key: 'create', value: typed, label: createLabel?.(typed) ?? <>Add “{typed}”</>, create: true });
  }
  const shown = open && !disabled && (rows.length > 0 || (!!typed && emptyText !== undefined));
  const marked = active < rows.length ? active : -1;
  const rowsKey = rows.map((r) => r.key).join('|');
  // What is listed changed: nothing is marked until the arrows say so (Enter then takes the text).
  React.useEffect(() => { setActive(-1); }, [rowsKey]);

  const choose = (row: Row | undefined) => {
    const v = row?.value ?? typed;
    if (!v) return;
    // An option typed in another case is the option, as it is spelled there.
    const known = row ? row.value : options.map(valueOf).find((o) => same(o, v));
    if (!row && !known && !allowCreate) return;
    onChoose(known ?? v);
    setActive(-1);
  };

  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape is the list's while it shows (its popover leaves it to the field: onEscapeKeyDown).
    if (e.key === 'Escape' && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!rows.length) return;
      const down = e.key === 'ArrowDown';
      setActive((a) => (a < 0 ? (down ? 0 : rows.length - 1) : (a + (down ? 1 : rows.length - 1)) % rows.length));
      return;
    }
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      // Nothing marked: what was typed (allowCreate), or else the first that matches it.
      choose(shown && marked >= 0 ? rows[marked] : !allowCreate && typed ? rows[0] : undefined);
      return;
    }
    if (e.key === 'Tab') setOpen(false);
  };

  return (
    <Popover open={shown} onOpenChange={(o) => { if (!o) { setOpen(false); setActive(-1); } }}>
      <PopoverAnchor asChild>
        <div ref={anchor} data-slot="combobox" className={cn('relative w-full min-w-0', className)}>
          <Input
            {...props}
            ref={ref}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={shown ? listId : undefined}
            aria-activedescendant={shown && marked >= 0 ? optionId(marked) : undefined}
            disabled={disabled}
            value={value}
            onChange={(e) => { onValueChange(e.target.value); setOpen(true); }}
            onFocus={(e) => { setOpen(true); onFocus?.(e); }}
            onBlur={(e) => { if (!pressing.current) { setOpen(false); setActive(-1); } onBlur?.(e); }}
            onClick={() => setOpen(true)}
            onKeyDown={keyDown}
            className={cn(size === 'sm' && 'h-8 px-2.5 text-[13px] md:text-[13px]', inputClassName)}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        data-slot="combobox-content"
        className={cn('w-(--radix-popover-trigger-width) min-w-48 max-w-[calc(100vw-2rem)] p-1', contentClassName)}
        // The field keeps the focus: the list is pointed at, never focused.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The field's own Escape closes it, and stops there (a dialog round it stays open).
        onEscapeKeyDown={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => { if (anchor.current?.contains(e.target as Node)) e.preventDefault(); }}
        onInteractOutside={(e) => { if (anchor.current?.contains(e.target as Node)) e.preventDefault(); }}
        onPointerDown={(e) => { e.preventDefault(); pressing.current = true; }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerUp={() => { window.setTimeout(() => { pressing.current = false; }, 0); }}
        onPointerCancel={() => { pressing.current = false; }}
      >
        <ul id={listId} role="listbox" aria-label={listLabel ?? props['aria-label']} className="grid max-h-64 overflow-y-auto">
          {rows.map((r, i) => (
            <li key={r.key} id={optionId(i)} role="option" aria-selected={i === marked} data-create={r.create || undefined}
              className={cn('flex min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none pointer-coarse:min-h-11',
                i === marked && 'bg-accent text-accent-foreground', r.create && 'text-muted-foreground')}
              onMouseMove={() => { if (i !== marked) setActive(i); }}
              onClick={() => { pressing.current = false; choose(r); }}>
              {r.create && <Plus aria-hidden className="size-4 shrink-0" />}
              <span className="min-w-0 truncate">{r.label}</span>
              {r.detail && <span className="ms-auto shrink-0 ps-2 text-xs text-muted-foreground">{r.detail}</span>}
            </li>
          ))}
          {!rows.length && <li role="presentation" className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
