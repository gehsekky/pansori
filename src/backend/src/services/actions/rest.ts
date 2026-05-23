import {
  abilityMod,
  computeTotalAc,
  rageUsesMax,
  rollDice,
  spellSlotsForClassLevel,
} from '../rulesEngine.js';
import { canRestInRoom, pick } from '../gameEngine.js';
import { getClassLevel, hasClass } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { resetFeatLongRestResources } from '../feats.js';

/**
 * `short_rest`: PHB p.196 — spend Hit Dice to recover HP, refresh
 * short-rest class features. One per room (tracked via
 * `short_rested_rooms`) to keep encounter pacing meaningful — players
 * can't infinite-rest mid-dungeon.
 *
 * Each class branch below maps to a 2024 PHB short-rest recharge:
 * Fighter (Second Wind, Action Surge), Bard L5+ (Bardic Inspiration),
 * Monk (Ki), Druid (Wild Shape; Land subclass also gets Natural
 * Recovery), Cleric/Paladin (Channel Divinity), Battle Master
 * (Superiority Dice), Warlock (Pact slots). Species recharges:
 * Dragonborn breath weapon, Goliath large form, Orc adrenaline rush.
 */
export const handleShortRest: ActionHandler<{ type: 'short_rest' }> = (ctx) => {
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot rest while in combat.';
    return;
  }
  if (!canRestInRoom(ctx.st, ctx.seed)) {
    ctx.narrative = 'You cannot rest here — an enemy is present.';
    return;
  }
  if ((ctx.st.short_rested_rooms ?? []).includes(ctx.roomId)) {
    ctx.narrative = 'You have already rested in this room.';
    return;
  }
  if ((ctx.char.hit_dice_remaining ?? 0) <= 0) {
    ctx.narrative = 'You have no hit dice remaining.';
    return;
  }
  if (ctx.char.hp >= ctx.char.max_hp) {
    ctx.narrative = 'You are already at full health.';
    return;
  }

  const hdRoll = rollDice(`1d${ctx.char.hit_die ?? 8}`) + abilityMod(ctx.char.con);
  const hdHealed = Math.max(1, hdRoll);
  const next = { ...ctx.char };
  next.hp = Math.min(next.max_hp, next.hp + hdHealed);
  next.hit_dice_remaining = Math.max(0, (next.hit_dice_remaining ?? 1) - 1);
  ctx.st = {
    ...ctx.st,
    short_rested_rooms: [...(ctx.st.short_rested_rooms ?? []), ctx.roomId],
  };

  // Short-rest resource refreshes. Multiclass: a Fighter / Cleric
  // short rest refreshes BOTH classes' short-rest pools — so use
  // `hasClass` (any class match), and use per-class levels for level-
  // gated refreshes (Channel Divinity at cleric L6, Bardic Inspiration
  // at bard L5).
  const srUses = { ...(next.class_resource_uses ?? {}) };
  if (next.species === 'dragonborn') delete srUses.breath_weapon_used;
  if (next.species === 'goliath') delete srUses.large_form_used;
  if (next.species === 'orc') delete srUses.adrenaline_rush_used;
  if (hasClass(next, 'fighter')) {
    delete srUses.second_wind;
    delete srUses.action_surge;
  }
  if (hasClass(next, 'bard') && getClassLevel(next, 'bard') >= 5) {
    delete srUses.bardic_inspiration;
  }
  if (hasClass(next, 'monk')) delete srUses.ki_points;
  if (hasClass(next, 'druid')) srUses.wild_shape = 2;
  let naturalRecoveryNarr = '';
  if (hasClass(next, 'druid') && next.subclass === 'land' && !(srUses.natural_recovery_used ?? 0)) {
    // Natural Recovery budget = ⌈Druid level / 2⌉ (Land Druid feature).
    let budget = Math.ceil(getClassLevel(next, 'druid') / 2);
    const slotsMax = next.spell_slots_max ?? {};
    const slotsUsedSr = { ...(next.spell_slots_used ?? {}) };
    const recovered: number[] = [];
    for (const lvlKey of Object.keys(slotsMax)
      .map(Number)
      .sort((a, b) => a - b)) {
      while (budget >= lvlKey && (slotsUsedSr[lvlKey] ?? 0) > 0) {
        slotsUsedSr[lvlKey] = (slotsUsedSr[lvlKey] ?? 0) - 1;
        budget -= lvlKey;
        recovered.push(lvlKey);
      }
    }
    if (recovered.length > 0) {
      next.spell_slots_used = slotsUsedSr;
      srUses.natural_recovery_used = 1;
      naturalRecoveryNarr = ` 🌿 Natural Recovery — restored ${recovered.length} slot(s) [${recovered.join(', ')}].`;
    }
  }
  if (hasClass(next, 'cleric') || hasClass(next, 'paladin')) {
    // Channel Divinity scales with cleric/paladin level (use the higher
    // of the two for multi-class).
    const cdLvl = Math.max(getClassLevel(next, 'cleric'), getClassLevel(next, 'paladin'));
    srUses.channel_divinity = cdLvl >= 6 ? 2 : 1;
  }
  delete srUses.colossus_slayer_used;
  if (hasClass(next, 'warlock')) {
    // Warlock pact slots refresh on short rest. Multi-class warlock
    // separation isn't modeled yet (see services/multiclass.ts notes)
    // — uses warlock level for pact lookup.
    next.spell_slots_max = spellSlotsForClassLevel('warlock', getClassLevel(next, 'warlock'));
    next.spell_slots_used = {};
    delete srUses.fey_presence_used;
  }
  next.class_resource_uses = srUses;
  ctx.char = next;

  const hdRemain = next.hit_dice_remaining;
  const shortRestFlavor = ctx.context.narratives.shortRest
    ? pick(ctx.context.narratives.shortRest)
        .replace(/{name}/g, next.name)
        .replace(/{hpGained}/g, String(hdHealed))
        .replace(/{hpNow}/g, String(next.hp))
        .replace(/{hpMax}/g, String(next.max_hp)) + ' '
    : '';
  ctx.narrative = `${shortRestFlavor}${next.name} takes a short rest, spending a d${next.hit_die ?? 8} — ${hdHealed} HP recovered (${hdRemain} hit ${hdRemain === 1 ? 'die' : 'dice'} remaining, now ${next.hp}/${next.max_hp}).${naturalRecoveryNarr}`;
};

