import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterChip, FilterChips } from './filter-chips';

afterEach(cleanup);

const chip = (name: RegExp) => screen.getByRole('radio', { name });
const pressed = () => [...document.querySelectorAll<HTMLElement>('[data-slot="filter-chip"][data-state="on"]')].map((c) => c.dataset.value);

function Kinds({ onChange }: { onChange?: (v: string) => void }) {
  const [kind, setKind] = useState('all');
  return (
    <FilterChips aria-label="Show" value={kind} onValueChange={(v) => { setKind(v); onChange?.(v); }}>
      <FilterChip value="all" count={42}>All</FilterChip>
      <FilterChip value="lesson" count={18}>Lessons</FilterChip>
      <FilterChip value="practice" count={9}>Practice</FilterChip>
    </FilterChips>
  );
}

describe('FilterChips', () => {
  it('single: picks the chip pressed, and keeps it when pressed again', () => {
    const onChange = vi.fn();
    render(<Kinds onChange={onChange} />);
    expect(pressed()).toEqual(['all']);
    fireEvent.click(chip(/Lessons/));
    expect(pressed()).toEqual(['lesson']);
    expect(onChange).toHaveBeenLastCalledWith('lesson');
    fireEvent.click(chip(/Lessons/));
    expect(pressed()).toEqual(['lesson']);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows each chip’s count', () => {
    render(<Kinds />);
    expect(chip(/Practice/).querySelector('[data-slot="filter-chip-count"]')!.textContent).toBe('9');
  });

  it('single with allowEmpty: pressing the chosen chip again clears the filter', () => {
    const onChange = vi.fn();
    render(
      <FilterChips aria-label="Kind" defaultValue="news" allowEmpty onValueChange={onChange}>
        <FilterChip value="news">News</FilterChip><FilterChip value="fix">Fixes</FilterChip>
      </FilterChips>,
    );
    fireEvent.click(chip(/News/));
    expect(pressed()).toEqual([]);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('multiple: presses any number of chips, and none', () => {
    const onChange = vi.fn();
    render(
      <FilterChips type="multiple" aria-label="Kinds" defaultValue={['lesson']} onValueChange={onChange}>
        <FilterChip value="lesson">Lessons</FilterChip><FilterChip value="question">Questions</FilterChip>
      </FilterChips>,
    );
    const lessons = screen.getByRole('button', { name: 'Lessons' });
    const questions = screen.getByRole('button', { name: 'Questions' });
    expect(lessons.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(questions);
    expect(onChange).toHaveBeenLastCalledWith(['lesson', 'question']);
    fireEvent.click(lessons);
    fireEvent.click(questions);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(pressed()).toEqual([]);
  });
});
