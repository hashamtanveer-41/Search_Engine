import { describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { Check, Layers } from 'lucide-react';
import { Mark, markName } from './mark';
import { Button } from './button';

afterEach(cleanup);

describe('Mark', () => {
  it('is named by its label, count and detail, with no text inside the tile', () => {
    render(<Mark tone="warn" icon={<Layers />} label="Review cards due" detail="Oldest from Tuesday" count={8} />);
    const mark = screen.getByRole('img', { name: 'Review cards due (8). Oldest from Tuesday' });
    expect(mark.textContent).toBe('8');
    expect(mark.dataset.tone).toBe('warn');
  });

  it('opens its tooltip at once on keyboard focus', async () => {
    render(<Mark tone="ok" icon={<Check />} label="Correct" detail="The limit is 4" />);
    await act(async () => { fireEvent.focus(screen.getByRole('img')); });
    const tips = await screen.findAllByText('Correct');
    expect(tips.length).toBeGreaterThan(0);
    expect(screen.getAllByText('The limit is 4').length).toBeGreaterThan(0);
  });

  it('keeps its icon its own size inside a button, which sizes unsized icons 16 px', () => {
    render(<Button><Mark size="sm" icon={<Layers />} label="Review cards due" count={8} /></Button>);
    const icon = screen.getByRole('img').querySelector('svg')!;
    expect(icon.getAttribute('width')).toBe('12');
    expect(icon.getAttribute('class')).toMatch(/(^| )size-full( |$)/);
  });

  it('leaves the count out of the name when there is none', () => {
    expect(markName({ label: 'Done' })).toBe('Done');
    expect(markName({ label: 'Done', detail: 'In 2 min' })).toBe('Done. In 2 min');
  });
});
