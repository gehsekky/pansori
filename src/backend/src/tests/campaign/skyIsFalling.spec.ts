// Campaign-integrity guards for The Sky Is Falling — catching the class of
// silent, game-breaking content bugs the first playtest hit:
//   1. A wall of impassable terrain that strands sites (a full-width water row
//      walled Miller's Thicket / Vane's camp off from the hub — "No path there",
//      and the main quest could never complete).
//   2. The store_flip rule's enemy-id list drifting from the room's rat count
//      (clear the rats, but the shop never opens).
// These assert over the authored fixture, so a future edit that reintroduces
// either bug fails here instead of in someone's playthrough.

import type { CampaignRegion, CampaignRoom } from '../../services/campaignContent.js';
import { describe, expect, it } from 'vitest';
import type { GameRule } from '../../types.js';
import { REGIONS } from '../../campaignData/skyIsFalling/regions.js';
import { ROOMS } from '../../campaignData/skyIsFalling/rooms.js';
import { RULES } from '../../campaignData/skyIsFalling/rules.js';
import { TERRAIN } from '../../types.js';

// BFS over the region's passable cells (overland `water`/`mountain` etc. block;
// an unknown cosmetic type is treated passable, matching the engine guard).
function reachableCells(region: CampaignRegion): Set<string> {
  const h = region.grid.length;
  const w = region.grid[0]?.length ?? 0;
  const passable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const t = region.grid[y]?.[x]?.t;
    return t ? (TERRAIN[t as keyof typeof TERRAIN]?.passable ?? true) : true;
  };
  const seen = new Set<string>();
  const start = region.startPos;
  if (!passable(start.x, start.y)) return seen; // start itself walled → nothing reachable
  const queue: Array<{ x: number; y: number }> = [start];
  seen.add(`${start.x},${start.y}`);
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (passable(nx, ny) && !seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

describe('The Sky Is Falling — region navigability', () => {
  it('every region site is reachable from the start position (no terrain wall strands a site)', () => {
    for (const region of REGIONS as CampaignRegion[]) {
      const reachable = reachableCells(region);
      for (const site of region.sites ?? []) {
        expect(
          reachable.has(`${site.pos.x},${site.pos.y}`),
          `site "${site.id}" at (${site.pos.x},${site.pos.y}) is unreachable from start in region "${region.id}"`
        ).toBe(true);
      }
    }
  });
});

describe('The Sky Is Falling — store_flip rule integrity', () => {
  it('the store_flip rule lists exactly one id per Giant Rat in store_room', () => {
    const store = (ROOMS as CampaignRoom[]).find((r) => r.id === 'store_room');
    const ratCount = store?.enemies?.find((e) => e.name === 'Giant Rat')?.count ?? 0;
    expect(ratCount).toBeGreaterThan(0);

    const flip = (RULES as GameRule[]).find((r) => r.name === 'store_flip');
    const conds = (flip?.conditions as { all?: Array<{ value?: unknown }> })?.all ?? [];
    const ratIds = conds
      .map((c) => c.value)
      .filter((v): v is string => typeof v === 'string' && v.startsWith('store_room#'));

    // One condition per spawned rat, and they're the positional ids #0..#(n-1).
    expect(ratIds.sort()).toEqual(
      Array.from({ length: ratCount }, (_, i) => `store_room#${i}`).sort()
    );
  });
});
