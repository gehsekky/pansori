import {
  ActionSchema,
  DropSchema,
  EquipSchema,
  NewSessionSchema,
  TransferSchema,
  parseBody,
} from './schemas.js';
import type { CampaignFacts, Character, Context, GameState, StructuredAction } from '../types.js';
import {
  FRESH_TURN,
  canDonArmor,
  canDonShield,
  canEquipWeapon,
  computeTotalAc,
} from '../services/rulesEngine.js';
import { Request, Response, Router } from 'express';
import { SRD_SPECIES, SRD_WEAPON_MASTERY_SLOTS } from '../contexts/srd/index.js';
import {
  applyQuestCompletions,
  evaluateQuestSteps,
  extractCampaignDelta,
  loadCampaignState,
  mergeCampaignIntoGameState,
  saveCampaignState,
} from '../services/campaignEngine.js';
import {
  buildArrivalNarrative,
  generateChoices,
  normalizeState,
  takeAction,
} from '../services/gameEngine.js';
import { generateSeed } from '../services/procgen.js';
import { loadContexts } from '../services/contextLoader.js';
import { pool } from '../db/pool.js';
import { randomUUID } from 'crypto';

// Contexts are loaded once at startup by scanning the contexts/ directory.
// Adding a new campaign only requires dropping a .ts file there.
const CONTEXTS: Record<string, Context> = await loadContexts();
const DEFAULT_CONTEXT = Object.values(CONTEXTS)[0] ?? ({ id: 'none' } as Context);

// 2024 PHB — initial weapon masteries by class. Each listed class starts
// with these weapons mastered; non-listed classes don't get the feature.
// Picks follow common 2024 PHB starting-class examples; the count is
// clamped to SRD_WEAPON_MASTERY_SLOTS (Fighter 3 / Barb-Pal-Rang 2 / Rog 1)
// so we never give a class more masteries than RAW allows.
function defaultWeaponMasteriesFor(charClass: string): string[] {
  const map: Record<string, string[]> = {
    Fighter: ['longsword', 'shortbow', 'greataxe'],
    Paladin: ['longsword', 'warhammer'],
    Ranger: ['longbow', 'shortsword'],
    Barbarian: ['greataxe', 'handaxe'],
    Rogue: ['shortsword'],
  };
  const picks = map[charClass] ?? [];
  const cap = SRD_WEAPON_MASTERY_SLOTS[charClass] ?? 0;
  return picks.slice(0, cap);
}

export const gameRouter = Router();

// List all available game contexts (id + display metadata only — no rules/loot)
gameRouter.get('/contexts', (_req, res) => {
  const list = Object.values(CONTEXTS).map((c) => ({
    id: c.id,
    displayName: c.worldNoun,
    mapType: c.mapType,
    classes: Object.keys(c.classPrimaryStats),
    backgrounds: (c.backgrounds ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      desc: b.desc,
      skillProficiencies: b.skillProficiencies,
      toolProficiency: b.toolProficiency ?? null,
      feature: b.feature,
      featureDesc: b.featureDesc,
    })),
  }));
  res.json(list);
});

