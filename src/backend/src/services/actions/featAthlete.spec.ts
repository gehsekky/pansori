// Athlete (2024 PHB general feat, L4 half-feat). +1 STR or DEX
// + stand-from-prone costs only 5 ft (instead of half speed).
// Climbing/swimming speed benefit not modeled (no movement modes).

import { applyFeatTake, getFeat } from '../feats.js';
import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Athlete Test',
  ship_name: 'Athlete Test',
  intro: '',
  seed_id: 'athlete-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildPronePc(feats: string[]) {
  const pc = makeChar({
    id: 'pc-1',
    speed: 30,
    feats,
    conditions: ['prone'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: ['prone'],
        condition_durations: {},
      },
    ],
    movement_used: { 'pc-1': 0 },
  };
}

describe('Athlete — stand-up cost', () => {
  it('without Athlete: stand_up costs half speed (15 ft of 30)', async () => {
    const state = buildPronePc([]);
    const result = await takeAction({
      action: { type: 'stand_up' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/15 ft of movement used/);
  });

  it('with Athlete: stand_up costs only 5 ft', async () => {
    const state = buildPronePc(['athlete']);
    const result = await takeAction({
      action: { type: 'stand_up' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/5 ft of movement used/);
    expect(result.narrative).not.toMatch(/15 ft of movement used/);
  });

  it('take-time: +1 ability + narrative', () => {
    const char = makeChar({ id: 'pc-1', str: 14, feats: [] });
    const feat = getFeat('athlete', ctx);
    if (!feat) throw new Error('athlete missing');
    const { newChar, narrative } = applyFeatTake(char, feat, { abilityChoice: 'str' });
    expect(newChar.feats).toContain('athlete');
    expect(newChar.str).toBe(15);
    expect(narrative).toMatch(/Standing up from prone costs only 5 ft/);
  });
});
