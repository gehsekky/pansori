import { FLOOR_TILES, MARKER_TILES, TERRAIN, TERRAIN_TILES } from '../shared-types.js';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

// Zod schemas for request bodies on the auth + game routes. Each handler
// replaces a `req.body as { ... }` type assertion with `parse(req, schema)`.
//
// Philosophy: validate the *shape* at the boundary so malformed clients hit a
// 400 instead of crashing into the engine. Don't try to enforce game rules
// here (level caps, character class enums, etc.) — that's the engine's job.
// Schemas should be as loose as the handler actually needs.

// ─── Auth ────────────────────────────────────────────────────────────────────

export const TestLoginSchema = z
  .object({
    email: z.string().email().optional(),
    displayName: z.string().min(1).max(120).optional(),
  })
  .strict();

// ─── Game ────────────────────────────────────────────────────────────────────

const StatsSchema = z
  .object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  })
  .strict();

// Origin-feat picks that need player input at character creation. Today
// only Magic Initiate (Arcane / Divine / Primal) uses this — the player
// picks 2 cantrips + 1 L1 spell from the matching spell list. Other
// origin feats with player choice (Resilient ability pick, Skilled
// skill picks) aren't auto-applied at creation today so they don't
// route through this seam. Schema stays loose — `take_feat` re-validates
// every choice against the spellTable/feat config.
const FeatChoicesSchema = z
  .object({
    cantripChoices: z.array(z.string().min(1).max(60)).max(4).optional(),
    l1Choice: z.string().min(1).max(60).optional(),
  })
  .strict();

const CharacterInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    character_class: z.string().min(1).max(40),
    background_id: z.string().min(1).max(40).optional(),
    stats: StatsSchema.optional(),
    // How `stats` were generated, so the server can validate the spread.
    // Omitted (or 'manual') = trust the client (backward compatible).
    generation_method: z.enum(['point_buy', 'standard_array', 'manual']).optional(),
    portrait_url: z.string().max(2048).optional(),
    subclass: z.string().min(1).max(40).optional(),
    species: z.string().min(1).max(40).optional(),
    // 2024 class skill proficiencies — the player's chosen "N from the class
    // list". Re-validated server-side against the class's options; an invalid
    // or omitted list falls back to the curated default.
    class_skills: z.array(z.string().min(1).max(40)).max(18).optional(),
    // 2024 starting-equipment package id ('A' / 'B' / 'C'). The server resolves
    // it to items + GP; an invalid/omitted id falls back to the default package.
    starting_equipment: z.string().min(1).max(4).optional(),
    // 2024 Weapon Mastery picks (weapon ids). Re-validated against the weapons
    // the class may master; an invalid/omitted list falls back to the default.
    weapon_masteries: z.array(z.string().min(1).max(40)).max(8).optional(),
    // 2024 Fighting Style for the class's level-1 slot (Fighter). Re-validated;
    // invalid/omitted falls back to the default. Later picks (Fighter L7,
    // Paladin/Ranger L2) are made in-game.
    fighting_style: z.string().min(1).max(40).optional(),
    // SRD Cleric Divine Order (level 1) chosen at creation — 'protector' (Martial
    // weapons + Heavy armor) or 'thaumaturge' (an extra cantrip + WIS to Arcana/
    // Religion). `divine_order_cantrip` is the Thaumaturge cantrip pick (a Cleric
    // cantrip); re-validated server-side. Omitted = no order yet (the in-game
    // prompt remains as a fallback).
    divine_order: z.enum(['protector', 'thaumaturge']).optional(),
    divine_order_cantrip: z.string().min(1).max(40).optional(),
    // SRD Expertise picks chosen at creation (Rogue's two level-1 slots). Each
    // must be one of the character's proficient skills; re-validated server-
    // side, with an invalid/omitted list falling back to the first proficiencies.
    rogue_expertise: z.array(z.string().min(1).max(40)).max(8).optional(),
    // SRD caster spell picks at creation — chosen cantrips + level-1 spells from
    // the class's spell list. Re-validated server-side against the class's
    // options + counts; an invalid/omitted pick falls back to the curated default.
    caster_spells: z
      .object({
        cantrips: z.array(z.string().min(1).max(60)).max(12).optional(),
        l1: z.array(z.string().min(1).max(60)).max(12).optional(),
      })
      .strict()
      .optional(),
    feat_choices: FeatChoicesSchema.optional(),
    // 2024 background ability-score increase. Omitted = +1 to all three of the
    // background's listed abilities; supplied = +2 to `plus2` and +1 to `plus1`
    // (both must be among the background's three; the server re-validates).
    ability_bonus: z
      .object({
        plus2: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
        plus1: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
      })
      .strict()
      .optional(),
  })
  .strict();

export const NewSessionSchema = z
  .object({
    characters: z.array(CharacterInputSchema).min(1).max(8),
    context_id: z.string().min(1).max(80).optional(),
  })
  .strict();

export const EquipSchema = z
  .object({
    item_id: z.string().min(1).max(80),
    character_id: z.string().uuid().optional(),
  })
  .strict();

export const TransferSchema = z
  .object({
    item_instance_id: z.string().min(1).max(80),
    from_character_id: z.string().uuid(),
    to_character_id: z.string().uuid(),
  })
  .strict();

export const DropSchema = z
  .object({
    item_instance_id: z.string().min(1).max(80),
    character_id: z.string().uuid(),
  })
  .strict();

// Multiplayer — host reassigns which user owns a given PC.
export const AssignCharacterSchema = z
  .object({
    character_id: z.string().uuid(),
    owner_user_id: z.string().uuid(),
  })
  .strict();

// Multiplayer — accept an invite link. Token alone is enough; the session
// id is derived from the token lookup on the server.
export const JoinSessionSchema = z
  .object({
    invite_token: z.string().min(8).max(80),
  })
  .strict();

// StructuredAction is a wide discriminated union in `types.ts` (40+ variants).
// Rather than mirror it in Zod (and have to keep two definitions in sync
// forever), validate only that `action` is an object with a non-empty `type`
// string — the handler's exhaustive switch handles dispatch, and unknown
// types fall through to a default arm. `history` is an opaque array.
// Optional `turn_seq` is the client's last-known sequence number; the
// handler uses it for race detection in multiplayer (solo clients
// always have the latest value, so this is a no-op for them).
export const ActionSchema = z
  .object({
    action: z
      .object({
        type: z.string().min(1).max(60),
      })
      .passthrough(),
    history: z.array(z.unknown()).optional(),
    turn_seq: z.number().int().nonnegative().optional(),
  })
  .strict();

// ─── Campaigns (admin / membership) ─────────────────────────────────────────

const CampaignRoleSchema = z.enum(['owner', 'editor', 'player']);

export const SetCampaignVisibilitySchema = z
  .object({
    visibility: z.enum(['global', 'private']),
  })
  .strict();

// Campaign creation: slug id + display name. 'catalog' is reserved (it
// prefixes the catalog read routes under /api/campaigns).
export const RenameCampaignSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export const CreateCampaignSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, - and _ only')
      .refine((v) => v !== 'catalog', { message: 'reserved id' }),
    name: z.string().min(1).max(80),
  })
  .strict();

