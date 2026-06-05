import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  isRoomCleared,
  splitEncounterXp,
} from '../../gameEngine.js';
import { getClassLevel, hasClass, knowsMetamagic } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import type { Character } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';

// SRD Sorcery Incarnate (L7) — while Innate Sorcery is active, up to TWO
// Metamagic options can be stacked on one spell. Returns the next
// metamagic_active list after adding `id` (stacks onto exactly one existing).
function addMetamagic(char: Character, current: string[], id: string): string[] {
  const incarnate =
    char.conditions.includes('innate_sorcery') && getClassLevel(char, 'sorcerer') >= 7;
  return incarnate && current.length === 1 ? [...current, id] : [id];
}

// SRD Arcane Apotheosis (L20) — one Metamagic option per turn is free while
// Innate Sorcery is active. Returns the effective Sorcery-Point cost and
// whether the free use was consumed (caller sets metamagic_free_used).
function metamagicCost(char: Character, base: number): { cost: number; free: boolean } {
  const apotheosis =
    char.conditions.includes('innate_sorcery') &&
    getClassLevel(char, 'sorcerer') >= 20 &&
    !char.turn_actions.metamagic_free_used;
  return apotheosis ? { cost: 0, free: true } : { cost: base, free: false };
}

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
 * 1/short rest. The SRD shape (no charm option) since fright is
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
  // SRD Metamagic — gate every metamagic activation on being a Sorcerer who
  // has LEARNED that option (2/4/6 known at L2/10/17). Covers the simple
  // options + Twinned/Quickened/Empowered below.
  if (fid.startsWith('metamagic_')) {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    if (!knowsMetamagic(char, fid.replace('metamagic_', ''))) {
      ctx.narrative = "You haven't learned that Metamagic option.";
      return true;
    }
  }
  if (fid === 'dragon_wings') {
    // SRD Draconic Sorcery Dragon Wings (L14): Bonus Action — sprout wings for
    // a Fly Speed of 60 ft (1 hour). Once per long rest, or spend 3 Sorcery
    // Points to restore the use.
    if (
      !hasClass(char, 'sorcerer') ||
      char.subclass !== 'draconic' ||
      getClassLevel(char, 'sorcerer') < 14
    ) {
      ctx.narrative = 'Dragon Wings requires a Draconic Sorcerer of level 14.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const dwUsed = char.class_resource_uses?.dragon_wings_used ?? 0;
    const dwSp = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    if (dwUsed >= 1 && dwSp < 3) {
      ctx.narrative = 'Dragon Wings is expended — restore it for 3 sorcery points (not enough).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      dragon_wings_used: 1,
      ...(dwUsed >= 1 ? { sorcery_points: dwSp - 3 } : {}),
    };
    char.fly_speed_ft = 60;
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${char.name} unfurls draconic wings — Fly Speed 60 ft.${dwUsed >= 1 ? ' (3 sorcery points spent to restore the use)' : ''}`;
    return true;
  }

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
    const sp = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    // SRD Sorcery Incarnate (L7): when out of free uses, activate by spending
    // 2 Sorcery Points instead.
    const incarnateAvailable = getClassLevel(char, 'sorcerer') >= 7 && sp >= 2;
    let incarnateNote = '';
    const usesPatch: Record<string, number> = { ...(char.class_resource_uses ?? {}) };
    if (isUsed >= 2) {
      if (!incarnateAvailable) {
        ctx.narrative =
          getClassLevel(char, 'sorcerer') >= 7
            ? 'Innate Sorcery is expended — spend 2 sorcery points to activate it (not enough).'
            : 'Innate Sorcery is expended (2/2 used). Recovers on a long rest.';
        return true;
      }
      usesPatch.sorcery_points = sp - 2;
      incarnateNote = ' (Sorcery Incarnate: 2 sorcery points)';
    } else {
      usesPatch.innate_sorcery_used = isUsed + 1;
    }
    char.conditions = [...char.conditions, 'innate_sorcery'];
    char.class_resource_uses = usesPatch;
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${char.name} unleashes Innate Sorcery — +1 spell save DC and Advantage on spell attacks this encounter.${incarnateNote || ` (${1 - isUsed}/2 remaining)`}`;
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
    metamagic_transmuted: {
      cost: 1,
      label: 'Transmuted Spell — change the spell’s damage type',
    },
  };
  if (SIMPLE_METAMAGIC[fid]) {
    const { cost: base, label } = SIMPLE_METAMAGIC[fid];
    const sp = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    const { cost, free } = metamagicCost(char, base);
    if (sp < cost) {
      ctx.narrative = `Not enough sorcery points (need ${cost}).`;
      return true;
    }
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), sorcery_points: sp - cost };
    if (free) char.turn_actions = { ...char.turn_actions, metamagic_free_used: true };
    ctx.st = {
      ...ctx.st,
      metamagic_active: addMetamagic(
        char,
        ctx.st.metamagic_active ?? [],
        fid.replace('metamagic_', '')
      ),
    };
    ctx.narrative = `${char.name} — Metamagic: ${label}.${free ? ' (free — Arcane Apotheosis)' : ` (${sp - cost} sorcery points remaining)`}`;
    return true;
  }

  if (fid === 'metamagic_twinned') {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    // Sorcery points scale with Sorcerer level.
    const spPool = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    const { cost, free } = metamagicCost(char, 1);
    if (spPool < cost) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      sorcery_points: spPool - cost,
    };
    if (free) char.turn_actions = { ...char.turn_actions, metamagic_free_used: true };
    ctx.st = {
      ...ctx.st,
      metamagic_active: addMetamagic(char, ctx.st.metamagic_active ?? [], 'twinned'),
    };
    ctx.narrative = `${char.name} — Metamagic: Twinned Spell! Your next spell will target a second creature.${free ? ' (free — Arcane Apotheosis)' : ` (${spPool - cost} sorcery points remaining)`}`;
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
    // SRD 5.2.1: can't activate Quickened if you've already cast
    // a level 1+ spell this turn.
    if (char.turn_actions.leveled_spell_cast) {
      ctx.narrative =
        'You have already cast a level 1+ spell this turn — Quickened Spell cannot be used.';
      return true;
    }
    const spPool2 = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    const { cost: qCost, free: qFree } = metamagicCost(char, 2);
    if (spPool2 < qCost) {
      ctx.narrative = 'Not enough sorcery points (need 2).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      sorcery_points: spPool2 - qCost,
    };
    char.turn_actions = {
      ...char.turn_actions,
      bonus_action_used: true,
      action_used: false,
      quickened_used: true,
      ...(qFree ? { metamagic_free_used: true } : {}),
    };
    ctx.st = {
      ...ctx.st,
      metamagic_active: addMetamagic(char, ctx.st.metamagic_active ?? [], 'quickened'),
    };
    ctx.narrative = `${char.name} — Metamagic: Quickened Spell! Cast your next spell as a bonus action.${qFree ? ' (free — Arcane Apotheosis)' : ` (${spPool2 - qCost} sorcery points remaining)`}`;
    return true;
  }

  if (fid === 'metamagic_empowered') {
    if (!hasClass(char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    const spPool3 = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    const { cost: eCost, free: eFree } = metamagicCost(char, 1);
    if (spPool3 < eCost) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      sorcery_points: spPool3 - eCost,
    };
    if (eFree) char.turn_actions = { ...char.turn_actions, metamagic_free_used: true };
    ctx.st = {
      ...ctx.st,
      metamagic_active: addMetamagic(char, ctx.st.metamagic_active ?? [], 'empowered'),
    };
    ctx.narrative = `${char.name} — Metamagic: Empowered Spell! You may reroll up to ${abilityMod(char.cha)} damage dice on your next spell.${eFree ? ' (free — Arcane Apotheosis)' : ` (${spPool3 - eCost} sorcery points remaining)`}`;
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

  // SRD Warlock Magical Cunning (L2) — as a Bonus Action, regain expended Pact
  // Magic slots up to half your max (round up), 1/Long Rest. SRD Eldritch
  // Master (L20) upgrades this to regain ALL expended Pact Magic slots.
  if (fid === 'magical_cunning') {
    if (!hasClass(char, 'warlock') || getClassLevel(char, 'warlock') < 2) {
      ctx.narrative = 'Magical Cunning requires a Warlock of level 2.';
      return true;
    }
    if ((char.class_resource_uses?.magical_cunning_used ?? 0) > 0) {
      ctx.narrative = 'Magical Cunning is spent — it returns after a long rest.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const maxSlots = Object.values(char.spell_slots_max ?? {}).reduce((a, b) => a + b, 0);
    const usedTotal = Object.values(char.spell_slots_used ?? {}).reduce((a, b) => a + b, 0);
    if (usedTotal <= 0) {
      ctx.narrative = 'No expended Pact Magic slots to regain.';
      return true;
    }
    const eldritchMaster = getClassLevel(char, 'warlock') >= 20;
    let regain = eldritchMaster ? usedTotal : Math.ceil(maxSlots / 2);
    const newUsed: Record<number, number> = { ...(char.spell_slots_used ?? {}) };
    for (const key of Object.keys(newUsed)) {
      if (regain <= 0) break;
      const lvl = Number(key);
      const take = Math.min(newUsed[lvl], regain);
      newUsed[lvl] -= take;
      regain -= take;
    }
    char.spell_slots_used = newUsed;
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), magical_cunning_used: 1 };
    const regained = usedTotal - Object.values(newUsed).reduce((a, b) => a + b, 0);
    ctx.narrative = `${char.name} — Magical Cunning! Regains ${regained} expended Pact Magic slot${regained === 1 ? '' : 's'}${eldritchMaster ? ' (Eldritch Master: all of them)' : ''}.`;
    return true;
  }

  // SRD Fiend Warlock Hurl Through Hell (L14) — once per turn, after hitting a
  // creature: it makes a CHA save vs your spell DC or takes 8d10 Psychic (if
  // not a Fiend) and is Incapacitated until the end of your next turn.
  if (fid === 'hurl_through_hell') {
    if (!(char.subclass === 'fiend' && getClassLevel(char, 'warlock') >= 14)) {
      ctx.narrative = 'Hurl Through Hell requires a Fiend Warlock of level 14.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target to hurl through the Lower Planes.';
      return true;
    }
    if (char.turn_actions.hurl_through_hell_used) {
      ctx.narrative = 'Hurl Through Hell already used this turn.';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, hurl_through_hell_used: true };
    const hthDC = 8 + profBonus(char.level) + abilityMod(char.cha);
    const hthEnemy = ctx.enemy;
    const hthEnt = ctx.st.entities?.find((e) => e.id === hthEnemy.id && e.isEnemy);
    const hthSave =
      rollDice('1d20') + abilityMod((hthEnemy as unknown as Record<string, number>).cha ?? 10);
    if (hthSave >= hthDC) {
      ctx.narrative = `${char.name} tries to Hurl ${hthEnemy.name} through hell — CHA ${hthSave} vs DC ${hthDC}, it resists.`;
      return true;
    }
    // A Fiend is unaffected by the Psychic damage but is still displaced.
    const isFiend = /fiend|devil|demon|imp|balor|hell/i.test(hthEnemy.name);
    const hthDmg = isFiend ? 0 : rollDice('8d10');
    const hthNewHp = Math.max(0, (hthEnt?.hp ?? hthEnemy.hp) - hthDmg);
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === hthEnemy.id && e.isEnemy
          ? {
              ...e,
              hp: hthNewHp,
              conditions: [...e.conditions.filter((c) => c !== 'incapacitated'), 'incapacitated'],
            }
          : e
      ),
    };
    composeNow(ctx, {
      kind: 'condition_applied',
      targetId: hthEnemy.id,
      targetName: hthEnemy.name,
      condition: 'incapacitated',
      source: 'Hurl Through Hell',
      prose: ` ${char.name} hurls ${hthEnemy.name} through the Lower Planes! CHA ${hthSave} vs DC ${hthDC} — ${hthDmg} psychic${isFiend ? ' (Fiend: immune to the damage)' : ''}, Incapacitated.`,
    });
    if (hthNewHp <= 0) {
      const split = splitEncounterXp(ctx.st, char.id, hthEnemy.xp ?? 0);
      ctx.st = split.st;
      char.xp = (char.xp || 0) + split.share;
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, hthEnemy.id];
      ctx.narrative += ` ${hthEnemy.name} does not return.`;
      if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) ctx.st = endCombatState(ctx.st);
      ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
    }
    ctx.usedInitiative = true;
    return true;
  }

  return false;
}
