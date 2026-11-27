import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from './dialog';

afterEach(cleanup);

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>New project</button>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>New project</DialogTitle></DialogContent></Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('dims the page behind it once it has opened (the backdrop is driven, not left at 0)', async () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const content = await screen.findByRole('dialog');
    await waitFor(() => expect(content.style.opacity).toBe('1'), { timeout: 3000 });
    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!;
    expect(overlay.style.opacity).toBe('1');
  });
});
