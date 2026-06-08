// Dev tool (NOT shipped): serialize a CODE campaign Context into its DB
// section payloads and write them to the dev DB, then verify the campaign
// resolves identically over the base template (no code). Used once to
// generate migration 032 (the seed) before the code campaigns are deleted.
//
//   docker compose exec backend npx tsx scripts/serializeCampaign.ts sandbox malgovia
//
// It writes through the SAME put* functions the content API uses, so the
// stored shape is exactly what getCampaign{Regions,Towns,Rooms} reads back
// (the dbRoomsToEngine inverse is sidestepped — we hand it the painter
// shape). Every payload is validated against CAMPAIGN_SECTION_SCHEMAS, then
// a resolve-over-base diff against the live code context is the fidelity
// gate. Read-then-pg_dump the rows to author the seed migration.

import type {
  CampaignRegion,
  CampaignRegionCell,
  CampaignRoom,
  CampaignRoomCell,
  CampaignRoomEnemy,
  CampaignRoomLoot,
  CampaignRoomNpc,
  CampaignTown,
  EditableSection,
  RoomCellMech,
} from '../src/services/campaignContent.js';
import type {
  Context,
  Enemy,
  EnemyTemplate,
  GridPos,
  LootItem,
  PlacedLoot,
  PlacedNpc,
  Region,
  Room,
  TerrainCell,
  Town,
} from '../src/types.js';
import { getItemCatalog, putCampaignCustomItems } from '../src/services/itemCatalog.js';
import { getMonsterCatalog, putCampaignCustomMonsters } from '../src/services/monsterCatalog.js';
import {
  putCampaignRegions,
  putCampaignRooms,
  putCampaignSection,
  putCampaignTowns,
  refreshCampaignOverlay,
} from '../src/services/campaignContent.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../src/routes/schemas.js';
import { CODE_CONTEXTS } from '../src/services/contextStore.js';
import { pool } from '../src/db/pool.js';

// ─── Engine → DB inverse converters ──────────────────────────────────────────

// Rebuild a dense [y][x] {t, tier?} grid from an engine map's dims + sparse
// terrain + (regions) per-cell tier zones.
function denseRegionGrid(
  width: number,
  height: number,
  terrain: TerrainCell[] | undefined,
  tierZones: { tier: number; from: GridPos; to: GridPos }[] | undefined
): CampaignRegionCell[][] {
  const grid: CampaignRegionCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ t: 'plains' }) as CampaignRegionCell)
  );
  for (const c of terrain ?? []) grid[c.pos.y][c.pos.x] = { ...grid[c.pos.y][c.pos.x], t: c.type };
  for (const z of tierZones ?? []) {
    for (let y = z.from.y; y <= z.to.y; y++)
      for (let x = z.from.x; x <= z.to.x; x++) grid[y][x] = { ...grid[y][x], tier: z.tier };
  }
  return grid;
}

function regionToDb(r: Region): CampaignRegion {
  return {
    id: r.id,
    name: r.name,
    isStartingRegion: false, // set per-campaign below (region[0] is the start)
    ...(r.desc !== undefined ? { desc: r.desc } : {}),
    ...(r.onEnter !== undefined ? { onEnter: r.onEnter } : {}),
    ...(r.onFirstEnter !== undefined ? { onFirstEnter: r.onFirstEnter } : {}),
    ...(r.onExit !== undefined ? { onExit: r.onExit } : {}),
    ...(r.onFirstExit !== undefined ? { onFirstExit: r.onFirstExit } : {}),
    feetPerSquare: r.feetPerSquare,
    grid: denseRegionGrid(r.gridWidth ?? 0, r.gridHeight ?? 0, r.terrain, r.tierZones),
    startPos: r.startPos,
    ...(r.encounterChance !== undefined ? { encounterChance: r.encounterChance } : {}),
    ...(r.encounterTable && r.encounterTable.length > 0
      ? { encounterTable: r.encounterTable }
      : {}),
    ...(r.baseTier !== undefined ? { baseTier: r.baseTier } : {}),
    ...(r.sites && r.sites.length > 0 ? { sites: r.sites.map((s) => ({ ...s })) } : {}),
  };
}

