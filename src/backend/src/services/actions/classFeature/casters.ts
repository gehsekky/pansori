import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { abilityMod } from '../../rulesEngine.js';

/**
 * Caster features for Sorcerer, Warlock, and Wizard. Bundled because
 * each class only contributes 1-3 small features; not worth its own
 * file at this scale.
 *
 * Sorcerer Metamagic (Twinned, Quickened, Empowered): stage on the
 * sorcerer via `metamagic_active`; the cast_spell handler reads the
 * flag and adjusts target counts / damage rerolls / bonus-action
 * timing.
 *
 * Warlock Invocations (Agonizing Blast, Devil's Sight): passive
 * toggles into `char.feats`. The attack/spell handlers read those
 * tags. Agonizing adds +CHA per Eldritch Blast beam; Devil's Sight
 * lets the Warlock see in magical darkness (rendering hook).
 *
 * Archfey Patron — Fey Presence: AoE WIS save in 10 ft → frightened.
 * 1/short rest. The 2024 PHB shape (no charm option) since fright is
 * already encoded in the engine; charm would need a new movement
 * gate path.
 *
 * Wizard Arcane Ward (Abjurer subclass): create a 2 × level HP ward
 * that absorbs damage before HP. Damage-absorbtion hook is in the
 * enemy-attack resolver elsewhere.
 */
export function handleCasterFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'metamagic_twinned') {
    if (!hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    // Sorcery points scale with Sorcerer level.
    const spPool =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spPool < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'twinned' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Twinned Spell! Your next spell will target a second creature. (${spPool - 1} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_quickened') {
    if (!hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    // SRD 5.2.1 p.67: can't activate Quickened if you've already cast
    // a level 1+ spell this turn.
    if (ctx.char.turn_actions.leveled_spell_cast) {
      ctx.narrative =
        'You have already cast a level 1+ spell this turn — Quickened Spell cannot be used.';
      return true;
    }
    const spPool2 =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spPool2 < 2) {
      ctx.narrative = 'Not enough sorcery points (need 2).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool2 - 2,
    };
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      action_used: false,
      quickened_used: true,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'quickened' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Quickened Spell! Cast your next spell as a bonus action. (${spPool2 - 2} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_empowered') {
    if (!hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    const spPool3 =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spPool3 < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool3 - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'empowered' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Empowered Spell! You may reroll up to ${abilityMod(ctx.char.cha)} damage dice on your next spell. (${spPool3 - 1} sorcery points remaining)`;
    return true;
  }

  if (fid === 'agonizing_blast') {
    if (!hasClass(ctx.char, 'warlock')) {
      ctx.narrative = 'Only Warlocks can take Agonizing Blast.';
      return true;
    }
    const hasIt = ctx.char.feats?.includes('agonizing_blast') ?? false;
    if (hasIt) {
      ctx.narrative = 'You already have the Agonizing Blast invocation.';
      return true;
    }
    ctx.char.feats = [...(ctx.char.feats ?? []), 'agonizing_blast'];
    ctx.narrative = `${ctx.char.name} gains the Agonizing Blast invocation — Eldritch Blast now adds +${abilityMod(ctx.char.cha)} force damage per beam.`;
    return true;
  }

  if (fid === 'devils_sight') {
    if (!hasClass(ctx.char, 'warlock')) {
      ctx.narrative = "Only Warlocks can take Devil's Sight.";
      return true;
    }
    const hasIt2 = ctx.char.feats?.includes('devils_sight') ?? false;
    if (hasIt2) {
      ctx.narrative = "You already have the Devil's Sight invocation.";
      return true;
    }
    ctx.char.feats = [...(ctx.char.feats ?? []), 'devils_sight'];
    ctx.narrative = `${ctx.char.name} gains Devil's Sight — you can see normally in magical darkness.`;
    return true;
  }

  return false;
}