// ─── Campaign content sections ───────────────────────────────────────────────
// Per-section value schemas for the content-editing API. A section becomes
// editable by adding it here AND to EDITABLE_SECTIONS (campaignContent.ts) —
// a spec asserts the two stay in lockstep. Shapes mirror the Context
// interface (types.ts); validation is structural, not game-rules.

const StringArray = z.array(z.string().min(1));
const StringArrayMap = z.record(z.string(), StringArray);
// TieredNarrative: a flat pool or a tier-keyed map of pools.
const TieredNarrativeSchema = z.union([StringArray, StringArrayMap]);

const NarrativesSchema = z
  .object({
    roomArrival: StringArrayMap,
    genericArrival: StringArray,
    weaponVerbs: StringArrayMap,
    classStyle: StringArrayMap,
    enemyReactions: StringArrayMap,
    // Record<number, string[]> in TS — JSON object keys are strings.
    deathSaveStatus: StringArrayMap,
    combatHit: TieredNarrativeSchema,
    combatMiss: TieredNarrativeSchema,
    enemyAttacks: StringArray,
    killShot: StringArray,
    lootPickedUp: StringArray,
    noLoot: StringArray,
    alreadyLooted: StringArray,
    noEnemy: StringArray,
    alreadyDead: StringArray,
    sneakSuccess: StringArray,
    deathLines: StringArray,
    enemyDeflected: StringArray,
    levelUp: StringArray,
    combatStart: StringArray.optional(),
    shortRest: StringArray.optional(),
    longRest: StringArray.optional(),
  })
  .strict();

// Regions — the DB-era simplified region list. `id` is the stable key
// other content will reference (towns, sites), so it's slug-shaped;
// `name` is the display string. Exactly one region is the campaign start.
//
// Scalars mirror the code-side Region (types.ts): scale + canvas
// (feetPerSquare / gridWidth / gridHeight) and startPos are REQUIRED —
// every region must declare the grid its future children (terrain, sites,
// tierZones) will sit on; desc / encounterChance / baseTier are optional
// flavor + tuning. encounterTable carries composed-bestiary creature NAMES
// (cross-validation is overlay-time warn-skip, like room enemy placements);
// legacy obstacles/difficultTerrain never migrate.
const GridPosSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict();

const SLUG = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, - and _ only');

// One square of a region's dense terrain grid. `t` is the terrain type —
// behavior (passability / travel cost / encounter multiplier) derives from
// the shared TERRAIN registry; `tier` / `enc` are rare per-cell overrides
// of the region-level defaults.
const TerrainCellSchema = z
  .object({
    t: z.enum(Object.keys(TERRAIN) as [string, ...string[]]),
    tier: z.number().int().min(1).max(4).optional(),
    enc: z.number().min(0).max(1).optional(),
  })
  .strict();

// Rows of cells: [y][x], rectangular, 1–200 a side. Dimensions are DERIVED
// from the array shape — startPos / site positions bounds-check against it.
const RegionGridSchema = z.array(z.array(TerrainCellSchema).min(1).max(200)).min(1).max(200);

// A region's transition cells (MapSite): stepping onto one opens a town
// grid (kind 'town' → townId) or drops into a local room (kind 'local' →
// entryRoomId). The kind↔target pairing and grid bounds are enforced in
// Level narration hooks shared by regions/towns/rooms: the FIRST variant
// overrides the plain one on the first scope entry/exit; the plain one
// fires every other time.
const HOOK = z.string().min(1).max(2000).optional();
const LEVEL_HOOK_FIELDS = {
  onEnter: HOOK,
  onFirstEnter: HOOK,
  onExit: HOOK,
  onFirstExit: HOOK,
};

// the region-level superRefine below (they need the region's grid size).
const RegionSiteSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    pos: GridPosSchema,
    kind: z.enum(['town', 'local', 'region']),
    townId: SLUG.optional(),
    entryRoomId: SLUG.optional(),
    // kind 'region' — a GATE to another region in this payload; arrival at
    // entryPos (validated against the TARGET region's grid) or its startPos.
    regionId: SLUG.optional(),
    entryPos: GridPosSchema.optional(),
    desc: z.string().min(1).max(2000).optional(),
    // Narration hook — appended to "You enter X." on every landing.
    onEnter: z.string().min(1).max(2000).optional(),
    // A game-icons.net glyph name, or 'tile:<id>' for a painted tile from
    // the marker/terrain catalogs. On a TOWN site a painted icon overrides
    // the campaign-wide markers.town skin (one town can be THE walled city).
    icon: z.string().min(1).max(60).optional(),
  })
  .strict();

const RegionsSchema = z
  .array(
    z
      .object({
        id: SLUG,
        name: z.string().min(1).max(80),
        isStartingRegion: z.boolean(),
        desc: z.string().min(1).max(2000).optional(),
        // Level narration hooks (first-enter falls back to desc; exits
        // dormant until region travel exists).
        ...LEVEL_HOOK_FIELDS,
        // SRD overland scale: 5280 = 1 mile per square (Travel Pace).
        feetPerSquare: z.number().positive(),
        // The dense terrain grid — dimensions derive from its shape.
        grid: RegionGridSchema,
        // Where the party marker begins on this region's grid.
        startPos: GridPosSchema,
        // Random-encounter roll per square crossed (0–1).
        encounterChance: z.number().min(0).max(1).optional(),
        // The creatures those rolls materialize — composed-bestiary names
        // (unknown names warn-and-skip at overlay time).
        encounterTable: z.array(z.string().min(1).max(80)).max(20).optional(),
        // SRD tiers of play (1 ≈ L1–4, 2 ≈ L5–7, 3 ≈ L8–10).
        baseTier: z.number().int().min(1).max(4).optional(),
        // Transition cells. Omitted = a region with no sites (yet).
        sites: z.array(RegionSiteSchema).max(100).optional(),
      })
      .strict()
      .superRefine((r, ctx) => {
        // Rectangularity: every row as wide as the first.
        const gridHeight = r.grid.length;
        const gridWidth = r.grid[0]?.length ?? 0;
        r.grid.forEach((row, y) => {
          if (row.length !== gridWidth) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `grid row ${y} has ${row.length} cells; expected ${gridWidth} (grid must be rectangular)`,
              path: ['grid', y],
            });
          }
        });
        if (r.startPos.x >= gridWidth || r.startPos.y >= gridHeight) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `startPos (${r.startPos.x},${r.startPos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
            path: ['startPos'],
          });
        }
        const siteIds = new Set<string>();
        (r.sites ?? []).forEach((s, i) => {
          if (siteIds.has(s.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate site id "${s.id}"`,
              path: ['sites', i, 'id'],
            });
          }
          siteIds.add(s.id);
          if (s.pos.x >= gridWidth || s.pos.y >= gridHeight) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `site "${s.id}" pos (${s.pos.x},${s.pos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
              path: ['sites', i, 'pos'],
            });
          }
          if (s.kind === 'town' && !s.townId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `site "${s.id}" is a town site and needs townId`,
              path: ['sites', i, 'townId'],
            });
          }
          if (s.kind === 'local' && !s.entryRoomId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `site "${s.id}" is a local site and needs entryRoomId`,
              path: ['sites', i, 'entryRoomId'],
            });
          }
          if (s.kind === 'region' && !s.regionId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `site "${s.id}" is a region gate and needs regionId`,
              path: ['sites', i, 'regionId'],
            });
          }
        });
      })
  )
  .min(1)
  .superRefine((regions, ctx) => {
    const ids = new Set<string>();
    for (const r of regions) {
      if (ids.has(r.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate region id "${r.id}"` });
      }
      ids.add(r.id);
    }
    const starts = regions.filter((r) => r.isStartingRegion).length;
    if (starts !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `exactly one region must have isStartingRegion true (found ${starts})`,
      });
    }
    // Region gates must lead somewhere real: the target resolves within this
    // payload, isn't the gate's own region, and an explicit entryPos fits the
    // TARGET region's grid — the room-exit rules, one level up.
    regions.forEach((r, ri) =>
      (r.sites ?? []).forEach((s, si) => {
        if (s.kind !== 'region' || !s.regionId) return;
        if (s.regionId === r.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `region "${r.id}" gate "${s.id}" points at its own region`,
            path: [ri, 'sites', si, 'regionId'],
          });
          return;
        }
        const target = regions.find((t) => t.id === s.regionId);
        if (!target) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `region "${r.id}" gate "${s.id}" points at unknown region "${s.regionId}"`,
            path: [ri, 'sites', si, 'regionId'],
          });
          return;
        }
        if (s.entryPos) {
          const th = target.grid.length;
          const tw = target.grid[0]?.length ?? 0;
          if (s.entryPos.x >= tw || s.entryPos.y >= th) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `region "${r.id}" gate "${s.id}" entryPos is outside "${target.id}"'s ${tw}x${th} grid`,
              path: [ri, 'sites', si, 'entryPos'],
            });
          }
        }
      })
    );
  });

