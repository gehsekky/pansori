import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import { generateSeed } from '../services/procgen.js';
import { takeAction, generateChoices, buildArrivalNarrative } from '../services/gameEngine.js';
import { FRESH_TURN, canEquipWeapon, canDonArmor, canDonShield, computeAcAfterArmorChange } from '../services/rulesEngine.js';
import { context as scifiContext }   from '../contexts/scifi-terror.js';
import { context as dungeonContext } from '../contexts/dungeon-crawler.js';
import { context as zombieContext }  from '../contexts/high-school-zombie.js';
import { context as sunkenContext }  from '../contexts/sunken-below.js';
import type { GameState, Context, StructuredAction } from '../types.js';

const CONTEXTS: Record<string, Context> = {
  'scifi-terror':       scifiContext,
  'dungeon-crawler':    dungeonContext,
  'high-school-zombie': zombieContext,
  'sunken-below':       sunkenContext,
};

export const gameRouter = Router();

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

// Start a new roguelike run
gameRouter.post('/session/new', async (req: Request, res: Response) => {
  const { character_name, character_class, context_id, stats, portrait_url } = req.body as {
    character_name?: string;
    character_class?: string;
    context_id?: string;
    portrait_url?: string;
    stats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  };
  if (!character_name || !character_class) {
    res.status(400).json({ error: 'Missing character info' });
    return;
  }

  const ctx  = CONTEXTS[context_id ?? ''] ?? scifiContext;
  const seed = generateSeed(ctx);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const baseStats = stats
      ? { str: stats.str, dex: stats.dex, con: stats.con, int: stats.int, wis: stats.wis, cha: stats.cha }
      : { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const initialState: GameState = {
      hp: 20, max_hp: 20, ac: 10,
      ...baseStats,
      gold: 5, xp: 0, level: 1,
      character_class,
      inventory: (ctx.campaign?.startingLoot ?? []).map(id => {
        const item = ctx.lootTable.find(l => l.id === id);
        return item ? { ...item, instance_id: randomUUID() } : null;
      }).filter((i): i is NonNullable<typeof i> => i !== null),
      equipped_weapon: null,
      equipped_armor:  null,
      equipped_shield: null,
      current_room:    ctx.startRoomId,
      visited_rooms:   [ctx.startRoomId],
      enemies_killed:  [],
      loot_taken:      [],
      enemy_hp:        {},
      run_log:         [],
      room_log:        [],
      conditions:      [],
      flags:           {},
      combat_active:   false,
      initiative:      null,
      player_first:    true,
      turn_actions:    { ...FRESH_TURN },
      death_saves:     { successes: 0, failures: 0 },
      stable:          false,
      dead:            false,
    };
    const startNarrative = seed.intro + ' ' + buildArrivalNarrative(ctx.startRoomId, initialState, seed, ctx);
    initialState.run_log      = [{ action: 'start', narrative: startNarrative }];
    initialState.room_log     = [startNarrative];
    initialState.last_choices = generateChoices(initialState, seed, ctx);
    const { rows: [session] } = await client.query(
      `INSERT INTO game_sessions (user_id, character_name, character_class, seed, state, portrait_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user!.id, character_name, character_class, JSON.stringify(seed), JSON.stringify(initialState), portrait_url ?? null]
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

// Equip or unequip an item (deterministic — enforces 5e equipment rules)
gameRouter.post('/session/:id/equip', async (req: Request, res: Response) => {
  const { item_id } = req.body as { item_id?: string };
  try {
    const { rows: [row] } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (!row) { res.status(404).json({ error: 'Session not found' }); return; }

    const ctx          = CONTEXTS[row.seed.context_id] ?? scifiContext;
    const state        = { ...row.state } as GameState;
    const combatActive = state.combat_active ?? false;
    const turnActions  = state.turn_actions  ?? { ...FRESH_TURN };

    // item_id is now an instance_id — resolve type_id for loot table lookup
    const inventoryItem = state.inventory.find(i => i.instance_id === item_id);
    const loot          = inventoryItem ? ctx.lootTable.find(l => l.id === inventoryItem.id) : undefined;
    if (!loot || !inventoryItem) { res.status(400).json({ error: 'Unknown item' }); return; }
    const iid          = item_id!;
    const resolveTypeId = (instanceId: string | null) =>
      state.inventory.find(i => i.instance_id === instanceId)?.id ?? null;

    if (loot.slot === 'shield') {
      const check = canDonShield(combatActive);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
      const toggling = state.equipped_shield === iid;
      state.ac              = computeAcAfterArmorChange(state.ac, toggling ? loot.id : resolveTypeId(state.equipped_shield), toggling ? null : loot.id, ctx.lootTable);
      state.equipped_shield = toggling ? null : iid;
    } else if (loot.slot === 'armor') {
      const toggling = state.equipped_armor === iid;
      const check    = canDonArmor(combatActive, loot.id);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
      state.ac             = computeAcAfterArmorChange(state.ac, toggling ? loot.id : resolveTypeId(state.equipped_armor), toggling ? null : loot.id, ctx.lootTable);
      state.equipped_armor = toggling ? null : iid;
    } else if (loot.damage) {
      const toggling = state.equipped_weapon === iid;
      const check    = canEquipWeapon(combatActive, turnActions);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
      state.equipped_weapon = toggling ? null : iid;
      if ('cost' in check && check.cost === 'free_interaction') {
        state.turn_actions = { ...turnActions, free_interaction_used: true };
      }
    } else {
      res.status(400).json({ error: 'Item is not equippable' });
      return;
    }

    await pool.query(
      'UPDATE game_sessions SET state = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(state), row.id]
    );
    res.json({ newState: state });
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

    const ctx    = CONTEXTS[row.seed.context_id] ?? scifiContext;
    const result = await takeAction({
      action, history: history ?? [], state: row.state, seed: row.seed, context: ctx
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
