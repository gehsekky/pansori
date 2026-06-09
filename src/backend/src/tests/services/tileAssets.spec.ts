// Catalog ↔ disk guard: every TERRAIN_TILES / MARKER_TILES family must
// have all its painted variants on disk, and the FROSTBOUND-style recolor
// ids must point at real bases. Catches an import typo (a catalog entry
// whose PNG was never copied, or a variant count past the files) before
// it ships as a broken <img> on the overworld.
//
// The painted tiles/markers live in the private overlay (pansori-assets) and
// are gitignored here, so a fresh checkout (CI, free tier) has no /art/tiles
// or /art/markers. These disk guards only apply when the overlay is synced
// (locally via `npm run sync-assets`, or a painted build) — they SKIP without
// it. The pure-catalog test below always runs.

import { MARKER_TILES, TERRAIN_TILES } from '../../shared-types.js';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const ART = fileURLToPath(new URL('../../../../frontend/public/art', import.meta.url));
// Overlay present ⇒ the gated painted dirs exist (sync-assets creates them only
// when copying the overlay in; absent ⇒ free tier / CI, skip the disk guards).
const PAINTED_PRESENT = existsSync(`${ART}/tiles`) && existsSync(`${ART}/markers`);

describe('tile catalogs resolve to files on disk', () => {
  it.skipIf(!PAINTED_PRESENT)(
    'every TERRAIN_TILES family has all variants under /art/tiles',
    () => {
      const missing: string[] = [];
      for (const [id, spec] of Object.entries(TERRAIN_TILES)) {
        const variants = (spec as { variants?: number }).variants ?? 1;
        for (let n = 1; n <= variants; n++) {
          const rel = `tiles/${spec.base}_${n}.png`;
          if (!existsSync(`${ART}/${rel}`)) missing.push(`${id} → ${rel}`);
        }
      }
      expect(missing).toEqual([]);
    }
  );

  it.skipIf(!PAINTED_PRESENT)(
    'every MARKER_TILES family has all variants under /art/markers',
    () => {
      const missing: string[] = [];
      for (const [id, spec] of Object.entries(MARKER_TILES)) {
        const variants = (spec as { variants?: number }).variants ?? 1;
        for (let n = 1; n <= variants; n++) {
          const rel = `markers/${spec.base}_${n}.png`;
          if (!existsSync(`${ART}/${rel}`)) missing.push(`${id} → ${rel}`);
        }
      }
      expect(missing).toEqual([]);
    }
  );

  it('the Cold Lands import landed: cold biomes + the upgraded snow/road families', () => {
    expect(TERRAIN_TILES.snow.variants).toBe(4);
    expect(TERRAIN_TILES['road-cold'].variants).toBe(4);
    for (const id of [
      'plains-cold',
      'plains-snow',
      'forest-pine',
      'forest-snow',
      'hills-cold',
      'hills-snow',
      'mountain-snow',
    ])
      expect(TERRAIN_TILES[id as keyof typeof TERRAIN_TILES], id).toBeDefined();
    // The FROSTBOUND recolor ids now draw REAL paintings — no CSS filter.
    for (const id of ['plains-tundra', 'forest-frost', 'hills-frost', 'water-ice'])
      expect(
        (TERRAIN_TILES[id as keyof typeof TERRAIN_TILES] as { filter?: string }).filter,
        id
      ).toBeUndefined();
    // Cold location markers.
    for (const id of ['ice-palace', 'frozen-ruins', 'logging-camp', 'ice-cave', 'frozen-giant'])
      expect(MARKER_TILES[id as keyof typeof MARKER_TILES], id).toBeDefined();
  });
});
