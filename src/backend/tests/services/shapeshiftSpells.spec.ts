// SRD shapeshift spells — Shapechange (self) and Animal Shapes (party). They put
// the target(s) into a BeastForm via the wild_shaped machinery, concentration-
// bound; breaking concentration (or combat end) reverts them. A druid's own Wild
// Shape (no `shapeshift_spell` marker) is left untouched.

import type { GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Shape Test',
  ship_name: 'Shape Test',
  intro: '',
  seed_id: 'shape',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [{ id: ENEMY, name: 'Ogre', hp: 60, ac: 12, damage: '8', toHit: 5, xp: 50 }],
  },
  loot: {},
  npcs: {},
};

function partyState(spellId: string, slot: number): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: 'Druid',
    level: 18,
    wis: 20,
    hp: 70,
    max_hp: 70,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 10, hp: 60, max_hp: 60 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'pc-2', roll: 12, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 0, y: 0 },
        hp: 70,
        maxHp: 70,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 0, y: 1 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 3, y: 3 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('shapeshift spells — catalog', () => {
  it('Shapechange transforms the self; Animal Shapes the party', () => {
    expect(SRD_SPELLS.shapechange.shapeshift).toEqual({ scope: 'self' });
    expect(SRD_SPELLS.shapechange.concentration).toBe(true);
    expect(SRD_SPELLS.animal_shapes.shapeshift).toEqual({ scope: 'allies' });
    expect(SRD_SPELLS.animal_shapes.concentration).toBe(true);
  });
});

describe('Shapechange — self transform', () => {
  it('puts the caster into the chosen beast form with temp HP + concentration', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'shapechange', slotLevel: 9, beastForm: 'brown_bear' },
      history: [],
      state: partyState('shapechange', 9),
      seed,
      context: ctx,
    });
    const caster = r.newState.characters[0];
    expect(caster.conditions).toContain('wild_shaped');
    expect(caster.wild_shape_form).toBe('brown_bear');
    expect(caster.shapeshift_spell).toBe('shapechange');
    expect(caster.temp_hp ?? 0).toBeGreaterThan(0);
    expect(caster.concentrating_on?.spellId).toBe('shapechange');
    // The ally is untouched (self scope).
    expect(r.newState.characters[1].conditions).not.toContain('wild_shaped');
  });
});

describe('Animal Shapes — party transform', () => {
  it('shapes every living party member', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'animal_shapes',
        slotLevel: 8,
        beastForm: 'brown_bear',
      },
      history: [],
      state: partyState('animal_shapes', 8),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].conditions).toContain('wild_shaped'); // caster
    expect(r.newState.characters[1].conditions).toContain('wild_shaped'); // ally
    expect(r.newState.characters[1].shapeshift_spell).toBe('animal_shapes');
  });
});

describe('shapeshift — concentration revert', () => {
  it('breaking concentration reverts every creature shaped by the spell', () => {
    const caster = makeChar({
      id: 'pc-1',
      conditions: ['wild_shaped'],
      wild_shape_form: 'brown_bear',
      shapeshift_spell: 'animal_shapes',
      temp_hp: 19,
      concentrating_on: { spellId: 'animal_shapes', rounds_left: 100 },
    });
    const ally = makeChar({
      id: 'pc-2',
      conditions: ['wild_shaped'],
      wild_shape_form: 'brown_bear',
      shapeshift_spell: 'animal_shapes',
      temp_hp: 19,
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { combat_active: true }),
      characters: [caster, ally],
    };
    const out = breakConcentration(caster, st, ctx);
    expect(out.char.conditions).not.toContain('wild_shaped');
    expect(out.char.wild_shape_form).toBeUndefined();
    expect(out.st.characters[1].conditions).not.toContain('wild_shaped'); // ally reverted too
    expect(out.st.characters[1].shapeshift_spell).toBeUndefined();
  });

  it("leaves a druid's own Wild Shape (no shapeshift_spell) alone", () => {
    const druid = makeChar({
      id: 'pc-1',
      conditions: ['wild_shaped'],
      wild_shape_form: 'wolf',
      concentrating_on: { spellId: 'animal_shapes', rounds_left: 100 },
    });
    const wildDruid = makeChar({
      id: 'pc-2',
      conditions: ['wild_shaped'],
      wild_shape_form: 'wolf',
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { combat_active: true }),
      characters: [druid, wildDruid],
    };
    const out = breakConcentration(druid, st, ctx);
    // pc-2 was wild-shaped by its own class feature (no shapeshift_spell) — untouched.
    expect(out.st.characters[1].conditions).toContain('wild_shaped');
  });
});
