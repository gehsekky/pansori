// SRD Find Familiar — a non-combatant ally (RAW: "can't take the Attack
// action"). It rides the summon path with `noAttack: true`: cast (a ritual, out
// of combat) adds it to summoned_allies, seedSummonedAllies materializes it as a
// non-attacking ally, and runAllyTurn takes the Help action (granting its owner
// Advantage) instead of attacking.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { runAllyTurn, seedSummonedAllies, takeAction } from './gameEngine.js';
import { SRD_SPELLS } from '../campaignData/srd/spells.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Familiar Test',
  ship_name: 'Familiar Test',
  intro: '',
  seed_id: 'familiar',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Goblin', hp: 20, ac: 12, damage: '1d6', toHit: 3, xp: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Find Familiar — catalog', () => {
  it('is a ritual summon flagged non-combatant', () => {
    const f = SRD_SPELLS.find_familiar;
    expect(f).toMatchObject({
      level: 1,
      ritualCasting: true,
      outOfCombatOnly: true,
      materialCost: 10,
    });
    expect(f.summon?.noAttack).toBe(true);
  });
});

describe('Find Familiar — cast (ritual, out of combat)', () => {
  it('adds a non-combatant familiar to summoned_allies and consumes the material', async () => {
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      gold: 50,
      spells_known: ['find_familiar'],
      prepared_spells: ['find_familiar'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }), // not in combat
      characters: [wiz],
      active_character_id: 'pc-1',
    };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'find_familiar', slotLevel: 1 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const fam = r.newState.summoned_allies?.find((a) => a.ownerId === 'pc-1');
    expect(fam).toBeDefined();
    expect(fam?.noAttack).toBe(true);
    expect(r.newState.characters[0].gold).toBe(40); // 10 GP incense consumed
  });
});

describe('Find Familiar — combat behavior', () => {
  it('seedSummonedAllies materializes it as a non-attacking ally', () => {
    const wiz = makeChar({ id: 'pc-1', character_class: 'Wizard', level: 5, initiative_roll: 12 });
    const st = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wiz],
      active_character_id: 'pc-1',
      initiative_order: [{ id: 'pc-1', roll: 12, is_enemy: false }],
      initiative_idx: 0,
      summoned_allies: [
        {
          id: 'fam-1',
          ownerId: 'pc-1',
          name: 'Owl',
          ac: 11,
          maxHp: 1,
          toHit: 0,
          damage: '0',
          noAttack: true,
        },
      ],
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
    const seeded = seedSummonedAllies(st);
    const famEnt = seeded.entities?.find((e) => e.id === 'fam-1');
    expect(famEnt?.noAttack).toBe(true);
    expect(famEnt?.summoned_by).toBe('pc-1');
  });

  it('runAllyTurn: the familiar takes the Help action (owner gains advantage) and deals no damage', () => {
    const st = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [makeChar({ id: 'pc-1', name: 'Mage', character_class: 'Wizard', level: 5 })],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'fam-1', roll: 10, is_enemy: false },
        { id: ENEMY, roll: 5, is_enemy: true },
      ],
      initiative_idx: 1,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'fam-1',
          isEnemy: false,
          side: 'ally',
          companionName: 'Owl',
          summoned_by: 'pc-1',
          noAttack: true,
          pos: { x: 4, y: 6 },
          hp: 1,
          maxHp: 1,
          conditions: [],
          condition_durations: {},
        },
        {
          id: ENEMY,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
    const famEnt = st.entities!.find((e) => e.id === 'fam-1')!;
    const r = runAllyTurn({ allyEnt: famEnt, st, seed, context: ctx });
    expect(r.st.help_target_id).toBe('pc-1'); // owner gets advantage on next attack
    expect(r.st.entities?.find((e) => e.id === ENEMY)!.hp).toBe(20); // dealt no damage
    expect(r.narrative).toMatch(/Help|Advantage/);
  });
});
