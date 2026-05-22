import type { ActionHandler } from './types.js';
import { effectiveSpeed } from '../gameEngine.js';
import { updatePcActor } from './actor.js';

/**
 * `spend_inspiration`: queue Heroic Inspiration to grant advantage on
 * the next d20 test (2024 PHB — applies to any check, not just
 * attacks). Costs nothing if no inspiration is held; idempotent if
 * already queued.
 */
export const handleSpendInspiration: ActionHandler<{ type: 'spend_inspiration' }> = (ctx) => {
  if (!ctx.char.inspiration) {
    ctx.narrative = 'You have no Heroic Inspiration to spend.';
    return;
  }
  if (ctx.char.turn_actions.inspiration_pending) {
    ctx.narrative = 'Inspiration already queued for your next d20 roll.';
    return;
  }
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, inspiration_pending: true },
  };
  ctx.narrative = `${ctx.char.name} steels themselves — Heroic Inspiration queued: advantage on your next d20 (attack, save, or check).`;
};

/**
 * `use_luck`: spend one Lucky feat point (2024 PHB Chapter 5) to queue
 * advantage on the next PC attack roll. Mirrors the `spend_inspiration`
 * shape — sets `turn_actions.luck_pending` which `attack/toHit.ts`
 * consumes as an advantage source. Costs no action-economy slot.
 *
 * RAW the spend window is AFTER the d20 result is known; pansori's
 * MVP shifts it to BEFORE the roll (simpler, mirrors Heroic
 * Inspiration). The player's tactical choice still has teeth —
 * spend pre-roll on a tough swing — without requiring a pending-
 * reaction pause on every PC d20.
 *
 * Saves + ability checks not yet hooked; this PR covers attack
 * rolls only. Follow-ups will thread the flag through `skillCheck`
 * + save-roll callers.
 */
export const handleUseLuck: ActionHandler<{ type: 'use_luck' }> = (ctx) => {
  if (!(ctx.char.feats ?? []).includes('lucky')) {
    return { rejected: `${ctx.char.name} does not have the Lucky feat.` };
  }
  const remaining = ctx.char.class_resource_uses?.feat_lucky_uses ?? 0;
  if (remaining <= 0) {
    return { rejected: `${ctx.char.name} has no luck points remaining (refresh on long rest).` };
  }
  if (ctx.char.turn_actions.luck_pending) {
    return { rejected: 'Luck already queued for your next d20 roll.' };
  }
  ctx.char = {
    ...ctx.char,
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      feat_lucky_uses: remaining - 1,
    },
    turn_actions: { ...ctx.char.turn_actions, luck_pending: true },
  };
  const left = remaining - 1;
  ctx.narrative = `${ctx.char.name} spends a luck point — advantage on your next attack. (${left} luck point${left === 1 ? '' : 's'} left.)`;
};

/**
 * `toggle_sharpshooter`: opt in to the Sharpshooter feat's tradeoff
 * for ranged-weapon attacks this turn — -5 to hit, +10 damage,
 * ignore half + three-quarters cover. Toggles state (calling again
 * turns it off). Free of action-economy cost. Auto-clears on turn
 * end via the FRESH_TURN reset.
 *
 * The effect gates on `weaponItem.range === 'ranged'` at attack
 * time — toggling on with a melee weapon equipped is harmless
 * (handler-side check would conflict with mid-turn weapon swaps).
 */
export const handleToggleSharpshooter: ActionHandler<{ type: 'toggle_sharpshooter' }> = (ctx) => {
  if (!(ctx.char.feats ?? []).includes('sharpshooter')) {
    return { rejected: `${ctx.char.name} does not have the Sharpshooter feat.` };
  }
  const next = !ctx.char.turn_actions.sharpshooter_active;
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, sharpshooter_active: next },
  };
  ctx.narrative = next
    ? `${ctx.char.name} sights down the shaft — Sharpshooter armed: -5 to hit, +10 damage on ranged attacks this turn.`
    : `${ctx.char.name} eases off the precision shot — Sharpshooter disengaged.`;
};

/**
 * `stand_up`: spend half-speed of movement to drop prone. PHB p.190 —
 * "Standing up takes more effort; doing so costs an amount of movement
 * equal to half your speed." Guarded by remaining movement budget so a
 * mid-turn stand-up after a partial move can't exceed the cap.
 */
export const handleStandUp: ActionHandler<{ type: 'stand_up' }> = (ctx) => {
  if (!ctx.char.conditions.includes('prone')) {
    ctx.narrative = 'You are not prone.';
    return;
  }
  const speedFt = effectiveSpeed(ctx.char);
  const standCost = Math.floor(speedFt / 2);
  const usedFt = (ctx.st.movement_used ?? {})[ctx.char.id] ?? 0;
  if (usedFt + standCost > speedFt) {
    ctx.narrative = `Not enough movement to stand up. (${speedFt - usedFt} ft remaining, ${standCost} ft needed)`;
    return;
  }
  ctx.char = { ...ctx.char, conditions: ctx.char.conditions.filter((c) => c !== 'prone') };
  ctx.st = {
    ...ctx.st,
    movement_used: { ...ctx.st.movement_used, [ctx.char.id]: usedFt + standCost },
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === ctx.char.id ? { ...e, conditions: e.conditions.filter((c) => c !== 'prone') } : e
    ),
  };
  ctx.narrative = `${ctx.char.name} stands up. (${standCost} ft of movement used)`;
};

