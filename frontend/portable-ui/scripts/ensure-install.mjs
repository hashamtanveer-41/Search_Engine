// Before the playground starts: install the package's dependencies once, so a fresh checkout
// needs only `npm run dev:playground`.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
if (!require.resolve.paths('vite').some((path) => existsSync(join(path, 'vite', 'package.json')))) {
  console.log('Installing portable-ui dependencies (first run only)…');
  execSync(existsSync(join(root, 'package-lock.json')) ? 'npm ci' : 'npm install', { cwd: root, stdio: 'inherit' });
}
