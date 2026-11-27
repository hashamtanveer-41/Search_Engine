// No two files in a folder whose names differ only in case (Debug.tsx and debug.ts did): on a
// case-insensitive disk (macOS, Windows) `./Debug` then finds `debug.ts` before `Debug.tsx`, and the
// playground fails to start with "does not provide an export named …".
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
// what an import without an extension can land on (Vite tries these in turn)
const SCRIPT = /\.(m?[jt]sx?|json)$/;

function clashes(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.name !== 'node_modules' && e.name !== 'dist' && !e.name.startsWith('.'));
  const stems = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.isFile() || !SCRIPT.test(e.name)) continue;
    const exact = e.name.replace(SCRIPT, '');
    stems.set(exact.toLowerCase(), (stems.get(exact.toLowerCase()) ?? new Set()).add(exact));
  }
  const found = [...stems.values()].filter((s) => s.size > 1).map((s) => `${dir}: ${[...s].join(' / ')}`);
  return [...found, ...entries.filter((e) => e.isDirectory()).flatMap((e) => clashes(join(dir, e.name)))];
}

describe('file names', () => {
  it('never differ only in case within a folder', () => {
    expect(['src', 'playground', 'scripts'].flatMap((d) => clashes(join(root, d)))).toEqual([]);
  });
});
