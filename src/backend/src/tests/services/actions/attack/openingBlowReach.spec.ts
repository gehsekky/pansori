// Regression spec for the "opening blow ignores distance" bug surfaced in an
// adventure log: the party entered a room and damaged creatures on the far side
// without closing in. Cause: on the FIRST attack of an encounter the grid
// entities don't exist yet when runPreattack's range check runs (they're seeded
// inside runCombatStart), so the opening swing landed regardless of reach.
//
// Fix: runCombatStart reach-gates the opening blow against the freshly-seeded
// grid. Out of reach → combat still begins (initiative rolled, tokens placed)
// but the blow is withheld and the PC keeps their turn to close the distance.

import type { GameState, Seed } from '../../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, withAdjacentEntities } from '../../../../test-fixtures.js';
import { context as ctx } from '../../../../campaignData/sandbox.js';
import { takeAction } from '../../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Opening Blow Reach Test',
  ship_name: 'Opening Blow Reach Test',
  intro: '',
  seed_id: 'opening-blow-reach',
  rooms: [{ id: 'entry_hall', name: 'Glade', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: enemyId, name: 'Sprite', hp: 12, ac: 5, damage: '1d4', toHit: 2, xp: 25 },
    ],
  },
  loot: {},
  npcs: {},
};

function freshRoomState(): GameState {
  // "Just walked into the room": no combat, no initiative, no entities — so the
  // grid is seeded fresh (PC front-left, enemy back wall, ~25 ft apart).
  const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 1, str: 16 });
  return {
    ...makeState({ id: pc.id }, { current_room: 'entry_hall', combat_active: false }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [],
    initiative_idx: 0,
    entities: undefined,
  };
}

describe('opening-blow reach gate', () => {
  it('withholds the opening blow when the target is out of melee reach (fresh seed)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // would hit if it connected
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: freshRoomState(),
      seed,
      context: ctx,
    });
    // Combat began…
    expect(result.newState.combat_active).toBe(true);
    expect(result.newState.entities?.some((e) => e.id === enemyId)).toBe(true);
    // …but the blow didn't land: the Sprite is unharmed and not killed.
    expect(result.newState.enemies_killed).not.toContain(enemyId);
    const enemyEnt = result.newState.entities?.find((e) => e.id === enemyId);
    expect(enemyEnt?.hp).toBe(12);
    expect(result.narrative).toMatch(/close the distance/i);
    // The PC keeps their action (so they can move + strike this turn).
    expect(result.newState.characters[0].turn_actions.action_used).toBeFalsy();
  });

  it('lands the opening blow when the PC is already within reach (adjacent)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hit + high damage
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      // PC adjacent to the Sprite (1 HP) → the opening blow connects and kills.
      state: withAdjacentEntities(freshRoomState(), enemyId, { enemyHp: 1 }),
      seed,
      context: ctx,
    });
    // The blow connected and killed the lone Sprite — which also ends combat.
    expect(result.newState.enemies_killed).toContain(enemyId);
    expect(result.newState.combat_active).toBe(false);
    expect(result.narrative).not.toMatch(/close the distance/i);
  });
});