// Loot table — full LootItem definitions (shared/types.ts). Structural
// validation mirrors the interface: strict enums where the engine
// dispatches on the value (slot, mastery, wornEffects kinds, categories),
// loose strings where it doesn't (`effect` is a tag — some values are
// interpreted by use_item, the rest fall through to flavor text). This is
// a LIVE engine field, so a section that parses here must be servable.
const DICE = z.string().min(1).max(20); // '1d4', '2d6+1', or flat ('1' — SRD Blowgun)

const WornEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('save_bonus'),
      ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
      bonus: z.number().int().min(-5).max(5),
    })
    .strict(),
  z.object({ kind: z.literal('light'), radiusFt: z.number().positive() }).strict(),
]);

const LootItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, - and _ only'),
    name: z.string().min(1).max(80),
    desc: z.string().min(1).max(2000),
    // SRD Equipment cost in cr (magic items: the rarity-value table + base
    // item cost). Drives the vendor buyback price; absent = vendors won't
    // buy it unless they stock it.
    value: z.number().int().min(1).max(500000).optional(),
    weight: z.number().nonnegative(),
    type: z.enum(['weapon', 'armor', 'consumable', 'misc']),
    slot: z
      .enum([
        'weapon',
        'off_hand',
        'armor',
        'shield',
        'head',
        'neck',
        'cloak',
        'hands',
        'arms',
        'waist',
        'feet',
        'ring',
        'quiver',
      ])
      .nullable(),
    damage: DICE.nullable(),
    finesse: z.boolean().optional(),
    range: z.enum(['melee', 'ranged']).optional(),
    ac_bonus: z.number().int().min(-5).max(5).nullable(),
    heal: DICE.nullable(),
    effect: z.string().max(60).nullable(),
    aliases: z.array(z.string().min(1).max(60)).max(12),
    useNarrative: z.string().max(2000).optional(),
    armorCategory: z.enum(['light', 'medium', 'heavy', 'shield']).optional(),
    weaponType: z.enum(['simple', 'martial']).optional(),
    light: z.boolean().optional(),
    requiresAttunement: z.boolean().optional(),
    wornEffects: z.array(WornEffectSchema).max(8).optional(),
    cursed: z.boolean().optional(),
    curseDesc: z.string().max(2000).optional(),
    armorAcBase: z.number().int().min(8).max(25).optional(),
    dexCapToAc: z.number().int().min(0).max(10).optional(),
    versatileDamage: DICE.optional(),
    damageType: z.string().min(1).max(20).optional(),
    thrown: z
      .object({
        normalRange: z.number().int().positive(),
        longRange: z.number().int().positive(),
      })
      .strict()
      .optional(),
    loading: z.boolean().optional(),
    reach: z.boolean().optional(),
    heavy: z.boolean().optional(),
    mastery: z.enum(['vex', 'topple', 'push', 'sap', 'slow', 'nick', 'cleave', 'graze']).optional(),
    splash: z
      .object({
        damage: DICE,
        damageType: z.string().min(1).max(20),
        vsCreatureTypes: z.array(z.string().min(1).max(40)).optional(),
        burn: DICE.optional(),
      })
      .strict()
      .optional(),
    count: z.number().int().positive().max(999).optional(),
  })
  .strict();

