import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Home } from 'lucide-react';
import { Button } from './button';
import { NavSidebar } from '../derived/nav-sidebar';
import { linkRow } from '../derived/sidebar';

afterEach(cleanup);

describe('a link drawn as a button (asChild)', () => {
  it('has its content in the button’s own box, so it presses as a button does', () => {
    render(<Button asChild variant="ghost"><a href="/classes">My classes</a></Button>);
    const link = screen.getByRole('link', { name: 'My classes' });
    expect(link.dataset.slot).toBe('button');
    expect(link.firstElementChild?.getAttribute('data-slot')).toBe('button-content');
    expect(link.firstElementChild?.textContent).toBe('My classes');
  });

  it('the app’s sidebar draws its links as the course sidebar does', () => {
    render(<NavSidebar title="Demo" groups={[{ items: [{ id: 'classes', label: 'My classes', icon: Home, href: '/classes' }, { id: 'account', label: 'Account', icon: Home, href: '/account' }] }]}
      current="classes" collapsed={false} onCollapsedChange={() => undefined} user={{ name: 'Ana', role: 'Student' }} />);
    const here = screen.getByRole('link', { name: 'My classes' });
    const other = screen.getByRole('link', { name: 'Account' });
    for (const cls of linkRow(true).split(' ')) expect(here.className).toContain(cls);
    for (const cls of linkRow(false).split(' ')) expect(other.className).toContain(cls);
    expect(here.querySelector('[data-slot=button-content]')).toBeTruthy();
  });
});
