import {
  ActionSchema,
  AssignCharacterSchema,
  DropSchema,
  EquipSchema,
  JoinSessionSchema,
  NewSessionSchema,
  TransferSchema,
  parseBody,
} from './schemas.js';
import { CAMPAIGN_START_MINUTE, formatGameClock } from '../services/gameClock.js';
import type {
  CampaignFacts,
  Character,
  Context,
  GameState,
  Seed,
  StructuredAction,
} from '../types.js';
import {
  DEFAULT_FIGHTING_STYLE,
  FIGHTING_STYLE_LABELS,
  OFFERED_FIGHTING_STYLE_IDS,
  defenseAcBonus,
  fightingStyleSlotsForClassLevel,
  resolveCreationFightingStyles,
} from '../services/fightingStyle.js';
import {
  FRESH_TURN,
  canDonArmor,
  canDonShield,
  canEquipWeapon,
  computeTotalAc,
  spellSlotsForClassLevel,
} from '../services/rulesEngine.js';
import { Request, Response, Router } from 'express';
import {
  SRD_CASTER_SPELL_COUNTS,
  SRD_DEFAULT_WEAPON_MASTERIES,
  SRD_SPECIES,
  SRD_WEAPON_MASTERY_SLOTS,
  casterSpellCounts,
  defaultCasterSpells,
  defaultClassSkills,
  defaultWeaponMasteries,
  masterableWeapons,
  resolveCasterSpells,
  resolveClassSkills,
  resolveStartingEquipment,
  resolveWeaponMasteries,
} from '../campaignData/srd/index.js';
import { applyAbilityScoreIncreases, isValidForMethod } from '../services/abilityScores.js';
import {
  applyConsequence,
  backfillOwnership,
  generateChoices,
  normalizeState,
  takeAction,
} from '../services/gameEngine.js';
import {
  applyQuestCompletions,
  evaluateQuestSteps,
  extractCampaignDelta,
  loadCampaignState,
  mergeCampaignIntoGameState,
  resetCampaignState,
  saveCampaignState,
  starterQuestProgress,
} from '../services/campaignEngine.js';
import { broadcastParticipantChange, broadcastSessionState } from '../services/broadcast.js';
import {
  casterSpellOptions,
  classSpellListTag,
  expertiseSlotsForClassLevel,
  resolveCreationExpertise,
} from '../services/multiclass.js';
import {
  clearInstance,
  equippedArmorId,
  equippedShieldId,
  equippedWeaponId,
  setSlot,
  slotsForInstance,
  toggleWornItem,
} from '../services/equipment.js';
import { initMapState, regionEnterNarration } from '../services/mapEngine.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { CONTEXTS } from '../services/contextStore.js';
import { applyCreationDivineOrder } from '../services/actions/meta.js';
import { applyFeatTake } from '../services/feats.js';
import { generateSeed } from '../services/procgen.js';
import { listVisibleCampaignIds } from '../services/campaignMembers.js';
import { pool } from '../db/pool.js';
import { randomUUID } from 'crypto';

// Resolved lazily (not a const) because startup applies DB content overlays
// onto CONTEXTS after migrations (services/campaignContent.ts) — a captured
// first-entry reference would keep serving the pre-overlay object.
function defaultContext(): Context {
  return Object.values(CONTEXTS)[0] ?? ({ id: 'none' } as Context);
}

// SRD — initial weapon masteries by class. Each listed class starts
// with these weapons mastered; non-listed classes don't get the feature.
// Picks follow common SRD starting-class examples; the count is
// clamped to SRD_WEAPON_MASTERY_SLOTS (Fighter 3 / Barb-Pal-Rang 2 / Rog 1)
// so we never give a class more masteries than RAW allows.
// After requireAuth, req.user is guaranteed non-null. Pull the id
// through AuthedRequest to drop the `req.user!` non-null assertions at
// every callsite — both shorter and louder if some future route forgets
// the auth middleware (TS will reject the cast at the boundary).
function authedUserId(req: Request): string {
  return (req as AuthedRequest).user.id;
}

// Shape of a row in the game_sessions table — the columns the route
// handlers actually read off the pool.query result. Kept narrow on
// purpose; if a new column needs reading, add it here so all callers
// get typed access.
interface SessionRow {
  id: string;
  user_id: string;
  status: string;
  state: Record<string, unknown>;
  seed: Seed;
  invite_token: string | null;
  campaign_state_id: string | null;
  // Monotonically increases on every successful takeAction. Clients send
  // their last-known value with each action so the server can reject
  // stale-state writes (race detection in multiplayer).
  turn_seq: number;
  created_at: Date;
  updated_at: Date;
}

// Fetch a session row IFF the requesting user is a participant. Returns null
// if the session doesn't exist OR the user isn't in session_participants.
// Returning 404 on "not a participant" mirrors the pre-MP behavior — we
// don't differentiate "session doesn't exist" from "you can't see it" so
// random session ids don't leak existence.
async function fetchSessionForParticipant(
  sessionId: string | string[] | undefined,
  userId: string
): Promise<SessionRow | null> {
  if (typeof sessionId !== 'string') return null;
  const { rows } = await pool.query<SessionRow>(
    `SELECT gs.*
       FROM game_sessions gs
       INNER JOIN session_participants sp
         ON sp.session_id = gs.id AND sp.user_id = $2
      WHERE gs.id = $1
      LIMIT 1`,
    [sessionId, userId]
  );
  return rows[0] ?? null;
}

export const gameRouter = Router();

