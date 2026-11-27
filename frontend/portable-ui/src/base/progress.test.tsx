import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Progress } from './progress';

afterEach(cleanup);

describe('Progress', () => {
  it('says its value to assistive tech, and draws the bar that far', () => {
    render(<Progress aria-label="Lessons read" value={40} />);
    const bar = screen.getByRole('progressbar', { name: 'Lessons read' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('data-state')).toBe('loading');
    expect(bar.querySelector<HTMLElement>('[data-slot="progress-indicator"]')!.style.transform).toBe('translateX(-60%)');
  });

  it('is indeterminate without a value', () => {
    render(<Progress aria-label="Loading" value={null} />);
    const bar = screen.getByRole('progressbar', { name: 'Loading' });
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.getAttribute('data-state')).toBe('indeterminate');
  });
});
