// SRD 5.2.1 Resistance (cantrip): touch a willing creature, choose a damage
// type; while the spell lasts the creature reduces damage of that type by 1d4,
// once per turn. Mechanized as a self/ally concentration buff that stamps
// `resistance_reduction`; `applyDamage` subtracts 1d4 from matching-type damage
// (once per round) and `breakConcentration` clears it.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { applyDamage } from '../../services/damage.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Resistance Test',
  ship_name: 'Resistance Test',
  intro: '',
  seed_id: 'resistance',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    spells_known: ['resistance'],
    prepared_spells: ['resistance'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [char],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

const dmgState = (round = 1): GameState =>
  ({ ...makeState({ id: 'pc-1' }), round }) as unknown as GameState;

describe('Resistance — −1d4 to a chosen damage type, once per round', () => {
  it('casting it stamps resistance_reduction with the chosen type (concentration)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'resistance',
        slotLevel: 0,
        targetCharId: 'pc-1',
        resistType: 'fire',
      } as never,
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.resistance_reduction?.type).toBe('fire');
    expect(c.concentrating_on?.spellId).toBe('resistance');
  });

  it('reduces matching-type damage by 1d4 and stamps the round', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 1d4 → 3
    const char = makeChar({
      id: 'pc-1',
      hp: 20,
      max_hp: 20,
      resistance_reduction: { type: 'fire' },
    });
    const res = applyDamage(char, dmgState(1), 10, { damageType: 'fire', skipConcentration: true });
    expect(res.amountDealt).toBe(7); // 10 − 3
    expect(res.resistanceNote).toContain('Resistance');
    expect(res.char.resistance_reduction?.used_round).toBe(1);
  });

  it('does not reduce a different damage type', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = makeChar({
      id: 'pc-1',
      hp: 20,
      max_hp: 20,
      resistance_reduction: { type: 'fire' },
    });
    const res = applyDamage(char, dmgState(1), 10, { damageType: 'cold', skipConcentration: true });
    expect(res.amountDealt).toBe(10);
    expect(res.resistanceNote).toBe('');
  });

  it('only fires once per round (second hit of the type is unreduced)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = makeChar({
      id: 'pc-1',
      hp: 20,
      max_hp: 20,
      resistance_reduction: { type: 'fire', used_round: 1 },
    });
    const res = applyDamage(char, dmgState(1), 10, { damageType: 'fire', skipConcentration: true });
    expect(res.amountDealt).toBe(10);
    // …but it reduces again on a later round.
    const next = applyDamage(res.char, dmgState(2), 10, {
      damageType: 'fire',
      skipConcentration: true,
    });
    expect(next.amountDealt).toBe(7);
    expect(next.char.resistance_reduction?.used_round).toBe(2);
  });

  it('losing concentration ends the reduction', () => {
    const armed = makeChar({
      id: 'pc-1',
      resistance_reduction: { type: 'fire' },
      concentrating_on: { spellId: 'resistance', rounds_left: 10 },
    });
    const st = { ...makeState({ id: 'pc-1' }), characters: [armed] } as unknown as GameState;
    const { char } = breakConcentration(armed, st, ctx);
    expect(char.resistance_reduction).toBeUndefined();
    expect(char.concentrating_on).toBeNull();
  });
});
