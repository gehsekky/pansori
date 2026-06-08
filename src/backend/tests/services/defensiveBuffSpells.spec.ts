// SRD defensive/utility buffs: Barkskin (AC floor 17), Spider Climb (Climb
// Speed = Speed, concentration), See Invisibility (caster ignores the Invisible
// condition on attack targets).

import type { Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Buff Test',
  ship_name: 'Buff Test',
  intro: '',
  seed_id: 'buffs',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      {
        id: ENEMY,
        name: 'Wraith',
        hp: 60,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function caster(over: Partial<ReturnType<typeof makeChar>>): GameState {
  const char = makeChar({
    id: 'pc-1',
    level: 5,
    dex: 10,
    ac: 10,
    speed: 30,
    spell_slots_max: { 2: 3 },
    spell_slots_used: {},
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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

describe('Barkskin — AC floor 17 (not concentration)', () => {
  it("raises a low-AC druid's AC to 17", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'barkskin', slotLevel: 2, targetCharId: 'pc-1' },
      history: [],
      state: caster({
        character_class: 'Druid',
        wis: 16,
        spells_known: ['barkskin'],
        prepared_spells: ['barkskin'],
      }),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.barkskin_active).toBe(true);
    expect(c.ac).toBe(17);
    expect(c.concentrating_on?.spellId).not.toBe('barkskin'); // not concentration
  });
});

describe('Spider Climb — grants a Climb Speed (concentration)', () => {
  it('sets climb_speed_ft to the target speed and clears on concentration break', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'spider_climb', slotLevel: 2, targetCharId: 'pc-1' },
      history: [],
      state: caster({
        character_class: 'Wizard',
        int: 16,
        spells_known: ['spider_climb'],
        prepared_spells: ['spider_climb'],
      }),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.climb_speed_ft).toBe(30);
    expect(c.concentrating_on?.spellId).toBe('spider_climb');
    const { char: after } = breakConcentration(c, r.newState, ctx);
    expect(after.climb_speed_ft).toBeUndefined();
  });
});

describe('See Invisibility — negate the invisible-target disadvantage', () => {
  it('sets the sees_invisible flag on cast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'see_invisibility',
        slotLevel: 2,
        targetCharId: 'pc-1',
      },
      history: [],
      state: caster({
        character_class: 'Wizard',
        int: 16,
        spells_known: ['see_invisibility'],
        prepared_spells: ['see_invisibility'],
      }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].sees_invisible).toBe(true);
  });

  it('attacking an invisible enemy is at disadvantage — unless you can see it', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const base = caster({ character_class: 'Fighter', str: 16 });
    // Make the enemy invisible.
    const invisState = {
      ...base,
      entities: base.entities!.map((e) =>
        e.id === ENEMY ? { ...e, conditions: ['invisible'] } : e
      ),
    } as GameState;
    const blind = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: invisState,
      seed,
      context: ctx,
    });
    expect(blind.narrative).toMatch(/disadvantage.*target is invisible/);

    // Same fight, but the attacker has See Invisibility active → no disadvantage.
    const seeingState = {
      ...invisState,
      characters: invisState.characters.map((c) => ({ ...c, sees_invisible: true })),
    } as GameState;
    const seen = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: seeingState,
      seed,
      context: ctx,
    });
    expect(seen.narrative).not.toMatch(/target is invisible/);
  });
});
