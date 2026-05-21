import { BEAST_FORMS, SRD_SPECIES } from '../../contexts/srd/index.js';
import {
  abilityMod,
  applyDamageMultiplier,
  passivePerceptionDC,
  profBonus,
  rageDamageBonus,
  rageUsesMax,
  rollCritical,
  rollDice,
  skillCheck,
} from '../rulesEngine.js';
import {
  applyPartyLevelUps,
  consumeBardicForCheck,
  consumeInspirationForCheck,
  effectiveSpeed,
  endCombatState,
  getEnemyById,
  getItemData,
  inflictCondition,
  isHeavilyEncumbered,
  isRoomCleared,
  pushEvent,
  splitEncounterXp,
} from '../gameEngine.js';
import { distanceFeet, entitiesInCone } from '../gridEngine.js';
import type { ActionHandler } from './types.js';
import type { InventoryItem } from '../../types.js';
import { fmt } from '../narrativeFmt.js';

/**
 * `use_class_feature`: per-feature dispatch — the catch-all for every
 * class-feature/subclass-feature/species-feature that doesn't already
 * have its own action type. Largest single case in the engine.
 *
 * Lifted verbatim from gameEngine.ts in PR 16. Internal splits (per-
 * class files: barbarian.ts, fighter.ts, rogue.ts, monk.ts, cleric.ts,
 * etc.) land in follow-up PRs once the per-class boundaries are clear.
 *
 * Each feature branch is gated by a feature id (action.featureId) and
 * usually some combination of class/subclass/level. The dispatch table
 * is currently a series of `if` blocks rather than a single switch —
 * intentional, because some features (Channel Divinity variants,
 * Metamagic options) share a feature id and differentiate via subclass
 * or a secondary parameter.
 *
 * Features handled today: Rage, Action Surge, Second Wind, Tactical
 * Master, Bardic Inspiration, Reckless Attack, Cunning Action (Dash /
 * Disengage / Hide), Cunning Strike, Channel Divinity (Turn Undead /
 * Sacred Weapon / Guided Strike / Vow of Enmity / Nature's Wrath),
 * Wild Shape, Natural Recovery, Sneak Attack-style flurry attacks
 * (Monk), Ki abilities, Metamagic (Sorcerer), Eldritch Invocations
 * (Warlock), Patron features, racial 1/long-rest uses, Orc Adrenaline
 * Rush, Goliath Large Form, Dragonborn Breath Weapon, and the
 * "unknown feature" fallthrough.
 */
