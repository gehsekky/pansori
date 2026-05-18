import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Context } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTEXTS_DIR = join(__dirname, '../contexts');

// Exported shape exposed by each context file
interface ContextModule {
  context: Context;
}

function isContextModule(mod: unknown): mod is ContextModule {
  const m = mod as Record<string, unknown>;
  return (
    typeof m?.context === 'object' &&
    m.context !== null &&
    typeof (m.context as Record<string, unknown>).id === 'string'
  );
}

export async function loadContexts(): Promise<Record<string, Context>> {
  let files: string[];
  try {
    files = readdirSync(CONTEXTS_DIR).filter(
      (f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.spec.ts')
    );
  } catch (err) {
    console.error('[contextLoader] Cannot read contexts directory:', err);
    return {};
  }

  const result: Record<string, Context> = {};

  for (const file of files) {
    // tsx resolves .js imports to their .ts sources at runtime
    const specifier = `../contexts/${file.replace(/\.ts$/, '.js')}`;
    try {
      const mod = (await import(specifier)) as unknown;
      if (!isContextModule(mod)) {
        console.warn(`[contextLoader] ${file} does not export a valid context — skipping`);
        continue;
      }
      const ctx = mod.context;
      if (result[ctx.id]) {
        console.warn(`[contextLoader] Duplicate context id "${ctx.id}" in ${file} — skipping`);
        continue;
      }
      result[ctx.id] = ctx;
      console.log(`[contextLoader] Loaded context: ${ctx.id}`);
    } catch (err) {
      console.error(`[contextLoader] Failed to load ${file}:`, err);
    }
  }

  return result;
}