function townToDb(t: Town): CampaignTown {
  const grid: CampaignRegionCell[][] = Array.from({ length: t.gridHeight ?? 0 }, () =>
    Array.from({ length: t.gridWidth ?? 0 }, () => ({ t: 'plains' }) as CampaignRegionCell)
  );
  for (const c of t.terrain ?? []) grid[c.pos.y][c.pos.x] = { t: c.type };
  return {
    id: t.id,
    name: t.name,
    ...(t.desc !== undefined ? { desc: t.desc } : {}),
    ...(t.onEnter !== undefined ? { onEnter: t.onEnter } : {}),
    ...(t.onFirstEnter !== undefined ? { onFirstEnter: t.onFirstEnter } : {}),
    ...(t.onExit !== undefined ? { onExit: t.onExit } : {}),
    ...(t.onFirstExit !== undefined ? { onFirstExit: t.onFirstExit } : {}),
    feetPerSquare: t.feetPerSquare,
    grid,
    startPos: t.startPos,
    ...(t.floor !== undefined ? { floor: t.floor } : {}),
    ...(t.venues && t.venues.length > 0 ? { venues: t.venues.map((v) => ({ ...v })) } : {}),
  };
}

// Rebuild a room's dense {t?, m?} grid from dims + sparse terrain + the five
// mechanical arrays. A cell may carry at most one mech flag (the painter's
// model); authored overlap (rare) collapses to the last writer.
function denseRoomGrid(room: Room): CampaignRoomCell[][] {
  // Floor at 1×1 — a vestigial room (e.g. malgovia's never-entered
  // opening-frame `millhaven_square`) carries no dims; the rooms schema
  // still needs a grid, and the room is never rendered so a 1×1 is inert.
  const grid: CampaignRoomCell[][] = Array.from({ length: Math.max(1, room.gridHeight ?? 0) }, () =>
    Array.from({ length: Math.max(1, room.gridWidth ?? 0) }, () => ({}) as CampaignRoomCell)
  );
  for (const c of room.terrain ?? []) grid[c.pos.y][c.pos.x].t = c.type;
  const mechArrays: [RoomCellMech, GridPos[] | undefined][] = [
    ['obstacle', room.obstacles],
    ['difficult', room.difficultTerrain],
    ['climb', room.climbTerrain],
    ['swim', room.swimTerrain],
    ['cover', room.coverPositions],
  ];
  for (const [mech, cells] of mechArrays) for (const p of cells ?? []) grid[p.y][p.x].m = mech;
  return grid;
}

// Group a room's resolved Enemy instances into {name, count} placements,
// preserving per-instance death-drop overrides. Instances of the same name
// that differ ONLY in goldDrop/drops split into separate placements so the
// override travels.
function roomEnemiesToDb(enemies: Enemy[] | undefined): CampaignRoomEnemy[] {
  const out: CampaignRoomEnemy[] = [];
  const ids: string[] = []; // the source instance id of each placement's first enemy
  for (const e of enemies ?? []) {
    const last = out[out.length - 1];
    const sameDrops =
      last &&
      last.name === e.name &&
      (last.goldDrop ?? null) === (e.goldDrop ?? null) &&
      JSON.stringify(last.drops ?? null) === JSON.stringify(e.drops ?? null);
    if (sameDrops) {
      last.count = (last.count ?? 1) + 1;
    } else {
      ids.push(e.id);
      out.push({
        name: e.name,
        count: 1,
        ...(e.goldDrop !== undefined ? { goldDrop: e.goldDrop } : {}),
        ...(e.drops !== undefined ? { drops: e.drops } : {}),
      });
    }
  }
  // Pin the explicit id only for single (count 1) placements — the materializer
  // regenerates positional ids for multi-enemy groups, which already match.
  out.forEach((p, i) => {
    if ((p.count ?? 1) === 1) p.id = ids[i];
  });
  return out;
}

function roomLootToDb(loot: PlacedLoot[] | undefined): CampaignRoomLoot[] {
  return (loot ?? []).map((l) => ({ itemId: l.id, ...(l.pos ? { pos: l.pos } : {}) }));
}

