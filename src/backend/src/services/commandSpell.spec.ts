// Enchantment control — Command (SRD L1). On a failed Wisdom save the target
// gains the `commanded` condition; pansori resolves the "Halt" command, so the
// enemy turn loop skips the creature's next turn and consumes the condition
// (it applies for one turn only). Single-target, no concentration.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../contexts/srd/spells.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Command Test',
  ship_name: 'Command Test',
  intro: '',
  seed_id: 'command',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 200, ac: 10, damage: '2d8', toHit: 6, xp: 50, wis: 6 },
    ],
  },
  loot: {},
  npcs: {},
};

// `soloInitiative` keeps the enemy out of initiative so a cast doesn't advance
// into the enemy turn — lets us inspect the freshly-applied condition before
// the skip consumes it. The full-initiative variant drives the skip itself.
function casterState(opts: { soloInitiative?: boolean; enemyCommanded?: boolean } = {}): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 18,
    hp: 40,
    max_hp: 40,
    spells_known: ['command'],
    prepared_spells: ['command'],
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [cleric],
    active_character_id: 'pc-1',
    initiative_order: opts.soloInitiative
      ? [{ id: 'pc-1', roll: 18, is_enemy: false }]
      : [
          { id: 'pc-1', roll: 18, is_enemy: false },
          { id: ENEMY, roll: 5, is_enemy: true },
        ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 2 }, // adjacent to the PC — would attack if not halted
        hp: 200,
        maxHp: 200,
        conditions: opts.enemyCommanded ? ['commanded'] : [],
        condition_durations: {},
      },
    ],
  };
}

describe('Command — catalog', () => {
  it('is an L1 enchantment-control spell: WIS save negates, applies `commanded`', () => {
    const s = SRD_SPELLS.command;
    expect(s).toBeDefined();
    expect(s.level).toBe(1);
    expect(s.savingThrow).toBe('wis');
    expect(s.saveEffect).toBe('negates');
    expect(s.condition).toBe('commanded');
    expect(s.concentration).toBeFalsy();
    expect(s.spellList).toContain('divine');
  });
});

describe('Command — failed save applies `commanded`', () => {
  it('a creature that fails its WIS save is commanded', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy WIS save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'command', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: casterState({ soloInitiative: true }),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.conditions).toContain('commanded');
  });

  it('a creature that succeeds on its WIS save is unaffected', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // enemy WIS save succeeds
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'command', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: casterState({ soloInitiative: true }),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.conditions).not.toContain('commanded');
  });
});

describe('Command — Halt: the commanded creature loses its turn', () => {
  it('the enemy skips its turn and the condition is consumed (one turn only)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: casterState({ enemyCommanded: true }),
      seed,
      context: ctx,
    });
    // Skip ran: the condition is consumed and the adjacent enemy never attacked.
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.conditions).not.toContain('commanded');
    expect(r.newState.characters[0].hp).toBe(40);
    expect(r.narrative).toMatch(/compelled to halt/i);
  });
});
