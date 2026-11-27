// The sidebar's course header: the whole title with its code and term, a menu of the classes when
// there is more than one, and the compact toggle at the bottom.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Copy } from 'lucide-react';
import { FolderKanban } from 'lucide-react';
import { Ring, Sidebar, type SidebarChapter, type SidebarCourse, type SidebarProps } from './sidebar';

const CALCULUS: SidebarCourse = { code: 'DEMO 100', term: 'Fall 26', title: 'Calculus, illustrated' };
const ALGEBRA: SidebarCourse = { code: 'DEMO 210', term: 'Fall 26', title: 'Linear algebra, step by step' };

const props = (over: Partial<SidebarProps> = {}): SidebarProps => ({
  course: CALCULUS, links: [], chapters: [], collapsed: false, onCollapsedChange: vi.fn(), onOpen: vi.fn(), user: { name: 'Sam', role: 'Admin' }, ...over,
});

afterEach(cleanup);

describe('the course header', () => {
  it('a click’s keys say how a link or a lesson opens: Shift a tab, Option/Alt a new space, Cmd/Ctrl or a middle click a new browser tab', () => {
    const onLink = vi.fn();
    const onOpen = vi.fn();
    const links = [{ id: 'cards', label: 'Review cards', icon: Copy }];
    const chapters: SidebarChapter[] = [{ id: 'c1', number: '01', title: 'Limits', topics: [{ id: 'eps', title: 'Epsilon–delta', status: 'todo' }] }];
    const { rerender } = render(<Sidebar {...props({ links, chapters, onLink, onOpen })} />);
    const link = () => screen.getByRole('button', { name: 'Review cards' });
    fireEvent.click(link());
    fireEvent.click(link(), { shiftKey: true });
    fireEvent.click(link(), { altKey: true });
    fireEvent.click(link(), { ctrlKey: true });
    fireEvent.click(link(), { metaKey: true });
    fireEvent(link(), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(onLink.mock.calls.map((c) => c[1])).toEqual(['here', 'tab', 'space', 'window', 'window', 'window']);
    fireEvent.click(screen.getByRole('button', { name: /^01 Limits/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Epsilon–delta, not read yet' }), { altKey: true });
    expect(onOpen).toHaveBeenLastCalledWith('eps', 'space');
    rerender(<Sidebar {...props({ links, chapters, onLink, onOpen, collapsed: true })} />);
    fireEvent.click(link(), { shiftKey: true });
    expect(onLink).toHaveBeenLastCalledWith('cards', 'tab');
  });

  it('marks the page showing; a press on a link or a lesson may start a drag; the spaces sit under the links in both widths', () => {
    const onDragStart = vi.fn();
    const links = [{ id: 'cards', label: 'Review cards', icon: Copy }];
    const chapters: SidebarChapter[] = [{ id: 'c1', number: '01', title: 'Limits', topics: [{ id: 'eps', title: 'Epsilon–delta', status: 'todo' }] }];
    const spaces = vi.fn((rail: boolean) => <i data-testid="spaces">{rail ? 'rail' : 'full'}</i>);
    const { rerender } = render(<Sidebar {...props({ links, chapters, currentLink: 'cards', onDragStart, spaces, dropToRemove: 'Remove from Reading' })} />);
    expect(screen.getByRole('button', { name: 'Review cards' }).getAttribute('aria-current')).toBe('page');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Review cards' }), { button: 0 });
    expect(onDragStart.mock.calls[0][0]).toEqual({ link: 'cards' });
    fireEvent.click(screen.getByRole('button', { name: /^01 Limits/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Epsilon–delta, not read yet' }), { button: 0 });
    expect(onDragStart.mock.calls[1][0]).toEqual({ topic: 'eps' });
    expect(screen.getByTestId('spaces').textContent).toBe('full');
    const aside = document.querySelector<HTMLElement>('[data-slot=sidebar]')!;
    expect([aside.dataset.paneDrop, aside.dataset.paneDropLabel]).toEqual(['sidebar', 'Remove from Reading']);
    rerender(<Sidebar {...props({ links, chapters, currentLink: 'cards', onDragStart, spaces, collapsed: true })} />);
    expect(screen.getByTestId('spaces').textContent).toBe('rail');
    expect(document.querySelector<HTMLElement>('[data-slot=sidebar]')!.dataset.paneDrop).toBeUndefined();
  });

  it('says where a lesson or a page is open at its row’s end; a lesson open nowhere keeps its beside button', () => {
    const links = [{ id: 'workbook', label: 'Workbook', icon: Copy }];
    const chapters: SidebarChapter[] = [{ id: 'c1', number: '01', title: 'Limits', topics: [{ id: 'eps', title: 'Epsilon–delta', status: 'todo' }, { id: 'cont', title: 'Continuity', status: 'todo' }] }];
    const whereOf = (item: { topic: string } | { link: string }) => ('topic' in item ? item.topic === 'eps' : item.link === 'workbook') ? <i data-testid={`where-${'topic' in item ? item.topic : item.link}`} /> : null;
    render(<Sidebar {...props({ links, chapters, whereOf })} />);
    fireEvent.click(screen.getByRole('button', { name: /^01 Limits/ }));
    expect(screen.getByTestId('where-eps')).toBeTruthy();
    expect(screen.getByTestId('where-workbook')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Epsilon–delta beside' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Continuity beside' })).toBeTruthy();
  });

  it('shows the whole title, the code and the term, and no menu for one class', () => {
    render(<Sidebar {...props()} />);
    const header = screen.getByText('Calculus, illustrated');
    expect(header.className).not.toMatch(/\btruncate\b/);
    expect(screen.getByText('DEMO 100 · Fall 26')).toBeTruthy();
    expect(document.querySelector('[aria-haspopup=menu]')).toBeNull();
  });

  it('opens a menu of the classes, this one ticked, and switches to another', () => {
    const onCourse = vi.fn();
    render(<Sidebar {...props({ courses: [CALCULUS, ALGEBRA], onCourse })} />);
    fireEvent.keyDown(document.querySelector('[aria-haspopup=menu]')!, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['CCalculus, illustratedDEMO 100 · Fall 26', 'LLinear algebra, step by stepDEMO 210 · Fall 26']);
    expect(within(items[0]).getByLabelText('This class')).toBeTruthy();
    expect(within(items[1]).queryByLabelText('This class')).toBeNull();
    fireEvent.click(items[1]);
    expect(onCourse).toHaveBeenCalledWith(ALGEBRA);
  });

  it('does not switch to the class already shown', () => {
    const onCourse = vi.fn();
    render(<Sidebar {...props({ courses: [CALCULUS, ALGEBRA], onCourse })} />);
    fireEvent.keyDown(document.querySelector('[aria-haspopup=menu]')!, { key: 'Enter' });
    fireEvent.click(within(screen.getByRole('menu')).getAllByRole('menuitem')[0]);
    expect(onCourse).not.toHaveBeenCalled();
  });

  it('keeps the compact toggle at the bottom, beside settings', () => {
    const onCollapsedChange = vi.fn();
    render(<Sidebar {...props({ onCollapsedChange, onSettings: vi.fn() })} />);
    const toggle = screen.getByRole('button', { name: 'Compact sidebar' });
    expect(toggle.parentElement!.contains(screen.getByRole('button', { name: 'Settings' }))).toBe(true);
    fireEvent.click(toggle);
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('in a phone’s menu, which has no rail, the same button says it closes the menu', () => {
    const onCollapsedChange = vi.fn();
    render(<Sidebar {...props({ onCollapsedChange, collapseLabel: 'Close menu' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Compact sidebar' })).toBeNull();
  });

  it('a link’s count on the rail sits against the button’s own box (no padding), so pressing does not move it onto the icon', () => {
    const links = [{ id: 'projects', label: 'Projects', icon: FolderKanban, mark: { tone: 'warn' as const, icon: FolderKanban, label: 'due', count: 1 } }];
    render(<Sidebar {...props({ links, collapsed: true })} />);
    const button = screen.getByRole('button', { name: 'Projects, 1 due' });
    expect(button.className).toMatch(/(^| )p-0( |$)/);
    expect(button.className).toContain('has-[svg]:p-0');
    expect(button.querySelector('[data-slot=button-content] [data-slot=count]')).toBeTruthy();
  });

  it('shows the course mark in the compact rail, named for assistive technology', () => {
    render(<Sidebar {...props({ collapsed: true })} />);
    expect(screen.getByRole('img', { name: 'Calculus, illustrated, DEMO 100 · Fall 26' })).toBeTruthy();
  });
});

describe('the chapter rings', () => {
  const chapters: SidebarChapter[] = [{ id: 'c1', number: '01', title: 'Limits', topics: [{ id: 't1', title: 'What a limit is', status: 'read' }] }];

  it('are drawn at their own size inside a button, not at the 16px a button gives an icon', () => {
    // The class the ui Button puts on every icon inside it without a size-* class of its own.
    render(<Sidebar {...props({ chapters, collapsed: true })} />);
    const ring = document.querySelector<SVGSVGElement>('[data-flip="chapter:c1"] svg')!;
    expect(ring.closest('button')).toBeTruthy();
    expect(ring.style.width).toBe('32px');
    expect(ring.style.height).toBe('32px');
  });

  it('keep the size they are given anywhere', () => {
    const { container } = render(<Ring value={0.5} size={44} />);
    expect(container.querySelector('svg')!.style.width).toBe('44px');
  });
});

describe('the search box', () => {
  it('shows its key only where there is a keyboard: hidden on a touch screen, whatever the page width', () => {
    render(<Sidebar {...props()} onSearch={vi.fn()} />);
    const key = document.querySelector<HTMLElement>('[data-shortcut]')!;
    // Drawn by keys/ Keys: Ctrl K here (not a Mac), ⌘ K on a Mac.
    expect([...key.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl', 'K']);
    expect(key.className).toContain('pointer-coarse:hidden');
  });
});

describe('out of the course', () => {
  it('a row above the course, and a button at the top of the rail, back to the app’s own pages', () => {
    const back = { label: 'My classes', href: '/classes' };
    const { rerender } = render(<Sidebar {...props({ back })} />);
    const row = screen.getByRole('link', { name: 'My classes' });
    expect(row.getAttribute('href')).toBe('/classes');
    // Above the course's name, the first thing in the sidebar.
    expect(row.compareDocumentPosition(screen.getByText(CALCULUS.title)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<Sidebar {...props({ back, collapsed: true })} />);
    expect(screen.getByRole('link', { name: 'My classes' }).getAttribute('href')).toBe('/classes');
    rerender(<Sidebar {...props({})} />);
    expect(screen.queryByRole('link', { name: 'My classes' })).toBeNull();
  });
});

describe('a chapter’s own page ("highlight this", "clicking on circle should open the page")', () => {
  const chapters: SidebarChapter[] = [
    { id: 'c1', number: '01', title: 'Limits', topics: [{ id: 'eps', title: 'Epsilon–delta', status: 'read' }, { id: 'cont', title: 'Continuity', status: 'todo' }] },
    { id: 'c2', number: '02', title: 'Series', topics: [{ id: 'geo', title: 'Geometric', status: 'todo' }] },
  ];
  const row = (title: string) => screen.getByRole('button', { name: `Open ${title}` }).closest<HTMLElement>('[data-slot=chapter-row]')!;

  it('highlights its chapter’s row, open, and its ring on the rail', () => {
    const { rerender } = render(<Sidebar {...props({ chapters, currentChapter: 'c2', onChapter: vi.fn() })} />);
    expect(row('Series').getAttribute('aria-current')).toBe('page');
    expect(row('Series').className).toContain('bg-info-soft');
    expect(within(row('Series')).getByRole('button', { expanded: true })).toBeTruthy();
    expect(row('Limits').getAttribute('aria-current')).toBeNull();
    rerender(<Sidebar {...props({ chapters, currentChapter: 'c2', collapsed: true })} />);
    expect(screen.getByRole('button', { name: /^02 Series/ }).className).toContain('bg-info-soft');
  });

  it('its ring opens the page (Cmd/Ctrl in a new tab); the row opens its lessons; with Option the arrow turns and the row opens the page', () => {
    const onChapter = vi.fn();
    render(<Sidebar {...props({ chapters, onChapter })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Limits' }));
    expect(onChapter).toHaveBeenLastCalledWith('c1', 'here');
    fireEvent.click(screen.getByRole('button', { name: 'Open Limits' }), { metaKey: true });
    expect(onChapter).toHaveBeenLastCalledWith('c1', 'window');
    const toggle = within(row('Limits')).getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(onChapter).toHaveBeenCalledTimes(2);
    // Option held: the arrow is the open-page icon, and the row opens the page instead.
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(row('Limits').querySelector('[data-slot=chapter-open-icon]')).not.toBeNull();
    fireEvent.click(toggle, { altKey: true });
    expect(onChapter).toHaveBeenLastCalledWith('c1', 'here');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(row('Limits').querySelector('[data-slot=chapter-open-icon]')).toBeNull();
  });

  it('on the rail, its title opens the page, and says no "of N read"', () => {
    const onChapter = vi.fn();
    render(<Sidebar {...props({ chapters, onChapter, collapsed: true })} />);
    fireEvent.click(screen.getByRole('button', { name: /^01 Limits/ }));
    const title = document.querySelector<HTMLElement>('[data-slot=chapter-title]')!;
    expect(title.textContent).toContain('01 · Limits');
    expect(document.body.textContent).not.toMatch(/of 2 read/);
    fireEvent.click(title);
    expect(onChapter).toHaveBeenCalledWith('c1', 'here');
  });
});

describe('a view inside a link (a class’s projects)', () => {
  const PROJECTS = { id: 'projects', label: 'Projects', icon: Copy, inside: 'Show this class’s projects in the sidebar' };

  it('the link’s icon is a way inside, part of its button (it grows with it when pressed), shown when pointed at or focused; clicking it does not open the link', () => {
    const onLink = vi.fn();
    const onInside = vi.fn();
    render(<Sidebar {...props({ links: [{ id: 'cards', label: 'Review cards', icon: Copy }, PROJECTS], onLink, onInside })} />);
    const row = screen.getByRole('button', { name: 'Projects' });
    // In the button's own content (pressing grows that box: styles.css, Press), in the icon's place.
    const icon = row.querySelector<HTMLElement>('[data-slot=button-content] > [data-slot=button-icon]')!;
    expect(icon.getAttribute('title')).toBe('Show this class’s projects in the sidebar');
    const arrow = icon.querySelector<HTMLElement>('[data-slot=sidebar-inside]')!;
    // Hidden until the row is pointed at or focused (always there on a touch screen); the row's own icon gives way to it.
    expect(arrow.className).toContain('opacity-0');
    expect(arrow.className).toContain('group-hover/link:opacity-100');
    expect(arrow.className).toContain('group-focus-within/link:opacity-100');
    expect(arrow.className).toContain('pointer-coarse:opacity-100');
    expect(arrow.previousElementSibling!.className).toContain('group-hover/link:opacity-0');
    // A pointer, like any button: not a resize cursor.
    expect(arrow.className).toContain('cursor-pointer');
    expect(arrow.className).not.toMatch(/resize/);
    fireEvent.click(arrow);
    expect(onInside).toHaveBeenCalledWith('projects');
    expect(onLink).not.toHaveBeenCalled();
    // The rest of the row still opens its page; → goes inside from the keyboard.
    fireEvent.click(within(row).getByText('Projects'));
    expect(onLink).toHaveBeenCalledWith('projects', 'here');
    fireEvent.keyDown(row, { key: 'ArrowRight' });
    expect(onInside).toHaveBeenCalledTimes(2);
    expect(row.getAttribute('aria-keyshortcuts')).toBe('ArrowRight');
    // A link with no view of its own has no way inside.
    expect(document.querySelectorAll('[data-slot=sidebar-inside]')).toHaveLength(1);
  });

  it('shows the view in place of the links, spaces and learning path, with its way back; the rail keeps the course', async () => {
    const { SidebarInside, SidebarInsideGroup, SidebarInsideRow } = await import('./sidebar');
    const onBack = vi.fn();
    const onOpen = vi.fn();
    const onDragStart = vi.fn();
    const chapters: SidebarChapter[] = [{ id: 'c1', number: '01', title: 'Limits', topics: [] }];
    const view = (
      <SidebarInside back={{ label: 'Calculus, illustrated', onBack }} title="Your projects">
        <SidebarInsideGroup title="Library management system" detail="BSSE-5A">
          <SidebarInsideRow label="Tasks" icon={Copy} onOpen={onOpen} onDragStart={onDragStart} />
        </SidebarInsideGroup>
      </SidebarInside>
    );
    const { rerender } = render(<Sidebar {...props({ links: [PROJECTS], chapters, spaces: () => <span>The spaces</span>, view })} />);
    expect(screen.queryByText('The spaces')).toBeNull();
    expect(screen.queryByText('Limits')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Projects' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Calculus, illustrated' }));
    expect(onBack).toHaveBeenCalled();
    const group = screen.getByRole('button', { name: /Library management system/ });
    expect(group.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(group);
    expect(group.getAttribute('aria-expanded')).toBe('true');
    // A row opens as a lesson's does, with its keys; a press may become a drag.
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }), { shiftKey: true });
    expect(onOpen).toHaveBeenCalledWith('tab');
    fireEvent.click(screen.getByRole('button', { name: 'Open Tasks beside' }));
    expect(onOpen).toHaveBeenLastCalledWith('beside');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tasks' }));
    expect(onDragStart).toHaveBeenCalled();
    rerender(<Sidebar {...props({ links: [PROJECTS], chapters, collapsed: true, view })} />);
    expect(screen.queryByText('Your projects')).toBeNull();
  });
});