// Project a placed NPC back to the room-NPC authoring shape (drop runtime
// derived fields; pass the dialogue tree through verbatim).
function npcToDb(n: PlacedNpc): CampaignRoomNpc {
  return {
    id: n.id,
    name: n.name,
    ...(n.proper_noun ? { proper_noun: n.proper_noun } : {}),
    attitude: n.attitude,
    greeting: n.greeting,
    ...(n.firstGreeting ? { firstGreeting: n.firstGreeting } : {}),
    ...(n.goodbye ? { goodbye: n.goodbye } : {}),
    ...(n.firstGoodbye ? { firstGoodbye: n.firstGoodbye } : {}),
    ...(n.responses ? { responses: n.responses as CampaignRoomNpc['responses'] } : {}),
    ...(n.persuasionDC !== undefined ? { persuasionDC: n.persuasionDC } : {}),
    ...(n.pos ? { pos: n.pos } : {}),
    ...(n.icon ? { icon: n.icon } : {}),
    ...(n.shop ? { shop: n.shop } : {}),
    ...(n.shopGold !== undefined ? { shopGold: n.shopGold } : {}),
    ...(n.factionId ? { factionId: n.factionId } : {}),
    ...(n.hp !== undefined ? { hp: n.hp } : {}),
    ...(n.ac !== undefined ? { ac: n.ac } : {}),
    ...(n.damage !== undefined ? { damage: n.damage } : {}),
    ...(n.toHit !== undefined ? { toHit: n.toHit } : {}),
    ...(n.xp !== undefined ? { xp: n.xp } : {}),
  };
}

function roomToDb(
  room: Room,
  enemies: Record<string, Enemy[]> | undefined,
  loot: Record<string, PlacedLoot[]> | undefined,
  npcs: Record<string, PlacedNpc> | undefined
): CampaignRoom {
  const roomNpcs = Object.values(npcs ?? {}).filter((n) => n.roomId === room.id);
  const e = roomEnemiesToDb(enemies?.[room.id]);
  const l = roomLootToDb(loot?.[room.id]);
  return {
    id: room.id,
    name: room.name,
    desc: room.desc,
    ...(room.onEnter !== undefined ? { onEnter: room.onEnter } : {}),
    ...(room.onFirstEnter !== undefined ? { onFirstEnter: room.onFirstEnter } : {}),
    ...(room.onExit !== undefined ? { onExit: room.onExit } : {}),
    ...(room.onFirstExit !== undefined ? { onFirstExit: room.onFirstExit } : {}),
    grid: denseRoomGrid(room),
    // Vestigial never-entered rooms (e.g. malgovia's millhaven_square, which only
    // frames the opening narrative — the party starts on the regional grid) carry
    // no entryPos; floor it to the top-left of the synthesized 1×1 grid.
    entryPos: room.entryPos ?? { x: 0, y: 0 },
    ...(room.exits && room.exits.length > 0 ? { exits: room.exits.map((x) => ({ ...x })) } : {}),
    ...(room.lighting !== undefined ? { lighting: room.lighting } : {}),
    ...(room.floor !== undefined ? { floor: room.floor } : {}),
    ...(room.canRest !== undefined ? { canRest: room.canRest } : {}),
    ...(e.length > 0 ? { enemies: e } : {}),
    ...(l.length > 0 ? { loot: l } : {}),
    ...(roomNpcs.length > 0 ? { npcs: roomNpcs.map(npcToDb) } : {}),
    ...(room.objects && room.objects.length > 0
      ? { objects: room.objects.map((o) => ({ ...o })) }
      : {}),
    ...(room.trap ? { trap: { ...room.trap } } : {}),
  };
}

// The EnemyTemplate fields (mirrors EnemyTemplateSchema). A live `Enemy`
// instance carries these plus runtime-only keys (`id`, `maxHp`,
// `legendary_action_points`) and omits `cr` — so we pick the template-shaped
// subset and default the required `cr` (it never reaches a live enemy:
// `materializeEnemy` doesn't carry it, so the value is cosmetic).
const TEMPLATE_FIELDS = [
  'name',
  'cr',
  'hp',
  'ac',
  'damage',
  'toHit',
  'xp',
  'creatureType',
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
  'onHitEffect',
  'multiattack',
  'resistances',
  'vulnerabilities',
  'immunities',
  'condition_immunities',
  'damageType',
  'packTactics',
  'bloodiedFrenzy',
  'bonusDamage',
  'bonusDamageType',
  'undeadFortitude',
  'lifeDrain',
  'regeneration',
  'regenBlockedBy',
  'parry',
  'parryBonus',
  'rampage',
  'aura',
  'breathWeapon',
  'spells',
  'castChance',
  'spellSaveDC',
  'spellAttackBonus',
  'attackReachFt',
  'speedFt',
  'darkvision_ft',
  'sunlightSensitivity',
  'phases',
  'legendary_actions',
  'legendary_pool',
  'lair_actions',
  'drops',
  'goldDrop',
] as const;