const LootTableSchema = z
  .array(LootItemSchema)
  .min(1)
  .superRefine((items, ctx) => {
    const ids = new Set<string>();
    for (const item of items) {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate item id "${item.id}"` });
      }
      ids.add(item.id);
    }
  });

// Enemy templates — full EnemyTemplate definitions (types.ts). Another
// LIVE engine field: a campaign with campaign_monsters mappings serves
// these stat blocks to actual combat, so the nested boss machinery
// (phases / legendary / lair) is mirrored strictly too.
const ConditionNameSchema = z.enum([
  'paralyzed',
  'stunned',
  'poisoned',
  'prone',
  'frightened',
  'blinded',
  'restrained',
  'incapacitated',
  'grappled',
  'invisible',
  'exhaustion',
  'charmed',
  'unconscious',
  'deafened',
  'petrified',
  'faerie_fired',
  'banished',
  'polymorphed',
]);

const AbilityKeySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);

const OnHitEffectSchema = z
  .object({
    condition: ConditionNameSchema,
    ability: AbilityKeySchema.optional(),
    dc: z.number().int().min(1).max(30).optional(),
    escapeDc: z.number().int().min(1).max(30).optional(),
  })
  .strict();

const BossPhaseEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_multiattack'), value: z.number().int().min(1).max(8) }).strict(),
  z.object({ kind: z.literal('set_damage'), dice: DICE }).strict(),
  z.object({ kind: z.literal('set_to_hit'), value: z.number().int().min(0).max(20) }).strict(),
  z.object({ kind: z.literal('set_ac'), value: z.number().int().min(5).max(30) }).strict(),
  z.object({ kind: z.literal('set_on_hit_effect'), effect: OnHitEffectSchema }).strict(),
  z.object({ kind: z.literal('add_resistance'), damageType: z.string().min(1).max(20) }).strict(),
  z.object({ kind: z.literal('heal'), amount: z.number().int().positive() }).strict(),
]);

const BossPhaseSchema = z
  .object({
    // Percentage of max HP (e.g. 50 = the phase triggers at half HP).
    hpPct: z.number().min(0).max(100),
    name: z.string().min(1).max(80),
    narrative: z.string().min(1).max(2000),
    effects: z.array(BossPhaseEffectSchema),
  })
  .strict();

const LegendaryActionSchema = z
  .object({
    id: z.string().min(1).max(60),
    name: z.string().min(1).max(80),
    cost: z.number().int().min(1).max(5),
    kind: z.literal('extra_attack'),
    narrative: z.string().max(2000).optional(),
  })
  .strict();

const LairActionSchema = z
  .object({
    id: z.string().min(1).max(60),
    name: z.string().min(1).max(80),
    kind: z.literal('aoe_save_damage'),
    dice: DICE,
    damageType: z.string().min(1).max(20),
    savingThrow: AbilityKeySchema,
    saveDC: z.number().int().min(1).max(30),
    condition: ConditionNameSchema.optional(),
    conditionDuration: z.number().int().min(1).max(100).optional(),
    narrative: z.string().min(1).max(2000),
  })
  .strict();

const MonsterAuraSchema = z
  .object({
    radiusFt: z.number().positive(),
    save: z
      .object({ ability: AbilityKeySchema, dc: z.number().int().min(1).max(30) })
      .strict()
      .optional(),
    condition: ConditionNameSchema.optional(),
    conditionDuration: z.number().int().min(1).max(100).optional(),
    damage: DICE.optional(),
    damageType: z.string().min(1).max(20).optional(),
    name: z.string().min(1).max(80).optional(),
  })
  .strict();

const BreathWeaponSchema = z
  .object({
    name: z.string().min(1).max(80),
    dice: DICE,
    damageType: z.string().min(1).max(20),
    savingThrow: AbilityKeySchema,
    saveDC: z.number().int().min(1).max(30),
    rechargeMin: z.number().int().min(2).max(6).optional(),
    condition: ConditionNameSchema.optional(),
    conditionDuration: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const AbilityScore = z.number().int().min(1).max(30);

const EnemyTemplateSchema = z
  .object({
    name: z.string().min(1).max(80),
    cr: z.number().min(0).max(30),
    hp: z.number().int().positive(),
    ac: z.number().int().min(5).max(30),
    damage: DICE,
    toHit: z.number().int().min(0).max(20),
    xp: z.number().int().nonnegative(),
    creatureType: z
      .enum(['undead', 'fiend', 'beast', 'humanoid', 'construct', 'dragon'])
      .optional(),
    str: AbilityScore.optional(),
    dex: AbilityScore.optional(),
    con: AbilityScore.optional(),
    int: AbilityScore.optional(),
    wis: AbilityScore.optional(),
    cha: AbilityScore.optional(),
    onHitEffect: OnHitEffectSchema.optional(),
    multiattack: z.number().int().min(1).max(8).optional(),
    resistances: z.array(z.string().min(1).max(20)).optional(),
    vulnerabilities: z.array(z.string().min(1).max(20)).optional(),
    immunities: z.array(z.string().min(1).max(20)).optional(),
    condition_immunities: z.array(z.string().min(1).max(30)).optional(),
    damageType: z.string().min(1).max(20).optional(),
    packTactics: z.boolean().optional(),
    bloodiedFrenzy: z.boolean().optional(),
    bonusDamage: DICE.optional(),
    bonusDamageType: z.string().min(1).max(20).optional(),
    undeadFortitude: z.boolean().optional(),
    lifeDrain: z.boolean().optional(),
    regeneration: z.number().int().min(1).max(40).optional(),
    regenBlockedBy: z.array(z.string().min(1).max(20)).max(4).optional(),
    parry: z.boolean().optional(),
    parryBonus: z.number().int().min(1).max(5).optional(),
    rampage: z.boolean().optional(),
    aura: MonsterAuraSchema.optional(),
    breathWeapon: BreathWeaponSchema.optional(),
    spells: z.array(z.string().min(1).max(60)).optional(),
    castChance: z.number().min(0).max(1).optional(),
    spellSaveDC: z.number().int().min(1).max(30).optional(),
    spellAttackBonus: z.number().int().min(0).max(20).optional(),
    attackReachFt: z.number().positive().optional(),
    speedFt: z.number().nonnegative().optional(),
    darkvision_ft: z.number().nonnegative().optional(),
    sunlightSensitivity: z.boolean().optional(),
    phases: z.array(BossPhaseSchema).optional(),
    legendary_actions: z.array(LegendaryActionSchema).optional(),
    legendary_pool: z.number().int().min(1).max(10).optional(),
    lair_actions: z.array(LairActionSchema).optional(),
    drops: z.array(z.string().min(1).max(60)).optional(),
    goldDrop: z.number().int().nonnegative().optional(),
  })
  .strict();

const EnemyTemplatesSchema = z
  .array(EnemyTemplateSchema)
  .min(1)
  .superRefine((templates, ctx) => {
    const names = new Set<string>();
    for (const t of templates) {
      if (names.has(t.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate template name "${t.name}"`,
        });
      }
      names.add(t.name);
    }
  });

// Towns — the second map level, mirroring regions. Venues are the town
// grid's transition cells: 'interior' opens a local room (entryRoomId
// required); 'gate' ascends back to the region (no target). The kind↔
// target pairing and grid bounds are enforced in the superRefine.
const TownVenueSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    pos: GridPosSchema,
    kind: z.enum(['interior', 'gate']),
    entryRoomId: SLUG.optional(),
    desc: z.string().min(1).max(2000).optional(),
  })
  .strict();

const TownsSchema = z
  .array(
    z
      .object({
        id: SLUG,
        name: z.string().min(1).max(80),
        desc: z.string().min(1).max(2000).optional(),
        // Level narration hooks (enter via a region site; exit via the gate).
        ...LEVEL_HOOK_FIELDS,
        // Settlement scale: 25 ft per square.
        feetPerSquare: z.number().positive(),
        grid: RegionGridSchema,
        startPos: GridPosSchema,
        venues: z.array(TownVenueSchema).max(100).optional(),
        // Cosmetic ground texture for bare cells.
        floor: z.enum(['grass', 'dirt', 'cobblestone', 'sand']).optional(),
      })
      .strict()
      .superRefine((t, ctx) => {
        const gridHeight = t.grid.length;
        const gridWidth = t.grid[0]?.length ?? 0;
        t.grid.forEach((row, y) => {
          if (row.length !== gridWidth) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `grid row ${y} has ${row.length} cells; expected ${gridWidth} (grid must be rectangular)`,
              path: ['grid', y],
            });
          }
        });
        if (t.startPos.x >= gridWidth || t.startPos.y >= gridHeight) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `startPos (${t.startPos.x},${t.startPos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
            path: ['startPos'],
          });
        }
        const venueIds = new Set<string>();
        (t.venues ?? []).forEach((v, i) => {
          if (venueIds.has(v.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate venue id "${v.id}"`,
              path: ['venues', i, 'id'],
            });
          }
          venueIds.add(v.id);
          if (v.pos.x >= gridWidth || v.pos.y >= gridHeight) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `venue "${v.id}" pos (${v.pos.x},${v.pos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
              path: ['venues', i, 'pos'],
            });
          }
          if (v.kind === 'interior' && !v.entryRoomId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `venue "${v.id}" is an interior and needs entryRoomId`,
              path: ['venues', i, 'entryRoomId'],
            });
          }
        });
      })
  )
  .min(1)
  .superRefine((towns, ctx) => {
    const ids = new Set<string>();
    for (const t of towns) {
      if (ids.has(t.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate town id "${t.id}"` });
      }
      ids.add(t.id);
    }
  });

