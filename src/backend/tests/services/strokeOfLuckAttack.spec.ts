// RE-2 — Stroke of Luck (SRD 5.2.1, Rogue L20) on the attack-roll D20 Test. A
// missed first attack now opens an *interactive* reaction window (alongside
// Heroic Inspiration): accepting Stroke of Luck turns the miss into a natural
// 20 (auto-hit + critical) and spends the once-per-rest use; declining keeps
// the miss + the use. Wired via the pc_d20 pending_reaction; the helper +
// save/check hooks are covered in strokeOfLuck.spec.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeEnemy, makeState } from '../../src/test-fixtures.js';
import type { Seed } from '../../src/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
// AC 25 so the Rogue's d20 → 5 attack (total well under 25) always misses; only
// a natural 20 lands. Big HP so the crit doesn't end the fight.
const seedWithWall: Seed = {
  context_id: ctx.id,
  world_name: 'Stroke of Luck Test',
  ship_name: 'Stroke of Luck Test',
  intro: '',
  seed_id: 'sol-attack',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [makeEnemy({ id: enemyId, name: 'Iron Golem', hp: 200, ac: 25, toHit: 3 })],
  },
  loot: {},
  npcs: {},
};

function rogue20(over = {}) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    level: 20,
    dex: 16,
    hp: 40,
    max_hp: 40,
    inventory: [{ instance_id: 'dg-1', id: 'dagger', name: 'Dagger' }],
    equipment: { main_hand: 'dg-1' },
    weapon_proficiencies: ['simple', 'martial'],
    ...over,
  });
}

function buildCombatState(char: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Stroke of Luck — attack roll (interactive)', () => {
  it('a missed attack opens a reaction window without auto-spending the use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2); // every d20 → 5: a miss vs AC 25
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildCombatState(rogue20()),
      seed: seedWithWall,
      context: ctx,
    });
    // Paused, not auto-converted: the use is unspent + the Golem untouched.
    expect(r.newState.pending_reaction?.kind).toBe('pc_d20');
    expect(r.newState.characters[0].class_resource_uses.stroke_of_luck ?? 0).toBe(0);
    expect(r.newState.entities?.find((e) => e.id === enemyId)?.hp).toBe(200);
    // The window surfaces a Stroke of Luck choice.
    const choices = generateChoices(r.newState, seedWithWall, ctx);
    const strokeChoice = choices.find(
      (c) => c.action.type === 'resolve_reaction' && c.action.source === 'stroke_of_luck'
    );
    expect(strokeChoice).toBeTruthy();
  });

  it('accepting Stroke of Luck forces a natural-20 crit and spends the use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const paused = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildCombatState(rogue20()),
      seed: seedWithWall,
      context: ctx,
    });
    const r = await takeAction({
      action: { type: 'resolve_reaction', accept: true, source: 'stroke_of_luck' },
      history: [],
      state: paused.newState,
      seed: seedWithWall,
      context: ctx,
    });
    expect(r.narrative).toContain('Stroke of Luck');
    expect(r.newState.characters[0].class_resource_uses.stroke_of_luck).toBe(1);
    expect(r.newState.pending_reaction).toBeUndefined();
    const golem = r.newState.entities?.find((e) => e.id === enemyId);
    expect(golem && golem.hp < 200).toBe(true); // took crit damage
  });

  it('declining keeps the miss and retains the use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const paused = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildCombatState(rogue20()),
      seed: seedWithWall,
      context: ctx,
    });
    const r = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state: paused.newState,
      seed: seedWithWall,
      context: ctx,
    });
    expect(r.newState.characters[0].class_resource_uses.stroke_of_luck ?? 0).toBe(0); // unspent
    expect(r.newState.entities?.find((e) => e.id === enemyId)?.hp).toBe(200); // still a miss
  });

  it('a Rogue L19 simply misses (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildCombatState(rogue20({ level: 19 })),
      seed: seedWithWall,
      context: ctx,
    });
    expect(r.narrative).not.toContain('Stroke of Luck');
    expect(r.newState.characters[0].class_resource_uses.stroke_of_luck ?? 0).toBe(0);
    const golem = r.newState.entities?.find((e) => e.id === enemyId);
    expect(golem?.hp).toBe(200); // untouched
  });
});
