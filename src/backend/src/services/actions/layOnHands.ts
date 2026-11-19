import { getClassLevel, layOnHandsRemaining } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import type { Character } from '../../types.js';
import { fmt } from '../narrativeFmt.js';
import { layOnHandsCurable } from '../paladinFeatures.js';
import { updatePcActor } from './actor.js';

/**
 * `lay_on_hands` (SRD 5.2.1 Paladin L1): touch a party member (or self) and
 * draw from the healing pool (5 × Paladin level HP, replenished on a long
 * rest) to restore HP. Heals the lesser of the target's missing HP and the
 * remaining pool, spending only what's used. A bonus action in combat
 * (self-managed so it stays usable out of combat); the pool is tracked as
 * points spent on `class_resource_uses.lay_on_hands`. With `cure`, spends a
 * flat 5 points to end the Poisoned condition (or, from L14 with Restoring
 * Touch, Blinded / Charmed / Deafened / Frightened / Paralyzed / Stunned)
 * instead of restoring HP (SRD: those points don't also restore Hit Points).
 * (RE-2.)
 */
// SRD: Lay On Hands — a flat 5 pool points ends Poisoned (and, with Restoring
// Touch, each of its conditions).
const LAY_ON_HANDS_CURE_COST = 5;

/** The condition fields a cure clears: the tag, its duration, its source. */
function withoutCondition(c: Character, condition: string): Partial<Character> {
  const durations = { ...(c.condition_durations ?? {}) };
  delete durations[condition];
  const sources = { ...(c.condition_sources ?? {}) };
  delete sources[condition];
  return {
    conditions: (c.conditions ?? []).filter((x) => x !== condition),
    condition_durations: durations,
    condition_sources: sources,
    ...(condition === 'charmed' ? { charmer_id: undefined } : {}),
  };
}

export const handleLayOnHands: ActionHandler<{
  type: 'lay_on_hands';
  targetCharId: string;
  cure?: boolean;
  condition?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can use Lay on Hands.' };
  const { char } = ctx.actor;
  if (getClassLevel(char, 'paladin') < 1) {
    return { rejected: 'Only Paladins have Lay on Hands.' };
  }
  if (ctx.st.combat_active && char.turn_actions.bonus_action_used) {
    ctx.narrative = 'Bonus action already used this turn.';
    return;
  }
  const remaining = layOnHandsRemaining(char);
  if (remaining <= 0) {
    ctx.narrative = 'Your Lay on Hands pool is empty (recovers on a long rest).';
    return;
  }

  // Cure branch: a flat 5 points ends one condition and restores no HP —
  // Poisoned, or (SRD Restoring Touch, L14) one of six more.
  if (action.cure) {
    const condition = action.condition ?? 'poisoned';
    if (!layOnHandsCurable(char).includes(condition)) {
      return { rejected: `Lay on Hands can't end ${condition} at your level.` };
    }
    if (remaining < LAY_ON_HANDS_CURE_COST) {
      ctx.narrative = `Ending a condition costs ${LAY_ON_HANDS_CURE_COST} HP from the pool — only ${remaining} left.`;
      return;
    }
    const target = ctx.st.characters.find((c) => c.id === action.targetCharId && !c.dead);
    if (!target) return { rejected: 'No such ally to cure.' };
    const label = condition.charAt(0).toUpperCase() + condition.slice(1);
    if (!(target.conditions ?? []).includes(condition)) {
      ctx.narrative = `${target.id === char.id ? 'You are' : `${target.name} is`} not ${label}.`;
      return;
    }
    const isSelf = target.id === char.id;
    const cured = withoutCondition(target, condition);

    const casterPatch: Partial<Character> = {
      class_resource_uses: {
        ...char.class_resource_uses,
        lay_on_hands: (char.class_resource_uses?.lay_on_hands ?? 0) + LAY_ON_HANDS_CURE_COST,
      },
    };
    if (ctx.st.combat_active) {
      casterPatch.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    }
    if (isSelf) Object.assign(casterPatch, cured);
    updatePcActor(ctx, casterPatch);

    if (!isSelf) {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) => (c.id === target.id ? { ...c, ...cured } : c)),
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === target.id && !e.isEnemy
            ? { ...e, conditions: e.conditions.filter((c) => c !== condition) }
            : e
        ),
      };
    }

    const who = isSelf ? 'themselves' : target.name;
    const verb =
      condition === 'poisoned'
        ? `draws the poison out of ${who} — the Poisoned condition ends`
        : `lays on hands — ${who} is no longer ${label} (Restoring Touch)`;
    ctx.narrative = `${char.name} ${verb}. (${remaining - LAY_ON_HANDS_CURE_COST} HP left in the pool)`;
    return;
  }

  const target = ctx.st.characters.find((c) => c.id === action.targetCharId && !c.dead);
  if (!target) return { rejected: 'No such ally to heal.' };
  const missing = target.max_hp - target.hp;
  if (missing <= 0) {
    ctx.narrative = `${target.name} is already at full Hit Points.`;
    return;
  }

  const heal = Math.min(missing, remaining);
  const newHp = target.hp + heal;
  const isSelf = target.id === char.id;

  // Caster bookkeeping: spend the pool + (in combat) the bonus action, and
  // the HP when healing self. commitChar() in the epilogue syncs the caster
  // + their grid entity; an ally is synced into st below.
  const casterPatch: Partial<Character> = {
    class_resource_uses: {
      ...char.class_resource_uses,
      lay_on_hands: (char.class_resource_uses?.lay_on_hands ?? 0) + heal,
    },
  };
  if (ctx.st.combat_active) {
    casterPatch.turn_actions = { ...char.turn_actions, bonus_action_used: true };
  }
  if (isSelf) casterPatch.hp = newHp;
  updatePcActor(ctx, casterPatch);

  if (!isSelf) {
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) => (c.id === target.id ? { ...c, hp: newHp } : c)),
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
      ),
    };
  }

  const who = isSelf ? 'themselves' : target.name;
  ctx.narrative = `${char.name} lays on hands — ${fmt.hp(heal)} HP restored to ${who} (now ${fmt.hp(newHp, target.max_hp)}). (${remaining - heal} HP left in the pool)`;
};