/**
 * `dodge`: PHB p.192 — until your next turn, attack rolls against you
 * have disadvantage (if you can see the attacker) and you have
 * advantage on Dex saves. Engine tracks via `turn_actions.dodging` and
 * applies the modifier in attack resolution.
 *
 * **Architecture audit #5 phase 2 pilot.** Reads + writes route
 * through `ctx.actor` (narrowed to PC) instead of `ctx.char`. The
 * `updatePcActor` helper keeps `ctx.char` mirrored so downstream
 * single-source-of-truth code paths (`commitChar`, post-handler
 * epilogue) see the same Character. This is the canonical migration
 * shape future handlers should follow.
 */
export const handleDodge: ActionHandler<{ type: 'dodge' }> = (ctx) => {
  if (!ctx.st.combat_active) return { rejected: 'You can only dodge in combat.' };
  if (ctx.actor.kind !== 'pc') {
    // Enemy-side Dodge isn't modeled — when enemies start routing
    // through the dispatcher (Phase 4), this guard becomes the slot
    // for enemy-Dodge semantics.
    return { rejected: 'Only PCs can take the Dodge action.' };
  }
  const { char } = ctx.actor;
  updatePcActor(ctx, {
    turn_actions: { ...char.turn_actions, dodging: true },
  });
  ctx.usedInitiative = true;
  ctx.narrative = `${char.name} takes the Dodge action — until your next turn, attacks against you have disadvantage.`;
};

/**
 * `disengage`: PHB p.192 — your movement this turn doesn't provoke
 * opportunity attacks. Engine tracks via `turn_actions.disengaged` and
 * skips OA triggers when set.
 */
export const handleDisengage: ActionHandler<{ type: 'disengage' }> = (ctx) => {
  if (!ctx.st.combat_active) return { rejected: 'You can only disengage in combat.' };
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, disengaged: true },
  };
  ctx.usedInitiative = true;
  ctx.narrative = `${ctx.char.name} takes the Disengage action — your next movement this turn won't trigger opportunity attacks.`;
};

/**
 * `dash`: PHB p.192 — gain extra movement equal to your speed for the
 * turn. Implemented by reducing `movement_used` by speed so the
 * remaining-budget math implicitly gives a full extra speed worth.
 */
export const handleDash: ActionHandler<{ type: 'dash' }> = (ctx) => {
  if (!ctx.st.combat_active) return { rejected: 'Dash is a combat action.' };
  const dashSpeed = effectiveSpeed(ctx.char);
  ctx.st = {
    ...ctx.st,
    movement_used: {
      ...(ctx.st.movement_used ?? {}),
      [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - dashSpeed),
    },
  };
  ctx.narrative = `${ctx.char.name} Dashes — gaining an extra ${dashSpeed} ft of movement this turn.`;
};

/**
 * `help`: PHB p.192 — give an ally advantage on their next attack
 * roll. Engine tracks via `state.help_target_id`; the bonus is
 * consumed on the helped ally's next attack resolution.
 */
export const handleHelp: ActionHandler<{ type: 'help'; targetId: string }> = (ctx, action) => {
  if (!ctx.st.combat_active) return { rejected: 'Help is a combat action.' };
  const helpTarget = ctx.st.characters.find((c) => c.id === action.targetId && !c.dead);
  if (!helpTarget) return { rejected: 'Target not found.' };
  ctx.st = { ...ctx.st, help_target_id: action.targetId };
  ctx.narrative = `${ctx.char.name} helps ${helpTarget.name} — they have advantage on their next attack roll this turn.`;
  ctx.usedInitiative = true;
};

/**
 * `ready`: PHB p.193 — prepare an action to fire when a trigger
 * condition occurs. Stored on `turn_actions.readied_action`; consumed
 * by the matching `use_reaction` handler when the player declares the
 * trigger has fired.
 */
export const handleReady: ActionHandler<{
  type: 'ready';
  trigger: string;
  action: import('../../types.js').StructuredAction;
}> = (ctx, action) => {
  if (!ctx.st.combat_active) return { rejected: 'Ready is a combat action.' };
  ctx.char = {
    ...ctx.char,
    turn_actions: {
      ...ctx.char.turn_actions,
      readied_action: { trigger: action.trigger, action: action.action },
    },
  };
  ctx.narrative = `${ctx.char.name} readies an action: "${action.trigger}". Use 'Trigger readied action' when the trigger occurs.`;
  ctx.usedInitiative = true;
};
