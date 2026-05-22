// 2024 PHB Aasimar Celestial Revelation (L3+).
//
// Bonus Action, 1/long rest. Transforms the Aasimar for 1 minute
// (10 rounds in pansori). Player picks one of three sub-options
// at use time:
//   - **Necrotic Shroud**: once per turn, a melee weapon hit adds
//     +prof necrotic damage.
//   - **Radiant Soul**: same, +prof radiant; RAW also grants fly
//     speed = walking (movement modes not modeled — skip).
//   - **Radiant Consumption**: same +prof radiant rider; RAW also
//     deals +prof radiant to creatures within 10 ft at the start
//     of each of your turns (AoE aura — deferred).
//
// Gating:
//   - Combat must be active.
//   - PC must be Aasimar.
//   - PC must be L3+.
//   - `class_resource_uses.celestial_revelation_used` must be falsy.
//   - Bonus action must be available.
//
// On use:
//   - Set `char.celestial_revelation_variant` to the picked variant.
//   - Set `class_resource_uses.celestial_revelation_used = 1`.
//   - Set `class_resource_uses.celestial_revelation_rounds = 10`.
//   - Consume bonus action.
//
// Rider on attack: attack handler reads char.celestial_revelation_variant
// (and turn_actions.celestial_revelation_rider_used) to add prof
// bonus damage of the matching type once per turn.
//
// Long-rest reset is wired alongside healing_hands_used.

import type { ActionHandler } from './types.js';

export const handleCelestialRevelation: ActionHandler<{
  type: 'use_celestial_revelation';
  variant: 'necrotic_shroud' | 'radiant_soul' | 'radiant_consumption';
}> = (ctx, action) => {
  if (ctx.char.species !== 'aasimar') {
    return { rejected: 'Celestial Revelation is an Aasimar species feature.' };
  }
  if ((ctx.char.level ?? 1) < 3) {
    return { rejected: 'Celestial Revelation unlocks at level 3.' };
  }
  if ((ctx.char.class_resource_uses?.celestial_revelation_used ?? 0) > 0) {
    return {
      rejected: 'Celestial Revelation already used — recovers on a long rest.',
    };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }

  const labels: Record<typeof action.variant, string> = {
    necrotic_shroud: 'Necrotic Shroud — shadowy wings unfurl, eyes blacken',
    radiant_soul: 'Radiant Soul — golden wings spread, eyes blaze',
    radiant_consumption: 'Radiant Consumption — searing light pours from your form',
  };
  const damageType = action.variant === 'necrotic_shroud' ? 'necrotic' : 'radiant';

  ctx.char = {
    ...ctx.char,
    celestial_revelation_variant: action.variant,
    turn_actions: { ...ctx.char.turn_actions, bonus_action_used: true },
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      celestial_revelation_used: 1,
      celestial_revelation_rounds: 10,
    },
  };
  ctx.usedInitiative = true;
  ctx.narrative = `${ctx.char.name} — Celestial Revelation: ${labels[action.variant]}! For 1 minute, a melee weapon hit deals +prof ${damageType} damage (once per turn).`;
};
