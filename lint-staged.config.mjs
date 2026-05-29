import path from 'node:path';

// Pre-commit auto-fix for staged source files (run by .husky/pre-commit via
// lint-staged). Mirrors the CI "Lint" + "Prettier check" gates so dirty code
// can't reach CI:
//   1. `eslint --fix` per workspace — the flat configs use typed linting
//      (`project: true`), which discovers each file's tsconfig relative to the
//      WORKSPACE root, so eslint must run with that workspace as its cwd (it
//      can't be invoked from the repo root — there is no root eslint config).
//   2. `prettier --write` last (from the repo root) so its formatting is final
//      and it also covers files outside the two workspaces (src/shared, scripts,
//      root configs) — exactly the `src/**/*.{ts,tsx,js,jsx}` set CI checks.
const WORKSPACES = ['src/backend', 'src/frontend'];
const root = process.cwd();

export default {
  '*.{ts,tsx,js,jsx}': (files) => {
    const commands = [];
    for (const ws of WORKSPACES) {
      const wsAbs = path.join(root, ws);
      const inWs = files.filter((f) => f.startsWith(wsAbs + path.sep));
      if (inWs.length === 0) continue;
      const rel = inWs.map((f) => path.relative(wsAbs, f)).join(' ');
      commands.push(`bash -c "cd ${ws} && eslint --fix ${rel}"`);
    }
    commands.push(`prettier --write ${files.map((f) => path.relative(root, f)).join(' ')}`);
    return commands;
  },
};
