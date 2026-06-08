// Deferred condition riders, now wired: Hideous Laughter applies Prone +
// Incapacitated (co-applied, both cleared on concentration break); Blindness/
// Deafness lets the caster choose Blinded OR Deafened.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Rider Test',
  ship_name: 'Rider Test',
  intro: '',
  seed_id: 'riders',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      {
        id: ENEMY,
        name: 'Thug',
        hp: 40,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
        wis: 6,
        con: 6,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 18,
    spell_slots_max: { [slot]: 3 },
    spell_slots_used: {},
    spells_known: [spellId],
    prepared_spells: [spellId],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 4 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 4 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const enemyOf = (r: Awaited<ReturnType<typeof takeAction>>) =>
  r.newState.entities?.find((e) => e.id === ENEMY)!;

describe('Hideous Laughter — Prone + Incapacitated, both concentration-linked', () => {
  it('applies both conditions on a failed save and clears both on break', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy fails the WIS save
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'hideous_laughter',
        slotLevel: 1,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState('hideous_laughter', 1),
      seed,
      context: ctx,
    });
    expect(enemyOf(r).conditions).toEqual(expect.arrayContaining(['prone', 'incapacitated']));
    const caster = r.newState.characters[0];
    expect(caster.concentrating_on?.condition).toBe('prone');
    expect(caster.concentrating_on?.condition2).toBe('incapacitated');
    // Breaking concentration strips BOTH from the enemy.
    const { st: after } = breakConcentration(caster, r.newState, ctx);
    const e = after.entities?.find((x) => x.id === ENEMY)!;
    expect(e.conditions).not.toContain('prone');
    expect(e.conditions).not.toContain('incapacitated');
  });
});

describe('Blindness/Deafness — choose the affliction', () => {
  it('defaults to Blinded', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'blindness_deafness',
        slotLevel: 2,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: casterState('blindness_deafness', 2),
      seed,
      context: ctx,
    });
    expect(enemyOf(r).conditions).toContain('blinded');
    expect(enemyOf(r).conditions).not.toContain('deafened');
  });

  it('applies Deafened when chosen', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'blindness_deafness',
        slotLevel: 2,
        targetEnemyId: ENEMY,
        conditionChoice: 'deafened',
      },
      history: [],
      state: casterState('blindness_deafness', 2),
      seed,
      context: ctx,
    });
    expect(enemyOf(r).conditions).toContain('deafened');
    expect(enemyOf(r).conditions).not.toContain('blinded');
  });
});