// Derive a custom-monster template from a placed instance. This is the
// canonical-stats source for serialization: the DB enemy then materializes
// from exactly the fields the code instance carried (the `place()` helper
// strips some — e.g. ability scores on minions — and we faithfully reproduce
// that), so the resolved enemy matches the code enemy field-for-field.
function instanceToTemplate(e: Enemy): EnemyTemplate {
  const src = e as unknown as Record<string, unknown>;
  const t: Record<string, unknown> = {};
  for (const k of TEMPLATE_FIELDS) if (src[k] !== undefined) t[k] = src[k];
  if (t.cr === undefined) t.cr = 1; // inert default — never reaches a live enemy
  return t as unknown as EnemyTemplate;
}

// ─── Build + write ───────────────────────────────────────────────────────────

function validate(section: string, value: unknown): unknown {
  const schema = CAMPAIGN_SECTION_SCHEMAS[section];
  const r = schema.safeParse(value);
  if (!r.success) {
    console.error(`  ✗ ${section}: schema rejected —`, JSON.stringify(r.error.issues.slice(0, 4)));
    throw new Error(`section ${section} failed validation`);
  }
  return r.data;
}

async function serialize(
  id: string,
  catalogItems: Map<string, LootItem>,
  catalogMonsterNames: Set<string>
) {
  const catalogItemIds = new Set(catalogItems.keys());
  const code = CODE_CONTEXTS[id];
  if (!code) throw new Error(`no code context '${id}'`);
  const c = code.campaign;
  if (!c) throw new Error(`code context '${id}' has no campaign block`);
  console.log(`\n=== ${id} ===`);

  // Ensure the campaigns row exists (registry sync created it at boot).
  const { rowCount } = await pool.query('SELECT 1 FROM campaigns WHERE id = $1', [id]);
  if (!rowCount) throw new Error(`campaigns row '${id}' missing — start the backend once first`);

  // JSONB sections (only write those the code campaign actually has).
  const jsonb: [EditableSection, unknown][] = [];
  if (c.intro) jsonb.push(['gameStart', c.intro]);
  if (c.world_name) jsonb.push(['worldName', c.world_name]);
  if (code.tagline) jsonb.push(['tagline', code.tagline]);
  if (code.previewArt) jsonb.push(['previewArt', code.previewArt]);
  if (code.narratives) jsonb.push(['narratives', code.narratives]);
  if (c.quests && c.quests.length) jsonb.push(['quests', c.quests]);
  if (c.factions && c.factions.length) jsonb.push(['factions', c.factions]);
  if (code.rules && code.rules.length) jsonb.push(['rules', code.rules]);
  if (code.terrainArt) jsonb.push(['terrainArt', code.terrainArt]);
  if (code.theme) jsonb.push(['theme', code.theme]);
  if (code.backgrounds && code.backgrounds.length) jsonb.push(['backgrounds', code.backgrounds]);
  if (code.classSpells) jsonb.push(['classSpells', code.classSpells]);
  if (code.classStartingLoot) jsonb.push(['classStartingLoot', code.classStartingLoot]);
  if (code.classStartingEquipment)
    jsonb.push(['classStartingEquipment', code.classStartingEquipment]);
  if (c.recommendedPartySize !== undefined)
    jsonb.push([
      'recommendedParty',
      {
        size: c.recommendedPartySize,
        composition: c.recommendedComposition ?? [],
      },
    ]);

  for (const [section, value] of jsonb) {
    validate(section, value);
    await putCampaignSection(pool, id, section, value);
    console.log(`  ✓ ${section}`);
  }

  // customItems = the campaign's own items (lootTable entries not in the ambient
  // catalog) PLUS any catalog item that the campaign places with a different
  // definition (e.g. malgovia's heavier Healing Potion, weight 4 vs the
  // catalog's 2). A custom item shadows the catalog by id in composeLootTable,
  // so the player picks up the campaign's exact item. Identity is compared
  // without `desc` — per-placement flavor text isn't representable in the DB
  // loot model (it carries only the item id), so it collapses to one value.
  const customItems = (code.lootTable ?? []).filter((i: LootItem) => !catalogItemIds.has(i.id));
  const customIds = new Set(customItems.map((i) => i.id));
  const identity = (it: object) =>
    JSON.stringify(canon({ ...(it as Record<string, unknown>), pos: undefined, desc: undefined }));
  const placedItems = new Map<string, LootItem>();
  for (const list of Object.values(c.loot ?? {}))
    for (const it of list) if (!placedItems.has(it.id)) placedItems.set(it.id, it);
  for (const [itemId, placed] of placedItems) {
    if (customIds.has(itemId)) continue;
    const cat = catalogItems.get(itemId);
    if (cat && identity(cat) !== identity(placed)) {
      const { pos, ...item } = placed as LootItem & { pos?: unknown };
      void pos;
      customItems.push(item as LootItem);
      customIds.add(itemId);
    }
  }
  if (customItems.length) {
    validate('customItems', customItems);
    await putCampaignCustomItems(pool, id, customItems);
    console.log(`  ✓ customItems (${customItems.length})`);
  }

  // customMonsters = every non-catalog monster the campaign references, either
  // placed in a room (c.enemies) or drawn by a region encounter table. Placed
  // monsters are serialized FROM their live instance (instanceToTemplate) so the
  // DB enemy materializes field-for-field identical to the code enemy, including
  // the `place()` strip quirk (e.g. minions with no ability scores). Monsters
  // referenced only by an encounter table have no instance, so we fall back to
  // their full code.enemyTemplates stat block.
  const firstInstance = new Map<string, Enemy>();
  for (const list of Object.values(c.enemies ?? {}))
    for (const e of list) if (!firstInstance.has(e.name)) firstInstance.set(e.name, e);
  const referencedNames = new Set<string>(firstInstance.keys());
  for (const r of c.regions ?? []) for (const n of r.encounterTable ?? []) referencedNames.add(n);

  const templatesByName = new Map<string, EnemyTemplate>();
  for (const t of code.enemyTemplates ?? []) templatesByName.set(t.name, t);

  const customMonsters: EnemyTemplate[] = [];
  for (const name of referencedNames) {
    const inst = firstInstance.get(name);
    if (inst) {
      // Placed monster: serialize FROM the live instance so its campaign-specific
      // overrides survive (e.g. Bandit Captain's boosted damage die, minions'
      // stripped ability scores). A custom monster shadows the ambient catalog by
      // name in composeEnemyTemplates, so the placement resolves to these exact
      // stats — even when the base was a catalog creature.
      customMonsters.push(instanceToTemplate(inst));
    } else if (catalogMonsterNames.has(name)) {
      continue; // encounter-table monster the ambient catalog already supplies
    } else if (templatesByName.has(name)) {
      customMonsters.push(templatesByName.get(name)!);
    } else {
      console.error(`  ! no template or instance for referenced monster "${name}"`);
    }
  }
  if (customMonsters.length) {
    validate('customMonsters', customMonsters);
    await putCampaignCustomMonsters(pool, id, customMonsters);
    console.log(`  ✓ customMonsters (${customMonsters.length})`);
  }

  // Relational: regions (mark the first as the start), towns, rooms.
  if (c.regions && c.regions.length) {
    const regions = c.regions.map(regionToDb);
    regions[0].isStartingRegion = true;
    validate('regions', regions);
    await putCampaignRegions(pool, id, regions);
    console.log(`  ✓ regions (${regions.length})`);
  }
  if (c.towns && c.towns.length) {
    const towns = c.towns.map(townToDb);
    validate('towns', towns);
    await putCampaignTowns(pool, id, towns);
    console.log(`  ✓ towns (${towns.length})`);
  }
  if (c.rooms && c.rooms.length) {
    const rooms = c.rooms.map((r) => roomToDb(r, c.enemies, c.loot, c.npcs));
    validate('rooms', rooms);
    await putCampaignRooms(pool, id, rooms);
    console.log(`  ✓ rooms (${rooms.length})`);
  }
}

