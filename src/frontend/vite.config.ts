import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // The 3D crawler view (Room3DView) is lazy-imported, so its deps aren't in
  // vite's initial pre-bundle scan — discovering them mid-session triggers a
  // re-optimization that can split React into two module instances ("dispatcher
  // is null" on the first hook). Pre-bundle them up front and dedupe react.
  optimizeDeps: { include: ['three', '@react-three/fiber', '@react-three/drei'] },
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
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
