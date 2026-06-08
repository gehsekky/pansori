// DB-first context resolution — the merge rules that bridge DB-authored
// campaign content and the campaignData/ code folders: DB top-level fields
// win, code fills the rest, the merge is shallow (whole-section replace),
// protected fields and malformed overlays are ignored. Regions and towns
// live in their own tables (campaign_regions, campaign_towns); everything
// else in campaigns.data.

import {
  type CampaignRegion,
  type CampaignRegionCell,
  type CampaignRoom,
  type CampaignTown,
  EDITABLE_SECTIONS,
  applyCampaignOverlays,
  dbRegionsToEngine,
  dbRoomsToEngine,
  dbTownsToEngine,
  deleteCampaignSection,
  getCampaignData,
  getCampaignRegions,
  getCampaignRooms,
  getCampaignTowns,
  getDbSection,
  isEditableSection,
  mergeContextWithOverlay,
  putCampaignSection,
  refreshCampaignOverlay,
} from '../../services/campaignContent.js';
import { SRD_ITEMS, SRD_MONSTERS } from '../../campaignData/srd/index.js';
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import type { Context } from '../../types.js';
import type { Pool } from 'pg';
import { context as shippedCtx } from '../fixtures/testContext.js';

function codeCtx(partial: Partial<Context> & { id: string }): Context {
  return partial as Context;
}

