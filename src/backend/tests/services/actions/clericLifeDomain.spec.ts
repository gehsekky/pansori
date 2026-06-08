// RE-2 — Life Domain higher-level features:
//   Blessed Healer (L6)  — after a slot-spell heals a creature OTHER than the
//                          cleric, the cleric regains 2 + the slot's level HP.
//   Supreme Healing (L17) — slot-spell heal dice are maximized instead of rolled.
// (Disciple of Life at L3 is exercised by the existing heal specs.)

import type { Character, Seed } from '../../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { maxDice } from '../../../src/services/rulesEngine.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Life Domain Test',
  ship_name: 'Life Domain Test',
  intro: '',
  seed_id: 'life-domain',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

const lifeCleric = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    subclass: 'life',
    level: 6,
    wis: 16, // +3
    hp: 10,
    max_hp: 30,
    spells_known: ['cure_wounds'],
    prepared_spells: ['cure_wounds'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: { 1: 0 },
    ...over,
  });

function buildState(...chars: Character[]) {
  return {
    ...makeState({ id: chars[0].id }, { current_room: 'entry_hall' }),
    characters: chars,
    active_character_id: chars[0].id,
  };
}

const cast1 = async (state: ReturnType<typeof buildState>) =>
  takeAction({
    action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('maxDice helper', () => {
  it('returns the top face of every die', () => {
    expect(maxDice('2d8')).toBe(16);
    expect(maxDice('4d8+2')).toBe(34);
    expect(maxDice('70')).toBe(70);
    expect(maxDice('')).toBe(0);
  });
});

describe('Blessed Healer (Life L6)', () => {
  it('heals the cleric 2 + slot level after a slot-spell heals an ally', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = lifeCleric({ hp: 10 });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 6,
      hp: 5,
      max_hp: 50,
    });
    const r = await cast1(buildState(pc, ally));
    const after = r.newState.characters.find((c) => c.id === 'pc-1');
    // Cure Wounds is a 1st-level slot → Blessed Healer restores 2 + 1 = 3.
    expect(after?.hp).toBe(13);
    expect(r.narrative).toMatch(/Blessed Healer/);
  });

  it('does NOT fire below Cleric L6', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = lifeCleric({ level: 5, hp: 10 });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 5,
      hp: 5,
      max_hp: 50,
    });
    const r = await cast1(buildState(pc, ally));
    const after = r.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.hp).toBe(10); // unchanged — caster wasn't the heal target
    expect(r.narrative).not.toMatch(/Blessed Healer/);
  });

  it('does NOT fire when the cleric heals only itself', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Caster injured, ally at full → the only valid heal target is the caster.
    const pc = lifeCleric({ hp: 10 });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 6,
      hp: 50,
      max_hp: 50,
    });
    const r = await cast1(buildState(pc, ally));
    expect(r.narrative).not.toMatch(/Blessed Healer/);
  });
});

describe('Supreme Healing (Life L17)', () => {
  it('maximizes the heal dice instead of rolling', async () => {
    // Force the LOW end of the roll — if dice were rolled, 2d8 would be 2.
    // Supreme Healing must instead yield 16 (2×8), proving maximization.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pc = lifeCleric({ level: 17, hp: 30 }); // at max so Blessed Healer can't muddy the ally delta
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 17,
      hp: 5,
      max_hp: 80,
    });
    const r = await cast1(buildState(pc, ally));
    const afterAlly = r.newState.characters.find((c) => c.id === 'ally-1');
    // 16 (maxed 2d8) + 3 (WIS) + 3 (Disciple of Life: 2 + spell level 1) = 22.
    expect((afterAlly?.hp ?? 0) - 5).toBe(22);
  });
});
