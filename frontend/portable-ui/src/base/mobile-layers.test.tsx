// What opens over the page, on a phone ("fix ... other dropdowns for mobile view",
// "search should be full screen"): a popover and a menu kept 8 px clear of the screen's edges and
// never wider than it; a dialog asked to fill a phone's screen doing so, its drag handle hidden.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

afterEach(cleanup);

describe('on a phone', () => {
  it('a popover is never wider than the screen', () => {
    render(<Popover open><PopoverTrigger>Add a task</PopoverTrigger><PopoverContent aria-label="Add a task" className="w-[24rem]">Form</PopoverContent></Popover>);
    const content = document.querySelector<HTMLElement>('[data-slot=popover-content]')!;
    expect(content.className).toContain('max-w-[calc(100vw-16px)]');
    expect(content.className).toContain('w-[24rem]');
  });

  it('a menu is never wider than the screen, nor taller than the room it has', () => {
    render(<DropdownMenu open><DropdownMenuTrigger>More</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Account</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    const content = document.querySelector<HTMLElement>('[data-slot=dropdown-menu-content]')!;
    expect(content.className).toContain('max-w-[calc(100vw-16px)]');
    expect(content.className).toContain('max-h-(--radix-dropdown-menu-content-available-height)');
  });

  it('a dialog asked to fills the screen, clear of the notch, with no drag handle over its first row; others stay cards', () => {
    const { unmount } = render(<Dialog open><DialogContent fullOnPhone className="top-[12vh] max-h-[70vh] sm:max-w-xl"><DialogTitle>Search</DialogTitle></DialogContent></Dialog>);
    const full = screen.getByRole('dialog');
    expect(full.dataset.fullOnPhone).toBe('true');
    for (const c of ['phone:inset-0!', 'phone:top-0!', 'phone:h-dvh!', 'phone:max-h-none!', 'phone:max-w-none!', 'phone:translate-x-0!', 'phone:rounded-none!', 'phone:pt-[env(safe-area-inset-top)]!']) expect(full.className).toContain(c);
    // Its own placing kept for the rest.
    expect(full.className).toContain('top-[12vh]');
    const grab = full.querySelector<HTMLElement>('[data-slot=dialog-grab]');
    if (grab) expect(grab.className).toContain('phone:hidden!');
    unmount();
    render(<Dialog open><DialogContent><DialogTitle>New project</DialogTitle></DialogContent></Dialog>);
    const card = screen.getByRole('dialog');
    expect(card.dataset.fullOnPhone).toBeUndefined();
    expect(card.className).not.toContain('phone:inset-0');
  });
});