// ─── Fidelity gate: resolve over base (no code) and diff vs the code context ──

// Canonicalize for comparison: recursively sort object keys (JSONB does NOT
// preserve key order across a DB round-trip, so raw JSON.stringify reports
// key-order noise as drift) while leaving array order intact (JSONB preserves
// it, and it's meaningful). An empty map normalizes to undefined so a code
// `undefined` and a resolved `{}` (no entries) compare equal.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    if (keys.length === 0) return undefined;
    const o: Record<string, unknown> = {};
    for (const k of keys) o[k] = canon((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

function diff(id: string, code: Context, resolved: Context): string[] {
  const drift: string[] = [];
  const j = (v: unknown) => JSON.stringify(canon(v));
  const cc = code.campaign;
  const rc = resolved.campaign;
  if (!cc || !rc) return ['missing campaign block'];

  // Compare enemies by stable fields (instances regenerate ids identically).
  const stable = (e: Enemy) => ({
    id: e.id,
    name: e.name,
    hp: e.hp,
    ac: e.ac,
    damage: e.damage,
    toHit: e.toHit,
    goldDrop: e.goldDrop,
    drops: e.drops,
    str: e.str,
    wis: e.wis,
    multiattack: e.multiattack,
  });
  for (const room of Object.keys({ ...cc.enemies, ...rc.enemies })) {
    const a = (cc.enemies?.[room] ?? []).map(stable);
    const b = (rc.enemies?.[room] ?? []).map(stable);
    if (j(a) !== j(b)) drift.push(`enemies[${room}]\n   code: ${j(a)}\n   db:   ${j(b)}`);
  }
  const eq: [string, unknown, unknown][] = [
    ['rooms', cc.rooms?.length, rc.rooms?.length],
    ['quests', cc.quests, rc.quests],
    ['factions', cc.factions, rc.factions],
    ['regions', normRegions(cc.regions), normRegions(rc.regions)],
    ['towns', normRegions(cc.towns), normRegions(rc.towns)],
    ['npcs', cc.npcs, rc.npcs],
    // Loot resolves the placed item from the composed loot table by id, so a
    // catalog item placed in code with per-placement flavor (desc) or a
    // narrower alias list collapses to the catalog definition. That's inert —
    // same item identity/heal/slot, and the catalog's aliases are a SUPERSET
    // (broader "take X" parsing). Compare on identity, not flavor.
    ['loot', normLoot(cc.loot), normLoot(rc.loot)],
    ['rules', code.rules, resolved.rules],
    ['narratives', code.narratives, resolved.narratives],
    ['world_name', cc.world_name, rc.world_name],
    ['intro', cc.intro, rc.intro],
  ];
  for (const [label, a, b] of eq) {
    if (j(a) === j(b)) continue;
    const path = firstDiff(canon(a), canon(b));
    drift.push(`${label}: differs at ${path.where}\n   code: ${path.a}\n   db:   ${path.b}`);
  }
  // The base template defaults recommendedPartySize to 1 when a campaign sets
  // none — only a code-specified value that changes is real drift.
  if (cc.recommendedPartySize !== undefined && cc.recommendedPartySize !== rc.recommendedPartySize)
    drift.push(
      `recommendedPartySize: code=${cc.recommendedPartySize} db=${rc.recommendedPartySize}`
    );
  return drift;
}

// Sort overland/town terrain (and legacy obstacle/difficult-terrain) cell
// arrays by position: the serializer rebuilds them in grid-scan order while the
// code authored them in arbitrary order — same SET, inert ordering.
function normRegions(regions: unknown): unknown {
  const byPos = (arr: unknown) =>
    Array.isArray(arr)
      ? [...arr].sort((a, b) => {
          const pa = (a as { pos: GridPos }).pos;
          const pb = (b as { pos: GridPos }).pos;
          return pa.y - pb.y || pa.x - pb.x;
        })
      : arr;
  if (!Array.isArray(regions)) return regions;
  return regions.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      ...o,
      terrain: byPos(o.terrain),
      obstacles: byPos(o.obstacles),
      difficultTerrain: byPos(o.difficultTerrain),
      // Compare the EFFECTIVE per-cell tier map, not the zone list: the
      // serializer round-trip rebuilds compact rectangles as one zone per cell
      // (e.g. 2 → 60), but `regionTierAt` reads the same value everywhere.
      tierZones: undefined,
      baseTier: undefined,
      tierGrid: tierGrid(o),
    };
  });
}

