import type { Character, Enemy } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../services/actions/actor.js';
import {
  handleBuy,
  handleInfluence,
  handleStudy,
  handleTalk,
  handleTalkResponse,
} from '../../../services/actions/social.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { handleInteractObject } from '../../../services/actions/interactObject.js';
import { makeChar } from '../../../test-fixtures.js';

// Phase-3 actor migration (social + interactObject): these PC-only
// handlers now read/write through `ctx.actor` (narrowed to PC) and
// reject non-PC actors — the Phase-4 enemy-action seam. PC behavior
// stays covered by the full suite; here we exercise the guard.

const enemy = { id: 'orc-1', name: 'Orc' } as unknown as Enemy;

function ctxWith(
  actor: ReturnType<typeof pcActor> | ReturnType<typeof enemyActor>,
  char: Character
) {
  return {
    char,
    actor,
    st: { combat_active: false, characters: [char] },
    seed: {},
    roomId: 'room-1',
    livingEnemiesInRoom: [],
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('social + interactObject handlers reject non-PC actors (Phase-4 seam)', () => {
  const cases: Array<[string, (ctx: ActionContext) => unknown]> = [
    ['talk', (ctx) => handleTalk(ctx, { type: 'talk', npcId: 'x' })],
    ['talk_response', (ctx) => handleTalkResponse(ctx, { type: 'talk_response', responseId: 'x' })],
    ['buy', (ctx) => handleBuy(ctx, { type: 'buy', itemId: 'x', price: 5 })],
    ['influence', (ctx) => handleInfluence(ctx, { type: 'influence', skill: 'persuasion' })],
    ['study', (ctx) => handleStudy(ctx, { type: 'study', skill: 'arcana' })],
    [
      'interact_object',
      (ctx) => handleInteractObject(ctx, { type: 'interact_object', objectId: 'o1' }),
    ],
  ];

  it.each(cases)('%s returns { rejected } for an enemy actor', (_name, call) => {
    const char = makeChar({ id: 'pc-1' });
    expect(call(ctxWith(enemyActor(enemy), char))).toMatchObject({
      rejected: expect.stringContaining('PC'),
    });
  });
});
