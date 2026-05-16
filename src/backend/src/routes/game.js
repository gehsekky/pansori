import { Router } from 'express';
import { pool } from '../db/pool.js';
import { generateShipSeed } from '../services/procgen.js';
import { takeAction, generateChoices } from '../services/gameEngine.js';
import { FRESH_TURN, canEquipWeapon, canDonArmor, computeAcAfterArmorChange } from '../services/rulesEngine.js';
import { context as scifiContext }   from '../contexts/scifi-terror.js';
import { context as dungeonContext } from '../contexts/dungeon-crawler.js';

const CONTEXTS = {
  'scifi-terror':    scifiContext,
  'dungeon-crawler': dungeonContext,
};

export const gameRouter = Router();

// Get a specific session by ID
gameRouter.get('/session/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, gs.state FROM game_sessions s
       JOIN game_state gs ON gs.session_id = s.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start a new roguelike run
gameRouter.post('/session/new', async (req, res) => {
  const { character_name, character_class, context_id } = req.body;
  if (!character_name || !character_class) return res.status(400).json({ error: 'Missing character info' });

  const ctx  = CONTEXTS[context_id] || scifiContext;
  const seed = generateShipSeed(ctx);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [session] } = await client.query(
      `INSERT INTO game_sessions (character_name, character_class, seed)
       VALUES ($1, $2, $3) RETURNING *`,
      [character_name, character_class, JSON.stringify(seed)]
    );
    const initialState = {
      // Core stats
      hp: 20, max_hp: 20, ac: 10,
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      gold: 5, xp: 0, level: 1,
      character_class: character_class,
      // Inventory & equipment
      inventory: [],
      equipped_weapon: null,
      equipped_armor:  null,
      // Exploration
      current_room:   ctx.startRoomId,
      visited_rooms:  [ctx.startRoomId],
      enemies_killed: [],
      loot_taken:     [],
      enemy_hp:       {},
      run_log:        [],
      // D&D 5e combat state
      combat_active: false,
      initiative:    null,
      player_first:  true,
      turn_actions:  { ...FRESH_TURN },
      // D&D 5e death saves
      death_saves: { successes: 0, failures: 0 },
      stable:      false,
      dead:        false,
    };
    initialState.last_choices = generateChoices(initialState, seed, ctx);
    await client.query(
      'INSERT INTO game_state (session_id, state) VALUES ($1, $2)',
      [session.id, JSON.stringify(initialState)]
    );
    await client.query('COMMIT');
    res.json({ session, state: initialState, seed });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Equip or unequip an item (deterministic — no LLM, enforces 5e equipment rules)
gameRouter.post('/session/:id/equip', async (req, res) => {
  const { item_id } = req.body;
  try {
    const { rows: [row] } = await pool.query(
      `SELECT s.*, gs.state FROM game_sessions s
       JOIN game_state gs ON gs.session_id = s.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Session not found' });

    const ctx          = CONTEXTS[row.seed.context_id] || scifiContext;
    const state        = { ...row.state };
    const combatActive = state.combat_active ?? false;
    const turnActions  = state.turn_actions  ?? { ...FRESH_TURN };
    const loot         = ctx.lootTable.find(l => l.id === item_id);
    if (!loot) return res.status(400).json({ error: 'Unknown item' });

    if (loot.ac_bonus) {
      // Armor — check 5e don/doff rules
      if (state.equipped_armor === item_id) {
        const check = canDonArmor(combatActive, item_id);
        if (!check.allowed) return res.status(409).json({ error: check.reason });
        state.ac             = computeAcAfterArmorChange(state.ac, item_id, null, ctx.lootTable);
        state.equipped_armor = null;
      } else {
        const check = canDonArmor(combatActive, item_id);
        if (!check.allowed) return res.status(409).json({ error: check.reason });
        state.ac             = computeAcAfterArmorChange(state.ac, state.equipped_armor, item_id, ctx.lootTable);
        state.equipped_armor = item_id;
      }
    } else if (loot.damage) {
      // Weapon — check free object interaction availability
      const toggling = state.equipped_weapon === item_id;
      const check    = canEquipWeapon(combatActive, turnActions);
      if (!check.allowed) return res.status(409).json({ error: check.reason });
      state.equipped_weapon = toggling ? null : item_id;
      if (check.cost === 'free_interaction') {
        state.turn_actions = { ...turnActions, free_interaction_used: true };
      }
    } else {
      return res.status(400).json({ error: 'Item is not equippable' });
    }

    await pool.query(
      'UPDATE game_state SET state = $1, updated_at = NOW() WHERE session_id = $2',
      [JSON.stringify(state), row.id]
    );
    res.json({ newState: state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Take a game action
gameRouter.post('/session/:id/action', async (req, res) => {
  const { action, history } = req.body;
  try {
    const { rows: [row] } = await pool.query(
      `SELECT s.*, gs.state FROM game_sessions s
       JOIN game_state gs ON gs.session_id = s.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Session not found' });
    if (row.status === 'dead')    return res.status(410).json({ error: 'Hero deceased.' });
    if (row.status === 'escaped') return res.status(410).json({ error: 'Mission already complete.' });

    const ctx    = CONTEXTS[row.seed.context_id] || scifiContext;
    const result = await takeAction({
      action, history, state: row.state, seed: row.seed, context: ctx
    });

    await pool.query(
      'UPDATE game_state SET state = $1, updated_at = NOW() WHERE session_id = $2',
      [JSON.stringify(result.newState), row.id]
    );

    if (result.dead) {
      await pool.query(`UPDATE game_sessions SET status = 'dead' WHERE id = $1`, [row.id]);
    }
    if (result.escaped) {
      await pool.query(`UPDATE game_sessions SET status = 'escaped' WHERE id = $1`, [row.id]);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
