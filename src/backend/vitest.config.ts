import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests are migrating from beside their sources (src/**) into the
    // mirrored tests/ tree — both patterns run during the migration.
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
  },
});
