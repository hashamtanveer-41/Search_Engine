import { describe, expect, it } from 'vitest';
import { bindingFor, BINDINGS, isTypingTarget, paneShortcuts, standsAside } from './keymap';
import { nextAltState } from './useAltState';

const press = (code: string, mods: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) =>
  ({ code, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...mods });
const free = { typing: false, composing: false, handled: false, underDialog: false, repeat: false };

describe('keymap', () => {
  it('does not move panes with Shift: Alt+Shift+arrows do nothing (a pane moves by its tab)', () => {
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(bindingFor(press(code, { altKey: true, shiftKey: true }), free)).toBeNull();
  });

  it('matches the physical key, so Option+W on a Mac (which types ∑) still closes', () => {
    expect(bindingFor(press('KeyW', { altKey: true }), free)?.what).toBe('Close the active pane');
    expect(bindingFor(press('Backslash', { altKey: true, shiftKey: true }), free)?.what).toBe('Split down');
  });

  it('stands aside in a field, under a dialog, while composing, for a handled key', () => {
    const b = BINDINGS[0];
    for (const k of ['typing', 'underDialog', 'composing', 'handled'] as const) expect(standsAside({ ...free, [k]: true }, b)).toBe(true);
  });

  it('a held key repeats a move between panes but never a layout change', () => {
    expect(bindingFor(press('ArrowRight', { altKey: true }), { ...free, repeat: true })).not.toBeNull();
    expect(bindingFor(press('KeyW', { altKey: true }), { ...free, repeat: true })).toBeNull();
  });

  it('Ctrl+Alt is the system\'s (AltGr), not the workspace\'s', () => {
    expect(bindingFor(press('KeyW', { altKey: true, ctrlKey: true }), free)).toBeNull();
  });

  it('knows where the keyboard types', () => {
    const input = document.createElement('input');
    const box = document.createElement('input');
    box.type = 'checkbox';
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });

  it('gives an app\'s shortcuts dialog every pane key, as typed shortcuts (keys/ draws them)', () => {
    const rows = paneShortcuts();
    expect(rows.find((r) => r.what === 'Close the active pane')?.combo).toEqual(['Alt+W']);
    expect(rows.find((r) => r.what === 'Redo')?.combo).toEqual(['Mod+Shift+Z', 'Mod+Y']);
    expect(rows.find((r) => r.what === 'Focus the pane to the left')?.combo).toEqual(['Alt+Left']);
  });
});

describe('Alt held', () => {
  it('shows hints while Alt is down, nothing in a field, and goes with Ctrl or a blur', () => {
    expect(nextAltState('off', { type: 'keydown', key: 'Alt' }, false)).toBe('hints');
    expect(nextAltState('off', { type: 'keydown', key: 'Alt' }, true)).toBe('field');
    expect(nextAltState('hints', { type: 'keydown', key: 'Control', altKey: true, ctrlKey: true }, false)).toBe('off');
    expect(nextAltState('hints', { type: 'keyup', key: 'Alt' }, false)).toBe('off');
    expect(nextAltState('hints', { type: 'blur' }, false)).toBe('off');
  });

  it('Alt repeating (held for the window switcher) changes nothing', () => {
    expect(nextAltState('off', { type: 'keydown', key: 'Alt', repeat: true }, false)).toBe('off');
  });
});
