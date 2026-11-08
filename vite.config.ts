import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built renderer loads from file:// inside Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
