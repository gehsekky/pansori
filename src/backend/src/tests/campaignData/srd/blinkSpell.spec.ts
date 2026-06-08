// SRD Blink (L3) — engine-backed defensive buff. On cast it sets
// `Character.blinking`; the enemy-attack resolver then rolls a d20 per incoming
// attack (11+ ⇒ the warded PC has flickered into the Border Ethereal and the
// blow finds no one). Cleared at combat end.

import type { Character, Enemy, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { enemyActor } from '../../../services/actions/actor.js';
import { handleEnemyAttack } from '../../../services/actions/enemyAttack.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('Blink — catalog', () => {
  it('is an L3 arcane self-buff that flags blinking', () => {
    expect(SRD_SPELLS.blink.level).toBe(3);
    expect(SRD_SPELLS.blink.targetType).toBe('self');
    expect(SRD_SPELLS.blink.blink).toBe(true);
    expect(SRD_SPELLS.blink.spellList).toEqual(['arcane']);
    expect(SRD_SPELLS.blink.concentration).toBeUndefined(); // RAW: not concentration
  });
});

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Blink Test',
  ship_name: 'Blink Test',
  intro: '',
  seed_id: 'blink',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Blink — cast sets the flag', () => {
  it('marks the caster blinking on cast', async () => {
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 18,
      hp: 30,
      max_hp: 30,
      spells_known: ['blink'],
      prepared_spells: ['blink'],
      spell_slots_max: { 3: 1 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
      characters: [wiz],
      active_character_id: 'pc-1',
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'blink', slotLevel: 3 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(r.newState.characters[0].blinking).toBe(true);
  });
});

// A flat attacker that always lands the hit (toHit huge vs low AC), so the only
// thing that can turn a hit into a miss is Blink's d20 test.
const brute = {
  id: 'brute',
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 20,
  damage: '8',
  damageType: 'slashing',
} as unknown as Enemy;

function attackCtx(target: Character): ActionContext {
  return {
    actor: enemyActor(brute),
    context: ctx,
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}
const enemyAttack = { type: 'enemy_attack' as const, advIdx: 0, multiattackIdx: 0 };

describe('Blink — incoming attacks', () => {
  it('a high d20 (11+) blinks the caster out — the blow misses, no damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 rolls high → 11+ → blink out
    const target = makeChar({ id: 'w', ac: 5, hp: 30, max_hp: 30, blinking: true });
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done') {
      expect(c.enemySubAttack.target.hp).toBe(30); // untouched
    } else throw new Error('expected a resolved attack');
  });

  it('a low d20 (≤10) leaves the caster present — the blow lands', () => {
    // Sequential draws: first the attacker's d20 (high → a clean hit, not a
    // nat-1), then Blink's d20 (low → ≤10 → the caster stays put).
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6) // attacker d20 ≈ 13 → hits
      .mockReturnValueOnce(0.0) // Blink d20 = 1 → present
      .mockReturnValue(0.6);
    const target = makeChar({ id: 'w', ac: 5, hp: 30, max_hp: 30, blinking: true });
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done') {
      expect(c.enemySubAttack.target.hp).toBe(22); // 30 − 8
    } else throw new Error('expected a resolved attack');
  });

  it('without Blink the blow always lands', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const target = makeChar({ id: 'w', ac: 5, hp: 30, max_hp: 30 });
    const c = attackCtx(target);
    handleEnemyAttack(c, { ...enemyAttack, targetCharId: 'w' });
    if (c.enemySubAttack?.outcome === 'done') {
      expect(c.enemySubAttack.target.hp).toBe(22);
    } else throw new Error('expected a resolved attack');
  });
});
