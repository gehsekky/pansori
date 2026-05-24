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
import { defenseAcBonus } from '../fightingStyle.js';
import { resetFeatLongRestResources } from '../feats.js';
import { updatePcActor } from './actor.js';

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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take a short rest.' };
  const { char } = ctx.actor;
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
  if ((char.hit_dice_remaining ?? 0) <= 0) {
    ctx.narrative = 'You have no hit dice remaining.';
    return;
  }
  if (char.hp >= char.max_hp) {
    ctx.narrative = 'You are already at full health.';
    return;
  }

  const hdRoll = rollDice(`1d${char.hit_die ?? 8}`) + abilityMod(char.con);
  const hdHealed = Math.max(1, hdRoll);
  const next = { ...char };
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
  let arcaneRecoveryNarr = '';
  if (hasClass(next, 'wizard') && !(srUses.arcane_recovery_used ?? 0)) {
    // SRD: Arcane Recovery (Wizard L1) — on finishing a short rest, recover
    // expended spell slots totaling no more than ⌈Wizard level / 2⌉ combined
    // levels, none of them level 6 or higher; once per long rest. Same greedy
    // loop as the Land Druid's Natural Recovery (lowest-level slots first,
    // maximizing the count recovered), with the level-6+ carve-out. The player
    // chooses which slots RAW; pansori auto-resolves (see TODO RE-2).
    let budget = Math.ceil(getClassLevel(next, 'wizard') / 2);
    const slotsMax = next.spell_slots_max ?? {};
    const slotsUsedAr = { ...(next.spell_slots_used ?? {}) };
    const recovered: number[] = [];
    for (const lvlKey of Object.keys(slotsMax)
      .map(Number)
      .filter((l) => l <= 5)
      .sort((a, b) => a - b)) {
      while (budget >= lvlKey && (slotsUsedAr[lvlKey] ?? 0) > 0) {
        slotsUsedAr[lvlKey] = (slotsUsedAr[lvlKey] ?? 0) - 1;
        budget -= lvlKey;
        recovered.push(lvlKey);
      }
    }
    if (recovered.length > 0) {
      next.spell_slots_used = slotsUsedAr;
      srUses.arcane_recovery_used = 1;
      arcaneRecoveryNarr = ` 📖 Arcane Recovery — restored ${recovered.length} slot(s) [${recovered.join(', ')}].`;
    }
  }
  if (hasClass(next, 'cleric') || hasClass(next, 'paladin')) {
    // Channel Divinity scales with cleric/paladin level (use the higher
    // of the two for multi-class).
    const cdLvl = Math.max(getClassLevel(next, 'cleric'), getClassLevel(next, 'paladin'));
    srUses.channel_divinity = cdLvl >= 6 ? 2 : 1;
  }
  delete srUses.colossus_slayer_used;
  if (hasClass(next, 'rogue')) delete srUses.stroke_of_luck; // Stroke of Luck — short OR long rest
  if (hasClass(next, 'barbarian')) delete srUses.relentless_rage_used; // Relentless Rage DC resets to 10
  if (hasClass(next, 'warlock')) {
    // Warlock pact slots refresh on short rest. Multi-class warlock
    // separation isn't modeled yet (see services/multiclass.ts notes)
    // — uses warlock level for pact lookup.
    next.spell_slots_max = spellSlotsForClassLevel('warlock', getClassLevel(next, 'warlock'));
    next.spell_slots_used = {};
  }
  next.class_resource_uses = srUses;
  updatePcActor(ctx, next);

  const hdRemain = next.hit_dice_remaining;
  const shortRestFlavor = ctx.context.narratives.shortRest
    ? pick(ctx.context.narratives.shortRest)
        .replace(/{name}/g, next.name)
        .replace(/{hpGained}/g, String(hdHealed))
        .replace(/{hpNow}/g, String(next.hp))
        .replace(/{hpMax}/g, String(next.max_hp)) + ' '
    : '';
  ctx.narrative = `${shortRestFlavor}${next.name} takes a short rest, spending a d${next.hit_die ?? 8} — ${hdHealed} HP recovered (${hdRemain} hit ${hdRemain === 1 ? 'die' : 'dice'} remaining, now ${next.hp}/${next.max_hp}).${naturalRecoveryNarr}${arcaneRecoveryNarr}`;
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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take a long rest.' };
  const { safeIdx } = ctx.actor;
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
    delete restoredUses.lay_on_hands; // Paladin pool replenishes on a long rest
    delete restoredUses.indomitable; // Fighter Indomitable rerolls reset on a long rest
    delete restoredUses.stroke_of_luck; // Rogue Stroke of Luck resets on a long rest too
    delete restoredUses.relentless_rage_used; // Barbarian Relentless Rage DC resets on a long rest too
    delete restoredUses.persistent_rage_used; // Barbarian Persistent Rage refresh available again after a long rest
    delete restoredUses.uncanny_metabolism_used; // Monk Uncanny Metabolism refresh available again after a long rest
    delete restoredUses.arcane_recovery_used; // Wizard Arcane Recovery available again after a long rest
    const newExhaustion = Math.max(0, (c.exhaustion_level ?? 0) - 1);
    const humanGrant = c.species === 'human';
    if (c.species === 'orc') delete restoredUses.relentless_endurance_used;
    if (c.species === 'tiefling') delete restoredUses.tiefling_rebuke_used;
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
      // 2024 PHB Mage Armor — 8-hour duration, ends on long rest.
      // Shield of Faith is concentration so it'd normally end well
      // before a rest, but clear defensively.
      mage_armor_active: undefined,
      shield_of_faith_active: undefined,
      // SRD Death Ward — 8-hour duration, ends on long rest if not
      // consumed mid-day by a near-death intercept.
      death_ward_active: undefined,
      // SRD Raise Dead / Resurrection penalty decays by 1 per long
      // rest until it reaches 0. `undefined` once cleared so memory-
      // /serialization-conscious paths don't carry a useless 0 around.
      revive_d20_penalty:
        (c.revive_d20_penalty ?? 0) > 1 ? (c.revive_d20_penalty ?? 0) - 1 : undefined,
      // 2024 PHB movement modes — fly is the only one with purely
      // short-duration sources today (the Fly spell). Climb / swim
      // grants come from species traits / subclass features that
      // persist across rests, so they're NOT cleared here.
      fly_speed_ft: undefined,
    };
    // Recompute AC after clearing the magical buffs so the stored
    // `ac` field reflects the post-rest state.
    refreshed.ac =
      computeTotalAc(
        refreshed.dex,
        refreshed.equipped_armor,
        refreshed.equipped_shield,
        refreshed.inventory ?? [],
        ctx.context.lootTable,
        false,
        false
      ) + defenseAcBonus(refreshed, ctx.context.lootTable);
    return refreshed;
  });
  ctx.st = { ...ctx.st, characters: restedChars, long_rested: true };
  updatePcActor(ctx, { ...restedChars[safeIdx] });
  const longRestFlavor = ctx.context.narratives.longRest
    ? pick(ctx.context.narratives.longRest).replace(/{party}/g, restLines.join('; ')) + ' '
    : '';
  ctx.narrative = `${longRestFlavor}The party takes a long rest. ${restLines.join('; ')}.`;
};
