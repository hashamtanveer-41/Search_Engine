import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InlineField } from './inline-field';

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('InlineField', () => {
  afterEach(cleanup);
  it('reads as text until clicked twice; the first click says to click again', () => {
    const onChange = vi.fn();
    render(<InlineField value="Space 2" onChange={onChange} label="Space name" />);
    const name = field('Space 2, click twice to rename');
    expect(name.readOnly).toBe(true);
    fireEvent.click(name);
    expect(name.readOnly).toBe(true);
    expect(screen.getAllByText('Click again to rename').length).toBeGreaterThan(0);
    fireEvent.click(name);
    expect(field('Space name')).toBe(name);
    expect([name.readOnly, name === document.activeElement]).toEqual([false, true]);
    fireEvent.change(name, { target: { value: '  Exam prep ' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Exam prep');
    expect(name.readOnly).toBe(true);
  });

  it('keeps the old name on Escape, and for an empty or unchanged one', () => {
    const onChange = vi.fn();
    render(<InlineField value="Space 2" onChange={onChange} label="Space name" editing onEditingChange={() => undefined} />);
    const name = field('Space name');
    fireEvent.change(name, { target: { value: 'Other' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(name.value).toBe('Space 2');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.blur(name);
    fireEvent.change(name, { target: { value: 'Space 2' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hugs its text, sized by an invisible copy that follows what is typed; or runs its container (fill)', () => {
    const { container, rerender } = render(<InlineField value="Space 2" onChange={() => undefined} editing />);
    const sizer = () => container.querySelector('[data-slot=inline-field] > span[aria-hidden]:not([data-inline-anchor])');
    fireEvent.change(field('Name'), { target: { value: 'A much longer name' } });
    expect(sizer()?.textContent).toBe('A much longer name ');
    rerender(<InlineField value="Space 2" onChange={() => undefined} fill />);
    expect(sizer()).toBeNull();
  });

  it('left empty, keeps the old name and says so (onEmpty); Escape does not', () => {
    const onEmpty = vi.fn();
    render(<InlineField value="Space 2" onChange={() => undefined} onEmpty={onEmpty} label="Space name" editing onEditingChange={() => undefined} />);
    const name = field('Space name');
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onEmpty).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: ' ' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(name.value).toBe('Space 2');
  });

  it('is plain text without onChange: clicks do nothing', () => {
    render(<InlineField value="Reading" />);
    const name = field('Reading');
    fireEvent.click(name);
    fireEvent.click(name);
    expect(name.readOnly).toBe(true);
    expect(screen.queryByText('Click again to rename')).toBeNull();
  });
});
