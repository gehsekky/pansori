import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { Context } from '../types.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CAMPAIGN_DATA_DIR = join(__dirname, '../campaignData');

// Exported shape exposed by each context module
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

/**
 * Discover campaign modules. Two layouts are supported:
 *   - a single top-level file, e.g. `campaignData/<id>.ts`
 *   - a campaign folder with an entry point, e.g. `campaignData/<id>/index.ts`
 *     (the preferred layout — the campaign's data is split across sibling files
 *     and assembled in index.ts).
 * Library subfolders like `campaignData/srd/` are scanned too but harmlessly
 * skipped: their index doesn't export a `context`. Each candidate is paired
 * with `isLeaf` so we only warn about a *top-level* file forgetting to export
 * a context (a non-campaign folder index legitimately doesn't).
 */
function contextSpecifiers(): { specifier: string; label: string; isLeaf: boolean }[] {
  const out: { specifier: string; label: string; isLeaf: boolean }[] = [];
  const entries = readdirSync(CAMPAIGN_DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) &&
      !entry.name.endsWith('.spec.ts')
    ) {
      // tsx resolves .js imports to their .ts sources at runtime
      out.push({
        specifier: `../campaignData/${entry.name.replace(/\.ts$/, '.js')}`,
        label: entry.name,
        isLeaf: true,
      });
    } else if (entry.isDirectory()) {
      const dir = join(CAMPAIGN_DATA_DIR, entry.name);
      if (existsSync(join(dir, 'index.ts')) || existsSync(join(dir, 'index.js'))) {
        out.push({
          specifier: `../campaignData/${entry.name}/index.js`,
          label: `${entry.name}/index`,
          isLeaf: false,
        });
      }
    }
  }
  return out;
}

export async function loadContexts(): Promise<Record<string, Context>> {
  let candidates: ReturnType<typeof contextSpecifiers>;
  try {
    candidates = contextSpecifiers();
  } catch (err) {
    console.error('[contextLoader] Cannot read campaignData directory:', err);
    return {};
  }

  const result: Record<string, Context> = {};

  for (const { specifier, label, isLeaf } of candidates) {
    try {
      const mod = (await import(specifier)) as unknown;
      if (!isContextModule(mod)) {
        // A campaign folder's index must export a context; a non-campaign
        // subfolder (e.g. srd/) legitimately doesn't, so only flag leaf files.
        if (isLeaf) {
          console.warn(`[contextLoader] ${label} does not export a valid context — skipping`);
        }
        continue;
      }
      const ctx = mod.context;
      if (result[ctx.id]) {
        console.warn(`[contextLoader] Duplicate context id "${ctx.id}" in ${label} — skipping`);
        continue;
      }
      result[ctx.id] = ctx;
      console.log(`[contextLoader] Loaded context: ${ctx.id}`);
    } catch (err) {
      console.error(`[contextLoader] Failed to load ${label}:`, err);
    }
  }

  return result;
}
