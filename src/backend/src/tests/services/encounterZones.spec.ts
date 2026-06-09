// Painted intra-region encounter zones — the SOLE source of random wilderness
// encounters. Each zone is self-contained: tier + chance + creature table,
// painted onto squares. A square outside every zone never rolls. Covers the
// resolution (dbRegionsToEngine), the runtime roll, and the save-time schema.

import type { CampaignData, GameState } from '../../types.js';
import {
  type CampaignRegion,
  type CampaignRegionCell,
  dbRegionsToEngine,
} from '../../services/campaignContent.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encounterEntryWeight,
  pickWeightedEncounter,
  resolveMarkerMove,
} from '../../services/mapEngine.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';

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
      encounterZones: [
        {
          id: 'north',
          name: 'Frozen North',
          tier: 1,
          encounterChance: 0.5,
          encounterTable: ['Frost Wolf'],
        },
        {
          id: 'ghost',
          name: 'Empty Zone',
          tier: 2,
          encounterChance: 0.3,
          encounterTable: ['Wraith'],
        }, // no cells
      ],
    };
    const [engine] = dbRegionsToEngine([region]);
    expect(engine.encounterZones).toHaveLength(1); // "ghost" dropped (no painted cells)
    const z = engine.encounterZones![0];
    expect(z.id).toBe('north');
    expect(z.name).toBe('Frozen North');
    expect(z.tier).toBe(1);
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
        encounterZones: [
          {
            id: 'north',
            name: 'Frozen North',
            tier: 1,
            encounterChance: 0.5,
            encounterTable: ['Frost Wolf'],
            cells: [{ x: 1, y: 0 }], // only the square at (1,0)
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

describe('resolveMarkerMove — encounters come only from zones', () => {
  it('a square inside a zone rolls from the zone’s table', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < chance → encounter on the first cell
    const r = resolveMarkerMove(valeCampaign(), [], start(), { x: 1, y: 0 });
    expect(r.encounter).toBe('Frost Wolf'); // (1,0) is in the "north" zone
  });

  it('a square outside every zone never rolls (no region fallback)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = resolveMarkerMove(valeCampaign(), [], start(), { x: 0, y: 1 });
    expect(r.encounter).toBeUndefined(); // (0,1) is unzoned → no encounter
  });

  it('picks weight-proportionally from a {name, weight} table', () => {
    // A zone weighted 1 Goblin : 3 Orc (total 4). resolveMarkerMove draws
    // Math.random() twice on the triggering square: the chance check, then the
    // selection. Script the selection draw to land in each creature's band.
    const weighted = () => {
      const c = valeCampaign();
      c.regions![0].encounterZones![0].encounterTable = ['Goblin', { name: 'Orc', weight: 3 }];
      return c;
    };
    // selection draw 0.5 → 0.5*4 = 2.0 → past Goblin's weight 1 → Orc.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5);
    expect(resolveMarkerMove(weighted(), [], start(), { x: 1, y: 0 }).encounter).toBe('Orc');
    // selection draw 0.1 → 0.4 → within Goblin's weight 1 → Goblin.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.1);
    expect(resolveMarkerMove(weighted(), [], start(), { x: 1, y: 0 }).encounter).toBe('Goblin');
  });
});

describe('pickWeightedEncounter', () => {
  it('a bare string weighs 1; an explicit weight floors at 1', () => {
    expect(encounterEntryWeight('Goblin')).toBe(1);
    expect(encounterEntryWeight({ name: 'Orc', weight: 5 })).toBe(5);
    // Defensive: 0 / negative / non-finite never zero out a creature.
    expect(encounterEntryWeight({ name: 'X', weight: 0 })).toBe(1);
    expect(encounterEntryWeight({ name: 'X', weight: -4 })).toBe(1);
    expect(encounterEntryWeight({ name: 'X', weight: NaN })).toBe(1);
  });

  it('an all-string table reduces to a uniform pick', () => {
    const table = ['A', 'B', 'C'];
    expect(pickWeightedEncounter(table, 0)).toBe('A'); // [0, 1) → A
    expect(pickWeightedEncounter(table, 0.5)).toBe('B'); // [1, 2) → B
    expect(pickWeightedEncounter(table, 0.9)).toBe('C'); // [2, 3) → C
  });

  it('walks the weight bands in order (total weight scales the draw)', () => {
    const table = ['A', { name: 'B', weight: 3 }]; // bands: A=[0,1), B=[1,4), total 4
    expect(pickWeightedEncounter(table, 0)).toBe('A'); // 0.0
    expect(pickWeightedEncounter(table, 0.2)).toBe('A'); // 0.8 < 1 → A
    expect(pickWeightedEncounter(table, 0.25)).toBe('B'); // 1.0 → B
    expect(pickWeightedEncounter(table, 0.99)).toBe('B'); // ~3.96 → B
  });

  it('returns the last entry when the draw rounds to the total (fp guard)', () => {
    expect(pickWeightedEncounter(['A', 'B'], 1)).toBe('B'); // rnd=1 → r never < 0 mid-loop
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
  encounterZones: [
    {
      id: 'north',
      name: 'Frozen North',
      tier: 1,
      encounterChance: 0.1,
      encounterTable: ['Goblin'],
    },
  ],
  ...over,
});

describe('RegionsSchema — encounter zones', () => {
  const schema = CAMPAIGN_SECTION_SCHEMAS.regions;

  it('accepts a region whose cell `ez` references a declared zone', () => {
    expect(schema.safeParse([baseRegion()]).success).toBe(true);
  });

  it('accepts a mixed bare-name / {name, weight} table', () => {
    const ok = baseRegion({
      encounterZones: [
        {
          id: 'north',
          name: 'A',
          tier: 1,
          encounterChance: 0.1,
          encounterTable: ['Goblin', { name: 'Orc', weight: 4 }],
        },
      ],
    });
    expect(schema.safeParse([ok]).success).toBe(true);
  });

  it('rejects a non-integer / out-of-range / zero weight', () => {
    const bad = (weight: unknown) =>
      baseRegion({
        encounterZones: [
          {
            id: 'north',
            name: 'A',
            tier: 1,
            encounterChance: 0.1,
            encounterTable: [{ name: 'Orc', weight }],
          },
        ],
      });
    expect(schema.safeParse([bad(0)]).success).toBe(false);
    expect(schema.safeParse([bad(1.5)]).success).toBe(false);
    expect(schema.safeParse([bad(100)]).success).toBe(false);
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
        { id: 'north', name: 'A', tier: 1, encounterChance: 0.1, encounterTable: ['Goblin'] },
        { id: 'north', name: 'B', tier: 2, encounterChance: 0.1, encounterTable: ['Orc'] },
      ],
    });
    expect(schema.safeParse([bad]).success).toBe(false);
  });

  it('requires a zone tier (and chance), and rejects out-of-range tiers', () => {
    const noTier = baseRegion({
      encounterZones: [
        { id: 'north', name: 'A', encounterChance: 0.1, encounterTable: ['Goblin'] },
      ],
    });
    expect(schema.safeParse([noTier]).success).toBe(false);
    const noChance = baseRegion({
      encounterZones: [{ id: 'north', name: 'A', tier: 1, encounterTable: ['Goblin'] }],
    });
    expect(schema.safeParse([noChance]).success).toBe(false);
    const tier5 = baseRegion({
      encounterZones: [
        { id: 'north', name: 'A', tier: 5, encounterChance: 0.1, encounterTable: ['Goblin'] },
      ],
    });
    expect(schema.safeParse([tier5]).success).toBe(false);
  });
});
