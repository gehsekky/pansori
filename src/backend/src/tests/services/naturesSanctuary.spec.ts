// SRD 5.2.1 Circle of the Land — Nature's Sanctuary (Druid L14): a Magic
// action and a Wild Shape use raise a 15-ft cube of spectral trees for 1
// minute. The Druid and allies inside have Half Cover; allies inside share the
// Druid's Nature's Ward Resistance. A Bonus Action moves the cube 60 ft. It
// ends if the Druid is Incapacitated or dies.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, SpellZone } from '../../types.js';
import {
  NATURES_SANCTUARY_ID,
  sanctuaryCoverAc,
  sanctuaryResistance,
} from '../../services/druidFeatures.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyZoneTick,
  fireSpellZones,
  generateChoices,
  takeAction,
  zoneCells,
} from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const GOBLIN = `${CORRIDOR_ID}#0`;

const druid = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'druid',
    name: 'Druid',
    character_class: 'Druid',
    subclass: 'land',
    level: 14,
    class_levels: { druid: 14 },
    circle_land: 'arid', // Nature's Ward: Fire
    hp: 60,
    max_hp: 60,
    ...over,
  });

const ally = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    name: 'Ally',
    character_class: 'Wizard',
    level: 14,
    ac: 15,
    hp: 40,
    max_hp: 40,
    ...over,
  });

const fresh = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
};

const pcEnt = (c: Character, pos: { x: number; y: number }) => ({
  id: c.id,
  isEnemy: false,
  pos,
  hp: c.hp,
  maxHp: c.max_hp,
  conditions: [],
  condition_durations: {},
});

/** Druid at (1,2), ally at (4,2), goblin at (8,2). */
function fight(d: Character, a: Character, zones: SpellZone[] = []): GameState {
  return {
    ...makeState({ id: d.id }),
    characters: [d, a],
    active_character_id: d.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: d.id, roll: 20, is_enemy: false },
      { id: a.id, roll: 15, is_enemy: false },
      { id: GOBLIN, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      pcEnt(d, { x: 1, y: 2 }),
      pcEnt(a, { x: 4, y: 2 }),
      {
        id: GOBLIN,
        isEnemy: true,
        pos: { x: 8, y: 2 },
        hp: 500,
        maxHp: 500,
        conditions: [],
        condition_durations: {},
      },
    ],
    movement_used: {},
    spell_zones: zones,
  };
}

/** A standing cube owned by the Druid, centered on `center`. */
const cube = (center = { x: 4, y: 2 }): SpellZone => ({
  id: 'sanctuary-1',
  casterId: 'druid',
  spellId: NATURES_SANCTUARY_ID,
  name: "Nature's Sanctuary",
  roomId: CORRIDOR_ID,
  cells: zoneCells(center, 10, 12, 8),
  damage: '0',
  damageType: 'none',
  sanctuary: true,
  radiusFt: 10,
  center,
  rounds_left: 10,
});

const act = (state: GameState, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state, seed: seedWithEnemy, context: ctx });

const raise = (option?: string) => ({
  type: 'use_class_feature',
  featureId: 'natures_sanctuary',
  ...(option ? { option } : {}),
});

describe("Nature's Sanctuary — raising the cube", () => {
  it('spends a Wild Shape use and the action, centered on the chosen ally', async () => {
    const r = await act(fight(druid({ turn_actions: fresh }), ally()), raise('pc-1'));
    const d = r.newState.characters.find((c) => c.id === 'druid')!;
    const zone = r.newState.spell_zones?.find((z) => z.spellId === NATURES_SANCTUARY_ID);
    expect(zone?.center).toEqual({ x: 4, y: 2 });
    expect(zone?.cells).toHaveLength(9); // 15-ft cube = 3×3 squares
    expect(zone?.rounds_left).toBe(10);
    expect(d.class_resource_uses?.wild_shape).toBe(2); // 3 at L14, one spent
    expect(r.narrative).toMatch(/resist fire/);
  });

  it('requires a Land Druid of level 14 and a Wild Shape use', async () => {
    const low = await act(
      fight(druid({ level: 13, class_levels: { druid: 13 }, turn_actions: fresh }), ally()),
      raise()
    );
    expect(low.newState.spell_zones ?? []).toHaveLength(0);
    const empty = await act(
      fight(druid({ turn_actions: fresh, class_resource_uses: { wild_shape: 0 } }), ally()),
      raise()
    );
    expect(empty.newState.spell_zones ?? []).toHaveLength(0);
  });

  it('is offered in combat with a pick of party members', () => {
    const choice = generateChoices(
      fight(druid({ turn_actions: fresh }), ally()),
      seedWithEnemy,
      ctx
    ).find((c) => (c.action as { featureId?: string }).featureId === 'natures_sanctuary');
    expect(choice?.pickOption?.options.map((o) => o.id)).toEqual(['druid', 'pc-1']);
  });
});

