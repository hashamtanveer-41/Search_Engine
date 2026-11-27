import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeListing } from './code-listing';

describe('CodeListing', () => {
  it('numbers every line and marks the current one by more than colour', () => {
    const html = renderToStaticMarkup(<CodeListing code={'a = 1\nb = 2\n'} label="Python" current={2} />);
    expect(html.match(/ui-listing-number/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Python"');
    // Marked for assistive technology, and drawn with the highlight and its number as the pointer.
    expect(html).toMatch(/data-current="" aria-current="step"><span class="ui-listing-number" aria-hidden="true">2/);
    expect(html).toMatch(/class="ui-listing-pointer"[^>]*>2<\/span>/);
  });

  it('lights several lines without a marker column, and marks parts of lines', () => {
    const html = renderToStaticMarkup(
      <CodeListing label="SQL" marker={false} current={[10, 11]} start={10}
        lines={[{ spans: [{ text: 'SELECT ' }, { text: 'name', tone: 'warn' }] }, { text: 'FROM t', tone: 'bad', end: 'note' }]} />,
    );
    expect(html).not.toContain('ui-listing-marker');
    expect(html.match(/data-current=""/g)).toHaveLength(2);
    expect(html).toContain('<mark class="ui-tone-warn">name</mark>');
    expect(html).toContain('ui-listing-line ui-tone-bad');
    expect(html).toContain('<span class="ui-listing-end">note</span>');
    expect(html).toContain('>10<');
  });

});
