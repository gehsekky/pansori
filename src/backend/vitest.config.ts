import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // src/tests/ (mirroring the source tree's shape) is the canonical
    // home; the glob also catches a spec accidentally added beside its
    // source, so nothing silently stops running.
    include: ['src/**/*.spec.ts'],
  },
});
