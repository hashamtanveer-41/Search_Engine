import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Dialog, DialogContent, DialogTitle } from './dialog';

// "Remove animations" on a phone is prefers-reduced-motion: the springs jump in one step.
const realMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce'), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; });

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open navigation</button>
      <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left"><SheetTitle>Navigation</SheetTitle></SheetContent></Sheet>
    </>
  );
}

describe('with reduced motion', () => {
  it('a sheet opened from the left is on screen, not just its backdrop', async () => {
    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const content = await screen.findByRole('dialog');
    await waitFor(() => expect(content.style.translate).toMatch(/^-?0(\.0+)?% 0$/));
    expect(document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]')!.style.opacity).toBe('1');
  });

  it('a dialog is fully shown at once', async () => {
    render(<Dialog open><DialogContent><DialogTitle>New project</DialogTitle></DialogContent></Dialog>);
    const content = await screen.findByRole('dialog');
    await waitFor(() => expect(content.style.opacity).toBe('1'));
    expect(document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!.style.opacity).toBe('1');
  });
});
