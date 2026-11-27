// Keyboard shortcuts, grouped, in two columns that fit a dialog without scrolling, beside a stage
// that acts out the one under the pointer (or focus): its keys go down and the scene moves on, again
// and again. A click locks the stage on a row until it is clicked again or Esc is
// pressed (that Esc is the lock's: the dialog closes on the next). Pointing at
// another shows it at once, as it is: nothing slides or grows (too much motion to follow), and its
// first press comes straight away. The pane shortcuts are played on a small map with the layout
// model's own operations (paneShortcutSections); an app draws its own rows' scenes (scenes.tsx).
//
//   <ShortcutGuide sections={[{ title: 'General', rows: [{ id: 'search', combo: 'Mod+K', what: 'Search your notes',
//     short: 'Search', scene: (beat) => <MiniWindow>…</MiniWindow> }] }, ...paneShortcutSections()]} />
import * as React from 'react';
import { Lock } from 'lucide-react';
import { Keys } from '../../keys/Keys';
import { isMac, keySpoken, type Combo } from '../../keys/combo';
import { cn } from '../../lib/utils';
import { useBeat, type Beat } from './beat';
import './shortcuts.css';

export interface ShortcutRow {
  /** Names the row: unique across the guide. */
  id: string;
  combo: Combo | Combo[];
  /** What it does, in full: under the stage, and to a screen reader. */
  what: string;
  /** The row's own words, short enough for the list to fit; `what` when not given. */
  short?: string;
  /** The shortcut acted out; `beat.step` counts the presses so far this round. */
  scene?(beat: Beat): React.ReactNode;
  /** Presses a round (focus moving along three panes is two); one when not given. */
  presses?: number;
}

export interface ShortcutSection { title: string; rows: ShortcutRow[] }

/** The sections in two columns of about the same height, in order (a heading counts for a row and
 *  a half). */
export function balance(sections: ShortcutSection[]): ShortcutSection[][] {
  const size = (s: ShortcutSection) => s.rows.length + 1.5;
  const total = sections.reduce((n, s) => n + size(s), 0);
  let cut = 0;
  let best = Infinity;
  for (let i = 0, top = 0; i <= sections.length; top += i < sections.length ? size(sections[i]) : 0, i++) {
    const off = Math.abs(total - 2 * top);
    if (off < best) { best = off; cut = i; }
  }
  return [sections.slice(0, cut), sections.slice(cut)].filter((c) => c.length);
}

const spoken = (combo: Combo | Combo[], mac: boolean) => (Array.isArray(combo) ? combo : [combo]).map((c) => keySpoken(c, mac)).join(' or ');