// Rooms — the third (local) map level. Each cell carries an optional
// cosmetic terrain paint `t` and at most one mechanical flag `m`; exits are
// the per-cell room connections (toRoomId XOR ascends), cross-validated
// against the payload's own room ids and the TARGET room's grid bounds.
const RoomCellSchema = z
  .object({
    t: z.enum(Object.keys(TERRAIN) as [string, ...string[]]).optional(),
    m: z.enum(['obstacle', 'difficult', 'climb', 'swim', 'cover']).optional(),
  })
  .strict();
const RoomGridSchema = z.array(z.array(RoomCellSchema).min(1).max(200)).min(1).max(200);

const RoomExitSchema = z
  .object({
    pos: GridPosSchema,
    toRoomId: SLUG.optional(),
    entrancePos: GridPosSchema.optional(),
    label: z.string().min(1).max(80).optional(),
    ascends: z.boolean().optional(),
  })
  .strict();

// Dialogue gating condition — the json-rules-engine TopLevelCondition subset
// the sync evaluator (dialogueGating.evalCondition) understands: all/any/not
// nesting over {fact, operator, value, path?} leaves. Fact names are
// restricted to the CampaignFacts the evaluator actually serves, so a typo'd
// fact is an authoring-time 400 instead of a silently-always-hidden option.
const DIALOGUE_FACTS = [
  'room_id',
  'current_town_id',
  'enemies_killed',
  'loot_taken',
  'visited_rooms',
  'flags',
  'campaign_flags',
  'faction_rep',
  'quests_active',
  'quests_completed',
  'steps_done',
  'faction_tier',
  'party_items',
  'world_minute',
  'world_day',
  'active_level',
  'active_class',
] as const;
const DIALOGUE_OPERATORS = [
  'equal',
  'notEqual',
  'in',
  'notIn',
  'contains',
  'doesNotContain',
  'lessThan',
  'lessThanInclusive',
  'greaterThan',
  'greaterThanInclusive',
] as const;
const ConditionScalarSchema = z.union([z.string().max(120), z.number(), z.boolean()]);
type ConditionShape =
  | { all: ConditionShape[] }
  | { any: ConditionShape[] }
  | { not: ConditionShape }
  | {
      fact: string;
      operator: (typeof DIALOGUE_OPERATORS)[number];
      value: string | number | boolean | Array<string | number | boolean>;
      path?: string;
    };
// Factory so each condition surface gets its own fact vocabulary: dialogue
// gates never see a meaningful `action` fact (it's '' there), while quest
// steps key on it routinely ("the player attacked").
function conditionSchema(facts: readonly [string, ...string[]]): z.ZodType<ConditionShape> {
  const self: z.ZodType<ConditionShape> = z.lazy(() =>
    z.union([
      z.object({ all: z.array(self).min(1).max(8) }).strict(),
      z.object({ any: z.array(self).min(1).max(8) }).strict(),
      z.object({ not: self }).strict(),
      z
        .object({
          fact: z.enum(facts),
          operator: z.enum(DIALOGUE_OPERATORS),
          value: z.union([ConditionScalarSchema, z.array(ConditionScalarSchema).max(20)]),
          path: z
            .string()
            .regex(/^\$\.[\w.-]+$/, "path must look like '$.key' or '$.key.sub'")
            .max(80)
            .optional(),
        })
        .strict(),
    ])
  );
  return self;
}
const DialogueConditionSchema = conditionSchema(DIALOGUE_FACTS);

// The consequence subset DB dialogue may fire — the world-state setters
// (flags for cross-NPC threads, attitude shifts for parley outcomes), the
// simple grants, and the Malgovia-parity arms (advance_quest /
// add_narrative / modify_hp / consume_item — everything its hand-authored
// dialogue uses). The remaining GameConsequence arms (spawn_enemy,
// unlock_room, set_escape, travel_to, set_faction_rep) stay code-side
// until the systems they script are DB-authored too.
const DialogueConsequenceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('set_flag'),
      key: z.string().min(1).max(60),
      value: ConditionScalarSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_npc_attitude'),
      npcId: SLUG,
      attitude: z.enum(['friendly', 'indifferent', 'hostile']),
    })
    .strict(),
  z.object({ type: z.literal('give_gold'), amount: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('give_xp'), amount: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('give_item'), itemId: z.string().min(1).max(80) }).strict(),
  // Quest ids live in the quests SECTION (separate write), so they can't be
  // cross-validated here — an unknown id warns and no-ops at apply time.
  z.object({ type: z.literal('start_quest'), questId: SLUG }).strict(),
  // Complete a specific quest step directly ("thanks for telling me" —
  // dialogue that IS the objective). Same warn-and-no-op rule for unknown
  // quest/step ids as start_quest.
  z.object({ type: z.literal('advance_quest'), questId: SLUG, stepId: SLUG }).strict(),
  // Flavor narrative at the trigger moment (the GameRule staple).
  z.object({ type: z.literal('add_narrative'), text: z.string().min(1).max(2000) }).strict(),
  // A healer patching (or a trap-like sting hurting) the active character.
  // Bounded so DB dialogue can't insta-kill or fully trivialize combat.
  z
    .object({
      type: z.literal('modify_hp'),
      amount: z
        .number()
        .int()
        .min(-100)
        .max(100)
        .refine((n) => n !== 0, 'amount must be nonzero'),
    })
    .strict(),
  // Take a quest item back ("hand over the ledger").
  z.object({ type: z.literal('consume_item'), itemId: z.string().min(1).max(80) }).strict(),
]);
type DialogueConsequenceShape = z.infer<typeof DialogueConsequenceSchema>;

// Skill-gated dialogue branch: a CHA-based SRD social check. Outcome picks
// the reply + consequence list; children open only on success. Replaces the
// node's plain reply/consequences (enforced in the response schema).
const DialogueCheckSchema = z
  .object({
    skill: z.enum(['persuasion', 'deception', 'intimidation']),
    dc: z.number().int().min(1).max(30),
    successReply: z.string().min(1).max(2000),
    failReply: z.string().min(1).max(2000),
    onSuccess: z.array(DialogueConsequenceSchema).max(5).optional(),
    onFail: z.array(DialogueConsequenceSchema).max(5).optional(),
  })
  .strict();
type DialogueCheckShape = z.infer<typeof DialogueCheckSchema>;

// NPC dialogue: a recursive option tree (a response with children is a
// branch, without is a leaf). A response may be GATED (condition — hidden
// until the facts hold; once — gone after being chosen) and may fire the
// consequence subset above. give_item resolves against the composed loot
// table at apply time; set_npc_attitude targets are cross-validated against
// the payload's NPC ids in the payload superRefine.
interface RoomNpcResponseShape {
  label: string;
  reply?: string;
  condition?: ConditionShape;
  once?: boolean;
  check?: DialogueCheckShape;
  consequences?: DialogueConsequenceShape[];
  responses?: RoomNpcResponseShape[];
}
const RoomNpcResponseSchema: z.ZodType<RoomNpcResponseShape> = z.lazy(() =>
  z
    .object({
      label: z.string().min(1).max(120),
      reply: z.string().min(1).max(2000).optional(),
      condition: DialogueConditionSchema.optional(),
      once: z.boolean().optional(),
      check: DialogueCheckSchema.optional(),
      consequences: z.array(DialogueConsequenceSchema).max(5).optional(),
      responses: z.array(RoomNpcResponseSchema).max(8).optional(),
    })
    .strict()
    .refine((r) => !(r.check && (r.reply || r.consequences)), {
      message:
        'a check node uses successReply/failReply + onSuccess/onFail — not reply/consequences',
    })
);

