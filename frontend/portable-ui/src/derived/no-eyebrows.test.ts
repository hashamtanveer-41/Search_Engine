// No eyebrows anywhere: no small mono capitals spread wide. The shared caption is in
// the page's own type, as written.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
const rule = (sheet: string, selector: string) => sheet.slice(sheet.indexOf(selector), sheet.indexOf('}', sheet.indexOf(selector)));

describe('no eyebrows', () => {
  it('draws the shared caption in the page’s type, as written', () => {
    for (const [sheet, selector] of [[css('../styles.css'), ':where(.ui-caption)']] as const) {
      const body = rule(sheet, selector);
      expect(body, selector).not.toBe('');
      expect(body, selector).not.toMatch(/uppercase|font-mono|letter-spacing/);
    }
  });
});
