import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { Empty } from './empty';
import { Button } from './button';

afterEach(cleanup);

describe('Empty', () => {
  it('shows its title, why, and its action; the icon is decoration', () => {
    render(
      <Empty icon={<BookOpen />} title="No lectures yet" action={<Button>Add a lecture</Button>}>
        Lectures you add appear here.
      </Empty>,
    );
    expect(screen.getByText('No lectures yet')).toBeTruthy();
    expect(screen.getByText('Lectures you add appear here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a lecture' })).toBeTruthy();
    expect(document.querySelector('[data-slot="empty-icon"]')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves out what it was not given', () => {
    render(<Empty title="Nothing waiting" />);
    expect(document.querySelector('[data-slot="empty-icon"]')).toBeNull();
    expect(document.querySelector('[data-slot="empty-description"]')).toBeNull();
    expect(document.querySelector('[data-slot="empty-action"]')).toBeNull();
  });
});
