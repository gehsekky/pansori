import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },
    proxy: {
      '/api': { target: 'http://backend:3001', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    // Default specs to the PAINTED tier so the existing exact-`/art/...`
    // assertions hold; free-tier specs flip it off with vi.stubEnv.
    env: { VITE_PAINTED_ART: '1' },
  },
});
