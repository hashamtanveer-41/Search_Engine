import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { COPIED_MS, CopyField } from './copy-field';
import { Field } from './field';

const LINK = 'https://app.example/join/DEMO100-F26';
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CopyField', () => {
  it('copies the value, says so with a tick for a moment, and reports it', async () => {
    writeText.mockResolvedValue();
    const onCopied = vi.fn();
    render(<CopyField value={LINK} label="Invite link" onCopied={onCopied} />);
    expect((screen.getByRole('textbox', { name: 'Invite link' }) as HTMLInputElement).value).toBe(LINK);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' })); });
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(onCopied).toHaveBeenCalledWith(true);
    expect(screen.getByRole('status').textContent).toBe('Copied');
    act(() => { vi.advanceTimersByTime(COPIED_MS); });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('reports a refused copy and selects the value to copy by hand', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const onCopied = vi.fn();
    render(<CopyField value="DEMO100-F26" label="Class code" onCopied={onCopied} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy class code' })); });
    expect(onCopied).toHaveBeenCalledWith(false);
    expect(screen.getByRole('status').textContent).toBe('');
    const input = screen.getByRole('textbox', { name: 'Class code' }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  it('shows a value of several lines whole, and copies all of it', async () => {
    writeText.mockResolvedValue();
    const setup = 'export APP_SERVER=https://app.example\nexport APP_TOKEN=tok_123';
    render(<CopyField value={setup} label="Token setup" />);
    const box = screen.getByRole('textbox', { name: 'Token setup' }) as HTMLTextAreaElement;
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.value).toBe(setup);
    expect(box.rows).toBe(2);
    expect(box.readOnly).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy token setup' })); });
    expect(writeText).toHaveBeenCalledWith(setup);
  });

  it('is named by the Field around it', () => {
    render(<Field label="API key id" hint="Not the key itself."><CopyField value="key_8f2" /></Field>);
    const input = screen.getByRole('textbox', { name: 'API key id' });
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Not the key itself.').id);
  });
});