/**
 * `long_rest`: PHB p.197 — full HP, half-of-level hit dice back, all
 * spell slots restored, exhaustion -1, all conditions cleared (except
 * exhaustion which only drops by 1). One per session (tracked via
 * `state.long_rested`).
 *
 * Class-resource recharges: rage uses, wild shape, sorcery points, ki,
 * channel divinity. Per-rest flags cleared: action surge, second wind,
 * colossus slayer, sacred weapon. Species: human gets Heroic
 * Inspiration; orc/tiefling racial 1/long-rest uses reset.
 */
export const handleLongRest: ActionHandler<{ type: 'long_rest' }> = (ctx) => {
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot rest while in combat.';
    return;
  }
  if (!canRestInRoom(ctx.st, ctx.seed)) {
    ctx.narrative = 'You cannot rest here — an enemy is present.';
    return;
  }
  if (ctx.st.long_rested ?? false) {
    ctx.narrative = 'You have already taken a long rest this session.';
    return;
  }

  const restLines: string[] = [];
  const restedChars = ctx.st.characters.map((c) => {
    if (c.dead) return c;
    const recovered = Math.max(1, Math.floor(c.level / 2));
    const newHd = Math.min(c.level, (c.hit_dice_remaining ?? 0) + recovered);
    restLines.push(`${c.name}: HP ${c.hp}→${c.max_hp}, HD ${c.hit_dice_remaining ?? 0}→${newHd}`);
    const charFeatures = ctx.context.classFeatures?.[c.character_class] ?? [];
    const restoredUses: Record<string, number> = { ...(c.class_resource_uses ?? {}) };
    if (charFeatures.includes('rage')) restoredUses.rage_uses = rageUsesMax(c.level);
    if (charFeatures.includes('wild_shape')) restoredUses.wild_shape = 2;
    delete restoredUses.natural_recovery_used;
    if (charFeatures.includes('sorcery_points')) restoredUses.sorcery_points = c.level;
    if (charFeatures.includes('ki')) restoredUses.ki_points = c.level;
    if (charFeatures.includes('channel_divinity'))
      restoredUses.channel_divinity = c.level >= 6 ? 2 : 1;
    delete restoredUses.action_surge;
    delete restoredUses.second_wind;
    delete restoredUses.colossus_slayer_used;
    delete restoredUses.sacred_weapon_active;
    const newExhaustion = Math.max(0, (c.exhaustion_level ?? 0) - 1);
    const humanGrant = c.species === 'human';
    if (c.species === 'orc') delete restoredUses.relentless_endurance_used;
    if (c.species === 'tiefling') delete restoredUses.tiefling_rebuke_used;
    if (c.species === 'aasimar') {
      delete restoredUses.healing_hands_used;
      delete restoredUses.celestial_revelation_used;
      delete restoredUses.celestial_revelation_rounds;
    }
    // 2024 PHB Celestial Warlock Healing Light pool — refills on
    // long rest.
    if (c.subclass === 'celestial' && hasClass(c, 'warlock')) {
      delete restoredUses.healing_light_used;
    }
    // 2024 PHB Land Druid Land's Aid uses — refills on long rest.
    // (RAW: Channel Nature is short-rest, but pansori MVP is
    // long-rest only.)
    if (c.subclass === 'land' && hasClass(c, 'druid')) {
      delete restoredUses.lands_aid_used;
    }
    const restoredUsesWithFeats = resetFeatLongRestResources(c, ctx.context, restoredUses);
    const refreshed = {
      ...c,
      hp: c.max_hp,
      temp_hp: 0,
      hit_dice_remaining: newHd,
      conditions: [],
      condition_durations: {},
      condition_sources: {},
      class_resource_uses: restoredUsesWithFeats,
      exhaustion_level: newExhaustion,
      spell_slots_used: {},
      inspiration: humanGrant ? true : c.inspiration,
      // Aasimar Celestial Revelation — ends on long rest if still
      // active (the 1-minute timer almost always ticks out before a
      // long rest, but clear defensively).
      celestial_revelation_variant: undefined,
      // 2024 PHB Mage Armor — 8-hour duration, ends on long rest.
      // Shield of Faith is concentration so it'd normally end well
      // before a rest, but clear defensively.
      mage_armor_active: undefined,
      shield_of_faith_active: undefined,
      // 2024 PHB movement modes — fly is the only one with purely
      // short-duration sources today (Fly spell, Aasimar Radiant
      // Soul transformation). Climb / swim grants from Athlete and
      // Sea Druid Aquatic Affinity are PERMANENT and applied at
      // feat-take / subclass-select time, so we must NOT clear
      // them on rest. Defensive fly clear handles the case where
      // an Aasimar's 1-minute transformation overruns into a rest.
      fly_speed_ft: undefined,
      // 2024 PHB Diviner Wizard Portent — roll 2 d20s on each long
      // rest (3 at L14+). Stored on the character; player can use
      // them to replace rolls later (interception not wired yet).
      portent_dice:
        c.subclass === 'diviner' && hasClass(c, 'wizard')
          ? [
              rollDice('1d20'),
              rollDice('1d20'),
              ...(getClassLevel(c, 'wizard') >= 14 ? [rollDice('1d20')] : []),
            ]
          : undefined,
    };
    // Recompute AC after clearing the magical buffs so the stored
    // `ac` field reflects the post-rest state.
    refreshed.ac = computeTotalAc(
      refreshed.dex,
      refreshed.equipped_armor,
      refreshed.equipped_shield,
      refreshed.inventory ?? [],
      ctx.context.lootTable,
      false,
      false
    );
    return refreshed;
  });
  ctx.st = { ...ctx.st, characters: restedChars, long_rested: true };
  ctx.char = { ...restedChars[ctx.safeIdx] };
  const longRestFlavor = ctx.context.narratives.longRest
    ? pick(ctx.context.narratives.longRest).replace(/{party}/g, restLines.join('; ')) + ' '
    : '';
  ctx.narrative = `${longRestFlavor}The party takes a long rest. ${restLines.join('; ')}.`;
};
