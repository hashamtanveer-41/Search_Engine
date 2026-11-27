import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { ariaKeys, keyCaps, keyName, keySpoken, matches, type KeyPress } from './combo';
import { Keys } from './Keys';
import { useHeld } from './held';

afterEach(cleanup);

const press = (over: Partial<KeyPress>): KeyPress => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

describe('shortcuts per platform (a Mac showed Ctrl)', () => {
  it('draws Mod as ⌘ on a Mac and Ctrl elsewhere, the modifiers in each one’s order', () => {
    expect(keyCaps('Mod+K', true)).toEqual(['⌘', 'K']);
    expect(keyCaps('Mod+K', false)).toEqual(['Ctrl', 'K']);
    expect(keyCaps('Mod+Shift+Z', true)).toEqual(['⇧', '⌘', 'Z']);
    expect(keyCaps('Mod+Shift+Z', false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(keyCaps('Ctrl+Alt+Left', true)).toEqual(['⌃', '⌥', '←']);
    expect(keyCaps('Ctrl+Alt+Left', false)).toEqual(['Ctrl', 'Alt', '←']);
    expect(keyCaps('Alt+Enter', true)).toEqual(['⌥', '↩']);
    expect(keyCaps('Esc', true)).toEqual(['Esc']);
  });

  it('names it for a tooltip, says it for a screen reader, and gives aria-keyshortcuts its form', () => {
    expect(keyName('Mod+K', true)).toBe('⌘K');
    expect(keyName('Mod+K', false)).toBe('Ctrl+K');
    expect(keySpoken('Mod+/', true)).toBe('Command Slash');
    expect(keySpoken('Alt+Shift+T', false)).toBe('Alt Shift T');
    expect(ariaKeys('Mod+K', true)).toBe('Meta+K');
    expect(ariaKeys('Mod+K', false)).toBe('Control+K');
    expect(ariaKeys('Alt+Up', false)).toBe('Alt+ArrowUp');
  });

  it('matches a key press: Mod is ⌘ on a Mac and Ctrl elsewhere, its modifiers exactly', () => {
    expect(matches('Mod+K', press({ key: 'k', code: 'KeyK', metaKey: true }), true)).toBe(true);
    expect(matches('Mod+K', press({ key: 'k', code: 'KeyK', ctrlKey: true }), true)).toBe(false);
    expect(matches('Mod+K', press({ key: 'k', code: 'KeyK', ctrlKey: true }), false)).toBe(true);
    expect(matches('Mod+K', press({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(matches('Mod+/', press({ key: '/', code: 'Slash', metaKey: true }), true)).toBe(true);
    // Option and a letter types another character on a Mac: still that key.
    expect(matches('Alt+W', press({ key: '∑', code: 'KeyW', altKey: true }), true)).toBe(true);
    expect(matches('?', press({ key: '?', code: 'Slash', shiftKey: true }), false)).toBe(true);
  });

  it('draws its caps, as alternatives, and is named in words', () => {
    render(<Keys combo={['Mod+Shift+Z', 'Mod+Y']} mac />);
    const keys = screen.getByRole('img', { name: 'Shift Command Z or Command Y' });
    expect([...keys.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⇧', '⌘', 'Z', '⌘', 'Y']);
    expect(keys.getAttribute('title')).toBe('⇧⌘Z or ⌘Y');
  });
});

describe('useHeld', () => {
  it('follows a modifier from the keys and from the pointer’s moves, and lets go on a blur', () => {
    const { result } = renderHook(() => ({ alt: useHeld('Alt'), any: useHeld('any') }));
    expect(result.current).toEqual({ alt: false, any: false });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })); });
    expect(result.current).toEqual({ alt: true, any: true });
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false })); });
    expect(result.current).toEqual({ alt: false, any: false });
    // A key that went down while another window had the focus: the pointer's moves say so.
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { shiftKey: true })); });
    expect(result.current).toEqual({ alt: false, any: true });
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(result.current.any).toBe(false);
  });
});