// Get a specific session by ID (must belong to the requesting user)
gameRouter.get('/session/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const row = rows[0];
    const ctxId: string | undefined = row.seed?.context_id;
    const ctx = ctxId ? CONTEXTS[ctxId] : undefined;
    res.json({ ...row, campaignMeta: campaignMetaFor(ctx) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List all sessions for the current user. Leader display info + party size
// are derived from the JSONB state at read time — no denormalized columns.
gameRouter.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,
              status,
              seed->>'context_id' AS context_id,
              state->'characters'->0->>'name' AS character_name,
              state->'characters'->0->>'character_class' AS character_class,
              state->'characters'->0->>'portrait_url' AS portrait_url,
              jsonb_array_length(COALESCE(state->'characters', '[]'::jsonb)) AS party_size,
              created_at, updated_at
       FROM game_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user!.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete a single session (must belong to the requesting user)
gameRouter.delete('/session/:id', async (req: Request, res: Response) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
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
      [req.user!.id]
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

  const ctx = CONTEXTS[context_id ?? ''] ?? DEFAULT_CONTEXT;
  const seed = generateSeed(ctx, characters.length);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const partyChars: Character[] = characters.map((c, _charIdx) => {
      const base = c.stats
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
      const classSkills = ctx.classSkills?.[c.character_class] ?? [];
      const skillProfs = Array.from(new Set([...classSkills, ...(bg?.skillProficiencies ?? [])]));
      const toolProfs = bg?.toolProficiency ? [bg.toolProficiency] : [];
      const armorProfs = ctx.classArmorProficiencies?.[c.character_class] ?? [];
      const weaponProfs = ctx.classWeaponProficiencies?.[c.character_class] ?? [];

      // 2024 PHB species traits — speed, darkvision, resistances, innate
      // cantrips. Defaults to Human when missing/unknown.
      const speciesId = c.species && SRD_SPECIES[c.species] ? c.species : 'human';
      const speciesData = SRD_SPECIES[speciesId];
      const dwarfHpBonus = speciesId === 'dwarf' ? 1 : 0;

      const hitDie = ctx.classHitDie[c.character_class] ?? 8;
      const conMod = Math.floor(((base.con ?? 10) - 10) / 2);
      // PHB: max hit die + CON mod at level 1. Sorcerer Draconic Bloodline
      // adds +1 HP per Sorcerer level (here, +1 at L1) via Draconic Resilience.
      // Dwarven Toughness adds +1 max HP per level.
      const draconicBonus = c.character_class === 'Sorcerer' && c.subclass === 'draconic' ? 1 : 0;
      const maxHp = Math.max(1, hitDie + conMod + draconicBonus + dwarfHpBonus);

      // Build starting inventory from classStartingLoot or campaign.startingLoot
      const startingIds =
        ctx.classStartingLoot?.[c.character_class] ?? ctx.campaign?.startingLoot ?? [];
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

      const equippedWeapon = firstWeapon?.instance_id ?? null;
      const equippedArmor = firstArmor?.instance_id ?? null;
      const equippedShield = firstShield?.instance_id ?? null;

      const initialAc = computeTotalAc(
        base.dex ?? 10,
        equippedArmor,
        equippedShield,
        startingInventory,
        ctx.lootTable
      );

      return {
        id: randomUUID(),
        name: c.name,
        character_class: c.character_class,
        portrait_url: c.portrait_url ?? null,
        hp: maxHp,
        max_hp: maxHp,
        ac: initialAc,
        ...base,
        xp: 0,
        level: 1,
        gold: 5,
        inventory: startingInventory,
        equipped_weapon: equippedWeapon,
        equipped_armor: equippedArmor,
        equipped_shield: equippedShield,
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
        spell_slots_max: ctx.classSpellSlots?.[c.character_class]?.[0] ?? {},
        spell_slots_used: {},
        spells_known: ctx.classSpells?.[c.character_class] ?? [],
        armor_proficiencies: armorProfs,
        weapon_proficiencies: weaponProfs,
        // 2024 PHB Weapon Mastery — classes that get the feature start with
        // an initial mastered weapon list. Other classes get 0.
        weapon_masteries: defaultWeaponMasteriesFor(c.character_class),
        attuned_items: [],
        // PHB: Cleric/Sorcerer/Warlock pick subclass at L1 (creation).
        // Other classes pick later via the in-game select_subclass choice.
        subclass: c.subclass,
        // 2024 PHB species — seed mechanical traits from the catalog.
        species: speciesId,
        speed: speciesData.speedFt,
        darkvision_ft: speciesData.darkvisionFt,
        // Species innate cantrips merged into spells_known so the engine
        // surfaces them without slot cost.
        ...(speciesData.innateCantrips && speciesData.innateCantrips.length > 0
          ? {
              spells_known: [
                ...(ctx.classSpells?.[c.character_class] ?? []),
                ...speciesData.innateCantrips,
              ],
            }
          : {}),
      };
    });

    const leader = partyChars[0];
    const initialState: GameState = {
      characters: partyChars,
      active_character_id: leader.id,
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      flags: {},
      npc_attitudes: {},
      npc_talked: [],
    };

    const startNarrative =
      seed.intro + ' ' + buildArrivalNarrative(ctx.startRoomId, initialState, seed, ctx);
    initialState.run_log = [
      { character_id: leader.id, action: 'start', narrative: startNarrative },
    ];
    initialState.room_log = [startNarrative];
    initialState.last_choices = generateChoices(initialState, seed, ctx);

    const {
      rows: [session],
    } = await client.query(
      `INSERT INTO game_sessions (user_id, seed, state)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user!.id, JSON.stringify(seed), JSON.stringify(initialState)]
    );
    await client.query('COMMIT');
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
    locations: cmp.locations ?? [],
  };
}

// Equip or unequip an item — enforces 5e equipment rules for the specified character
gameRouter.post('/session/:id/equip', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, EquipSchema);
  if (!parsed) return;
  const { item_id, character_id } = parsed;
  try {
    const {
      rows: [row],
    } = await pool.query('SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user!.id,
    ]);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const ctx = CONTEXTS[row.seed.context_id] ?? DEFAULT_CONTEXT;
    const state = normalizeState(row.state);

    // Resolve target character
    const targetId = character_id ?? state.active_character_id;
    const charIdx = state.characters.findIndex((c) => c.id === targetId);
    if (charIdx < 0) {
      res.status(400).json({ error: 'Character not found in session' });
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
      const toggling = char.equipped_shield === iid;
      char.equipped_shield = toggling ? null : iid;
      char.ac = computeTotalAc(
        char.dex,
        char.equipped_armor,
        char.equipped_shield,
        char.inventory,
        ctx.lootTable
      );
    } else if (loot.slot === 'armor') {
      const toggling = char.equipped_armor === iid;
      const check = canDonArmor(combatActive, loot.armorCategory ?? 'light');
      if (!check.allowed) {
        res.status(409).json({ error: check.reason });
        return;
      }
      char.equipped_armor = toggling ? null : iid;
      char.ac = computeTotalAc(
        char.dex,
        char.equipped_armor,
        char.equipped_shield,
        char.inventory,
        ctx.lootTable
      );
    } else if (loot.damage) {
      const toggling = char.equipped_weapon === iid;
      const check = canEquipWeapon(combatActive, turnActions);
      if (!check.allowed) {
        res.status(409).json({ error: check.reason });
        return;
      }
      char.equipped_weapon = toggling ? null : iid;
      if ('cost' in check && check.cost === 'free_interaction') {
        char.turn_actions = { ...turnActions, free_interaction_used: true };
      }
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

// Transfer an item from one party member to another. PHB p.190 lets you
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
    const {
      rows: [row],
    } = await pool.query('SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user!.id,
    ]);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const state = normalizeState(row.state);
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
    const item = fromChar.inventory.find((i) => i.instance_id === item_instance_id);
    if (!item) {
      res.status(400).json({ error: 'Item not found on source character' });
      return;
    }
    // Equipped items must be unequipped before transfer (5e: donning another
    // person's armor takes an hour; we approximate with a hard block).
    if (
      fromChar.equipped_weapon === item_instance_id ||
      fromChar.equipped_armor === item_instance_id ||
      fromChar.equipped_shield === item_instance_id
    ) {
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
    const {
      rows: [row],
    } = await pool.query('SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user!.id,
    ]);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const state = normalizeState(row.state);
    const charIdx = state.characters.findIndex((c) => c.id === character_id);
    if (charIdx < 0) {
      res.status(400).json({ error: 'Character not found in session' });
      return;
    }
    const char = state.characters[charIdx];
    if (!char.inventory.find((i) => i.instance_id === item_instance_id)) {
      res.status(400).json({ error: 'Item not found in character inventory' });
      return;
    }
    const newChar = {
      ...char,
      inventory: char.inventory.filter((i) => i.instance_id !== item_instance_id),
      equipped_weapon: char.equipped_weapon === item_instance_id ? null : char.equipped_weapon,
      equipped_armor: char.equipped_armor === item_instance_id ? null : char.equipped_armor,
      equipped_shield: char.equipped_shield === item_instance_id ? null : char.equipped_shield,
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
gameRouter.post('/session/:id/action', async (req: Request, res: Response) => {
  const parsed = parseBody(req, res, ActionSchema);
  if (!parsed) return;
  const action = parsed.action as StructuredAction;
  const history = parsed.history;
  try {
    const {
      rows: [row],
    } = await pool.query('SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user!.id,
    ]);
    if (!row) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (row.status === 'dead') {
      res.status(410).json({ error: 'Hero deceased.' });
      return;
    }
    if (row.status === 'escaped') {
      res.status(410).json({ error: 'Mission already complete.' });
      return;
    }

    const ctx = CONTEXTS[row.seed.context_id] ?? DEFAULT_CONTEXT;
    let state = normalizeState(row.state);

    // For campaign sessions, load and merge persisted campaign state
    let campaignState = null;
    if (ctx.mapType === 'campaign' && ctx.campaign) {
      campaignState = await loadCampaignState(pool, req.user!.id, ctx.id);
      state = mergeCampaignIntoGameState(state, campaignState);
    }

    const result = await takeAction({
      action,
      history: history ?? [],
      state,
      seed: row.seed,
      context: ctx,
    });

    // For campaign sessions, evaluate quest steps and save campaign state
    if (ctx.mapType === 'campaign' && ctx.campaign && campaignState) {
      const activeChar =
        result.newState.characters.find((c) => c.id === result.newState.active_character_id) ??
        result.newState.characters[0];
      const facts: CampaignFacts = {
        action: action.type,
        room_id: result.newState.current_room,
        location_id: result.newState.current_location_id ?? '',
        enemies_killed: result.newState.enemies_killed,
        loot_taken: result.newState.loot_taken,
        flags: result.newState.flags,
        campaign_flags: result.newState.campaign_flags ?? {},
        quest_progress: result.newState.quest_progress ?? [],
        faction_rep: result.newState.faction_rep ?? {},
        world_day: result.newState.world_day ?? 1,
        active_level: activeChar?.level ?? 1,
        active_class: activeChar?.character_class ?? '',
      };
      const completions = await evaluateQuestSteps(campaignState, ctx.campaign.quests ?? [], facts);
      if (completions.length) {
        const { cs: updatedCs, completedQuestIds } = applyQuestCompletions(
          campaignState,
          ctx.campaign.quests ?? [],
          completions
        );
        campaignState = updatedCs;
        // Reflect completed quests back into the result state
        result.newState = {
          ...result.newState,
          quest_progress: updatedCs.quests,
          faction_rep: updatedCs.faction_rep,
        };
        if (completedQuestIds.length) {
          result.narrative =
            (result.narrative ?? '') +
            ` [Quest${completedQuestIds.length > 1 ? 's' : ''} completed: ${completedQuestIds.join(', ')}]`;
        }
      }
      const updatedCs = extractCampaignDelta(campaignState, result.newState);
      await saveCampaignState(pool, updatedCs);
    }

    const newStatus = result.dead ? 'dead' : result.escaped ? 'escaped' : row.status;
    await pool.query(
      'UPDATE game_sessions SET state = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [JSON.stringify(result.newState), newStatus, row.id]
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
