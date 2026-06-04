// Regression: the `step_talk_elise` world rule must scope to Old Elise, not the
// whole room. Pinegate Square also hosts Bram the Woodcutter; talking to him
// must NOT fire the rule (which hands over the Silent Grove quest). The rule
// keys on the `npc_id` fact (the active conversation's NPC) supplied to runRules.

import type { Seed, StructuredAction } from '../types.js';
import { describe, expect, it } from 'vitest';
import { generateSeed } from './procgen.js';
import { makeState } from '../test-fixtures.js';
import { runRules } from './gameEngine.js';
import { context as vale } from '../campaignData/malgovia/index.js';

const seed: Seed = generateSeed(vale);
const talk: StructuredAction = { type: 'talk_response', responseIdx: 0 };

// A party standing in Pinegate Square, mid-conversation with `npcId`.
function stateTalkingTo(npcId: string) {
  return makeState(
    { id: 'pc-1' },
    {
      current_room: 'pinegate_square',
      flags: {},
      active_conversation: { npcId, roomId: 'pinegate_square', path: [], prompt: '' },
    }
  );
}

describe('step_talk_elise rule — scoped to Old Elise, not the room', () => {
  it('fires (sets the flag) when talking to Old Elise', async () => {
    const { state } = await runRules(
      stateTalkingTo('npc_elise_elder'),
      vale,
      talk,
      'pinegate_square',
      seed
    );
    expect(state.flags.rule_fired_step_talk_elise).toBe(true);
  });

  it('does NOT fire when talking to Bram the Woodcutter in the same square', async () => {
    const { state } = await runRules(
      stateTalkingTo('npc_bram_woodcutter'),
      vale,
      talk,
      'pinegate_square',
      seed
    );
    expect(state.flags.rule_fired_step_talk_elise).toBeFalsy();
  });
});
