// Catalog ↔ disk guard: every TERRAIN_TILES / MARKER_TILES family must
// have all its painted variants on disk, and the FROSTBOUND-style recolor
// ids must point at real bases. Catches an import typo (a catalog entry
// whose PNG was never copied, or a variant count past the files) before
// it ships as a broken <img> on the overworld.

import { MARKER_TILES, TERRAIN_TILES } from '../../shared-types.js';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const ART = fileURLToPath(new URL('../../../../frontend/public/art', import.meta.url));

describe('tile catalogs resolve to files on disk', () => {
  it('every TERRAIN_TILES family has all variants under /art/tiles', () => {
    const missing: string[] = [];
    for (const [id, spec] of Object.entries(TERRAIN_TILES)) {
      const variants = (spec as { variants?: number }).variants ?? 1;
      for (let n = 1; n <= variants; n++) {
        const rel = `tiles/${spec.base}_${n}.png`;
        if (!existsSync(`${ART}/${rel}`)) missing.push(`${id} → ${rel}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every MARKER_TILES family has all variants under /art/markers', () => {
    const missing: string[] = [];
    for (const [id, spec] of Object.entries(MARKER_TILES)) {
      const variants = (spec as { variants?: number }).variants ?? 1;
      for (let n = 1; n <= variants; n++) {
        const rel = `markers/${spec.base}_${n}.png`;
        if (!existsSync(`${ART}/${rel}`)) missing.push(`${id} → ${rel}`);
      }
    }
    expect(missing).toEqual([]);
  });

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
