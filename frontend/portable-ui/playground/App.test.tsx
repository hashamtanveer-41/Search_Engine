// The playground's shell (App.tsx): which theme it opens on, from the URL and from what an earlier
// visit saved.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';

const at = (search: string) => history.replaceState(null, '', `/${search}`);
const header = () => within(document.querySelector('header')!);

beforeAll(() => {
  // what the playground's Vite config defines at build time
  vi.stubGlobal('__PG_VERSION__', '0.0.0');
  vi.stubGlobal('__PG_COMMIT__', 'test');
  vi.stubGlobal('__PG_BUILT__', '2026-11-08T00:00:00Z');
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
});
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); at(''); });

describe('the playground shell', () => {
  it('draws in the URL’s theme over the saved one, and a toggle keeps the link true', () => {
    localStorage.setItem('pg/theme', 'light');
    at('?theme=dark');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(header().getByRole('button', { name: 'Light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(location.search).toBe('?theme=light');
    expect(localStorage.getItem('pg/theme')).toBe('light');
  });

  it('draws the components, with no tabs, whatever an old link names', () => {
    at('?view=lessons&lesson=limits');
    render(<App />);
    expect(header().queryAllByRole('tab')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Extra small' })).toBeTruthy();
  });
});
