import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchInput } from './search-input';

afterEach(cleanup);

function Search({ initial = '', onKey }: { initial?: string; onKey?: () => void }) {
  const [q, setQ] = useState(initial);
  return <div onKeyDown={onKey}><SearchInput aria-label="Search lessons" value={q} onValueChange={setQ} /><output>{q}</output></div>;
}

const box = () => screen.getByRole('searchbox', { name: 'Search lessons' }) as HTMLInputElement;
const clearButton = () => screen.queryByRole('button', { name: 'Clear search' });

describe('SearchInput', () => {
  it('shows the clear button only while there is text', () => {
    render(<Search />);
    expect(clearButton()).toBeNull();
    fireEvent.change(box(), { target: { value: 'limits' } });
    expect(box().value).toBe('limits');
    expect(clearButton()).toBeTruthy();
  });

  it('clears on the clear button and puts the focus back in the input', () => {
    render(<Search initial="epsilon" />);
    fireEvent.click(clearButton()!);
    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
    expect(clearButton()).toBeNull();
  });

  it('clears on Escape when there is text, and keeps the key to itself', () => {
    const onKey = vi.fn();
    render(<Search initial="continuity" onKey={onKey} />);
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(box().value).toBe('');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('lets Escape through when empty (a dialog around it can close)', () => {
    const onKey = vi.fn();
    render(<Search onKey={onKey} />);
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it('forwards its ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchInput ref={ref} aria-label="Search classes" value="" onValueChange={() => {}} />);
    expect(ref.current).toBe(screen.getByRole('searchbox', { name: 'Search classes' }));
  });
});
