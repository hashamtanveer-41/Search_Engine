import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Stat, StatGroup } from './stat';

afterEach(cleanup);

describe('Stat', () => {
  it('lists tiles, each its number, label and hint, coloured by tone', () => {
    render(
      <StatGroup aria-label="Workers at a glance">
        <Stat label="Online" value={4} tone="ok" hint="of 6" />
        <Stat label="Offline" value={2} />
      </StatGroup>,
    );
    const list = screen.getByRole('list', { name: 'Workers at a glance' });
    const [online, offline] = within(list).getAllByRole('listitem');
    expect(online.textContent).toBe('4Onlineof 6');
    expect(online.dataset.tone).toBe('ok');
    expect(online.querySelector('[data-slot="stat-value"]')!.className).toContain('text-ok');
    expect(offline.dataset.tone).toBe('neutral');
    expect(offline.querySelector('[data-slot="stat-hint"]')).toBeNull();
  });
});
