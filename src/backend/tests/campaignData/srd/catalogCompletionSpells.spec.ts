// Catalog completion — True Polymorph (a real transform, via the Polymorph
// `polymorphed` path) plus the SRD's remaining effects that turn on systems
// pansori doesn't model (magic suppression, possession, shapeshifting into
// arbitrary creatures, stored spells, extra turns, planar gating, reality
// alteration), registered as narrative spells so every SRD spell is present.

import type { GameState, Seed } from '../../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Catalog Test',
  ship_name: 'Catalog Test',
  intro: '',
  seed_id: 'catalog',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      { id: ENEMY, name: 'Ogre', hp: 80, ac: 12, damage: '8', toHit: 5, xp: 50, wis: 6 },
    ],
  },
  loot: {},
  npcs: {},
};

function wizCaster(spellId: string, slot: number): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 90,
    max_hp: 90,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
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
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('True Polymorph — transforms a creature into a beast', () => {
  it('applies the polymorphed condition on a failed WIS save and links concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // WIS save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'true_polymorph', slotLevel: 9, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster('true_polymorph', 9),
      seed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('polymorphed');
    expect(ent?.polymorph_state).toBeDefined();
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('true_polymorph');
  });
});

describe('catalog completion — narrative spells registered', () => {
  // [id, level, spellLists]
  const cases: Array<[string, number, string[]]> = [
    ['enthrall', 2, ['arcane']],
    ['creation', 5, ['arcane']],
    ['dispel_evil_and_good', 5, ['divine']],
    ['antilife_shell', 5, ['primal']],
    ['planar_binding', 5, ['arcane', 'divine', 'primal']],
    ['globe_of_invulnerability', 6, ['arcane']],
    ['contingency', 6, ['arcane']],
    ['magic_jar', 6, ['arcane']],
    ['planar_ally', 6, ['divine']],
    ['project_image', 7, ['arcane']],
    ['simulacrum', 7, ['arcane']],
    ['animal_shapes', 8, ['primal']],
    ['antimagic_field', 8, ['divine', 'arcane']],
    ['foresight', 9, ['arcane', 'primal']],
    ['gate', 9, ['divine', 'arcane']],
    ['shapechange', 9, ['primal', 'arcane']],
    ['time_stop', 9, ['arcane']],
    ['wish', 9, ['arcane']],
    ['true_strike', 0, ['arcane']],
  ];
  for (const [id, level, lists] of cases) {
    it(`${id} is registered (L${level}, ${lists.join('/')}) as a narrative spell`, () => {
      const s = SRD_SPELLS[id];
      expect(s, id).toBeDefined();
      expect(s.level).toBe(level);
      expect(s.spellList).toEqual(lists);
      expect(s.narrative, `${id} narrative`).toBeTruthy();
      expect(s.damage, `${id} damage`).toBeUndefined();
      expect(s.condition, `${id} condition`).toBeUndefined();
    });
  }
});
