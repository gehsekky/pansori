// RE-2 — Draconic Sorcery Elemental Affinity (L6): choose a damage type; gain
// Resistance to it and +CHA to one damage roll of that type per spell.

import type { Character, Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { elementalAffinityBonus, elementalAffinityType } from '../../src/services/multiclass.js';
import { enemyActor, pcActor } from '../../src/services/actions/actor.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { handleChooseElementalAffinity } from '../../src/services/actions/meta.js';
import { handleEnemyAttack } from '../../src/services/actions/enemyAttack.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const draconic = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Sorcerer', subclass: 'draconic', level: 6, cha: 16, ...over });

describe('Elemental Affinity helpers', () => {
  it('elementalAffinityType reads the choice for a Draconic Sorcerer L6+', () => {
    expect(elementalAffinityType(draconic({ elemental_affinity: 'fire' }))).toBe('fire');
    expect(
      elementalAffinityType(draconic({ level: 5, elemental_affinity: 'fire' }))
    ).toBeUndefined();
    expect(elementalAffinityType(draconic({ elemental_affinity: undefined }))).toBeUndefined();
  });

  it('elementalAffinityBonus is CHA mod only on a matching damage type', () => {
    const c = draconic({ elemental_affinity: 'fire' }); // CHA 16 → +3
    expect(elementalAffinityBonus(c, 'fire')).toBe(3);
    expect(elementalAffinityBonus(c, 'cold')).toBe(0);
  });
});

function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('choose_elemental_affinity', () => {
  it('a Draconic Sorcerer L6 picks a type', () => {
    const c = featCtx(draconic());
    handleChooseElementalAffinity(c, { type: 'choose_elemental_affinity', damageType: 'fire' });
    expect(pcChar(c).elemental_affinity).toBe('fire');
  });

  it('requires Draconic L6', () => {
    const c = featCtx(draconic({ level: 5 }));
    handleChooseElementalAffinity(c, { type: 'choose_elemental_affinity', damageType: 'fire' });
    expect(pcChar(c).elemental_affinity).toBeUndefined();
    const c2 = featCtx(makeChar({ character_class: 'Sorcerer', level: 6 })); // no subclass
    handleChooseElementalAffinity(c2, { type: 'choose_elemental_affinity', damageType: 'fire' });
    expect(pcChar(c2).elemental_affinity).toBeUndefined();
  });
});

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'EA',
  ship_name: 'EA',
  intro: '',
  seed_id: 'ea',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 60,
        ac: 12,
        damage: '1d4',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function draconicCombat(affinity?: 'fire'): GameState {
  const s = draconic({
    id: 'pc-1',
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
    spells_known: ['fire_bolt'],
    elemental_affinity: affinity,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [s],
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
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Elemental Affinity — +CHA to matching damage', () => {
  it('Fire Bolt (fire) deals +CHA with fire affinity vs without', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 (hit); each d10 = 6 → 2d10 = 12
    const withAff = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: draconicCombat('fire'),
      seed,
      context: ctx,
    });
    const without = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: draconicCombat(undefined),
      seed,
      context: ctx,
    });
    const hpWith = (withAff.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    const hpWithout = (without.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(hpWithout - hpWith).toBe(3); // +CHA mod from the affinity
  });
});

// Enemy fire attack vs a fire-affinity sorcerer → resisted (halved).
const fireEnemy = {
  id: 'wolf-1',
  name: 'Flame Wolf',
  hp: 30,
  ac: 13,
  toHit: 5,
  damage: '8',
  damageType: 'fire',
} as unknown as Enemy;
function enemyCtx(target: Character): ActionContext {
  return {
    actor: enemyActor(fireEnemy),
    context: { narratives: { enemyAttacks: ['{enemy} hits {target} for {dmg}.'] } },
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

describe('Elemental Affinity — resistance to the chosen type', () => {
  it('a fire-affinity Draconic Sorcerer halves incoming fire damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // d20 19 → hit
    const target = draconic({ id: 'pc-1', hp: 30, max_hp: 30, ac: 13, elemental_affinity: 'fire' });
    const c = enemyCtx(target);
    handleEnemyAttack(c, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    const after = c.enemySubAttack?.outcome === 'done' ? c.enemySubAttack.target : target;
    expect(after.hp).toBe(26); // 8 fire halved → 4

    const noAff = draconic({ id: 'pc-1', hp: 30, max_hp: 30, ac: 13 });
    const c2 = enemyCtx(noAff);
    handleEnemyAttack(c2, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    const after2 = c2.enemySubAttack?.outcome === 'done' ? c2.enemySubAttack.target : noAff;
    expect(after2.hp).toBe(22); // full 8
  });
});
