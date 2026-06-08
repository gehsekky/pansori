import { ACTION_COSTS, checkBudget, deductCost } from '../../../src/services/actions/cost.js';
import { describe, expect, it } from 'vitest';
import { makeChar as fixtureChar } from '../../../src/test-fixtures.js';

describe('checkBudget', () => {
  it("'managed' is always permitted (no enforcement)", () => {
    const char = fixtureChar({
      turn_actions: {
        action_used: true,
        bonus_action_used: true,
        reaction_used: true,
        free_interaction_used: true,
      },
    });
    expect(checkBudget(char, 'managed')).toBeNull();
  });

  it("'action' rejects when action_used is true", () => {
    const char = fixtureChar({
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    expect(checkBudget(char, 'action')).toBe('You have already used your action this turn.');
  });

  it("'action' permits when action_used is false", () => {
    expect(checkBudget(fixtureChar(), 'action')).toBeNull();
  });

  it("'bonusAction' rejects when bonus_action_used is true", () => {
    const char = fixtureChar({
      turn_actions: {
        action_used: false,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    expect(checkBudget(char, 'bonusAction')).toBe(
      'You have already used your bonus action this turn.'
    );
  });

  it("'reaction' rejects when reaction_used is true", () => {
    const char = fixtureChar({
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: true,
        free_interaction_used: false,
      },
    });
    expect(checkBudget(char, 'reaction')).toBe('You have already used your reaction this turn.');
  });
});

describe('deductCost', () => {
  it("'managed' is identity (no mutation)", () => {
    const char = fixtureChar();
    expect(deductCost(char, 'managed')).toBe(char);
  });

  it("'action' sets action_used: true", () => {
    const char = fixtureChar();
    const next = deductCost(char, 'action');
    expect(next.turn_actions.action_used).toBe(true);
    expect(next.turn_actions.bonus_action_used).toBe(false); // others untouched
  });

  it("'bonusAction' sets bonus_action_used: true", () => {
    const char = fixtureChar();
    const next = deductCost(char, 'bonusAction');
    expect(next.turn_actions.bonus_action_used).toBe(true);
    expect(next.turn_actions.action_used).toBe(false);
  });

  it("'reaction' sets reaction_used: true", () => {
    const char = fixtureChar();
    const next = deductCost(char, 'reaction');
    expect(next.turn_actions.reaction_used).toBe(true);
  });

  it('returns a new Character object (no in-place mutation)', () => {
    const char = fixtureChar();
    const next = deductCost(char, 'action');
    expect(next).not.toBe(char);
    expect(char.turn_actions.action_used).toBe(false); // original untouched
  });
});

describe('ACTION_COSTS map', () => {
  it("declares 'action' cost for dodge / disengage / dash / help / ready", () => {
    expect(ACTION_COSTS.dodge).toBe('action');
    expect(ACTION_COSTS.disengage).toBe('action');
    expect(ACTION_COSTS.dash).toBe('action');
    expect(ACTION_COSTS.help).toBe('action');
    expect(ACTION_COSTS.ready).toBe('action');
  });

  it("declares 'reaction' cost for use_reaction", () => {
    expect(ACTION_COSTS.use_reaction).toBe('reaction');
  });

  it("keeps variable-cost handlers as 'managed'", () => {
    expect(ACTION_COSTS.attack).toBe('managed');
    expect(ACTION_COSTS.cast_spell).toBe('managed');
    expect(ACTION_COSTS.use_class_feature).toBe('managed');
    expect(ACTION_COSTS.two_weapon_attack).toBe('managed');
  });
});