// Materialize a region's per-cell tier grid from baseTier + the (rectangular)
// tierZones (highest covering zone wins; default tier 1) — the canonical form
// `regionTierAt` resolves, independent of how the zones are grouped.
function tierGrid(r: Record<string, unknown>): number[][] | undefined {
  const W = r.gridWidth as number | undefined;
  const H = r.gridHeight as number | undefined;
  if (!W || !H) return undefined;
  const base = (r.baseTier as number | undefined) ?? 1;
  const zones = (r.tierZones as { tier: number; from: GridPos; to: GridPos }[] | undefined) ?? [];
  const grid: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      let t = base;
      for (const z of zones) {
        if (
          x >= Math.min(z.from.x, z.to.x) &&
          x <= Math.max(z.from.x, z.to.x) &&
          y >= Math.min(z.from.y, z.to.y) &&
          y <= Math.max(z.from.y, z.to.y)
        )
          t = Math.max(t, z.tier);
      }
      row.push(t);
    }
    grid.push(row);
  }
  return grid;
}

// Strip per-placement flavor (desc) and aliases from placed loot items — the
// DB loot model carries only the item id + pos, so these resolve from the
// composed catalog. Identity/heal/slot/etc. are still compared.
function normLoot(loot: unknown): unknown {
  if (!loot || typeof loot !== 'object') return loot;
  const out: Record<string, unknown> = {};
  for (const [room, items] of Object.entries(loot as Record<string, unknown[]>))
    out[room] = (items ?? []).map((it) => ({
      ...(it as object),
      desc: undefined,
      aliases: undefined,
    }));
  return out;
}