export const handleUseClassFeature: ActionHandler<{
  type: 'use_class_feature';
  featureId: string;
}> = (ctx, action) => {
  const features = ctx.context.classFeatures?.[ctx.char.character_class] ?? [];
  const fid = action.featureId;
  const dispatchKey = [ctx.char.character_class, ctx.char.subclass, fid].filter(Boolean).join('_');

  // ── Rage (Barbarian bonus action) ──────────────────────────────────────
  if (fid === 'rage') {
    if (!features.includes('rage')) {
      ctx.narrative = `${ctx.char.character_class} does not have Rage.`;
      return;
    }
    if (ctx.char.conditions.includes('raging')) {
      ctx.narrative = 'You are already raging!';
      return;
    }
    const rageUses = ctx.char.class_resource_uses?.rage_uses ?? rageUsesMax(ctx.char.level);
    if (rageUses <= 0) {
      ctx.narrative = 'No rage uses remaining. They recover on a long rest.';
      return;
    }
    ctx.char.conditions = [...ctx.char.conditions, 'raging'];
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      rage_uses: rageUses - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${ctx.char.name} RAGES! +${rageDamageBonus(ctx.char.level)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)`;
  }

  // ── Action Surge (Fighter) ─────────────────────────────────────────────
  else if (fid === 'action_surge') {
    if (ctx.char.character_class.toLowerCase() !== 'fighter') {
      ctx.narrative = 'Only Fighters have Action Surge.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Action Surge requires Fighter level 2.';
      return;
    }
    if ((ctx.char.class_resource_uses?.action_surge ?? 0) >= 1) {
      ctx.narrative = 'Action Surge already used this rest.';
      return;
    }
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), action_surge: 1 };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: false };
    ctx.narrative = `${ctx.char.name} uses Action Surge — one additional action this turn!`;
  }

  // ── Second Wind (Fighter bonus action) ────────────────────────────────
  // 2024 PHB: 2 uses at L1, 3 at L4, 4 at L10. Recovers on short rest.
  // 2024 PHB Fighter L9 — Tactical Master mastery swap. Pre-arms the next
  // attack to apply the chosen mastery (Push/Sap/Slow) instead of the
  // weapon's printed one. No action cost; consumes the slot in
  // `turn_actions` so a Fighter can't stack multiple swaps in one turn.
  else if (
    fid === 'tactical_master_push' ||
    fid === 'tactical_master_sap' ||
    fid === 'tactical_master_slow'
  ) {
    if (ctx.char.character_class.toLowerCase() !== 'fighter') {
      ctx.narrative = 'Only Fighters have Tactical Master.';
      return;
    }
    if (ctx.char.level < 9) {
      ctx.narrative = 'Tactical Master requires Fighter level 9.';
      return;
    }
    if (ctx.char.turn_actions.tactical_master_mastery) {
      ctx.narrative = 'Tactical Master already queued this turn.';
      return;
    }
    const m = fid.replace('tactical_master_', '') as 'push' | 'sap' | 'slow';
    ctx.char.turn_actions = { ...ctx.char.turn_actions, tactical_master_mastery: m };
    ctx.narrative = `${ctx.char.name} — Tactical Master: next attack will use ${m.toUpperCase()} mastery.`;
  } else if (fid === 'second_wind') {
    if (ctx.char.character_class.toLowerCase() !== 'fighter') {
      ctx.narrative = 'Only Fighters have Second Wind.';
      return;
    }
    const swMax = ctx.char.level >= 10 ? 4 : ctx.char.level >= 4 ? 3 : 2;
    const swUsed = ctx.char.class_resource_uses?.second_wind ?? 0;
    if (swUsed >= swMax) {
      ctx.narrative = `Second Wind exhausted (${swMax}/${swMax} used). Recovers on a short or long rest.`;
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const swHeal = rollDice('1d10') + ctx.char.level;
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + swHeal);
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      second_wind: swUsed + 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${ctx.char.name} uses Second Wind — healed ${swHeal} HP (now ${ctx.char.hp}/${ctx.char.max_hp}). (${swMax - swUsed - 1}/${swMax} remaining)`;
  }

  // ── Bardic Inspiration (Bard bonus action) ────────────────────────────
  else if (fid === 'bardic_inspiration') {
    if (ctx.char.character_class.toLowerCase() !== 'bard') {
      ctx.narrative = 'Only Bards have Bardic Inspiration.';
      return;
    }
    const biUses =
      ctx.char.class_resource_uses?.bardic_inspiration ??
      Math.max(1, Math.floor((ctx.char.cha - 10) / 2));
    if (biUses <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    // Pick an ally to grant the die to. Currently auto-picks the first
    // non-self living party member; a future PR can add a target picker.
    const ally = ctx.st.characters.find((c) => c.id !== ctx.char.id && !c.dead && c.hp > 0);
    if (!ally) {
      ctx.narrative = 'No ally to inspire.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biUses - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const inspDie =
      ctx.char.level >= 15
        ? 'd12'
        : ctx.char.level >= 10
          ? 'd10'
          : ctx.char.level >= 5
            ? 'd8'
            : 'd6';
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) =>
        c.id === ally.id ? { ...c, bardic_inspiration_die: inspDie } : c
      ),
    };
    ctx.narrative = `${ctx.char.name} grants Bardic Inspiration (${inspDie}) to ${ally.name}! (${biUses - 1} use${biUses - 1 === 1 ? '' : 's'} remaining)`;
  }

  // ── Reckless Attack (Barbarian L2+) — free toggle, no action cost ──────
  else if (fid === 'reckless_attack') {
    if (ctx.char.character_class.toLowerCase() !== 'barbarian') {
      ctx.narrative = 'Only Barbarians have Reckless Attack.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Reckless Attack requires Barbarian level 2.';
      return;
    }
    if (ctx.char.turn_actions.reckless) {
      ctx.narrative = 'You are already attacking recklessly this turn.';
      return;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, reckless: true };
    ctx.narrative = `${ctx.char.name} attacks recklessly! Advantage on STR melee attacks this turn — but enemies have advantage against you until your next turn.`;
  }

  // ── Cunning Action: Dash (Rogue L2+ bonus action) ─────────────────────
  else if (fid === 'cunning_action_dash') {
    if (ctx.char.character_class.toLowerCase() !== 'rogue') {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const caSpeed = effectiveSpeed(ctx.char);
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - caSpeed),
      },
    };
    ctx.narrative = `${ctx.char.name} uses Cunning Action: Dash — +${caSpeed} ft movement this turn.`;
  }

  // ── Cunning Action: Disengage (Rogue L2+ bonus action) ────────────────
  else if (fid === 'cunning_action_disengage') {
    if (ctx.char.character_class.toLowerCase() !== 'rogue') {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true, disengaged: true };
    ctx.narrative = `${ctx.char.name} uses Cunning Action: Disengage — no opportunity attacks when moving this turn.`;
  }

  // ── Cunning Action: Hide (Rogue L2+ bonus action) ─────────────────────
  else if (fid === 'cunning_action_hide') {
    if (ctx.char.character_class.toLowerCase() !== 'rogue') {
      ctx.narrative = 'Only Rogues have Cunning Action.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Cunning Action requires Rogue level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const sneakHideDC = ctx.enemyAlive ? passivePerceptionDC(ctx.enemy!.wis ?? 10) : 10;
    const hideProf = ctx.char.skill_proficiencies?.includes('Stealth') ?? false;
    const inspAdvHide = consumeInspirationForCheck(ctx.char);
    const bardicHideRoll = consumeBardicForCheck(ctx.char);
    const hideCheck = skillCheck(
      ctx.char.dex,
      sneakHideDC - bardicHideRoll,
      hideProf,
      ctx.char.level,
      isHeavilyEncumbered(ctx.char), // 2024 PHB: heavy encumbrance → disadv on DEX checks
      false,
      false,
      inspAdvHide,
      ctx.char.species === 'halfling'
    );
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    if (hideCheck.success) {
      // 2024 PHB: store the Stealth total as the hide DC. Enemies must
      // beat this with a Perception/Search check (or passive Perception)
      // to detect the hider before targeting them.
      ctx.char = inflictCondition(ctx.char, 'invisible');
      ctx.char.hide_dc = hideCheck.total;
      ctx.narrative = `${ctx.char.name} hides! (Stealth ${hideCheck.total} vs DC ${sneakHideDC} — success.) Hide DC = ${hideCheck.total}.`;
    } else {
      ctx.char.hide_dc = undefined;
      ctx.narrative = `${ctx.char.name} tries to hide but fails. (Stealth ${hideCheck.total} vs DC ${sneakHideDC})`;
    }
  }

  // ── 2024 PHB Rogue Cunning Strike (L5+) ──────────────────────────────
  // Pre-commits an effect that fires on the next Sneak Attack. No
  // action cost; the SA-die cost is paid in the attack handler.
  else if (fid.startsWith('cunning_strike_')) {
    if (ctx.char.character_class.toLowerCase() !== 'rogue') {
      ctx.narrative = 'Only Rogues have Cunning Strike.';
      return;
    }
    if (ctx.char.level < 5) {
      ctx.narrative = 'Cunning Strike requires Rogue level 5.';
      return;
    }
    const effect = fid.replace('cunning_strike_', '') as 'trip' | 'poison' | 'withdraw' | 'disarm';
    ctx.char.turn_actions = { ...ctx.char.turn_actions, cunning_strike_pending: effect };
    ctx.narrative = `${ctx.char.name} readies a Cunning Strike (${effect}) on the next Sneak Attack.`;
  }

  // ── Battle Master: Maneuver (Fighter L3+ subclass) ────────────────────
  else if (dispatchKey.includes('battle_master') && fid.startsWith('maneuver_')) {
    const sdPool = ctx.char.class_resource_uses?.superiority_dice ?? 4;
    if (sdPool <= 0) {
      ctx.narrative = 'No superiority dice remaining (recover on short rest).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      superiority_dice: sdPool - 1,
    };
    const sdRoll = rollDice('1d8');
    if (fid === 'maneuver_trip') {
      const tripSave =
        rollDice('1d20') +
        abilityMod((ctx.enemy as unknown as Record<string, number>)['str'] ?? 10);
      const tripDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.str);
      if (tripSave < tripDC) {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.roomId && e.isEnemy
              ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'] }
              : e
          ),
        };
        ctx.narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${ctx.enemy!.name} knocked prone! (STR save ${tripSave} vs DC ${tripDC})`;
      } else {
        ctx.narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${ctx.enemy!.name} resists the trip. (STR save ${tripSave} vs DC ${tripDC})`;
      }
    } else if (fid === 'maneuver_goading') {
      const goadSave =
        rollDice('1d20') +
        abilityMod((ctx.enemy as unknown as Record<string, number>)['wis'] ?? 10);
      const goadDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
      const goadSuccess = goadSave >= goadDC;
      ctx.st = pushEvent(ctx.st, {
        kind: 'save',
        characterId: ctx.enemy!.id,
        characterName: ctx.enemy!.name,
        ability: 'wis',
        roll: goadSave,
        dc: goadDC,
        success: goadSuccess,
        vs: 'Goading Attack',
        round: ctx.st.round ?? 1,
      });
      if (!goadSuccess) {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.roomId && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== 'goaded'), 'goaded'],
                }
              : e
          ),
        };
        ctx.st = pushEvent(ctx.st, {
          kind: 'condition_applied',
          targetId: ctx.enemy!.id,
          targetName: ctx.enemy!.name,
          condition: 'goaded',
          source: 'Goading Attack',
          round: ctx.st.round ?? 1,
        });
        ctx.narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${ctx.enemy!.name} goaded (disadvantage vs others)! (WIS save ${goadSave} vs DC ${goadDC})`;
      } else {
        ctx.narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${ctx.enemy!.name} resists. (WIS save ${goadSave} vs DC ${goadDC})`;
      }
    } else {
      // Generic maneuver: deal extra die damage
      ctx.narrative = `Maneuver — +${sdRoll} superiority die damage! (${sdPool - 1} dice remaining)`;
    }
  }

  // ── Monk: Flurry of Blows (2 unarmed strikes, 1 ki, bonus action) ────────
  else if (fid === 'flurry_of_blows') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'monk') {
      ctx.narrative = 'Only Monks have Flurry of Blows.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Flurry of Blows requires Monk level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    if (!ctx.char.turn_actions.action_used) {
      ctx.narrative = 'You must use your Attack action before using Flurry of Blows.';
      return;
    }
    const kiPool = ctx.char.class_resource_uses?.ki_points ?? ctx.char.level;
    if (kiPool <= 0) {
      ctx.narrative = 'No ki points remaining (recover on short rest).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: kiPool - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    // 2024 PHB Martial Arts die: 1d6 (L1) → 1d8 (L5) → 1d10 (L11) → 1d12 (L17).
    // Was 1d4/6/8/10 in 2014; 2024 bumps every tier by one die size.
    const martialDie =
      ctx.char.level >= 17 ? 12 : ctx.char.level >= 11 ? 10 : ctx.char.level >= 5 ? 8 : 6;
    const isOpenHand = ctx.char.subclass === 'open_hand';
    const monkDc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    let flurryNarrative = `${ctx.char.name} — Flurry of Blows (${kiPool - 1} ki remaining)!`;
    for (let i = 0; i < 2; i++) {
      const flurryTarget = ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy);
      if (!ctx.enemyAlive || !flurryTarget) return;
      const toHit = rollDice('1d20') + abilityMod(ctx.char.dex) + profBonus(ctx.char.level);
      if (toHit >= (ctx.enemy?.ac ?? 10)) {
        const dmg = Math.max(1, rollDice(`1d${martialDie}`) + abilityMod(ctx.char.dex));
        const curHp = ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy)?.hp ?? 0;
        const newHp = curHp - dmg;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.roomId && e.isEnemy ? { ...e, hp: Math.max(0, newHp) } : e
          ),
        };
        flurryNarrative += ` Strike ${i + 1}: hit (${toHit}) — ${dmg} bludgeoning.${newHp <= 0 ? ' (killed)' : ''}`;
        // Way of the Open Hand (PHB p.79) — Open Hand Technique. Each
        // Flurry hit forces the target to make a DEX save (Monk DC) or
        // be knocked prone. (RAW lets the player choose between prone /
        // push 15 ft / no reactions; prone is the most universally
        // valuable for the engine's combat model so we auto-pick it.)
        if (isOpenHand && newHp > 0) {
          const enemyDex = (ctx.enemy?.dex ?? 10) as number;
          const dexSave = rollDice('1d20') + abilityMod(enemyDex);
          const dexSuccess = dexSave >= monkDc;
          ctx.st = pushEvent(ctx.st, {
            kind: 'save',
            characterId: ctx.enemy?.id ?? ctx.roomId,
            characterName: ctx.enemy?.name ?? 'target',
            ability: 'dex',
            roll: dexSave,
            dc: monkDc,
            success: dexSuccess,
            vs: 'Open Hand Technique',
            round: ctx.st.round ?? 1,
          });
          if (!dexSuccess) {
            ctx.st = {
              ...ctx.st,
              entities: (ctx.st.entities ?? []).map((e) =>
                e.id === ctx.roomId && e.isEnemy
                  ? {
                      ...e,
                      conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                    }
                  : e
              ),
            };
            ctx.st = pushEvent(ctx.st, {
              kind: 'condition_applied',
              targetId: ctx.enemy?.id ?? ctx.roomId,
              targetName: ctx.enemy?.name ?? 'target',
              condition: 'prone',
              source: 'Open Hand Technique',
              round: ctx.st.round ?? 1,
            });
            flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — prone!`;
          } else {
            flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — resists.`;
          }
        }
        if (newHp <= 0) {
          const split = splitEncounterXp(ctx.st, ctx.char.id, ctx.enemy?.xp ?? 10);
          ctx.st = split.st;
          ctx.char.xp = (ctx.char.xp || 0) + split.share;
          flurryNarrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
          ctx.st.enemies_killed = [...ctx.st.enemies_killed, ctx.roomId];
          ctx.st = endCombatState(ctx.st);
          return;
        }
      } else {
        flurryNarrative += ` Strike ${i + 1}: miss (${toHit}).`;
      }
    }
    ctx.narrative = flurryNarrative;
  }

  // ── Monk: Step of the Wind (Dash or Disengage, 1 ki, bonus action) ───────
  // 2024 PHB Patient Defense — Dodge as a bonus action. Free 1/turn at
  // L2+; spending 1 DP also grants advantage on the next DEX save before
  // your next turn.
  else if (fid === 'patient_defense_free' || fid === 'patient_defense_dp') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'monk') {
      ctx.narrative = 'Only Monks have Patient Defense.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Patient Defense requires Monk level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const isFree = fid === 'patient_defense_free';
    if (isFree && ctx.char.turn_actions.monk_free_used) {
      ctx.narrative = "You've already used your free monk bonus action this turn.";
      return;
    }
    const kiPoolPD = ctx.char.class_resource_uses?.ki_points ?? ctx.char.level;
    if (!isFree && kiPoolPD <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return;
    }
    if (!isFree) {
      ctx.char.class_resource_uses = {
        ...(ctx.char.class_resource_uses ?? {}),
        ki_points: kiPoolPD - 1,
      };
    }
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      dodging: true,
      ...(isFree ? { monk_free_used: true } : {}),
    };
    ctx.narrative = isFree
      ? `${ctx.char.name} — Patient Defense (free): assumes a defensive stance. Attacks against have disadvantage until next turn.`
      : `${ctx.char.name} — Patient Defense (1 DP): defensive stance + advantage on next DEX save. (${kiPoolPD - 1} DP remaining)`;
  }

  // 2024 PHB Step of the Wind — free 1/turn variants (single effect) +
  // 1-DP variant (Dash AND Disengage).
  else if (fid === 'step_of_wind_free_dash' || fid === 'step_of_wind_free_disengage') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'monk') {
      ctx.narrative = 'Only Monks have Step of the Wind.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Step of the Wind requires Monk level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    if (ctx.char.turn_actions.monk_free_used) {
      ctx.narrative = "You've already used your free monk bonus action this turn.";
      return;
    }
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      monk_free_used: true,
    };
    if (fid === 'step_of_wind_free_dash') {
      const sw = effectiveSpeed(ctx.char);
      ctx.st = {
        ...ctx.st,
        movement_used: {
          ...(ctx.st.movement_used ?? {}),
          [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - sw),
        },
      };
      ctx.narrative = `${ctx.char.name} — Step of the Wind: Dash (free)! +${sw} ft movement.`;
    } else {
      ctx.char.turn_actions = { ...ctx.char.turn_actions, disengaged: true };
      ctx.narrative = `${ctx.char.name} — Step of the Wind: Disengage (free)! No opportunity attacks when moving.`;
    }
  } else if (fid === 'step_of_wind_dash' || fid === 'step_of_wind_disengage') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'monk') {
      ctx.narrative = 'Only Monks have Step of the Wind.';
      return;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Step of the Wind requires Monk level 2.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const kiPool2 = ctx.char.class_resource_uses?.ki_points ?? ctx.char.level;
    if (kiPool2 <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: kiPool2 - 1,
    };
    // 2024 PHB: spending 1 DP gives BOTH Dash and Disengage. The legacy
    // `step_of_wind_disengage` id is kept for back-compat but now also
    // dashes. `step_of_wind_dash` does the same.
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      disengaged: true,
    };
    const stwSpeed = effectiveSpeed(ctx.char);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - stwSpeed),
      },
    };
    ctx.narrative = `${ctx.char.name} — Step of the Wind (1 DP): Dash +${stwSpeed} ft AND Disengage. (${kiPool2 - 1} DP remaining)`;
  }

  // ── Monk: Stunning Strike (1 ki, after a hit) ────────────────────────────
  else if (fid === 'stunning_strike') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'monk') {
      ctx.narrative = 'Only Monks have Stunning Strike.';
      return;
    }
    if (ctx.char.level < 5) {
      ctx.narrative = 'Stunning Strike requires Monk level 5.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return;
    }
    // 2024 PHB: Stunning Strike is once per turn (was per-hit in 2014).
    if (ctx.char.turn_actions.monk_stunning_strike_used) {
      ctx.narrative = 'Stunning Strike already used this turn.';
      return;
    }
    const kiPool3 = ctx.char.class_resource_uses?.ki_points ?? ctx.char.level;
    if (kiPool3 <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: kiPool3 - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, monk_stunning_strike_used: true };
    const stunDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    const conSave =
      rollDice('1d20') + abilityMod((ctx.enemy as unknown as Record<string, number>)['con'] ?? 10);
    const stunSuccess = conSave >= stunDC;
    ctx.st = pushEvent(ctx.st, {
      kind: 'save',
      characterId: ctx.enemy!.id,
      characterName: ctx.enemy!.name,
      ability: 'con',
      roll: conSave,
      dc: stunDC,
      success: stunSuccess,
      vs: 'Stunning Strike',
      round: ctx.st.round ?? 1,
    });
    if (!stunSuccess) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === ctx.roomId && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'stunned'), 'stunned'],
              }
            : e
        ),
      };
      ctx.st = pushEvent(ctx.st, {
        kind: 'condition_applied',
        targetId: ctx.enemy!.id,
        targetName: ctx.enemy!.name,
        condition: 'stunned',
        source: 'Stunning Strike',
        round: ctx.st.round ?? 1,
      });
      ctx.narrative = `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${ctx.enemy!.name} is stunned until the end of your next turn! (${kiPool3 - 1} ki remaining)`;
    } else {
      ctx.narrative = `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${ctx.enemy!.name} resists. (${kiPool3 - 1} ki remaining)`;
    }
  }

  // ── Way of Shadow: Shadow Arts (PHB p.80) ────────────────────────────────
  // The L3 Shadow Monk learns to cast shadow-aligned spells via ki. Our
  // model collapses the cantrip/spell list into a single 2-ki action
  // that grants the `invisible` condition for 3 rounds — represents
  // "step into magical darkness" tactically.
  else if (fid === 'shadow_arts') {
    if (ctx.char.subclass !== 'shadow' || ctx.char.character_class.toLowerCase() !== 'monk') {
      ctx.narrative = 'Only Way of Shadow Monks have Shadow Arts.';
      return;
    }
    if (ctx.char.level < 3) {
      ctx.narrative = 'Shadow Arts requires Monk level 3.';
      return;
    }
    const kiSa = ctx.char.class_resource_uses?.ki_points ?? ctx.char.level;
    if (kiSa < 2) {
      ctx.narrative = 'Need 2 ki points for Shadow Arts.';
      return;
    }
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), ki_points: kiSa - 2 };
    ctx.char.conditions = [...ctx.char.conditions.filter((c) => c !== 'invisible'), 'invisible'];
    ctx.char.condition_durations = {
      ...(ctx.char.condition_durations ?? {}),
      invisible: 3,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
    ctx.usedInitiative = true;
    ctx.narrative = `🌑 ${ctx.char.name} weaves Shadow Arts — invisible for 3 rounds. (${kiSa - 2} ki remaining)`;
  }

  // ── Path of the Berserker — Frenzy (PHB p.49) ────────────────────────────
  // While raging, make a single melee weapon attack as a bonus action.
  // Damage uses the equipped weapon's die + STR mod + rage bonus, matching
  // the regular attack handler's pattern but in a self-contained roll.
  // RAW: when rage ends, you suffer one level of exhaustion. Deferred —
  // tracking "rage ended after Frenzy used this round" needs more state.
  else if (fid === 'frenzy_attack') {
    if (
      ctx.char.subclass !== 'berserker' ||
      ctx.char.character_class.toLowerCase() !== 'barbarian'
    ) {
      ctx.narrative = 'Only Berserker Barbarians have Frenzy.';
      return;
    }
    if (!ctx.char.conditions.includes('raging')) {
      ctx.narrative = 'You must be raging to use Frenzy.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No ctx.enemy to Frenzy attack.';
      return;
    }
    const frWeapon = ctx.char.equipped_weapon
      ? getItemData(
          ctx.char.inventory?.find(
            (i) => i.instance_id === ctx.char.equipped_weapon
          ) as InventoryItem,
          ctx.context
        )
      : null;
    if (frWeapon?.range === 'ranged') {
      ctx.narrative = 'Frenzy requires a melee weapon.';
      return;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const frTarget = ctx.livingEnemiesInRoom[0] ?? ctx.enemy;
    const frToHit = rollDice('1d20') + abilityMod(ctx.char.str) + profBonus(ctx.char.level);
    if (frToHit >= (frTarget.ac ?? 10)) {
      const dmgDice = frWeapon?.damage ?? '1d4';
      const frDmg = Math.max(
        1,
        rollDice(dmgDice) + abilityMod(ctx.char.str) + rageDamageBonus(ctx.char.level)
      );
      const curHp = ctx.st.entities?.find((e) => e.id === frTarget.id && e.isEnemy)?.hp ?? 0;
      const newHp = Math.max(0, curHp - frDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === frTarget.id && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative = `💢 ${ctx.char.name} — Frenzy! (${frToHit} hits AC ${frTarget.ac}) ${frDmg} ${frWeapon?.damageType ?? 'bludgeoning'}${newHp <= 0 ? ` — ${frTarget.name} falls!` : ''}`;
      if (newHp <= 0) {
        const split = splitEncounterXp(ctx.st, ctx.char.id, frTarget.xp ?? 10);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, frTarget.id];
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
          ctx.char.conditions = ctx.char.conditions.filter((c) => c !== 'raging');
        }
      }
    } else {
      ctx.narrative = `💢 ${ctx.char.name} — Frenzy! (${frToHit} vs AC ${frTarget.ac}) — miss.`;
    }
  }

  // ── Druid: Wild Shape ────────────────────────────────────────────────────
  else if (fid === 'wild_shape' || fid.startsWith('wild_shape_')) {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'druid') {
      ctx.narrative = 'Only Druids have Wild Shape.';
      return;
    }
    if (ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are already in Wild Shape. Attack or use Dismiss Wild Shape to end it.';
      return;
    }
    const wsUses = ctx.char.class_resource_uses?.wild_shape ?? 2;
    if (wsUses <= 0) {
      ctx.narrative = 'No Wild Shape uses remaining (recover on short rest).';
      return;
    }
    // Determine the form: 2024 PHB ships a Beast Forms catalog the
    // druid picks from. The choice generator surfaces one option per
    // form via `wild_shape_<formId>`. If just 'wild_shape' is invoked
    // (legacy/test), fall back to the lowest-CR form the druid can
    // access.
    const isMoon = ctx.char.subclass === 'moon';
    const formId = fid === 'wild_shape' ? '' : fid.replace('wild_shape_', '');
    const form = formId ? BEAST_FORMS[formId] : Object.values(BEAST_FORMS).find((f) => f.cr === 0);
    if (!form) {
      ctx.narrative = `Unknown beast form: ${formId}.`;
      return;
    }
    // Gate by CR access table.
    const maxCR = isMoon
      ? Math.max(1, Math.floor(ctx.char.level / 3))
      : ctx.char.level >= 8
        ? 1
        : ctx.char.level >= 4
          ? 0.5
          : 0.25;
    if (form.cr > maxCR) {
      ctx.narrative = `${form.name} requires a higher-CR form access (you can access CR ≤ ${maxCR}).`;
      return;
    }
    // 2024 PHB temp HP: base 2 × level, Moon 3 × level.
    const tempHp = (isMoon ? 3 : 2) * ctx.char.level;
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
  }

  // ── Druid: Dismiss Wild Shape ────────────────────────────────────────────
  else if (fid === 'dismiss_wild_shape') {
    if (!ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You are not in Wild Shape.';
      return;
    }
    ctx.char.wild_shape_form = undefined;
    ctx.char.conditions = ctx.char.conditions.filter((c) => c !== 'wild_shaped');
    ctx.narrative = `${ctx.char.name} reverts to their normal form.`;
  }

  // ── Circle of the Moon: Moon Healing (PHB p.69) ──────────────────────────
  // While shifted, spend a spell slot as a bonus action to heal 1d8 per
  // slot level. Limited to combat-active scenarios in practice (it's a
  // bonus action; outside combat the regular cure_wounds path is better).
  else if (fid === 'moon_healing') {
    if (ctx.char.subclass !== 'moon' || ctx.char.character_class.toLowerCase() !== 'druid') {
      ctx.narrative = 'Only Circle of the Moon Druids have Moon Healing.';
      return;
    }
    if (!ctx.char.conditions.includes('wild_shaped')) {
      ctx.narrative = 'You must be in Wild Shape to use Moon Healing.';
      return;
    }
    const mhSlotsMax = ctx.char.spell_slots_max ?? {};
    const mhSlotsUsed = ctx.char.spell_slots_used ?? {};
    const mhSlotLvl = Object.keys(mhSlotsMax)
      .map(Number)
      .filter((n) => n >= 1 && (mhSlotsMax[n] ?? 0) > (mhSlotsUsed[n] ?? 0))
      .sort((a, b) => a - b)[0];
    if (mhSlotLvl === undefined) {
      ctx.narrative = 'No spell slot available for Moon Healing.';
      return;
    }
    const heal = rollDice(`${mhSlotLvl}d8`);
    ctx.char.spell_slots_used = {
      ...mhSlotsUsed,
      [mhSlotLvl]: (mhSlotsUsed[mhSlotLvl] ?? 0) + 1,
    };
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + heal);
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `🌙 ${ctx.char.name} channels lunar energy — heals ${heal} HP (now ${ctx.char.hp}/${ctx.char.max_hp}). Spent lvl ${mhSlotLvl} slot.`;
  }

  // ── Sorcerer: Metamagic — Twinned Spell (1 sorcery point) ────────────────
  else if (fid === 'metamagic_twinned') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'sorcerer') {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return;
    }
    const spPool = ctx.char.class_resource_uses?.sorcery_points ?? ctx.char.level;
    if (spPool < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'twinned' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Twinned Spell! Your next spell will target a second creature. (${spPool - 1} sorcery points remaining)`;
  }

  // ── Sorcerer: Metamagic — Quickened Spell (2 sorcery points) ─────────────
  else if (fid === 'metamagic_quickened') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'sorcerer') {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    // SRD 5.2.1 p.67: can't activate Quickened if you've already cast a
    // level 1+ spell this turn.
    if (ctx.char.turn_actions.leveled_spell_cast) {
      ctx.narrative =
        'You have already cast a level 1+ spell this turn — Quickened Spell cannot be used.';
      return;
    }
    const spPool2 = ctx.char.class_resource_uses?.sorcery_points ?? ctx.char.level;
    if (spPool2 < 2) {
      ctx.narrative = 'Not enough sorcery points (need 2).';
      return;
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
  }

  // ── Sorcerer: Metamagic — Empowered Spell (1 sorcery point) ──────────────
  else if (fid === 'metamagic_empowered') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'sorcerer') {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return;
    }
    const spPool3 = ctx.char.class_resource_uses?.sorcery_points ?? ctx.char.level;
    if (spPool3 < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool3 - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'empowered' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Empowered Spell! You may reroll up to ${abilityMod(ctx.char.cha)} damage dice on your next spell. (${spPool3 - 1} sorcery points remaining)`;
  }

  // ── Warlock: Agonizing Blast invocation (passive — toggled on/off) ────────
  else if (fid === 'agonizing_blast') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'warlock') {
      ctx.narrative = 'Only Warlocks can take Agonizing Blast.';
      return;
    }
    const hasIt = ctx.char.feats?.includes('agonizing_blast') ?? false;
    if (hasIt) {
      ctx.narrative = 'You already have the Agonizing Blast invocation.';
      return;
    }
    ctx.char.feats = [...(ctx.char.feats ?? []), 'agonizing_blast'];
    ctx.narrative = `${ctx.char.name} gains the Agonizing Blast invocation — Eldritch Blast now adds +${abilityMod(ctx.char.cha)} force damage per beam.`;
  }

  // ── Warlock: Devil's Sight invocation ────────────────────────────────────
  else if (fid === 'devils_sight') {
    const cls = ctx.char.character_class.toLowerCase();
    if (cls !== 'warlock') {
      ctx.narrative = "Only Warlocks can take Devil's Sight.";
      return;
    }
    const hasIt2 = ctx.char.feats?.includes('devils_sight') ?? false;
    if (hasIt2) {
      ctx.narrative = "You already have the Devil's Sight invocation.";
      return;
    }
    ctx.char.feats = [...(ctx.char.feats ?? []), 'devils_sight'];
    ctx.narrative = `${ctx.char.name} gains Devil's Sight — you can see normally in magical darkness.`;
  }

  // ── Champion Fighter: Remarkable Athlete ────────────────────────────────
  else if (fid === 'remarkable_athlete') {
    ctx.narrative = `${ctx.char.name} — Remarkable Athlete: add +${Math.ceil(profBonus(ctx.char.level) / 2)} to uninvested STR/DEX/CON checks (passive).`;
  }

  // ── Abjurer Wizard: Arcane Ward ──────────────────────────────────────────
  else if (fid === 'arcane_ward') {
    if (ctx.char.subclass !== 'abjurer') {
      ctx.narrative = 'Only Abjurer Wizards have Arcane Ward.';
      return;
    }
    const wardHp = 2 * ctx.char.level;
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), arcane_ward: wardHp };
    ctx.narrative = `${ctx.char.name} creates an Arcane Ward with ${wardHp} HP. It absorbs damage before your HP is reduced.`;
  }

  // ── 2024 PHB Cleric: Divine Spark (universal Channel Divinity) ───────────
  // Action. Spend CD to deal 1d8 + WIS mod radiant damage to a target OR
  // heal a target ally the same amount. Default: damage the current ctx.enemy.
  else if (fid === 'divine_spark') {
    if (ctx.char.character_class.toLowerCase() !== 'cleric') {
      ctx.narrative = 'Only Clerics have Divine Spark.';
      return;
    }
    const cdUsesDS = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesDS <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesDS - 1,
    };
    const dsRoll = rollDice('1d8') + abilityMod(ctx.char.wis);
    // Read the CURRENT entity HP, not the ctx.seed's template HP — otherwise
    // Divine Spark resets the target to (full_hp - damage) and wipes
    // every prior turn's accumulated damage. (Vale playthrough log,
    // 2026-05-21: Ghoul jumped from 19 → 37 mid-combat after DS.)
    const enemyEntForDs = ctx.st.entities?.find((e) => e.id === ctx.enemy!.id && e.isEnemy);
    const currentDsHp = enemyEntForDs?.hp ?? ctx.enemy!.hp;
    const dsHp = Math.max(0, currentDsHp - dsRoll);
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.enemy!.id && e.isEnemy ? { ...e, hp: dsHp } : e
      ),
    };
    ctx.st = pushEvent(ctx.st, {
      kind: 'attack_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      targetId: ctx.enemy!.id,
      targetName: ctx.enemy!.name,
      damage: dsRoll,
      damageType: 'radiant',
      isCrit: false,
      toHit: 0,
      targetAc: ctx.enemy.ac,
      round: ctx.st.round ?? 1,
    });
    ctx.narrative = `✦ Divine Spark! ${ctx.enemy!.name} takes ${fmt.dmg(dsRoll)} radiant damage. (${cdUsesDS - 1} Channel Divinity remaining)`;
    if (dsHp <= 0) {
      const split = splitEncounterXp(ctx.st, ctx.char.id, ctx.enemy!.xp ?? 0);
      ctx.st = split.st;
      ctx.char.xp = (ctx.char.xp || 0) + split.share;
      ctx.narrative += ` ${ctx.enemy!.name} is destroyed.`;
      ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
    }
    ctx.usedInitiative = true;
  }

  // ── 2024 PHB Cleric: Turn Undead (universal Channel Divinity) ────────────
  // Magic Action (full action), per 2024 PHB p.74. All undead within 30 ft
  // must make a WIS save or be frightened of the cleric for 1 minute. They
  // can't willingly move closer; if affected they must Dash away when
  // possible. We model with the existing `frightened` condition.
  else if (fid === 'turn_undead') {
    if (ctx.char.character_class.toLowerCase() !== 'cleric') {
      ctx.narrative = 'Only Clerics have Turn Undead.';
      return;
    }
    const cdUsesTU = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesTU <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    if (ctx.char.turn_actions.action_used) {
      ctx.narrative = 'Action already used this turn.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesTU - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
    const tuDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    const selfEntTU = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    // Identify undead enemies. Convention: ctx.enemy name contains "skeleton",
    // "ghoul", "shadow", "zombie", "lich", "wraith", "undead" — RAW would
    // check creature type but our ctx.enemy templates don't carry that yet.
    const undeadKeywords = /skeleton|ghoul|shadow|zombie|lich|wraith|undead|crypt/i;
    const turnedIds: string[] = [];
    const lines: string[] = [];
    for (const e of ctx.st.entities ?? []) {
      if (!e.isEnemy || e.hp <= 0) continue;
      if (!selfEntTU) continue;
      const dist = Math.max(
        Math.abs(e.pos.x - selfEntTU.pos.x),
        Math.abs(e.pos.y - selfEntTU.pos.y)
      );
      if (dist > 6) continue; // 30 ft = 6 squares
      const enemyData = getEnemyById(ctx.seed, e.id);
      if (!enemyData || !undeadKeywords.test(enemyData.name)) continue;
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      if (save < tuDC) {
        turnedIds.push(e.id);
        lines.push(`${enemyData.name}: WIS ${save} vs DC ${tuDC} — turned!`);
        ctx.st = pushEvent(ctx.st, {
          kind: 'condition_applied',
          targetId: e.id,
          targetName: enemyData.name,
          condition: 'frightened',
          source: 'Turn Undead',
          round: ctx.st.round ?? 1,
        });
      } else {
        lines.push(`${enemyData.name}: WIS ${save} vs DC ${tuDC} — resists.`);
      }
    }
    if (turnedIds.length > 0) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          turnedIds.includes(e.id)
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
    }
    ctx.narrative =
      lines.length > 0
        ? `✦ Turn Undead! ${lines.join(' ')} (${cdUsesTU - 1} Channel Divinity remaining)`
        : `Turn Undead — no undead within 30 ft. (${cdUsesTU - 1} Channel Divinity remaining)`;
  }

  // ── 2024 PHB Cleric L5: Sear Undead ──────────────────────────────────────
  // Action. Replaces 2014 Destroy Undead. AoE radiant: each undead in 30 ft
  // takes Nd8 (N = cleric level) radiant damage; WIS save halves.
  // 2024 PHB Orc — Adrenaline Rush. Bonus action: gain the Dash action
  // (refunds full speed of movement this turn) and gain temp HP equal
  // to proficiency bonus. 1/short rest.
  else if (fid === 'adrenaline_rush') {
    if (ctx.char.species !== 'orc') {
      ctx.narrative = 'Only Orcs have Adrenaline Rush.';
      return;
    }
    if (ctx.char.class_resource_uses?.adrenaline_rush_used === 1) {
      ctx.narrative = 'Adrenaline Rush already used this short rest.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const arSpeed = effectiveSpeed(ctx.char);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - arSpeed),
      },
    };
    const arTemp = profBonus(ctx.char.level);
    const newTemp = Math.max(ctx.char.temp_hp ?? 0, arTemp);
    ctx.char.temp_hp = newTemp;
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      adrenaline_rush_used: 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `🪓 ${ctx.char.name} — Adrenaline Rush! +${arSpeed} ft movement (Dash) and ${arTemp} temp HP.`;
    ctx.usedInitiative = true;
  }

  // 2024 PHB Goliath — Large Form. Bonus action; the Goliath grows to
  // Large size for ~10 rounds (1 min RAW). Gains +10 ft speed (via
  // condition wired in `effectiveSpeed`) and is treated as Large for
  // any size-dependent interactions. 1/short rest.
  else if (fid === 'large_form') {
    if (ctx.char.species !== 'goliath') {
      ctx.narrative = 'Only Goliaths have Large Form.';
      return;
    }
    if (ctx.char.class_resource_uses?.large_form_used === 1) {
      ctx.narrative = 'Large Form already used this short rest.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      large_form_used: 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.char = inflictCondition(ctx.char, 'large_form');
    if (!ctx.char.condition_durations) ctx.char.condition_durations = {};
    ctx.char.condition_durations = { ...ctx.char.condition_durations, large_form: 10 };
    ctx.narrative = `🗿 ${ctx.char.name} swells to Large size! +10 ft speed and advantage on STR checks for 10 rounds.`;
    ctx.usedInitiative = true;
  }

  // 2024 PHB Dragonborn — Breath Weapon. Cone of damage emanating from
  // the dragonborn in the direction of the currently-targeted ctx.enemy.
  // DEX save for half; damage scales with level. 1/short rest.
  else if (fid === 'breath_weapon') {
    if (ctx.char.species !== 'dragonborn') {
      ctx.narrative = 'Only Dragonborn have a Breath Weapon.';
      return;
    }
    if (ctx.char.class_resource_uses?.breath_weapon_used === 1) {
      ctx.narrative = 'Breath Weapon already used — recovers on a short rest.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target to direct your breath at.';
      return;
    }
    const selfEntBW = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    const targetEntBW = ctx.st.entities?.find((e) => e.id === ctx.enemy!.id && e.isEnemy);
    if (!selfEntBW || !targetEntBW) {
      ctx.narrative = 'Breath Weapon needs a grid position to project the cone.';
      return;
    }
    const bwDice =
      ctx.char.level >= 17 ? 4 : ctx.char.level >= 11 ? 3 : ctx.char.level >= 5 ? 2 : 1;
    const bwDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.con);
    const bwDmgType = SRD_SPECIES.dragonborn?.resistances?.[0] ?? 'fire';
    const cone = entitiesInCone(selfEntBW.pos, targetEntBW.pos, 15, ctx.st.entities ?? []);
    const lines: string[] = [];
    let updatedEntities = ctx.st.entities ?? [];
    for (const ent of cone) {
      if (!ent.isEnemy || ent.hp <= 0) continue;
      const enemyData = getEnemyById(ctx.seed, ent.id);
      if (!enemyData) continue;
      const dexScore = enemyData.dex ?? 10;
      const save = rollDice('1d20') + abilityMod(dexScore);
      const fullDmg = rollDice(`${bwDice}d10`);
      const { damage: typedDmg, note } = applyDamageMultiplier(fullDmg, bwDmgType, enemyData);
      const dmg = save >= bwDC ? Math.floor(typedDmg / 2) : typedDmg;
      updatedEntities = updatedEntities.map((e) =>
        e.id === ent.id ? { ...e, hp: Math.max(0, e.hp - dmg) } : e
      );
      lines.push(
        `${enemyData.name}: DEX ${save} vs DC ${bwDC} — ${dmg} ${bwDmgType}${save >= bwDC ? ' (half)' : ''}${note ?? ''}`
      );
    }
    ctx.st = {
      ...ctx.st,
      entities: updatedEntities,
    };
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      breath_weapon_used: 1,
    };
    ctx.narrative =
      lines.length > 0
        ? `🐲 ${ctx.char.name}'s Breath Weapon (${bwDice}d10 ${bwDmgType}, 15-ft cone)! ${lines.join(' · ')}`
        : `${ctx.char.name} exhales a cone of ${bwDmgType} but no enemies are caught in it.`;
    ctx.usedInitiative = true;
    // Combat may have ended if everyone in the cone dropped.
    if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
      ctx.st = endCombatState(ctx.st);
    }
  } else if (fid === 'sear_undead') {
    if (ctx.char.character_class.toLowerCase() !== 'cleric') {
      ctx.narrative = 'Only Clerics have Sear Undead.';
      return;
    }
    if (ctx.char.level < 5) {
      ctx.narrative = 'Sear Undead requires Cleric level 5.';
      return;
    }
    const cdUsesSU = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesSU <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesSU - 1,
    };
    const suDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    const selfEntSU = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    const undeadRegex = /skeleton|ghoul|shadow|zombie|lich|wraith|undead|crypt/i;
    const lines: string[] = [];
    const newEntities = (ctx.st.entities ?? []).map((e) => {
      if (!e.isEnemy || e.hp <= 0 || !selfEntSU) return e;
      const dist = Math.max(
        Math.abs(e.pos.x - selfEntSU.pos.x),
        Math.abs(e.pos.y - selfEntSU.pos.y)
      );
      if (dist > 6) return e;
      const enemyData = getEnemyById(ctx.seed, e.id);
      if (!enemyData || !undeadRegex.test(enemyData.name)) return e;
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      const fullDmg = rollDice(`${ctx.char.level}d8`);
      const dmg = save >= suDC ? Math.floor(fullDmg / 2) : fullDmg;
      lines.push(
        `${enemyData.name}: WIS ${save} vs DC ${suDC} — ${dmg} radiant${save >= suDC ? ' (half)' : ''}`
      );
      return { ...e, hp: Math.max(0, e.hp - dmg) };
    });
    ctx.st = { ...ctx.st, entities: newEntities };
    ctx.narrative =
      lines.length > 0
        ? `☀️ Sear Undead! ${lines.join(' · ')} (${cdUsesSU - 1} Channel Divinity remaining)`
        : `Sear Undead — no undead within 30 ft. (${cdUsesSU - 1} Channel Divinity remaining)`;
    ctx.usedInitiative = true;
  }

  // ── Life Cleric: Preserve Life (Channel Divinity) ────────────────────────
  else if (fid === 'preserve_life') {
    if (ctx.char.subclass !== 'life') {
      ctx.narrative = 'Only Life Clerics have Preserve Life.';
      return;
    }
    const cdUses = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUses <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining (recover on short rest).';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUses - 1,
    };
    const poolHp = 5 * ctx.char.level;
    const woundedAllies = ctx.st.characters.filter(
      (c) => !c.dead && c.hp < c.max_hp && c.id !== ctx.char.id
    );
    let preserved = 0;
    let remaining = poolHp;
    const healedIds = new Map<string, number>(); // id → new hp
    const updatedChars = ctx.st.characters.map((c) => {
      if (!c.dead && c.hp < c.max_hp && c.id !== ctx.char.id && remaining > 0) {
        const half = Math.floor(c.max_hp / 2);
        if (c.hp >= half) return c;
        const heal = Math.min(remaining, half - c.hp);
        preserved += heal;
        remaining -= heal;
        const newHp = c.hp + heal;
        healedIds.set(c.id, newHp);
        return { ...c, hp: newHp };
      }
      return c;
    });
    ctx.st = {
      ...ctx.st,
      characters: updatedChars,
      // Sync grid entity HP for every PC who got healed so the
      // battlefield reflects the heal immediately. commitChar()
      // only updates the caster's entity, not the targets'.
      entities: (ctx.st.entities ?? []).map((e) =>
        !e.isEnemy && healedIds.has(e.id) ? { ...e, hp: healedIds.get(e.id)! } : e
      ),
    };
    // RAW: Preserve Life can't raise a creature above half its HP max.
    // When every wounded ally is already above half, the channel
    // divinity gets spent but heals nothing — surface that gate so
    // the player doesn't think the feature is broken.
    const eligibleCount = woundedAllies.filter((c) => c.hp < Math.floor(c.max_hp / 2)).length;
    if (preserved === 0) {
      const reason =
        woundedAllies.length === 0
          ? 'no wounded allies in range'
          : eligibleCount === 0
            ? 'every wounded ally is already above half HP'
            : 'no eligible target';
      ctx.narrative = `${ctx.char.name} — Preserve Life! No HP distributed (${reason}). (${cdUses - 1} Channel Divinity remaining)`;
    } else {
      ctx.narrative = `${ctx.char.name} — Preserve Life! Distributed ${preserved} HP among ${eligibleCount} eligible ally${eligibleCount === 1 ? '' : 'ies'} (pool: ${poolHp}). (${cdUses - 1} Channel Divinity remaining)`;
    }
  }

  // ── War Cleric: Guided Strike (Channel Divinity) ─────────────────────────
  else if (fid === 'guided_strike') {
    if (ctx.char.subclass !== 'war') {
      ctx.narrative = 'Only War Clerics have Guided Strike.';
      return;
    }
    const cdUsesWar = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesWar <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesWar - 1,
    };
    ctx.st = { ...ctx.st, guided_strike_active: true };
    ctx.narrative = `${ctx.char.name} — Guided Strike! Your next attack roll gains +10. (${cdUsesWar - 1} Channel Divinity remaining)`;
  }

  // ── Hunter Ranger: Hunter's Prey — Colossus Slayer ───────────────────────
  else if (fid === 'colossus_slayer') {
    if (ctx.char.subclass !== 'hunter') {
      ctx.narrative = 'Only Hunter Rangers have Colossus Slayer.';
      return;
    }
    const csTarget = ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy);
    if (!ctx.enemyAlive || !csTarget) {
      ctx.narrative = 'No living target.';
      return;
    }
    const enemyMaxHp =
      (ctx.enemy as unknown as Record<string, number>)['max_hp'] ?? csTarget.hp * 2;
    if (csTarget.hp >= enemyMaxHp) {
      ctx.narrative = 'Colossus Slayer only triggers on a bloodied (below max HP) target.';
      return;
    }
    if ((ctx.char.class_resource_uses?.colossus_slayer_used ?? 0) >= 1) {
      ctx.narrative = 'Colossus Slayer already triggered this turn.';
      return;
    }
    const csDmg = rollDice('1d8');
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      colossus_slayer_used: 1,
    };
    const csHp = (ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy)?.hp ?? 0) - csDmg;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.roomId && e.isEnemy ? { ...e, hp: Math.max(0, csHp) } : e
      ),
    };
    ctx.narrative = `Colossus Slayer! +${fmt.dmg(csDmg)} piercing damage on a bloodied foe (${csHp <= 0 ? 'killed' : `${fmt.hp(Math.max(0, csHp))} HP remaining`}).`;
    if (csHp <= 0) {
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, ctx.roomId];
      ctx.st = endCombatState(ctx.st);
    }
  }

  // ── Beastmaster Ranger: command animal companion (bonus action, PHB p.93)
  else if (fid === 'command_companion') {
    if (
      ctx.char.subclass !== 'beastmaster' ||
      ctx.char.character_class.toLowerCase() !== 'ranger'
    ) {
      ctx.narrative = 'Only Beastmaster Rangers can command an animal companion.';
      return;
    }
    if (ctx.char.level < 3) {
      ctx.narrative = 'Animal Companion unlocks at Ranger level 3.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const comp = ctx.st.entities?.find(
      (e) => e.isCompanion && e.companionOwnerId === ctx.char.id && e.hp > 0
    );
    if (!comp) {
      ctx.narrative = 'Your animal companion is unavailable.';
      return;
    }
    // Pick the nearest living ctx.enemy as the target
    const targetEnt = (ctx.st.entities ?? [])
      .filter((e) => e.isEnemy && e.hp > 0)
      .sort((a, b) => distanceFeet(comp.pos, a.pos) - distanceFeet(comp.pos, b.pos))[0];
    if (!targetEnt) {
      ctx.narrative = 'No living ctx.enemy in sight for the companion.';
      return;
    }
    const targetEnemy = getEnemyById(ctx.seed, targetEnt.id);
    if (!targetEnemy) {
      ctx.narrative = "Companion's target is unreachable.";
      return;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.usedInitiative = true;
    // Resolve the companion's bite attack against the target's AC
    const toHit = comp.toHit ?? 4;
    const dmgDice = comp.damage ?? '2d4+2';
    const compName = comp.companionName ?? 'companion';
    const attackRoll = rollDice('1d20');
    const total = attackRoll + toHit;
    if (attackRoll === 1) {
      ctx.narrative = `${compName} lunges but misses wildly! (d20:1+${toHit}=${total} vs AC ${targetEnemy.ac})`;
    } else if (attackRoll === 20 || total >= targetEnemy.ac) {
      const isCrit = attackRoll === 20;
      const dmg = isCrit ? rollCritical(dmgDice) : rollDice(dmgDice);
      const { damage: finalDmg, note } = applyDamageMultiplier(dmg, 'piercing', targetEnemy);
      const curHp = targetEnt.hp;
      const newHp = Math.max(0, curHp - finalDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetEnt.id && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative = `${compName} bites the ${targetEnemy.name}! ${finalDmg} piercing damage${isCrit ? ' (CRIT)' : ''} (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})${note}`;
      if (newHp <= 0) {
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, targetEnt.id];
        ctx.narrative += ` ${targetEnemy.name} falls!`;
        const xpGain = targetEnemy.xp ?? 10;
        const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
        }
      }
    } else {
      ctx.narrative = `${compName} bites at the ${targetEnemy.name} but misses. (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})`;
    }
  }

  // ── Devotion Paladin: Sacred Weapon (Channel Divinity) ───────────────────
  else if (fid === 'sacred_weapon') {
    if (ctx.char.subclass !== 'devotion') {
      ctx.narrative = 'Only Devotion Paladins have Sacred Weapon.';
      return;
    }
    const cdUsesDev = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesDev <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesDev - 1,
      sacred_weapon_active: 1,
    };
    const chaMod = abilityMod(ctx.char.cha);
    ctx.narrative = `${ctx.char.name} — Sacred Weapon! +${chaMod} to attack rolls for 1 minute (10 rounds). Your weapon gleams with divine light. (${cdUsesDev - 1} Channel Divinity remaining)`;
  }

  // ── Vengeance Paladin: Vow of Enmity (Channel Divinity) ──────────────────
  else if (fid === 'vow_of_enmity') {
    if (ctx.char.subclass !== 'vengeance') {
      ctx.narrative = 'Only Vengeance Paladins have Vow of Enmity.';
      return;
    }
    const cdUsesVen = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesVen <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesVen - 1,
    };
    ctx.st = { ...ctx.st, vow_of_enmity_target: ctx.roomId };
    ctx.narrative = `${ctx.char.name} — Vow of Enmity! You have advantage on all attack rolls against ${ctx.enemy?.name ?? 'your target'} for 1 minute. (${cdUsesVen - 1} Channel Divinity remaining)`;
  }

  // ── Vengeance Paladin: Abjure Enemy (Channel Divinity) ───────────────────
  else if (fid === 'abjure_enemy') {
    if (ctx.char.subclass !== 'vengeance') {
      ctx.narrative = 'Only Vengeance Paladins have Abjure Enemy.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return;
    }
    const cdUsesVen2 = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesVen2 <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesVen2 - 1,
    };
    const wisSave =
      rollDice('1d20') + abilityMod((ctx.enemy as unknown as Record<string, number>)['wis'] ?? 10);
    const frightenDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
    const abjureSuccess = wisSave >= frightenDC;
    ctx.st = pushEvent(ctx.st, {
      kind: 'save',
      characterId: ctx.enemy!.id,
      characterName: ctx.enemy!.name,
      ability: 'wis',
      roll: wisSave,
      dc: frightenDC,
      success: abjureSuccess,
      vs: 'Abjure Enemy',
      round: ctx.st.round ?? 1,
    });
    if (!abjureSuccess) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === ctx.roomId && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
      ctx.st = pushEvent(ctx.st, {
        kind: 'condition_applied',
        targetId: ctx.enemy!.id,
        targetName: ctx.enemy!.name,
        condition: 'frightened',
        source: 'Abjure Enemy',
        round: ctx.st.round ?? 1,
      });
      ctx.narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${ctx.enemy!.name} is frightened! (${cdUsesVen2 - 1} Channel Divinity remaining)`;
    } else {
      ctx.narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${ctx.enemy!.name} resists. (${cdUsesVen2 - 1} Channel Divinity remaining)`;
    }
    ctx.usedInitiative = true;
  }

  // ── Lore Bard: Cutting Words (reaction) ──────────────────────────────────
  else if (fid === 'cutting_words') {
    if (ctx.char.subclass !== 'lore') {
      ctx.narrative = 'Only Lore Bards have Cutting Words.';
      return;
    }
    if (ctx.char.turn_actions.reaction_used) {
      ctx.narrative = 'Reaction already used this turn.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return;
    }
    const biLeft = ctx.char.class_resource_uses?.bardic_inspiration ?? abilityMod(ctx.char.cha);
    if (biLeft <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biLeft - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, reaction_used: true };
    const cuttingDie =
      ctx.char.level >= 15 ? 12 : ctx.char.level >= 10 ? 10 : ctx.char.level >= 5 ? 8 : 6;
    const cuttingRoll = rollDice(`1d${cuttingDie}`);
    ctx.narrative = `${ctx.char.name} — Cutting Words! Subtract ${cuttingRoll} from ${ctx.enemy!.name}'s next attack roll or ability check this round. (${biLeft - 1} Bardic Inspiration remaining)`;
    ctx.st = { ...ctx.st, cutting_words_penalty: cuttingRoll };
  }

  // ── Archfey Warlock: Fey Presence (PHB p.109) ────────────────────────────
  else if (fid === 'fey_presence') {
    if (ctx.char.subclass !== 'archfey' || ctx.char.character_class.toLowerCase() !== 'warlock') {
      ctx.narrative = 'Only Archfey Warlocks have Fey Presence.';
      return;
    }
    if (ctx.char.class_resource_uses?.fey_presence_used) {
      ctx.narrative = 'Fey Presence already used — recovers on a short rest.';
      return;
    }
    const selfEnt = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    if (!selfEnt) {
      ctx.narrative = 'Fey Presence requires a grid position.';
      return;
    }
    const dc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
    const inRangeEnemies = (ctx.st.entities ?? []).filter(
      (e) => e.isEnemy && e.hp > 0 && distanceFeet(e.pos, selfEnt.pos) <= 10
    );
    if (inRangeEnemies.length === 0) {
      ctx.narrative = 'No enemies within 10 ft to ensnare with Fey Presence.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      fey_presence_used: 1,
    };
    const lines: string[] = [];
    const frightenedIds = new Set<string>();
    for (const e of inRangeEnemies) {
      const enemyData = getEnemyById(ctx.seed, e.id);
      const targetName = enemyData?.name ?? e.id;
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      const feySuccess = save >= dc;
      ctx.st = pushEvent(ctx.st, {
        kind: 'save',
        characterId: e.id,
        characterName: targetName,
        ability: 'wis',
        roll: save,
        dc,
        success: feySuccess,
        vs: 'Fey Presence',
        round: ctx.st.round ?? 1,
      });
      if (!feySuccess) {
        frightenedIds.add(e.id);
        lines.push(`${targetName}: WIS ${save} vs DC ${dc} — frightened!`);
        ctx.st = pushEvent(ctx.st, {
          kind: 'condition_applied',
          targetId: e.id,
          targetName,
          condition: 'frightened',
          source: 'Fey Presence',
          round: ctx.st.round ?? 1,
        });
      } else {
        lines.push(`${targetName}: WIS ${save} vs DC ${dc} — resists.`);
      }
    }
    if (frightenedIds.size > 0) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          frightenedIds.has(e.id)
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
    }
    ctx.narrative = `🌿 Fey Presence! ${ctx.char.name} radiates fey magic. ${lines.join(' ')}`;
    ctx.usedInitiative = true;
  }

  // ── Unknown feature fallthrough ────────────────────────────────────────
  else {
    ctx.narrative = `Unknown class feature: ${fid}.`;
  }
  return;
};
