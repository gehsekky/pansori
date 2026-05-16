import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { generateShipSeed } from '../services/procgen.js';
import { takeAction, generateChoices } from '../services/gameEngine.js';
import { FRESH_TURN, canEquipWeapon, canDonArmor, computeAcAfterArmorChange } from '../services/rulesEngine.js';
import { context as scifiContext }   from '../contexts/scifi-terror.js';
import { context as dungeonContext } from '../contexts/dungeon-crawler.js';
import type { GameState, Context } from '../types.js';

const CONTEXTS: Record<string, Context> = {
  'scifi-terror':    scifiContext,
  'dungeon-crawler': dungeonContext,
};

export const gameRouter = Router();

// Get a specific session by ID
gameRouter.get('/session/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1',
      [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Start a new roguelike run
gameRouter.post('/session/new', async (req: Request, res: Response) => {
  const { character_name, character_class, context_id } = req.body as {
    character_name?: string;
    character_class?: string;
    context_id?: string;
  };
  if (!character_name || !character_class) {
    res.status(400).json({ error: 'Missing character info' });
    return;
  }

  const ctx  = CONTEXTS[context_id ?? ''] ?? scifiContext;
  const seed = generateShipSeed(ctx);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const initialState: GameState = {
      hp: 20, max_hp: 20, ac: 10,
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      gold: 5, xp: 0, level: 1,
      character_class,
      inventory:       [],
      equipped_weapon: null,
      equipped_armor:  null,
      current_room:    ctx.startRoomId,
      visited_rooms:   [ctx.startRoomId],
      enemies_killed:  [],
      loot_taken:      [],
      enemy_hp:        {},
      run_log:         [],
      flags:           {},
      combat_active:   false,
      initiative:      null,
      player_first:    true,
      turn_actions:    { ...FRESH_TURN },
      death_saves:     { successes: 0, failures: 0 },
      stable:          false,
      dead:            false,
    };
    initialState.last_choices = generateChoices(initialState, seed, ctx);
    const { rows: [session] } = await client.query(
      `INSERT INTO game_sessions (character_name, character_class, seed, state)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [character_name, character_class, JSON.stringify(seed), JSON.stringify(initialState)]
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
      'SELECT * FROM game_sessions WHERE id = $1',
      [req.params.id]
    );
    if (!row) { res.status(404).json({ error: 'Session not found' }); return; }

    const ctx          = CONTEXTS[row.seed.context_id] ?? scifiContext;
    const state        = { ...row.state } as GameState;
    const combatActive = state.combat_active ?? false;
    const turnActions  = state.turn_actions  ?? { ...FRESH_TURN };
    const loot         = ctx.lootTable.find(l => l.id === item_id);
    if (!loot) { res.status(400).json({ error: 'Unknown item' }); return; }

    if (loot.ac_bonus) {
      if (state.equipped_armor === item_id) {
        const check = canDonArmor(combatActive, item_id!);
        if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
        state.ac             = computeAcAfterArmorChange(state.ac, item_id!, null, ctx.lootTable);
        state.equipped_armor = null;
      } else {
        const check = canDonArmor(combatActive, item_id!);
        if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
        state.ac             = computeAcAfterArmorChange(state.ac, state.equipped_armor, item_id!, ctx.lootTable);
        state.equipped_armor = item_id!;
      }
    } else if (loot.damage) {
      const toggling = state.equipped_weapon === item_id;
      const check    = canEquipWeapon(combatActive, turnActions);
      if (!check.allowed) { res.status(409).json({ error: check.reason }); return; }
      state.equipped_weapon = toggling ? null : item_id!;
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
  const { action, history } = req.body as { action?: string; history?: string[] };
  try {
    const { rows: [row] } = await pool.query(
      'SELECT * FROM game_sessions WHERE id = $1',
      [req.params.id]
    );
    if (!row) { res.status(404).json({ error: 'Session not found' }); return; }
    if (row.status === 'dead')    { res.status(410).json({ error: 'Hero deceased.' }); return; }
    if (row.status === 'escaped') { res.status(410).json({ error: 'Mission already complete.' }); return; }

    const ctx    = CONTEXTS[row.seed.context_id] ?? scifiContext;
    const result = await takeAction({
      action: action ?? '', history: history ?? [], state: row.state, seed: row.seed, context: ctx
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
