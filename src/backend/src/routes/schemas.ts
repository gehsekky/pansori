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

const CampaignRoleSchema = z.enum(['owner', 'editor']);

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
