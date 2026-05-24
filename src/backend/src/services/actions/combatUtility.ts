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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs have Heroic Inspiration.' };
  const { char } = ctx.actor;
  if (!char.inspiration) {
    ctx.narrative = 'You have no Heroic Inspiration to spend.';
    return;
  }
  if (char.turn_actions.inspiration_pending) {
    ctx.narrative = 'Inspiration already queued for your next d20 roll.';
    return;
  }
  updatePcActor(ctx, {
    turn_actions: { ...char.turn_actions, inspiration_pending: true },
  });
  ctx.narrative = `${char.name} steels themselves — Heroic Inspiration queued: advantage on your next d20 (attack, save, or check).`;
};

/**
 * `stand_up`: spend half-speed of movement to drop prone. PHB p.190 —
 * "Standing up takes more effort; doing so costs an amount of movement
 * equal to half your speed." Guarded by remaining movement budget so a
 * mid-turn stand-up after a partial move can't exceed the cap.
 */
export const handleStandUp: ActionHandler<{ type: 'stand_up' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take the Stand Up action.' };
  const { char } = ctx.actor;
  if (!char.conditions.includes('prone')) {
    ctx.narrative = 'You are not prone.';
    return;
  }
  const speedFt = effectiveSpeed(char, ctx.context.lootTable);
  const standCost = Math.floor(speedFt / 2);
  const usedFt = (ctx.st.movement_used ?? {})[char.id] ?? 0;
  if (usedFt + standCost > speedFt) {
    ctx.narrative = `Not enough movement to stand up. (${speedFt - usedFt} ft remaining, ${standCost} ft needed)`;
    return;
  }
  updatePcActor(ctx, { conditions: char.conditions.filter((c) => c !== 'prone') });
  ctx.st = {
    ...ctx.st,
    movement_used: { ...ctx.st.movement_used, [char.id]: usedFt + standCost },
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === char.id ? { ...e, conditions: e.conditions.filter((c) => c !== 'prone') } : e
    ),
  };
  ctx.narrative = `${char.name} stands up. (${standCost} ft of movement used)`;
};

/**
 * `dodge`: PHB p.192 — until your next turn, attack rolls against you
 * have disadvantage (if you can see the attacker) and you have
 * advantage on Dex saves. Engine tracks via `turn_actions.dodging` and
 * applies the modifier in attack resolution.
 *
 * **Architecture audit #5 phase 2 pilot.** Reads + writes route
 * through `ctx.actor` (narrowed to PC) instead of the legacy
 * `ActionContext.char` field. The `updatePcActor` helper keeps that
 * field mirrored so downstream single-source-of-truth code paths
 * (`commitChar`, post-handler epilogue) see the same Character. This
 * is the canonical migration shape future handlers should follow.
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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take the Disengage action.' };
  const { char } = ctx.actor;
  updatePcActor(ctx, {
    turn_actions: { ...char.turn_actions, disengaged: true },
  });
  ctx.usedInitiative = true;
  ctx.narrative = `${char.name} takes the Disengage action — your next movement this turn won't trigger opportunity attacks.`;
};

/**
 * `dash`: PHB p.192 — gain extra movement equal to your speed for the
 * turn. Implemented by reducing `movement_used` by speed so the
 * remaining-budget math implicitly gives a full extra speed worth.
 */
export const handleDash: ActionHandler<{ type: 'dash' }> = (ctx) => {
  if (!ctx.st.combat_active) return { rejected: 'Dash is a combat action.' };
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take the Dash action.' };
  const { char } = ctx.actor;
  const dashSpeed = effectiveSpeed(char, ctx.context.lootTable);
  ctx.st = {
    ...ctx.st,
    movement_used: {
      ...(ctx.st.movement_used ?? {}),
      [char.id]: Math.max(0, (ctx.st.movement_used?.[char.id] ?? 0) - dashSpeed),
    },
  };
  ctx.narrative = `${char.name} Dashes — gaining an extra ${dashSpeed} ft of movement this turn.`;
};

/**
 * `help`: PHB p.192 — give an ally advantage on their next attack
 * roll. Engine tracks via `state.help_target_id`; the bonus is
 * consumed on the helped ally's next attack resolution.
 */
export const handleHelp: ActionHandler<{ type: 'help'; targetId: string }> = (ctx, action) => {
  if (!ctx.st.combat_active) return { rejected: 'Help is a combat action.' };
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take the Help action.' };
  const { char } = ctx.actor;
  const helpTarget = ctx.st.characters.find((c) => c.id === action.targetId && !c.dead);
  if (!helpTarget) return { rejected: 'Target not found.' };
  ctx.st = { ...ctx.st, help_target_id: action.targetId };
  ctx.narrative = `${char.name} helps ${helpTarget.name} — they have advantage on their next attack roll this turn.`;
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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take the Ready action.' };
  const { char } = ctx.actor;
  updatePcActor(ctx, {
    turn_actions: {
      ...char.turn_actions,
      readied_action: { trigger: action.trigger, action: action.action },
    },
  });
  ctx.narrative = `${char.name} readies an action: "${action.trigger}". Use 'Trigger readied action' when the trigger occurs.`;
  ctx.usedInitiative = true;
};
