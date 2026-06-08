// SRD Spare the Dying — stabilize a dying ally (it stops rolling death saves).
// Regression: the spell was a pure narrative no-op; nothing set `stable`.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Stabilize Test',
  ship_name: 'Stabilize Test',
  intro: '',
  seed_id: 'stabilize',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [{ id: ENEMY, name: 'Ogre', hp: 40, ac: 12, damage: '1d6', toHit: 3, xp: 50 }],
  },
  loot: {},
  npcs: {},
};

function state(): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    name: 'Mira',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    hp: 30,
    max_hp: 30,
    spells_known: ['spare_the_dying'],
    prepared_spells: ['spare_the_dying'],
  });
  // A downed ally: 0 HP, dying (not dead, not yet stable).
  const downed = makeChar({
    id: 'pc-2',
    name: 'Brom',
    character_class: 'Fighter',
    level: 5,
    hp: 0,
    max_hp: 24,
    stable: false,
    conditions: ['unconscious'],
    death_saves: { successes: 0, failures: 1 },
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [cleric, downed],
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
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 0, y: 1 },
        hp: 0,
        maxHp: 24,
        conditions: ['unconscious'],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 4, y: 4 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Spare the Dying — catalog', () => {
  it('is a stabilizing ally cantrip', () => {
    expect(SRD_SPELLS.spare_the_dying.stabilizes).toBe(true);
    expect(SRD_SPELLS.spare_the_dying.targetType).toBe('ally');
    expect(SRD_SPELLS.spare_the_dying.level).toBe(0);
  });
});

describe('Spare the Dying — stabilizes a downed ally', () => {
  it('surfaces a stabilize choice for the dying ally', () => {
    const choices = generateChoices(state(), seed, ctx);
    const stab = choices.find(
      (c) => c.action.type === 'cast_spell' && c.action.spellId === 'spare_the_dying'
    );
    expect(stab).toBeDefined();
    expect((stab!.action as { targetCharId?: string }).targetCharId).toBe('pc-2');
  });

  it('casting it sets the target stable (death saves stop)', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'spare_the_dying',
        slotLevel: 0,
        targetCharId: 'pc-2',
      },
      history: [],
      state: state(),
      seed,
      context: ctx,
    });
    const ally = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(ally.stable).toBe(true);
    expect(ally.dead).toBeFalsy();
    expect(r.narrative).toContain('Brom'); // named the stabilized ally (target)
  });
});
