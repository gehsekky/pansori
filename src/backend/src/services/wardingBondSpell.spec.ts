// SRD Warding Bond (L2): the warded ally gains Resistance to all damage, and
// whenever it takes damage the warder takes the same amount. The redirect runs
// in redirectWardingBondDamage off the pre-action HP snapshot.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { redirectWardingBondDamage, takeAction } from './gameEngine.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Ward Test',
  ship_name: 'Ward Test',
  intro: '',
  seed_id: 'ward',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Warding Bond — damage redirect', () => {
  it("a warded ally's damage is dealt to the warder too", () => {
    const warder = makeChar({ id: 'pc-1', hp: 30, max_hp: 30 });
    const ally = makeChar({ id: 'pc-2', hp: 20, max_hp: 30, warded_by: 'pc-1' }); // took 10
    const st = { characters: [warder, ally], entities: [] } as unknown as GameState;
    const prev = new Map([
      ['pc-1', 30],
      ['pc-2', 30],
    ]);
    const out = redirectWardingBondDamage(st, prev);
    expect(out.characters.find((c) => c.id === 'pc-1')!.hp).toBe(20); // warder took the 10
    expect(out.characters.find((c) => c.id === 'pc-2')!.warded_by).toBe('pc-1'); // bond intact
  });

  it('the bond ends when the warder drops to 0', () => {
    const warder = makeChar({ id: 'pc-1', hp: 5, max_hp: 30 });
    const ally = makeChar({ id: 'pc-2', hp: 20, max_hp: 30, warded_by: 'pc-1' }); // took 10
    const st = { characters: [warder, ally], entities: [] } as unknown as GameState;
    const prev = new Map([
      ['pc-1', 5],
      ['pc-2', 30],
    ]);
    const out = redirectWardingBondDamage(st, prev);
    expect(out.characters.find((c) => c.id === 'pc-1')!.hp).toBe(0); // warder drops
    expect(out.characters.find((c) => c.id === 'pc-2')!.warded_by).toBeUndefined(); // bond ends
  });
});

describe('Warding Bond — cast', () => {
  it('bonds the ally to the caster and grants resistance to all damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cleric = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spell_slots_max: { 2: 2 },
      spell_slots_used: {},
      spells_known: ['warding_bond'],
      prepared_spells: ['warding_bond'],
    });
    const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [cleric, ally],
      active_character_id: 'pc-1',
    } as unknown as GameState;
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'warding_bond', slotLevel: 2, targetCharId: 'pc-2' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const warded = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(warded.warded_by).toBe('pc-1');
    expect(warded.spell_resistances).toEqual(
      expect.arrayContaining(['fire', 'slashing', 'psychic'])
    );
  });
});
