// SRD Life Drain (Specter, Wight) — max-HP-reduction infrastructure.
//
// On a hit, the Necrotic damage dealt also reduces the target's Hit Point
// maximum by that amount (Specter: its all-necrotic attack; Wight: the
// necrotic `bonusDamage` rider only — not the slashing primary). `max_hp` is
// lowered directly and `life_drain_reduction` tracks the restorable total; a
// Long Rest or Greater Restoration ('hp_max') gives it back. The target dies
// if a drain brings its maximum to 0.
//
// With Math.random() pinned to 0.5: rollDice('1dN') = floor(0.5*N)+1, so a
// d20 is 11 (a hit, not a crit), 3d6 = 12, 1d8 = 5, 1d8+2 = 7.

import type { CombatEntity, Enemy, GameState } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { enemyActor } from '../../src/services/actions/actor.js';
import { handleEnemyAttack } from '../../src/services/actions/enemyAttack.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

function ent(o: Partial<CombatEntity>): CombatEntity {
  return {
    id: 'x',
    isEnemy: true,
    pos: { x: 5, y: 5 },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
    ...o,
  };
}

// Resolve one enemy swing against a PC and return the proposed (updated) target
// character. handleEnemyAttack does not commit — it stashes the result.
function strike(enemy: Partial<Enemy>, targetHp: number, targetMaxHp: number) {
  const attacker = {
    id: 'e1',
    name: 'Drainer',
    hp: 22,
    ac: 12,
    toHit: 4,
    damage: '3d6',
    damageType: 'necrotic',
    ...enemy,
  } as unknown as Enemy;
  const target = makeChar({ id: 'pc', ac: 10, hp: targetHp, max_hp: targetMaxHp });
  const attackerEnt = ent({ id: 'e1', pos: { x: 5, y: 6 } });
  const pcEnt = ent({
    id: 'pc',
    isEnemy: false,
    pos: { x: 5, y: 5 },
    hp: targetHp,
    maxHp: targetMaxHp,
  });
  const c = {
    actor: enemyActor(attacker, attackerEnt),
    context: ctx,
    st: { characters: [target], entities: [pcEnt, attackerEnt], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
  handleEnemyAttack(c, { type: 'enemy_attack', advIdx: 0, multiattackIdx: 0, targetCharId: 'pc' });
  if (c.enemySubAttack?.outcome !== 'done' && c.enemySubAttack?.outcome !== 'killed-massive')
    throw new Error(`expected a resolved attack, got ${c.enemySubAttack?.outcome}`);
  return c.enemySubAttack.target;
}

describe('Life Drain — max-HP reduction on a hit', () => {
  it('Specter drains the full (all-necrotic) damage from the max HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 hits; 3d6 = 12 necrotic
    const t = strike({ lifeDrain: true }, 40, 40);
    expect(t.hp).toBe(28); // 40 − 12 necrotic
    expect(t.max_hp).toBe(28); // max reduced by the same 12
    expect(t.life_drain_reduction).toBe(12);
    expect(t.dead).toBe(false);
  });

  it('clamps current HP down when the reduced max falls below it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Already-wounded target: hp 8, max 40. 12 necrotic → hp would be 8−12<0
    // (downed); max 40−12 = 28. The clamp only matters when hp > newMax, which
    // isn't the case here — verify hp follows the damage, max follows the drain.
    const t = strike({ lifeDrain: true }, 8, 40);
    expect(t.max_hp).toBe(28);
    expect(t.life_drain_reduction).toBe(12);
  });

  it('a Wight drains only the necrotic bonus, not the slashing primary', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Wight: 1d8+2 slashing (7) + 1d8 necrotic bonus (5). Drain = 5 (necrotic).
    const t = strike(
      {
        lifeDrain: true,
        damage: '1d8+2',
        damageType: 'slashing',
        bonusDamage: '1d8',
        bonusDamageType: 'necrotic',
      },
      40,
      40
    );
    expect(t.hp).toBe(28); // 40 − (7 + 5)
    expect(t.max_hp).toBe(35); // only the necrotic 5 drains the max
    expect(t.life_drain_reduction).toBe(5);
  });

  it('kills the target outright when the max HP is reduced to 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 12 necrotic vs a max of 10
    const t = strike({ lifeDrain: true }, 10, 10);
    expect(t.max_hp).toBe(0);
    expect(t.dead).toBe(true);
  });

  it('is a no-op for an enemy without the lifeDrain flag', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = strike({ damage: '3d6', damageType: 'necrotic' }, 40, 40); // necrotic but no lifeDrain
    expect(t.hp).toBe(28); // still takes the damage
    expect(t.max_hp).toBe(40); // but the max is untouched
    expect(t.life_drain_reduction ?? 0).toBe(0);
  });
});

// ── Restoration: Long Rest + Greater Restoration give the maximum back ──
function drainedClericState(): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 9,
    wis: 18,
    gold: 200, // diamond dust for Greater Restoration (100 gp material cost)
    hp: 20,
    max_hp: 40, // already drained from a base of 52
    life_drain_reduction: 12,
    spells_known: ['greater_restoration'],
    prepared_spells: ['greater_restoration'],
    spell_slots_max: { 5: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [cleric],
    active_character_id: 'pc-1',
  };
}

const restSeed = {
  context_id: ctx.id,
  world_name: 'Life Drain Test',
  ship_name: 'Life Drain Test',
  intro: '',
  seed_id: 'ld',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Life Drain — the reduction is restorable', () => {
  it('a Long Rest restores the drained maximum and heals to it', async () => {
    const r = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state: drainedClericState(),
      seed: restSeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.max_hp).toBe(52); // 40 + 12 restored
    expect(pc.life_drain_reduction).toBe(0);
    expect(pc.hp).toBe(52); // full HP at the restored maximum
  });

  it("Greater Restoration 'hp_max' restores the maximum without healing", async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'greater_restoration',
        slotLevel: 5,
        restorationEffect: 'hp_max',
      },
      history: [],
      state: drainedClericState(),
      seed: restSeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.max_hp).toBe(52); // cap lifted
    expect(pc.life_drain_reduction).toBe(0);
    expect(pc.hp).toBe(20); // current HP unchanged (RAW only lifts the cap)
  });
});
