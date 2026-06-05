// Post-combat "Continue" gate. endCombatState no longer snaps straight back to
// exploration — it sets combat_over_pending (when the party survived) so the FE
// shows a Continue prompt; generateChoices then offers ONLY Continue, and the
// `continue` action clears the flag to restore the normal choices.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endCombatState, generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Continue Gate Test',
  ship_name: 'Continue Gate Test',
  intro: '',
  seed_id: 'continue-gate',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

const inCombat = (over: Partial<GameState> = {}): GameState => ({
  ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
  characters: [makeChar({ id: 'pc-1', hp: 20, max_hp: 20 })],
  active_character_id: 'pc-1',
  ...over,
});

describe('endCombatState — post-combat gate', () => {
  it('sets combat_over_pending when the party survived', () => {
    const after = endCombatState(inCombat());
    expect(after.combat_active).toBe(false);
    expect(after.combat_over_pending).toBe(true);
  });

  it('does NOT gate when the whole party is dead (game-over wins)', () => {
    const dead = inCombat({
      characters: [makeChar({ id: 'pc-1', hp: 0, max_hp: 20, dead: true })],
    });
    const after = endCombatState(dead);
    expect(after.combat_over_pending).toBeFalsy();
  });

  const ents = [
    { id: 'pc-1', isEnemy: false, pos: { x: 1, y: 1 }, hp: 20 },
    { id: 'goblin', isEnemy: true, pos: { x: 3, y: 3 }, hp: 0 },
  ] as GameState['entities'];

  it('keeps the battlefield entities through the gate for a wilderness encounter', () => {
    // encounter_return marks a wilderness fight — its battlefield is the combat
    // grid, so it must survive the gate (the map already collapsed back to town).
    const after = endCombatState(
      inCombat({
        entities: ents,
        encounter_return: { level: 'town', town_id: 'town1', pos: { x: 2, y: 3 } },
      } as Partial<GameState>)
    );
    expect(after.combat_over_pending).toBe(true);
    expect(after.entities).toHaveLength(2); // battlefield kept for the gate
    expect(after.map_level).toBe('town'); // …but the underlying level collapsed
  });

  it('clears the battlefield entities for an authored-room fight (no encounter_return)', () => {
    const after = endCombatState(inCombat({ entities: ents } as Partial<GameState>));
    expect(after.entities).toBeUndefined();
  });
});

describe('generateChoices — Continue gate', () => {
  it('offers only Continue while combat_over_pending is set', () => {
    const st = endCombatState(inCombat());
    const choices = generateChoices(st, seed, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action).toEqual({ type: 'continue' });
    expect(choices[0].kind).toBe('continue');
  });
});

describe('continue action', () => {
  it('clears combat_over_pending and restores the normal choices', async () => {
    const st = endCombatState(inCombat());
    expect(st.combat_over_pending).toBe(true);
    const r = await takeAction({
      action: { type: 'continue' },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.combat_over_pending).toBe(false);
    // Back to normal exploration choices — no longer the single Continue gate.
    expect(r.choices.some((c) => c.action.type === 'continue')).toBe(false);
    expect(r.choices.length).toBeGreaterThan(0);
  });

  it('drops the kept battlefield entities when dismissing the gate', async () => {
    const st = endCombatState(
      inCombat({
        entities: [{ id: 'pc-1', isEnemy: false, pos: { x: 1, y: 1 }, hp: 20 }],
        encounter_return: { level: 'regional', pos: { x: 0, y: 0 } },
      } as Partial<GameState>)
    );
    expect(st.entities).toBeDefined(); // shown during the gate
    const r = await takeAction({
      action: { type: 'continue' },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.entities).toBeUndefined(); // …cleared on Continue
  });
});