describe("Nature's Sanctuary — cover and resistance", () => {
  it('gives Half Cover to PCs inside only', () => {
    const st = fight(druid(), ally(), [cube()]);
    expect(sanctuaryCoverAc(st, 'pc-1')).toBe(2);
    expect(sanctuaryCoverAc(st, 'druid')).toBe(0); // (1,2) is outside the cube
  });

  it('shares the Ward Resistance with allies, not the Druid itself', () => {
    const onAlly = fight(druid(), ally(), [cube()]);
    expect(sanctuaryResistance(onAlly, onAlly.characters[1])).toBe('fire');
    const onDruid = fight(druid(), ally(), [cube({ x: 1, y: 2 })]);
    expect(sanctuaryCoverAc(onDruid, 'druid')).toBe(2);
    expect(sanctuaryResistance(onDruid, onDruid.characters[0])).toBeNull();
  });

  it('stops working while the Druid is Incapacitated', () => {
    const st = fight(druid({ conditions: ['stunned'] }), ally(), [cube()]);
    expect(sanctuaryCoverAc(st, 'pc-1')).toBe(0);
  });

  it('deals no damage on a zone tick', () => {
    const st = fight(druid(), ally(), [cube()]);
    expect(applyZoneTick(st, cube(), seedWithEnemy, ctx).dealt).toBe(0);
  });

  it('fades at the round wrap once its Druid is Incapacitated', () => {
    const st = fight(druid({ conditions: ['unconscious'] }), ally(), [cube()]);
    expect(fireSpellZones(st, seedWithEnemy, ctx).st.spell_zones).toEqual([]);
  });
});

describe("Nature's Sanctuary — enemy attacks against an ally inside", () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5)); // d20 = 11

  const goblin = (toHit: number, damageType = 'slashing') =>
    ({
      id: GOBLIN,
      name: 'Goblin',
      hp: 50,
      ac: 10,
      toHit,
      damage: '20',
      damageType,
    }) as unknown as Enemy;

  const swing = (st: GameState, enemy: Enemy) => {
    const c = {
      actor: enemyActor(enemy),
      context: ctx,
      st,
      narrative: '',
    } as unknown as ActionContext;
    handleEnemyAttack(c, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    return c.enemySubAttack.target.hp;
  };

  it('Half Cover turns a 16-vs-AC-15 hit into a miss', () => {
    expect(swing(fight(druid(), ally()), goblin(5))).toBe(20); // control: hits
    expect(swing(fight(druid(), ally(), [cube()]), goblin(5))).toBe(40); // AC 17: misses
  });

  it('halves damage of the Ward type for the ally', () => {
    expect(swing(fight(druid(), ally(), [cube()]), goblin(100, 'fire'))).toBe(30);
    expect(swing(fight(druid(), ally(), [cube()]), goblin(100, 'cold'))).toBe(20);
  });
});

describe("Nature's Sanctuary — moving the cube", () => {
  it('moves up to 60 ft for a Bonus Action', async () => {
    const st = fight(druid({ turn_actions: fresh }), ally(), [cube()]);
    const r = await act(st, { type: 'move_zone', zoneId: 'sanctuary-1', to: { x: 1, y: 2 } });
    const zone = r.newState.spell_zones?.[0];
    expect(zone?.center).toEqual({ x: 1, y: 2 });
    expect(r.newState.characters[0].turn_actions.bonus_action_used).toBe(true);
    expect(r.newState.characters[0].turn_actions.action_used).toBe(false);
  });

  it('offers a move onto each party member in reach', () => {
    const st = fight(druid({ turn_actions: fresh }), ally(), [cube()]);
    const labels = generateChoices(st, seedWithEnemy, ctx).map((c) => c.label);
    expect(labels).toContain("Move Nature's Sanctuary to yourself (bonus action)");
  });
});
