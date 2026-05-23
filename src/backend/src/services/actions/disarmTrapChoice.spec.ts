// Regression spec for the "disarm trap loop" bug from the Whispering
// Pines log: player clicked Disarm Trap 4 times in a row during
// combat and got "you have already used your action this turn" each
// time. The choice surfaced from generateChoices even when the active
// PC's action was already spent.
//
// Cause: the trap-detection branch in generateChoices didn't gate on
// turn_actions.action_used. The action dispatcher's cost system
// rejects with the "already used" message, but the choice still
// appears in the list — so the player can spam-click.
//
// Fix: gate the trap choice on `!combat_active || !action_used`,
// same pattern as the Attack choice.

import type { GameState, Seed } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { generateChoices } from '../gameEngine.js';

const trapRoom = 'trap_room';
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Trap Choice Test',
  ship_name: 'Trap Choice Test',
  intro: '',
  seed_id: 'trap-choice',
  rooms: [
    {
      id: trapRoom,
      name: 'Trap Room',
      desc: 'Pressure plate visible.',
      trap: {
        id: 'pressure_plate',
        name: 'Pressure Plate',
        desc: 'A subtle plate flush with the floor.',
        dc: 8, // both detect + disarm; low so passive Perception detects
        damage: '1d4',
        damageType: 'piercing',
        triggerNarrative: 'The trap fires!',
        detectNarrative: 'You spot the plate.',
        disarmSuccess: 'You disarm it.',
        disarmFail: 'You slip.',
      },
    },
  ],
  connections: { [trapRoom]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(opts: { actionUsed: boolean; combatActive: boolean }): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    level: 3,
    dex: 14,
    wis: 14, // passive perception 10 + 2 + 2 = 14 > detectionDc 8
    skill_proficiencies: ['Perception'],
    tool_proficiencies: ["Thieves' Tools"],
    turn_actions: {
      action_used: opts.actionUsed,
      bonus_action_used: false,
      reaction_used: false,
      free_interaction_used: false,
    },
  });
  return {
    ...makeState({ id: pc.id }, { current_room: trapRoom, combat_active: opts.combatActive }),
    characters: [pc],
    active_character_id: pc.id,
  };
}

describe('Disarm Trap choice — gate on action_used', () => {
  it('out of combat: choice surfaces (action_used unenforced)', () => {
    const state = buildState({ actionUsed: false, combatActive: false });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.find((c) => c.label.includes('Disarm Trap'))).toBeDefined();
  });

  it('combat active + action NOT used: choice surfaces', () => {
    const state = buildState({ actionUsed: false, combatActive: true });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.find((c) => c.label.includes('Disarm Trap'))).toBeDefined();
  });

  it('combat active + action ALREADY used: choice is HIDDEN', () => {
    // Regression case — Whispering Pines log turns 51-54.
    const state = buildState({ actionUsed: true, combatActive: true });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.find((c) => c.label.includes('Disarm Trap'))).toBeUndefined();
  });

  it('out of combat with action_used stuck true: choice still surfaces', () => {
    // Defensive — action_used out of combat doesn't actually gate
    // anything functionally, so the choice should remain available
    // (otherwise stale action_used flags would lock out trap
    // interactions between fights).
    const state = buildState({ actionUsed: true, combatActive: false });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.find((c) => c.label.includes('Disarm Trap'))).toBeDefined();
  });
});
