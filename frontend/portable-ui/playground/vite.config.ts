import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// What the version indicator shows: the package version, the commit it was built from (when
// there is a git checkout) and when it was built.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })();

// The component playground: `npm run dev:playground` (from the repo root or ui/).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: {
    __PG_VERSION__: JSON.stringify(pkg.version),
    __PG_COMMIT__: JSON.stringify(commit),
    __PG_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  server: { host: '127.0.0.1', port: 5174, open: false, fs: { allow: ['..'] } },
  build: { outDir: '../dist/playground', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 6000 },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
