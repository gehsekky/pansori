import type { NextFunction, Request, Response } from 'express';
import { TERRAIN, TERRAIN_TILES } from '../shared-types.js';
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
// flavor + tuning. encounterTable waits for the entities section (its ids
// need cross-validation); legacy obstacles/difficultTerrain never migrate.
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
// the region-level superRefine below (they need the region's grid size).
const RegionSiteSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    pos: GridPosSchema,
    kind: z.enum(['town', 'local']),
    townId: SLUG.optional(),
    entryRoomId: SLUG.optional(),
    desc: z.string().min(1).max(2000).optional(),
    // Narration hook — appended to "You enter X." on every landing.
    onEnter: z.string().min(1).max(2000).optional(),
    // game-icons.net icon name for 'local' sites; towns use the village glyph.
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
        // Narration hook — fires on first entry; desc is the fallback.
        onEnter: z.string().min(1).max(2000).optional(),
        // SRD overland scale: 5280 = 1 mile per square (Travel Pace).
        feetPerSquare: z.number().positive(),
        // The dense terrain grid — dimensions derive from its shape.
        grid: RegionGridSchema,
        // Where the party marker begins on this region's grid.
        startPos: GridPosSchema,
        // Random-encounter roll per square crossed (0–1).
        encounterChance: z.number().min(0).max(1).optional(),
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

// NPC dialogue: a recursive option tree (a response with children is a
// branch, without is a leaf). Dialogue CONSEQUENCES stay code-side for
// now — DB dialogue is social flavor, not script triggers.
interface RoomNpcResponseShape {
  label: string;
  reply?: string;
  responses?: RoomNpcResponseShape[];
}
const RoomNpcResponseSchema: z.ZodType<RoomNpcResponseShape> = z.lazy(() =>
  z
    .object({
      label: z.string().min(1).max(120),
      reply: z.string().min(1).max(2000).optional(),
      responses: z.array(RoomNpcResponseSchema).max(8).optional(),
    })
    .strict()
);

// A bespoke placed NPC. The stat block is optional (overlay defaults it to
// an SRD Commoner-style block); shop item ids resolve against the composed
// loot table at overlay time (unknown ids dropped with a warning).
const RoomNpcSchema = z
  .object({
    id: SLUG,
    name: z.string().min(1).max(80),
    attitude: z.enum(['friendly', 'indifferent', 'hostile']),
    greeting: z.string().min(1).max(2000),
    responses: z.array(RoomNpcResponseSchema).max(8).optional(),
    persuasionDC: z.number().int().min(1).max(30).optional(),
    pos: GridPosSchema.optional(),
    icon: z.string().min(1).max(60).optional(),
    shop: z
      .array(
        z
          .object({ itemId: z.string().min(1).max(80), price: z.number().int().min(0).max(100000) })
          .strict()
      )
      .max(20)
      .optional(),
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
        // SRD tactical scale: 5 ft per square (the default when omitted).
        feetPerSquare: z.number().positive().optional(),
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

// Campaign terrain skin: terrain type → tile id from the shared catalog.
// Every key optional ({} = all defaults); unknown types / tile ids rejected.
const TILE_ID = z.enum(Object.keys(TERRAIN_TILES) as [string, ...string[]]);
const TerrainArtSchema = z
  .object(Object.fromEntries(Object.keys(TERRAIN).map((t) => [t, TILE_ID.optional()])))
  .strict();

export const CAMPAIGN_SECTION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // Narration hook: the first narrative entry of a new game (overlays the
  // code/template campaign.intro).
  gameStart: z.string().min(1).max(4000),
  narratives: NarrativesSchema,
  rooms: RoomsSchema,
  terrainArt: TerrainArtSchema,
  regions: RegionsSchema,
  towns: TownsSchema,
  // Customs ON TOP of the ambient SRD catalogs — same per-entry shapes as
  // the catalogs themselves (these compose into live engine fields).
  customItems: LootTableSchema,
  customMonsters: EnemyTemplatesSchema,
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
