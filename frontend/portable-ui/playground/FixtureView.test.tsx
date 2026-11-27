// The fixture view (FixtureView.tsx): what it says for a component or case that isn't there, the
// links on its list, and when it hands the shot tool a case's play script.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FixtureView, registry } from './FixtureView';

const play = () => (window as unknown as { __fixturePlay?: unknown }).__fixturePlay;

afterEach(cleanup);

describe('the fixture view', () => {
  it('says an unknown case is not found, bare or not, instead of “render is not a function”', () => {
    for (const bare of [true, false]) {
      const { container, unmount } = render(<FixtureView component="base/switch" name="no such case" bare={bare} />);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/^Not found/);
      expect(alert.textContent).toContain('base/switch has no case “no such case”. Its cases: states');
      expect(alert.textContent).not.toContain('render is not a function');
      // the shot tool exits 2 on it
      expect(container.querySelector('[data-fixture-error]')).toBe(alert);
      expect(play()).toBeUndefined();
      unmount();
    }
  });

  it('does not take what every object has (“constructor”) for a case', () => {
    render(<FixtureView component="base/switch" name="constructor" bare />);
    expect(screen.getByRole('alert').textContent).toContain('has no case “constructor”');
  });

  it('says an unknown component is not found', () => {
    render(<FixtureView component="base/nothing" name={null} />);
    expect(screen.getByRole('alert').textContent).toContain('No fixture set “base/nothing”');
  });

  it('lists every set and case with links that open them', () => {
    const { container } = render(<FixtureView component={null} name={null} />);
    const links = [...container.querySelectorAll<HTMLAnchorElement>('main li a')].map((a) => new URLSearchParams(a.getAttribute('href')!));
    const expected = registry.sets.flatMap((s) => [[s.component, null], ...Object.keys(s.cases).map((c) => [s.component, c])]);
    expect(links.map((q) => [q.get('fixture'), q.get('case')])).toEqual(expected);
  });

  it('publishes the play script after the case draws, and takes it back when it goes', async () => {
    const { unmount } = render(<FixtureView component="base/switch" name="states" bare />);
    await waitFor(() => expect(play()).toEqual(registry.get('base/switch')!.play!.states));
    expect(document.querySelector('[data-fixture-bare] [role=switch]')).not.toBeNull();
    unmount();
    expect(play()).toBeUndefined();
  });
});
