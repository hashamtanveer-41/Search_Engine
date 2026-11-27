// A card's header keeps a second row (and its action across both) only when it has a description, so
// a card with a title alone has no empty row's gap under it.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from './card';

afterEach(cleanup);

describe('a card’s header', () => {
  it('has one row with a title alone, and a second (the action across both) only with a description', () => {
    render(<Card><CardHeader><CardTitle>Members</CardTitle><CardAction>…</CardAction></CardHeader></Card>);
    const header = document.querySelector<HTMLElement>('[data-slot=card-header]')!;
    const classes = header.className.split(/\s+/);
    expect(classes).not.toContain('grid-rows-[auto_auto]');
    expect(classes).toContain('has-data-[slot=card-description]:grid-rows-[auto_auto]');
    expect(document.querySelector('[data-slot=card-action]')!.className.split(/\s+/)).not.toContain('row-span-2');
    expect(classes.some((c) => c.includes('[data-slot=card-description]') && c.endsWith('row-span-2'))).toBe(true);
  });

  it('still draws a description under the title when there is one', () => {
    render(<Card><CardHeader><CardTitle>Contribution</CardTitle><CardDescription>Since the project began.</CardDescription></CardHeader></Card>);
    expect(document.querySelector('[data-slot=card-description]')!.textContent).toBe('Since the project began.');
  });
});
