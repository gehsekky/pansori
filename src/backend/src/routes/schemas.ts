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

const RegionsSchema = z
  .array(
    z
      .object({
        id: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, - and _ only'),
        name: z.string().min(1).max(80),
        isStartingRegion: z.boolean(),
        desc: z.string().min(1).max(2000).optional(),
        // SRD overland scale: 5280 = 1 mile per square (Travel Pace).
        feetPerSquare: z.number().positive(),
        gridWidth: z.number().int().min(1).max(200),
        gridHeight: z.number().int().min(1).max(200),
        // Where the party marker begins on this region's grid.
        startPos: GridPosSchema,
        // Random-encounter roll per square crossed (0–1).
        encounterChance: z.number().min(0).max(1).optional(),
        // SRD tiers of play (1 ≈ L1–4, 2 ≈ L5–7, 3 ≈ L8–10).
        baseTier: z.number().int().min(1).max(4).optional(),
      })
      .strict()
      .superRefine((r, ctx) => {
        if (r.startPos.x >= r.gridWidth || r.startPos.y >= r.gridHeight) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `startPos (${r.startPos.x},${r.startPos.y}) is outside the ${r.gridWidth}x${r.gridHeight} grid`,
            path: ['startPos'],
          });
        }
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

export const CAMPAIGN_SECTION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  displayNoun: z.string().min(1).max(40),
  narratives: NarrativesSchema,
  regions: RegionsSchema,
  lootTable: LootTableSchema,
  enemyTemplates: EnemyTemplatesSchema,
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
