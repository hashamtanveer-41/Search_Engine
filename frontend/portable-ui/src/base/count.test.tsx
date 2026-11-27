// A count's figure must read on its pill in both themes ("4 is not readable": white
// on the dark theme's light blue). Its ring lifts it off an icon, and stays out of a row.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Count } from './count';

afterEach(cleanup);

const CSS = readFileSync(join(__dirname, '../styles.css'), 'utf8');
/** A theme's block: the light one is the first :root, the dark one [data-theme='dark']. */
const block = (opening: string) => { const from = CSS.indexOf(opening); return CSS.slice(from, CSS.indexOf('\n}', from)); };
const token = (css: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('Count', () => {
  it.each([['light', ':root {'], ['dark', "[data-theme='dark'], .dark {"]])('reads at 4.5:1 or better on every tone in the %s theme', (_, opening) => {
    const css = block(opening);
    const text = token(css, 'count-text');
    expect(text).toBeTruthy();
    for (const tone of ['ok', 'info', 'warn', 'bad', 'thm', 'ex', 'neutral']) {
      const ink = token(css, tone);
      expect(ink, tone).toBeTruthy();
      expect(contrast(text!, ink!), `${tone} ${ink} under ${text}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws its figure in --count-text, ringed by default and not inside a row', () => {
    render(<><Count value={4} tone="info" /><Count value={2} tone="info" ring={false} /></>);
    const [ringed, plain] = [...document.querySelectorAll<HTMLElement>('[data-slot=count]')];
    expect(ringed.className).toContain('text-[var(--count-text,#fff)]');
    expect(ringed.className).not.toContain('text-white');
    expect(ringed.className).toContain('shadow-[0_0_0_2px_var(--background)]');
    expect(plain.className).not.toContain('shadow-');
    expect(plain.textContent).toBe('2');
  });
});