// Stateful fake of the campaigns + campaign_regions tables. One dispatcher
// serves pool.query AND client.query (putCampaignRegions runs a
// transaction via pool.connect).
function makeContentDb(initial: {
  campaigns?: Record<string, unknown>;
  regions?: Record<string, unknown[][]>; // campaignId → rows as insert-param tuples (sans campaign_id)
}) {
  const campaigns = new Map(Object.entries(initial.campaigns ?? {}));
  // Stored as the insert params after campaign_id: [id, sort_order, name,
  // is_starting_region, description, on_enter, feet_per_square, grid,
  // start_x, start_y, encounter_chance, base_tier, on_first_enter,
  // on_exit, on_first_exit]
  const regions = new Map<string, unknown[][]>(Object.entries(initial.regions ?? {}));
  // campaignId → site insert params after campaign_id: [region_id, id,
  // sort_order, name, pos_x, pos_y, kind, town_id, entry_room_id,
  // description, on_enter, icon]
  const sites = new Map<string, unknown[][]>();
  // campaignId → town insert params after campaign_id: [id, sort_order,
  // name, description, feet_per_square, gridJson, start_x, start_y, floor,
  // on_enter, on_first_enter, on_exit, on_first_exit]
  const towns = new Map<string, unknown[][]>();
  // campaignId → venue insert params after campaign_id: [town_id, id,
  // sort_order, name, pos_x, pos_y, kind, entry_room_id, description]
  const venues = new Map<string, unknown[][]>();
  // campaignId → room insert params after campaign_id: [id, sort_order,
  // name, description, feet_per_square, gridJson, entry_x, entry_y,
  // exitsJson, lighting, floor, can_rest, enemiesJson, lootJson, npcsJson,
  // on_enter, on_first_enter, on_exit, on_first_exit, objectsJson, trapJson]
  const rooms = new Map<string, unknown[][]>();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM campaigns')) {
      const hit = campaigns.has(params[0] as string);
      return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
    }
    if (sql.includes('SELECT data FROM campaigns')) {
      const data = campaigns.get(params[0] as string);
      return { rows: data !== undefined ? [{ data }] : [], rowCount: data !== undefined ? 1 : 0 };
    }
    if (sql.includes('SELECT id FROM campaigns')) {
      const rows = [...campaigns.keys()].map((id) => ({ id }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('jsonb_set')) {
      const data = campaigns.get(params[0] as string) as Record<string, unknown> | undefined;
      if (data) data[params[1] as string] = JSON.parse(params[2] as string);
      return { rows: [], rowCount: data ? 1 : 0 };
    }
    if (sql.includes('data - $2')) {
      const data = campaigns.get(params[0] as string) as Record<string, unknown> | undefined;
      if (data) delete data[params[1] as string];
      return { rows: [], rowCount: data ? 1 : 0 };
    }
    if (sql.includes('FROM campaign_region_sites') && sql.includes('SELECT')) {
      const list = [...(sites.get(params[0] as string) ?? [])].sort((a, b) =>
        a[0] === b[0] ? (a[2] as number) - (b[2] as number) : String(a[0]) < String(b[0]) ? -1 : 1
      );
      const rows = list.map((p) => ({
        region_id: p[0],
        id: p[1],
        sort_order: p[2],
        name: p[3],
        pos_x: p[4],
        pos_y: p[5],
        kind: p[6],
        town_id: p[7],
        entry_room_id: p[8],
        description: p[9],
        on_enter: p[10],
        icon: p[11],
        target_region_id: p[12] ?? null,
        entry_x: p[13] ?? null,
        entry_y: p[14] ?? null,
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('INSERT INTO campaign_region_sites')) {
      const [campaignId, ...rest] = params;
      const list = sites.get(campaignId as string) ?? [];
      list.push(rest);
      sites.set(campaignId as string, list);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM campaign_town_venues') && sql.includes('SELECT')) {
      const list = [...(venues.get(params[0] as string) ?? [])].sort((a, b) =>
        a[0] === b[0] ? (a[2] as number) - (b[2] as number) : String(a[0]) < String(b[0]) ? -1 : 1
      );
      const rows = list.map((p) => ({
        town_id: p[0],
        id: p[1],
        sort_order: p[2],
        name: p[3],
        pos_x: p[4],
        pos_y: p[5],
        kind: p[6],
        entry_room_id: p[7],
        description: p[8],
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('INSERT INTO campaign_town_venues')) {
      const [campaignId, ...rest] = params;
      const list = venues.get(campaignId as string) ?? [];
      list.push(rest);
      venues.set(campaignId as string, list);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM campaign_rooms')) {
      rooms.delete(params[0] as string);
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_rooms')) {
      const [campaignId, ...rest] = params;
      const list = rooms.get(campaignId as string) ?? [];
      list.push(rest);
      rooms.set(campaignId as string, list);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM campaign_rooms') && sql.includes('SELECT')) {
      const list = [...(rooms.get(params[0] as string) ?? [])].sort(
        (a, b) => (a[1] as number) - (b[1] as number)
      );
      const rows = list.map((p) => ({
        id: p[0],
        sort_order: p[1],
        name: p[2],
        description: p[3],
        grid: JSON.parse(p[4] as string),
        entry_x: p[5],
        entry_y: p[6],
        exits: JSON.parse(p[7] as string),
        lighting: p[8],
        floor: p[9],
        can_rest: p[10],
        enemies: JSON.parse(p[11] as string),
        loot: JSON.parse(p[12] as string),
        npcs: JSON.parse(p[13] as string),
        on_enter: p[14],
        on_first_enter: p[15],
        on_exit: p[16],
        on_first_exit: p[17],
        objects: JSON.parse(p[18] as string),
        trap: p[19] === null ? null : JSON.parse(p[19] as string),
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('DELETE FROM campaign_towns')) {
      towns.delete(params[0] as string);
      venues.delete(params[0] as string); // FK cascade
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_towns')) {
      const [campaignId, ...rest] = params;
      const list = towns.get(campaignId as string) ?? [];
      list.push(rest);
      towns.set(campaignId as string, list);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM campaign_towns') && sql.includes('SELECT')) {
      const list = [...(towns.get(params[0] as string) ?? [])].sort(
        (a, b) => (a[1] as number) - (b[1] as number)
      );
      const rows = list.map((p) => ({
        id: p[0],
        sort_order: p[1],
        name: p[2],
        description: p[3],
        feet_per_square: p[4],
        grid: JSON.parse(p[5] as string),
        start_x: p[6],
        start_y: p[7],
        floor: p[8],
        on_enter: p[9],
        on_first_enter: p[10],
        on_exit: p[11],
        on_first_exit: p[12],
      }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM campaign_regions') && sql.includes('SELECT')) {
      const list = [...(regions.get(params[0] as string) ?? [])].sort(
        (a, b) => (a[1] as number) - (b[1] as number)
      );
      const rows = list.map((p) => ({
        id: p[0],
        sort_order: p[1],
        name: p[2],
        is_starting_region: p[3],
        description: p[4],
        on_enter: p[5],
        feet_per_square: p[6],
        grid: JSON.parse(p[7] as string), // pg parses jsonb on read
        start_x: p[8],
        start_y: p[9],
        encounter_chance: p[10],
        base_tier: p[11],
        on_first_enter: p[12],
        on_exit: p[13],
        on_first_exit: p[14],
        encounter_table: p[15] !== undefined ? JSON.parse(p[15] as string) : [],
        encounter_zones: p[16] !== undefined ? JSON.parse(p[16] as string) : [],
      }));
      return { rows, rowCount: rows.length };
    }
    if (
      sql.includes('FROM campaign_custom_items') ||
      sql.includes('FROM campaign_custom_monsters') ||
      sql.includes('FROM items') ||
      sql.includes('FROM monsters')
    ) {
      // Catalogs / customs aren't exercised through this fake — overlay
      // composition just needs the queries to resolve empty.
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('DELETE FROM campaign_regions')) {
      regions.delete(params[0] as string);
      sites.delete(params[0] as string); // FK cascade
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO campaign_regions')) {
      const [campaignId, ...rest] = params;
      const list = regions.get(campaignId as string) ?? [];
      list.push(rest);
      regions.set(campaignId as string, list);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake content db: unhandled query: ${sql.split('\n')[0]}`);
  });

  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as Pool;
  return { pool, campaigns, regions };
}

// Uniform dense grid builder: h rows of w cells of one terrain type.
const G = (w: number, h: number, t = 'plains'): CampaignRegionCell[][] =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => ({ t })));

const REGION_A: CampaignRegion = {
  id: 'malgovia',
  name: 'Malgovia',
  isStartingRegion: true,
  desc: 'A mist-shrouded vale.',
  feetPerSquare: 5280,
  grid: G(12, 10),
  startPos: { x: 3, y: 4 },
};

const REGION_B: CampaignRegion = {
  id: 'frost-reach',
  name: 'The Frost Reach',
  isStartingRegion: false,
  feetPerSquare: 5280,
  grid: G(8, 8, 'snow'),
  startPos: { x: 0, y: 0 },
};

const TOWN_A: CampaignTown = {
  id: 'oakvale',
  name: 'Oakvale',
  desc: 'A timber town under the old oak.',
  onEnter: 'Mud streets, woodsmoke, talk that stops as you pass.',
  onFirstEnter: 'Oakvale at last — the palisade gates stand open.',
  onExit: 'The gates creak shut behind you.',
  onFirstExit: 'You leave Oakvale for the first time, supplies heavier.',
  feetPerSquare: 25,
  grid: G(10, 8),
  startPos: { x: 1, y: 1 },
  venues: [
    { id: 'gate', name: 'Town Gate', pos: { x: 0, y: 1 }, kind: 'gate' },
    {
      id: 'tavern',
      name: 'The Split Acorn',
      pos: { x: 4, y: 3 },
      kind: 'interior',
      entryRoomId: 'acorn-taproom',
      desc: 'Lamplight and the smell of cider.',
    },
  ],
  floor: 'dirt',
};

const TOWN_B: CampaignTown = {
  id: 'milldale',
  name: 'Milldale',
  feetPerSquare: 25,
  grid: G(6, 6),
  startPos: { x: 0, y: 0 },
};

// Room grids: cells are {t?, m?} — bare {} = floor, no paint, no mechanics.
const RG = (w: number, h: number): Array<Array<Record<string, unknown>>> =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => ({})));

const ROOM_A: CampaignRoom = {
  id: 'taproom',
  name: 'The Taproom',
  desc: 'Lamplight, low beams, and the smell of cider.',
  grid: (() => {
    const g = RG(8, 6);
    g[0][3] = { m: 'obstacle' }; // the bar
    g[2][2] = { t: 'water', m: 'swim' }; // a leaky cellar pool
    g[4][5] = { m: 'cover' };
    return g as CampaignRoom['grid'];
  })(),
  entryPos: { x: 0, y: 2 },
  exits: [
    { pos: { x: 7, y: 2 }, toRoomId: 'cellar', entrancePos: { x: 0, y: 0 }, label: 'Stairs down' },
    { pos: { x: 0, y: 5 }, ascends: true, label: 'Door' },
  ],
  lighting: 'dim',
  floor: 'cobblestone',
  canRest: true,
  onEnter: 'The taproom hum dips as you enter.',
  onFirstEnter: 'Every head turns — strangers are rare here.',
  onExit: 'The door swings shut behind you.',
  onFirstExit: 'Hob calls after you: "mind the cellar!"',
  enemies: [{ name: 'Goblin', count: 2 }, { name: 'Wolf' }],
  loot: [{ itemId: 'dagger', pos: { x: 1, y: 1 } }, { itemId: 'rope' }],
  objects: [
    {
      id: 'barrel-cache',
      name: 'Tapped Barrel',
      interactText: 'Mostly dregs.',
      searchDC: 12,
      lootIds: ['dagger'],
      pos: { x: 6, y: 1 },
    },
  ],
  trap: {
    name: 'Loose Step',
    dc: 12,
    damage: '1d6',
    damageType: 'bludgeoning',
    condition: 'prone',
  },
  npcs: [
    {
      id: 'old-hob',
      name: 'Old Hob',
      attitude: 'friendly',
      greeting: 'Mind the third step, it bites.',
      pos: { x: 4, y: 1 },
      icon: 'beer-stein',
      responses: [
        { label: 'Ask about the cellar', reply: 'Rats. Big ones.' },
        { label: 'Just nod', responses: [{ label: 'Leave', reply: 'Aye.' }] },
      ],
      shop: [{ itemId: 'rope', price: 1 }],
    },
  ],
};

const ROOM_B: CampaignRoom = {
  id: 'cellar',
  name: 'The Cellar',
  desc: 'Cold stone and old barrels.',
  grid: RG(4, 4) as CampaignRoom['grid'],
  entryPos: { x: 0, y: 0 },
};

describe('mergeContextWithOverlay', () => {
  const code = codeCtx({
    id: 'malgovia',
    displayNoun: 'vale',
    classHitDie: { fighter: 10 },
    narratives: { genericArrival: ['from code'] } as never,
  });

  it('DB fields win, code fills the rest', () => {
    const merged = mergeContextWithOverlay(code, {
      narratives: { genericArrival: ['from db'] },
    });
    expect((merged.narratives as { genericArrival: string[] }).genericArrival).toEqual(['from db']);
    // Untouched sections still come from code.
    expect(merged.classHitDie).toEqual({ fighter: 10 });
    expect(merged.displayNoun).toBe('vale');
  });

  it('replaces a section wholesale (shallow, not deep, merge)', () => {
    const merged = mergeContextWithOverlay(code, { classHitDie: { wizard: 6 } });
    expect(merged.classHitDie).toEqual({ wizard: 6 });
  });

  it('never overrides protected fields and skips null values', () => {
    const merged = mergeContextWithOverlay(code, { id: 'evil-rename', displayNoun: null });
    expect(merged.id).toBe('malgovia');
    expect(merged.displayNoun).toBe('vale');
  });

  it('does not mutate the code context', () => {
    mergeContextWithOverlay(code, { displayNoun: 'changed' });
    expect(code.displayNoun).toBe('vale');
  });
});

describe('editable sections registry', () => {
  it('stays in lockstep with the per-section schemas', () => {
    expect([...EDITABLE_SECTIONS].sort()).toEqual(Object.keys(CAMPAIGN_SECTION_SCHEMAS).sort());
    expect(isEditableSection('narratives')).toBe(true);
    expect(isEditableSection('customMonsters')).toBe(true);
    // The composed engine fields are not directly editable — customs are.
    expect(isEditableSection('lootTable')).toBe(false);
    expect(isEditableSection('enemyTemplates')).toBe(false);
  });

  it('narratives schema accepts a shipped campaign narratives block', () => {
    // Regression guard: if the Context narratives shape grows a field the
    // schema doesn't know, a GET→PUT round trip in the editor would 400.
    const result = CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse(shippedCtx.narratives);
    expect(result.success, JSON.stringify(result.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('lootTable schema accepts every SRD catalog item and a shipped loot table', () => {
    // The whole catalog must round-trip — this is what the editor serves.
    const catalog = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(catalog.success, JSON.stringify(catalog.error?.issues?.slice(0, 3))).toBe(true);
    const loot = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(shippedCtx.lootTable);
    expect(loot.success, JSON.stringify(loot.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('enemyTemplates schema accepts the whole SRD bestiary and a shipped template set', () => {
    const bestiary = CAMPAIGN_SECTION_SCHEMAS.customMonsters.safeParse(Object.values(SRD_MONSTERS));
    expect(bestiary.success, JSON.stringify(bestiary.error?.issues?.slice(0, 3))).toBe(true);
    const campaign = CAMPAIGN_SECTION_SCHEMAS.customMonsters.safeParse(shippedCtx.enemyTemplates);
    expect(campaign.success, JSON.stringify(campaign.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('enemyTemplates schema rejects duplicates, unknown fields, and bad nested shapes', () => {
    const schema = CAMPAIGN_SECTION_SCHEMAS.customMonsters;
    const bandit = SRD_MONSTERS.bandit;
    expect(schema.safeParse([bandit, bandit]).success).toBe(false); // dup name
    expect(schema.safeParse([{ ...bandit, sneer: true }]).success).toBe(false); // unknown field
    expect(schema.safeParse([{ ...bandit, onHitEffect: { condition: 'sleepy' } }]).success).toBe(
      false
    ); // unknown condition
    expect(
      schema.safeParse([
        {
          ...bandit,
          phases: [{ hpPct: 0.5, name: 'P', narrative: 'x', effects: [{ kind: 'explode' }] }],
        },
      ]).success
    ).toBe(false); // unknown phase effect kind
    expect(schema.safeParse([]).success).toBe(false);
  });

  it('lootTable schema rejects duplicates, unknown fields, and off-enum values', () => {
    const loot = CAMPAIGN_SECTION_SCHEMAS.customItems;
    const dagger = SRD_ITEMS.dagger;
    expect(loot.safeParse([dagger, dagger]).success).toBe(false);
    expect(loot.safeParse([{ ...dagger, zappiness: 9 }]).success).toBe(false);
    expect(loot.safeParse([{ ...dagger, mastery: 'explode' }]).success).toBe(false);
    expect(loot.safeParse([{ ...dagger, slot: 'belt' }]).success).toBe(false);
    expect(
      loot.safeParse([{ ...dagger, wornEffects: [{ kind: 'fly_speed', feet: 30 }] }]).success
    ).toBe(false);
    expect(loot.safeParse([]).success).toBe(false);
  });

  it('narratives schema rejects off-shape values', () => {
    expect(CAMPAIGN_SECTION_SCHEMAS.narratives.safeParse({ genericArrival: 'nope' }).success).toBe(
      false
    );
  });

  // A minimal valid region — tests tweak single fields off this base.
  // (12x10 dense plains grid; dimensions derive from the array shape.)
  const region = (over: Record<string, unknown> = {}) => ({
    id: 'malgovia',
    name: 'Malgovia',
    isStartingRegion: true,
    feetPerSquare: 5280,
    grid: G(12, 10),
    startPos: { x: 3, y: 4 },
    ...over,
  });

  it('regions schema accepts a valid list with exactly one starting region', () => {
    const result = CAMPAIGN_SECTION_SCHEMAS.regions.safeParse([
      region({
        desc: 'A mist-shrouded vale.',
        onEnter: 'The mists part as you crest the ridge.',
        encounterZones: [
          { id: 'wilds', name: 'Wilds', tier: 1, encounterChance: 0.15, encounterTable: ['Wolf'] },
        ],
      }),
      region({ id: 'frost-reach', name: 'The Frost Reach', isStartingRegion: false }),
    ]);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('rooms schema accepts the fixtures; exits cross-validate against the payload', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const ok = rooms.safeParse([ROOM_A, ROOM_B]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // Rooms are LOCKED to the SRD 5-ft tactical scale — a feetPerSquare key
    // is rejected (it never did anything for combat anyway).
    expect(rooms.safeParse([{ ...ROOM_B, feetPerSquare: 10 }]).success).toBe(false);
    // An exit pointing at a room NOT in the payload is rejected.
    expect(rooms.safeParse([ROOM_A]).success).toBe(false); // 'cellar' missing
    // entrancePos must fit the TARGET room's grid (cellar is 4x4).
    const badEntrance = {
      ...ROOM_A,
      exits: [{ pos: { x: 7, y: 2 }, toRoomId: 'cellar', entrancePos: { x: 4, y: 0 } }],
    };
    expect(rooms.safeParse([badEntrance, ROOM_B]).success).toBe(false);
    // Exactly one of toRoomId | ascends.
    expect(
      rooms.safeParse([
        { ...ROOM_B, exits: [{ pos: { x: 0, y: 1 }, toRoomId: 'cellar', ascends: true }] },
      ]).success
    ).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, exits: [{ pos: { x: 0, y: 1 } }] }]).success).toBe(false);
    // Cell shape: unknown mech flag / unknown terrain / extra key / bad bounds.
    expect(rooms.safeParse([{ ...ROOM_B, grid: [[{ m: 'lava' }]] }]).success).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, grid: [[{ t: 'lava' }]] }]).success).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, grid: [[{ sticky: true }]] }]).success).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, entryPos: { x: 4, y: 0 } }]).success).toBe(false);
    // Duplicate ids and empty lists rejected.
    expect(rooms.safeParse([ROOM_B, { ...ROOM_B, name: 'Other' }]).success).toBe(false);
    expect(rooms.safeParse([]).success).toBe(false);
  });

  it('rooms schema validates objects + trap: shapes, bounds, room-unique ids', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const chest = {
      id: 'iron-chest',
      name: 'Iron Chest',
      searchDC: 13,
      lootIds: ['dagger'],
      pos: { x: 2, y: 2 },
    };
    const trap = { name: 'Dart Trap', dc: 12, damage: '1d4', damageType: 'piercing' };
    const ok = rooms.safeParse([{ ...ROOM_B, objects: [chest], trap }]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // Object: out-of-grid pos, dup ids in one room, extra key.
    expect(
      rooms.safeParse([{ ...ROOM_B, objects: [{ ...chest, pos: { x: 4, y: 0 } }] }]).success
    ).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, objects: [chest, chest] }]).success).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, objects: [{ ...chest, locked: true }] }]).success).toBe(
      false
    );
    // Trap: off-enum damage type / condition, missing mechanics.
    expect(rooms.safeParse([{ ...ROOM_B, trap: { ...trap, damageType: 'sarcasm' } }]).success).toBe(
      false
    );
    expect(
      rooms.safeParse([{ ...ROOM_B, trap: { ...trap, condition: 'faerie_fired' } }]).success
    ).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, trap: { name: 'Dartless', dc: 12 } }]).success).toBe(
      false
    );
  });

  it('dbRoomsToEngine fills object/trap defaults', () => {
    const [room] = dbRoomsToEngine([
      {
        ...ROOM_B,
        objects: [{ id: 'shrine', name: 'Cracked Shrine' }],
        trap: { name: 'Loose Step', dc: 12, damage: '1d6', damageType: 'bludgeoning' },
      },
    ]);
    // Object text defaults; no loot → searchable stays unset (flavor only).
    expect(room.objects?.[0]).toEqual({
      id: 'shrine',
      name: 'Cracked Shrine',
      desc: '',
      interactText: 'You examine the Cracked Shrine.',
    });
    // A chest with loot is searchable without an explicit flag.
    const [chest] = dbRoomsToEngine([
      { ...ROOM_B, objects: [{ id: 'c', name: 'Chest', lootIds: ['dagger'] }] },
    ]);
    expect(chest.objects?.[0].searchable).toBe(true);
    // Trap id + narrative defaults; mechanics pass through.
    expect(room.trap?.id).toBe('cellar-trap');
    expect(room.trap?.dc).toBe(12);
    expect(room.trap?.triggerNarrative).toContain('{name}');
    expect(room.trap?.triggerNarrative).toContain('{dmg}');
    expect(room.trap?.detectNarrative).toContain('Loose Step');
    expect(room.trap?.disarmSuccess).toContain('disarmed');
    expect(room.trap?.disarmFail).toBeTruthy();
  });

  it('rooms schema validates NPCs: recursive dialogue, campaign-unique ids, bounds', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const hob = {
      id: 'old-hob',
      name: 'Old Hob',
      attitude: 'friendly',
      greeting: 'Evening.',
      firstGreeting: 'New faces! Welcome.',
      goodbye: 'Mind the step.',
      firstGoodbye: 'Come back for the stew.',
      responses: [{ label: 'Ask', reply: 'No.', responses: [{ label: 'Press', reply: 'NO.' }] }],
      shop: [{ itemId: 'rope', price: 1 }],
      factionId: 'millers',
      pos: { x: 3, y: 3 },
    };
    const ok = rooms.safeParse([{ ...ROOM_B, npcs: [hob] }]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // Required social surface + enum + bounds + strictness.
    expect(rooms.safeParse([{ ...ROOM_B, npcs: [{ ...hob, greeting: undefined }] }]).success).toBe(
      false
    );
    expect(rooms.safeParse([{ ...ROOM_B, npcs: [{ ...hob, attitude: 'smug' }] }]).success).toBe(
      false
    );
    expect(rooms.safeParse([{ ...ROOM_B, npcs: [{ ...hob, pos: { x: 4, y: 0 } }] }]).success).toBe(
      false
    );
    expect(rooms.safeParse([{ ...ROOM_B, npcs: [{ ...hob, questId: 'nope' }] }]).success).toBe(
      false
    );
    // NPC ids are campaign-unique — the same id in TWO rooms is rejected.
    const roomTwo = { ...ROOM_B, id: 'attic', exits: undefined };
    expect(
      rooms.safeParse([
        { ...ROOM_B, npcs: [hob] },
        { ...roomTwo, npcs: [{ ...hob, pos: undefined }] },
      ]).success
    ).toBe(false);
  });

  it('rooms schema validates gated dialogue: conditions, consequences, NPC targets', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const smuggler = {
      id: 'smuggler',
      name: 'The Smuggler',
      attitude: 'friendly',
      greeting: 'Looking for something?',
      responses: [
        { label: 'Just browsing', reply: 'Suit yourself.' },
        {
          label: 'About that job…',
          reply: 'Bring the ledger.',
          condition: {
            all: [
              { fact: 'flags', path: '$.knows_password', operator: 'equal', value: true },
              { not: { fact: 'quests_completed', operator: 'contains', value: 'old-debt' } },
            ],
          },
        },
        {
          label: 'A little bird told me a password',
          reply: 'So you know Hob.',
          once: true,
          consequences: [
            { type: 'set_flag', key: 'knows_password', value: true },
            { type: 'set_npc_attitude', npcId: 'smuggler', attitude: 'friendly' },
            { type: 'give_gold', amount: 5 },
            { type: 'give_item', itemId: 'dagger' },
            { type: 'give_xp', amount: 25 },
          ],
        },
      ],
    };
    const ok = rooms.safeParse([{ ...ROOM_B, npcs: [smuggler] }]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    const withResp = (patch: object) => [
      { ...ROOM_B, npcs: [{ ...smuggler, responses: [patch] }] },
    ];
    // Unknown fact / unknown operator — an authoring-time 400, not a
    // silently-always-hidden option.
    expect(
      rooms.safeParse(
        withResp({ label: 'X', condition: { fact: 'vibes', operator: 'equal', value: 1 } })
      ).success
    ).toBe(false);
    expect(
      rooms.safeParse(
        withResp({ label: 'X', condition: { fact: 'world_day', operator: 'looksLike', value: 1 } })
      ).success
    ).toBe(false);
    // Paths must be $.dot.paths.
    expect(
      rooms.safeParse(
        withResp({
          label: 'X',
          condition: { fact: 'flags', path: 'knows_password', operator: 'equal', value: true },
        })
      ).success
    ).toBe(false);
    // Consequences outside the DB-safe subset stay code-side.
    expect(
      rooms.safeParse(
        withResp({
          label: 'X',
          consequences: [{ type: 'spawn_enemy', roomId: 'cellar', enemyId: 'rat' }],
        })
      ).success
    ).toBe(false);
    // set_npc_attitude must target an NPC in the payload — even on a NESTED node.
    expect(
      rooms.safeParse(
        withResp({
          label: 'X',
          consequences: [{ type: 'set_npc_attitude', npcId: 'ghost', attitude: 'hostile' }],
        })
      ).success
    ).toBe(false);
    expect(
      rooms.safeParse(
        withResp({
          label: 'X',
          responses: [
            {
              label: 'Y',
              consequences: [{ type: 'set_npc_attitude', npcId: 'ghost', attitude: 'hostile' }],
            },
          ],
        })
      ).success
    ).toBe(false);
  });

  it('rooms schema validates check nodes: shape, no reply/consequences overlap', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const guard = (responses: object[]) => [
      {
        ...ROOM_B,
        npcs: [
          {
            id: 'guard',
            name: 'Gate Guard',
            attitude: 'indifferent',
            greeting: 'Halt.',
            responses,
          },
        ],
      },
    ];
    const checkNode = {
      label: 'Let us pass — we mean no harm',
      check: {
        skill: 'persuasion',
        dc: 14,
        successReply: 'Go on, then.',
        failReply: 'Not a chance.',
        onSuccess: [{ type: 'set_flag', key: 'gate_open', value: true }],
        onFail: [{ type: 'set_npc_attitude', npcId: 'guard', attitude: 'hostile' }],
      },
    };
    const ok = rooms.safeParse(guard([checkNode]));
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // A check node may not ALSO carry plain reply/consequences.
    expect(rooms.safeParse(guard([{ ...checkNode, reply: 'Hm.' }])).success).toBe(false);
    expect(
      rooms.safeParse(guard([{ ...checkNode, consequences: [{ type: 'give_gold', amount: 1 }] }]))
        .success
    ).toBe(false);
    // Off-enum skill / unknown attitude target inside onFail.
    expect(
      rooms.safeParse(guard([{ ...checkNode, check: { ...checkNode.check, skill: 'flexing' } }]))
        .success
    ).toBe(false);
    expect(
      rooms.safeParse(
        guard([
          {
            ...checkNode,
            check: {
              ...checkNode.check,
              onFail: [{ type: 'set_npc_attitude', npcId: 'ghost', attitude: 'hostile' }],
            },
          },
        ])
      ).success
    ).toBe(false);
    // start_quest is part of the DB consequence subset now.
    expect(
      rooms.safeParse(
        guard([{ label: 'Work?', consequences: [{ type: 'start_quest', questId: 'rat-problem' }] }])
      ).success
    ).toBe(true);
  });

  it('quests schema: steps + rewards constrained, ids unique, action fact quest-only', () => {
    const quests = CAMPAIGN_SECTION_SCHEMAS.quests;
    const quest = {
      id: 'rat-problem',
      title: 'The Rat Problem',
      desc: 'Clear the cellar.',
      giverNpcId: 'old-hob',
      startActive: true,
      steps: [
        {
          id: 'step_kill',
          desc: 'Deal with the rats',
          condition: {
            all: [
              { fact: 'action', operator: 'equal', value: 'attack' },
              { fact: 'enemies_killed', operator: 'contains', value: 'cellar#0' },
            ],
          },
        },
      ],
      rewards: [
        { type: 'give_gold', amount: 25 },
        { type: 'start_quest', questId: 'old-debt' },
      ],
    };
    const ok = quests.safeParse([quest]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // Steps required; ids unique across quests and steps within a quest.
    expect(quests.safeParse([{ ...quest, steps: [] }]).success).toBe(false);
    expect(quests.safeParse([quest, quest]).success).toBe(false);
    expect(quests.safeParse([{ ...quest, steps: [quest.steps[0], quest.steps[0]] }]).success).toBe(
      false
    );
    // Rewards outside the safe subset stay code-side.
    expect(
      quests.safeParse([
        { ...quest, rewards: [{ type: 'spawn_enemy', roomId: 'x', enemyId: 'y' }] },
      ]).success
    ).toBe(false);
    // The `action` fact is for QUEST conditions only — dialogue gates reject it.
    const roomsSchema = CAMPAIGN_SECTION_SCHEMAS.rooms;
    expect(
      roomsSchema.safeParse([
        {
          ...ROOM_B,
          npcs: [
            {
              id: 'n',
              name: 'N',
              attitude: 'friendly',
              greeting: 'Hi.',
              responses: [
                {
                  label: 'X',
                  condition: { fact: 'action', operator: 'equal', value: 'attack' },
                },
              ],
            },
          ],
        },
      ]).success
    ).toBe(false);
  });

  it('factions schema: ascending thresholds, tier-keyed modifiers, unique ids', () => {
    const factions = CAMPAIGN_SECTION_SCHEMAS.factions;
    const millers = {
      id: 'millers',
      name: "The Millers' Guild",
      thresholds: { hostile: -20, unfriendly: -5, neutral: 0, friendly: 20, exalted: 50 },
      shopPriceModifiers: { friendly: 0.9, exalted: 0.75 },
    };
    const ok = factions.safeParse([millers]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // Thresholds must ascend.
    expect(
      factions.safeParse([{ ...millers, thresholds: { ...millers.thresholds, friendly: -10 } }])
        .success
    ).toBe(false);
    // Modifier keys are the five tiers only.
    expect(factions.safeParse([{ ...millers, shopPriceModifiers: { chummy: 0.5 } }]).success).toBe(
      false
    );
    expect(factions.safeParse([millers, millers]).success).toBe(false);
  });

  it('rooms schema validates loot placements: item id + bounded pos, strict shape', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const ok = rooms.safeParse([
      { ...ROOM_B, loot: [{ itemId: 'dagger', pos: { x: 3, y: 3 } }, { itemId: 'rope' }] },
    ]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // Out-of-grid pos (ROOM_B is 4x4), empty id, extra key, >10 entries.
    expect(
      rooms.safeParse([{ ...ROOM_B, loot: [{ itemId: 'dagger', pos: { x: 4, y: 0 } }] }]).success
    ).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, loot: [{ itemId: '' }] }]).success).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, loot: [{ itemId: 'dagger', gold: 5 }] }]).success).toBe(
      false
    );
    expect(
      rooms.safeParse([
        { ...ROOM_B, loot: Array.from({ length: 11 }, () => ({ itemId: 'dagger' })) },
      ]).success
    ).toBe(false);
  });

  it('rooms schema validates enemy placements: name + bounded count, strict shape', () => {
    const rooms = CAMPAIGN_SECTION_SCHEMAS.rooms;
    const ok = rooms.safeParse([
      { ...ROOM_B, enemies: [{ name: 'Goblin', count: 3 }, { name: 'Wolf' }] },
    ]);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    expect(rooms.safeParse([{ ...ROOM_B, enemies: [{ name: '' }] }]).success).toBe(false);
    expect(rooms.safeParse([{ ...ROOM_B, enemies: [{ name: 'Goblin', count: 0 }] }]).success).toBe(
      false
    );
    expect(rooms.safeParse([{ ...ROOM_B, enemies: [{ name: 'Goblin', count: 9 }] }]).success).toBe(
      false
    );
    expect(rooms.safeParse([{ ...ROOM_B, enemies: [{ name: 'Goblin', hp: 99 }] }]).success).toBe(
      false
    );
    expect(
      rooms.safeParse([
        { ...ROOM_B, enemies: Array.from({ length: 11 }, () => ({ name: 'Goblin' })) },
      ]).success
    ).toBe(false);
  });

  it('terrainArt schema: per-type tile ids from the shared catalog, {} allowed', () => {
    const art = CAMPAIGN_SECTION_SCHEMAS.terrainArt;
    expect(art.safeParse({}).success).toBe(true);
    expect(
      art.safeParse({ plains: 'plains-ash', forest: 'forest-dead', water: 'water-murk' }).success
    ).toBe(true);
    // A type may point at another type's base tile (plains → snow).
    expect(art.safeParse({ plains: 'snow' }).success).toBe(true);
    // Unknown tile id / unknown terrain type / wrong value shape.
    expect(art.safeParse({ plains: 'lava-flow' }).success).toBe(false);
    expect(art.safeParse({ tundra: 'plains-ash' }).success).toBe(false);
    expect(art.safeParse({ plains: { base: 'snow' } }).success).toBe(false);
  });

  it('terrainArt schema: { tile, tint } choices with bounded tints, + marker slots', () => {
    const art = CAMPAIGN_SECTION_SCHEMAS.terrainArt;
    // The structured choice: a tile + an optional bounded tint.
    expect(art.safeParse({ plains: { tile: 'snow' } }).success).toBe(true);
    expect(
      art.safeParse({
        forest: { tile: 'forest-dead', tint: { hue: 30, saturate: 0.5, brightness: 0.8 } },
      }).success
    ).toBe(true);
    // Tint knobs are bounded: hue ±180, saturate 0..3, brightness 0..2.
    expect(art.safeParse({ plains: { tile: 'snow', tint: { hue: 200 } } }).success).toBe(false);
    expect(art.safeParse({ plains: { tile: 'snow', tint: { saturate: 4 } } }).success).toBe(false);
    expect(art.safeParse({ plains: { tile: 'snow', tint: { brightness: -1 } } }).success).toBe(
      false
    );
    // The town-marker slot: a MARKER_TILES id, bare or tinted.
    expect(art.safeParse({ markers: { town: 'castle' } }).success).toBe(true);
    expect(
      art.safeParse({ markers: { town: { tile: 'monastery', tint: { hue: -40 } } } }).success
    ).toBe(true);
    // Unknown marker ids / slots rejected; terrain TILE ids aren't marker ids.
    expect(art.safeParse({ markers: { town: 'lava-flow' } }).success).toBe(false);
    expect(art.safeParse({ markers: { town: 'plains-ash' } }).success).toBe(false);
    expect(art.safeParse({ markers: { dungeon: 'castle' } }).success).toBe(false);
  });

  it('terrainArt schema: floor skins remap families and carry bounded tints', () => {
    const art = CAMPAIGN_SECTION_SCHEMAS.terrainArt;
    // Bare remap, remap + tint, tint over the same family.
    expect(art.safeParse({ floors: { grass: 'cobblestone' } }).success).toBe(true);
    expect(
      art.safeParse({ floors: { dirt: { tile: 'sand', tint: { brightness: 0.8 } } } }).success
    ).toBe(true);
    expect(
      art.safeParse({ floors: { cobblestone: { tile: 'cobblestone', tint: { hue: 15 } } } }).success
    ).toBe(true);
    // Floor ids are their own vocabulary — terrain tiles / unknown families rejected.
    expect(art.safeParse({ floors: { grass: 'plains-ash' } }).success).toBe(false);
    expect(art.safeParse({ floors: { marble: 'sand' } }).success).toBe(false);
    expect(art.safeParse({ floors: { grass: { tile: 'sand', tint: { hue: 999 } } } }).success).toBe(
      false
    );
  });

  it('dialogue consequences: the Malgovia-parity arms validate with bounds', () => {
    const quests = CAMPAIGN_SECTION_SCHEMAS.quests;
    const quest = (rewards: unknown[]) => [
      {
        id: 'q1',
        title: 'T',
        desc: 'D',
        steps: [
          {
            id: 's1',
            desc: 'd',
            condition: { all: [{ fact: 'flags', operator: 'contains', value: 'x' }] },
          },
        ],
        rewards,
      },
    ];
    expect(
      quests.safeParse(
        quest([
          { type: 'advance_quest', questId: 'q2', stepId: 's9' },
          { type: 'add_narrative', text: 'The idol grows cold in your hand.' },
          { type: 'modify_hp', amount: 8 },
          { type: 'modify_hp', amount: -10 },
          { type: 'consume_item', itemId: 'guild_ledger' },
        ])
      ).success
    ).toBe(true);
    // Bounds: zero / oversized hp swings, missing step id.
    expect(quests.safeParse(quest([{ type: 'modify_hp', amount: 0 }])).success).toBe(false);
    expect(quests.safeParse(quest([{ type: 'modify_hp', amount: 999 }])).success).toBe(false);
    expect(quests.safeParse(quest([{ type: 'advance_quest', questId: 'q2' }])).success).toBe(false);
    // Still rejected: the arms that stayed code-side.
    expect(
      quests.safeParse(quest([{ type: 'spawn_enemy', roomId: 'r', enemyId: 'rat' }])).success
    ).toBe(false);
  });

  it('quest conditions may key on npc_id (talk-to-this-npc steps)', () => {
    const quests = CAMPAIGN_SECTION_SCHEMAS.quests;
    const withFact = (fact: string) => [
      {
        id: 'q1',
        title: 'T',
        desc: 'D',
        steps: [
          {
            id: 's1',
            desc: 'd',
            condition: {
              all: [
                { fact: 'action', operator: 'equal', value: 'talk_response' },
                { fact, operator: 'equal', value: 'npc_elise_elder' },
              ],
            },
          },
        ],
        rewards: [],
      },
    ];
    expect(quests.safeParse(withFact('npc_id')).success).toBe(true);
    expect(quests.safeParse(withFact('npc_name')).success).toBe(false); // not a fact
  });

  it('theme schema: partial CSS knobs, capped, unknown keys rejected', () => {
    const theme = CAMPAIGN_SECTION_SCHEMAS.theme;
    expect(theme.safeParse({}).success).toBe(true);
    expect(
      theme.safeParse({ pageBg: '#1a1208', primary: 'goldenrod', title: 'EMBERFALL' }).success
    ).toBe(true);
    expect(theme.safeParse({ titleFont: 'serif' }).success).toBe(false);
    expect(theme.safeParse({ title: '' }).success).toBe(false);
  });

  it('backgrounds schema: full shape, unique ids', () => {
    const backgrounds = CAMPAIGN_SECTION_SCHEMAS.backgrounds;
    const soldier = {
      id: 'soldier',
      name: 'Soldier',
      desc: 'You served.',
      skillProficiencies: ['Athletics', 'Intimidation'],
      feature: 'Military Rank',
      featureDesc: 'Watchmen recognise your authority.',
      originFeat: 'savage_attacker',
      abilityScoreIncreases: ['str', 'dex', 'con'],
      startingEquipment: ['shortsword'],
    };
    expect(backgrounds.safeParse([soldier]).success).toBe(true);
    expect(backgrounds.safeParse([soldier, { ...soldier, name: 'Other' }]).success).toBe(false); // dup id
    expect(backgrounds.safeParse([{ ...soldier, skillProficiencies: [] }]).success).toBe(false);
  });

  it('class config schemas: per-class id lists + equipment packages', () => {
    expect(
      CAMPAIGN_SECTION_SCHEMAS.classSpells.safeParse({ Wizard: ['fire_bolt', 'shield'] }).success
    ).toBe(true);
    expect(
      CAMPAIGN_SECTION_SCHEMAS.classStartingLoot.safeParse({ Fighter: ['longsword', 'shield'] })
        .success
    ).toBe(true);
    expect(
      CAMPAIGN_SECTION_SCHEMAS.classStartingEquipment.safeParse({
        Fighter: [{ id: 'A', label: 'Sword & board', items: ['longsword', 'shield'], gold: 10 }],
      }).success
    ).toBe(true);
    expect(CAMPAIGN_SECTION_SCHEMAS.classStartingEquipment.safeParse({ Fighter: [] }).success).toBe(
      false
    );
  });

  it('gameStart schema is a plain narration string', () => {
    const gameStart = CAMPAIGN_SECTION_SCHEMAS.gameStart;
    expect(gameStart.safeParse('The road south is long and the coin pouch light.').success).toBe(
      true
    );
    expect(gameStart.safeParse('').success).toBe(false);
    expect(gameStart.safeParse({ text: 'nope' }).success).toBe(false);
  });

  it('regions schema validates region gates: target resolves, no self-target, entry bounds', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    const gate = (over: Record<string, unknown> = {}) => ({
      id: 'north-pass',
      name: 'The North Pass',
      pos: { x: 2, y: 0 },
      kind: 'region',
      regionId: 'frost-reach',
      ...over,
    });
    const pair = (g: Record<string, unknown>) => [
      region({ sites: [g] }),
      region({ id: 'frost-reach', name: 'The Frost Reach', isStartingRegion: false }),
    ];
    const ok = regions.safeParse(pair(gate({ entryPos: { x: 1, y: 1 } })));
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    // An encounter zone's creature table: a list of creature names (composed-
    // bestiary cross-check is overlay-time warn-skip, not schema).
    const zoneWith = (encounterTable: string[]) => [
      { id: 'wilds', name: 'Wilds', tier: 1, encounterChance: 0.1, encounterTable },
    ];
    expect(
      regions.safeParse([region({ encounterZones: zoneWith(['Wolf', 'Goblin']) })]).success
    ).toBe(true);
    expect(regions.safeParse([region({ encounterZones: zoneWith(['']) })]).success).toBe(false);
    // A gate needs a target…
    expect(regions.safeParse(pair(gate({ regionId: undefined }))).success).toBe(false);
    // …that exists in the payload…
    expect(regions.safeParse(pair(gate({ regionId: 'nowhere' }))).success).toBe(false);
    // …and isn't its own region.
    expect(regions.safeParse(pair(gate({ regionId: 'malgovia' }))).success).toBe(false);
    // entryPos must fit the TARGET region's grid (12x10).
    expect(regions.safeParse(pair(gate({ entryPos: { x: 12, y: 0 } }))).success).toBe(false);
  });

  it('regions schema requires scale, grid, and startPos', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    for (const missing of ['feetPerSquare', 'grid', 'startPos']) {
      const r = region();
      delete (r as Record<string, unknown>)[missing];
      expect(regions.safeParse([r]).success, `missing ${missing} should fail`).toBe(false);
    }
  });

  it('regions schema bounds-checks startPos against the derived grid dims', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    expect(regions.safeParse([region({ startPos: { x: 12, y: 0 } })]).success).toBe(false); // x == width
    expect(regions.safeParse([region({ startPos: { x: 0, y: 10 } })]).success).toBe(false); // y == height
    expect(regions.safeParse([region({ startPos: { x: 11, y: 9 } })]).success).toBe(true); // corner ok
  });

  it('regions schema validates grid cells: rectangular, known types, override ranges', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    // Ragged rows rejected.
    const ragged = G(4, 3);
    ragged[1] = ragged[1].slice(0, 2);
    expect(regions.safeParse([region({ grid: ragged, startPos: { x: 0, y: 0 } })]).success).toBe(
      false
    );
    // Unknown terrain type / unknown cell field / out-of-range overrides.
    expect(
      regions.safeParse([region({ grid: [[{ t: 'lava' }]], startPos: { x: 0, y: 0 } })]).success
    ).toBe(false);
    expect(
      regions.safeParse([
        region({ grid: [[{ t: 'road', slippery: true }]], startPos: { x: 0, y: 0 } }),
      ]).success
    ).toBe(false);
    // The retired per-cell `tier` / `enc` keys are now unknown ⇒ rejected.
    expect(
      regions.safeParse([region({ grid: [[{ t: 'road', tier: 2 }]], startPos: { x: 0, y: 0 } })])
        .success
    ).toBe(false);
    // A cell `ez` tag referencing a declared encounter zone is valid.
    expect(
      regions.safeParse([
        region({
          grid: [[{ t: 'forest', ez: 'wilds' }]],
          startPos: { x: 0, y: 0 },
          encounterZones: [
            { id: 'wilds', name: 'Wilds', tier: 1, encounterChance: 0.1, encounterTable: ['Wolf'] },
          ],
        }),
      ]).success
    ).toBe(true);
  });

  it('regions schema validates sites: kind↔target, bounds, unique ids', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    const town = {
      id: 'oakvale',
      name: 'Oakvale',
      pos: { x: 1, y: 1 },
      kind: 'town',
      townId: 'oakvale',
    };
    const dungeon = {
      id: 'old-crypt',
      name: 'The Old Crypt',
      pos: { x: 5, y: 5 },
      kind: 'local',
      entryRoomId: 'crypt-entrance',
      icon: 'tombstone',
    };
    expect(
      regions.safeParse([region({ sites: [town, dungeon] })]).success,
      'valid sites should pass'
    ).toBe(true);
    // Town site without townId / local site without entryRoomId.
    expect(regions.safeParse([region({ sites: [{ ...town, townId: undefined }] })]).success).toBe(
      false
    );
    expect(
      regions.safeParse([region({ sites: [{ ...dungeon, entryRoomId: undefined }] })]).success
    ).toBe(false);
    // Out-of-grid pos (grid is 12x10) and duplicate ids.
    expect(
      regions.safeParse([region({ sites: [{ ...town, pos: { x: 12, y: 0 } }] })]).success
    ).toBe(false);
    expect(regions.safeParse([region({ sites: [town, town] })]).success).toBe(false);
    // Unknown extra field.
    expect(regions.safeParse([region({ sites: [{ ...town, mayor: 'Bob' }] })]).success).toBe(false);
  });

  it('regions schema rejects duplicate ids, bad slugs, and wrong start counts', () => {
    const regions = CAMPAIGN_SECTION_SCHEMAS.regions;
    expect(
      regions.safeParse([region(), region({ name: 'B', isStartingRegion: false })]).success
    ).toBe(false);
    expect(regions.safeParse([region({ id: 'Malgovia!' })]).success).toBe(false);
    expect(regions.safeParse([region({ isStartingRegion: false })]).success).toBe(false);
    expect(regions.safeParse([region(), region({ id: 'b' })]).success).toBe(false);
    expect(regions.safeParse([]).success).toBe(false);
    expect(regions.safeParse([region({ biome: 'swamp' })]).success).toBe(false);
    // Region-level encounter fields were retired (encounters live in zones) — now
    // unknown keys, so they're rejected.
    expect(regions.safeParse([region({ encounterChance: 0.5 })]).success).toBe(false);
    expect(regions.safeParse([region({ baseTier: 1 })]).success).toBe(false);
  });

  // A minimal valid town — tests tweak single fields off this base.
  const town = (over: Record<string, unknown> = {}) => ({
    id: 'oakvale',
    name: 'Oakvale',
    feetPerSquare: 25,
    grid: G(10, 8),
    startPos: { x: 1, y: 1 },
    ...over,
  });

  it('towns schema accepts the full fixture and a lean town', () => {
    const result = CAMPAIGN_SECTION_SCHEMAS.towns.safeParse([TOWN_A, TOWN_B]);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('towns schema validates venues: interior needs entryRoomId, bounds, unique ids', () => {
    const towns = CAMPAIGN_SECTION_SCHEMAS.towns;
    const gate = { id: 'gate', name: 'Town Gate', pos: { x: 0, y: 1 }, kind: 'gate' };
    const tavern = {
      id: 'tavern',
      name: 'The Split Acorn',
      pos: { x: 4, y: 3 },
      kind: 'interior',
      entryRoomId: 'acorn-taproom',
    };
    expect(towns.safeParse([town({ venues: [gate, tavern] })]).success).toBe(true);
    // Interior without entryRoomId; gates carry no target and are fine bare.
    expect(
      towns.safeParse([town({ venues: [{ ...tavern, entryRoomId: undefined }] })]).success
    ).toBe(false);
    // Out-of-grid pos (grid is 10x8) and duplicate ids.
    expect(towns.safeParse([town({ venues: [{ ...gate, pos: { x: 10, y: 0 } }] })]).success).toBe(
      false
    );
    expect(towns.safeParse([town({ venues: [gate, gate] })]).success).toBe(false);
    // Unknown extra field and off-enum kind.
    expect(towns.safeParse([town({ venues: [{ ...gate, locked: true }] })]).success).toBe(false);
    expect(towns.safeParse([town({ venues: [{ ...gate, kind: 'portal' }] })]).success).toBe(false);
  });

  it('towns schema enforces grid shape, floor enum, and unique town ids', () => {
    const towns = CAMPAIGN_SECTION_SCHEMAS.towns;
    for (const missing of ['feetPerSquare', 'grid', 'startPos']) {
      const t = town();
      delete (t as Record<string, unknown>)[missing];
      expect(towns.safeParse([t]).success, `missing ${missing} should fail`).toBe(false);
    }
    const ragged = G(4, 3);
    ragged[1] = ragged[1].slice(0, 2);
    expect(towns.safeParse([town({ grid: ragged, startPos: { x: 0, y: 0 } })]).success).toBe(false);
    expect(towns.safeParse([town({ startPos: { x: 10, y: 0 } })]).success).toBe(false); // x == width
    expect(towns.safeParse([town({ floor: 'lava' })]).success).toBe(false);
    expect(towns.safeParse([town({ floor: 'cobblestone' })]).success).toBe(true);
    expect(towns.safeParse([town(), town({ name: 'B' })]).success).toBe(false); // dup ids
    expect(towns.safeParse([town({ id: 'Oakvale!' })]).success).toBe(false);
    expect(towns.safeParse([]).success).toBe(false);
    expect(towns.safeParse([town({ mayor: 'Bob' })]).success).toBe(false);
  });
});

describe('regions table store', () => {
  it('round-trips the JSON shape through rows, preserving order + optionals', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A, REGION_B])).toBe(
      true
    );
    const back = await getCampaignRegions(db.pool, 'malgovia');
    expect(back).toEqual([REGION_A, REGION_B]);
    // Optional fields absent (not null) on the lean region.
    expect('desc' in back[1]).toBe(false);
    expect('encounterChance' in back[1]).toBe(false);
  });

  it('put is replace-all, not append', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A, REGION_B]);
    await putCampaignSection(db.pool, 'malgovia', 'regions', [
      { ...REGION_B, isStartingRegion: true },
    ]);
    const back = await getCampaignRegions(db.pool, 'malgovia');
    expect(back.map((r) => r.id)).toEqual(['frost-reach']);
  });

  it('rejects writes to a missing campaign; delete reverts to empty', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'nope', 'regions', [REGION_A])).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    expect(await deleteCampaignSection(db.pool, 'malgovia', 'regions')).toBe(true);
    expect(await getCampaignRegions(db.pool, 'malgovia')).toEqual([]);
    expect(await deleteCampaignSection(db.pool, 'nope', 'regions')).toBe(false);
  });

  it('getDbSection reports presence from the table, not the JSONB', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect((await getDbSection(db.pool, 'malgovia', 'regions')).present).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    const after = await getDbSection(db.pool, 'malgovia', 'regions');
    expect(after.present).toBe(true);
    expect(after.value).toEqual([REGION_A]);
  });
});

describe('towns table store', () => {
  it('round-trips towns with their venues in order, preserving optionals', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_A, TOWN_B])).toBe(true);
    const back = await getCampaignTowns(db.pool, 'malgovia');
    expect(back).toEqual([TOWN_A, TOWN_B]);
    // Optional fields absent (not null): the gate venue has no
    // entryRoomId/desc, and the lean town carries no venues/floor keys.
    expect('entryRoomId' in back[0].venues![0]).toBe(false);
    expect('desc' in back[0].venues![0]).toBe(false);
    expect('venues' in back[1]).toBe(false);
    expect('floor' in back[1]).toBe(false);
  });

  it('put is replace-all and cascades venue rows', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_A, TOWN_B]);
    await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_B]);
    const back = await getCampaignTowns(db.pool, 'malgovia');
    expect(back).toEqual([TOWN_B]);
    // TOWN_A's venues went with it — a re-add of the bare town stays bare.
    await putCampaignSection(db.pool, 'malgovia', 'towns', [{ ...TOWN_A, venues: undefined }]);
    expect('venues' in (await getCampaignTowns(db.pool, 'malgovia'))[0]).toBe(false);
  });

  it('rejects writes to a missing campaign; delete reverts to empty', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'nope', 'towns', [TOWN_A])).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_A]);
    expect(await deleteCampaignSection(db.pool, 'malgovia', 'towns')).toBe(true);
    expect(await getCampaignTowns(db.pool, 'malgovia')).toEqual([]);
    expect(await deleteCampaignSection(db.pool, 'nope', 'towns')).toBe(false);
  });

  it('getDbSection reports presence from the towns table', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect((await getDbSection(db.pool, 'malgovia', 'towns')).present).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_A]);
    const after = await getDbSection(db.pool, 'malgovia', 'towns');
    expect(after.present).toBe(true);
    expect(after.value).toEqual([TOWN_A]);
  });
});

describe('rooms table store', () => {
  it('round-trips rooms with exits/lighting/floor, preserving order + optionals', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect(await putCampaignSection(db.pool, 'malgovia', 'rooms', [ROOM_A, ROOM_B])).toBe(true);
    const back = await getCampaignRooms(db.pool, 'malgovia');
    expect(back).toEqual([ROOM_A, ROOM_B]);
    // The lean room carries no optional keys (absent, not null/false).
    expect('exits' in back[1]).toBe(false);
    expect('lighting' in back[1]).toBe(false);
    expect('floor' in back[1]).toBe(false);
    expect('canRest' in back[1]).toBe(false);
    expect('feetPerSquare' in back[1]).toBe(false); // rooms are LOCKED to 5 ft — no scale key
  });

  it('put is replace-all; delete reverts to empty; missing campaign rejected', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [ROOM_A, ROOM_B]);
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [ROOM_B]);
    expect((await getCampaignRooms(db.pool, 'malgovia')).map((r) => r.id)).toEqual(['cellar']);
    expect(await deleteCampaignSection(db.pool, 'malgovia', 'rooms')).toBe(true);
    expect(await getCampaignRooms(db.pool, 'malgovia')).toEqual([]);
    expect(await putCampaignSection(db.pool, 'nope', 'rooms', [ROOM_B])).toBe(false);
    expect(await deleteCampaignSection(db.pool, 'nope', 'rooms')).toBe(false);
  });

  it('getDbSection reports presence from the rooms table', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    expect((await getDbSection(db.pool, 'malgovia', 'rooms')).present).toBe(false);
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [ROOM_A, ROOM_B]);
    const after = await getDbSection(db.pool, 'malgovia', 'rooms');
    expect(after.present).toBe(true);
    expect(after.value).toEqual([ROOM_A, ROOM_B]);
  });
});

describe('dbRoomsToEngine', () => {
  it('derives dims; cosmetic paint → terrain; mech flags → the engine arrays', () => {
    const [room] = dbRoomsToEngine([ROOM_A]);
    expect(room.gridWidth).toBe(8);
    expect(room.gridHeight).toBe(6);
    expect(room.terrain).toEqual([{ pos: { x: 2, y: 2 }, type: 'water' }]);
    expect(room.obstacles).toEqual([{ x: 3, y: 0 }]);
    expect(room.swimTerrain).toEqual([{ x: 2, y: 2 }]); // t + m can share a cell
    expect(room.coverPositions).toEqual([{ x: 5, y: 4 }]);
    expect(room.difficultTerrain).toBeUndefined();
    expect(room.climbTerrain).toBeUndefined();
    // Scalars + exits pass through.
    expect(room.entryPos).toEqual({ x: 0, y: 2 });
    expect(room.exits).toEqual(ROOM_A.exits);
    expect(room.lighting).toBe('dim');
    expect(room.floor).toBe('cobblestone');
    expect(room.canRest).toBe(true);
  });

  it('a bare room is just a grid: no terrain/mech keys at all', () => {
    const [room] = dbRoomsToEngine([ROOM_B]);
    expect(room.gridWidth).toBe(4);
    expect('terrain' in room).toBe(false);
    expect('obstacles' in room).toBe(false);
    expect('exits' in room).toBe(false);
  });

  it('canRest is ALWAYS explicit on DB rooms — unchecked really forbids resting', () => {
    // The engine default is allowed-unless-forbidden, but the painter's
    // CAN REST HERE checkbox promises the opposite. DB rooms emit the
    // boolean both ways so an unchecked room blocks the rest choices.
    const [rich, bare] = dbRoomsToEngine([ROOM_A, ROOM_B]);
    expect(rich.canRest).toBe(true);
    expect(bare.canRest).toBe(false);
  });
});

describe('section CRUD + live refresh', () => {
  it('put → refresh serves the DB version; delete → refresh restores code', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      narratives: { genericArrival: ['from code'] } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const codeContexts: Record<string, Context> = { malgovia: code };

    expect(
      await putCampaignSection(db.pool, 'malgovia', 'narratives', {
        genericArrival: ['from db'],
      })
    ).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, codeContexts, 'malgovia');
    expect(contexts.malgovia.narratives.genericArrival).toEqual(['from db']);

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'narratives')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, codeContexts, 'malgovia');
    expect(contexts.malgovia.narratives.genericArrival).toEqual(['from code']);
  });

  it('refresh folds CONVERTED table regions into the campaign block, keeping its rooms', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      displayNoun: 'vale',
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [{ id: 'square', name: 'Square', desc: 'd' }],
        regions: [{ id: 'old-code-region' } as never],
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const campaign = contexts.malgovia.campaign!;
    // Code rooms preserved; DB regions replace the code regions, in engine form.
    expect(campaign.rooms.map((r) => r.id)).toEqual(['square']);
    expect(campaign.regions?.map((r) => r.id)).toEqual(['malgovia']);
    expect(campaign.regions?.[0].gridWidth).toBe(12);
    expect(campaign.regions?.[0].gridHeight).toBe(10);
    expect(campaign.regions?.[0].startPos).toEqual({ x: 3, y: 4 });
  });

  it('refresh folds DB towns into the campaign block beside the regions', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [{ id: 'square', name: 'Square', desc: 'd' }],
        towns: [{ id: 'old-code-town' } as never],
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_A]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const campaign = contexts.malgovia.campaign!;
    expect(campaign.rooms.map((r) => r.id)).toEqual(['square']);
    expect(campaign.regions?.map((r) => r.id)).toEqual(['malgovia']);
    // DB towns replace the code towns, converted to engine form.
    expect(campaign.towns?.map((t) => t.id)).toEqual(['oakvale']);
    expect(campaign.towns?.[0].gridWidth).toBe(10);
    expect(campaign.towns?.[0].venues.map((v) => v.id)).toEqual(['gate', 'tavern']);
  });

  it('gameStart folds into campaign.intro, never the top level; delete restores code', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: {
        world_name: 'Malgovia',
        intro: 'The code opening.',
        rooms: [{ id: 'square', name: 'Square', desc: 'd' }],
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };

    expect(
      await putCampaignSection(db.pool, 'malgovia', 'gameStart', 'A new dawn over the vale.')
    ).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.intro).toBe('A new dawn over the vale.');
    // The hook lands inside the campaign block — no stray top-level field —
    // and the rest of the block survives.
    expect('gameStart' in contexts.malgovia).toBe(false);
    expect(contexts.malgovia.campaign?.rooms.map((r) => r.id)).toEqual(['square']);

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'gameStart')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.intro).toBe('The code opening.');
  });

  it('quests + factions fold into the campaign block wholesale; delete restores code', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const codeQuest = {
      id: 'code-quest',
      title: 'Old Business',
      desc: 'From code.',
      steps: [{ id: 's1', desc: 'x', condition: {} }],
      rewards: [],
    };
    const code = codeCtx({
      id: 'malgovia',
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [{ id: 'square', name: 'Square', desc: 'd' }],
        quests: [codeQuest],
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const dbQuest = {
      id: 'rat-problem',
      title: 'The Rat Problem',
      desc: 'Clear the cellar.',
      giverNpcId: 'old-hob',
      startActive: true,
      steps: [
        {
          id: 'step_kill',
          desc: 'Deal with the rats',
          condition: { fact: 'enemies_killed', operator: 'contains', value: 'acorn-cellar#0' },
        },
      ],
      rewards: [{ type: 'give_gold', amount: 25 }],
    };
    const faction = {
      id: 'millers',
      name: "The Millers' Guild",
      thresholds: { hostile: -20, unfriendly: -5, neutral: 0, friendly: 20, exalted: 50 },
      shopPriceModifiers: { friendly: 0.9 },
    };
    await putCampaignSection(db.pool, 'malgovia', 'quests', [dbQuest]);
    await putCampaignSection(db.pool, 'malgovia', 'factions', [faction]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    // Wholesale replace — the code quest is gone, the DB one serves; no
    // stray top-level keys; the rest of the block survives.
    expect(contexts.malgovia.campaign?.quests).toEqual([dbQuest]);
    expect(contexts.malgovia.campaign?.factions).toEqual([faction]);
    expect('quests' in contexts.malgovia).toBe(false);
    expect('factions' in contexts.malgovia).toBe(false);
    expect(contexts.malgovia.campaign?.rooms.map((r) => r.id)).toEqual(['square']);
    // Delete reverts to the code lists.
    await deleteCampaignSection(db.pool, 'malgovia', 'quests');
    await deleteCampaignSection(db.pool, 'malgovia', 'factions');
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.quests?.map((q) => q.id)).toEqual(['code-quest']);
    expect(contexts.malgovia.campaign?.factions).toBeUndefined();
  });

  it('worldName folds into campaign.world_name; tagline/previewArt overlay top-level', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: { world_name: 'Old Name', intro: 'x', rooms: [] } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'worldName', 'Auria');
    await putCampaignSection(
      db.pool,
      'malgovia',
      'tagline',
      'The sky has fallen. Walk the shards.'
    );
    await putCampaignSection(db.pool, 'malgovia', 'previewArt', '  /\\\n /  \\\n/____\\');
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.world_name).toBe('Auria');
    expect('worldName' in contexts.malgovia).toBe(false); // folded, not top-level
    expect(contexts.malgovia.tagline).toBe('The sky has fallen. Walk the shards.');
    expect(contexts.malgovia.previewArt).toContain('/____');
    // Delete reverts the world name to code.
    await deleteCampaignSection(db.pool, 'malgovia', 'worldName');
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.world_name).toBe('Old Name');
  });

  it('terrainArt overlays the context top-level and reverts to none on delete', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({ id: 'malgovia' });
    const contexts: Record<string, Context> = { malgovia: code };
    const art = { plains: 'plains-ash', forest: 'forest-dead' };

    expect(await putCampaignSection(db.pool, 'malgovia', 'terrainArt', art)).toBe(true);
    expect((await getDbSection(db.pool, 'malgovia', 'terrainArt')).value).toEqual(art);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.terrainArt).toEqual(art);

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'terrainArt')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.terrainArt).toBeUndefined();
  });

  it('recommendedParty folds into the campaign block (size + composition)', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({ id: 'malgovia' });
    const contexts: Record<string, Context> = { malgovia: code };

    expect(
      await putCampaignSection(db.pool, 'malgovia', 'recommendedParty', {
        size: 3,
        composition: ['Fighter', 'Cleric', 'Wizard'],
      })
    ).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.recommendedPartySize).toBe(3);
    expect(contexts.malgovia.campaign?.recommendedComposition).toEqual([
      'Fighter',
      'Cleric',
      'Wizard',
    ]);

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'recommendedParty')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    // Reverts to the code campaign's value (the base template has none).
    expect(contexts.malgovia.campaign?.recommendedPartySize).toBeUndefined();
  });

  it('recommendedParty schema: bounded size + SRD-class composition', () => {
    const sch = CAMPAIGN_SECTION_SCHEMAS.recommendedParty;
    expect(
      sch.safeParse({ size: 4, composition: ['Fighter', 'Rogue', 'Wizard', 'Cleric'] }).success
    ).toBe(true);
    expect(sch.safeParse({ size: 0, composition: [] }).success).toBe(false); // size floor
    expect(sch.safeParse({ size: 9, composition: [] }).success).toBe(false); // size cap
    expect(sch.safeParse({ size: 4, composition: ['Necromancer'] }).success).toBe(false); // not SRD
  });

  it('rules overlay the context top level (engine reads context.rules)', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({ id: 'malgovia' });
    const contexts: Record<string, Context> = { malgovia: code };
    const rules = [
      {
        name: 'ledger_found',
        once: true,
        priority: 5,
        conditions: {
          all: [{ fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' }],
        },
        consequences: [
          { type: 'advance_quest', questId: 'q1', stepId: 's1' },
          { type: 'add_narrative', text: 'The Guild stamp.' },
        ],
      },
    ];
    expect(await putCampaignSection(db.pool, 'malgovia', 'rules', rules)).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.rules).toEqual(rules);

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'rules')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.rules).toBeUndefined();
  });

  it('rules schema: condition facts + consequence subset, duplicate names rejected', () => {
    const sch = CAMPAIGN_SECTION_SCHEMAS.rules;
    const rule = (name: string, over: Record<string, unknown> = {}) => ({
      name,
      conditions: { all: [{ fact: 'loot_taken', operator: 'contains', value: 'x' }] },
      consequences: [{ type: 'add_narrative', text: 'hi' }],
      ...over,
    });
    expect(sch.safeParse([rule('a'), rule('b')]).success).toBe(true);
    // npc_id is a valid rule fact (the step_talk_elise pattern).
    expect(
      sch.safeParse([
        rule('c', { conditions: { all: [{ fact: 'npc_id', operator: 'equal', value: 'elise' }] } }),
      ]).success
    ).toBe(true);
    expect(sch.safeParse([rule('d'), rule('d')]).success).toBe(false); // dup name
    expect(sch.safeParse([rule('e', { consequences: [] })]).success).toBe(true); // flag-only rule
    // A non-DB consequence arm is rejected.
    expect(
      sch.safeParse([
        rule('f', { consequences: [{ type: 'spawn_enemy', roomId: 'r', enemyId: 'g' }] }),
      ]).success
    ).toBe(false);
  });

  it('theme overlays the context top-level (the FE merges it over the base)', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({ id: 'malgovia' });
    const contexts: Record<string, Context> = { malgovia: code };
    const theme = { pageBg: '#101418', title: 'EMBERFALL' };

    expect(await putCampaignSection(db.pool, 'malgovia', 'theme', theme)).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.theme).toEqual(theme);

    expect(await deleteCampaignSection(db.pool, 'malgovia', 'theme')).toBe(true);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.theme).toBeUndefined();
  });

  it('gameStart overlays the base template intro for DB-born campaigns', async () => {
    const db = makeContentDb({ campaigns: { ghost: { gameStart: 'Boo. The tale begins.' } } });
    const contexts: Record<string, Context> = {};
    await refreshCampaignOverlay(db.pool, contexts, {}, 'ghost');
    expect(contexts.ghost.campaign?.intro).toBe('Boo. The tale begins.');
    // Template machinery still present under the overridden opening.
    expect(contexts.ghost.campaign?.rooms.length).toBeGreaterThan(0);
  });

  it('room NPCs build the campaign.npcs map with Commoner defaults on refresh', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const rope = { id: 'rope', name: 'Rope (50 ft)', type: 'gear' };
    const code = codeCtx({
      id: 'malgovia',
      lootTable: [rope] as never,
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [],
        npcs: { 'code-npc': { id: 'code-npc', roomId: 'code-room', name: 'Old Code Friend' } },
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [
      {
        ...ROOM_B,
        npcs: [
          {
            id: 'old-hob',
            name: 'Old Hob',
            attitude: 'friendly',
            greeting: 'Evening.',
            firstGreeting: 'New faces! Welcome.',
            goodbye: 'Mind the step.',
            factionId: 'millers',
            pos: { x: 1, y: 1 },
            shop: [
              { itemId: 'rope', price: 1 },
              { itemId: 'vanished-wares', price: 9 },
            ],
          },
        ],
      },
    ]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const npcs = contexts.malgovia.campaign?.npcs ?? {};
    const hob = npcs['old-hob']!;
    // Stamped into its room, social surface intact, SRD Commoner-style
    // stat-block defaults, dialogue defaults to an empty tree.
    expect(hob.roomId).toBe('cellar');
    expect(hob.greeting).toBe('Evening.');
    // NPC narrative hooks pass through; the unauthored one stays absent.
    expect(hob.firstGreeting).toBe('New faces! Welcome.');
    expect(hob.goodbye).toBe('Mind the step.');
    expect('firstGoodbye' in hob).toBe(false);
    expect(hob.attitude).toBe('friendly');
    expect(hob.pos).toEqual({ x: 1, y: 1 });
    expect(hob.hp).toBe(4);
    expect(hob.ac).toBe(10);
    expect(hob.damage).toBe('1d4');
    expect(hob.toHit).toBe(2);
    expect(hob.xp).toBe(0);
    expect(hob.responses).toEqual([]);
    // The shop kept the real item and dropped the unknown one (warned);
    // the faction tie rides through for tier pricing.
    expect(hob.shop).toEqual([{ itemId: 'rope', price: 1 }]);
    expect(hob.factionId).toBe('millers');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('vanished-wares'));
    // Rooms-wholesale: the code npcs map is replaced entirely.
    expect(npcs['code-npc']).toBeUndefined();
    warn.mockRestore();
  });

  it('gated dialogue (condition/once/consequences) passes through to the engine NPC', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: { world_name: 'Malgovia', intro: 'x', rooms: [], npcs: {} } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const gated = {
      label: 'About that job…',
      reply: 'Bring the ledger.',
      condition: { fact: 'flags', path: '$.knows_password', operator: 'equal', value: true },
    };
    const oneShot = {
      label: 'A little bird told me a password',
      reply: 'So you know Hob.',
      once: true,
      consequences: [{ type: 'set_flag', key: 'knows_password', value: true }],
    };
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [
      {
        ...ROOM_B,
        npcs: [
          {
            id: 'smuggler',
            name: 'The Smuggler',
            attitude: 'friendly',
            greeting: 'Looking for something?',
            responses: [gated, oneShot],
          },
        ],
      },
    ]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const smuggler = contexts.malgovia.campaign?.npcs?.['smuggler'];
    // The dialogue tree reaches the engine verbatim — gates and all.
    expect(smuggler?.responses).toEqual([gated, oneShot]);
  });

  it('zone encounter tables warn-skip unknown creatures on refresh', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      enemyTemplates: [{ name: 'Wolf', hp: 11, ac: 13, damage: '2d4', toHit: 4, xp: 50 }] as never,
      campaign: { world_name: 'Malgovia', intro: 'x', rooms: [] } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const grid = G(12, 10);
    grid[0][0] = { t: 'plains', ez: 'wilds' };
    await putCampaignSection(db.pool, 'malgovia', 'regions', [
      {
        ...REGION_A,
        grid,
        encounterZones: [
          {
            id: 'wilds',
            name: 'Wilds',
            tier: 1,
            encounterChance: 0.1,
            encounterTable: ['Wolf', 'Vanished Horror'],
          },
        ],
      },
    ]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    // The known creature survives; the unknown one is dropped with a warning.
    expect(contexts.malgovia.campaign?.regions?.[0].encounterZones?.[0].encounterTable).toEqual([
      'Wolf',
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Vanished Horror'));
    warn.mockRestore();
  });

  it('room loot placements materialize against the composed loot table on refresh', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const dagger = { id: 'dagger', name: 'Dagger', type: 'weapon', damage: '1d4' };
    const code = codeCtx({
      id: 'malgovia',
      lootTable: [dagger] as never,
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [],
        loot: { 'code-room': [{ id: 'old', name: 'Old Thing' }] },
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [
      {
        ...ROOM_B,
        loot: [{ itemId: 'dagger', pos: { x: 2, y: 1 } }, { itemId: 'vanished-relic' }],
      },
    ]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const campaign = contexts.malgovia.campaign!;
    // The placement is the FULL item + the placement pos; key stays
    // engine-derived. The unknown item id was skipped with a warning.
    expect(campaign.loot?.cellar).toEqual([{ ...dagger, pos: { x: 2, y: 1 } }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('vanished-relic'));
    // Rooms-wholesale: the code placed-loot map is replaced entirely.
    expect(campaign.loot?.['code-room']).toBeUndefined();
    warn.mockRestore();
  });

  it('room enemy placements materialize against the composed bestiary on refresh', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const goblin = {
      name: 'Goblin',
      cr: 0.25,
      hp: 7,
      ac: 15,
      damage: '1d6+2',
      toHit: 4,
      xp: 50,
      creatureType: 'humanoid' as const,
    };
    const code = codeCtx({
      id: 'malgovia',
      enemyTemplates: [goblin] as never,
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [{ id: 'code-room', name: 'Code Room', desc: 'd' }],
        enemies: { 'code-room': [{ id: 'code-room#0', name: 'Old Foe' }] },
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [
      { ...ROOM_B, enemies: [{ name: 'Goblin', count: 2 }, { name: 'Vanished Horror' }] },
    ]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const campaign = contexts.malgovia.campaign!;
    // Two goblins, instance ids in the code convention, template stats +
    // creatureType carried, base HP (party scaling stays seed-time).
    const placed = campaign.enemies?.cellar ?? [];
    expect(placed.map((e) => e.id)).toEqual(['cellar#0', 'cellar#1']);
    expect(placed[0].name).toBe('Goblin');
    expect(placed[0].hp).toBe(7);
    expect(placed[0].ac).toBe(15);
    expect(placed[0].creatureType).toBe('humanoid');
    // The unknown template was skipped with a warning, not an error.
    expect(placed).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Vanished Horror'));
    // Rooms-wholesale: the code placed-enemy map is replaced entirely.
    expect(campaign.enemies?.['code-room']).toBeUndefined();
    warn.mockRestore();
  });

  it('DB rooms with no placements still replace the code enemy map (empty)', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [],
        enemies: { 'code-room': [{ id: 'code-room#0', name: 'Old Foe' }] },
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [ROOM_B]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.enemies).toEqual({});
  });

  it('DB rooms replace the campaign rooms wholesale on refresh', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [{ id: 'code-room', name: 'Code Room', desc: 'd' }],
        regions: [{ id: 'code-region' } as never],
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'rooms', [ROOM_A, ROOM_B]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const campaign = contexts.malgovia.campaign!;
    // DB rooms in engine form; the code rooms are gone (wholesale replace);
    // untouched sections (regions) stay code-supplied.
    expect(campaign.rooms.map((r) => r.id)).toEqual(['taproom', 'cellar']);
    expect(campaign.rooms[0].gridWidth).toBe(8);
    expect(campaign.regions?.map((r) => r.id)).toEqual(['code-region']);

    // Delete → refresh restores the code rooms.
    await deleteCampaignSection(db.pool, 'malgovia', 'rooms');
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    expect(contexts.malgovia.campaign?.rooms.map((r) => r.id)).toEqual(['code-room']);
  });

  it('DB towns without DB regions still fold in, keeping the code regions', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const code = codeCtx({
      id: 'malgovia',
      campaign: {
        world_name: 'Malgovia',
        intro: 'x',
        rooms: [],
        regions: [{ id: 'code-region' } as never],
      } as never,
    });
    const contexts: Record<string, Context> = { malgovia: code };
    await putCampaignSection(db.pool, 'malgovia', 'towns', [TOWN_A]);
    await refreshCampaignOverlay(db.pool, contexts, { malgovia: code }, 'malgovia');
    const campaign = contexts.malgovia.campaign!;
    expect(campaign.towns?.map((t) => t.id)).toEqual(['oakvale']);
    expect(campaign.regions?.map((r) => r.id)).toEqual(['code-region']);
  });

  it('regions round-trip their sites (child rows) in order; replace-all cascades them', async () => {
    const db = makeContentDb({ campaigns: { malgovia: {} } });
    const withSites: CampaignRegion = {
      ...REGION_A,
      onEnter: 'The mists part as you crest the ridge.',
      sites: [
        { id: 'oakvale', name: 'Oakvale', pos: { x: 1, y: 1 }, kind: 'town', townId: 'oakvale' },
        {
          id: 'old-crypt',
          name: 'The Old Crypt',
          pos: { x: 5, y: 5 },
          kind: 'local',
          entryRoomId: 'crypt-entrance',
          icon: 'tombstone',
          desc: 'A sunken door in the hillside.',
          onEnter: 'Cold air breathes up from the dark.',
        },
        {
          id: 'north-pass',
          name: 'The North Pass',
          pos: { x: 2, y: 0 },
          kind: 'region',
          regionId: REGION_B.id,
          entryPos: { x: 0, y: 3 },
        },
      ],
    };
    expect(await putCampaignSection(db.pool, 'malgovia', 'regions', [withSites, REGION_B])).toBe(
      true
    );
    const back = await getCampaignRegions(db.pool, 'malgovia');
    expect(back).toEqual([withSites, REGION_B]);
    // Optional fields absent (not null) and siteless regions carry no key.
    expect('townId' in back[0].sites![1]).toBe(false);
    expect('sites' in back[1]).toBe(false);

    // Replace-all with a siteless list drops the child rows too.
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    expect(await getCampaignRegions(db.pool, 'malgovia')).toEqual([REGION_A]);
  });

  it('reports a missing campaign and reads back stored data', async () => {
    const db = makeContentDb({ campaigns: { malgovia: { gameStart: 'A new dawn.' } } });
    expect(await getCampaignData(db.pool, 'malgovia')).toEqual({ gameStart: 'A new dawn.' });
    expect(await getCampaignData(db.pool, 'nope')).toBeNull();
    expect(await putCampaignSection(db.pool, 'nope', 'gameStart', 'x')).toBe(false);
    expect(await deleteCampaignSection(db.pool, 'nope', 'gameStart')).toBe(false);
  });

  it('DB-born campaigns (no code context) resolve over the base template', async () => {
    const db = makeContentDb({ campaigns: { ghost: { displayNoun: 'boo' } } });
    const contexts: Record<string, Context> = {};
    await refreshCampaignOverlay(db.pool, contexts, {}, 'ghost');
    const ghost = contexts.ghost;
    expect(ghost).toBeDefined();
    // Identity comes from the campaign, machinery from the base template,
    // DB sections overlay it.
    expect(ghost.id).toBe('ghost');
    expect(ghost.displayNoun).toBe('boo');
    expect(Object.keys(ghost.classHitDie).length).toBeGreaterThan(0);
    expect(ghost.campaign?.rooms.length).toBeGreaterThan(0);
    // The template opening is never empty — the gameStart section's code
    // fallback serves it, so the editor never starts from null.
    expect(ghost.campaign?.intro.length).toBeGreaterThan(0);
    expect(ghost.narratives.genericArrival.length).toBeGreaterThan(0);
  });
});

describe('dbRegionsToEngine', () => {
  it('converts the dense grid to sparse terrain (plains is the engine default)', () => {
    const grid = G(3, 2);
    grid[0][1] = { t: 'forest' };
    grid[1][2] = { t: 'water' };
    const [region] = dbRegionsToEngine([{ ...REGION_A, grid }]);
    expect(region.gridWidth).toBe(3);
    expect(region.gridHeight).toBe(2);
    expect(region.terrain).toEqual([
      { pos: { x: 1, y: 0 }, type: 'forest' },
      { pos: { x: 2, y: 1 }, type: 'water' },
    ]);
    // An all-plains grid carries no terrain key at all.
    expect(dbRegionsToEngine([REGION_A])[0].terrain).toBeUndefined();
  });

  it('materializes encounter-zone cells from grid `ez` tags (and drops empty zones)', () => {
    const grid = G(3, 2);
    grid[0][1] = { t: 'plains', ez: 'wilds' };
    grid[1][2] = { t: 'plains', ez: 'wilds' };
    const [region] = dbRegionsToEngine([
      {
        ...REGION_A,
        grid,
        encounterZones: [
          { id: 'wilds', name: 'Wilds', tier: 2, encounterChance: 0.2, encounterTable: ['Wolf'] },
          { id: 'empty', name: 'Empty', tier: 1, encounterChance: 0.1, encounterTable: ['Goblin'] },
        ],
      },
    ]);
    expect(region.encounterZones).toHaveLength(1); // "empty" dropped (no painted cells)
    expect(region.encounterZones![0]).toMatchObject({ id: 'wilds', tier: 2, encounterChance: 0.2 });
    expect(region.encounterZones![0].cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('puts the starting region first (initMapState opens at regions[0])', () => {
    const converted = dbRegionsToEngine([REGION_B, REGION_A]); // A is the starter
    expect(converted.map((r) => r.id)).toEqual(['malgovia', 'frost-reach']);
  });

  it('passes sites and scalars through untouched', () => {
    const withSites: CampaignRegion = {
      ...REGION_A,
      onEnter: 'The mists part.',
      sites: [
        {
          id: 'old-crypt',
          name: 'The Old Crypt',
          pos: { x: 5, y: 5 },
          kind: 'local',
          entryRoomId: 'crypt-entrance',
          icon: 'tombstone',
          onEnter: 'Cold air breathes up from the dark.',
        },
      ],
    };
    const [region] = dbRegionsToEngine([withSites]);
    expect(region.sites).toEqual(withSites.sites);
    expect(region.feetPerSquare).toBe(5280);
    expect(region.desc).toBe('A mist-shrouded vale.');
    expect(region.onEnter).toBe('The mists part.');
  });
});

describe('dbTownsToEngine', () => {
  it('converts the dense grid to sparse terrain with derived dims', () => {
    const grid = G(10, 8);
    grid[0][2] = { t: 'water' };
    grid[3][4] = { t: 'forest' };
    const [town] = dbTownsToEngine([{ ...TOWN_A, grid }]);
    expect(town.gridWidth).toBe(10);
    expect(town.gridHeight).toBe(8);
    expect(town.terrain).toEqual([
      { pos: { x: 2, y: 0 }, type: 'water' },
      { pos: { x: 4, y: 3 }, type: 'forest' },
    ]);
    // An all-plains grid carries no terrain key at all.
    expect(dbTownsToEngine([TOWN_A])[0].terrain).toBeUndefined();
  });

  it('passes venues, floor, and scalars through; venueless towns get []', () => {
    const [town, lean] = dbTownsToEngine([TOWN_A, TOWN_B]);
    expect(town.venues).toEqual(TOWN_A.venues);
    expect(town.floor).toBe('dirt');
    expect(town.feetPerSquare).toBe(25);
    expect(town.startPos).toEqual({ x: 1, y: 1 });
    expect(town.desc).toBe('A timber town under the old oak.');
    // The engine Town shape requires venues; lean towns get an empty list.
    expect(lean.venues).toEqual([]);
    expect('floor' in lean).toBe(false);
  });
});

describe('applyCampaignOverlays', () => {
  it('replaces code contexts in place and bases DB-born rows on the template', async () => {
    const contexts: Record<string, Context> = {
      malgovia: codeCtx({ id: 'malgovia', displayNoun: 'vale' }),
      sandbox: codeCtx({ id: 'sandbox', displayNoun: 'sandbox' }),
    };
    const db = makeContentDb({
      campaigns: {
        malgovia: { displayNoun: 'db-vale' },
        sandbox: {},
        ghost: { displayNoun: 'boo' }, // DB-born — no code context
      },
    });
    await putCampaignSection(db.pool, 'malgovia', 'regions', [REGION_A]);
    await applyCampaignOverlays(db.pool, contexts);
    expect(contexts.malgovia.displayNoun).toBe('db-vale');
    // DB regions land in the campaign block, converted to engine form.
    expect(contexts.malgovia.campaign?.regions?.map((r) => r.id)).toEqual(['malgovia']);
    expect(contexts.sandbox.displayNoun).toBe('sandbox');
    // The DB-born campaign joined the live map, based on the template.
    expect(Object.keys(contexts).sort()).toEqual(['ghost', 'malgovia', 'sandbox']);
    expect(contexts.ghost.id).toBe('ghost');
    expect(contexts.ghost.displayNoun).toBe('boo');
    expect(contexts.ghost.campaign?.rooms.length).toBeGreaterThan(0);
  });
});
