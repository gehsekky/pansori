// 2024 Weapon Mastery slot growth — a Fighter/Barbarian level-up that raises
// the mastery count sets `weapon_mastery_pending`; generateChoices surfaces the
// pick(s) and `choose_weapon_mastery` resolves them.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass, generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Mastery Test',
  ship_name: 'Mastery Test',
  intro: '',
  seed_id: 'mastery',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function fighterL3() {
  return makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 3,
    class_levels: { fighter: 3 },
    weapon_masteries: ['longsword', 'shortbow', 'greataxe'],
  });
}

function stateFor(char: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [char],
    active_character_id: 'pc-1',
  };
}

describe('Weapon Mastery slot growth on level-up', () => {
  it('a Fighter reaching L4 gains one pending mastery slot', () => {
    const char = fighterL3();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic HP roll
    applyLevelUpForClass(char, 'Fighter', ctx);
    expect(char.level).toBe(4);
    expect(char.weapon_mastery_pending).toBe(1);
  });

  it('surfaces the new-mastery pick in generateChoices (weapons not already mastered)', () => {
    const char = fighterL3();
    char.level = 4;
    char.weapon_mastery_pending = 1;
    const choices = generateChoices(stateFor(char), seed, ctx);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((c) => c.action.type === 'choose_weapon_mastery')).toBe(true);
    expect(choices.every((c) => /Weapon Mastery: master/i.test(c.label))).toBe(true);
    // Already-mastered weapons aren't offered again.
    const offered = choices.map((c) =>
      c.action.type === 'choose_weapon_mastery' ? c.action.weaponId : ''
    );
    expect(offered).not.toContain('longsword');
  });

  it('choose_weapon_mastery adds the weapon and clears the pending slot', async () => {
    const char = fighterL3();
    char.level = 4;
    char.weapon_mastery_pending = 1;
    const choices = generateChoices(stateFor(char), seed, ctx);
    const pick = choices.find((c) => c.action.type === 'choose_weapon_mastery');
    const weaponId =
      pick && pick.action.type === 'choose_weapon_mastery' ? pick.action.weaponId : '';
    expect(weaponId).toBeTruthy();
    const r = await takeAction({
      action: { type: 'choose_weapon_mastery', weaponId },
      history: [],
      state: stateFor(char),
      seed,
      context: ctx,
    });
    const out = r.newState.characters[0];
    expect(out.weapon_masteries).toContain(weaponId);
    expect(out.weapon_mastery_pending ?? 0).toBe(0);
  });
});
