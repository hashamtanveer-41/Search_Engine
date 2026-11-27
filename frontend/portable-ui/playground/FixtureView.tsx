// The fixture view: `?fixture=<component>[&case=<name>][&theme=dark]` renders one fixture set (or
// one case of it) on its own, with nothing else on the page, for the screenshot tool and for
// looking at a single component. Without `fixture`, it lists every set and case. A component or case
// that isn't there says so in place (`data-fixture-error`, so the shot tool exits 2), bare or not.
import * as React from 'react';
import { fixtureRegistry, FixtureMissing, type FixtureProblem, type FixtureSet } from '../src/fixture';
import { TooltipProvider } from '../src/base/tooltip';
import { Notifications } from '../src/base/notifications';
import { fixtureHref } from './route';

// (the library's, and the playground's own: its Debug dialog)
const modules = import.meta.glob<{ default: FixtureSet }>(['../src/**/*.fixture.tsx', './*.fixture.tsx'], { eager: true });
export const registry = fixtureRegistry(Object.values(modules).map((m) => m.default), Object.keys(modules).map((f) => f.replace(/^\.\.\//, 'ui/').replace(/^\.\//, 'ui/playground/')));
for (const p of registry.problems) console.warn(`[fixture] ${p.message}`);

class CaseBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    const missing = e instanceof FixtureMissing;
    return (
      <div role="alert" data-fixture-error className="rounded-lg border border-dashed border-warn-line bg-warn-soft px-4 py-3 text-sm">
        <strong className="text-warn">{missing ? 'Needs a fixture' : 'This case failed'}</strong>
        <p className="mt-1 font-mono text-xs">{e.message}</p>
      </div>
    );
  }
}

/** In place of a component or case that isn't there. */
function NotFound({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" data-fixture-error className="rounded-lg border border-dashed border-bad-line bg-bad-soft px-4 py-3 text-sm">
      <strong className="text-bad">Not found</strong>
      <p className="mt-1 font-mono text-xs">{children}</p>
    </div>
  );
}

const noCase = (set: FixtureSet, name: string) => <NotFound>{set.component} has no case “{name}”. Its cases: {Object.keys(set.cases).join(', ') || 'none'}.</NotFound>;

/** The fixture files' own problems (a component defined twice), where the fixtures are listed. */
function Problems({ problems }: { problems: FixtureProblem[] }) {
  if (!problems.length) return null;
  return (
    <div role="alert" data-fixture-problems className="rounded-lg border border-dashed border-warn-line bg-warn-soft px-4 py-3 text-sm">
      <strong className="text-warn">{problems.length === 1 ? 'A problem in the fixture files' : `${problems.length} problems in the fixture files`}</strong>
      {problems.map((p) => <p key={p.message} className="mt-1 font-mono text-xs [overflow-wrap:anywhere]">{p.message}</p>)}
    </div>
  );
}

/** The case of that name: its own, not one an object inherits ("constructor"). */
const caseOf = (set: FixtureSet, name: string) => (Object.hasOwn(set.cases, name) ? set.cases[name] : undefined);

export function Case({ set, name }: { set: FixtureSet; name: string }) {
  const render = caseOf(set, name);
  return (
    <section data-fixture-case={name} className="flex w-fit max-w-full min-w-0 flex-col gap-2">
      <h2 className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{set.component} · {name}</h2>
      <div data-fixture-root style={{ width: set.frame?.width, maxWidth: '100%', padding: set.frame?.padding ?? 0 }}>
        {render ? <CaseBoundary name={name}><Rendered render={render} /></CaseBoundary> : noCase(set, name)}
      </div>
    </section>
  );
}

function Rendered({ render }: { render: FixtureSet['cases'][string] }) {
  return <>{render(registry.ctx)}</>;
}

export function FixtureView({ component, name, bare = false }: { component: string | null; name: string | null; bare?: boolean }) {
  const set = component ? registry.get(component) : undefined;
  const found = !!set && !!name && !!caseOf(set, name);
  // The screenshot tool reads the case's play script from here, once the case has drawn.
  React.useEffect(() => {
    if (!set || !name || !found) return;
    const w = window as unknown as { __fixturePlay?: unknown };
    w.__fixturePlay = set.play?.[name] ?? [];
    return () => { delete w.__fixturePlay; };
  }, [set, name, found]);
  // Bare: just the case, at the top left, nothing else (for recording at exactly its size).
  if (set && name && bare) {
    return (
      <TooltipProvider delayDuration={0}>
        <div data-fixture-case={name} data-fixture-bare className="w-fit max-w-full bg-background">
          <div data-fixture-root style={{ width: set.frame?.width, maxWidth: '100%', padding: set.frame?.padding ?? 0 }}>
            {found ? <CaseBoundary name={name}><Rendered render={set.cases[name]} /></CaseBoundary> : noCase(set, name)}
          </div>
        </div>
        <Notifications />
      </TooltipProvider>
    );
  }
  if (!component) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">Fixtures</h1>
        <Problems problems={registry.problems} />
        <ul className="space-y-3 text-sm">
          {registry.sets.map((s) => (
            // each link its own item, so a long list of cases wraps between them, not past the edge
            <li key={s.component} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <a className="font-mono underline-offset-4 hover:underline" href={fixtureHref(s.component)}>{s.component}</a>
              {Object.keys(s.cases).map((c) => <a key={c} className="text-muted-foreground hover:underline" href={fixtureHref(s.component, c)}>{c}</a>)}
            </li>
          ))}
        </ul>
      </main>
    );
  }
  if (!set) return <main className="p-8"><NotFound>No fixture set “{component}”. <a className="underline underline-offset-4" href="?fixtures">Every fixture</a></NotFound></main>;
  const missing = registry.missingDeps(component);
  const names = name ? [name] : Object.keys(set.cases);
  return (
    <TooltipProvider delayDuration={0}>
      <main data-fixture={component} className="grid gap-8 p-6">
        <Problems problems={registry.problems.filter((p) => p.component === component)} />
        {missing.length > 0 && (
          <div role="alert" data-fixture-error className="rounded-lg border border-dashed border-warn-line bg-warn-soft px-4 py-3 text-sm">
            <strong className="text-warn">Missing fixtures this one borrows from:</strong> <span className="font-mono">{missing.join(', ')}</span>
          </div>
        )}
        {names.map((n) => <Case key={n} set={set} name={n} />)}
      </main>
      <Notifications />
    </TooltipProvider>
  );
}