// A searchable / interactable room object. desc / interactText default at
// overlay time; lootIds resolve against the composed loot table at
// interact time (the engine skips unknown ids).
const RoomObjectSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    desc: z.string().min(1).max(2000).optional(),
    interactText: z.string().min(1).max(2000).optional(),
    searchable: z.boolean().optional(),
    searchDC: z.number().int().min(1).max(30).optional(),
    lootIds: z.array(z.string().min(1).max(80)).max(10).optional(),
    foundText: z.string().min(1).max(2000).optional(),
    emptyText: z.string().min(1).max(2000).optional(),
    pos: GridPosSchema.optional(),
  })
  .strict();

// At most one trap per room. Mechanics are authored; the narrative
// strings default at overlay time ({name} = the triggering character,
// {dmg} = the rolled damage in triggerNarrative).
const SRD_DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
const SRD_TRAP_CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
const RoomTrapSchema = z
  .object({
    id: SLUG.optional(),
    name: z.string().min(1).max(80),
    desc: z.string().min(1).max(2000).optional(),
    dc: z.number().int().min(1).max(30),
    damage: z.string().min(1).max(20),
    damageType: z.enum(SRD_DAMAGE_TYPES),
    condition: z.enum(SRD_TRAP_CONDITIONS).optional(),
    conditionDuration: z.number().int().min(1).max(99).optional(),
    triggerNarrative: z.string().min(1).max(2000).optional(),
    detectNarrative: z.string().min(1).max(2000).optional(),
    disarmSuccess: z.string().min(1).max(2000).optional(),
    disarmFail: z.string().min(1).max(2000).optional(),
  })
  .strict();

// A bespoke placed NPC. The stat block is optional (overlay defaults it to
// an SRD Commoner-style block); shop item ids resolve against the composed
// loot table at overlay time (unknown ids dropped with a warning).
const RoomNpcSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    attitude: z.enum(['friendly', 'indifferent', 'hostile']),
    greeting: z.string().min(1).max(2000),
    // NPC narrative hooks — the FIRST variant overrides the plain one once:
    // firstGreeting on the first talk, firstGoodbye on the first explicit
    // END CONVERSATION; goodbye plays on every later end (optional).
    firstGreeting: z.string().min(1).max(2000).optional(),
    goodbye: z.string().min(1).max(2000).optional(),
    firstGoodbye: z.string().min(1).max(2000).optional(),
    responses: z.array(RoomNpcResponseSchema).max(8).optional(),
    persuasionDC: z.number().int().min(1).max(30).optional(),
    pos: GridPosSchema.optional(),
    icon: z.string().min(1).max(60).optional(),
    shop: z
      .array(
        z
          .object({
            itemId: z.string().min(1).max(80),
            price: z.number().int().min(0).max(100000),
            // Daily stock (absent = unlimited); vendors restock each in-game day.
            qty: z.number().int().min(1).max(999).optional(),
          })
          .strict()
      )
      .max(20)
      .optional(),
    // The vendor's daily wallet (absent = unlimited) — caps what they can pay
    // when the party sells; purchases replenish it.
    shopGold: z.number().int().min(0).max(100000).optional(),
    // Ties the shop to a faction so the tier price multipliers apply
    // (factionShopPrice). An id with no matching faction fails soft to
    // flat prices — factions live in their own section.
    factionId: SLUG.optional(),
    hp: z.number().int().min(1).max(500).optional(),
    ac: z.number().int().min(1).max(30).optional(),
    damage: z.string().min(1).max(20).optional(),
    toHit: z.number().int().min(-5).max(15).optional(),
    xp: z.number().int().min(0).max(50000).optional(),
  })
  .strict();

