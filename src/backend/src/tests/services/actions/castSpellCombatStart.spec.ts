// Regression spec for the "cast_spell fake-kills boss in fresh room"
// bug surfaced in the Whispering Pines adventure log: Cleric cast
// Spiritual Weapon (5 force damage) on a 156-HP Frost Acolyte the
// instant the party entered the Ritual Apex. Combat hadn't started,
// no entities were seeded — `applySingleTargetDamage` read the
// missing entity's HP as 0 and fake-killed via the kill path.
//
// Fix: cast_spell now triggers `runCombatStart` when targeting a
// hostile, same as the Attack handler. This seeds entities + rolls
// initiative + sets combat_active. Damage then applies against the
// real seeded HP.

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#boss`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Boss Cast Test',
  ship_name: 'Boss Cast Test',
  intro: '',
  seed_id: 'cast-combat-start',
  rooms: [{ id: 'entry_hall', name: 'Apex', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Frost Acolyte',
        hp: 156, // post-scaling HP
        ac: 15,
        damage: '2d6+3',
        toHit: 6,
        xp: 1100,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function freshRoomState(pc: ReturnType<typeof makeChar>): GameState {
  // Mimic "just walked into the boss room": no combat_active, no
  // initiative_order, no entities.
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: false }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [],
    initiative_idx: 0,
    entities: undefined,
  };
}

describe('cast_spell — fresh room combat-start regression', () => {
  it('auto-hit spell on hostile in fresh room: combat starts + entity seeded + real damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['spiritual_weapon'],
      prepared_spells: ['spiritual_weapon'],
      spell_slots_max: { 2: 3 },
      spell_slots_used: { 2: 0 },
    });
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'spiritual_weapon',
        slotLevel: 2,
        targetEnemyId: enemyId,
      },
      history: [],
      state: freshRoomState(pc),
      seed,
      context: ctx,
    });
    // Combat is now active.
    expect(result.newState.combat_active).toBe(true);
    // The Acolyte is NOT in enemies_killed — 5-ish damage shouldn't drop 156 HP.
    expect(result.newState.enemies_killed).not.toContain(enemyId);
    // Entity exists and has HP < 156 (some damage applied) but > 0.
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId);
    expect(enemyEnt).toBeDefined();
    expect(enemyEnt?.hp ?? 0).toBeGreaterThan(0);
    expect(enemyEnt?.hp ?? 0).toBeLessThan(156);
  });

  it('attack-roll spell in fresh room: same protection — entity seeded before damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 16,
      spells_known: ['fire_bolt'],
      spell_slots_max: {},
      spell_slots_used: {},
    });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: enemyId },
      history: [],
      state: freshRoomState(pc),
      seed,
      context: ctx,
    });
    expect(result.newState.combat_active).toBe(true);
    expect(result.newState.enemies_killed).not.toContain(enemyId);
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId);
    expect(enemyEnt).toBeDefined();
    // Hit or miss, the Acolyte should still be alive at 156 HP.
    expect(enemyEnt?.hp ?? 0).toBeGreaterThan(0);
  });

  it('precast slot consumption sticks through combat-start reset', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['spiritual_weapon'],
      prepared_spells: ['spiritual_weapon'],
      spell_slots_max: { 2: 3 },
      spell_slots_used: { 2: 0 },
    });
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'spiritual_weapon',
        slotLevel: 2,
        targetEnemyId: enemyId,
      },
      history: [],
      state: freshRoomState(pc),
      seed,
      context: ctx,
    });
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    // Slot must remain consumed — combat-start's freshChar lookup
    // previously reverted this mutation.
    expect(afterPc?.spell_slots_used?.[2]).toBe(1);
  });
});
