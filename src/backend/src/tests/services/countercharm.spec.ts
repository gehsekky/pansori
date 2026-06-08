// RE-2 — Countercharm (SRD 5.2.1, Bard L7): when a creature within 30 ft fails
// a save against an effect applying Charmed or Frightened, the bard may use a
// Reaction to make that creature reroll with Advantage. Now INTERACTIVE: the
// failed save lands the condition and opens a `save_reroll` reaction window
// (pending_reaction) for a qualifying bard (self or ally); the player chooses
// whether to spend the reaction. Resolution (accept/decline) is covered in
// saveRerollReaction.spec.ts; here we cover canCountercharm + the window open.

import type { Character, Enemy } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import { canCountercharm } from '../../services/multiclass.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { makeChar } from '../../test-fixtures.js';
import { context as sandboxCtx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

describe('canCountercharm', () => {
  it('is available to a Bard L7 with a reaction left', () => {
    expect(canCountercharm(makeChar({ character_class: 'Bard', level: 7 }))).toBe(true);
  });

  it('is unavailable below L7, with the reaction spent, or while incapacitated', () => {
    expect(canCountercharm(makeChar({ character_class: 'Bard', level: 6 }))).toBe(false);
    expect(canCountercharm(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(false);
    expect(
      canCountercharm(
        makeChar({
          character_class: 'Bard',
          level: 7,
          turn_actions: {
            action_used: false,
            bonus_action_used: false,
            reaction_used: true,
            free_interaction_used: false,
          },
        })
      )
    ).toBe(false);
    expect(
      canCountercharm(makeChar({ character_class: 'Bard', level: 7, conditions: ['stunned'] }))
    ).toBe(false);
  });
});

// Auto-hit (toHit 100) flat-damage (1, no dice) wraith that applies Frightened
// on a WIS save. DC 15 — a WIS-10, non-proficient saver fails on a low roll.
const wraith = {
  id: 'wraith',
  name: 'Wraith',
  hp: 30,
  ac: 10,
  toHit: 100,
  damage: '1',
  damageType: 'necrotic',
  onHitEffect: { condition: 'frightened', ability: 'wis', dc: 15 },
} as unknown as Enemy;

function ctxFor(characters: Character[]): ActionContext {
  return {
    actor: enemyActor(wraith),
    context: sandboxCtx,
    st: { characters, entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

// Pin the first three d20-consuming draws: enemy attack roll, the narrative
// pick(), and the original (failing) WIS save. The Countercharm reroll then
// draws from the 0.99 default → a 20 → passes with Advantage.
function pinFailingSave() {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
}

const saver = (over = {}) =>
  makeChar({ id: 'pc-1', species: 'human', wis: 10, hp: 30, max_hp: 30, ...over });

describe('Countercharm — opens a save_reroll window on a failed Charmed/Frightened save', () => {
  it('self: a Bard L7 failing the save opens the window (reaction not yet spent)', () => {
    pinFailingSave();
    const bard = saver({ character_class: 'Bard', level: 7 });
    const ctx = ctxFor([bard]);
    handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    expect(ctx.enemySubAttack?.outcome).toBe('paused');
    const rx = ctx.st.pending_reaction;
    expect(rx?.kind).toBe('save_reroll');
    if (rx?.kind !== 'save_reroll') throw new Error('expected save_reroll');
    expect(rx.source).toBe('countercharm');
    expect(rx.condition).toBe('frightened');
    expect(rx.reactorCharId).toBe('pc-1');
    expect(rx.rerollSucceeds).toBe(true); // the advantaged reroll (0.99) would pass
    // The condition is committed (the player hasn't decided yet) and the
    // reaction is NOT pre-spent — that happens on accept.
    expect(ctx.st.characters[0].conditions).toContain('frightened');
    expect(ctx.st.characters[0].turn_actions.reaction_used).toBe(false);
    expect(ctx.narrative).toContain('Countercharm');
  });

  it('ally: a Bard L7 nearby a frightened non-bard becomes the reactor', () => {
    pinFailingSave();
    const fighter = saver({ id: 'fighter', character_class: 'Fighter', level: 1 });
    const bard = makeChar({ id: 'bard', character_class: 'Bard', level: 7, species: 'human' });
    const ctx = ctxFor([fighter, bard]);
    handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'fighter',
      advIdx: 0,
      multiattackIdx: 0,
    });
    expect(ctx.enemySubAttack?.outcome).toBe('paused');
    const rx = ctx.st.pending_reaction;
    if (rx?.kind !== 'save_reroll') throw new Error('expected save_reroll');
    expect(rx.source).toBe('countercharm');
    expect(rx.targetCharId).toBe('fighter'); // the frightened holder
    expect(rx.reactorCharId).toBe('bard'); // the ally bard reacts
  });

  it('control: a Bard L6 has no Countercharm — the save sticks', () => {
    pinFailingSave();
    const bard = saver({ character_class: 'Bard', level: 6 });
    const ctx = ctxFor([bard]);
    handleEnemyAttack(ctx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    if (ctx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    expect(ctx.enemySubAttack.target.conditions).toContain('frightened');
    expect(ctx.narrative).not.toContain('Countercharm');
  });
});