// List the game contexts available TO THIS USER (id + display metadata only
// — no rules/loot): global campaigns plus any the user is a member of
// (owner/editor/player). Private campaigns stay invisible to non-members —
// this list is what gates the new-game picker. Backgrounds carry their
// `originFeat` id so the FE can spot Magic Initiate at character creation
// and route to the spell picker. Spell metadata is included as a slim list
// per `spellList` tag (arcane / divine / primal) for the same picker.
gameRouter.get('/contexts', async (req, res) => {
  let visible: Set<string>;
  // The registry name is the campaign's display name (creator-renamable);
  // displayNoun is only the legacy fallback when the registry is down.
  const names = new Map<string, string>();
  try {
    visible = await listVisibleCampaignIds(pool, (req as AuthedRequest).user);
    const { rows } = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM campaigns'
    );
    for (const row of rows) names.set(row.id, row.name);
  } catch (err) {
    // Registry unavailable (e.g. mid-migration) — fail open to the code-
    // defined contexts rather than blanking the new-game page; the code
    // contexts are exactly the global built-ins today.
    console.error('[contexts] visibility lookup failed — falling back to all:', err);
    visible = new Set(Object.keys(CONTEXTS));
  }
  const list = Object.values(CONTEXTS)
    .filter((c) => visible.has(c.id))
    .map((c) => {
      const spells = Object.values(c.spellTable ?? {}).map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
        desc: s.desc,
        spellList: s.spellList ?? [],
      }));
      return {
        id: c.id,
        displayName: names.get(c.id) ?? c.displayNoun,
        classes: Object.keys(c.classPrimaryStats),
        // Per-class "choose N from options" skill proficiencies + the curated
        // default selection — drives the creation-screen skill picker.
        classSkillChoices: Object.fromEntries(
          Object.entries(c.classSkillChoices ?? {}).map(([cls, choice]) => [
            cls,
            {
              count: choice.count,
              options: choice.options,
              default: defaultClassSkills(cls, c.classSkills?.[cls] ?? []),
            },
          ])
        ),
        // Starting-equipment packages with item display names resolved, for the
        // creation-screen picker.
        classStartingEquipment: Object.fromEntries(
          Object.entries(c.classStartingEquipment ?? {}).map(([cls, pkgs]) => [
            cls,
            pkgs.map((p) => ({
              id: p.id,
              label: p.label,
              gold: p.gold,
              items: p.items.map((id) => c.lootTable.find((l) => l.id === id)?.name ?? id),
            })),
          ])
        ),
        // Weapon Mastery options per class with the feature (the weapons it may
        // master + slot count + default picks), for the creation-screen picker.
        weaponMasteryChoices: Object.fromEntries(
          Object.keys(c.classPrimaryStats)
            .map((cls) => {
              const count = SRD_WEAPON_MASTERY_SLOTS[cls] ?? 0;
              if (count <= 0) return null;
              const options = masterableWeapons(
                c.classWeaponProficiencies?.[cls] ?? [],
                c.lootTable
              );
              return [
                cls,
                {
                  count,
                  options,
                  default: defaultWeaponMasteries(
                    SRD_DEFAULT_WEAPON_MASTERIES[cls] ?? [],
                    options.map((o) => o.id),
                    count
                  ),
                },
              ] as const;
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
        ),
        // Fighting Style options for classes that grant one at level 1 (Fighter),
        // for the creation-screen picker. Later picks are made in-game.
        fightingStyleChoices: Object.fromEntries(
          Object.keys(c.classPrimaryStats)
            .map((cls) => {
              const count = fightingStyleSlotsForClassLevel(cls, 1);
              if (count <= 0) return null;
              return [
                cls,
                {
                  count,
                  options: OFFERED_FIGHTING_STYLE_IDS.map((id) => ({
                    id,
                    label: FIGHTING_STYLE_LABELS[id] ?? id,
                  })),
                  default: DEFAULT_FIGHTING_STYLE,
                },
              ] as const;
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
        ),
        // SRD Cleric Divine Order — the Cleric (divine-list) cantrips a Thaumaturge
        // can learn at creation, for the creation-screen dropdown.
        divineOrderCantrips: Object.values(c.spellTable ?? {})
          .filter(
            (s) =>
              s.level === 0 &&
              ((s as { spellList?: ReadonlyArray<string> }).spellList?.includes('divine') ?? false)
          )
          .map((s) => ({ id: s.id, name: s.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        // Caster spell picks at creation — per full-caster class, the spell-list
        // tag + how many cantrips / level-1 spells to choose + the default
        // pre-selection. The FE filters the `spells` array above by the tag.
        casterSpellChoices: Object.fromEntries(
          Object.keys(c.classPrimaryStats)
            .map((cls) => {
              const tag = classSpellListTag(cls);
              if (!tag || !(cls in SRD_CASTER_SPELL_COUNTS)) return null;
              const available = casterSpellOptions(cls, c.spellTable ?? {});
              const counts = casterSpellCounts(cls, available);
              if (!counts || counts.cantrips + counts.l1 === 0) return null;
              const def = defaultCasterSpells(cls, available, c.classSpells?.[cls] ?? []);
              return [
                cls,
                {
                  spellList: tag,
                  cantripCount: counts.cantrips,
                  l1Count: counts.l1,
                  defaultCantrips: def.cantrips,
                  defaultL1: def.l1,
                },
              ] as const;
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
        ),
        // SRD Expertise slots a class grants at level 1 (Rogue: 2), for the
        // creation picker. Only the count travels — the eligible skills are the
        // character's proficiencies (class + background + species), which the
        // creation screen assembles from the live draft.
        expertiseChoices: Object.fromEntries(
          Object.keys(c.classPrimaryStats)
            .map((cls) => {
              const count = expertiseSlotsForClassLevel(cls, 1);
              return count > 0 ? ([cls, { count }] as const) : null;
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
        ),
        backgrounds: (c.backgrounds ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          desc: b.desc,
          skillProficiencies: b.skillProficiencies,
          toolProficiency: b.toolProficiency ?? null,
          feature: b.feature,
          featureDesc: b.featureDesc,
          originFeat: b.originFeat ?? null,
          // The three abilities this background can boost — the creation UI uses
          // them to offer the +2/+1 split.
          abilityScoreIncreases: b.abilityScoreIncreases ?? [],
        })),
        featTable: c.featTable
          ? Object.fromEntries(
              Object.entries(c.featTable).map(([id, f]) => [
                id,
                { id: f.id, name: f.name, desc: f.desc, effect: f.effect },
              ])
            )
          : {},
        spells,
      };
    });
  res.json(list);
});

// Get a specific session by ID (must be a participant)
gameRouter.get('/session/:id', async (req: Request, res: Response) => {
  try {
    const row = await fetchSessionForParticipant(req.params.id, authedUserId(req));
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const ctxId = row.seed?.context_id;
    const ctx = ctxId ? CONTEXTS[ctxId] : undefined;
    res.json({ ...row, campaignMeta: campaignMetaFor(ctx) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List all sessions the user is participating in. Was "where I'm the host" —
// now "where I have a session_participants row." For solo mode the host
// always has a row (migration 010 backfilled it), so this is a strict
// superset of the old behavior.
gameRouter.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT gs.id,
              gs.status,
              gs.seed->>'context_id' AS context_id,
              gs.state->'characters'->0->>'name' AS character_name,
              gs.state->'characters'->0->>'character_class' AS character_class,
              gs.state->'characters'->0->>'portrait_url' AS portrait_url,
              jsonb_array_length(COALESCE(gs.state->'characters', '[]'::jsonb)) AS party_size,
              gs.user_id AS host_user_id,
              gs.created_at, gs.updated_at
         FROM game_sessions gs
         INNER JOIN session_participants sp
           ON sp.session_id = gs.id AND sp.user_id = $1
        ORDER BY gs.updated_at DESC`,
      [authedUserId(req)]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete a single session — HOST-ONLY. Participants can't delete each
// other's sessions; that's a destructive operation reserved for the
// session creator. A non-host participant who wants out should use
// the leave endpoint (PR 4) which removes their session_participants
// row without deleting the session for everyone else.
gameRouter.delete('/session/:id', async (req: Request, res: Response) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, authedUserId(req)]
    );
    if (!rowCount) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete all completed sessions (dead / escaped / abandoned) for the current user
gameRouter.delete('/sessions/completed', async (req: Request, res: Response) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM game_sessions WHERE user_id = $1 AND status IN ('dead', 'escaped', 'abandoned')",
      [authedUserId(req)]
    );
    res.json({ ok: true, deleted: rowCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Start a new roguelike run — accepts a party of 1–4 characters
gameRouter.post('/session/new', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, NewSessionSchema);
  if (!parsed) return;
  const { characters, context_id } = parsed;

  // RE-3 — when a character declares how its `stats` were generated, validate
  // the spread (point buy = all 8–15 totalling 27; standard array = a
  // permutation of 15/14/13/12/10/8). 'manual'/omitted trusts the client.
  for (const c of characters) {
    if (c.stats && !isValidForMethod(c.stats, c.generation_method)) {
      res.status(400).json({
        error: `${c.name}'s ability scores are not a valid ${c.generation_method} spread.`,
      });
      return;
    }
  }

  const ctx = CONTEXTS[context_id ?? ''] ?? defaultContext();
  // Visibility gate: a private campaign is playable only by its members
  // (the /contexts list already hides it, but enforce server-side too).
  try {
    const visible = await listVisibleCampaignIds(pool, (req as AuthedRequest).user);
    if (!visible.has(ctx.id)) {
      res.status(403).json({ error: 'campaign_not_visible' });
      return;
    }
  } catch (err) {
    // Same fail-open rationale as /contexts: code contexts are the global
    // built-ins, so a registry hiccup must not block starting those.
    console.error('[session/new] visibility lookup failed — allowing code context:', err);
  }
  const seed = generateSeed(ctx, characters.length);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hostUserId = authedUserId(req);
    const partyChars: Character[] = characters.map((c, _charIdx) => {
      let base = c.stats
        ? {
            str: c.stats.str,
            dex: c.stats.dex,
            con: c.stats.con,
            int: c.stats.int,
            wis: c.stats.wis,
            cha: c.stats.cha,
          }
        : { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      const bg = ctx.backgrounds?.find((b) => b.id === c.background_id) ?? null;
      // SRD — ability-score increases come from the background. The player
      // picks either +2/+1 across two of the three listed abilities (`ability_bonus`)
      // or +1 to all three (omitted); the helper re-validates the split.
      base = applyAbilityScoreIncreases(base, bg?.abilityScoreIncreases ?? [], c.ability_bonus);
      // 2024 class skill proficiencies — the player's chosen "N from the class
      // list", re-validated against the class options (falls back to the
      // curated default on an invalid/omitted choice).
      const classSkills = resolveClassSkills(
        c.character_class,
        c.class_skills,
        ctx.classSkills?.[c.character_class] ?? []
      );
      // SRD species traits — speed, darkvision, resistances, innate
      // cantrips. Defaults to Human when missing/unknown.
      const speciesId = c.species && SRD_SPECIES[c.species] ? c.species : 'human';
      const speciesData = SRD_SPECIES[speciesId];
      const dwarfHpBonus = speciesId === 'dwarf' ? 1 : 0;

      // Species-driven skill grants. Elf Keen Senses → Perception. Human
      // Skillful → +1 from a small starter list (Athletics) so Humans pick
      // up extra coverage at L1 without a feat picker.
      const speciesSkills: string[] = [];
      if (speciesId === 'elf' || speciesId === 'drow') speciesSkills.push('Perception');
      if (speciesId === 'human') speciesSkills.push('Athletics');
      const skillProfs = Array.from(
        new Set([...classSkills, ...(bg?.skillProficiencies ?? []), ...speciesSkills])
      );
      const toolProfs = bg?.toolProficiency ? [bg.toolProficiency] : [];
      const armorProfs = ctx.classArmorProficiencies?.[c.character_class] ?? [];
      const weaponProfs = ctx.classWeaponProficiencies?.[c.character_class] ?? [];

      const hitDie = ctx.classHitDie[c.character_class] ?? 8;
      const conMod = Math.floor(((base.con ?? 10) - 10) / 2);
      // SRD: max hit die + CON mod at level 1. Dwarven Toughness adds +1
      // max HP per level. Subclass HP riders (e.g. Sorcerer Draconic
      // Resilience) are granted retroactively by `applySubclass` when the
      // single SRD subclass auto-applies at level 3 — not at creation.
      const maxHp = Math.max(1, hitDie + conMod + dwarfHpBonus);

      // 2024 starting equipment — the player's chosen "Choose A/B/C" package
      // (items + GP), or the default package / legacy classStartingLoot when
      // none is supplied.
      const startingEq = resolveStartingEquipment(
        ctx.classStartingEquipment?.[c.character_class],
        c.starting_equipment,
        ctx.classStartingLoot?.[c.character_class] ?? ctx.campaign?.defaultStartingLoot ?? []
      );
      const startingIds = startingEq.items;
      const startingInventory = startingIds
        .map((id) => {
          const item = ctx.lootTable.find((l) => l.id === id);
          return item ? { ...item, instance_id: randomUUID() } : null;
        })
        .filter((i): i is NonNullable<typeof i> => i !== null);

      // Auto-equip: first weapon-slot item, first armor-slot item, first shield-slot item
      const firstWeapon = startingInventory.find(
        (i) => ctx.lootTable.find((l) => l.id === i.id)?.slot === 'weapon'
      );
      const firstArmor = startingInventory.find(
        (i) => ctx.lootTable.find((l) => l.id === i.id)?.slot === 'armor'
      );
      const firstShield = startingInventory.find(
        (i) => ctx.lootTable.find((l) => l.id === i.id)?.slot === 'shield'
      );
      const firstAmmo = startingInventory.find(
        (i) => ctx.lootTable.find((l) => l.id === i.id)?.slot === 'quiver'
      );

      const equippedWeapon = firstWeapon?.instance_id ?? null;
      const equippedArmor = firstArmor?.instance_id ?? null;
      const equippedShield = firstShield?.instance_id ?? null;
      const equippedQuiver = firstAmmo?.instance_id ?? null;

      const initialAc = computeTotalAc(
        base.dex ?? 10,
        equippedArmor,
        equippedShield,
        startingInventory,
        ctx.lootTable
      );

      // 2024 Weapon Mastery — the player's chosen masteries (validated against
      // the weapons this class may master), or the curated default, trimmed to
      // the class's slot count.
      const masteryCount = SRD_WEAPON_MASTERY_SLOTS[c.character_class] ?? 0;
      const masteryOptionIds = masterableWeapons(weaponProfs, ctx.lootTable).map((w) => w.id);
      const weaponMasteries = resolveWeaponMasteries(
        c.weapon_masteries,
        masteryOptionIds,
        masteryCount,
        SRD_DEFAULT_WEAPON_MASTERIES[c.character_class] ?? []
      );

      // Caster spell picks (level 1) — the player-chosen (or default) cantrips +
      // level-1 spells become `spells_known`. Non-caster / half-caster classes
      // keep the curated `classSpells` default. (Re-validated server-side.)
      const curatedKnown = ctx.classSpells?.[c.character_class] ?? [];
      const casterStartingSpells = (() => {
        if (!(c.character_class in SRD_CASTER_SPELL_COUNTS)) return curatedKnown;
        const available = casterSpellOptions(c.character_class, ctx.spellTable ?? {});
        const picks = resolveCasterSpells(
          c.character_class,
          c.caster_spells,
          available,
          curatedKnown
        );
        return [...picks.cantrips, ...picks.l1];
      })();

      const builtChar: Character = {
        id: randomUUID(),
        name: c.name,
        character_class: c.character_class,
        // Multiclass schema seam — every PC starts as single-class with
        // 1 level in its first class. Future level-ups via multiclass
        // bump the matching key; mono-class level-ups continue to
        // increment both this and `level`.
        class_levels: { [c.character_class.toLowerCase()]: 1 },
        portrait_url: c.portrait_url ?? null,
        hp: maxHp,
        max_hp: maxHp,
        ac: initialAc,
        ...base,
        xp: 0,
        level: 1,
        gold: startingEq.gold,
        inventory: startingInventory,
        equipment: {
          ...(equippedWeapon ? { main_hand: equippedWeapon } : {}),
          ...(equippedArmor ? { armor: equippedArmor } : {}),
          ...(equippedShield ? { shield: equippedShield } : {}),
          ...(equippedQuiver ? { quiver: equippedQuiver } : {}),
        },
        conditions: [],
        condition_durations: {},
        death_saves: { successes: 0, failures: 0 },
        stable: false,
        dead: false,
        turn_actions: { ...FRESH_TURN },
        initiative_roll: null,
        hit_die: ctx.classHitDie[c.character_class] ?? 8,
        hit_dice_remaining: 1,
        class_resource_uses: {},
        asi_pending: false,
        exhaustion_level: 0,
        background_id: bg?.id ?? null,
        skill_proficiencies: skillProfs,
        tool_proficiencies: toolProfs,
        // Level-1 spell slots from the canonical SRD table (full casters {1:2},
        // half-casters none until L2, Warlock Pact Magic {1:1}). Slots are
        // recomputed by spellSlotsForChar on every level-up; this just seeds
        // creation, replacing the old per-context classSpellSlots table.
        spell_slots_max: spellSlotsForClassLevel(c.character_class.toLowerCase(), 1),
        spell_slots_used: {},
        spells_known: casterStartingSpells,
        armor_proficiencies: armorProfs,
        weapon_proficiencies: weaponProfs,
        // SRD Weapon Mastery — the player-chosen (or default) mastered
        // weapons. Classes without the feature get an empty list.
        weapon_masteries: weaponMasteries,
        // 2024 Fighting Style — the Fighter's level-1 pick (chosen or default).
        // Other classes start empty (Paladin/Ranger pick theirs in-game at L2).
        fighting_styles: resolveCreationFightingStyles(c.character_class, c.fighting_style),
        // SRD Expertise — the Rogue's two level-1 picks (chosen or default).
        // Other classes start empty (Bard/Wizard gain Expertise in-game at L2).
        expertise_skills: resolveCreationExpertise(
          c.character_class,
          c.rogue_expertise,
          skillProfs
        ),
        attuned_items: [],
        // 2024 SRD: every class chooses its subclass at level 3, and pansori's
        // strict-SRD build has exactly one subclass per class — so creation no
        // longer takes a subclass. The single SRD subclass auto-applies at L3
        // via `applyLevelUpForClass` → `applySubclass`. Heroes start L1 with none.
        subclass: undefined,
        // SRD species — seed mechanical traits from the catalog.
        species: speciesId,
        speed: speciesData.speedFt,
        darkvision_ft: speciesData.darkvisionFt,
        // Multiplayer ownership — every PC defaults to the host at
        // creation. The host can reassign via the participants modal
        // (PR 4) when a friend joins. Solo sessions never see this
        // touched. See docs/TODO.md "Multiplayer MVP".
        owner_user_id: hostUserId,
        // Species innate cantrips merged into spells_known so the engine
        // surfaces them without slot cost.
        ...(speciesData.innateCantrips && speciesData.innateCantrips.length > 0
          ? { spells_known: [...casterStartingSpells, ...speciesData.innateCantrips] }
          : {}),
      };
      // SRD Cleric Divine Order (level 1) — apply the creation-screen pick.
      // Protector trains Martial weapons + Heavy armor; Thaumaturge learns the
      // chosen Cleric cantrip (the +WIS to Arcana/Religion is read off
      // `divine_order`). Omitted leaves it unset — the in-game prompt then
      // surfaces it as a fallback.
      applyCreationDivineOrder(builtChar, c.divine_order, c.divine_order_cantrip, ctx.spellTable);
      // Apply origin feat from background. SRD grants one origin
      // feat per background (Acolyte → Magic Initiate, Farmer → Tough,
      // etc.). The feat is auto-applied at creation; no asi_pending
      // is consumed because origin feats don't compete with ASI slots.
      // Magic Initiate variants need `feat_choices` from the FE picker
      // — without choices the feat applies a no-op narrative.
      if (bg?.originFeat) {
        const feat = ctx.featTable?.[bg.originFeat];
        if (feat) {
          const { newChar } = applyFeatTake(builtChar, feat, {
            cantripChoices: c.feat_choices?.cantripChoices,
            l1Choice: c.feat_choices?.l1Choice,
          });
          return newChar;
        }
      }
      return builtChar;
    });

    const leader = partyChars[0];
    const initialState: GameState = {
      characters: partyChars,
      active_character_id: leader.id,
      // The party starts on the regional grid (initMapState sets the marker +
      // clears current_room below); no room until they enter a site.
      current_room: '',
      visited_rooms: [],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
      initiative_idx: 0,
      run_log: [],
      room_log: [],
      last_choices: [],
      short_rested_rooms: [],
      long_rested: false,
      // In-game clock: campaigns start at Day 1, 08:00. // SRD: Day 1 08:00.
      world_minute: CAMPAIGN_START_MINUTE,
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      flags: {},
      npc_attitudes: {},
      npc_talked: [],
      // The campaign's opening quest(s) start active so the player begins with
      // direction; every other quest stays hidden from the log until discovered.
      quest_progress: starterQuestProgress(ctx.campaign?.quests),
    };

    // 3-level grid map model — if the campaign defines `regions`, start the party
    // on the regional grid (single marker at the region's start cell). No-op for
    // campaigns still on the Location model.
    Object.assign(initialState, initMapState(ctx.campaign, initialState));

    // Announce the opening quest(s) in the intro so the player has immediate
    // direction (they also appear in the quest log).
    const starterQuestLine = (ctx.campaign?.quests ?? [])
      .filter((q) => q.startActive)
      .map((q) => `\n\n✦ Quest: ${q.title} — ${q.desc}`)
      .join('');
    // regionEnter narration hook — game start counts as first entry to the
    // starting region (initMapState recorded it in visited_regions).
    const regionArrival = regionEnterNarration(ctx.campaign, initialState.current_region_id);
    const startNarrative = seed.intro + regionArrival + starterQuestLine;
    initialState.run_log = [
      { character_id: leader.id, action: 'start', narrative: startNarrative },
    ];
    initialState.room_log = [startNarrative];
    initialState.last_choices = generateChoices(initialState, seed, ctx);

    // Random invite token used to build the shareable URL (?join=<token>).
    // 36 chars of UUID4 = 122 bits of entropy; effectively unguessable.
    // Host can rotate via POST /session/:id/rotate-invite if the link leaks.
    const inviteToken = randomUUID();
    const {
      rows: [session],
    } = await client.query(
      `INSERT INTO game_sessions (user_id, seed, state, invite_token)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [hostUserId, JSON.stringify(seed), JSON.stringify(initialState), inviteToken]
    );
    // Add the host as a participant. The migration backfilled existing
    // sessions; this row covers newly-created ones. PR 2's auth guards
    // expect every session to have at least one participant row.
    await client.query(
      `INSERT INTO session_participants (session_id, user_id, role)
       VALUES ($1, $2, 'pc')
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [session.id, hostUserId]
    );
    await client.query('COMMIT');
    // Reset persisted campaign state so a fresh adventure doesn't inherit
    // quest progress / faction rep / world day from a previous run of the
    // same campaign. campaign_states is keyed on (user_id, campaign_id),
    // not per-session — without this, "+ NEW ADVENTURE" for Vale shows
    // every quest from the prior Vale playthrough already marked done.
    if (ctx.campaign) {
      await resetCampaignState(pool, authedUserId(req), ctx.id);
      // Seed the fresh persisted campaign state with the opening quest(s) marked
      // active, matching initialState.quest_progress — so the first action's
      // quest-step evaluation treats the starter as already-active (rather than
      // re-running its first step as an auto-accept).
      const starters = starterQuestProgress(ctx.campaign.quests);
      if (starters.length) {
        await saveCampaignState(pool, {
          campaign_id: ctx.id,
          user_id: authedUserId(req),
          world_minute: CAMPAIGN_START_MINUTE,
          current_location: '',
          flags: {},
          quests: starters,
          faction_rep: {},
          npc_attitudes: {},
        });
      }
    }
    res.json({ session, state: initialState, seed, campaignMeta: campaignMetaFor(ctx) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// Campaign metadata helper — returns quests, factions, and locations for a context
// (only meaningful when the context has campaign mode enabled). Used by the UI to
// render the quest journal, faction rep display, and town/district navigation.
function campaignMetaFor(ctx: Context | undefined) {
  const cmp = ctx?.campaign;
  if (!cmp) return null;
  return {
    quests: cmp.quests ?? [],
    factions: cmp.factions ?? [],
  };
}

// Equip or unequip an item — enforces 5e equipment rules for the specified character
gameRouter.post('/session/:id/equip', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, EquipSchema);
  if (!parsed) return;
  const { item_id, character_id } = parsed;
  try {
    const userId = authedUserId(req);
    const row = await fetchSessionForParticipant(req.params.id, userId);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const ctx = CONTEXTS[row.seed.context_id ?? ''] ?? defaultContext();
    const state = backfillOwnership(normalizeState(row.state), row.user_id);

    // Resolve target character
    const targetId = character_id ?? state.active_character_id;
    const charIdx = state.characters.findIndex((c) => c.id === targetId);
    if (charIdx < 0) {
      res.status(400).json({ error: 'Character not found in session' });
      return;
    }

    // Owner check: only the PC's owner can equip/unequip on it. Equipment
    // is a mechanical decision that affects how the engine resolves
    // subsequent actions; another participant shouldn't be able to flip
    // a friend's gear mid-session.
    if (state.characters[charIdx].owner_user_id !== userId) {
      res.status(403).json({
        error: `Only ${state.characters[charIdx].name}'s player can change their equipment.`,
      });
      return;
    }

    let char = { ...state.characters[charIdx] };
    char = { ...char, attuned_items: char.attuned_items ?? [] };
    const combatActive = state.combat_active ?? false;
    const turnActions = char.turn_actions ?? { ...FRESH_TURN };

    const inventoryItem = char.inventory.find((i) => i.instance_id === item_id);
    const loot = inventoryItem ? ctx.lootTable.find((l) => l.id === inventoryItem.id) : undefined;
    if (!loot || !inventoryItem) {
      res.status(400).json({ error: 'Unknown item' });
      return;
    }
    const iid = item_id!;

    // Attunement check: magic items that require attunement cannot be equipped until attuned
    if (loot.requiresAttunement && !(char.attuned_items ?? []).includes(iid)) {
      res
        .status(400)
        .json({ error: 'This item requires attunement. Attune to it first (out of combat).' });
      return;
    }
    if (loot.slot === 'shield') {
      const check = canDonShield(combatActive);
      if (!check.allowed) {
        res.status(409).json({ error: check.reason });
        return;
      }
      const toggling = equippedShieldId(char) === iid;
      char.equipment = setSlot(char.equipment, 'shield', toggling ? null : iid);
      char.ac =
        computeTotalAc(
          char.dex,
          equippedArmorId(char),
          equippedShieldId(char),
          char.inventory,
          ctx.lootTable,
          char.mage_armor_active ?? false,
          char.shield_of_faith_active ?? false
        ) + defenseAcBonus(char, ctx.lootTable);
    } else if (loot.slot === 'armor') {
      const toggling = equippedArmorId(char) === iid;
      const check = canDonArmor(combatActive, loot.armorCategory ?? 'light');
      if (!check.allowed) {
        res.status(409).json({ error: check.reason });
        return;
      }
      char.equipment = setSlot(char.equipment, 'armor', toggling ? null : iid);
      char.ac =
        computeTotalAc(
          char.dex,
          equippedArmorId(char),
          equippedShieldId(char),
          char.inventory,
          ctx.lootTable,
          char.mage_armor_active ?? false,
          char.shield_of_faith_active ?? false
        ) + defenseAcBonus(char, ctx.lootTable);
    } else if (loot.damage) {
      const toggling = equippedWeaponId(char) === iid;
      const check = canEquipWeapon(combatActive, turnActions);
      if (!check.allowed) {
        res.status(409).json({ error: check.reason });
        return;
      }
      char.equipment = setSlot(char.equipment, 'main_hand', toggling ? null : iid);
      if ('cost' in check && check.cost === 'free_interaction') {
        char.turn_actions = { ...turnActions, free_interaction_used: true };
      }
    } else if (loot.slot) {
      // Worn wondrous items (head/neck/cloak/hands/arms/waist/feet + rings).
      // No armor-style don/doff combat gate — the attunement requirement (above)
      // is the out-of-combat gate for the magic items that need one. Toggling:
      // if it's already worn in one of its candidate slots, take it off; else
      // place it in the first free candidate slot (rings fill ring_1 then ring_2).
      const result = toggleWornItem(char.equipment, loot.slot, iid);
      if ('full' in result) {
        res
          .status(409)
          .json({ error: `No free ${loot.slot} slot — unequip something there first.` });
        return;
      }
      char.equipment = result.equipment;
    } else {
      res.status(400).json({ error: 'Item is not equippable' });
      return;
    }

    const newState: GameState = {
      ...state,
      characters: state.characters.map((c, i) => (i === charIdx ? char : c)),
    };

    await pool.query('UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(newState),
      row.id,
    ]);
    res.json({ newState });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Transfer an item from one party member to another. SRD lets you
// interact with one object per turn free (move + give); we don't gate on
// action economy here — the inventory UI treats transfers as fluid.
gameRouter.post('/session/:id/transfer', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, TransferSchema);
  if (!parsed) return;
  const { item_instance_id, from_character_id, to_character_id } = parsed;
  if (from_character_id === to_character_id) {
    res.status(400).json({ error: 'Cannot transfer to the same character' });
    return;
  }
  try {
    const userId = authedUserId(req);
    const row = await fetchSessionForParticipant(req.params.id, userId);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const state = backfillOwnership(normalizeState(row.state), row.user_id);
    const fromIdx = state.characters.findIndex((c) => c.id === from_character_id);
    const toIdx = state.characters.findIndex((c) => c.id === to_character_id);
    if (fromIdx < 0 || toIdx < 0) {
      res.status(400).json({ error: 'Character not found in session' });
      return;
    }
    const fromChar = state.characters[fromIdx];
    const toChar = state.characters[toIdx];
    if (fromChar.dead || toChar.dead) {
      res.status(409).json({ error: 'Cannot transfer to or from a dead character' });
      return;
    }
    // Owner check on the SOURCE PC only. Transfer is semantically "I give
    // you my X" — the source's owner is the one initiating. Taking from
    // another player's PC isn't allowed; if they want to give you their
    // item, they initiate the transfer.
    if (fromChar.owner_user_id !== userId) {
      res.status(403).json({
        error: `Only ${fromChar.name}'s player can transfer items from their inventory.`,
      });
      return;
    }
    const item = fromChar.inventory.find((i) => i.instance_id === item_instance_id);
    if (!item) {
      res.status(400).json({ error: 'Item not found on source character' });
      return;
    }
    // Equipped items must be unequipped before transfer (5e: donning another
    // person's armor takes an hour; we approximate with a hard block).
    if (slotsForInstance(fromChar.equipment, item_instance_id).length > 0) {
      res.status(409).json({ error: 'Unequip the item before transferring it.' });
      return;
    }

    const newFrom = {
      ...fromChar,
      inventory: fromChar.inventory.filter((i) => i.instance_id !== item_instance_id),
      attuned_items: (fromChar.attuned_items ?? []).filter((id) => id !== item_instance_id),
    };
    const newTo = { ...toChar, inventory: [...toChar.inventory, item] };
    const newState: GameState = {
      ...state,
      characters: state.characters.map((c, i) => {
        if (i === fromIdx) return newFrom;
        if (i === toIdx) return newTo;
        return c;
      }),
    };
    await pool.query('UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(newState),
      row.id,
    ]);
    res.json({ newState });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Drop an item from a character's inventory. v1: the dropped item is lost
// (not added back to room loot). Can extend later if "drop and pick up
// again" is desired.
gameRouter.post('/session/:id/drop', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, DropSchema);
  if (!parsed) return;
  const { item_instance_id, character_id } = parsed;
  try {
    const userId = authedUserId(req);
    const row = await fetchSessionForParticipant(req.params.id, userId);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const state = backfillOwnership(normalizeState(row.state), row.user_id);
    const charIdx = state.characters.findIndex((c) => c.id === character_id);
    if (charIdx < 0) {
      res.status(400).json({ error: 'Character not found in session' });
      return;
    }
    const char = state.characters[charIdx];
    if (char.owner_user_id !== userId) {
      res.status(403).json({
        error: `Only ${char.name}'s player can drop items from their inventory.`,
      });
      return;
    }
    if (!char.inventory.find((i) => i.instance_id === item_instance_id)) {
      res.status(400).json({ error: 'Item not found in character inventory' });
      return;
    }
    const newChar = {
      ...char,
      inventory: char.inventory.filter((i) => i.instance_id !== item_instance_id),
      equipment: clearInstance(char.equipment, item_instance_id),
      attuned_items: (char.attuned_items ?? []).filter((id) => id !== item_instance_id),
    };
    const newState: GameState = {
      ...state,
      characters: state.characters.map((c, i) => (i === charIdx ? newChar : c)),
    };
    await pool.query('UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(newState),
      row.id,
    ]);
    res.json({ newState });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Take a game action
// Multiplayer — host reassigns which user owns a given PC. Lets the host
// hand a PC to a participant via the participants modal (PR 4). Updates
// state.characters[i].owner_user_id in the JSONB blob; the next read
// (any subsequent normalizeState pass) surfaces the new owner.
gameRouter.post('/session/:id/assign-character', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, AssignCharacterSchema);
  if (!parsed) return;
  const { character_id, owner_user_id: newOwner } = parsed;
  try {
    const userId = authedUserId(req);
    // Host-only: confirm the requester is the session's user_id (not
    // just any participant). A non-host participant can't reassign
    // ownership — keeps the host as the single point of authority
    // over party composition.
    const { rows } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Session not found or you are not the host.' });
      return;
    }
    // The new owner must be a participant of this session (host
    // can't assign a PC to a user who hasn't joined). Defends
    // against the host typo'ing a random uuid.
    const { rowCount: participantRows } = await pool.query(
      'SELECT 1 FROM session_participants WHERE session_id = $1 AND user_id = $2',
      [req.params.id, newOwner]
    );
    if (!participantRows) {
      res.status(400).json({ error: 'Target user is not a participant of this session.' });
      return;
    }
    const state = backfillOwnership(normalizeState(row.state), row.user_id);
    const charIdx = state.characters.findIndex((c) => c.id === character_id);
    if (charIdx < 0) {
      res.status(400).json({ error: 'Character not found in session.' });
      return;
    }
    const newState: GameState = {
      ...state,
      characters: state.characters.map((c, i) =>
        i === charIdx ? { ...c, owner_user_id: newOwner } : c
      ),
    };
    await pool.query('UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(newState),
      req.params.id,
    ]);
    // Push the updated ownership + state to every participant so their
    // UIs re-render "who owns what" without a refetch.
    broadcastSessionState(row.id, { state: newState });
    broadcastParticipantChange(row.id, 'ownership-changed', {
      character_id,
      owner_user_id: newOwner,
    });
    res.json({ ok: true, character_id, owner_user_id: newOwner });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List participants of a session, with the names of the user accounts
// driving each one. The host's participants modal calls this to render
// the "who's in this session" panel + per-PC owner dropdown. Any
// participant can read this — it's not sensitive (the user IDs are
// already implicit in the broadcasts they receive).
gameRouter.get('/session/:id/participants', async (req: Request, res: Response) => {
  try {
    const row = await fetchSessionForParticipant(req.params.id, authedUserId(req));
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT sp.user_id, sp.role, sp.joined_at,
              u.display_name, u.avatar_url
         FROM session_participants sp
         INNER JOIN users u ON u.id = sp.user_id
        WHERE sp.session_id = $1
        ORDER BY sp.joined_at`,
      [req.params.id]
    );
    res.json({ host_user_id: row.user_id, participants: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Host-only: rotate the invite_token so any previously-shared links
// stop working. Useful when a link leaks or the host wants to lock
// the party down after everyone has joined.
gameRouter.post('/session/:id/rotate-invite', async (req: Request, res: Response) => {
  try {
    const userId = authedUserId(req);
    const newToken = randomUUID();
    const { rows } = await pool.query(
      `UPDATE game_sessions
          SET invite_token = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING invite_token`,
      [newToken, req.params.id, userId]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Session not found or you are not the host.' });
      return;
    }
    res.json({ invite_token: rows[0].invite_token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Multiplayer — voluntary leave. Non-host participant removes themselves
// from the session. PCs they owned auto-transfer to the host so no
// turn-enforcement check ever encounters an orphan owner_user_id.
//
// Host can't leave (they'd nuke their own session) — they DELETE the
// whole session via DELETE /session/:id instead. Rejecting host leaves
// here also avoids the "transfer PCs to whom?" ambiguity.
gameRouter.delete('/session/:id/participant', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = authedUserId(req);
    await client.query('BEGIN');
    // Confirm session exists + caller is a participant (not host).
    const {
      rows: [row],
    } = await client.query<SessionRow>('SELECT * FROM game_sessions WHERE id = $1 LIMIT 1', [
      req.params.id,
    ]);
    if (!row) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (row.user_id === userId) {
      await client.query('ROLLBACK');
      res.status(400).json({
        error:
          'The host cannot leave their own session — delete the session instead, or transfer ownership first (not yet implemented).',
      });
      return;
    }
    const { rowCount: participantRows } = await client.query(
      'SELECT 1 FROM session_participants WHERE session_id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (!participantRows) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Not a participant of this session.' });
      return;
    }
    // Reassign any PCs the leaver owned to the host so turn enforcement
    // never sees an orphan owner. Solo invariant restored: every PC ends
    // up owned by the host after every leave.
    const state = backfillOwnership(normalizeState(row.state), row.user_id);
    let mutated = false;
    const characters = state.characters.map((c) => {
      if (c.owner_user_id === userId) {
        mutated = true;
        return { ...c, owner_user_id: row.user_id };
      }
      return c;
    });
    if (mutated) {
      const newState = { ...state, characters };
      await client.query('UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(newState),
        req.params.id,
      ]);
    }
    await client.query('DELETE FROM session_participants WHERE session_id = $1 AND user_id = $2', [
      req.params.id,
      userId,
    ]);
    await client.query('COMMIT');

    // Broadcast to anyone still in the room: PCs may have changed
    // owners, and the participants list shrunk.
    if (mutated) {
      const refreshedState = { ...state, characters };
      broadcastSessionState(row.id, { state: refreshedState });
    }
    broadcastParticipantChange(row.id, 'left', { user_id: userId });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// Multiplayer — accept an invite token and become a participant of the
// session it identifies. The token-to-session lookup is the only way
// for a non-host to surface a session id (game_sessions.invite_token
// is indexed for this). Idempotent — re-joining is a no-op via
// ON CONFLICT.
gameRouter.post('/session/join', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, JoinSessionSchema);
  if (!parsed) return;
  const { invite_token } = parsed;
  try {
    const userId = authedUserId(req);
    const { rows } = await pool.query(
      'SELECT id, user_id FROM game_sessions WHERE invite_token = $1 LIMIT 1',
      [invite_token]
    );
    const session = rows[0];
    if (!session) {
      res.status(404).json({ error: 'Invite link is invalid or expired.' });
      return;
    }
    await pool.query(
      `INSERT INTO session_participants (session_id, user_id, role)
       VALUES ($1, $2, 'pc')
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [session.id, userId]
    );
    // Notify the room so the host's participants modal updates without
    // a refetch. The joining socket may not be subscribed to the room
    // yet (FE follows up with a socket.emit('join-session', ...) after
    // a successful POST), so they'll get state via the join handshake.
    broadcastParticipantChange(session.id, 'joined', { user_id: userId });
    res.json({ ok: true, session_id: session.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

gameRouter.post('/session/:id/action', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, ActionSchema);
  if (!parsed) return;
  const action = parsed.action as StructuredAction;
  const history = parsed.history;
  const clientTurnSeq = parsed.turn_seq;
  try {
    const userId = authedUserId(req);
    const row = await fetchSessionForParticipant(req.params.id, userId);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (row.status === 'dead') {
      res.status(410).json({ error: 'Hero deceased.' });
      return;
    }
    if (row.status === 'escaped') {
      res.status(410).json({ error: 'Adventure already complete.' });
      return;
    }

    // Race detection. If the client sent a turn_seq with the request,
    // it must match the current server value. Mismatch = the client's
    // state is stale (another participant got there first). Reject
    // with 409 so the client can show "out of sync, refresh." When
    // the client doesn't send turn_seq, skip the check — keeps solo
    // and stale FE caches working without changes.
    if (typeof clientTurnSeq === 'number' && clientTurnSeq !== row.turn_seq) {
      res.status(409).json({
        error: 'Out of sync — another player acted first. The screen will refresh.',
        turn_seq: row.turn_seq,
      });
      return;
    }

    const ctx = CONTEXTS[row.seed.context_id ?? ''] ?? defaultContext();
    let state = backfillOwnership(normalizeState(row.state), row.user_id);

    // Turn enforcement. Two cases:
    //   (a) A reaction window is open — the requester must own one of
    //       the eligible PCs (Shield, Counterspell, Hellish Rebuke).
    //   (b) Normal flow — the requester must own the active character.
    // In solo mode every PC is owned by the host so this never rejects.
    const pending = state.pending_reaction;
    if (pending && pending.eligibleCharIds.length > 0) {
      const ownsEligible = pending.eligibleCharIds.some((cid) => {
        const c = state.characters.find((ch) => ch.id === cid);
        return c?.owner_user_id === userId;
      });
      if (!ownsEligible) {
        res.status(403).json({
          error: 'Reaction window is open — wait for another player to resolve it.',
        });
        return;
      }
    } else {
      const active = state.characters.find((c) => c.id === state.active_character_id);
      if (active && active.owner_user_id && active.owner_user_id !== userId) {
        res.status(403).json({
          error: `Not your turn — ${active.name} is acting.`,
        });
        return;
      }
    }

    // For campaign sessions, load and merge persisted campaign state
    let campaignState = null;
    if (ctx.campaign) {
      campaignState = await loadCampaignState(pool, authedUserId(req), ctx.id);
      state = mergeCampaignIntoGameState(state, campaignState);
    }

    // Snapshot the seed BEFORE takeAction — most actions leave it untouched, but
    // some mutate it in place (marker_move materializes a rolled encounter enemy
    // into seed.enemies). takeAction mutates `row.seed` by reference, so we
    // capture its JSON now to detect a real change afterwards and skip rewriting
    // the (potentially large, multi-region) seed blob on the common no-change path.
    const seedBefore = JSON.stringify(row.seed);

    const result = await takeAction({
      action,
      history: history ?? [],
      state,
      seed: row.seed,
      context: ctx,
    });

    // For campaign sessions, evaluate quest steps and save campaign state
    if (ctx.campaign && campaignState) {
      const activeChar =
        result.newState.characters.find((c) => c.id === result.newState.active_character_id) ??
        result.newState.characters[0];
      const facts: CampaignFacts = {
        action: action.type,
        room_id: result.newState.current_room,
        current_town_id: result.newState.current_town_id ?? '',
        // Retired with the Location model — quest conditions key on room_id now.
        location_id: '',
        enemies_killed: result.newState.enemies_killed,
        loot_taken: result.newState.loot_taken,
        visited_rooms: result.newState.visited_rooms ?? [],
        flags: result.newState.flags,
        campaign_flags: result.newState.campaign_flags ?? {},
        quest_progress: result.newState.quest_progress ?? [],
        faction_rep: result.newState.faction_rep ?? {},
        world_minute: result.newState.world_minute ?? 0,
        // Derived day, kept as a fact so quests can key on it directly.
        world_day: formatGameClock(result.newState.world_minute ?? 0).day,
        active_level: activeChar?.level ?? 1,
        active_class: activeChar?.character_class ?? '',
      };
      const completions = await evaluateQuestSteps(campaignState, ctx.campaign.quests ?? [], facts);
      if (completions.length) {
        const {
          cs: updatedCs,
          completedQuestIds,
          newlyActivatedQuestIds,
        } = applyQuestCompletions(campaignState, ctx.campaign.quests ?? [], completions);
        campaignState = updatedCs;
        // Reflect completed quests back into the result state
        result.newState = {
          ...result.newState,
          quest_progress: updatedCs.quests,
          faction_rep: updatedCs.faction_rep,
        };
        // Surface newly-activated quests so the player sees they signed
        // up for something — the explicit "Accept quest" choice is gone,
        // so without this the quest would silently appear in the log.
        // Skip quests that activated and finished in the same evaluation
        // (a single-step "non-NPC trigger" quest hitting all its steps
        // at once); the completion line already tells the player about it.
        const completedSet = new Set(completedQuestIds);
        const activationLines: string[] = [];
        for (const qid of newlyActivatedQuestIds) {
          if (completedSet.has(qid)) continue;
          const def = ctx.campaign.quests?.find((q) => q.id === qid);
          if (!def) continue;
          activationLines.push(`\n\n✦ Quest accepted — ${def.title}. ${def.desc}`);
        }
        if (activationLines.length) {
          const tail = activationLines.join(' ');
          result.narrative = (result.narrative ?? '') + tail;
          const roomLog = result.newState.room_log ?? [];
          if (roomLog.length) {
            roomLog[roomLog.length - 1] = roomLog[roomLog.length - 1] + tail;
          }
          const runLog = result.newState.run_log ?? [];
          if (runLog.length) {
            runLog[runLog.length - 1] = {
              ...runLog[runLog.length - 1],
              narrative: runLog[runLog.length - 1].narrative + tail,
            };
          }
          result.newState = { ...result.newState, room_log: roomLog, run_log: runLog };
        }
        // Apply each completed quest's `rewards` array through the
        // standard consequence pipeline. Without this, the only
        // completion-time effect was applyQuestCompletions's repGain;
        // the actual rewards (give_gold, consume_item, add_narrative,
        // etc.) authored on the quest never fired. The user's Vale
        // playthrough saw the quest mark as complete with no gold,
        // no consumed ledger, and a bare "[Quest completed: ...]" tail.
        const rewardNarrativeParts: string[] = [];
        for (const qid of completedQuestIds) {
          const def = ctx.campaign.quests?.find((q) => q.id === qid);
          if (!def?.rewards?.length) continue;
          const activeCharId =
            result.newState.characters.find((c) => c.id === result.newState.active_character_id)
              ?.id ?? result.newState.characters[0]?.id;
          if (!activeCharId) continue;
          // Header line per quest so reward bullets attach clearly
          rewardNarrativeParts.push(`\n\n✦ Quest complete — ${def.title}.`);
          for (const reward of def.rewards) {
            result.newState = applyConsequence(
              reward,
              result.newState,
              row.seed,
              activeCharId,
              rewardNarrativeParts,
              ctx
            );
          }
          // applyQuestCompletions already bumped faction_rep by def.repGain
          // — surface that as a narrative line so the player sees the
          // standing change without adding it twice through a reward.
          if (def.factionId && def.repGain) {
            const sign = def.repGain >= 0 ? '+' : '';
            rewardNarrativeParts.push(`${sign}${def.repGain} reputation with ${def.factionId}.`);
          }
        }
        if (completedQuestIds.length) {
          const completionTail = rewardNarrativeParts.join(' ');
          result.narrative = (result.narrative ?? '') + completionTail;
          // Mirror the tail into room_log (drives the in-game narrative
          // panel) and run_log (drives the audit/adventure-log export) so
          // the player sees the quest completion line where it happened,
          // not just in result.narrative which the panel doesn't read.
          const roomLog = result.newState.room_log ?? [];
          if (roomLog.length) {
            roomLog[roomLog.length - 1] = roomLog[roomLog.length - 1] + completionTail;
          }
          const runLog = result.newState.run_log ?? [];
          if (runLog.length) {
            runLog[runLog.length - 1] = {
              ...runLog[runLog.length - 1],
              narrative: runLog[runLog.length - 1].narrative + completionTail,
            };
          }
          result.newState = { ...result.newState, room_log: roomLog, run_log: runLog };
        }
      }
      const updatedCs = extractCampaignDelta(campaignState, result.newState);
      await saveCampaignState(pool, updatedCs);
    }

    const newStatus = result.dead ? 'dead' : result.escaped ? 'escaped' : row.status;
    const nextTurnSeq = row.turn_seq + 1;
    // Persist the seed only when it actually changed (see seedBefore above) —
    // the seed holds the campaign content + maps and is large; rewriting it
    // every turn is wasteful since it mutates rarely. The state always changes,
    // so it's always written.
    const seedAfter = JSON.stringify(result.seed);
    if (seedAfter !== seedBefore) {
      await pool.query(
        'UPDATE game_sessions SET state = $1, seed = $2, status = $3, turn_seq = $4, updated_at = NOW() WHERE id = $5',
        [JSON.stringify(result.newState), seedAfter, newStatus, nextTurnSeq, row.id]
      );
    } else {
      await pool.query(
        'UPDATE game_sessions SET state = $1, status = $2, turn_seq = $3, updated_at = NOW() WHERE id = $4',
        [JSON.stringify(result.newState), newStatus, nextTurnSeq, row.id]
      );
    }

    // Broadcast the new state + turn_seq to every socket joined to this
    // session's room. The acting participant gets it back via the REST
    // response too — that's intentional; the FE applies whichever
    // arrives first and discards the rest by identity. Other
    // participants only see the broadcast.
    broadcastSessionState(row.id, {
      state: result.newState,
      narrative: result.narrative,
      turn_seq: nextTurnSeq,
    });

    res.json({ ...result, turn_seq: nextTurnSeq });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
