// 2024 PHB Glamour Bard L3 — Mantle of Inspiration.
//
// Bonus action. Spend 1 Bardic Inspiration use. Up to 5 ally
// targets within 60 ft each gain (5 + CHA mod) temp HP. RAW also
// lets each target use their reaction to move half their speed
// — pansori MVP defers the movement.

import { getClassLevel, hasClass } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { abilityMod } from '../rulesEngine.js';

export const handleMantleOfInspiration: ActionHandler<{
  type: 'use_mantle_of_inspiration';
}> = (ctx, _action) => {
  void _action;
  if (!hasClass(ctx.char, 'bard') || ctx.char.subclass !== 'glamour') {
    return { rejected: 'Mantle of Inspiration is a Glamour Bard feature.' };
  }
  if (getClassLevel(ctx.char, 'bard') < 3) {
    return { rejected: 'Mantle of Inspiration unlocks at Bard level 3.' };
  }
  const bardLvl = getClassLevel(ctx.char, 'bard');
  // BI pool: bards get CHA mod uses per long rest. Same default
  // as the bardic_inspiration action.
  const biUses =
    ctx.char.class_resource_uses?.bardic_inspiration ??
    Math.max(1, Math.floor((ctx.char.cha - 10) / 2));
  if (biUses <= 0) {
    return { rejected: 'No Bardic Inspiration uses remaining (recovers on long rest).' };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }

  const chaMod = abilityMod(ctx.char.cha);
  const grant = 5 + chaMod;
  // Target up to 5 living party members. Pansori MVP auto-includes
  // the caster + first 4 living allies (per the standard Bless /
  // group-buff pattern from gameEngine's Bless handler).
  const candidates: string[] = [ctx.char.id];
  for (const c of ctx.st.characters) {
    if (candidates.length >= 5) break;
    if (c.id === ctx.char.id || c.dead || c.hp <= 0) continue;
    candidates.push(c.id);
  }
  const targetSet = new Set(candidates);

  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, bonus_action_used: true },
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biUses - 1,
    },
  };
  if ((ctx.char.temp_hp ?? 0) < grant) ctx.char.temp_hp = grant;
  ctx.st = {
    ...ctx.st,
    characters: ctx.st.characters.map((c) =>
      targetSet.has(c.id) && c.id !== ctx.char.id
        ? { ...c, temp_hp: Math.max(c.temp_hp ?? 0, grant) }
        : c
    ),
  };
  ctx.usedInitiative = true;
  void bardLvl; // narrative-only: could include caster bard level for flavor
  const buffedNames = candidates
    .map((id) => ctx.st.characters.find((c) => c.id === id)?.name ?? '')
    .filter(Boolean)
    .join(', ');
  ctx.narrative = `✨ Mantle of Inspiration — ${ctx.char.name} weaves a stirring performance: ${grant} temp HP to ${buffedNames}. (${biUses - 1} Bardic Inspiration use${biUses - 1 === 1 ? '' : 's'} remaining)`;
};