export function ShortcutGuide({ sections, mac = isMac(), className }: {
  sections: ShortcutSection[];
  /** Draw the keys for a Mac or not; the platform's when not given. */
  mac?: boolean;
  className?: string;
}) {
  const rows = sections.flatMap((s) => s.rows);
  const [chosen, setChosen] = React.useState(rows[0]?.id);
  // Clicked, the stage stays on that row whatever the pointer passes over, until it is clicked again.
  const [locked, setLocked] = React.useState(false);
  // A click plays it again from the start.
  const [round, setRound] = React.useState(0);
  const row = rows.find((r) => r.id === chosen) ?? rows[0];
  const list = React.useRef<HTMLDivElement>(null);
  // Esc lets go first: taken before the dialog's own (Radix closes on an Esc not already handled).
  React.useEffect(() => {
    if (!locked) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setLocked(false); } };
    window.addEventListener('keydown', key, { capture: true });
    return () => window.removeEventListener('keydown', key, { capture: true });
  }, [locked]);
  const press = (id: string) => {
    if (locked && id === row?.id) { setLocked(false); return; }
    setChosen(id);
    setLocked(true);
    setRound((n) => n + 1);
  };
  // Up and Down move along the rows, Home and End to the ends, as in a menu; a lock moves with them.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const all = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-shortcut]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (at < 0 || to === undefined) return;
    e.preventDefault();
    const next = all[Math.max(0, Math.min(all.length - 1, to))];
    next?.focus();
    if (locked && next?.dataset.shortcut) setChosen(next.dataset.shortcut);
  };
  return (
    <div data-slot="shortcut-guide" className={cn('grid gap-x-8 gap-y-5 lg:grid-cols-[16rem_1fr]', className)}>
      {row && <Stage key={`${row.id}:${round}`} row={row} mac={mac} locked={locked} />}
      <div ref={list} onKeyDown={onKeyDown} className="grid content-start gap-x-6 gap-y-4 sm:grid-cols-2">
        {balance(sections).map((column, i) => (
          <div key={i} className="grid content-start gap-4">
            {column.map((section) => (
              <section key={section.title} aria-label={section.title}>
                <h3 className="m-0 mb-1 px-2 text-[12.5px] font-semibold text-muted-foreground">{section.title}</h3>
                <ul className="m-0 grid list-none grid-cols-[auto_1fr] p-0">
                  {section.rows.map((r) => {
                    const on = r.id === row?.id;
                    return (
                      <li key={r.id} className="col-span-2 grid grid-cols-subgrid">
                        <button type="button" data-shortcut={r.id} data-chosen={on || undefined} aria-pressed={on && locked} aria-label={`${r.what}: ${spoken(r.combo, mac)}`}
                          // Unlocked, the focus follows the pointer from row to row, so one row is ever
                          // lit (a dialog opens with the first focused).
                          onPointerEnter={(e) => { if (locked) return; setChosen(r.id); if (list.current?.contains(document.activeElement)) e.currentTarget.focus({ preventScroll: true }); }}
                          onFocus={() => { if (!locked) setChosen(r.id); }} onClick={() => press(r.id)}
                          className="col-span-2 grid grid-cols-subgrid items-center gap-x-3 rounded-md px-2 py-1 text-left text-[13px] outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 data-[chosen]:bg-accent data-[chosen]:text-accent-foreground pointer-coarse:min-h-11">
                          <Keys combo={r.combo} mac={mac} aria-hidden role={undefined} />
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate" title={r.short ? r.what : undefined}>{r.short ?? r.what}</span>
                            {on && locked && <Lock aria-hidden data-slot="shortcut-lock" className="size-3 shrink-0 text-muted-foreground" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The chosen shortcut acted out, its keys (held down with each press) and what it does in full. On
 *  a narrow dialog it sits over the list; on a phone, which has no keys to press, it is left out. */
function Stage({ row, mac, locked }: { row: ShortcutRow; mac: boolean; locked: boolean }) {
  const beat = useBeat(row.presses ?? 1);
  return (
    <figure aria-hidden data-slot="shortcut-stage" data-step={beat.step}
      className="m-0 grid content-start gap-3 max-lg:grid-cols-[13rem_1fr] max-lg:items-center max-sm:hidden">
      <div className="relative aspect-[16/11] overflow-hidden rounded-lg border bg-muted/50 p-2.5">{row.scene?.(beat)}</div>
      <figcaption className="grid content-start gap-2">
        <Keys combo={row.combo} mac={mac} pressed={beat.pressed} className="flex-wrap [&_[data-slot=kbd]]:h-7 [&_[data-slot=kbd]]:min-w-7 [&_[data-slot=kbd]]:px-1.5 [&_[data-slot=kbd]]:text-sm" />
        <p className="m-0 text-[13px] leading-snug text-muted-foreground">{row.what}</p>
        <p className="m-0 flex items-center gap-1 text-xs text-muted-foreground/80">
          {locked
            ? <><Lock aria-hidden className="size-3" />Locked: click it again or press <Keys combo="Esc" mac={mac} /> to let go.</>
            : 'Click a shortcut to keep it here.'}
        </p>
      </figcaption>
    </figure>
  );
}
