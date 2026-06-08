// SRD defensive buffs: Stoneskin (Resistance to B/P/S, concentration) and
// False Life (temporary Hit Points). Stoneskin exercises the new buff-granted
// resistance mechanic — applied on cast, halving matching enemy damage, and
// cleared when concentration ends.

import type { Character, Enemy, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { breakConcentration } from '../../../services/gameEngine.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { enemyActor } from '../../../services/actions/actor.js';
import { handleEnemyAttack } from '../../../services/actions/enemyAttack.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('buff batch — catalog', () => {
  it('Stoneskin grants B/P/S resistance under concentration', () => {
    expect(SRD_SPELLS.stoneskin.grantResistances).toEqual(['bludgeoning', 'piercing', 'slashing']);
    expect(SRD_SPELLS.stoneskin.concentration).toBe(true);
    expect(SRD_SPELLS.stoneskin.materialCost).toBe(100);
  });
  it('False Life grants temporary Hit Points', () => {
    expect(SRD_SPELLS.false_life.tempHpGrant).toBe(9);
    expect(SRD_SPELLS.false_life.targetType).toBe('self');
  });
});

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Buff Test',
  ship_name: 'Buff Test',
  intro: '',
  seed_id: 'buff',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(spellId: string, slot: number) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 9,
    int: 18,
    hp: 40,
    max_hp: 40,
    gold: 200,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [wiz],
    active_character_id: 'pc-1',
  };
}

describe('Stoneskin — grant + teardown', () => {
  it('grants B/P/S resistance and starts concentration on cast', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'stoneskin', slotLevel: 4 },
      history: [],
      state: casterState('stoneskin', 4),
      seed: noEnemySeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.spell_resistances).toEqual(['bludgeoning', 'piercing', 'slashing']);
    expect(pc.concentrating_on?.spellId).toBe('stoneskin');
  });

  it('breakConcentration clears the granted resistance', () => {
    const char = makeChar({
      id: 'pc-1',
      spell_resistances: ['bludgeoning', 'piercing', 'slashing'],
      concentrating_on: { spellId: 'stoneskin', rounds_left: 100 },
    });
    const st = { characters: [char] } as unknown as GameState;
    const { char: after } = breakConcentration(char, st, ctx);
    expect(after.spell_resistances).toEqual([]);
  });
});

// Flat 8 slashing, toHit 0 vs low AC → always hits; isolates the resistance.
const slasher = {
  id: 'slasher',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '8',
  damageType: 'slashing',
} as unknown as Enemy;

function attackCtx(target: Character): ActionContext {
  return {
    actor: enemyActor(slasher),
    context: ctx,
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}
const enemyAttack = { type: 'enemy_attack' as const, advIdx: 0, multiattackIdx: 0 };

describe('Stoneskin — resistance in combat', () => {
  it('halves matching (slashing) damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hits
    const target = makeChar({
      id: 'w',
      ac: 5,
      hp: 40,
      max_hp: 40,
      spell_resistances: ['bludgeoning', 'piercing', 'slashing'],
    });
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done')
      expect(c.enemySubAttack.target.hp).toBe(36); // 40 − 4 (8 halved)
    else throw new Error('expected a resolved attack');
  });

  it('full damage without the resistance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const target = makeChar({ id: 'w', ac: 5, hp: 40, max_hp: 40 });
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done')
      expect(c.enemySubAttack.target.hp).toBe(32); // 40 − 8
    else throw new Error('expected a resolved attack');
  });
});

describe('False Life — temporary HP', () => {
  it('grants temp HP on cast', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'false_life', slotLevel: 1 },
      history: [],
      state: casterState('false_life', 1),
      seed: noEnemySeed,
      context: ctx,
    });
    expect(r.newState.characters[0].temp_hp).toBe(9);
  });
});
