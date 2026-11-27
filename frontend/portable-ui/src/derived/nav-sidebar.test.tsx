// The app's sidebar outside a class: its groups of links, the page showing marked, and, for a place
// with pages of its own (a project), a way back out above it and its own mark, name and subtitle.
import type * as React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FolderKanban, Home, ListChecks } from 'lucide-react';
import { NavSidebar, type NavSidebarProps } from './nav-sidebar';

const props = (over: Partial<NavSidebarProps> = {}): NavSidebarProps => ({
  title: 'Demo', groups: [{ items: [
    { id: 'overview', label: 'Overview', icon: Home, href: '/project/p1' },
    { id: 'tasks', label: 'Tasks', icon: ListChecks, href: '/project/p1/tasks', count: 3 },
  ] }],
  collapsed: false, onCollapsedChange: vi.fn(), user: { name: 'Hamna Akram', role: 'Student' }, ...over,
});

afterEach(cleanup);

describe('NavSidebar', () => {
  it('marks the page showing, once', () => {
    render(<NavSidebar {...props({ current: 'tasks' })} />);
    expect(screen.getByRole('link', { name: /Tasks/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps the page showing blue when pointed at (deeper, in both themes), its count in the row without a ring', () => {
    render(<NavSidebar {...props({ current: 'tasks' })} />);
    const here = screen.getByRole('link', { name: /Tasks/ });
    expect(here.className).toContain('bg-info-soft');
    expect(here.className).toContain('hover:bg-info-soft-hover');
    expect(here.className).toContain('dark:hover:bg-info-soft-hover');
    // The ghost button's own grey would have replaced the blue.
    expect(here.className).not.toMatch(/(^|\s)(dark:)?hover:bg-accent/);
    const count = here.querySelector<HTMLElement>('[data-slot=count]')!;
    expect(count.textContent).toBe('3');
    expect(count.className).not.toContain('shadow-');
    // Another page pointed at greys as before.
    expect(screen.getByRole('link', { name: 'Overview' }).className).toMatch(/hover:bg-accent/);
  });

  it.each([['light', ':root {'], ['dark', "[data-theme='dark'], .dark {"]])('deepens the blue toward the %s theme’s stronger blue when pointed at, never toward black', (_, opening) => {
    const css = readFileSync(join(__dirname, '../styles.css'), 'utf8');
    const from = css.indexOf(opening);
    const theme = css.slice(from, css.indexOf('\n}', from));
    const hover = /--info-soft-hover:\s*([^;]+);/.exec(theme)?.[1] ?? '';
    expect(hover).toMatch(/color-mix\(in oklab, var\(--info-soft\), var\(--info-line\) \d+%\)/);
    expect(hover).not.toMatch(/black/);
  });

  it('centres the search icon in its box, whatever height the box is (a touch screen’s is taller)', () => {
    render(<NavSidebar {...props({ onSearch: vi.fn() })} />);
    const icon = document.querySelector<SVGElement>('[data-flip=search]')!;
    const classes = icon.getAttribute('class')!;
    expect(classes).toContain('inset-y-0');
    expect(classes).toContain('my-auto');
    expect(classes).not.toMatch(/top-\[/);
  });

  it('has no way back unless it is given one', () => {
    render(<NavSidebar {...props()} />);
    expect(document.querySelector('[data-slot=sidebar-back]')).toBeNull();
  });

  it('a place of its own: the way back above its name, its mark, and what it belongs to (a link)', () => {
    render(<NavSidebar {...props({
      title: 'Library management system', back: { label: 'Projects', href: '/projects' },
      mark: <span data-testid="mark"><FolderKanban /></span>,
      subtitle: <a href="/se200">SE 200 · BSSE-5A</a>,
    })} />);
    const back = screen.getByRole('link', { name: 'Projects' });
    expect(back.getAttribute('href')).toBe('/projects');
    // Above the name: first in the sidebar.
    expect(document.querySelector('[data-slot=sidebar] a')).toBe(back);
    expect(screen.getByText('Library management system').className).toMatch(/line-clamp-2/);
    expect(screen.getByRole('link', { name: 'SE 200 · BSSE-5A' }).getAttribute('href')).toBe('/se200');
    expect(screen.getByTestId('mark')).toBeTruthy();
  });

  it('draws what leads under Search, above the pages, and on the rail its own (a project’s check-in, )', () => {
    const { container } = render(<NavSidebar {...props({ onSearch: vi.fn(), lead: <p>Check-in due</p>, leadRail: <button type="button">Check in</button> })} />);
    const order = [...container.querySelectorAll('button, [data-slot=sidebar-lead], nav')].map((el) => el.getAttribute('data-slot') ?? el.tagName.toLowerCase());
    const lead = order.indexOf('sidebar-lead');
    expect(lead).toBeGreaterThan(0);
    expect(order.indexOf('nav')).toBeGreaterThan(lead);
    expect(screen.getByText('Check-in due')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
    cleanup();
    render(<NavSidebar {...props({ collapsed: true, lead: <p>Check-in due</p>, leadRail: <button type="button">Check in</button> })} />);
    expect(screen.getByRole('button', { name: 'Check in' })).toBeTruthy();
    expect(screen.queryByText('Check-in due')).toBeNull();
  });

  it('keeps the way back on the rail, named, and the place’s own mark', () => {
    const onCollapsedChange = vi.fn();
    render(<NavSidebar {...props({ collapsed: true, current: 'overview', title: 'Library system', back: { label: 'Projects', href: '/projects' }, mark: <span data-testid="mark" />, onCollapsedChange })} />);
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('href')).toBe('/projects');
    expect(screen.getByRole('img', { name: 'Library system' }).contains(screen.getByTestId('mark'))).toBe(true);
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('hands a link’s click and press to the place (a project’s split), the links then not the browser’s to drag', () => {
    const onItemClick = vi.fn((_it, e: React.MouseEvent) => { if (e.shiftKey) e.preventDefault(); });
    const onItemPointerDown = vi.fn();
    render(<NavSidebar {...props({ current: 'overview', onItemClick, onItemPointerDown })} />);
    const tasks = screen.getByRole('link', { name: /Tasks/ });
    const shifted = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true });
    tasks.dispatchEvent(shifted);
    expect(onItemClick.mock.calls[0][0].id).toBe('tasks');
    expect(shifted.defaultPrevented).toBe(true);
    fireEvent.pointerDown(tasks, { button: 0 });
    expect(onItemPointerDown.mock.calls[0][0].id).toBe('tasks');
    expect(tasks.getAttribute('draggable')).toBe('false');
    expect(tasks.className).toContain('[-webkit-touch-callout:none]');
  });

  it('a way back that leads to a place it can show goes inside it when pointed at; the view takes the pages’ place', () => {
    const onBackInside = vi.fn();
    const { rerender } = render(<NavSidebar {...props({ back: { label: 'Software Engineering', href: '/se200/projects' }, backInside: 'Show Software Engineering in the sidebar', onBackInside })} />);
    const back = screen.getByRole('link', { name: 'Software Engineering' });
    // The arrow is in the link's icon place, part of it (it grows with it when pressed).
    const icon = back.querySelector<HTMLElement>('[data-slot=button-content] > [data-slot=button-icon]')!;
    expect(icon.getAttribute('title')).toBe('Show Software Engineering in the sidebar');
    const arrow = icon.querySelector<HTMLElement>('[data-slot=sidebar-inside]')!;
    expect(arrow.className).toContain('group-hover/back:opacity-100');
    expect(arrow.className).toContain('pointer-coarse:opacity-100');
    // The way back itself is still a link out; its arrow goes inside instead, and so does →.
    expect(back.getAttribute('href')).toBe('/se200/projects');
    fireEvent.click(arrow);
    expect(onBackInside).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(back, { key: 'ArrowRight' });
    expect(onBackInside).toHaveBeenCalledTimes(2);
    rerender(<NavSidebar {...props({ back: { label: 'Software Engineering', href: '/se200/projects' }, view: <p>The class’s lessons</p> })} />);
    expect(screen.getByRole('navigation', { name: 'Sections' }).textContent).toBe('The class’s lessons');
    expect(screen.queryByRole('link', { name: /Tasks/ })).toBeNull();
    // Without a place to go inside, no arrow.
    expect(document.querySelector('[data-slot=sidebar-inside]')).toBeNull();
  });

  it('marks the page showing beside, quietly: not as the page showing', () => {
    const { unmount } = render(<NavSidebar {...props({ current: 'overview', beside: 'tasks' })} />);
    const tasks = screen.getByRole('link', { name: /Tasks/ });
    expect(tasks.dataset.beside).toBe('true');
    expect(tasks.getAttribute('aria-current')).toBeNull();
    expect(tasks.textContent).toContain('open beside');
    expect(screen.getByRole('link', { name: 'Overview' }).dataset.beside).toBeUndefined();
    unmount();
    render(<NavSidebar {...props({ collapsed: true, current: 'overview', beside: 'tasks' })} />);
    expect(screen.getByRole('link', { name: 'Tasks, open beside' }).dataset.beside).toBe('true');
  });
});
