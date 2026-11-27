import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table';

afterEach(cleanup);

function Lectures({ stack }: { stack?: boolean }) {
  return (
    <Table stack={stack}>
      <TableCaption>Lectures in DEMO 100</TableCaption>
      <TableHeader><TableRow><TableHead>Lecture</TableHead><TableHead>Lessons</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow><TableCell>Limits</TableCell><TableCell label="Lessons">4</TableCell><TableCell label="Note">{''}</TableCell></TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('stacks by default: the header is only for screen readers under md, cells carry their labels', () => {
    render(<Lectures />);
    const table = screen.getByRole('table');
    expect(table.dataset.stack).toBe('true');
    expect(table.className).toContain('max-md:block');
    expect(table.querySelector('thead')!.className).toContain('max-md:sr-only');
    const cells = screen.getAllByRole('cell');
    expect(cells[1].querySelector('[data-slot="table-cell-label"]')!.textContent).toBe('Lessons');
    expect(cells[1].className).toContain('max-md:empty:hidden');
  });

  it('gives an empty cell no label, so it stays empty (and hidden when stacked)', () => {
    render(<Lectures />);
    const note = screen.getAllByRole('cell')[2];
    expect(note.childNodes.length).toBe(0);
  });

  it('with stack off, keeps the table a table and scrolls instead', () => {
    render(<Lectures stack={false} />);
    const table = screen.getByRole('table');
    expect(table.dataset.stack).toBe('false');
    expect(table.className).not.toContain('max-md:block');
    expect(table.querySelector('thead')!.className).not.toContain('sr-only');
    expect(table.querySelector('[data-slot="table-cell-label"]')).toBeNull();
    expect(table.closest('[data-slot="table-container"]')!.className).toContain('overflow-x-auto');
  });

  it('keeps the header and caption readable, and its body is a spring list', () => {
    render(<Lectures />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Lecture', 'Lessons', 'Note']);
    expect(screen.getByRole('table', { name: 'Lectures in DEMO 100' })).toBeTruthy();
    expect(screen.getByRole('table').querySelector('tbody')!.hasAttribute('data-spring-list')).toBe(true);
  });
});
