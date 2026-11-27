import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Tabs, TabsList, TabsTrigger } from './tabs';
import { nearestStop } from './scrub';
import { TOAST_MS } from './sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

afterEach(cleanup);

describe('motion hooks', () => {
  it('keeps the checkbox tick mounted while unchecked, so it can draw in and out', () => {
    render(<Checkbox aria-label="Show solutions" />);
    const box = screen.getByRole('checkbox');
    expect(box.querySelector('[data-slot="checkbox-tick"]')).toBeTruthy();
    fireEvent.click(box);
    expect(box.dataset.state).toBe('checked');
    expect(box.querySelector('[data-slot="checkbox-tick"]')).toBeTruthy();
  });

  it('undraws the tick past its start, so its round caps leave no dot in the emptied box', () => {
    const css = readFileSync(join(__dirname, '../styles.css'), 'utf8');
    const rule = css.match(/\[data-slot='checkbox-tick'\] \{([^}]*)\}/)![1];
    const [dash, gap] = rule.match(/stroke-dasharray: ([\d.]+) ([\d.]+)/)!.slice(1).map(Number);
    const off = Number(rule.match(/stroke-dashoffset: ([\d.]+)/)![1]);
    // off the path's start by more than its stroke's half-width (1.5 of 24 units, about 0.08 of a path 1 long)
    expect(off - dash).toBeGreaterThanOrEqual(0.25);
    // and no second dash comes onto the path
    expect(dash + gap - off).toBeGreaterThanOrEqual(1);
  });

  it('keeps every radio dot mounted, so the chosen one can spring in', () => {
    render(<RadioGroup defaultValue="a"><RadioGroupItem value="a" aria-label="A" /><RadioGroupItem value="b" aria-label="B" /></RadioGroup>);
    expect(document.querySelectorAll('[data-slot="radio-group-dot"]').length).toBe(2);
  });

  it('draws one sliding indicator per tab list, in the variant it belongs to', () => {
    render(<Tabs defaultValue="a"><TabsList variant="line"><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList></Tabs>);
    const indicators = document.querySelectorAll('[data-slot="tabs-indicator"]');
    expect(indicators.length).toBe(1);
    expect(indicators[0].className).toContain('h-0.5');
  });

  it('leaves an open menu clickable while the page behind it is not (a modal menu)', async () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem>Mark done</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>,
    );
    const item = await screen.findByRole('menuitem', { name: 'Mark done' });
    await new Promise((r) => setTimeout(r, 50));
    const content = item.closest<HTMLElement>('[data-slot="dropdown-menu-content"]')!;
    // Radix turns the page's pointer off behind a modal menu and on for the menu; the open spring must
    // not wipe the menu's own 'auto', or the menu inherits 'none' and no click reaches its items.
    expect(document.body.style.pointerEvents).toBe('none');
    expect(content.style.pointerEvents).toBe('auto');
  });

  it('gives toasts five seconds by default', () => {
    expect(TOAST_MS).toBe(5000);
  });
});

describe('Scrub (tabs, the line of a code listing): the stop chosen', () => {
  const centres = [40, 120, 280];

  it('is the end stop when let go beyond either end', () => {
    expect(nearestStop(centres, 900)).toBe(2);
    expect(nearestStop(centres, -300)).toBe(0);
  });

  it('is the nearer stop in a gap', () => {
    expect(nearestStop(centres, 70)).toBe(0);
    expect(nearestStop(centres, 90)).toBe(1);
    expect(nearestStop(centres, 205)).toBe(2);
    expect(nearestStop([], 5)).toBe(-1);
  });
});

describe('a button inside a trigger', () => {
  it('stays a button (its data-slot), so it presses like one', async () => {
    const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } = await import('./tooltip');
    const { Button } = await import('./button');
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Search">S</Button></TooltipTrigger>
          <TooltipContent>Search</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button.dataset.slot).toBe('button');
    expect(button.dataset.variant).toBe('ghost');
  });
});
