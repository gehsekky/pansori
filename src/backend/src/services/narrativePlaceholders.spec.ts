// Static lint: walk every string in every context's `narratives` block for
// {token} placeholders, then confirm gameEngine.ts has a `.replace(...)` for
// each one. Catches regressions like the {level} bug where a picked
// narrative leaked through to the player with an un-substituted token.
//
// The check is intentionally coarse — we just look for the literal
// "{token}" appearing inside a `.replace(...)` call. False negatives are
// possible but a missed substitution like "{level}" was — that one bug
// motivated this test.

import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { context as pines } from '../contexts/whispering_pines.js';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { context as sandbox } from '../contexts/sandbox.js';
import { context as vale } from '../contexts/vale_of_shadows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENGINE_SRC = readFileSync(join(__dirname, 'gameEngine.ts'), 'utf-8');

function collectTokens(narratives: unknown): Set<string> {
  const tokens = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\{(\w+)\}/g)) tokens.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object' && v != null) Object.values(v).forEach(walk);
  };
  walk(narratives);
  return tokens;
}

function tokenHandled(token: string, source: string): boolean {
  // Match `.replace(...)` calls whose arg contains `{token}` (in either
  // string-literal or regex form). Permissive on whitespace + escaping.
  const re = new RegExp(`\\.replace\\([^)]*\\{${token}\\}`);
  return re.test(source);
}

describe('narrative placeholder lint', () => {
  for (const [name, ctx] of [
    ['sandbox', sandbox],
    ['vale_of_shadows', vale],
    ['whispering_pines', pines],
  ] as const) {
    it(`every {token} in ${name}.narratives is substituted somewhere in gameEngine.ts`, () => {
      const tokens = collectTokens(ctx.narratives);
      const unhandled = [...tokens].filter((t) => !tokenHandled(t, ENGINE_SRC));
      expect(
        unhandled,
        `Unhandled placeholders in ${name} narratives — engine needs a .replace(...) for each: ${unhandled.join(', ')}`
      ).toEqual([]);
    });
  }
});
