import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Question } from './question';

afterEach(cleanup);

const options = [{ id: 'a', text: 'f is continuous at 2' }, { id: 'b', text: 'Removable' }];

describe('Question', () => {
  it('cannot be checked before an answer is chosen', () => {
    render(<Question prompt="What happens at 2?" options={options} answer="b" />);
    expect((screen.getByRole('button', { name: 'Check answer' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks a wrong choice red, the right one green, and reports it', () => {
    const onAnswered = vi.fn();
    render(<Question prompt="What happens at 2?" options={options} answer="b" explanation="The limit is 4." onAnswered={onAnswered} />);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(onAnswered).toHaveBeenCalledWith(false);
    expect(screen.getByText('f is continuous at 2').closest('label')!.dataset.state).toBe('wrong');
    expect(screen.getByText('Removable').closest('label')!.dataset.state).toBe('right');
    expect(screen.getByText(/Not quite/).textContent).toContain('The limit is 4.');
  });

  it('says so when the answer is right, and can be tried again', () => {
    render(<Question prompt="What happens at 2?" options={options} answer="b" />);
    fireEvent.click(screen.getAllByRole('radio')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByText('Right.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeTruthy();
  });

  it('shows the hint only when asked', () => {
    render(<Question prompt="What happens at 2?" options={options} answer="b" hint="Compare with f(2)." />);
    expect(screen.queryByText('Compare with f(2).')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show a hint' }));
    expect(screen.getByText('Compare with f(2).')).toBeTruthy();
  });
});
