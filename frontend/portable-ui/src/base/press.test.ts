import { afterEach, describe, expect, it } from 'vitest';
import { installPressFeedback, pressTarget } from './press';

afterEach(() => { document.body.innerHTML = ''; });

describe('press feedback', () => {
  it('belongs to every button variant, ghost and link included, but not to other controls', () => {
    document.body.innerHTML = `
      <button data-slot="button" data-variant="default" id="primary"><span id="label">Start reading</span></button>
      <button data-slot="button" data-variant="outline" id="outline">Outline</button>
      <button data-slot="button" data-variant="success" id="success">Approve</button>
      <button data-slot="button" data-variant="ghost" id="ghost">Ghost</button>
      <button data-slot="button" data-variant="link" id="link">Link</button>
      <button data-slot="checkbox" id="cb"></button>
      <button data-slot="button" data-variant="default" id="off" disabled></button>`;
    expect(pressTarget(document.getElementById('label'))?.id).toBe('primary');
    expect(pressTarget(document.getElementById('outline'))?.id).toBe('outline');
    expect(pressTarget(document.getElementById('success'))?.id).toBe('success');
    expect(pressTarget(document.getElementById('ghost'))?.id).toBe('ghost');
    expect(pressTarget(document.getElementById('link'))?.id).toBe('link');
    expect(pressTarget(document.getElementById('cb'))).toBeNull();
    expect(pressTarget(document.getElementById('off'))).toBeNull();
  });

  it('holds while pressed and lets go on release, from the pointer or the keyboard', () => {
    installPressFeedback(document);
    document.body.innerHTML = '<button data-slot="button" data-variant="default" id="b">Go</button>';
    const b = document.getElementById('b')!;
    b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(b.dataset.pressed).toBe('');
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    expect(b.dataset.pressed).toBeUndefined();
    b.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(b.dataset.pressed).toBe('');
    b.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    expect(b.dataset.pressed).toBeUndefined();
  });
});
