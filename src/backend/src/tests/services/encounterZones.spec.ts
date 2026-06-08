// Painted intra-region encounter zones (SRD-flavored wilderness): a region's
// grid can hold non-overlapping sub-areas, each rolling its own creature table.
// Covers the resolution (dbRegionsToEngine), the runtime roll (resolveMarkerMove
// reads the zone's pool with region fallback), and the save-time schema.

import type { CampaignData, GameState } from '../../types.js';
import {
  type CampaignRegion,
  type CampaignRegionCell,
  dbRegionsToEngine,
} from '../../services/campaignContent.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { resolveMarkerMove } from '../../services/mapEngine.js';

afterEach(() => vi.restoreAllMocks());

const cell = (t: string, ez?: string): CampaignRegionCell => (ez ? { t, ez } : { t });

describe('dbRegionsToEngine — encounter zones', () => {
  it('materializes each zone’s cells from the grid `ez` tags and drops empty zones', () => {
    const region: CampaignRegion = {
      id: 'vale',
      name: 'The Vale',
      isStartingRegion: true,
      feetPerSquare: 5280,
      // one row, three columns: (0,0) + (1,0) in zone "north"; (2,0) unzoned.
      grid: [[cell('plains', 'north'), cell('plains', 'north'), cell('plains')]],
      startPos: { x: 0, y: 0 },
      encounterTable: ['Bandit'],
      encounterChance: 0.2,
      encounterZones: [
        { id: 'north', name: 'Frozen North', encounterChance: 0.5, encounterTable: ['Frost Wolf'] },
        { id: 'ghost', name: 'Empty Zone', encounterTable: ['Wraith'] }, // no painted cells
      ],
    };
    const [engine] = dbRegionsToEngine([region]);
    expect(engine.encounterTable).toEqual(['Bandit']); // region fallback preserved
    expect(engine.encounterZones).toHaveLength(1); // "ghost" dropped (no cells)
    const z = engine.encounterZones![0];
    expect(z.id).toBe('north');
    expect(z.name).toBe('Frozen North');
    expect(z.encounterChance).toBe(0.5);
    expect(z.encounterTable).toEqual(['Frost Wolf']);
    expect(z.cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });
});

// ── Runtime roll ────────────────────────────────────────────────────────────
function valeCampaign(): CampaignData {
  return {
    world_name: 'Z',
    intro: '',
    rooms: [],
    regions: [
      {
        id: 'reg1',
        name: 'The Vale',
        feetPerSquare: 5280,
        gridWidth: 4,
        gridHeight: 4,
        startPos: { x: 0, y: 0 },
        sites: [],
        encounterChance: 0.5,
        encounterTable: ['Bandit'], // region fallback pool
        encounterZones: [
          {
            id: 'north',
            name: 'Frozen North',
            encounterTable: ['Frost Wolf'],
            cells: [{ x: 1, y: 0 }], // the square at (1,0) only
          },
        ],
      },
    ],
  } as unknown as CampaignData;
}

const start = (): GameState =>
  ({
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x: 0, y: 0 },
    visited_rooms: [],
  }) as unknown as GameState;

describe('resolveMarkerMove — zone vs region encounter pool', () => {
  it('a square inside a zone rolls from the zone’s table', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < chance → encounter on the first cell
    const r = resolveMarkerMove(valeCampaign(), [], start(), { x: 1, y: 0 });
    expect(r.encounter).toBe('Frost Wolf'); // (1,0) is in the "north" zone
  });

  it('a square outside every zone falls back to the region table', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // (0,1) is not painted into any zone → the region-level pool.
    const r = resolveMarkerMove(valeCampaign(), [], start(), { x: 0, y: 1 });
    expect(r.encounter).toBe('Bandit');
  });
});

// ── Save-time schema ─────────────────────────────────────────────────────────
const baseRegion = (over: Record<string, unknown> = {}) => ({
  id: 'vale',
  name: 'The Vale',
  isStartingRegion: true,
  feetPerSquare: 5280,
  grid: [
    [{ t: 'plains', ez: 'north' }, { t: 'plains' }],
    [{ t: 'plains' }, { t: 'plains' }],
  ],
  startPos: { x: 0, y: 0 },
  encounterZones: [{ id: 'north', name: 'Frozen North', encounterTable: ['Goblin'] }],
  ...over,
});

describe('RegionsSchema — encounter zones', () => {
  const schema = CAMPAIGN_SECTION_SCHEMAS.regions;

  it('accepts a region whose cell `ez` references a declared zone', () => {
    expect(schema.safeParse([baseRegion()]).success).toBe(true);
  });

  it('rejects a cell `ez` that points at an unknown zone', () => {
    const bad = baseRegion({
      grid: [
        [{ t: 'plains', ez: 'nowhere' }, { t: 'plains' }],
        [{ t: 'plains' }, { t: 'plains' }],
      ],
    });
    expect(schema.safeParse([bad]).success).toBe(false);
  });

  it('rejects duplicate zone ids', () => {
    const bad = baseRegion({
      encounterZones: [
        { id: 'north', name: 'A', encounterTable: ['Goblin'] },
        { id: 'north', name: 'B', encounterTable: ['Orc'] },
      ],
    });
    expect(schema.safeParse([bad]).success).toBe(false);
  });
});
