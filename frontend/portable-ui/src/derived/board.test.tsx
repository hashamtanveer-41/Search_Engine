// A board's parts: a column names itself by its heading and says how many it holds; a card puts what
// it is in over its title, its box before it, its tone on the bar beside it, a cover under it, its
// chips and its people in the footer, and its menu where a pointer or focus finds it.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { BoardCard, BoardColumn } from './board';

afterEach(cleanup);

describe('the board', () => {
  it('a column is a region named by its heading, with its count, its actions, and lit while a card is over it', () => {
    render(<BoardColumn title="Doing" titleId="c-doing" count={2} dot="bg-info" over actions={<button type="button">Add</button>}><ul /></BoardColumn>);
    const column = screen.getByRole('region', { name: 'Doing' });
    expect(within(column).getByText('2').dataset.slot).toBe('board-column-count');
    expect(within(column).getByRole('button', { name: 'Add' })).toBeTruthy();
    expect(column.dataset.over).toBe('true');
    expect(column.querySelector('[data-slot=board-column-dot]')!.className).toContain('bg-info');
  });

  it('a card: what it is in, its box, its title with the tone’s bar, a cover, chips and people, and its menu on hover', () => {
    render(
      <ul>
        <BoardCard as="li" title="Interview the librarian" tone="bad" above="Requirements" leading={<input type="checkbox" aria-label="done" />}
          cover={<img alt="" src="/x.png" />} footer={<span>Mon 23 Nov</span>} people={<span>HA</span>} menu={<button type="button">More</button>} />
      </ul>,
    );
    const card = screen.getByRole('listitem');
    expect(card.dataset.tone).toBe('bad');
    expect(card.querySelector('[data-slot=board-card-bar]')!.className).toContain('bg-bad');
    expect(card.querySelector('[data-slot=board-card-above]')!.textContent).toBe('Requirements');
    expect(card.querySelector('[data-slot=board-card-title]')!.textContent).toBe('Interview the librarian');
    expect(card.querySelector('[data-slot=board-card-cover] img')).not.toBeNull();
    expect(card.querySelector('[data-slot=board-card-footer]')!.textContent).toBe('Mon 23 NovHA');
    // The box comes before the title; the menu hides until the card is pointed at or focused.
    const order = [...card.querySelectorAll('input, [data-slot=board-card-title]')];
    expect(order[0].tagName).toBe('INPUT');
    expect(screen.getByRole('button', { name: 'More' }).parentElement!.className).toContain('group-hover/card:opacity-100');
  });

  it('a finished card is quieter, and a neutral one keeps a quiet bar', () => {
    render(<BoardCard title="Call with the client" quiet />);
    const card = document.querySelector<HTMLElement>('[data-slot=board-card]')!;
    expect(card.dataset.tone).toBe('neutral');
    expect(card.className).toContain('bg-card/75');
    expect(card.querySelector('[data-slot=board-card-bar]')!.className).toContain('bg-border');
    expect(card.querySelector('[data-slot=board-card-cover]')).toBeNull();
  });
});
