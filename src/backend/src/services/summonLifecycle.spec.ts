// RE-1 Phase 4 — summon lifecycle. `addAllyCombatant` / `removeCombatant`
// insert & remove ally (companion / summon) entities + their initiative
// slots; `breakConcentration` sweeps a caster's concentration summons.

import type { CombatEntity, GameState } from '../types.js';
import { addAllyCombatant, breakConcentration, removeCombatant } from './gameEngine.js';
import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';

const ent = (over: Partial<CombatEntity> & Pick<CombatEntity, 'id'>): CombatEntity => ({
  isEnemy: false,
  pos: { x: 0, y: 0 },
  hp: 10,
  maxHp: 10,
  conditions: [],
  condition_durations: {},
  ...over,
});

describe('addAllyCombatant', () => {
  it('adds the entity + an is_enemy:false initiative slot after the caster', () => {
    const base: GameState = {
      ...makeState(),
      entities: [ent({ id: 'pc-1' })],
      initiative_order: [
        { id: 'pc-1', roll: 15, is_enemy: false },
        { id: 'goblin-1', roll: 8, is_enemy: true },
      ],
    };
    const wolf = ent({ id: 'wolf', side: 'ally', companionName: 'Wolf', toHit: 4, damage: '2d4' });
    const r = addAllyCombatant(base, wolf, { initiativeRoll: 12, afterId: 'pc-1' });
    expect(r.entities?.map((e) => e.id)).toContain('wolf');
    expect(r.initiative_order.map((e) => e.id)).toEqual(['pc-1', 'wolf', 'goblin-1']);
    expect(r.initiative_order.find((e) => e.id === 'wolf')).toMatchObject({
      is_enemy: false,
      roll: 12,
    });
  });

  it('appends to initiative when afterId is absent', () => {
    const base: GameState = {
      ...makeState(),
      entities: [],
      initiative_order: [{ id: 'pc-1', roll: 10, is_enemy: false }],
    };
    const r = addAllyCombatant(base, ent({ id: 'fam', side: 'ally' }));
    expect(r.initiative_order.map((e) => e.id)).toEqual(['pc-1', 'fam']);
  });
});

describe('removeCombatant', () => {
  it('drops the combatant from entities and initiative_order', () => {
    const base: GameState = {
      ...makeState(),
      entities: [ent({ id: 'pc-1' }), ent({ id: 'wolf', side: 'ally' })],
      initiative_order: [
        { id: 'pc-1', roll: 10, is_enemy: false },
        { id: 'wolf', roll: 9, is_enemy: false },
      ],
    };
    const r = removeCombatant(base, 'wolf');
    expect(r.entities?.map((e) => e.id)).toEqual(['pc-1']);
    expect(r.initiative_order.map((e) => e.id)).toEqual(['pc-1']);
  });
});

describe('breakConcentration — summon sweep', () => {
  it("removes the caster's concentration summons; keeps persistent + other casters'", () => {
    const caster = makeChar({
      id: 'pc-1',
      concentrating_on: { spellId: 'conjure_animals', rounds_left: 10 },
    });
    const st: GameState = {
      ...makeState({ id: 'pc-1' }),
      characters: [caster],
      entities: [
        ent({ id: 'pc-1' }),
        ent({ id: 'beast-1', side: 'ally', summoned_by: 'pc-1', summon_concentration: true }),
        ent({ id: 'familiar', side: 'ally', summoned_by: 'pc-1', summon_concentration: false }),
        ent({ id: 'beast-other', side: 'ally', summoned_by: 'pc-2', summon_concentration: true }),
      ],
      initiative_order: [
        { id: 'pc-1', roll: 15, is_enemy: false },
        { id: 'beast-1', roll: 15, is_enemy: false },
        { id: 'familiar', roll: 14, is_enemy: false },
        { id: 'beast-other', roll: 13, is_enemy: false },
      ],
    };
    const { st: after } = breakConcentration(caster, st);
    const ids = after.entities?.map((e) => e.id) ?? [];
    expect(ids).not.toContain('beast-1'); // concentration summon removed
    expect(ids).toContain('familiar'); // persistent summon stays
    expect(ids).toContain('beast-other'); // a different caster's summon stays
    expect(after.initiative_order.map((e) => e.id)).not.toContain('beast-1');
  });
});
