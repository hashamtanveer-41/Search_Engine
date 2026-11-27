import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';

// A finger's 44 px on a touch screen (a tap-target audit on a phone).
describe('button sizes on a touch screen', () => {
  it.each(['default', 'sm', 'lg'] as const)('%s is at least 44 px tall, and grows with what is in it', (size) => {
    const classes = buttonVariants({ size });
    expect(classes).toContain('pointer-coarse:min-h-11');
    // A fixed 44 px would beat a button's own `h-auto` (a notification's lines spilled out of it).
    expect(classes).not.toMatch(/pointer-coarse:h-11\b/);
  });
  it.each(['icon', 'icon-sm', 'icon-lg'] as const)('%s is 44 px square', (size) => {
    expect(buttonVariants({ size })).toContain('pointer-coarse:size-11');
  });
  it.each(['icon', 'icon-sm', 'icon-lg'] as const)('%s fills itself with a 20 px icon', (size) => {
    expect(buttonVariants({ size })).toContain("pointer-coarse:[&_svg:not([class*='size-'])]:size-5");
  });
  it.each(['default', 'sm', 'lg'] as const)('%s has an 18 px icon beside its label', (size) => {
    expect(buttonVariants({ size })).toContain("pointer-coarse:[&_svg:not([class*='size-'])]:size-[18px]");
  });
  it.each(['xs', 'icon-xs'] as const)('%s keeps its look, with a 44 px hit area round it', (size) => {
    const classes = buttonVariants({ size });
    expect(classes).toContain('pointer-coarse:after:absolute');
    expect(classes).toContain('pointer-coarse:after:-inset-2.5');
  });
});
