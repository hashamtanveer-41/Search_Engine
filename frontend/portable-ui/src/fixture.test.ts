import { describe, expect, it } from 'vitest';
import { defineFixtures, fixtureRegistry, FixtureMissing, type FixtureContext } from './fixture';

describe('fixture registry', () => {
  const course = defineFixtures({ component: 'data/course', data: { title: 'DEMO 100', heading: ({ use }: FixtureContext) => `Course: ${use('data/course', 'title')}` }, cases: {} });
  const sidebar = defineFixtures({ component: 'derived/sidebar', deps: ['data/course', 'data/missing'], cases: {} });

  it('lends one fixture’s data to another, computing it once', () => {
    const r = fixtureRegistry([course, sidebar]);
    expect(r.ctx.use('data/course', 'heading')).toBe('Course: DEMO 100');
  });

  it('says which borrowed fixture is missing, instead of failing somewhere else', () => {
    const r = fixtureRegistry([course, sidebar]);
    expect(r.missingDeps('derived/sidebar')).toEqual(['data/missing']);
    expect(() => r.ctx.use('data/missing', 'x')).toThrow(FixtureMissing);
    expect(() => r.ctx.use('data/course', 'nothing')).toThrow(/no such fixture data/);
  });

  it('reports a component defined twice and keeps the first, instead of the last replacing it', () => {
    const first = defineFixtures({ component: 'base/button', cases: { first: () => 'first' } });
    const second = defineFixtures({ component: 'base/button', cases: { second: () => 'second' } });
    const r = fixtureRegistry([first, course, second], ['src/base/button.fixture.tsx', 'src/data.fixture.tsx', 'src/base/button2.fixture.tsx']);
    expect(r.get('base/button')).toBe(first);
    expect(r.sets.map((s) => s.component)).toEqual(['base/button', 'data/course']);
    expect(r.problems).toEqual([{ kind: 'duplicate', component: 'base/button', message: 'base/button is defined twice (src/base/button.fixture.tsx and src/base/button2.fixture.tsx): the first is shown, the second ignored' }]);
    expect(fixtureRegistry([course, sidebar]).problems).toEqual([]);
  });

  it('catches data that borrows in a circle', () => {
    const a = defineFixtures({ component: 'a', data: { v: ({ use }: FixtureContext) => use('b', 'v') }, cases: {} });
    const b = defineFixtures({ component: 'b', data: { v: ({ use }: FixtureContext) => use('a', 'v') }, cases: {} });
    const r = fixtureRegistry([a, b]);
    expect(() => r.ctx.use('a', 'v')).toThrow(/circle: a#v → b#v → a#v/);
  });
});
