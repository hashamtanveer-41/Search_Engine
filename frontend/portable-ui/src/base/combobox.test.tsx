// The combobox: typing filters the suggestions, the arrows mark one and Enter takes it, Enter with
// none marked adds what was typed (or nothing, without allowCreate), a click takes one, and Escape
// closes the list without reaching what is around it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from './combobox';

afterEach(cleanup);

const TAGS = ['Backend', 'Database', 'Design', 'Frontend'];

function Tags({ allowCreate = true, onChoose, onKey }: { allowCreate?: boolean; onChoose?: (v: string) => void; onKey?: () => void }) {
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <div onKeyDown={onKey}>
      <Combobox aria-label="Add a tag" value={text} onValueChange={setText} options={TAGS} allowCreate={allowCreate}
        onChoose={(v) => { onChoose?.(v); setChosen((c) => [...c, v]); setText(''); }} />
      <output>{chosen.join(',')}</output>
    </div>
  );
}

const box = () => screen.getByRole('combobox', { name: 'Add a tag' }) as HTMLInputElement;
const options = () => screen.queryAllByRole('option').map((o) => o.textContent);
const marked = () => screen.queryAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.textContent ?? null;

describe('Combobox', () => {
  it('opens on focus with every suggestion, and narrows them as you type', () => {
    render(<Tags />);
    expect(box().getAttribute('aria-expanded')).toBe('false');
    fireEvent.focus(box());
    expect(box().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual(['Backend', 'Database', 'Design', 'Frontend']);
    fireEvent.change(box(), { target: { value: 'EN' } });
    // What contains it, case aside, in their order; then a row to add what was typed.
    expect(options()).toEqual(['Backend', 'Frontend', 'Add “EN”']);
    expect(box().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
  });

  it('moves with the arrows (round the ends) and Enter takes the one marked', () => {
    const onChoose = vi.fn();
    render(<Tags onChoose={onChoose} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: 'd' } });
    expect(marked()).toBeNull();
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(marked()).toBe('Backend');
    expect(box().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(marked()).toBe('Database');
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    // Up from the first goes round to the last: the row that adds what was typed.
    expect(marked()).toBe('Add “d”');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith('Backend');
    expect(box().value).toBe('');
  });

  it('Enter with nothing marked adds what was typed; an option typed in another case is the option', () => {
    const onChoose = vi.fn();
    render(<Tags onChoose={onChoose} />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: '  Research ' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChoose).toHaveBeenLastCalledWith('Research');
    fireEvent.change(box(), { target: { value: 'design' } });
    // Typed exactly (case aside), there is no row to add it again.
    expect(options()).toEqual(['Design']);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChoose).toHaveBeenLastCalledWith('Design');
  });

  it('without allowCreate, only an option can be taken; with nothing matching it says so', () => {
    const onChoose = vi.fn();
    function Pick() {
      const [text, setText] = useState('');
      return <Combobox aria-label="Class" value={text} onValueChange={setText} options={['BSSE-5A', 'BSCS-6B']} onChoose={onChoose} emptyText="No class by that name." />;
    }
    render(<Pick />);
    const input = screen.getByRole('combobox', { name: 'Class' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByRole('listbox').textContent).toBe('No class by that name.');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'bscs' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith('BSCS-6B');
  });

  it('a click (or a tap) takes an option, and the field keeps the focus', () => {
    const onChoose = vi.fn();
    render(<Tags onChoose={onChoose} />);
    box().focus();
    fireEvent.focus(box());
    const option = screen.getByRole('option', { name: 'Database' });
    fireEvent.pointerDown(option);
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(onChoose).toHaveBeenCalledWith('Database');
    expect(document.activeElement).toBe(box());
  });

  it('Escape closes the list and goes no further; closed, Escape is left to what is around it', () => {
    const onKey = vi.fn();
    render(<Tags onKey={onKey} />);
    fireEvent.focus(box());
    expect(box().getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(box().getAttribute('aria-expanded')).toBe('false');
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(onKey).toHaveBeenCalledTimes(1);
    // ArrowDown opens it again.
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(box().getAttribute('aria-expanded')).toBe('true');
  });

  it('leaving the field closes it', () => {
    render(<Tags />);
    fireEvent.focus(box());
    fireEvent.blur(box());
    expect(box().getAttribute('aria-expanded')).toBe('false');
  });
});