const RoomsSchema = z
  .array(
    z
      .object({
        id: SLUG,
        name: z.string().min(1).max(80),
        desc: z.string().min(1).max(4000),
        // Level narration hooks (enter on every descend/passage in; exit
        // on leaving to another room or ascending).
        ...LEVEL_HOOK_FIELDS,
        // SRD tactical scale: 5 ft per square (the default when omitted).
        grid: RoomGridSchema,
        entryPos: GridPosSchema,
        exits: z.array(RoomExitSchema).max(20).optional(),
        lighting: z.enum(['bright', 'dim', 'dark', 'sunlight']).optional(),
        floor: z.enum(['grass', 'dirt', 'cobblestone', 'sand']).optional(),
        canRest: z.boolean().optional(),
        // Enemy placements: composed-bestiary template NAMES (the catalog
        // is DB state, so existence is resolved at overlay time — an
        // unknown name is skipped with a warning, never a crash).
        enemies: z
          .array(
            z
              .object({
                name: z.string().min(1).max(80),
                count: z.number().int().min(1).max(8).optional(),
              })
              .strict()
          )
          .max(10)
          .optional(),
        // Loot placements: composed-loot-table item IDS (same DB-state
        // existence rule as enemies). A pos makes the item a clickable
        // grid token; bounds-checked in the superRefine below.
        loot: z
          .array(
            z
              .object({
                itemId: z.string().min(1).max(80),
                pos: GridPosSchema.optional(),
              })
              .strict()
          )
          .max(10)
          .optional(),
        // Bespoke placed NPCs (talk / shop / fight) — full definitions,
        // not catalog references. Ids must be CAMPAIGN-unique (the
        // payload-level superRefine checks across rooms).
        npcs: z.array(RoomNpcSchema).max(8).optional(),
        // Searchable / interactable objects (room-unique ids) + at most
        // one trap.
        objects: z.array(RoomObjectSchema).max(10).optional(),
        trap: RoomTrapSchema.optional(),
      })
      .strict()
      .superRefine((r, ctx) => {
        const gridHeight = r.grid.length;
        const gridWidth = r.grid[0]?.length ?? 0;
        r.grid.forEach((row, y) => {
          if (row.length !== gridWidth) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `grid row ${y} has ${row.length} cells; expected ${gridWidth} (grid must be rectangular)`,
              path: ['grid', y],
            });
          }
        });
        if (r.entryPos.x >= gridWidth || r.entryPos.y >= gridHeight) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `entryPos (${r.entryPos.x},${r.entryPos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
            path: ['entryPos'],
          });
        }
        (r.exits ?? []).forEach((e, i) => {
          if (e.pos.x >= gridWidth || e.pos.y >= gridHeight) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `exit ${i} pos (${e.pos.x},${e.pos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
              path: ['exits', i, 'pos'],
            });
          }
          if (!e.toRoomId === !e.ascends) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `exit ${i} needs exactly one of toRoomId or ascends`,
              path: ['exits', i],
            });
          }
        });
        (r.loot ?? []).forEach((l, i) => {
          if (l.pos && (l.pos.x >= gridWidth || l.pos.y >= gridHeight)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `loot ${i} pos (${l.pos.x},${l.pos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
              path: ['loot', i, 'pos'],
            });
          }
        });
        (r.npcs ?? []).forEach((n, i) => {
          if (n.pos && (n.pos.x >= gridWidth || n.pos.y >= gridHeight)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `NPC "${n.id}" pos (${n.pos.x},${n.pos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
              path: ['npcs', i, 'pos'],
            });
          }
        });
        const objectIds = new Set<string>();
        (r.objects ?? []).forEach((o, i) => {
          if (objectIds.has(o.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate object id "${o.id}"`,
              path: ['objects', i, 'id'],
            });
          }
          objectIds.add(o.id);
          if (o.pos && (o.pos.x >= gridWidth || o.pos.y >= gridHeight)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `object "${o.id}" pos (${o.pos.x},${o.pos.y}) is outside the ${gridWidth}x${gridHeight} grid`,
              path: ['objects', i, 'pos'],
            });
          }
        });
      })
  )
  .min(1)
  .max(200)
  .superRefine((rooms, ctx) => {
    const ids = new Set<string>();
    for (const r of rooms) {
      if (ids.has(r.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate room id "${r.id}"` });
      }
      ids.add(r.id);
    }
    // NPC ids key the campaign-level npcs map — unique ACROSS rooms.
    const npcIds = new Set<string>();
    rooms.forEach((r, ri) =>
      (r.npcs ?? []).forEach((n, ni) => {
        if (npcIds.has(n.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate NPC id "${n.id}" (NPC ids are campaign-unique)`,
            path: [ri, 'npcs', ni, 'id'],
          });
        }
        npcIds.add(n.id);
      })
    );
    // Dialogue set_npc_attitude must target an NPC that exists in this
    // payload (DB rooms replace the campaign's NPC map wholesale, so the
    // payload IS the full cast). Walks every response tree recursively.
    const checkAttitudeTargets = (
      resp: RoomNpcResponseShape,
      ri: number,
      ni: number,
      where: string
    ) => {
      const lists = [
        resp.consequences ?? [],
        resp.check?.onSuccess ?? [],
        resp.check?.onFail ?? [],
      ];
      for (const c of lists.flat()) {
        if (c.type === 'set_npc_attitude' && !npcIds.has(c.npcId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `dialogue ${where} sets attitude of unknown NPC "${c.npcId}"`,
            path: [ri, 'npcs', ni, 'responses'],
          });
        }
      }
      (resp.responses ?? []).forEach((child, ci) =>
        checkAttitudeTargets(child, ri, ni, `${where}.${ci}`)
      );
    };
    rooms.forEach((r, ri) =>
      (r.npcs ?? []).forEach((n, ni) =>
        (n.responses ?? []).forEach((resp, i) =>
          checkAttitudeTargets(resp, ri, ni, `"${n.id}" response ${i}`)
        )
      )
    );
    // Exits must lead somewhere real: toRoomId resolves within this payload,
    // and an explicit entrancePos must fit the TARGET room's grid.
    rooms.forEach((r, ri) =>
      (r.exits ?? []).forEach((e, ei) => {
        if (!e.toRoomId) return;
        const target = rooms.find((t) => t.id === e.toRoomId);
        if (!target) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `room "${r.id}" exit ${ei} points at unknown room "${e.toRoomId}"`,
            path: [ri, 'exits', ei, 'toRoomId'],
          });
          return;
        }
        if (e.entrancePos) {
          const th = target.grid.length;
          const tw = target.grid[0]?.length ?? 0;
          if (e.entrancePos.x >= tw || e.entrancePos.y >= th) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `room "${r.id}" exit ${ei} entrancePos is outside "${target.id}"'s ${tw}x${th} grid`,
              path: [ri, 'exits', ei, 'entrancePos'],
            });
          }
        }
      })
    );
  });

// Campaign terrain skin: terrain type → tile choice from the shared
// catalog — a bare tile id, or { tile, tint } with a bounded structured
// recolor (compiled to a CSS filter FE-side). `markers.town` skins the
// regional town-site marker the same way from the MARKER_TILES catalog.
// Every key optional ({} = all defaults); unknown types / ids rejected.
const TILE_TINT = z
  .object({
    hue: z.number().min(-180).max(180).optional(),
    saturate: z.number().min(0).max(3).optional(),
    brightness: z.number().min(0).max(2).optional(),
  })
  .strict();
const TILE_ID = z.enum(Object.keys(TERRAIN_TILES) as [string, ...string[]]);
const TILE_CHOICE = z.union([
  TILE_ID,
  z.object({ tile: TILE_ID, tint: TILE_TINT.optional() }).strict(),
]);
const MARKER_ID = z.enum(Object.keys(MARKER_TILES) as [string, ...string[]]);
const MARKER_CHOICE = z.union([
  MARKER_ID,
  z.object({ tile: MARKER_ID, tint: TILE_TINT.optional() }).strict(),
]);
// `floors` skins the town/local ground textures, keyed by the AUTHORED
// floor type: remap a family to another and/or tint it.
const FLOOR_ID = z.enum(Object.keys(FLOOR_TILES) as [string, ...string[]]);
const FLOOR_CHOICE = z.union([
  FLOOR_ID,
  z.object({ tile: FLOOR_ID, tint: TILE_TINT.optional() }).strict(),
]);
const TerrainArtSchema = z
  .object({
    ...Object.fromEntries(Object.keys(TERRAIN).map((t) => [t, TILE_CHOICE.optional()])),
    markers: z.object({ town: MARKER_CHOICE.optional() }).strict().optional(),
    floors: z
      .object(Object.fromEntries(Object.keys(FLOOR_TILES).map((f) => [f, FLOOR_CHOICE.optional()])))
      .strict()
      .optional(),
  })
  .strict();

// ─── Quests + factions (campaigns.data JSONB sections) ───────────────────────

// Quest steps reuse the condition vocabulary dialogue gates use, plus the
// `action` fact (meaningful during quest evaluation — it runs per action).
// `npc_id` is quest-side only: the NPC mid-conversation ('' otherwise),
// so a "talk to THIS npc" step can complete without the flag indirection.
const QUEST_FACTS = ['action', 'npc_id', ...DIALOGUE_FACTS] as const;
const QuestConditionSchema = conditionSchema(QUEST_FACTS);

const QuestStepSchema = z
  .object({
    id: SLUG,
    desc: z.string().min(1).max(2000),
    condition: QuestConditionSchema,
  })
  .strict();

// Rewards are the same safe consequence subset DB dialogue may fire —
// they run through the identical applyConsequence pipeline on completion.
const QuestSchema = z
  .object({
    id: SLUG,
    title: z.string().min(1).max(120),
    desc: z.string().min(1).max(2000),
    giverNpcId: SLUG.optional(),
    steps: z.array(QuestStepSchema).min(1).max(12),
    rewards: z.array(DialogueConsequenceSchema).max(8),
    factionId: SLUG.optional(),
    repGain: z.number().int().min(-100).max(100).optional(),
    startActive: z.boolean().optional(),
  })
  .strict();

