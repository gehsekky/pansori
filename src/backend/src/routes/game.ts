import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import { generateSeed } from '../services/procgen.js';
import { takeAction, generateChoices, buildArrivalNarrative, normalizeState } from '../services/gameEngine.js';
import { FRESH_TURN, canEquipWeapon, canDonArmor, canDonShield, computeAcAfterArmorChange } from '../services/rulesEngine.js';
import { loadContexts } from '../services/contextLoader.js';
import type { GameState, Character, Context, StructuredAction } from '../types.js';

// Contexts are loaded once at startup by scanning the contexts/ directory.
// Adding a new campaign only requires dropping a .ts file there.
const CONTEXTS: Record<string, Context> = await loadContexts();
const DEFAULT_CONTEXT = Object.values(CONTEXTS)[0] ?? ({ id: 'none' } as Context);

export const gameRouter = Router();

// List all available game contexts (id + display metadata only — no rules/loot)
gameRouter.get('/contexts', (_req, res) => {
  const list = Object.values(CONTEXTS).map(c => ({
    id:          c.id,
    displayName: c.worldNoun,
    mapType:     c.mapType,
    classes:     Object.keys(c.classPrimaryStats),
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
    if (!rows[0]) { res.status(404).json({ error: 'Session not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List all sessions for the current user
gameRouter.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, character_name, character_class, status, portrait_url,
              seed->>'context_id' AS context_id,
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
    if (!rowCount) { res.status(404).json({ error: 'Session not found' }); return; }
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
  const { characters, context_id } = req.body as {
    characters?: Array<{
      name: string;
      character_class: string;
      stats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
      portrait_url?: string;
    }>;
    context_id?: string;
  };

  if (!characters?.length) {
    res.status(400).json({ error: 'Missing characters' });
    return;
  }

  const ctx  = CONTEXTS[context_id ?? ''] ?? DEFAULT_CONTEXT;
  const seed = generateSeed(ctx, characters.length);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const partyChars: Character[] = characters.map(c => {
      const base = c.stats
        ? { str: c.stats.str, dex: c.stats.dex, con: c.stats.con, int: c.stats.int, wis: c.stats.wis, cha: c.stats.cha }
        : { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      return {
        id:              randomUUID(),
        name:            c.name,
        character_class: c.character_class,
        portrait_url:    c.portrait_url ?? null,
        hp: 20, max_hp: 20, ac: 10,
        ...base,
        xp: 0, level: 1, gold: 5,
        inventory: (ctx.campaign?.startingLoot ?? []).map(id => {
          const item = ctx.lootTable.find(l => l.id === id);
          return item ? { ...item, instance_id: randomUUID() } : null;
        }).filter((i): i is NonNullable<typeof i> => i !== null),
        equipped_weapon: null,
        equipped_armor:  null,
        equipped_shield: null,
        conditions:          [],
        condition_durations: {},
        death_saves:         { successes: 0, failures: 0 },
        stable:              false,
        dead:                false,
        turn_actions:        { ...FRESH_TURN },
        initiative_roll:     null,
        hit_die:             ctx.classHitDie[c.character_class] ?? 8,
        hit_dice_remaining:  1,
        class_resource_uses: {},
        asi_pending:         false,
        exhaustion_level:    0,
        spell_slots_max:     ctx.classSpellSlots?.[c.character_class]?.[0] ?? {},
        spell_slots_used:    {},
        spells_known:        ctx.classSpells?.[c.character_class] ?? [],
      };
    });

    const leader = partyChars[0];
    const initialState: GameState = {
      characters:          partyChars,
      active_character_id: leader.id,
      current_room:        ctx.startRoomId,
      visited_rooms:       [ctx.startRoomId],
      enemies_killed:      [],
      loot_taken:          [],
      enemy_hp:            {},
      combat_active:       false,
      initiative_order:    [],
      initiative_idx:      0,
      run_log:             [],
      room_log:            [],
      last_choices:        [],
      short_rested_rooms:  [],
      long_rested:         false,
      flags:               {},
    };

    const startNarrative = seed.intro + ' ' + buildArrivalNarrative(ctx.startRoomId, initialState, seed, ctx);
    initialState.run_log      = [{ character_id: leader.id, action: 'start', narrative: startNarrative }];
    initialState.room_log     = [startNarrative];
    initialState.last_choices = generateChoices(initialState, seed, ctx);

    const { rows: [session] } = await client.query(
      `INSERT INTO game_sessions (user_id, character_name, character_class, seed, state, portrait_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.user!.id,
        leader.name,
        leader.character_class,
        JSON.stringify(seed),
        JSON.stringify(initialState),
        leader.portrait_url ?? null,
      ]
    );
    await client.query('COMMIT');
    res.json({ session, state: initialState, seed });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// Equip or unequip an item — enforces 5e equipment rules for the specified character
gameRouter.post('/session/:id/equip', async (req: Request, res: Response) => {
  const { item_id, character_id } = req.body as { item_id?: string; character_id?: string };
  try {
    const { rows: [row] } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (!row) { res.status(404).json({ error: 'Session not found' }); return; }

    const ctx   = CONTEXTS[row.seed.context_id] ?? DEFAULT_CONTEXT;
    const state = normalizeState(row.state, { character_name: row.character_name, portrait_url: row.portrait_url });

    // Resolve target character
    const targetId   = character_id ?? state.active_character_id;
    const charIdx    = state.characters.findIndex(c => c.id === targetId);
    if (charIdx < 0) { res.status(400).json({ error: 'Character not found in session' }); return; }

    let char         = { ...state.characters[charIdx] };
    const combatActive = state.combat_active ?? false;
    const turnActions  = char.turn_actions  ?? { ...FRESH_TURN };

    const inventoryItem = char.inventory.find(i => i.instance_id === item_id);
    const loot          = inventoryItem ? ctx.lootTable.find(l => l.id === inventoryItem.id) : undefined;
    if (!loot || !inventoryItem) { res.status(400).json({ error: 'Unknown item' }); return; }
    const iid           = item_id!;
    const resolveTypeId = (instanceId: string | null) =>
      char.inventory.find(i => i.instance_id === instanceId)?.id ?? null;

    if (loot.slot === 'shield') {
      const check = canDonShield(combatActive);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
      const toggling = char.equipped_shield === iid;
      char.ac              = computeAcAfterArmorChange(char.ac, toggling ? loot.id : resolveTypeId(char.equipped_shield), toggling ? null : loot.id, ctx.lootTable);
      char.equipped_shield = toggling ? null : iid;
    } else if (loot.slot === 'armor') {
      const toggling = char.equipped_armor === iid;
      const check    = canDonArmor(combatActive, loot.id);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
      char.ac            = computeAcAfterArmorChange(char.ac, toggling ? loot.id : resolveTypeId(char.equipped_armor), toggling ? null : loot.id, ctx.lootTable);
      char.equipped_armor = toggling ? null : iid;
    } else if (loot.damage) {
      const toggling = char.equipped_weapon === iid;
      const check    = canEquipWeapon(combatActive, turnActions);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
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
      characters: state.characters.map((c, i) => i === charIdx ? char : c),
    };

    await pool.query(
      'UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newState), row.id]
    );
    res.json({ newState });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Take a game action
gameRouter.post('/session/:id/action', async (req: Request, res: Response) => {
  const { action, history } = req.body as { action?: StructuredAction; history?: unknown[] };
  if (!action?.type) { res.status(400).json({ error: 'Missing action' }); return; }
  try {
    const { rows: [row] } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (!row) { res.status(404).json({ error: 'Session not found' }); return; }
    if (row.status === 'dead')    { res.status(410).json({ error: 'Hero deceased.' }); return; }
    if (row.status === 'escaped') { res.status(410).json({ error: 'Mission already complete.' }); return; }

    const ctx    = CONTEXTS[row.seed.context_id] ?? DEFAULT_CONTEXT;
    const state  = normalizeState(row.state, { character_name: row.character_name, portrait_url: row.portrait_url });
    const result = await takeAction({
      action, history: history ?? [], state, seed: row.seed, context: ctx
    });

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