// Walk two canon'd values in lockstep, returning the path + values at the first
// divergence — so a region/town drift points at the exact field, not a 4 KB
// JSON blob.
function firstDiff(a: unknown, b: unknown, path = ''): { where: string; a: string; b: string } {
  const trunc = (v: unknown) => {
    const s = JSON.stringify(v);
    return s && s.length > 160 ? s.slice(0, 160) + '…' : (s ?? 'undefined');
  };
  if (JSON.stringify(a) === JSON.stringify(b)) return { where: path || '(root)', a: '=', b: '=' };
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return { where: `${path}.length`, a: String(a.length), b: String(b.length) };
    for (let i = 0; i < a.length; i++)
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i]))
        return firstDiff(a[i], b[i], `${path}[${i}]`);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)]))
      if (JSON.stringify(ao[k]) !== JSON.stringify(bo[k]))
        return firstDiff(ao[k], bo[k], path ? `${path}.${k}` : k);
  }
  return { where: path || '(root)', a: trunc(a), b: trunc(b) };
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('usage: serializeCampaign <id> [<id> ...]');
  const catalogItems = new Map((await getItemCatalog(pool)).map((i) => [i.id, i] as const));
  const catalogMonsterNames = new Set(
    (await getMonsterCatalog(pool)).map((m) => m.definition.name)
  );

  for (const id of ids) await serialize(id, catalogItems, catalogMonsterNames);

  // Fidelity: resolve each id over the BASE template (codeContexts = {}) and
  // diff vs the live code context.
  let failed = false;
  for (const id of ids) {
    const out: Record<string, Context> = {};
    await refreshCampaignOverlay(pool, out, {}, id);
    const drift = diff(id, CODE_CONTEXTS[id], out[id]);
    if (drift.length) {
      failed = true;
      console.error(`\n✗ ${id} DRIFT (${drift.length}):`);
      for (const d of drift) console.error('  - ' + d);
    } else {
      console.log(`\n✓ ${id} resolves over base identically`);
    }
  }
  await pool.end();
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