const QuestsSchema = z
  .array(QuestSchema)
  .max(50)
  .superRefine((quests, ctx) => {
    const ids = new Set<string>();
    quests.forEach((q, qi) => {
      if (ids.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate quest id "${q.id}"`,
          path: [qi, 'id'],
        });
      }
      ids.add(q.id);
      const stepIds = new Set<string>();
      q.steps.forEach((s, si) => {
        if (stepIds.has(s.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `quest "${q.id}" has duplicate step id "${s.id}"`,
            path: [qi, 'steps', si, 'id'],
          });
        }
        stepIds.add(s.id);
      });
    });
  });

const FACTION_TIERS = ['hostile', 'unfriendly', 'neutral', 'friendly', 'exalted'] as const;
const FactionSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    // Rep floor per tier — must ascend (factionAttitude resolves top-down).
    thresholds: z
      .object({
        hostile: z.number().int().min(-1000).max(1000),
        unfriendly: z.number().int().min(-1000).max(1000),
        neutral: z.number().int().min(-1000).max(1000),
        friendly: z.number().int().min(-1000).max(1000),
        exalted: z.number().int().min(-1000).max(1000),
      })
      .strict()
      .refine(
        (t) =>
          t.hostile < t.unfriendly &&
          t.unfriendly < t.neutral &&
          t.neutral < t.friendly &&
          t.friendly < t.exalted,
        { message: 'thresholds must ascend: hostile < unfriendly < neutral < friendly < exalted' }
      ),
    // Attitude tier → shop price multiplier; missing tiers default to 1.0.
    shopPriceModifiers: z.partialRecord(z.enum(FACTION_TIERS), z.number().min(0.1).max(10)),
  })
  .strict();

const FactionsSchema = z
  .array(FactionSchema)
  .max(20)
  .superRefine((factions, ctx) => {
    const ids = new Set<string>();
    factions.forEach((f, fi) => {
      if (ids.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate faction id "${f.id}"`,
          path: [fi, 'id'],
        });
      }
      ids.add(f.id);
    });
  });

// ─── Theme + creation-config sections ────────────────────────────────────────

// The visual theme (FE CSS custom properties + the donor title). All
// fields optional: the FE merges a partial theme over the base theme, so
// authors set only what they care about. Values are CSS color/font
// strings — capped, not parsed (a broken color renders as a broken
// color, nothing worse).
const CSS_VALUE = z.string().min(1).max(200);
const ThemeSchema = z
  .object({
    pageBg: CSS_VALUE.optional(),
    cardBg: CSS_VALUE.optional(),
    font: CSS_VALUE.optional(),
    primary: CSS_VALUE.optional(),
    mid: CSS_VALUE.optional(),
    dim: CSS_VALUE.optional(),
    dimDark: CSS_VALUE.optional(),
    border: CSS_VALUE.optional(),
    separator: CSS_VALUE.optional(),
    itemColor: CSS_VALUE.optional(),
    hpHigh: CSS_VALUE.optional(),
    hpMid: CSS_VALUE.optional(),
    hpLow: CSS_VALUE.optional(),
    title: z.string().min(1).max(60).optional(),
  })
  .strict();

const ABILITY = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const BackgroundSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    desc: z.string().min(1).max(2000),
    skillProficiencies: z.array(z.string().min(1).max(40)).min(1).max(4),
    toolProficiency: z.string().min(1).max(60).nullable().optional(),
    feature: z.string().min(1).max(120),
    featureDesc: z.string().min(1).max(2000),
    originFeat: z.string().min(1).max(60).optional(),
    abilityScoreIncreases: z.array(ABILITY).min(1).max(3).optional(),
    startingEquipment: z.array(z.string().min(1).max(80)).max(10).optional(),
    language: z.string().min(1).max(60).optional(),
  })
  .strict();
const BackgroundsSchema = z
  .array(BackgroundSchema)
  .min(1)
  .max(20)
  .superRefine((bgs, ctx) => {
    const seen = new Set<string>();
    for (const b of bgs) {
      if (seen.has(b.id))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate background id "${b.id}"` });
      seen.add(b.id);
    }
  });

// Per-class id lists. Class keys are free strings (unknown classes are
// inert — the creation flow only reads the classes it offers); spell /
// item ids resolve against the catalogs at play time, where unknown ids
// simply never surface.
const CLASS_KEY = z.string().min(1).max(40);
const ClassSpellsSchema = z.record(CLASS_KEY, z.array(z.string().min(1).max(60)).max(60));
const ClassStartingLootSchema = z.record(CLASS_KEY, z.array(z.string().min(1).max(80)).max(12));
const ClassStartingEquipmentSchema = z.record(
  CLASS_KEY,
  z
    .array(
      z
        .object({
          id: z.string().min(1).max(8),
          label: z.string().min(1).max(200),
          items: z.array(z.string().min(1).max(80)).max(12),
          gold: z.number().int().min(0).max(1000),
        })
        .strict()
    )
    .min(1)
    .max(4)
);

export const CAMPAIGN_SECTION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // Narration hook: the first narrative entry of a new game (overlays the
  // code/template campaign.intro).
  gameStart: z.string().min(1).max(4000),
  // The prose world name (campaign.world_name — distinct from campaigns.name,
  // the picker/header identity: "The Sky Has Fallen" can be set in "Auria").
  worldName: z.string().min(1).max(120),
  // Picker presentation: a one-line pitch + an ASCII preview panel.
  tagline: z.string().min(1).max(200),
  previewArt: z.string().min(1).max(4000),
  narratives: NarrativesSchema,
  rooms: RoomsSchema,
  // Quests + factions: campaign-block script content (campaigns.data keys
  // folded into campaign.quests / campaign.factions wholesale at overlay).
  quests: QuestsSchema,
  factions: FactionsSchema,
  terrainArt: TerrainArtSchema,
  regions: RegionsSchema,
  towns: TownsSchema,
  // Customs ON TOP of the ambient SRD catalogs — same per-entry shapes as
  // the catalogs themselves (these compose into live engine fields).
  customItems: LootTableSchema,
  customMonsters: EnemyTemplatesSchema,
  // Visual theme + creation config — top-level Context fields, folded by
  // the plain overlay merge (the section name IS the Context field name).
  theme: ThemeSchema,
  backgrounds: BackgroundsSchema,
  classSpells: ClassSpellsSchema,
  classStartingLoot: ClassStartingLootSchema,
  classStartingEquipment: ClassStartingEquipmentSchema,
};

// PUT body for a section write: { value: <section payload> }.
export const PutCampaignSectionSchema = z.object({ value: z.unknown() }).strict();

export const AddCampaignMemberSchema = z
  .object({
    email: z.string().email(),
    role: CampaignRoleSchema,
  })
  .strict();

export const SetCampaignMemberRoleSchema = z
  .object({
    role: CampaignRoleSchema,
  })
  .strict();

// ─── Helper: validate or 400 ─────────────────────────────────────────────────

// Used inline in handlers: `const parsed = parseBody(req, res, Schema); if
// (!parsed) return;`. Returns the parsed body or `undefined` after writing
// the 400 response. Consolidates the failure shape so clients get a stable
// `{ error, issues }` payload regardless of which endpoint failed.
export function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  res: Response,
  schema: T
): z.infer<T> | undefined {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid request body',
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return undefined;
  }
  return result.data;
}

// Express middleware variant — useful for routes that don't need to early-
// return inside an async handler. Unused today but exported for future use.
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseBody(req, res, schema);
    if (!parsed) return;
    req.body = parsed;
    next();
  };
}
