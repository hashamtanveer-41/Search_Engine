// Fixtures: each component can show itself. A fixture file sits beside its component
// (`button.fixture.tsx`) and exports `defineFixtures({...})`: named cases that render it, and
// optional data other fixtures may borrow ("the course a sidebar shows", "the lessons a widget
// comes from"). The playground's fixture view and `npm run shot` render any case by name.
//
// Borrowing: `use('derived/sidebar', 'course')` returns another fixture's data. If that fixture or
// its data is missing, or the borrowing goes round in a circle, the case renders a card saying
// what it needs instead of failing the page.
import type { ReactNode } from 'react';

export interface FixtureContext {
  /** Another fixture set's data, by its component id and key. */
  use<T = unknown>(component: string, key: string): T;
}

/** One step of a case's play script, for animated shots (selectors are inside the case). */
export type PlayStep =
  | { click: string }
  | { dblclick: string }
  | { hover: string }
  | { press: string }
  /** Holds a key down (Alt, say) until a `keyup` for it. */
  | { keydown: string }
  | { keyup: string }
  | { type: [selector: string, text: string] }
  /** `ms`: spread the move over that long (a slow drag, for frames midway). */
  | { drag: { from: string; to?: string; by?: [dx: number, dy: number]; ms?: number } }
  /** Presses on a spot of an element (fractions of its box) and holds it down for `ms`. */
  | { hold: { on: string; x?: number; y?: number; ms?: number } }
  /** Scrolls an element to this many px from its top. */
  | { scroll: [selector: string, top: number] }
  | { wait: number };

export interface FixtureSet {
  /** The component's id: its path under src without the extension ("base/button", "derived/sidebar"). */
  component: string;
  /** What the fixture view shows as its heading. */
  title?: string;
  /** Fixture sets this one borrows from (listed so a missing one is reported up front). */
  deps?: string[];
  /** Data other fixtures may borrow with `use`. Functions are called once, when first borrowed. */
  data?: Record<string, unknown | ((ctx: FixtureContext) => unknown)>;
  /** The cases, by name. */
  cases: Record<string, (ctx: FixtureContext) => ReactNode>;
  /** What to do, step by step, when a case is recorded as video or frames (`npm run shot -- … --video`). */
  play?: Record<string, PlayStep[]>;
  /** The frame a case renders in: a width (px) and padding; the height follows the content. */
  frame?: { width?: number; padding?: number };
}

export function defineFixtures(set: FixtureSet): FixtureSet {
  return set;
}

export class FixtureMissing extends Error {
  constructor(readonly needs: string, readonly why: 'missing-set' | 'missing-data' | 'cycle', readonly chain: string[]) {
    super(why === 'cycle' ? `Fixture data borrows in a circle: ${[...chain, needs].join(' → ')}` : why === 'missing-set' ? `No fixture for ${needs}` : `${needs} has no such fixture data`);
  }
}

/** Something wrong with the fixture files themselves, said where the fixtures are listed. */
export interface FixtureProblem {
  kind: 'duplicate';
  component: string;
  message: string;
}

/**
 * Every fixture set, by component id, and a context that resolves borrowing across them. `files`
 * (beside `sets`, in order) names where each came from, for the problems. Two sets with one id:
 * the first is kept and the second is reported, rather than replacing it without a word.
 */
export function fixtureRegistry(sets: FixtureSet[], files: string[] = []) {
  const byId = new Map<string, FixtureSet>();
  const from = new Map<string, string | undefined>();
  const problems: FixtureProblem[] = [];
  sets.forEach((s, i) => {
    if (!byId.has(s.component)) { byId.set(s.component, s); from.set(s.component, files[i]); return; }
    const where = [from.get(s.component), files[i]].filter(Boolean).join(' and ');
    problems.push({ kind: 'duplicate', component: s.component, message: `${s.component} is defined twice${where ? ` (${where})` : ''}: the first is shown, the second ignored` });
  });
  const cache = new Map<string, unknown>();
  const resolving: string[] = [];
  const ctx: FixtureContext = {
    use<T>(component: string, key: string): T {
      const name = `${component}#${key}`;
      if (cache.has(name)) return cache.get(name) as T;
      if (resolving.includes(name)) throw new FixtureMissing(name, 'cycle', [...resolving]);
      const set = byId.get(component);
      if (!set) throw new FixtureMissing(component, 'missing-set', [...resolving]);
      if (!set.data || !(key in set.data)) throw new FixtureMissing(name, 'missing-data', [...resolving]);
      resolving.push(name);
      try {
        const raw = set.data[key];
        const value = typeof raw === 'function' ? (raw as (c: FixtureContext) => unknown)(ctx) : raw;
        cache.set(name, value);
        return value as T;
      } finally {
        resolving.pop();
      }
    },
  };
  /** The deps of `component` that have no fixture set (reported before rendering). */
  const missingDeps = (component: string) => (byId.get(component)?.deps ?? []).filter((d) => !byId.has(d));
  return { sets: [...byId.values()].sort((a, b) => a.component.localeCompare(b.component)), get: (id: string) => byId.get(id), ctx, missingDeps, problems };
}
