import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // The playground shell tests render the whole playground in jsdom: 5-8 s each, past vitest's 5 s default.
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}', 'playground/**/*.test.{ts,tsx}'], css: false, setupFiles: ['src/test-setup.ts'], testTimeout: 30_000 },
});
