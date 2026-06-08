// SRD Holy Aura (L8) — engine-backed party-wide concentration aura. On cast the
// buff path applies `holy_warded` to every living party member: attackers roll
// Disadvantage against them (ENEMY_DISADV_CONDITIONS) and they have Advantage on
// ALL saving throws (ALL_SAVE_ADV_CONDITIONS). Cleared by breakConcentration and
// at combat end.

import type { GameState, Seed } from '../../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  breakConcentration,
  endCombatState,
  takeAction,
} from '../../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import { ENEMY_DISADV_CONDITIONS } from '../../../src/services/conditions/registry.js';
import { SRD_SPELLS } from '../../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { rollConditionSave } from '../../../src/services/rulesEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('Holy Aura — catalog + registry wiring', () => {
  it('is an 8th-level divine self concentration aura with a 1000 GP focus', () => {
    const s = SRD_SPELLS.holy_aura;
    expect(s.level).toBe(8);
    expect(s.targetType).toBe('self');
    expect(s.holyAura).toBe(true);
    expect(s.concentration).toBe(true);
    expect(s.materialCost).toBe(1000);
    expect(s.spellList).toEqual(['divine']);
  });

  it('holy_warded imposes Disadvantage on attackers (the all-save Advantage is covered below)', () => {
    expect(ENEMY_DISADV_CONDITIONS.has('holy_warded')).toBe(true);
  });
});

describe('Holy Aura — Advantage on all saves', () => {
  it('a warded creature rolls the save with Advantage (takes the better d20)', () => {
    // Two d20 draws: 1 then 20. With the ward (advantage) the save takes the 20
    // and passes DC 12; without it the single 1 fails.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.0).mockReturnValueOnce(0.99);
    const warded = rollConditionSave('wis', 10, 12, false, 1, 0, ['holy_warded']);
    expect(warded).toBe(false); // false = save succeeded

    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.0);
    const bare = rollConditionSave('wis', 10, 12, false, 1, 0, []);
    expect(bare).toBe(true); // true = save failed
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Aura Test',
  ship_name: 'Aura Test',
  intro: '',
  seed_id: 'aura',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function party(): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 16,
    wis: 20,
    hp: 80,
    max_hp: 80,
    gold: 2000, // covers the 1000 GP reliquary focus
    spells_known: ['holy_aura'],
    prepared_spells: ['holy_aura'],
    spell_slots_max: { 8: 1 },
    spell_slots_used: {},
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 16, hp: 90, max_hp: 90 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [cleric, ally],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 5, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 6, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Holy Aura — cast wards the whole party', () => {
  it('applies holy_warded to every party member and binds the caster concentration', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'holy_aura', slotLevel: 8 },
      history: [],
      state: party(),
      seed,
      context: ctx,
    });
    for (const c of r.newState.characters) {
      expect(c.conditions).toContain('holy_warded');
    }
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('holy_aura');
  });
});

describe('Holy Aura — teardown', () => {
  it('breakConcentration strips holy_warded from the whole party', () => {
    const caster = makeChar({
      id: 'pc-1',
      conditions: ['holy_warded'],
      concentrating_on: { spellId: 'holy_aura', rounds_left: 10 },
    });
    const ally = makeChar({ id: 'pc-2', conditions: ['holy_warded'] });
    const st = { characters: [caster, ally], entities: [] } as unknown as GameState;
    const res = breakConcentration(caster, st, ctx);
    expect(res.char.conditions).not.toContain('holy_warded');
    expect(res.st.characters.find((c) => c.id === 'pc-2')?.conditions).not.toContain('holy_warded');
  });

  it('combat end clears holy_warded so it does not leak to the next fight', () => {
    const c = makeChar({ id: 'pc-1', conditions: ['holy_warded'] });
    const st = { characters: [c], entities: undefined } as unknown as GameState;
    const after = endCombatState(st);
    expect(after.characters[0].conditions).not.toContain('holy_warded');
  });
});
