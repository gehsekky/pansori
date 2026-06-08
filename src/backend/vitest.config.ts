import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // tests/ (mirroring src/'s shape) is the canonical home; the src/
    // glob stays as a safety net so a spec accidentally added beside its
    // source still runs rather than silently passing.
    include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
