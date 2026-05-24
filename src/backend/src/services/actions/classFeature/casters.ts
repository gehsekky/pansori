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
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (fid === 'innate_sorcery') {
    // SRD Sorcerer Innate Sorcery (L1): Bonus Action, for 1 minute gain +1
    // spell save DC and Advantage on Sorcerer spell attacks; twice per long
    // rest. Modeled as a self-buff condition cleared at combat end (the
    // "lasts the encounter" simplification used by Superior Defense); the
    // 2/long-rest cap is the real limiter.
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Innate Sorcery.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (char.conditions.includes('innate_sorcery')) {
      ctx.narrative = 'Innate Sorcery is already active.';
      return true;
    }
    const isUsed = char.class_resource_uses?.innate_sorcery_used ?? 0;
    if (isUsed >= 2) {
      ctx.narrative = 'Innate Sorcery is expended (2/2 used). Recovers on a long rest.';
      return true;
    }
    char.conditions = [...char.conditions, 'innate_sorcery'];
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      innate_sorcery_used: isUsed + 1,
    };
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${char.name} unleashes Innate Sorcery — +1 spell save DC and Advantage on spell attacks this encounter. (${1 - isUsed}/2 remaining)`;
    return true;
  }

  // Simple Metamagic options: spend Sorcery Points and stage the modifier on
  // `metamagic_active` (consumed by the next cast in runPrecast). Quickened
  // (action economy), Twinned, and Empowered have their own blocks below.
  const SIMPLE_METAMAGIC: Record<string, { cost: number; label: string }> = {
    metamagic_distant: { cost: 1, label: 'Distant Spell — double range' },
    metamagic_subtle: { cost: 1, label: 'Subtle Spell — no verbal/somatic components' },
    metamagic_extended: { cost: 1, label: 'Extended Spell — double concentration duration' },
    metamagic_heightened: {
      cost: 2,
      label: 'Heightened Spell — one target has Disadvantage on its save',
    },
    metamagic_seeking: {
      cost: 1,
      label: 'Seeking Spell — reroll a missed spell attack',
    },
    metamagic_careful: {
      cost: 1,
      label: 'Careful Spell — allies in the area auto-succeed and take no damage',
    },
  };
  if (SIMPLE_METAMAGIC[fid]) {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    const { cost, label } = SIMPLE_METAMAGIC[fid];
    const sp = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    if (sp < cost) {
      ctx.narrative = `Not enough sorcery points (need ${cost}).`;
      return true;
    }
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), sorcery_points: sp - cost };
    ctx.st = { ...ctx.st, metamagic_active: fid.replace('metamagic_', '') };
    ctx.narrative = `${char.name} — Metamagic: ${label}. (${sp - cost} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_twinned') {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    // Sorcery points scale with Sorcerer level.
    const spPool = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    if (spPool < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      sorcery_points: spPool - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'twinned' };
    ctx.narrative = `${char.name} — Metamagic: Twinned Spell! Your next spell will target a second creature. (${spPool - 1} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_quickened') {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    // SRD 5.2.1 p.67: can't activate Quickened if you've already cast
    // a level 1+ spell this turn.
    if (char.turn_actions.leveled_spell_cast) {
      ctx.narrative =
        'You have already cast a level 1+ spell this turn — Quickened Spell cannot be used.';
      return true;
    }
    const spPool2 = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    if (spPool2 < 2) {
      ctx.narrative = 'Not enough sorcery points (need 2).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      sorcery_points: spPool2 - 2,
    };
    char.turn_actions = {
      ...char.turn_actions,
      bonus_action_used: true,
      action_used: false,
      quickened_used: true,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'quickened' };
    ctx.narrative = `${char.name} — Metamagic: Quickened Spell! Cast your next spell as a bonus action. (${spPool2 - 2} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_empowered') {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    const spPool3 = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    if (spPool3 < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      sorcery_points: spPool3 - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'empowered' };
    ctx.narrative = `${char.name} — Metamagic: Empowered Spell! You may reroll up to ${abilityMod(char.cha)} damage dice on your next spell. (${spPool3 - 1} sorcery points remaining)`;
    return true;
  }

  if (fid === 'agonizing_blast') {
    if (!hasClass(char, 'warlock')) {
      ctx.narrative = 'Only Warlocks can take Agonizing Blast.';
      return true;
    }
    const hasIt = char.feats?.includes('agonizing_blast') ?? false;
    if (hasIt) {
      ctx.narrative = 'You already have the Agonizing Blast invocation.';
      return true;
    }
    char.feats = [...(char.feats ?? []), 'agonizing_blast'];
    ctx.narrative = `${char.name} gains the Agonizing Blast invocation — Eldritch Blast now adds +${abilityMod(char.cha)} force damage per beam.`;
    return true;
  }

  if (fid === 'devils_sight') {
    if (!hasClass(char, 'warlock')) {
      ctx.narrative = "Only Warlocks can take Devil's Sight.";
      return true;
    }
    const hasIt2 = char.feats?.includes('devils_sight') ?? false;
    if (hasIt2) {
      ctx.narrative = "You already have the Devil's Sight invocation.";
      return true;
    }
    char.feats = [...(char.feats ?? []), 'devils_sight'];
    ctx.narrative = `${char.name} gains Devil's Sight — you can see normally in magical darkness.`;
    return true;
  }

  return false;
}
