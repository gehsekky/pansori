import { abilityMod, profBonus, rollCritical, rollDice } from '../../rulesEngine.js';
import { applyPartyLevelUps, splitEncounterXp } from '../../gameEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { BEAST_FORMS } from '../../../contexts/srd/index.js';
import { composeNow } from '../../narrative/compose.js';

/**
 * Druid + Circle of the Moon features.
 *
 *  - `wild_shape` / `wild_shape_<formId>`: 2024 PHB action (Moon
 *    subclass: bonus action). 2 uses per short rest. CR access scales
 *    with level — Moon Druids unlock higher CRs sooner. Temp HP = 2×
 *    level (3× for Moon). Form supplied via fid suffix; empty fid
 *    falls back to the lowest CR available.
 *  - `dismiss_wild_shape`: revert to normal form. No cost.
 *  - `moon_healing`: Moon-only. Bonus action while shifted to spend
 *    a spell slot for 1d8/slot-level HP. Idempotent — no slot, no
 *    heal.
 */
export function handleDruidFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'wild_shape' || fid.startsWith('wild_shape_')) {
    if (!hasClass(ctx.char, 'druid')) {
      ctx.narrative = 'Only Druids have Wild Shape.';
      return true;
    }
    if (ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are already in Wild Shape. Attack or use Dismiss Wild Shape to end it.';
      return true;
    }
    const wsUses = ctx.char.class_resource_uses?.wild_shape ?? 2;
    if (wsUses <= 0) {
      ctx.narrative = 'No Wild Shape uses remaining (recover on short rest).';
      return true;
    }
    const isMoon = ctx.char.subclass === 'moon';
    const formId = fid === 'wild_shape' ? '' : fid.replace('wild_shape_', '');
    const form = formId ? BEAST_FORMS[formId] : Object.values(BEAST_FORMS).find((f) => f.cr === 0);
    if (!form) {
      ctx.narrative = `Unknown beast form: ${formId}.`;
      return true;
    }
    // CR access + temp HP scale with Druid level (not total level).
    const druidLvl = getClassLevel(ctx.char, 'druid');
    const maxCR = isMoon
      ? Math.max(1, Math.floor(druidLvl / 3))
      : druidLvl >= 8
        ? 1
        : druidLvl >= 4
          ? 0.5
          : 0.25;
    if (form.cr > maxCR) {
      ctx.narrative = `${form.name} requires a higher-CR form access (you can access CR ≤ ${maxCR}).`;
      return true;
    }
    const tempHp = (isMoon ? 3 : 2) * druidLvl;
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      wild_shape: wsUses - 1,
    };
    ctx.char.conditions = [...ctx.char.conditions, 'wild_shaped'];
    ctx.char.wild_shape_form = form.id;
    ctx.char.hp = ctx.char.hp + tempHp;
    if (ctx.st.combat_active) {
      ctx.char.turn_actions = isMoon
        ? { ...ctx.char.turn_actions, bonus_action_used: true }
        : { ...ctx.char.turn_actions, action_used: true };
      if (isMoon) ctx.usedInitiative = false;
      else ctx.usedInitiative = true;
    }
    const traits = [
      form.packTactics ? 'Pack Tactics' : '',
      form.physicalResistance ? 'Physical Resistance' : '',
      form.flying ? 'Flying' : '',
      form.climbing ? 'Climb' : '',
    ]
      .filter(Boolean)
      .join(', ');
    const traitNote = traits ? ` Traits: ${traits}.` : '';
    ctx.narrative = `🐾 ${ctx.char.name} transforms into a ${form.name}!${isMoon ? ' (bonus action)' : ''} +${tempHp} temp HP. ${form.descriptor}.${traitNote} (${wsUses - 1} uses remaining)`;
    return true;
  }

  if (fid === 'dismiss_wild_shape') {
    if (!ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are not in Wild Shape.';
      return true;
    }
    ctx.char.wild_shape_form = undefined;
    ctx.char.conditions = ctx.char.conditions.filter((c) => c !== 'wild_shaped');
    ctx.narrative = `${ctx.char.name} reverts to their normal form.`;
    return true;
  }

  // ── 2024 PHB Stars Druid — Starry Form (L3+) ─────────────────────────
  // Bonus-action transformation that shares the Wild Shape resource
  // pool. The druid keeps their stats (unlike beast forms) and gains
  // a constellation-specific rider:
  //   - 'archer': enables a ranged spell attack action (1d8 + WIS
  //     radiant) via the starry_form_attack fid.
  //   - 'chalice': heal spells add +1d8 to the healed amount (read
  //     in castSpell/heal.ts).
  //   - 'dragon': concentration saves (and RAW INT/WIS checks, not
  //     yet wired) treat a sub-10 d20 as a 10.
  // Switching constellations costs another Wild Shape charge (RAW
  // says you can switch on subsequent activations).
  const starryFids: Record<string, 'archer' | 'chalice' | 'dragon'> = {
    starry_form_archer: 'archer',
    starry_form_chalice: 'chalice',
    starry_form_dragon: 'dragon',
  };
  if (fid in starryFids) {
    const constellation = starryFids[fid];
    if (!hasClass(ctx.char, 'druid') || ctx.char.subclass !== 'stars') {
      ctx.narrative = 'Only Stars Druids have Starry Form.';
      return true;
    }
    if (getClassLevel(ctx.char, 'druid') < 3) {
      ctx.narrative = 'Starry Form unlocks at Druid level 3.';
      return true;
    }
    const wsUsesS = ctx.char.class_resource_uses?.wild_shape ?? 2;
    if (wsUsesS <= 0) {
      ctx.narrative = 'No Wild Shape uses remaining (recover on short rest).';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      wild_shape: wsUsesS - 1,
    };
    ctx.char.starry_form_constellation = constellation;
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const constellationDescr =
      constellation === 'archer'
        ? 'Archer — a glowing spell attack ready to fire.'
        : constellation === 'chalice'
          ? 'Chalice — healing spells grant +1d8 to the target.'
          : 'Dragon — concentration holds firm against the storm.';
    ctx.narrative = `🌌 ${ctx.char.name} blazes with Starry Form: ${constellationDescr} (${wsUsesS - 1} Wild Shape uses remaining)`;
    return true;
  }

  if (fid === 'starry_form_attack') {
    // 2024 PHB Stars Druid Archer constellation — ranged spell
    // attack action. Damage = 1d8 + WIS mod radiant. Range 60 ft;
    // pansori MVP simplifies to "any enemy in the room" since the
    // grid-range gate would require a target square.
    if (ctx.char.starry_form_constellation !== 'archer') {
      ctx.narrative = 'You must have the Archer constellation active to use Starry Form: Attack.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    if (ctx.char.turn_actions.action_used) {
      ctx.narrative = 'Action already used this turn.';
      return true;
    }
    const wisMod = abilityMod(ctx.char.wis);
    const attackBonus = wisMod + profBonus(ctx.char.level);
    const d20 = rollDice('1d20');
    const isCrit = d20 === 20;
    const total = d20 + attackBonus;
    const target = ctx.enemy;
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
    if (total < target.ac && !isCrit) {
      composeNow(ctx, {
        kind: 'spell_attack_miss',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        target,
        spellId: 'starry_form_archer',
        spellName: 'Starry Form: Archer',
        castPrefix: `${ctx.char.name} fires a beam of radiant starlight at ${target.name}`,
        toHit: total,
        targetAc: target.ac,
        atkNote: ` (spell attack d20 ${d20}+${attackBonus}=${total} vs AC ${target.ac})`,
      });
      ctx.usedInitiative = true;
      return true;
    }
    const dmgExpr = '1d8';
    const damage = (isCrit ? rollCritical(dmgExpr) : rollDice(dmgExpr)) + wisMod;
    const enemyEnt = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy);
    const curHp = enemyEnt?.hp ?? target.hp;
    const newHp = Math.max(0, curHp - damage);
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && e.isEnemy ? { ...e, hp: newHp } : e
      ),
    };
    composeNow(ctx, {
      kind: 'spell_attack_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      target,
      spellId: 'starry_form_archer',
      spellName: 'Starry Form: Archer',
      castPrefix: `${ctx.char.name} fires a beam of radiant starlight at ${target.name}`,
      damage,
      damageType: 'radiant',
      isCrit,
      toHit: total,
      targetAc: target.ac,
      atkNote: ` (spell attack d20 ${d20}+${attackBonus}=${total} vs AC ${target.ac})`,
    });
    if (newHp <= 0) {
      const xpGain = target.xp ?? 10;
      const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
      ctx.st = split.st;
      ctx.char.xp = (ctx.char.xp || 0) + split.share;
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, target.id];
      ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
    }
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'moon_healing') {
    if (ctx.char.subclass !== 'moon' || !hasClass(ctx.char, 'druid')) {
      ctx.narrative = 'Only Circle of the Moon Druids have Moon Healing.';
      return true;
    }
    if (!ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You must be in Wild Shape to use Moon Healing.';
      return true;
    }
    const mhSlotsMax = ctx.char.spell_slots_max ?? {};
    const mhSlotsUsed = ctx.char.spell_slots_used ?? {};
    const mhSlotLvl = Object.keys(mhSlotsMax)
      .map(Number)
      .filter((n) => n >= 1 && (mhSlotsMax[n] ?? 0) > (mhSlotsUsed[n] ?? 0))
      .sort((a, b) => a - b)[0];
    if (mhSlotLvl === undefined) {
      ctx.narrative = 'No spell slot available for Moon Healing.';
      return true;
    }
    const heal = rollDice(`${mhSlotLvl}d8`);
    ctx.char.spell_slots_used = {
      ...mhSlotsUsed,
      [mhSlotLvl]: (mhSlotsUsed[mhSlotLvl] ?? 0) + 1,
    };
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + heal);
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `🌙 ${ctx.char.name} channels lunar energy — heals ${heal} HP (now ${ctx.char.hp}/${ctx.char.max_hp}). Spent lvl ${mhSlotLvl} slot.`;
    return true;
  }

  return false;
}
