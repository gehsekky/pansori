// Two-layer lint that walks every {token} in every context.narratives pool
// and checks that gameEngine.ts substitutes it.
//
// Layer 1 (strict, per-pool) — for each `narratives.<poolName>` reference
// in the engine source, the directly-attached `.replace(...)` chain (the
// run of `.replace(...)` calls until the next `;`) must handle every
// token that appears in that pool's strings. This catches the failure
// mode where a `.replace({name})` exists somewhere in the engine for
// other pools but the specific death-line resolution path forgets it
// (the `{name} falls, life fading...` leak).
//
// Layer 2 (loose, file-wide) — every token in every pool must have at
// least one `.replace(...{token}...)` call somewhere in the engine. This
// is the original coarse check, preserved as a backstop for pools that
// are stored in a variable first (e.g. `const templates =
// context.narratives.roomArrival[id]; pick(templates).replace(...)`) and
// can't be statically traced to their replace chain.
//
// If a reference has zero `.replace(...)` calls in its same-statement
// window, the strict check is skipped for that reference — the call is
// presumed to bind into a variable that gets processed elsewhere, and
// the loose check still applies.

import { describe, expect, it } from 'vitest';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { context as sandbox } from '../contexts/sandbox.js';
import { context as vale } from '../contexts/malgovia/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Action handlers were extracted out of gameEngine.ts into per-action
// files under services/actions/* — concatenate them so the placeholder
// lint sees `.replace({token}, ...)` calls regardless of which file
// they live in. Sub-directories (attack/, castSpell/, classFeature/)
// carry the per-phase splits and must also be picked up.
function readActionFilesRecursively(dir: string): string {
  const entries = readdirSync(dir, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      parts.push(readActionFilesRecursively(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      parts.push(readFileSync(full, 'utf-8'));
    }
  }
  return parts.join('\n');
}
const actionsDir = join(__dirname, 'actions');
const actionsSrc = readActionFilesRecursively(actionsDir);
const ENGINE_SRC = readFileSync(join(__dirname, 'gameEngine.ts'), 'utf-8') + '\n' + actionsSrc;

// Walk a `narratives.<poolName>` value to the leaves and collect every
// `{token}` that appears in any string. Pools can be arrays of strings,
// arrays of arrays of strings, or objects keyed by tier/id whose leaves
// are eventually strings — collect recursively.
function tokensInValue(v: unknown, into: Set<string>): void {
  if (typeof v === 'string') {
    for (const m of v.matchAll(/\{(\w+)\}/g)) into.add(m[1]);
  } else if (Array.isArray(v)) {
    v.forEach((x) => tokensInValue(x, into));
  } else if (typeof v === 'object' && v != null) {
    Object.values(v as Record<string, unknown>).forEach((x) => tokensInValue(x, into));
  }
}

function tokensByPool(narratives: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (typeof narratives !== 'object' || narratives == null) return out;
  for (const [poolName, value] of Object.entries(narratives as Record<string, unknown>)) {
    const tokens = new Set<string>();
    tokensInValue(value, tokens);
    if (tokens.size > 0) out.set(poolName, tokens);
  }
  return out;
}

// Returns the slice of source from `start` to the next top-level `;`,
// respecting nested () balance so a `;` inside a string or comment can't
// truncate us mid-expression. (For an unbalanced source this falls back
// to scanning the remainder of the file, which is a safe over-scan.)
function statementWindowFrom(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) return src.slice(start, i);
  }
  return src.slice(start);
}

// Extract the set of {token} substrings that appear inside any `.replace(...)`
// call args within the window.
function tokensHandledInWindow(window: string): Set<string> {
  const handled = new Set<string>();
  // Match arg blocks of .replace(...). The arg can be a string literal or
  // a regex literal; either way we just scrape `{token}` patterns out.
  for (const m of window.matchAll(/\.replace\s*\(([^)]+)\)/g)) {
    for (const tm of m[1].matchAll(/\{(\w+)\}/g)) handled.add(tm[1]);
  }
  return handled;
}

function hasReplaceInWindow(window: string): boolean {
  return /\.replace\s*\(/.test(window);
}

function lineOf(src: string, idx: number): number {
  return src.slice(0, idx).split('\n').length;
}

describe('narrative placeholder lint', () => {
  // Layer 1 — per-pool, per-reference strict check.
  for (const [ctxName, ctx] of [
    ['sandbox', sandbox],
    ['malgovia', vale],
  ] as const) {
    it(`every {token} is substituted at every inline reference in ${ctxName}.narratives`, () => {
      const required = tokensByPool(ctx.narratives);
      const failures: string[] = [];
      for (const [poolName, tokens] of required) {
        const refRe = new RegExp(`narratives\\.${poolName}\\b`, 'g');
        let m: RegExpExecArray | null;
        while ((m = refRe.exec(ENGINE_SRC)) !== null) {
          const window = statementWindowFrom(ENGINE_SRC, m.index);
          // No .replace in the same statement → the pool was bound to a
          // variable for later use; skip strict, rely on the loose check.
          if (!hasReplaceInWindow(window)) continue;
          const handled = tokensHandledInWindow(window);
          const missing = [...tokens].filter((t) => !handled.has(t));
          if (missing.length > 0) {
            failures.push(
              `narratives.${poolName} @ gameEngine.ts:${lineOf(ENGINE_SRC, m.index)} ` +
                `— pool requires {${[...tokens].join('}, {')}} but chain only handles ` +
                `{${[...handled].join('}, {') || '(none)'}}; missing: {${missing.join('}, {')}}`
            );
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }

  // Layer 2 — file-wide loose check (the original lint, kept as a
  // backstop for variable-indirected pools).
  for (const [ctxName, ctx] of [
    ['sandbox', sandbox],
    ['malgovia', vale],
  ] as const) {
    it(`every {token} in ${ctxName}.narratives has a handler somewhere in the engine`, () => {
      const required = tokensByPool(ctx.narratives);
      const allTokens = new Set<string>();
      for (const set of required.values()) for (const t of set) allTokens.add(t);
      const unhandled = [...allTokens].filter(
        (t) => !new RegExp(`\\.replace\\([^)]*\\{${t}\\}`).test(ENGINE_SRC)
      );
      expect(
        unhandled,
        `Unhandled placeholders in ${ctxName} narratives — engine needs a .replace(...) for each: ${unhandled.join(', ')}`
      ).toEqual([]);
    });
  }
});
