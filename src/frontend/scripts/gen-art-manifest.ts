/**
 * Walks public/art/<contextId>/ and writes src/art-manifest.json.
 * Format: { [contextId]: { [roomId]: 'webp' | 'png' | ... } }
 * RoomArtPanel reads this instead of trial-and-error extension probing.
 */
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artDir = join(__dirname, '..', 'public', 'art');
const outFile = join(__dirname, '..', 'src', 'art-manifest.json');

const manifest: Record<string, Record<string, string>> = {};

// Shared art folders under public/art that aren't per-context room art (map
// terrain tiles, the party sprite, etc.) — they're referenced by fixed paths in
// the components, not via the room-art manifest, so keep them out of it.
const NON_CONTEXT_DIRS = new Set(['tiles', 'sprites']);

if (existsSync(artDir)) {
  for (const contextId of readdirSync(artDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_CONTEXT_DIRS.has(d.name))
    .map((d) => d.name)) {
    manifest[contextId] = {};
    const ctxDir = join(artDir, contextId);
    for (const file of readdirSync(ctxDir)) {
      const ext = extname(file).slice(1).toLowerCase();
      const roomId = basename(file, '.' + ext);
      if (ext && roomId) manifest[contextId][roomId] = ext;
    }
  }
}

writeFileSync(outFile, JSON.stringify(manifest, null, 2));
console.log(`[gen-art-manifest] wrote ${outFile}`);
