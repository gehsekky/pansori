import {
  ADVANTAGE_CONDITIONS,
  DISADV_CONDITIONS,
  ENEMY_DISADV_CONDITIONS,
  FRESH_TURN,
  abilityMod,
  applyDamageMultiplier,
  canReact,
  computeTotalAc,
  d,
  d20TestPenalty,
  hasWeaponProficiency,
  passivePerception,
  profBonus,
  rageUsesMax,
  resolveEnemyAttack,
  resolvePlayerAttack,
  rollConditionSave,
  rollDeathSave,
  rollDice,
  seesInDarkness,
} from './rulesEngine.js';
import type {
  AbilityKey,
  Act,
  BossPhase,
  CampaignFacts,
  Character,
  ChoiceDirection,
  CombatEntity,
  CombatEvent,
  ConditionName,
  Context,
  DeathSaves,
  Enemy,
  EntitySide,
  GameChoice,
  GameConsequence,
  GameState,
  GridPos,
  InventoryItem,
  LootEffect,
  LootItem,
  NpcAttitude,
  NpcDialogueResponse,
  OnHitEffect,
  PlacedNpc,
  Seed,
  Spell,
  SpellZone,
  StructuredAction,
  Trap,
  TurnActions,
} from '../types.js';
import { type ActionContext, dispatchAction } from './actions/index.js';
import {
  BEAST_FORMS,
  LEVEL_RECOMMENDATIONS,
  SRD_SPECIES,
  SRD_SUBCLASS_FOR_CLASS,
  availableBeastForms,
  masterableWeapons,
  weaponMasterySlotsForLevel,
} from '../campaignData/srd/index.js';
import { COMBAT_LOG_MAX, clampCombatDim } from '../types.js';
import {
  DEFAULT_SPEED_FEET,
  SQUARE_SIZE,
  canSeeTarget,
  chebyshev,
  coverBonus,
  distanceFeet,
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
  findPath,
  hasLineOfSight,
  isInSunlight,
  magicalDarknessCells,
  opportunityAttackTriggers,
  posEqual,
} from './gridEngine.js';
import type { EnemyAttackHitFragment, EnemyAttackMissFragment } from './narrative/fragments.js';
import {
  FIGHTING_STYLE_LABELS,
  OFFERED_FIGHTING_STYLE_IDS,
  defenseAcBonus,
  fightingStyleSlots,
} from './fightingStyle.js';
import { applyExpiryHooks, getConditionDuration } from './conditions/registry.js';
import {
  applyMulticlassProfGrants,
  canCountercharm,
  canRitualCast,
  casterSpellOptionsByLevel,
  elementalAffinityType,
  evocationSavantBudget,
  expertiseEligibleSkills,
  expertiseSlots,
  getClassLevel,
  hasClass,
  hasDangerSense,
  hasDisciplinedSurvivor,
  hasElusive,
  hasEvasion,
  hasFeralSenses,
  hasHeroicWarrior,
  hasMultiattackDefense,
  hasRetaliation,
  hasSlipperyMind,
  hasSuperiorHuntersDefense,
  hunterFeatureOptions,
  huntersPrey,
  indomitableRemaining,
  isEvocationSpell,
  knownSpellTargetForLevel,
  knowsMetamagic,
  layOnHandsRemaining,
  levelUpClassOptions,
  metamagicOptions,
  metamagicSlots,
  piercesMagicalDarkness,
  spellSlotsForChar,
} from './multiclass.js';
import {
  availableRecoveries,
  enumerateRecoveryPlans,
  featureLabel,
  planLabel,
  planTotal,
} from './slotRecovery.js';
import { composeFragments, enemyAttackFragmentEvent } from './narrative/compose.js';
import { consumeDarkOnesLuck, tryDarkOnesLuck } from './darkOnesOwnLuck.js';
import { consumeImproveFate, tryImproveFate } from './improveFate.js';
import { consumeIndomitable, indomitableBonus, tryIndomitableReroll } from './indomitable.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from './strokeOfLuck.js';
import { enemyActor, pcActor } from './actions/actor.js';
import { enemyRef, fillEnemyTokens } from './narrative/enemyName.js';
import {
  equipmentFromLegacy,
  equippedArmorId,
  equippedShieldId,
  equippedWeaponId,
} from './equipment.js';
import { evalCondition, visibleResponses } from './dialogueGating.js';
import { fmt, pronounsForGender, stripForLlm } from './narrativeFmt.js';
import { pickHookText, returnFromEncounter, revealRegional } from './mapEngine.js';
import { wornAcBonus, wornSaveBonus } from './wornEffects.js';
import { Engine } from 'json-rules-engine';
import { applyDamage } from './damage.js';
import { applyStateMigrations } from './stateSchema.js';
import { availableLootIn } from './placedLoot.js';
import { canTakeFeat } from './feats.js';
import { factionShopPrice } from './campaignEngine.js';
import { llmProvider } from './llmProvider.js';
import { randomUUID } from 'crypto';

// Central enemy-damage floor (Undead Fortitude + future on-"reduced to 0"
// traits). Re-exported here so combat handlers pull it from the same module
// they already import the kill-resolution helpers (splitEncounterXp,
// isRoomCleared, …) from. See services/enemyDamage.ts.
export { enemyHpAfterDamage } from './enemyDamage.js';

// Append a CombatEvent to state.combat_log, trimming to COMBAT_LOG_MAX so the
// buffer doesn't grow unbounded across long sessions. Pure function — returns
// new state, doesn't mutate. Callers should reassign: `st = pushEvent(st, e)`.
/**
 * Free-function version of `takeAction`'s closure-scoped `commitChar`.
 * Writes `char` back into `st.characters` (matched by id) AND syncs
 * the matching grid entity's `hp` + `conditions` for PC entities. Use
 * this anywhere that mutates a character's hp / conditions outside of
 * the dispatcher's per-handler ctx (e.g. `applyEnemySpellDamage`,
 * inventory heal-other-PC, future helpers).
 *
 * **Why this exists.** Before, sites that updated a character's HP
 * had to remember to mirror the change onto `st.entities[].hp` too.
 * The two writes drifted easily — a handler updates one and forgets
 * the other, the grid view shows stale HP, and a downstream gate
 * (e.g. `hp > 0` check) makes the wrong decision. Routing through
 * one helper makes the mirror invariant a single-call responsibility.
 *
 * **For enemies:** entity.hp IS the source of truth (no Character
 * record exists). This helper is PC-only; enemies that take damage
 * mutate `entity.hp` directly (or via the seed for boss phases).
 */
export function commitCharacter(st: GameState, char: Character): GameState {
  const idx = st.characters.findIndex((c) => c.id === char.id);
  if (idx < 0) return st;
  const updatedChars = st.characters.map((c, i) => (i === idx ? char : c));
  const updatedEntities = st.entities?.map((e) =>
    e.id === char.id && !e.isEnemy
      ? { ...e, hp: char.hp, maxHp: char.max_hp, conditions: char.conditions }
      : e
  );
  return { ...st, characters: updatedChars, entities: updatedEntities };
}

export function pushEvent(st: GameState, event: CombatEvent): GameState {
  const next = [...(st.combat_log ?? []), event];
  return { ...st, combat_log: next.slice(-COMBAT_LOG_MAX) };
}

// SRD Heroic Inspiration — read the pending flag and (if set) clear it
// on `char`. Returns whether inspiration was active so the caller can pass
// it as advantage to a d20 roll. Saves already integrate this through
// applyConditionSave; this helper exists for ability/skill checks.
export function consumeInspirationForCheck(char: Character): boolean {
  if (!char.turn_actions?.inspiration_pending) return false;
  char.turn_actions = { ...char.turn_actions, inspiration_pending: false };
  char.inspiration = false;
  return true;
}

// Lucky feat — same shape as inspiration. Read the pending flag and
// (if set) clear it on `char`. The luck-point pool was decremented
// at spend time in the `use_luck` handler; this helper only manages
// the per-roll flag consumption. Returns true so callers can pass it
// as an advantage source to skill checks and saving throws.
export function consumeLuckForCheck(char: Character): boolean {
  if (!char.turn_actions?.luck_pending) return false;
  char.turn_actions = { ...char.turn_actions, luck_pending: false };
  return true;
}

// SRD Bardic Inspiration on any d20. Saves already consume the die
// through `conditionSavingThrow`; this mirror lets skill/ability checks
// auto-spend the stashed die. Returns the rolled die value (0 if no die),
// and clears the die on `char` when consumed. The caller subtracts the
// roll from the target DC (or adds to the check total) before resolving.
export function consumeBardicForCheck(char: Character): number {
  const die = char.bardic_inspiration_die;
  if (!die) return 0;
  const roll = rollDice(`1${die}`);
  char.bardic_inspiration_die = undefined;
  return roll;
}

// Cleric/Paladin/Druid prepared-spell cap: class level + spellcasting modifier
// (minimum 1). The casting stat is class-dependent (Cleric/Druid = WIS,
// Paladin = CHA); resolves through context.spellcastingAbility with a fall
// back to the class's primary stat.
export function preparedSpellsCap(char: Character, context: Context): number {
  const ability = (context.spellcastingAbility?.[char.character_class] ??
    context.classPrimaryStats[char.character_class] ??
    'wis') as AbilityKey;
  const score = (char[ability] ?? 10) as number;
  return Math.max(1, char.level + Math.max(0, Math.floor((score - 10) / 2)));
}

// ─── Boss-phase machinery ────────────────────────────────────────────────────
//
// Phase transitions modify the seed's runtime Enemy stats in-place. The seed
// is fresh on every request, so on entry we re-apply effects for phases
// 0..phase_index-1; on exit we check whether any boss's hp% has crossed a new
// threshold, apply that phase's effects, and emit a `phase_transition` event.
//
// Phases sort descending by hpPct (100% → 1%). `phase_index` is "how many
// phases have already fired", so phases[0..phase_index-1] are active and
// phases[phase_index] is the next one waiting.

function sortedPhases(phases: BossPhase[]): BossPhase[] {
  return [...phases].sort((a, b) => b.hpPct - a.hpPct);
}

function applyPhaseEffect(enemy: Enemy, effect: BossPhase['effects'][number]): Enemy {
  switch (effect.kind) {
    case 'set_multiattack':
      return { ...enemy, multiattack: effect.value };
    case 'set_damage':
      return { ...enemy, damage: effect.dice };
    case 'set_to_hit':
      return { ...enemy, toHit: effect.value };
    case 'set_ac':
      return { ...enemy, ac: effect.value };
    case 'set_on_hit_effect':
      return { ...enemy, onHitEffect: effect.effect };
    case 'add_resistance': {
      const prev = enemy.resistances ?? [];
      if (prev.includes(effect.damageType)) return enemy;
      return { ...enemy, resistances: [...prev, effect.damageType] };
    }
    case 'heal': {
      const max = enemy.maxHp ?? enemy.hp;
      return { ...enemy, hp: Math.min(max, enemy.hp + effect.amount) };
    }
  }
}

// Apply all effects up to `phaseIndex` (exclusive) onto the seed's enemy
// in-place. Called on every request entry so a re-fetched seed reflects the
// boss's accumulated phase changes.
function rehydrateBossPhases(seed: Seed, st: GameState): void {
  if (!st.entities) return;
  for (const ent of st.entities) {
    if (!ent.isEnemy) continue;
    const phaseIdx = ent.phase_index ?? 0;
    if (phaseIdx <= 0) continue;
    for (const [roomId, list] of Object.entries(seed.enemies ?? {})) {
      const idx = list.findIndex((e) => e.id === ent.id);
      if (idx < 0) continue;
      const enemy = list[idx];
      if (!enemy.phases?.length) continue;
      const phases = sortedPhases(enemy.phases);
      let next = enemy;
      for (let i = 0; i < Math.min(phaseIdx, phases.length); i++) {
        for (const eff of phases[i].effects) {
          next = applyPhaseEffect(next, eff);
        }
      }
      // Mutate in place so subsequent reads in this request see the new
      // stats. Other rooms' enemy arrays are untouched.
      seed.enemies[roomId] = [...list.slice(0, idx), next, ...list.slice(idx + 1)];
    }
  }
}

// Scan entities for any boss whose hp has dropped below the next-pending
// phase threshold; if so, increment phase_index, apply effects to the seed,
// and emit a `phase_transition` event. Returns the new state (entities may be
// updated to bump phase_index + reflect heal-effects that change hp).
function processBossPhaseTransitions(st: GameState, seed: Seed): GameState {
  if (!st.entities) return st;
  let updated = st;
  const newEntities = updated.entities!.map((ent) => ({ ...ent }));
  let anyChange = false;

  for (let i = 0; i < newEntities.length; i++) {
    const ent = newEntities[i];
    if (!ent.isEnemy || ent.hp <= 0) continue;

    let enemy: Enemy | undefined;
    let roomKey: string | undefined;
    let enemyIdx = -1;
    for (const [rk, list] of Object.entries(seed.enemies ?? {})) {
      const idx = list.findIndex((e) => e.id === ent.id);
      if (idx >= 0) {
        enemy = list[idx];
        roomKey = rk;
        enemyIdx = idx;
        break;
      }
    }
    if (!enemy?.phases?.length || !roomKey || enemyIdx < 0) continue;

    const phases = sortedPhases(enemy.phases);
    const currentIdx = ent.phase_index ?? 0;
    if (currentIdx >= phases.length) continue;

    const maxHp = enemy.maxHp ?? ent.maxHp ?? ent.hp;
    const hpPct = (ent.hp / maxHp) * 100;
    const nextPhase = phases[currentIdx];
    if (hpPct > nextPhase.hpPct) continue;

    // Trigger the phase. Apply effects to the seed's enemy in place.
    let nextEnemy = enemy;
    for (const eff of nextPhase.effects) {
      nextEnemy = applyPhaseEffect(nextEnemy, eff);
    }
    seed.enemies[roomKey] = [
      ...seed.enemies[roomKey].slice(0, enemyIdx),
      nextEnemy,
      ...seed.enemies[roomKey].slice(enemyIdx + 1),
    ];

    // If the phase healed, mirror the hp back onto the entity so the UI
    // sees it. (effects array runs in order; heal is captured via
    // nextEnemy.hp - enemy.hp delta.)
    const healDelta = nextEnemy.hp - enemy.hp;
    if (healDelta > 0) {
      newEntities[i] = { ...ent, hp: Math.min(maxHp, ent.hp + healDelta) };
    }

    newEntities[i] = {
      ...newEntities[i],
      phase_index: currentIdx + 1,
    };
    anyChange = true;

    updated = pushEvent(
      { ...updated, entities: newEntities },
      {
        kind: 'phase_transition',
        bossId: ent.id,
        bossName: enemy.name,
        phaseName: nextPhase.name,
        narrative: nextPhase.narrative,
        round: updated.round ?? 1,
      }
    );
  }

  return anyChange ? { ...updated, entities: newEntities } : updated;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function hpTier(char: Character): 'healthy' | 'hurt' | 'critical' {
  const pct = (char.hp ?? 0) / (char.max_hp || 1);
  if (pct > 0.66) return 'healthy';
  if (pct > 0.33) return 'hurt';
  return 'critical';
}

// 2024 Exhaustion has no HP-maximum reduction (that was the 2014 L4 rule).
// The model is now a flat −2/level on D20 Tests (see `d20TestPenalty`) and
// −5 ft/level Speed (see `effectiveSpeed`), lethal at level 6. Kept as a no-op
// passthrough so existing call sites don't need to change.
export function clampHpForExhaustion(hp: number, _maxHp: number, _exhaustionLevel: number): number {
  return hp;
}

// ─── Concentration helpers ────────────────────────────────────────────────────

// Initial round-budget for a concentration spell. Defaults to 10 (1 minute,
// the standard for Bless / Hold Person / Bane / etc.); a spell can declare
// longer durations (Spirit Guardians = 100, Hex = 600) via Spell.durationRounds.
// concentrationRoundsFor moved to services/actions/castSpell.ts in PR 15
// — it's only used by the cast handler's Bless / save-with-condition
// branches, so it lives next to its sole caller.

// Tick every PC's concentration timer down by one round and break any
// concentration whose timer just hit 0. Called on round wrap so the
// tick fires once per full initiative cycle (SRD 5.2.1 round = 6 sec).
// Returns { st, narrative } — narrative aggregates the auto-end notes
// for each PC whose spell timed out.
function tickConcentrationDurations(
  st: GameState,
  context?: Context
): { st: GameState; narrative: string } {
  let narrative = '';
  let stOut = st;
  for (const c of st.characters) {
    if (!c.concentrating_on || c.dead) continue;
    const remaining = c.concentrating_on.rounds_left;
    if (remaining == null) continue; // legacy state without a counter — keep persisting
    if (remaining <= 1) {
      // Time's up — break concentration cleanly via the existing path
      // (handles bless-blessed cleanup, condition-link clearing, etc).
      const { char: nc, st: ns } = breakConcentration(c, stOut, context);
      stOut = {
        ...ns,
        characters: ns.characters.map((x) => (x.id === c.id ? nc : x)),
      };
      const spellName = c.concentrating_on.spellId;
      narrative += ` ${fmt.note(`[${c.name}'s ${spellName} fades — concentration duration expired.]`)}`;
    } else {
      // Decrement; carry the rest of the concentrating_on payload forward.
      stOut = {
        ...stOut,
        characters: stOut.characters.map((x) =>
          x.id === c.id
            ? {
                ...x,
                concentrating_on: { ...c.concentrating_on!, rounds_left: remaining - 1 },
              }
            : x
        ),
      };
    }
  }
  return { st: stOut, narrative };
}

export function breakConcentration(
  char: Character,
  st: GameState,
  context?: Context
): { char: Character; st: GameState } {
  if (!char.concentrating_on) return { char, st };
  const condition = char.concentrating_on.condition;
  // A spell may link two conditions (Hideous Laughter: prone + incapacitated) —
  // strip both from affected creatures when concentration drops.
  const linkedConditions = [condition, char.concentrating_on.condition2].filter(
    (c): c is string => !!c
  );
  const wasBless = char.concentrating_on.spellId === 'bless';
  // SRD Holy Aura — concentration drop ends the party-wide `holy_warded` ward.
  const wasHolyAura = char.concentrating_on.spellId === 'holy_aura';
  // SRD Shield of Faith — concentration drop clears the +2 AC.
  // Pansori MVP assumes ONE Shield of Faith active in the party at
  // a time (the typical case — one Cleric concentrating). When the
  // caster's concentration drops, sweep every PC with the flag and
  // clear + recompute AC. Multi-caster SoF on different targets
  // isn't tracked; defensible since the failure mode is rare.
  const wasShieldOfFaith = char.concentrating_on.spellId === 'shield_of_faith';
  // SRD Fly / Levitate — concentration drop clears the fly_speed_ft
  // grant the caster placed on the target. Pansori models one Fly /
  // Levitate active per caster (the typical case); sweeping all PCs is
  // defensive against drift.
  const wasFlight =
    char.concentrating_on.spellId === 'fly' || char.concentrating_on.spellId === 'levitate';
  // SRD Spider Climb — dropping concentration revokes the granted Climb Speed.
  const wasSpiderClimb = char.concentrating_on.spellId === 'spider_climb';
  // SRD Pass without Trace — dropping concentration ends the party Stealth aura.
  const wasPassWithoutTrace = char.concentrating_on.spellId === 'pass_without_trace';
  // SRD Protection from Evil and Good — dropping concentration ends the ward.
  const wasProtectionEvil = char.concentrating_on.spellId === 'protection_from_evil_and_good';
  // SRD Polymorph — concentration drop reverts every polymorphed
  // entity. The polymorph_state stash carries originalHp / originalMaxHp;
  // restore those + clear the polymorphed condition. Pansori MVP assumes
  // one Polymorph active at a time and reverts every polymorphed entity.
  // RAW would track per-caster.
  const wasPolymorph =
    char.concentrating_on.spellId === 'polymorph' ||
    char.concentrating_on.spellId === 'true_polymorph';
  // SRD Haste — concentration drop strips the hasted condition
  // and triggers the RAW lethargy: "the target is Incapacitated and
  // has a Speed of 0 until the end of its next turn." Pansori models
  // the speed-0 via the existing `incapacitated` condition (which
  // already gates actions); the targeted speed-0 detail is approximate
  // since incapacitated doesn't normally include movement gating —
  // but pansori MVP treats incapacitated PCs as not acting, which
  // closely matches "lose your turn".
  const wasHaste = char.concentrating_on.spellId === 'haste';
  // SRD Ranger Hunter's Mark — dropping concentration clears the marked target.
  const wasHuntersMark = char.concentrating_on.spellId === 'hunters_mark';
  // SRD Hex — dropping concentration lifts the curse (clears the hexed target).
  const wasHex = char.concentrating_on.spellId === 'hex';
  // SRD Magic Weapon — dropping concentration ends the +N weapon enhancement.
  const wasMagicWeapon = char.concentrating_on.spellId === 'magic_weapon';
  // SRD Dragon's Breath — dropping concentration revokes the granted breath
  // weapon from whichever creature (self or ally) the caster touched.
  const wasDragonsBreath = char.concentrating_on.spellId === 'dragons_breath';
  // SRD shapeshift spells (Shapechange, Animal Shapes) — dropping concentration
  // reverts every creature shaped by this spell back to its true form.
  const shapeshiftSpellId =
    char.concentrating_on.spellId === 'shapechange' ||
    char.concentrating_on.spellId === 'animal_shapes'
      ? char.concentrating_on.spellId
      : undefined;
  // SRD Blur — dropping concentration clears the `blurred` self-buff.
  const wasBlur = char.concentrating_on.spellId === 'blur';
  // SRD Divine Favor / smites — concentration drop ends the per-attack weapon
  // rider (and any still-armed one-shot smite) tied to this spell.
  const wasWeaponRider = char.weapon_rider?.spellId === char.concentrating_on.spellId;
  const wasPendingSmite = char.pending_smite?.spellId === char.concentrating_on.spellId;
  // SRD Guidance — dropping concentration loses the unused +1d4 die. (Cleared
  // on the caster; an ally-targeted die persists until used — a minor
  // simplification, harmless since it's a one-shot bonus.)
  const wasGuidance = char.concentrating_on.spellId === 'guidance';
  // SRD Resistance — dropping concentration ends the −1d4 damage reduction.
  const wasResistance = char.concentrating_on.spellId === 'resistance';
  let newChar: Character = {
    ...char,
    concentrating_on: null,
    ...(wasGuidance ? { guidance_die: false } : {}),
    ...(wasResistance ? { resistance_reduction: undefined } : {}),
    ...(wasHuntersMark ? { hunters_mark_target_id: undefined } : {}),
    ...(wasHex ? { hex_target_id: undefined } : {}),
    ...(wasMagicWeapon ? { weapon_enhancement: undefined } : {}),
    ...(wasWeaponRider ? { weapon_rider: undefined } : {}),
    ...(wasPendingSmite ? { pending_smite: undefined } : {}),
    // RE-4 — a concentration-based recurring spell attack (Vampiric Touch) ends
    // when the caster's concentration drops.
    ...(char.recurring_attack?.concentration ? { recurring_attack: null } : {}),
  };
  // Strip the linked enemy condition(s) (Hold Person; Hideous Laughter's pair).
  let newSt: GameState =
    linkedConditions.length > 0 && st.entities
      ? {
          ...st,
          entities: st.entities.map((e) =>
            e.isEnemy
              ? { ...e, conditions: e.conditions.filter((c) => !linkedConditions.includes(c)) }
              : e
          ),
        }
      : st;
  // Bless (SRD) — the buff is on ALLIES, not enemies. When the
  // caster's concentration drops, clear `blessed` from every PC whose
  // condition_sources.blessed pointed at this caster. The caster's
  // local ref is mutated too so callers writing it back to state don't
  // resurrect the cleared condition.
  if (wasBless) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) => {
        if ((c.condition_sources ?? {}).blessed !== char.id) return c;
        const { blessed: _drop, ...rest } = c.condition_sources ?? {};
        void _drop;
        return {
          ...c,
          conditions: (c.conditions ?? []).filter((x) => x !== 'blessed'),
          condition_sources: rest,
        };
      }),
    };
    if ((newChar.condition_sources ?? {}).blessed === char.id) {
      const { blessed: _drop2, ...rest2 } = newChar.condition_sources ?? {};
      void _drop2;
      newChar = {
        ...newChar,
        conditions: (newChar.conditions ?? []).filter((x) => x !== 'blessed'),
        condition_sources: rest2,
      };
    }
  }
  // SRD Holy Aura — the ward sits on the whole party. When the caster's
  // concentration drops, strip `holy_warded` from every PC + their entity
  // mirror (and the caster's local ref so a write-back can't resurrect it).
  if (wasHolyAura) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) =>
        (c.conditions ?? []).includes('holy_warded')
          ? { ...c, conditions: (c.conditions ?? []).filter((x) => x !== 'holy_warded') }
          : c
      ),
      entities: (newSt.entities ?? []).map((e) =>
        !e.isEnemy && e.conditions.includes('holy_warded')
          ? { ...e, conditions: e.conditions.filter((x) => x !== 'holy_warded') }
          : e
      ),
    };
    newChar = {
      ...newChar,
      conditions: (newChar.conditions ?? []).filter((x) => x !== 'holy_warded'),
    };
  }
  if (wasFlight) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) =>
        c.fly_speed_ft ? { ...c, fly_speed_ft: undefined } : c
      ),
    };
    if (newChar.fly_speed_ft) {
      newChar = { ...newChar, fly_speed_ft: undefined };
    }
  }
  if (wasSpiderClimb) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) =>
        c.climb_speed_ft ? { ...c, climb_speed_ft: undefined } : c
      ),
    };
    if (newChar.climb_speed_ft) {
      newChar = { ...newChar, climb_speed_ft: undefined };
    }
  }
  if (wasPassWithoutTrace) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) =>
        c.pass_without_trace_active ? { ...c, pass_without_trace_active: undefined } : c
      ),
    };
    if (newChar.pass_without_trace_active) {
      newChar = { ...newChar, pass_without_trace_active: undefined };
    }
  }
  if (wasProtectionEvil) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) =>
        c.protected_from_evil ? { ...c, protected_from_evil: undefined } : c
      ),
    };
    if (newChar.protected_from_evil) {
      newChar = { ...newChar, protected_from_evil: undefined };
    }
  }
  if (wasDragonsBreath) {
    // Revoke the granted breath from any creature this caster armed.
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) =>
        c.granted_breath?.sourceCasterId === char.id ? { ...c, granted_breath: undefined } : c
      ),
    };
    if (newChar.granted_breath?.sourceCasterId === char.id) {
      newChar = { ...newChar, granted_breath: undefined };
    }
  }
  if (shapeshiftSpellId) {
    const revert = (c: Character): Character =>
      c.shapeshift_spell === shapeshiftSpellId
        ? {
            ...c,
            conditions: (c.conditions ?? []).filter((x) => x !== 'wild_shaped'),
            wild_shape_form: undefined,
            shapeshift_spell: undefined,
            temp_hp: undefined,
          }
        : c;
    newSt = { ...newSt, characters: newSt.characters.map(revert) };
    newChar = revert(newChar);
  }
  // SRD Blur — clear the `blurred` self-buff from the caster (+ entity mirror).
  if (wasBlur) {
    newChar = { ...newChar, conditions: (newChar.conditions ?? []).filter((c) => c !== 'blurred') };
    newSt = {
      ...newSt,
      entities: (newSt.entities ?? []).map((e) =>
        e.id === newChar.id && !e.isEnemy
          ? { ...e, conditions: e.conditions.filter((c) => c !== 'blurred') }
          : e
      ),
    };
  }
  if (wasPolymorph && newSt.entities) {
    // SRD Polymorph rewrite — form HP lives on `temp_hp`, not a
    // separate pool. Concentration drop clears temp_hp + the
    // polymorph_state stash + the polymorphed condition. The
    // entity's `hp` was never modified by the polymorph cast, so
    // no HP revert is needed — the creature simply emerges with
    // whatever HP they had when polymorphed.
    newSt = {
      ...newSt,
      entities: newSt.entities.map((e) =>
        e.polymorph_state
          ? {
              ...e,
              temp_hp: undefined,
              polymorph_state: undefined,
              conditions: e.conditions.filter((c) => c !== 'polymorphed'),
            }
          : e
      ),
    };
  }
  if (wasHaste && context) {
    // Sweep all PCs carrying the hasted condition. For each:
    //   - drop hasted
    //   - apply incapacitated for 1 round (the RAW "lethargy")
    //   - recompute AC (drop the +2)
    // The condition is mirrored on the entity too, but pansori's
    // applyDamage / save paths read char.conditions; the entity
    // mirror is updated for FE rendering parity.
    const dropHaste = (c: Character): Character => {
      if (!(c.conditions ?? []).includes('hasted')) return c;
      const next: Character = {
        ...c,
        conditions: [...(c.conditions ?? []).filter((x) => x !== 'hasted'), 'incapacitated'],
        condition_durations: {
          ...(c.condition_durations ?? {}),
          incapacitated: 1,
        },
      };
      next.ac =
        computeTotalAc(
          next.dex,
          equippedArmorId(next),
          equippedShieldId(next),
          next.inventory ?? [],
          context.lootTable,
          next.mage_armor_active ?? false,
          next.shield_of_faith_active ?? false,
          false,
          next.barkskin_active ?? false
        ) +
        defenseAcBonus(next, context.lootTable) +
        wornAcBonus(next, context.lootTable);
      return next;
    };
    newSt = {
      ...newSt,
      characters: newSt.characters.map(dropHaste),
      entities: (newSt.entities ?? []).map((e) =>
        !e.isEnemy && e.conditions.includes('hasted')
          ? {
              ...e,
              conditions: [...e.conditions.filter((x) => x !== 'hasted'), 'incapacitated'],
              condition_durations: {
                ...e.condition_durations,
                incapacitated: 1,
              },
            }
          : e
      ),
    };
    newChar = dropHaste(newChar);
  }
  if (wasShieldOfFaith && context) {
    const recomputeFor = (c: Character): Character => {
      if (!c.shield_of_faith_active) return c;
      const cleared: Character = { ...c, shield_of_faith_active: false };
      cleared.ac =
        computeTotalAc(
          cleared.dex,
          equippedArmorId(cleared),
          equippedShieldId(cleared),
          cleared.inventory ?? [],
          context.lootTable,
          cleared.mage_armor_active ?? false,
          false,
          false,
          cleared.barkskin_active ?? false
        ) +
        defenseAcBonus(cleared, context.lootTable) +
        wornAcBonus(cleared, context.lootTable);
      return cleared;
    };
    newSt = { ...newSt, characters: newSt.characters.map(recomputeFor) };
    newChar = recomputeFor(newChar);
  }
  // RE-1 Phase 4 — concentration summons (Conjure Animals etc.) vanish
  // when the caster's concentration drops. `summon_concentration` flags
  // the ones tied to concentration; persistent summons (Find Familiar)
  // stay. Removing them also drops their initiative slot.
  const summonIds = (newSt.entities ?? [])
    .filter((e) => e.summoned_by === char.id && e.summon_concentration)
    .map((e) => e.id);
  for (const sid of summonIds) {
    newSt = removeCombatant(newSt, sid);
  }
  // RE-4 — transient wall/terrain spells (Wall of Fire/Force) vanish when the
  // caster's concentration ends. Walls are keyed by caster, so this clears
  // them regardless of which spell dropped (voluntary, damage, or expiry —
  // the expiry path routes through here too).
  if (newSt.spell_walls?.some((w) => w.casterId === char.id)) {
    newSt = { ...newSt, spell_walls: newSt.spell_walls.filter((w) => w.casterId !== char.id) };
  }
  // RE-4 — persistent damage zones (Cloud of Daggers, …) likewise vanish when
  // the caster's concentration ends. Keyed by caster, same as walls.
  if (newSt.spell_zones?.some((z) => z.casterId === char.id)) {
    newSt = { ...newSt, spell_zones: newSt.spell_zones.filter((z) => z.casterId !== char.id) };
  }
  // Buff-granted Resistance (Stoneskin / Protection from Energy) ends with its
  // concentration. The grant can sit on the caster or a touched ally, so sweep
  // every PC (MVP: one resistance buff active at a time). Only acts when the
  // ended spell actually granted resistances.
  const wasResistanceBuff =
    !!context?.spellTable?.[char.concentrating_on.spellId]?.grantResistances?.length;
  if (wasResistanceBuff) {
    newChar = { ...newChar, spell_resistances: [] };
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) => ({ ...c, spell_resistances: [] })),
    };
  }
  return { char: newChar, st: newSt };
}

// RE-4 — cells occupied by transient wall/terrain spells in `roomId`, filtered
// by what they obstruct. Merged into the obstacle set used for line of sight /
// cover (`kind: 'los'`) and into the blocked set for movement
// (`kind: 'movement'`).
export function wallObstacleCells(
  st: GameState,
  roomId: string,
  kind: 'los' | 'movement'
): GridPos[] {
  const cells: GridPos[] = [];
  for (const wall of st.spell_walls ?? []) {
    if (wall.roomId !== roomId) continue;
    if (kind === 'los' ? wall.blocksLineOfSight : wall.blocksMovement) {
      cells.push(...wall.cells);
    }
  }
  return cells;
}

export function checkConcentration(
  char: Character,
  st: GameState,
  dmgTaken: number,
  context?: Context,
  // When true, a failed save with Indomitable available is NOT auto-rerolled or
  // broken here — instead the break is DEFERRED and a `deferredReroll` is
  // returned so the caller can open an interactive `save_reroll` window. The
  // spell stays active until the player decides (decline / failed reroll breaks
  // it). Only the enemy-attack path (computeEnemyAttack) passes this.
  deferIndomitable = false
): {
  char: Character;
  st: GameState;
  note: string;
  deferredReroll?: PendingSaveRerollInfo;
} {
  if (!char.concentrating_on || dmgTaken <= 0) return { char, st, note: '' };
  // SRD Ranger Relentless Hunter (L13): taking damage can't break your
  // Concentration on Hunter's Mark — the save is skipped and the spell holds.
  if (char.concentrating_on.spellId === 'hunters_mark' && getClassLevel(char, 'ranger') >= 13) {
    return { char, st, note: ` [Relentless Hunter: Hunter's Mark holds]` };
  }
  // SRD 5.2.1 — Concentration DC is 10 or half damage taken, whichever
  // is higher; capped at 30. The cap basically only matters at >60 dmg.
  const dc = Math.min(30, Math.max(10, Math.floor(dmgTaken / 2)));
  // SRD revive penalty applies to the concentration CON save like
  // any other D20 Test.
  const save =
    d(20) + abilityMod(char.con) - d20TestPenalty(char) + auraOfProtectionBonus(char, st);
  if (save >= dc)
    return {
      char,
      st,
      note: ` [Concentration hold: ${save} vs DC ${dc}]`,
    };
  // Interactive Indomitable — defer the break to a `save_reroll` window. The
  // spell stays active (the break is what we're deferring); the window keeps it
  // on a successful reroll and breaks it on decline / a failed reroll.
  if (deferIndomitable && indomitableRemaining(char) > 0) {
    const reroll =
      d(20) +
      abilityMod(char.con) -
      d20TestPenalty(char) +
      auraOfProtectionBonus(char, st) +
      indomitableBonus(char);
    return {
      char,
      st,
      note: ` [Concentration save failed: ${save} vs DC ${dc} — Indomitable available]`,
      deferredReroll: {
        source: 'indomitable',
        reactorId: char.id,
        reactorName: char.name,
        succeeds: reroll >= dc,
        saveAbility: 'con',
        saveDc: dc,
        concentrationSpellId: char.concentrating_on.spellId,
      },
    };
  }
  // SRD Fighter Indomitable — reroll the failed CON save with +Fighter level.
  const indo = tryIndomitableReroll(char, () => {
    const reroll =
      d(20) +
      abilityMod(char.con) -
      d20TestPenalty(char) +
      auraOfProtectionBonus(char, st) +
      indomitableBonus(char);
    return reroll >= dc;
  });
  if (indo.used && indo.saved)
    return {
      char: consumeIndomitable(char),
      st,
      note: ` [Concentration hold: ✦ Indomitable reroll vs DC ${dc}]`,
    };
  // SRD Rogue Stroke of Luck — turn the failed CON save into a 20 if it holds.
  if (strokeOfLuckAvailable(char)) {
    const mods = abilityMod(char.con) - d20TestPenalty(char) + auraOfProtectionBonus(char, st);
    if (20 + mods >= dc)
      return {
        char: consumeStrokeOfLuck(char),
        st,
        note: ` [Concentration hold: ✦ Stroke of Luck vs DC ${dc}]`,
      };
  }
  const spellName = char.concentrating_on.spellId;
  const { char: nc, st: ns } = breakConcentration(char, st, context);
  return {
    char: nc,
    st: ns,
    note: ` [Concentration broken: ${save} vs DC ${dc} — ${spellName} ends!]`,
  };
}

export function pickTiered(
  template: string[] | Record<string, string[]> | undefined,
  tier: string
): string {
  if (!template) return '';
  if (Array.isArray(template)) return pick(template);
  return pick(template[tier] || template['healthy'] || template[Object.keys(template)[0]] || ['']);
}

export function buildCombatHitNarrative(
  enemy: Enemy,
  weaponItem: LootItem | null,
  damage: number,
  critical: boolean,
  char: Character,
  context: Context
): string {
  const tier = hpTier(char);
  const opening = fillEnemyTokens(pickTiered(context.narratives.combatHit, tier), enemy);
  const verbPool = context.narratives.weaponVerbs?.[weaponItem?.id ?? ''] ??
    context.narratives.weaponVerbs?.['unarmed'] ?? ['connects with'];
  const rawVerb = pick(verbPool);
  const stylePool = context.narratives.classStyle?.[char.character_class];
  const styleText = stylePool ? pick(stylePool) : '';
  // Verb phrases are often authored transitively ("cleaves with", "stabs
  // with") and the object never comes — the style is the complement. Strip
  // the dangling "with" and merge a with-style seamlessly, so
  // "cleaves with" + "with martial precision" reads "cleaves with martial
  // precision" instead of the old "cleaves with, with martial precision".
  const dangling = / with$/.test(rawVerb);
  const verb = dangling ? rawVerb.replace(/ with$/, '') : rawVerb;
  // No trailing comma — the sentence-ending "!" supplies the terminal
  // punctuation; a comma here produced a stray ",!" seam before the damage.
  const style = styleText
    ? dangling && /^with /.test(styleText)
      ? ` ${styleText}`
      : `, ${styleText}`
    : '';
  const reactionPool = context.narratives.enemyReactions?.[enemy.name];
  const reaction = reactionPool ? ` — ${pick(reactionPool)}` : '';
  const critNote = critical ? 'Critical hit! ' : '';
  // `opening` always ends a sentence, so the weapon clause starts a new one —
  // capitalize "Your" rather than emitting "...staggers. your Dagger ...".
  const weaponLabel = weaponItem ? `Your ${weaponItem.name}` : 'Your fists';
  return `${opening} ${critNote}${weaponLabel} ${verb}${style}${reaction}! ${fmt.dmg(damage)} damage.`;
}

// 0 = uncapped. Every cap site is gated with `MAX_CHOICES && …` so a falsy
// value short-circuits the cap checks cleanly without dead-code cleanup.
const MAX_CHOICES = 0;

export function getItemData(
  item: InventoryItem | undefined,
  context: Context
): LootItem & InventoryItem {
  if (!item) return {} as LootItem & InventoryItem;
  const tableEntry = context.lootTable.find((i) => i.id === item.id) ?? ({} as LootItem);
  return { ...tableEntry, ...item };
}

function getWorldName(seed: Seed): string {
  return seed.world_name || seed.ship_name || 'the world';
}

// ─── Condition helpers ────────────────────────────────────────────────────────

/**
 * True when `char` has save proficiency in `ability` from any source
 * the engine tracks today:
 *   - Class save proficiency (from context.classSavingThrows).
 *   - Feat-granted save proficiency (Resilient — recorded on
 *     feat_choices.<featId>.saveProficiencies; the walk is generic
 *     so future feats with the same shape just work).
 *   - Rogue Slippery Mind (L15) — WIS + CHA saving throws.
 *
 * Exported for any save site that needs the full picture (lair
 * action AoE saves, future legendary-action saves, etc.). The
 * existing `rollConditionSave` helper takes a single proficient flag
 * and trusts the caller — this is how callers compute it.
 */
export function hasSaveProficiency(
  char: Character,
  ability: AbilityKey,
  context: Context
): boolean {
  const classProf = context.classSavingThrows?.[char.character_class]?.includes(ability) ?? false;
  if (classProf) return true;
  // SRD Monk Disciplined Survivor (L14): proficiency in all saving throws.
  if (hasDisciplinedSurvivor(char)) return true;
  // SRD Rogue Slippery Mind (L15): proficiency in WIS + CHA saves.
  if ((ability === 'wis' || ability === 'cha') && hasSlipperyMind(char)) return true;
  return Object.values(char.feat_choices ?? {}).some((c) =>
    c?.saveProficiencies?.includes(ability)
  );
}

// SRD Paladin aura radius — 10 ft, expanding to 30 ft at L18 (Aura Expansion).
function paladinAuraRangeFt(p: Character): number {
  return getClassLevel(p, 'paladin') >= 18 ? 30 : 10;
}

/**
 * SRD Aura of Protection (Paladin L6): a creature gains a bonus to saving
 * throws equal to the Charisma modifier (minimum +1) of a Paladin L6+ within
 * the aura — the Paladin always benefits from their own aura. Inactive while
 * that Paladin is Incapacitated (or Unconscious). With multiple auras a
 * creature benefits from only one (the best). The aura is 10 ft, growing to
 * 30 ft at L18 (Aura Expansion). Off the grid (out of combat) the party is
 * assumed to travel together. Returns 0 when no aura covers `char`. (RE-2.)
 */
export function auraOfProtectionBonus(char: Character, st: GameState): number {
  const charEnt = st.entities?.find((e) => e.id === char.id);
  let best = 0;
  for (const p of st.characters) {
    if (p.dead) continue;
    if ((p.conditions ?? []).some((c) => c === 'incapacitated' || c === 'unconscious')) continue;
    if (getClassLevel(p, 'paladin') < 6) continue;
    let inRange = p.id === char.id;
    if (!inRange) {
      const pEnt = st.entities?.find((e) => e.id === p.id);
      inRange =
        charEnt && pEnt ? distanceFeet(charEnt.pos, pEnt.pos) <= paladinAuraRangeFt(p) : true;
    }
    if (!inRange) continue;
    const bonus = Math.max(1, abilityMod(p.cha));
    if (bonus > best) best = bonus;
  }
  return best;
}

/**
 * SRD Paladin Holy Nimbus (Oath of Devotion L20) — the Radiant damage an enemy
 * takes when it starts its turn within an active nimbus paladin's aura: CHA +
 * Proficiency Bonus of the best such paladin in range (0 if none). The nimbus
 * is active while the paladin carries the `holy_nimbus` marker and isn't
 * Incapacitated. Off the grid the party is assumed together. (RE-2.)
 */
export function holyNimbusRadiant(enemyId: string, st: GameState): number {
  const enemyEnt = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
  let best = 0;
  for (const p of st.characters) {
    if (p.dead || !p.conditions.includes('holy_nimbus')) continue;
    if (p.conditions.some((c) => c === 'incapacitated' || c === 'unconscious')) continue;
    if (getClassLevel(p, 'paladin') < 20) continue;
    let inRange = true;
    const pEnt = st.entities?.find((e) => e.id === p.id);
    if (enemyEnt && pEnt) inRange = distanceFeet(pEnt.pos, enemyEnt.pos) <= paladinAuraRangeFt(p);
    if (!inRange) continue;
    best = Math.max(best, abilityMod(p.cha) + profBonus(p.level));
  }
  return best;
}

/**
 * SRD monster auras / emanations (Ghast Stench, …) — applied when a PC starts
 * its turn. For each living enemy carrying an `aura`, if the PC is within the
 * aura's radius (off-grid: assumed in range, like Holy Nimbus), the PC makes
 * the aura's save (with save proficiency + Aura of Protection); on a failure
 * (or with no save) it takes the aura's `damage` and/or gains its `condition`.
 * Returns the updated character + state + a narrative fragment.
 *
 * Heroic Inspiration / Indomitable are deliberately NOT auto-spent here — a
 * recurring aura would drain them every turn. Species save advantages (e.g.
 * Dwarven Resilience vs poison) on the aura save are not yet applied.
 */
export function applyMonsterAuras(
  char: Character,
  st: GameState,
  seed: Seed,
  context: Context
): { char: Character; st: GameState; narrative: string } {
  if (char.dead || char.hp <= 0) return { char, st, narrative: '' };
  let updated = char;
  let workingSt = st;
  let narrative = '';
  const charEnt = st.entities?.find((e) => e.id === char.id && !e.isEnemy);
  for (const ent of st.entities ?? []) {
    if (!ent.isEnemy || ent.hp <= 0 || workingSt.enemies_killed.includes(ent.id)) continue;
    const aura = getEnemyById(seed, ent.id)?.aura;
    if (!aura) continue;
    // Range — off-grid (no PC position) assumes in range, like Holy Nimbus.
    const inRange = !charEnt ? true : distanceFeet(charEnt.pos, ent.pos) <= aura.radiusFt;
    if (!inRange) continue;
    const label = aura.name ?? 'aura';
    if (aura.save) {
      const ability = aura.save.ability;
      const proficient = hasSaveProficiency(updated, ability, context);
      const score = (updated as unknown as Record<string, number>)[ability] ?? 10;
      const roll =
        d(20) +
        abilityMod(score) +
        (proficient ? profBonus(updated.level) : 0) +
        auraOfProtectionBonus(updated, workingSt) -
        d20TestPenalty(updated);
      if (roll >= aura.save.dc) {
        narrative += ` ${fmt.note(`[${label}] ${updated.name} resists (${ability.toUpperCase()} ${roll} vs DC ${aura.save.dc}).`)}`;
        continue;
      }
    }
    if (aura.damage) {
      const dmg = rollDice(aura.damage);
      const res = applyDamage(updated, workingSt, dmg);
      updated = res.char;
      workingSt = res.st;
      narrative += ` ${fmt.note(`[${label}] ${updated.name} takes ${fmt.dmg(dmg)}${aura.damageType ? ' ' + aura.damageType : ''} damage.`)}`;
    }
    if (
      aura.condition &&
      !updated.conditions.includes(aura.condition) &&
      !conditionImmunitiesFor(updated, workingSt).has(aura.condition)
    ) {
      updated = {
        ...updated,
        conditions: [...updated.conditions, aura.condition],
        condition_durations: {
          ...updated.condition_durations,
          [aura.condition]: aura.conditionDuration ?? 1,
        },
      };
      narrative += ` ${fmt.note(`[${label}] ${updated.name} is ${aura.condition}!`)}`;
    }
  }
  return { char: updated, st: workingSt, narrative };
}

/**
 * SRD Paladin Aura of Courage (L10) and Oath of Devotion's Aura of Devotion
 * (L7): a creature within a conscious paladin's aura can't be Frightened
 * (Courage) / Charmed (Devotion), and an existing such condition ends. Returns
 * the set of conditions `char` is immune to via any qualifying aura in range.
 * Shares the aura range (incl. L18 Aura Expansion) and the conscious/in-range
 * rules with auraOfProtectionBonus. (RE-2.)
 */
export function auraConditionImmunity(char: Character, st: GameState): Set<string> {
  const out = new Set<string>();
  const charEnt = st.entities?.find((e) => e.id === char.id);
  for (const p of st.characters) {
    if (p.dead) continue;
    if ((p.conditions ?? []).some((c) => c === 'incapacitated' || c === 'unconscious')) continue;
    if (getClassLevel(p, 'paladin') < 7) continue; // earliest aura immunity is Devotion L7
    let inRange = p.id === char.id;
    if (!inRange) {
      const pEnt = st.entities?.find((e) => e.id === p.id);
      inRange =
        charEnt && pEnt ? distanceFeet(charEnt.pos, pEnt.pos) <= paladinAuraRangeFt(p) : true;
    }
    if (!inRange) continue;
    if (getClassLevel(p, 'paladin') >= 10) out.add('frightened'); // Aura of Courage
    if (p.subclass === 'devotion' && getClassLevel(p, 'paladin') >= 7) out.add('charmed'); // Aura of Devotion
  }
  return out;
}

/**
 * The full set of conditions `char` is currently immune to: paladin-aura
 * immunities (`auraConditionImmunity`) plus any from an active buff spell
 * (`Character.condition_immunities` — Freedom of Movement, Mind Blank). The
 * single source of truth for the condition-application guards (enemy on-hit
 * auto-apply + save-based, monster auras) and the per-turn "freed from a
 * now-immune condition" sweep. (RE-6.)
 */
export function conditionImmunitiesFor(char: Character, st: GameState): Set<string> {
  const out = auraConditionImmunity(char, st);
  for (const c of char.condition_immunities ?? []) out.add(c);
  return out;
}

function conditionSavingThrow(
  // Only the save-based onHitEffect path reaches here (the caller branches on
  // `ability`/`dc` being present), so they are non-optional in this scope.
  effect: OnHitEffect & { ability: AbilityKey; dc: number },
  char: Character,
  st: GameState,
  context: Context,
  // SRD Aura of Protection bonus, folded in by lowering the effective DC
  // (same mechanism as the Bardic Inspiration roll above). 0 when no aura.
  auraBonus = 0,
  // When true, the two INTERACTIVE reaction rerolls (Fighter Indomitable,
  // Bard Countercharm) are NOT auto-applied — instead the function leaves the
  // save failed and reports a single `deferredReroll` (priority: Indomitable,
  // then Countercharm) with its pre-rolled outcome, so the caller can open an
  // interactive `save_reroll` reaction window. All the non-reaction rerolls
  // (Heroic Inspiration / Stroke of Luck / Lucky / Dark One's Luck / Improve
  // Fate / Bardic Inspiration) still auto-resolve.
  deferReactionRerolls = false
): {
  applied: boolean;
  inspirationConsumed: boolean;
  indomitableConsumed: boolean;
  strokeOfLuckConsumed: boolean;
  luckConsumed: boolean;
  bardicInspirationConsumed: boolean;
  bardicRoll: number;
  // SRD Fiend Warlock Dark One's Own Luck — set when the 1d10 rescued the save
  // (optional: only the main resolution path sets it).
  darkOnesLuckConsumed?: boolean;
  // SRD Boon of Fate — Improve Fate: set when the 2d4 rescued the save.
  improveFateConsumed?: boolean;
  // SRD Bard Countercharm — id of the bard (self or ally within 30 ft) who
  // spent a Reaction to reroll this Charmed/Frightened save with Advantage.
  countercharmBardId?: string;
  // Deferred interactive reroll (set only when `deferReactionRerolls` and the
  // save failed and a reroll source is available). `succeeds` is pre-rolled.
  deferredReroll?: {
    source: 'indomitable' | 'countercharm';
    reactorId: string;
    reactorName: string;
    succeeds: boolean;
  };
} {
  // SRD Paladin Aura of Courage / Aura of Devotion — a creature within the
  // aura is immune to Frightened / Charmed, OR a buff grants immunity (Freedom
  // of Movement → Restrained/Paralyzed, Mind Blank → Charmed), so the condition
  // never lands (no save needed). Checked before any roll.
  if (effect.condition && conditionImmunitiesFor(char, st).has(effect.condition)) {
    return {
      applied: false,
      inspirationConsumed: false,
      indomitableConsumed: false,
      strokeOfLuckConsumed: false,
      luckConsumed: false,
      bardicInspirationConsumed: false,
      bardicRoll: 0,
    };
  }
  const proficient = hasSaveProficiency(char, effect.ability, context);
  // SRD — Heroic Inspiration can be spent on any d20 test. If the
  // player armed it via spend_inspiration, the save gets advantage and
  // the flag is consumed (the caller updates char accordingly).
  const inspirationActive = !!char.turn_actions?.inspiration_pending;
  // Lucky feat (SRD) — same shape: per-roll flag set via
  // `use_luck`, consumed here. The luck-point pool was already
  // decremented at spend time.
  const luckActive = !!char.turn_actions?.luck_pending;
  // SRD Bardic Inspiration — if the saver carries a BI die, it can
  // be spent on this save (and is consumed regardless of outcome). We
  // roll it, then check if the d20 + mods + bi-roll meets the DC.
  const biDie = char.bardic_inspiration_die;
  const bardicRoll = biDie ? rollDice(`1${biDie}`) : 0;
  // Worn-gear save bonus (e.g. Moonstone Amulet's +1 to WIS saves while worn and
  // attuned). Folded into the effective DC, same mechanism as Aura of Protection.
  const wornBonus = wornSaveBonus(char, effect.ability, context.lootTable);
  const dcAdjusted = effect.dc - bardicRoll - auraBonus - wornBonus;
  // SRD: heavy encumbrance imposes disadvantage on STR/DEX/CON saves
  // (and checks, and attacks). Apply here so onHit-effect saves account for it.
  const enc =
    (effect.ability === 'str' || effect.ability === 'dex' || effect.ability === 'con') &&
    isHeavilyEncumbered(char);
  // SRD species save advantages that key off the *condition being
  // applied* (not the save ability itself):
  //   Elf / Drow — Fey Ancestry, advantage on saves vs Charmed
  //   Halfling   — Brave, advantage on saves vs Frightened
  //   Dwarf      — Dwarven Resilience, advantage on saves vs Poisoned
  const speciesId = char.species ?? 'human';
  const speciesAdv =
    (effect.condition === 'charmed' && (speciesId === 'elf' || speciesId === 'drow')) ||
    (effect.condition === 'frightened' && speciesId === 'halfling') ||
    (effect.condition === 'poisoned' && speciesId === 'dwarf') ||
    // SRD Protection from Evil and Good — Advantage on saves vs Charmed/Frightened.
    (!!char.protected_from_evil &&
      (effect.condition === 'charmed' || effect.condition === 'frightened'));
  // SRD Barbarian Danger Sense (L2): Advantage on DEX saves.
  const dangerSenseAdv = effect.ability === 'dex' && hasDangerSense(char);
  let applied = rollConditionSave(
    effect.ability,
    char[effect.ability] ?? 10,
    dcAdjusted,
    proficient,
    char.level,
    0,
    char.conditions ?? [],
    inspirationActive || luckActive || speciesAdv || dangerSenseAdv,
    enc,
    d20TestPenalty(char)
  );
  // SRD Fighter Indomitable — reroll the failed save with +Fighter level
  // (folded in by lowering the DC). The one-shot Inspiration/Luck advantage
  // was spent on the first roll, so only the standing species advantage
  // carries to the reroll. Returns `applied === true` when the save failed.
  let indomitableConsumed = false;
  if (applied && !deferReactionRerolls) {
    const indo = tryIndomitableReroll(
      char,
      () =>
        !rollConditionSave(
          effect.ability,
          char[effect.ability] ?? 10,
          dcAdjusted - indomitableBonus(char),
          proficient,
          char.level,
          0,
          char.conditions ?? [],
          speciesAdv,
          enc,
          d20TestPenalty(char)
        )
    );
    if (indo.used && indo.saved) {
      applied = false;
      indomitableConsumed = true;
    }
  }
  // SRD Rogue Stroke of Luck — if the save still failed, turn the die into a
  // 20 (tested via rollConditionSave's forceD20) when that 20 would pass.
  let strokeOfLuckConsumed = false;
  if (applied && strokeOfLuckAvailable(char)) {
    const passesWith20 = !rollConditionSave(
      effect.ability,
      char[effect.ability] ?? 10,
      dcAdjusted,
      proficient,
      char.level,
      0,
      char.conditions ?? [],
      speciesAdv,
      enc,
      d20TestPenalty(char),
      20
    );
    if (passesWith20) {
      applied = false;
      strokeOfLuckConsumed = true;
    }
  }
  // SRD Fiend Warlock Dark One's Own Luck — if the save still failed, add 1d10
  // (modeled as a reroll with the DC lowered by the roll) when it rescues it.
  let darkOnesLuckConsumed = false;
  if (applied) {
    const luck = tryDarkOnesLuck(
      char,
      () =>
        !rollConditionSave(
          effect.ability,
          char[effect.ability] ?? 10,
          dcAdjusted - rollDice('1d10'),
          proficient,
          char.level,
          0,
          char.conditions ?? [],
          speciesAdv,
          enc,
          d20TestPenalty(char)
        )
    );
    if (luck.used && luck.saved) {
      applied = false;
      darkOnesLuckConsumed = true;
    }
  }
  // SRD Boon of Fate — Improve Fate: if the save still failed, add 2d4 (modeled
  // as a reroll with the DC lowered by the roll) when it rescues it. Once per
  // Initiative / Short or Long Rest.
  let improveFateConsumed = false;
  if (applied) {
    const fate = tryImproveFate(
      char,
      () =>
        !rollConditionSave(
          effect.ability,
          char[effect.ability] ?? 10,
          dcAdjusted - rollDice('2d4'),
          proficient,
          char.level,
          0,
          char.conditions ?? [],
          speciesAdv,
          enc,
          d20TestPenalty(char)
        )
    );
    if (fate.used && fate.saved) {
      applied = false;
      improveFateConsumed = true;
    }
  }
  // SRD Bard Countercharm — if a Charmed/Frightened save still failed, a Bard
  // L7+ within 30 ft (self or ally) with a Reaction available can make the save
  // be rerolled with Advantage. Auto-resolve (like Indomitable/Stroke of Luck):
  // only spent when the advantaged reroll rescues it, so the reaction isn't
  // wasted. Returns the reactor's id so the caller spends that bard's reaction.
  let countercharmBardId: string | undefined;
  // Helper: find a Bard (self or ally within 30 ft) able to Countercharm `char`.
  const findCountercharmBard = (): Character | undefined => {
    const charEnt = st.entities?.find((e) => e.id === char.id);
    return (st.characters ?? []).find((p) => {
      if (!canCountercharm(p)) return false;
      if (p.id === char.id) return true; // self
      const pEnt = st.entities?.find((e) => e.id === p.id);
      return charEnt && pEnt ? distanceFeet(charEnt.pos, pEnt.pos) <= 30 : true;
    });
  };
  if (
    applied &&
    !deferReactionRerolls &&
    (effect.condition === 'charmed' || effect.condition === 'frightened')
  ) {
    const bard = findCountercharmBard();
    if (bard) {
      const rescued = !rollConditionSave(
        effect.ability,
        char[effect.ability] ?? 10,
        dcAdjusted,
        proficient,
        char.level,
        0,
        char.conditions ?? [],
        true, // Countercharm grants Advantage on the reroll
        enc,
        d20TestPenalty(char)
      );
      if (rescued) {
        applied = false;
        countercharmBardId = bard.id;
      }
    }
  }

  // Interactive deferral — the save still failed and the player should choose
  // whether to spend Indomitable / Countercharm. Pre-roll a single source's
  // outcome (Indomitable first — it isn't even a Reaction, just a per-rest
  // reroll; then an ally/self Bard's Countercharm) so the caller can open a
  // `save_reroll` window. `succeeds` is final: the dice are rolled here.
  let deferredReroll:
    | {
        source: 'indomitable' | 'countercharm';
        reactorId: string;
        reactorName: string;
        succeeds: boolean;
      }
    | undefined;
  if (applied && deferReactionRerolls) {
    if (indomitableRemaining(char) > 0) {
      const succeeds = !rollConditionSave(
        effect.ability,
        char[effect.ability] ?? 10,
        dcAdjusted - indomitableBonus(char),
        proficient,
        char.level,
        0,
        char.conditions ?? [],
        speciesAdv,
        enc,
        d20TestPenalty(char)
      );
      deferredReroll = {
        source: 'indomitable',
        reactorId: char.id,
        reactorName: char.name,
        succeeds,
      };
    } else if (effect.condition === 'charmed' || effect.condition === 'frightened') {
      const bard = findCountercharmBard();
      if (bard) {
        const succeeds = !rollConditionSave(
          effect.ability,
          char[effect.ability] ?? 10,
          dcAdjusted,
          proficient,
          char.level,
          0,
          char.conditions ?? [],
          true, // Countercharm grants Advantage on the reroll
          enc,
          d20TestPenalty(char)
        );
        deferredReroll = {
          source: 'countercharm',
          reactorId: bard.id,
          reactorName: bard.name,
          succeeds,
        };
      }
    }
  }
  return {
    applied,
    inspirationConsumed: inspirationActive,
    indomitableConsumed,
    strokeOfLuckConsumed,
    luckConsumed: luckActive,
    bardicInspirationConsumed: !!biDie,
    bardicRoll,
    countercharmBardId,
    darkOnesLuckConsumed,
    improveFateConsumed,
    deferredReroll,
  };
}

// ─── Enemy attack helper ──────────────────────────────────────────────────────

// Interactive save-reroll info, deferred out of a save site (condition save in
// `conditionSavingThrow`, or a damage-spell save in `resolveEnemySpell`) and
// surfaced so the caller can open a `save_reroll` reaction window. `succeeds`
// is pre-rolled at save time. A successful reroll either strips `condition`
// (condition saves) or refunds `damageRefund` HP (damage saves) — exactly one
// is set per info.
export interface PendingSaveRerollInfo {
  saveAbility: AbilityKey;
  saveDc: number;
  source: 'indomitable' | 'countercharm';
  reactorId: string;
  reactorName: string;
  succeeds: boolean;
  /** Condition a successful reroll removes (condition-save path). */
  condition?: string;
  /** HP a successful reroll refunds — full-minus-saved damage (damage-save path). */
  damageRefund?: number;
  /** Concentration spell whose break is DEFERRED to this window (concentration
   *  path): a successful reroll keeps it, decline / failed reroll breaks it. */
  concentrationSpellId?: string;
}

// SRD 5.2.1 — Massive Damage: when damage reduces a character to 0 HP
// and the leftover damage equals or exceeds their HP maximum, the character
// dies outright (no death saves).
function isMassiveDamageDeath(prevHp: number, damage: number, maxHp: number): boolean {
  if (prevHp <= 0) return false; // already at 0; further damage is just bookkeeping
  const remainder = damage - prevHp;
  return remainder >= maxHp;
}

/**
 * Compute an enemy attack against `char` without committing to game
 * state. The function rolls everything (attack, applyDamage,
 * onHitEffect save), builds the full narrative prose into a fragment,
 * and returns the *proposed* post-attack character + state. The caller
 * decides whether to commit immediately (no reaction window) or stash
 * the proposed values in `pending_reaction` for Shield-deferred
 * commit. Shield-accept discards the proposed values — the
 * concentration save outcome is thrown away with them, which is the
 * RAW-correct behavior (one save per damage *taken*, not per damage
 * threatened).
 *
 * `proposedSt` carries:
 *   - The character mutations via the matching characters[] entry.
 *   - Bless cleanup on linked allies when concentration breaks.
 *
 * `pending_reaction` on the returned proposedSt is intentionally NOT
 * cleared here — callers that stash it should clear it themselves.
 */
function computeEnemyAttack(
  enemy: Enemy,
  char: Character,
  st: GameState,
  context: Context,
  // SRD Lucky feat (Disadvantage benefit) — when set, the target
  // spent a luck point to impose Disadvantage on this attack roll.
  // Combines with any existing adv/disadv per RAW (single advantage
  // + single disadvantage cancel to a normal roll).
  forceDisadvantage = false,
  // SRD Vision & Light — the room's light level. In a 'dark' room a creature
  // that can't see (no darkvision/blindsight) attacks at Disadvantage and is
  // attacked at Advantage. 'dim'/'bright' don't affect attack rolls. 'sunlight'
  // is Bright Light that triggers Sunlight Sensitivity.
  roomLighting: 'bright' | 'dim' | 'dark' | 'sunlight' = 'bright',
  // SRD Vision & Light — the room's solid obstacle cells (walls). A light source
  // can't illuminate a target behind a wall, so darkness visibility honors LoS.
  roomObstacles: GridPos[] = []
): {
  /** Updated character — HP, temp_hp, conditions, condition_durations,
   *  class_resource_uses, concentrating_on, inspiration, and
   *  bardic_inspiration_die applied. */
  proposedChar: Character;
  /** Updated state — Bless cleanup etc. from concentration breaks. */
  proposedSt: GameState;
  hpLost: number;
  /** Fragment carrying the full attack prose + payload for the
   *  `attack_hit` / `attack_miss` `CombatEvent`. */
  fragment: EnemyAttackHitFragment | EnemyAttackMissFragment;
  // Exposed so callers can detect reaction windows (Shield: total in [AC, AC+4]).
  atkTotal: number;
  /** The raw d20 result from the attack roll (without adv/disadv
   *  resolution applied — see `resolveEnemyAttack` for details).
   *  Preserved so reaction handlers that need to reroll (Silvery
   *  Barbs) or compare against the d20 directly can do so. */
  atkD20: number;
  hit: boolean;
  /** Whether the attack rolled with advantage. Exposed so the
   *  Restore Balance reaction (Clockwork Soul Sorcerer) can gate on
   *  enemy-rolled-with-advantage. */
  hadAdvantage: boolean;
  /** Set when a save-based onHitEffect condition landed AND the target/an ally
   *  could reroll it interactively (Fighter Indomitable / Bard Countercharm).
   *  `resolveEnemySubAttack` opens a `save_reroll` window from this. */
  pendingSaveReroll?: PendingSaveRerollInfo;
} {
  // SRD Sanctuary — before the attack resolves, a creature attacking the warded
  // PC makes a Wisdom save vs the caster's spell DC; on a failure it can't bring
  // itself to attack and the attack is lost. (On a success it attacks normally;
  // the ward persists. RAW: the ward also ends when the warded creature attacks/
  // casts — deferred.)
  const sanctuaryDc = char.sanctuary_dc ?? 0;
  if (sanctuaryDc > 0) {
    const enemyWis = (enemy as unknown as Record<string, number>).wis ?? 10;
    const sanctSave = rollDice('1d20') + abilityMod(enemyWis);
    if (sanctSave < sanctuaryDc) {
      return {
        proposedChar: char,
        proposedSt: st,
        hpLost: 0,
        fragment: {
          kind: 'enemy_attack_miss',
          attackerEnemyId: enemy.id,
          attackerName: enemy.name,
          targetCharId: char.id,
          targetName: char.name,
          atkTotal: sanctSave,
          targetAc: char.ac,
          prose: ` ${enemy.name} falters — Sanctuary turns its attack on ${char.name} aside (WIS ${fmt.roll(sanctSave)} vs DC ${sanctuaryDc}).`,
        },
        atkTotal: sanctSave,
        atkD20: 0,
        hit: false,
        hadAdvantage: false,
      };
    }
  }
  const isDodging = char.turn_actions?.dodging ?? false;
  const isReckless = char.turn_actions?.reckless ?? false;
  // SRD Rogue Elusive (L18): no attack roll can have Advantage against the
  // rogue unless they're Incapacitated — overrides every advantage source
  // (prone/blinded/restrained, Reckless, etc.). `hasElusive` already returns
  // false when the rogue is under an incapacitating condition.
  // SRD Ranger Feral Senses (L18) — Blindsight; the ranger being Blinded no
  // longer grants attackers Advantage (other advantage-granting conditions
  // still apply).
  const advFromConditions = char.conditions.some(
    (c) => ADVANTAGE_CONDITIONS.has(c) && !(c === 'blinded' && hasFeralSenses(char))
  );
  const attackerEnt = st.entities?.find((e) => e.id === enemy.id && e.isEnemy);
  // SRD Pack Tactics — Advantage when at least one ally (another living enemy)
  // is within 5 ft of the target. Reads the target's + allies' grid positions.
  const packTacticsAdv =
    !!enemy.packTactics &&
    (() => {
      const targetEnt = st.entities?.find((e) => e.id === char.id && !e.isEnemy);
      if (!targetEnt) return false;
      return (st.entities ?? []).some(
        (e) => e.isEnemy && e.id !== enemy.id && e.hp > 0 && distanceFeet(e.pos, targetEnt.pos) <= 5
      );
    })();
  // SRD Bloodied Frenzy — Advantage while the attacker is Bloodied (≤ half HP).
  // (The matching save-advantage half is a follow-up.)
  const bloodiedFrenzyAdv =
    !!enemy.bloodiedFrenzy &&
    !!attackerEnt &&
    attackerEnt.hp <= (attackerEnt.maxHp ?? attackerEnt.hp) / 2;
  // SRD Vision & Light — darkness (Heavily Obscured). The enemy attacking a
  // target it can't see is at Disadvantage; a target that can't see the enemy is
  // attacked at Advantage. "Can see X" = darkvision/blindsight OR X stands in an
  // illuminated cell (Light/Daylight/torch overrides the dark). Enemies default
  // to 60 ft darkvision; the target's blindsight comes from Feral Senses /
  // Devil's Sight.
  const darkRoom = roomLighting === 'dark';
  const lightEnts = st.entities ?? [];
  const darknessCells = magicalDarknessCells(st.spell_zones);
  const enemyPos = attackerEnt?.pos;
  const pcPos = lightEnts.find((e) => e.id === char.id && !e.isEnemy)?.pos;
  // Blindsight / Devil's Sight / Truesight — the PC sees in the dark and through
  // magical Darkness (see `piercesMagicalDarkness`).
  const targetBlindsight = piercesMagicalDarkness(char);
  const enemyCanSeePc = canSeeTarget({
    observerPos: enemyPos,
    targetPos: pcPos,
    observerCanSeeInDark: seesInDarkness(enemy.darkvision_ft ?? 60, false),
    observerPiercesMagicalDarkness: false,
    roomDark: darkRoom,
    entities: lightEnts,
    darknessCells,
    obstacles: roomObstacles,
  });
  const pcCanSeeEnemy = canSeeTarget({
    observerPos: pcPos,
    targetPos: enemyPos,
    observerCanSeeInDark: seesInDarkness(char.darkvision_ft ?? 0, targetBlindsight),
    observerPiercesMagicalDarkness: targetBlindsight,
    roomDark: darkRoom,
    entities: lightEnts,
    darknessCells,
    obstacles: roomObstacles,
  });
  // Enemy can't see the PC → its attack at Disadvantage; PC can't see the enemy
  // → the enemy's attack at Advantage.
  const darknessDisadv = !enemyCanSeePc;
  const darknessAdv = !pcCanSeeEnemy;
  // SRD Vision & Light — surface the effective-Blinded state in the prose. When
  // both combatants are blind the adv/disadv cancel, so just name them both.
  const darknessNote =
    darknessDisadv && darknessAdv
      ? ` Both combatants are Blinded by the darkness.`
      : darknessDisadv
        ? ` ${enemyRef(enemy, true)} is Blinded by the darkness.`
        : darknessAdv
          ? ` ${char.name} is Blinded by the darkness.`
          : '';
  const hasAdvantage = hasElusive(char)
    ? false
    : advFromConditions || isReckless || packTacticsAdv || bloodiedFrenzyAdv || darknessAdv;
  const baseDisadvantage = char.conditions.some((c) => ENEMY_DISADV_CONDITIONS.has(c)) || isDodging;
  // SRD Ranger Multiattack Defense (L7) — once this enemy has hit the PC this
  // round, its further attacks against them roll with Disadvantage (the mark
  // is round-stamped, so it self-expires next round).
  const multiattackDefenseDisadv =
    hasMultiattackDefense(char) &&
    (char.multiattack_defense_marks?.[enemy.id] ?? -1) === (st.round ?? 1);
  // SRD — conditions that impose Disadvantage on the afflicted creature's own
  // attacks (Blinded, Frightened, Poisoned, Restrained, Prone) all apply to an
  // enemy attacker too, read from the registry's `DISADV_CONDITIONS` set. The
  // attacker's conditions live on its grid entity (Color Spray / Blindness /
  // Cunning Strike, Fear, Web / Entangle / Ensnaring Strike, Shove / Topple).
  // Frightened's "while it can see the source" caveat is approximated as
  // always-in-sight.
  const attackerSelfDisadv = attackerEnt?.conditions.some((c) => DISADV_CONDITIONS.has(c)) ?? false;
  // SRD Sunlight Sensitivity (Kobold/Specter/Wight/Wraith) — Disadvantage on
  // attack rolls while the attacker stands in sunlight (a 'sunlight' room or a
  // Daylight emanation's bright radius). The Daylight counterplay made live.
  const sunlightSensitivityDisadv =
    !!enemy.sunlightSensitivity && !!enemyPos && isInSunlight(enemyPos, roomLighting, lightEnts);
  const hasDisadvantage =
    baseDisadvantage ||
    forceDisadvantage ||
    multiattackDefenseDisadv ||
    attackerSelfDisadv ||
    darknessDisadv ||
    sunlightSensitivityDisadv;
  const result = resolveEnemyAttack(enemy, char.ac, hasAdvantage, hasDisadvantage);
  // SRD Enlarge/Reduce — a Reduced enemy's weapon attacks deal -1d4 (floored at
  // 1), an Enlarged enemy's +1d4. Keyed off the attacker's grid-entity condition.
  if (result.damage > 0) {
    const erEnt = st.entities?.find((e) => e.id === enemy.id && e.isEnemy);
    if (erEnt?.conditions?.includes('enlarged')) result.damage += rollDice('1d4');
    else if (erEnt?.conditions?.includes('reduced'))
      result.damage = Math.max(1, result.damage - rollDice('1d4'));
  }
  // Equipped-armor lookup. `equipped_armor` stores an `instance_id`
  // (see routes/game.ts character creation), not a loot id — the
  // previous `i.id === ...` form silently never matched, leaving
  // `armorItem` undefined and the `enemyDeflected` narrative pool
  // (defined in every context) unused on misses. Fixed to match by
  // instance_id, which is the same pattern used elsewhere
  // (twoWeaponAttack.ts, attack/toHit.ts, castSpell.ts).
  const armorItem = equippedArmorId(char)
    ? char.inventory?.find((i) => i.instance_id === equippedArmorId(char))
    : null;

  if (result.hit) {
    // SRD Blink — the warded PC spends about half each round in the Border
    // Ethereal, where Material attacks can't reach. RAW rolls a d20 at the start
    // of each of the caster's turns (11+ ⇒ ethereal for the round); pansori
    // approximates per-attack with the same d20 11+ test (same ~50%, lower
    // variance). On a blink-out the blow finds no one — auto-miss, no duplicate
    // spent. Checked before Mirror Image (you're not there to need a double).
    if (char.blinking && rollDice('1d20') >= 11) {
      return {
        proposedChar: char,
        proposedSt: st,
        hpLost: 0,
        fragment: {
          kind: 'enemy_attack_miss',
          attackerEnemyId: enemy.id,
          attackerName: enemy.name,
          targetCharId: char.id,
          targetName: char.name,
          atkTotal: result.total,
          targetAc: char.ac,
          prose: ` ${enemy.name}'s blow passes through empty air — ${char.name} has blinked out of reality!`,
        },
        atkTotal: result.total,
        atkD20: result.roll,
        hit: false,
        hadAdvantage: hasAdvantage,
      };
    }

    // SRD Mirror Image — when a creature HITS the warded PC, roll a d6 per
    // remaining duplicate; if any is 3+, a duplicate takes the hit instead (no
    // damage) and is destroyed. (RAW exemption for a Blinded / Blindsight /
    // Truesight attacker is deferred.)
    const mImages = char.mirror_images ?? 0;
    if (mImages > 0) {
      const absorbed = Array.from({ length: mImages }, () => rollDice('1d6')).some((d) => d >= 3);
      if (absorbed) {
        const left = mImages - 1;
        const updatedChar: Character = { ...char, mirror_images: left > 0 ? left : undefined };
        return {
          proposedChar: updatedChar,
          proposedSt: st,
          hpLost: 0,
          fragment: {
            kind: 'enemy_attack_miss',
            attackerEnemyId: enemy.id,
            attackerName: enemy.name,
            targetCharId: char.id,
            targetName: char.name,
            atkTotal: result.total,
            targetAc: char.ac,
            prose: ` ${enemy.name}'s blow strikes one of ${char.name}'s mirror images — it shatters!${left > 0 ? ` (${left} left)` : ' (the last one)'}`,
          },
          atkTotal: result.total,
          atkD20: result.roll,
          hit: false,
          hadAdvantage: hasAdvantage,
        };
      }
    }
    // Rage resistance: halve physical damage while raging (SRD)
    const isRaging = char.conditions.includes('raging');
    // Petrified: resistance to all damage (SRD)
    const isPetrified = char.conditions.includes('petrified');
    // SRD Beast Form (Bear / Brown Bear) — physical damage resistance
    // while shifted into a physicalResistance form.
    const beastForm =
      char.conditions.includes('wild_shaped') && char.wild_shape_form
        ? BEAST_FORMS[char.wild_shape_form]
        : undefined;
    const beastResist = !!beastForm?.physicalResistance;
    // SRD species resistance — Dwarves (poison), Dragonborn (ancestry
    // type, default fire), Tieflings (fire).
    const speciesData = char.species ? SRD_SPECIES[char.species] : undefined;
    const speciesResist =
      enemy.damageType && speciesData?.resistances?.includes(enemy.damageType) === true;
    // SRD Monk Superior Defense (L18): Resistance to all damage except Force
    // (while active and not Incapacitated).
    const superiorDefenseActive =
      char.conditions.includes('superior_defense') &&
      (enemy.damageType ?? 'bludgeoning') !== 'force' &&
      !char.conditions.some((c) =>
        ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
      );
    // SRD Draconic Sorcery Elemental Affinity (L6) — Resistance to the chosen
    // damage type.
    const affinityResist = !!enemy.damageType && elementalAffinityType(char) === enemy.damageType;
    // SRD Fiend Warlock Fiendish Resilience (L10) — Resistance to the chosen
    // damage type (cannot be Force; enforced at selection).
    const fiendishResist = !!enemy.damageType && char.fiendish_resilience === enemy.damageType;
    // Buff-granted Resistance (Stoneskin → B/P/S, Protection from Energy → an
    // element). Cleared when the granting spell's concentration ends.
    const spellResist =
      !!enemy.damageType && (char.spell_resistances ?? []).includes(enemy.damageType);
    const anyResist =
      isRaging ||
      isPetrified ||
      beastResist ||
      speciesResist ||
      superiorDefenseActive ||
      affinityResist ||
      fiendishResist ||
      spellResist;
    const postResistDmg = anyResist ? Math.ceil(result.damage / 2) : result.damage;
    const rageNote = isRaging ? ` (Rage resistance: ${result.damage}→${postResistDmg})` : '';
    const petrNote = isPetrified
      ? ` (Petrified resistance: ${result.damage}→${postResistDmg})`
      : '';
    const beastNote =
      beastResist && !isRaging && !isPetrified
        ? ` (${beastForm?.name} resistance: ${result.damage}→${postResistDmg})`
        : '';
    const speciesNote =
      speciesResist && !isRaging && !isPetrified && !beastResist
        ? ` (${speciesData?.name} ${enemy.damageType} resistance: ${result.damage}→${postResistDmg})`
        : '';
    const superiorDefNote =
      superiorDefenseActive && !isRaging && !isPetrified && !beastResist && !speciesResist
        ? ` (Superior Defense resistance: ${result.damage}→${postResistDmg})`
        : '';
    const affinityNote =
      affinityResist &&
      !isRaging &&
      !isPetrified &&
      !beastResist &&
      !speciesResist &&
      !superiorDefenseActive
        ? ` (Elemental Affinity ${enemy.damageType} resistance: ${result.damage}→${postResistDmg})`
        : '';
    const wardNote = '';
    const charAfterWard = char;
    const postWardDmg = postResistDmg;
    // SRD Monk Deflect Attacks (L3) is now an INTERACTIVE reaction window —
    // opened in `resolveEnemySubAttack` after this proposal is computed (mirrors
    // Uncanny Dodge), so the proposed snapshot here carries the FULL B/P/S
    // damage and the resolver applies the 1d10 + DEX + Monk-level reduction on
    // accept. (The optional Focus-Point redirect is deferred — see docs/TODO.md.)
    const postDeflectDmg = postWardDmg;
    // SRD Ranger Superior Hunter's Defense (L15): a Reaction grants Resistance
    // to the damage type until end of turn. Auto-resolved (player-favorable,
    // like Deflect Attacks): spend the reaction the first time a type lands this
    // round, then halve that type free for the rest of the round (round-stamped,
    // self-expiring). Skipped if Deflect already spent the reaction this hit.
    const shdDmgType = enemy.damageType ?? 'bludgeoning';
    const shdActiveType =
      char.superior_hunters_def?.round === (st.round ?? 1)
        ? char.superior_hunters_def?.type
        : undefined;
    const shdAlready = shdActiveType === shdDmgType;
    const shdTrigger = hasSuperiorHuntersDefense(char) && !char.turn_actions?.reaction_used;
    let shdNote = '';
    let shdStamp = char.superior_hunters_def;
    let shdReactionUsed = false;
    let postShdDmg = postDeflectDmg;
    if ((shdAlready || shdTrigger) && postDeflectDmg > 0) {
      postShdDmg = Math.ceil(postDeflectDmg / 2);
      shdNote = ` 🏹 Superior Hunter's Defense: ${fmt.dmg(postDeflectDmg)} → ${fmt.dmg(postShdDmg)} (resist ${shdDmgType})`;
      if (!shdAlready) {
        shdStamp = { type: shdDmgType, round: st.round ?? 1 };
        shdReactionUsed = true;
      }
    }
    // Universal damage application — temp_hp absorption, exhaustion-4 max-HP
    // clamp, knock-out detection, and the SRD concentration save all flow
    // through `applyDamage`. (PR-2's deferred enemy-attack migration.)
    // SRD bonus on-hit damage rider (Ghast bite +2d8 Necrotic, Wight sword
    // +1d8 Necrotic). Rolled fresh and added after the primary hit's B/P/S-
    // specific reductions (Deflect / Superior Hunter's Defense don't apply to
    // it); halved only if the target resists the bonus type (or is Petrified →
    // all damage).
    let bonusDmg = 0;
    let bonusNote = '';
    if (enemy.bonusDamage) {
      const bt = enemy.bonusDamageType;
      const rolled = rollDice(enemy.bonusDamage);
      const resistsBonus =
        isPetrified ||
        (!!bt && (char.spell_resistances ?? []).includes(bt)) ||
        speciesData?.resistances?.includes(bt ?? '') === true;
      bonusDmg = resistsBonus ? Math.ceil(rolled / 2) : rolled;
      if (bonusDmg > 0) bonusNote = ` (plus ${fmt.dmg(bonusDmg)} ${bt ?? ''})`.replace(' )', ')');
    }
    // SRD charge rider — extra damage (+ optional Prone, resolved post-damage)
    // when the enemy moved `afterFt`+ toward the target this turn (charged_ft
    // stamped during the approach). Added to the FIRST connecting hit; included
    // in the pre-reaction total so Deflect / Uncanny Dodge reduce it with the
    // rest of the hit (it's part of the attack). `charged_ft` is zeroed below so
    // a Multiattack adds it once.
    let chargeDmg = 0;
    let chargeNote = '';
    const chargeRider = enemy.chargeRider;
    const chargedFt = st.entities?.find((e) => e.id === enemy.id && e.isEnemy)?.charged_ft ?? 0;
    const chargeApplies = !!chargeRider && chargedFt >= chargeRider.afterFt;
    if (chargeRider && chargeApplies && chargeRider.bonusDamage) {
      const ct = chargeRider.bonusType ?? enemy.damageType;
      const rolled = rollDice(chargeRider.bonusDamage);
      const resistsCharge =
        isPetrified ||
        (!!ct && (char.spell_resistances ?? []).includes(ct)) ||
        speciesData?.resistances?.includes(ct ?? '') === true;
      chargeDmg = resistsCharge ? Math.ceil(rolled / 2) : rolled;
      if (chargeDmg > 0)
        chargeNote = ` (charge: +${fmt.dmg(chargeDmg)} ${ct ?? ''})`.replace(' )', ')');
    }
    const dmgResult = applyDamage(charAfterWard, st, postShdDmg + bonusDmg + chargeDmg, {
      deferConcentrationIndomitable: true,
      // SRD Resistance cantrip — −1d4 if the PC chose this attack's damage type
      // (applied inside applyDamage, once per round).
      damageType: enemy.damageType,
    });
    let updatedChar = dmgResult.char;
    if (shdReactionUsed) {
      updatedChar = {
        ...updatedChar,
        turn_actions: { ...updatedChar.turn_actions, reaction_used: true },
      };
    }
    if (shdStamp !== char.superior_hunters_def) {
      updatedChar = { ...updatedChar, superior_hunters_def: shdStamp };
    }
    let newSt = dmgResult.st;
    const hpLost = dmgResult.amountDealt;
    // Consume the charge (zero charged_ft so the rider lands once per turn) and
    // apply its Prone, if any. 2024 SRD: the Prone is automatic (no save); the
    // size gate is ignored since PCs are Medium and always qualify.
    if (chargeApplies) {
      newSt = {
        ...newSt,
        entities: (newSt.entities ?? []).map((e) =>
          e.id === enemy.id && e.isEnemy ? { ...e, charged_ft: 0 } : e
        ),
      };
      if (
        chargeRider!.prone &&
        !updatedChar.conditions.includes('prone') &&
        !conditionImmunitiesFor(updatedChar, st).has('prone')
      ) {
        updatedChar = { ...updatedChar, conditions: [...updatedChar.conditions, 'prone'] };
        chargeNote += ` ${char.name} is knocked Prone by the charge!`;
      }
    }
    const tempHpNote =
      dmgResult.tempHpAbsorbed > 0
        ? ` (Temp HP absorbed ${dmgResult.tempHpAbsorbed} — temp HP: ${dmgResult.tempHpRemaining})`
        : '';

    // SRD Life Drain (Specter, Wight) — the Necrotic damage dealt also reduces
    // the target's Hit Point maximum by that amount (Specter: the all-necrotic
    // attack; Wight: its necrotic `bonusDamage` rider). The reduction lasts
    // until a Long Rest or Greater Restoration. `max_hp` is lowered directly so
    // every heal/clamp honors it; `life_drain_reduction` tracks the restorable
    // total. The target dies outright if this brings its maximum to 0.
    let lifeDrainNote = '';
    if (enemy.lifeDrain) {
      const necroticDealt =
        (enemy.damageType === 'necrotic' ? postShdDmg : 0) +
        (enemy.bonusDamageType === 'necrotic' ? bonusDmg : 0);
      if (necroticDealt > 0) {
        const newMax = Math.max(0, updatedChar.max_hp - necroticDealt);
        const removed = updatedChar.max_hp - newMax;
        updatedChar = {
          ...updatedChar,
          max_hp: newMax,
          life_drain_reduction: (updatedChar.life_drain_reduction ?? 0) + removed,
          hp: Math.min(updatedChar.hp, newMax),
        };
        if (newMax <= 0) {
          updatedChar = {
            ...updatedChar,
            hp: 0,
            dead: true,
            stable: false,
            died_at_round: st.round ?? 1,
          };
          lifeDrainNote = ` 💀 Life Drain: ${char.name}'s Hit Point maximum is drained to nothing — they die!`;
        } else {
          lifeDrainNote = ` 💀 Life Drain: ${char.name}'s Hit Point maximum drops by ${removed} (now ${newMax}).`;
        }
      }
    }

    let narrative = fillEnemyTokens(pick(context.narratives.enemyAttacks), enemy)
      .replace('{target}', char.name)
      .replace('{dmg}', fmt.dmg(hpLost));
    narrative += ` ${char.name} takes ${fmt.dmg(hpLost)} damage.`;
    // Say it when a PC drops — without this the next line ("attacks your
    // prone form — 2 death save failures") read as a non sequitur.
    if (dmgResult.knockedOut && !updatedChar.dead) {
      narrative += ` ${char.name} falls unconscious!`;
    }
    narrative += bonusNote;
    narrative += chargeNote;
    narrative +=
      rageNote +
      petrNote +
      beastNote +
      speciesNote +
      superiorDefNote +
      affinityNote +
      wardNote +
      tempHpNote;
    narrative += shdNote;
    narrative += dmgResult.resistanceNote;
    narrative += lifeDrainNote;
    narrative += dmgResult.concentrationNote;
    narrative += darknessNote;

    let inspirationConsumed = false;
    let luckConsumed = false;
    let bardicConsumed = false;
    // Interactive Indomitable / Countercharm reroll deferred out of the save
    // cascade — surfaced to `resolveEnemySubAttack` so it can open a
    // `save_reroll` reaction window after the condition lands.
    let pendingSaveReroll: PendingSaveRerollInfo | undefined;
    // Auto-apply onHitEffect (no save) — e.g. the Griffon's Rend grapple,
    // which lands on any hit and is escaped via a fixed DC, not a save. Handled
    // separately from the save-based path below.
    if (enemy.onHitEffect && !(enemy.onHitEffect.ability && enemy.onHitEffect.dc)) {
      const cond = enemy.onHitEffect.condition;
      if (conditionImmunitiesFor(updatedChar, st).has(cond)) {
        // Freedom of Movement (→ Grappled) etc. — the no-save effect can't land.
        narrative += ` ${fmt.note(`[${char.name} is immune to ${cond}]`)}`;
      } else if (!updatedChar.conditions.includes(cond)) {
        // Add WITHOUT a condition_durations entry so the grapple persists until
        // cleared by game logic (escape action / grappler incapacitation), not
        // the per-turn tick. (PCs carry no grapple immunity to gate on.)
        updatedChar = { ...updatedChar, conditions: [...updatedChar.conditions, cond] };
        narrative += ` ${char.name} is ${cond}!`;
        if (cond === 'grappled') {
          // Stamp the grappler + escape DC on the PC's grid entity so
          // `try_escape_grapple` rolls against the fixed DC and the
          // grapple-release sweep can end it when the Griffon is incapacitated.
          newSt = {
            ...newSt,
            entities: (newSt.entities ?? []).map((e) =>
              e.id === updatedChar.id && !e.isEnemy
                ? { ...e, grappled_by: enemy.id, grapple_escape_dc: enemy.onHitEffect!.escapeDc }
                : e
            ),
          };
        }
      }
    } else if (enemy.onHitEffect) {
      const csResult = conditionSavingThrow(
        enemy.onHitEffect as OnHitEffect & { ability: AbilityKey; dc: number },
        updatedChar,
        st,
        context,
        auraOfProtectionBonus(updatedChar, st),
        true // defer Indomitable / Countercharm to an interactive save_reroll window
      );
      if (csResult.deferredReroll) {
        pendingSaveReroll = {
          condition: enemy.onHitEffect.condition,
          saveAbility: enemy.onHitEffect.ability as AbilityKey,
          saveDc: enemy.onHitEffect.dc as number,
          ...csResult.deferredReroll,
        };
      }
      if (csResult.inspirationConsumed) {
        inspirationConsumed = true;
        narrative += ` ✦ Heroic Inspiration spent on the save!`;
      }
      if (csResult.indomitableConsumed) {
        updatedChar = consumeIndomitable(updatedChar);
        narrative += ` ✦ Indomitable — rerolled the save!`;
      }
      if (csResult.strokeOfLuckConsumed) {
        updatedChar = consumeStrokeOfLuck(updatedChar);
        narrative += ` ✦ Stroke of Luck — the save becomes a 20!`;
      }
      if (csResult.darkOnesLuckConsumed) {
        updatedChar = consumeDarkOnesLuck(updatedChar);
        narrative += ` ✦ Dark One's Own Luck — fate twists the save!`;
      }
      if (csResult.improveFateConsumed) {
        updatedChar = consumeImproveFate(updatedChar);
        narrative += ` ✦ Improve Fate — 2d4 turns the save!`;
      }
      if (csResult.countercharmBardId) {
        const bardId = csResult.countercharmBardId;
        const spendReaction = (c: Character) => ({
          ...c,
          turn_actions: { ...c.turn_actions, reaction_used: true },
        });
        if (bardId === updatedChar.id) {
          // Self-Countercharm — the saver is the bard; spend their reaction.
          updatedChar = spendReaction(updatedChar);
        } else {
          // An ally bard reacts — spend their reaction in the proposed state.
          newSt = {
            ...newSt,
            characters: newSt.characters.map((c) => (c.id === bardId ? spendReaction(c) : c)),
          };
        }
        const bardName = newSt.characters.find((c) => c.id === bardId)?.name ?? 'A bard';
        narrative += ` ✦ Countercharm — ${bardName} disrupts the effect (reroll with advantage)!`;
      }
      if (csResult.luckConsumed) {
        luckConsumed = true;
        narrative += ` 🍀 Luck point spent on the save!`;
      }
      if (csResult.bardicInspirationConsumed) {
        bardicConsumed = true;
        narrative += ` ✦ Bardic Inspiration spent on the save (+${csResult.bardicRoll})!`;
      }
      if (csResult.applied) {
        const sourceCond = enemy.onHitEffect.condition;
        const tracksSource = sourceCond === 'frightened' || sourceCond === 'charmed';
        const beforeConds = updatedChar.conditions.length;
        updatedChar = inflictCondition(
          updatedChar,
          sourceCond,
          tracksSource ? enemy.id : undefined
        );
        if (sourceCond === 'charmed') {
          updatedChar = { ...updatedChar, charmer_id: enemy.id };
        }
        // SRD Petrifying Bite (Cockatrice) — a failed save Restrains AND seeds the
        // petrification ladder, so the re-save at the PC's turn start can escalate
        // to Petrified. Strip Restrained's timed entry so the ladder owns it (cf.
        // applyPetrifyLadderToParty). A later save-reroll that strips Restrained
        // also unwinds this via resolvePetrifyLadder's "no longer Restrained" arm.
        if (enemy.onHitEffect.petrify && sourceCond === 'restrained' && !updatedChar.petrify_save) {
          const { restrained: _drop, ...durs } = updatedChar.condition_durations ?? {};
          updatedChar = {
            ...updatedChar,
            condition_durations: durs,
            petrify_save: {
              dc: enemy.onHitEffect.dc as number,
              ability: enemy.onHitEffect.ability as AbilityKey,
              acted: false,
            },
          };
        }
        if (updatedChar.conditions.length > beforeConds) {
          narrative += ` ${char.name} is ${sourceCond}!`;
        }
      }
    }
    if (inspirationConsumed) {
      updatedChar = {
        ...updatedChar,
        inspiration: false,
        turn_actions: { ...updatedChar.turn_actions, inspiration_pending: false },
      };
    }
    if (luckConsumed) {
      updatedChar = {
        ...updatedChar,
        turn_actions: { ...updatedChar.turn_actions, luck_pending: false },
      };
    }
    if (bardicConsumed) {
      updatedChar = { ...updatedChar, bardic_inspiration_die: undefined };
    }
    // Concentration Indomitable deferral falls back to the same window when no
    // onHitEffect condition reroll already claimed it (one reaction per hit).
    if (!pendingSaveReroll && dmgResult.concentrationSaveReroll) {
      pendingSaveReroll = dmgResult.concentrationSaveReroll;
    }
    const hitFragment: EnemyAttackHitFragment = {
      kind: 'enemy_attack_hit',
      attackerEnemyId: enemy.id,
      attackerName: enemy.name,
      targetCharId: char.id,
      targetName: char.name,
      damage: hpLost,
      damageType: enemy.damageType ?? 'physical',
      atkTotal: result.total,
      targetAc: char.ac,
      prose: narrative,
    };
    // SRD Multiattack Defense — record this enemy's hit for the round so its
    // subsequent attacks vs this PC roll with Disadvantage.
    if (hasMultiattackDefense(updatedChar)) {
      updatedChar = {
        ...updatedChar,
        multiattack_defense_marks: {
          ...(updatedChar.multiattack_defense_marks ?? {}),
          [enemy.id]: st.round ?? 1,
        },
      };
    }
    return {
      proposedChar: updatedChar,
      proposedSt: newSt,
      hpLost,
      fragment: hitFragment,
      atkTotal: result.total,
      atkD20: result.roll,
      hit: true,
      hadAdvantage: hasAdvantage,
      pendingSaveReroll,
    };
  }
  if (armorItem) {
    const deflectedProse =
      fillEnemyTokens(pick(context.narratives.enemyDeflected), enemy)
        .replace('{target}', char.name)
        .replace('{armor}', armorItem.name) + darknessNote;
    return {
      proposedChar: char,
      proposedSt: st,
      hpLost: 0,
      fragment: {
        kind: 'enemy_attack_miss',
        attackerEnemyId: enemy.id,
        attackerName: enemy.name,
        targetCharId: char.id,
        targetName: char.name,
        atkTotal: result.total,
        targetAc: char.ac,
        prose: deflectedProse,
      },
      atkTotal: result.total,
      atkD20: result.roll,
      hit: false,
      hadAdvantage: hasAdvantage,
    };
  }
  // Variety pool for plain misses — repeated "you dodge at the last
  // second" reads oddly when the PC never actually took the Dodge action.
  // Picks per-call so a multi-attack round doesn't echo the same line.
  const missLines = [
    `${enemyRef(enemy, true)} lunges — but you dodge at the last second!`,
    `${enemyRef(enemy, true)}'s strike swings wide of the mark.`,
    `${enemyRef(enemy, true)} attacks, but the blow glances off your guard.`,
    `${enemyRef(enemy, true)} misjudges the distance — the swing finds only air.`,
    `You sidestep ${enemyRef(enemy)}'s strike at the last moment.`,
    `The ${enemy.name} attacks ${char.name} — and misses cleanly.`,
  ];
  return {
    proposedChar: char,
    proposedSt: st,
    hpLost: 0,
    fragment: {
      kind: 'enemy_attack_miss',
      attackerEnemyId: enemy.id,
      attackerName: enemy.name,
      targetCharId: char.id,
      targetName: char.name,
      atkTotal: result.total,
      targetAc: char.ac,
      prose: pick(missLines) + darknessNote,
    },
    atkTotal: result.total,
    atkD20: result.roll,
    hit: false,
    hadAdvantage: hasAdvantage,
  };
}

// ─── Death save handler ───────────────────────────────────────────────────────

/**
 * `enemyAttackContext` — pass when this death save is being rolled
 * IMMEDIATELY AFTER an enemy attack that landed on the unconscious
 * PC (the multiattack-loop call path). Triggers the "2 failures from
 * the attack" SRD rule. Omit for the PC-invokes-`death_save` action
 * path: the PC is rolling on their own turn, no enemy attack
 * happened, and adding 2 failures every turn would silently double-
 * penalize them whenever any enemy is alive in the room.
 */
export function processDeathSave(
  char: Character,
  enemy: Enemy | null | undefined,
  context: Context,
  worldName: string,
  enemyAttackContext: boolean = false,
  currentRound: number = 1
): { narrative: string; newChar: Character; died: boolean; endedCombat: boolean } {
  // SRD 5.2.1 — an enemy that hits an Unconscious creature within 5 ft
  // auto-crits, and that hit counts as 2 death save failures. This is NOT a
  // death save the downed PC rolls — they only roll at the start of their own
  // turn — so short-circuit BEFORE rollDeathSave: apply the 2 failures and
  // check for death. (Previously this path also rolled a spurious d20 death
  // save on the enemy's turn.)
  if (enemyAttackContext && enemy) {
    const failures = Math.min(3, (char.death_saves?.failures ?? 0) + 2);
    const attacked: Character = {
      ...char,
      death_saves: { successes: char.death_saves?.successes ?? 0, failures },
    };
    let narrative = `The ${enemy.name} attacks your prone form — 2 death save failures (${failures}/3)!`;
    if (failures >= 3) {
      attacked.dead = true;
      attacked.died_at_round = currentRound;
      // Dead, not merely unconscious — drop the downed condition.
      attacked.conditions = (attacked.conditions ?? []).filter((c) => c !== 'unconscious');
      narrative +=
        ' ' +
        pick(context.narratives.deathLines)
          .replace(/{name}/g, char.name)
          .replace('{enemy}', enemy.name)
          .replace(/{world}/g, worldName);
      return { narrative, newChar: attacked, died: true, endedCombat: false };
    }
    return { narrative, newChar: attacked, died: false, endedCombat: false };
  }

  // SRD Beacon of Hope — death saves rolled with advantage while
  // the dying PC has the `hopeful` condition. SRD revive penalty
  // (Raise Dead / Resurrection) subtracts from the d20 threshold.
  const save = rollDeathSave(
    char.death_saves,
    (char.conditions ?? []).includes('hopeful'),
    d20TestPenalty(char)
  );
  const newChar = { ...char, death_saves: save.saves };
  let narrative = '';
  // No code path currently sets endedCombat = true. Kept as a return field for
  // callers' convenience and future death-related combat-ending hooks.
  const endedCombat = false;

  switch (save.result) {
    case 'regain_hp':
      // SRD 5.2.1 — rolling a 20 on a death save regains 1 HP and ends
      // the unconscious condition. It does NOT end the combat encounter;
      // remaining enemies keep fighting. Other conditions (frightened /
      // prone / grappled / etc.) persist — clearing every condition was a
      // legacy bug that erased fear from a downed-then-revived PC.
      newChar.hp = 1;
      newChar.death_saves = { successes: 0, failures: 0 };
      newChar.stable = false;
      newChar.conditions = (newChar.conditions ?? []).filter((c) => c !== 'unconscious');
      // Sync condition_durations to the trimmed list.
      if (newChar.condition_durations) {
        const { unconscious: _drop, ...restDur } = newChar.condition_durations;
        void _drop;
        newChar.condition_durations = restDur;
      }
      narrative = `Death Save — Natural ${fmt.roll(20)}! You surge back to ${fmt.hp(1)} HP, gasping but alive.`;
      return { narrative, newChar, died: false, endedCombat };

    case 'stable':
      newChar.stable = true;
      narrative = `Death Save — ${fmt.roll(save.roll)} (${save.saves.successes}/3 successes). You stabilise. Unconscious but no longer dying. You need healing to act again.`;
      break;

    case 'success': {
      const pool = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'Clinging to life...';
      narrative = `Death Save — ${fmt.roll(save.roll)} (${save.saves.successes}/3 successes, ${save.saves.failures}/3 failures). ${flavor}`;
      break;
    }

    case 'double_failure': {
      const pool = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'The darkness presses in...';
      narrative = `Death Save — Natural ${fmt.roll(1)}! Two failures (${save.saves.failures}/3). ${flavor}`;
      break;
    }

    case 'failure': {
      const pool = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'Fading...';
      narrative = `Death Save — ${fmt.roll(save.roll)} (${save.saves.successes}/3 successes, ${save.saves.failures}/3 failures). ${flavor}`;
      break;
    }

    case 'dead':
      newChar.dead = true;
      newChar.died_at_round = currentRound;
      // Dead, not merely unconscious — drop the downed condition.
      newChar.conditions = (newChar.conditions ?? []).filter((c) => c !== 'unconscious');
      narrative = pick(context.narratives.deathLines)
        .replace(/{name}/g, char.name)
        .replace('{enemy}', enemy?.name ?? 'your wounds')
        .replace(/{world}/g, worldName);
      return { narrative, newChar, died: true, endedCombat: false };
  }

  return { narrative, newChar, died: false, endedCombat };
}

// ─── Condition duration helpers ───────────────────────────────────────────────

// Condition rule data (durations, advantage/disadvantage grants, save mods,
// on-expire hooks) lives in `services/conditions/registry.ts`. These two
// functions are the inflict + tick wrappers around char.conditions[].

export function inflictCondition(char: Character, condition: string, sourceId?: string): Character {
  if (char.conditions.includes(condition)) {
    if (sourceId && condition === 'frightened') {
      return {
        ...char,
        condition_sources: { ...(char.condition_sources ?? {}), [condition]: sourceId },
      };
    }
    return char;
  }
  const rawDuration = getConditionDuration(condition);
  // 'permanent' conditions (unconscious, petrified) are stored with no
  // duration entry so tickConditions treats them as un-decremented.
  const durationEntry: Record<string, number> =
    rawDuration === 'permanent'
      ? { ...(char.condition_durations ?? {}) }
      : { ...(char.condition_durations ?? {}), [condition]: rawDuration };
  return {
    ...char,
    conditions: [...char.conditions, condition],
    condition_durations: durationEntry,
    // SRD Frightened (and a few others) track the source entity. Other
    // conditions ignore sourceId — it's free metadata when provided.
    ...(sourceId
      ? { condition_sources: { ...(char.condition_sources ?? {}), [condition]: sourceId } }
      : {}),
  };
}

// SRD charm riders — a Charmed creature's charm ends when it takes damage
// (Charm Person / Charm Monster / Hypnotic Pattern, …). Called once at the end
// of an action with a per-id HP snapshot taken before it resolved; clears
// `charmed` + the charmer link from any creature whose HP dropped. A single
// choke point that covers every damage path (attacks, AoE, zones, …).
export function breakCharmOnDamage(st: GameState, prevHp: Map<string, number>): GameState {
  let next = st;
  // Enemies charmed by a PC — the condition lives on the grid entity.
  if (next.entities?.some((e) => e.isEnemy && e.conditions.includes('charmed'))) {
    next = {
      ...next,
      entities: next.entities.map((e) =>
        e.isEnemy && e.conditions.includes('charmed') && e.hp < (prevHp.get(e.id) ?? e.hp)
          ? { ...e, conditions: e.conditions.filter((c) => c !== 'charmed'), charmer_id: undefined }
          : e
      ),
    };
  }
  // PCs charmed by an enemy — condition on the Character (+ entity mirror).
  const broken = new Set<string>();
  if (next.characters.some((c) => c.conditions.includes('charmed'))) {
    next = {
      ...next,
      characters: next.characters.map((c) => {
        if (c.conditions.includes('charmed') && c.hp < (prevHp.get(c.id) ?? c.hp)) {
          broken.add(c.id);
          return {
            ...c,
            conditions: c.conditions.filter((x) => x !== 'charmed'),
            charmer_id: undefined,
          };
        }
        return c;
      }),
    };
    if (broken.size > 0 && next.entities) {
      next = {
        ...next,
        entities: next.entities.map((e) =>
          !e.isEnemy && broken.has(e.id)
            ? { ...e, conditions: e.conditions.filter((x) => x !== 'charmed') }
            : e
        ),
      };
    }
  }
  return next;
}

// SRD Warding Bond — whenever a warded creature takes damage, its warder takes
// the same amount. Called once at the end of an action with the pre-action HP
// snapshot: for each `warded_by` creature whose HP dropped, deal that amount to
// the warder (full death/downing flow via applyDamage). The bond ends if the
// warder is gone or drops to 0.
export function redirectWardingBondDamage(st: GameState, prevHp: Map<string, number>): GameState {
  let next = st;
  for (const ward of st.characters) {
    if (!ward.warded_by || ward.dead) continue;
    const live = next.characters.find((c) => c.id === ward.id);
    if (!live) continue;
    const drop = (prevHp.get(ward.id) ?? live.hp) - live.hp;
    if (drop <= 0) continue;
    const warder = next.characters.find((c) => c.id === ward.warded_by);
    const endBond = (s: GameState): GameState => ({
      ...s,
      characters: s.characters.map((c) => (c.id === ward.id ? { ...c, warded_by: undefined } : c)),
    });
    if (!warder || warder.dead) {
      next = endBond(next); // warder gone → the ward ends
      continue;
    }
    const res = applyDamage(warder, next, drop);
    next = {
      ...res.st,
      characters: res.st.characters.map((c) => (c.id === res.char.id ? res.char : c)),
    };
    if (res.char.hp <= 0) next = endBond(next); // warder downed → the bond ends
  }
  return next;
}

export function tickConditions(char: Character): Character {
  const durations = char.condition_durations ?? {};
  if (!char.conditions.length) return char;

  const newDurations: Record<string, number> = {};
  const expired: string[] = [];

  for (const cond of char.conditions) {
    if (durations[cond] === undefined) {
      // No duration entry → permanent (only cleared by game logic)
      newDurations[cond] = durations[cond];
    } else {
      const remaining = durations[cond] - 1;
      if (remaining <= 0) {
        expired.push(cond);
      } else {
        newDurations[cond] = remaining;
      }
    }
  }

  const newConditions = char.conditions.filter((c) => !expired.includes(c));
  // Clear condition_sources entries for any expired condition.
  let newSources = char.condition_sources;
  if (expired.length > 0 && newSources) {
    newSources = { ...newSources };
    for (const c of expired) delete newSources[c];
  }
  // Registry-driven on-expire hooks (e.g. Shield spell reverses its +5 AC).
  const withExpiryHooks = applyExpiryHooks(
    {
      ...char,
      conditions: newConditions,
      condition_durations: newDurations,
      condition_sources: newSources,
    },
    expired
  );
  return withExpiryHooks;
}

// Conditions with a bespoke lifecycle in the enemy turn loop (consumed /
// re-saved / cleared there, or governed by the caster's concentration) — the
// generic timed mechanism must NOT stamp or tick these. 'commanded' is the
// one-shot skip the loop consumes itself; the other three are concentration-
// linked control conditions cleared by breakConcentration.
export const TURN_LOOP_MANAGED_CONDITIONS: ReadonlySet<string> = new Set([
  'commanded',
  'confused',
  'compelled',
  'dominated',
]);

// Round-wrap tick for ENEMY entities' timed conditions. The PC analogue
// (`tickConditions`) decrements at the start of each PC's turn; enemies have no
// per-turn hook, so their finite conditions are decremented once per full round
// on round wrap (SRD 5.2.1 — 1 round = 6 sec), mirroring the concentration /
// spell-zone ticks.
//
// Only conditions carrying a numeric `condition_durations` entry are touched.
// Concentration-governed enemy conditions (banished / polymorphed / dominated /
// confused / compelled, and condition spells like Hold Person / Fear) are
// applied WITHOUT a duration entry — their timer is the caster's concentration —
// so this tick leaves them alone. Cast paths stamp a finite duration only for
// non-concentration condition spells (Charm Person/Monster, Blindness, Color
// Spray) via `spell.conditionDuration`; those are the entries that expire here.
export function tickEnemyConditions(st: GameState): { st: GameState; narrative: string } {
  if (!st.entities) return { st, narrative: '' };
  let narrative = '';
  const entities = st.entities.map((e) => {
    if (!e.isEnemy) return e;
    const durations = e.condition_durations ?? {};
    if (Object.keys(durations).length === 0) return e;
    const newDurations: Record<string, number> = {};
    const expired: string[] = [];
    for (const [cond, left] of Object.entries(durations)) {
      // Turn-loop-managed conditions keep their entry untouched (defense in
      // depth — the cast paths also refuse to stamp them).
      if (TURN_LOOP_MANAGED_CONDITIONS.has(cond)) {
        newDurations[cond] = left;
        continue;
      }
      const remaining = left - 1;
      if (remaining <= 0) expired.push(cond);
      else newDurations[cond] = remaining;
    }
    if (expired.length > 0) {
      narrative += ` ${fmt.note(`[${e.id} recovers: ${expired.join(', ')} ends.]`)}`;
    }
    return {
      ...e,
      conditions:
        expired.length > 0 ? e.conditions.filter((c) => !expired.includes(c)) : e.conditions,
      condition_durations: newDurations,
    };
  });
  return { st: { ...st, entities }, narrative };
}

// SRD 5.2.1 (Variant Encumbrance) — speed reductions tied to carried weight.
// ≤ 5×STR: normal speed
// > 5×STR, ≤ 10×STR: -10 ft (encumbered)
// > 10×STR, ≤ 15×STR: -20 ft (heavily encumbered)
// > 15×STR: speed 0 (overloaded)
export function effectiveSpeed(char: Character, lootTable: LootItem[] = []): number {
  let base = char.speed ?? DEFAULT_SPEED_FEET;
  // SRD Longstrider — +10 ft Speed for the duration (a flat increase before the
  // Haste/Slow multipliers, like the other movement features below).
  if (char.longstrider_active) base += 10;
  // SRD Goliath Large Form — +10 ft speed while the condition is active.
  if (char.conditions?.includes('large_form')) base += 10;
  // SRD Barbarian Fast Movement (L5): +10 ft while not wearing Heavy armor.
  // Applied to the base before the Haste/Slow multipliers — it's a permanent
  // Speed increase. Needs the loot table to read the equipped armor's category.
  if (getClassLevel(char, 'barbarian') >= 5 && !wearingHeavyArmor(char, lootTable)) base += 10;
  // SRD Ranger Roving (L6): +10 ft while not wearing Heavy armor. A distinct
  // feature from Fast Movement, so a Barbarian/Ranger multiclass stacks both.
  // (Roving's "Climb/Swim Speed = Speed" half is deferred — no vertical/liquid
  // traversal model.)
  if (getClassLevel(char, 'ranger') >= 6 && !wearingHeavyArmor(char, lootTable)) base += 10;
  // SRD Haste — "the target's Speed is doubled." Multiplies the
  // post-Goliath / post-Mobile base; encumbrance still reduces after.
  // Applies to both walking and any future modes that derive from this
  // value (gridMove uses effectiveSpeed as the walking budget).
  if (char.conditions?.includes('hasted')) base *= 2;
  // SRD Slow — "the target's Speed is halved." Floor-divide so
  // odd speeds (a rare 25 ft speed) don't fractional. If both hasted
  // and slowed are somehow stacked (RAW: cancel adv/disadv style), they
  // multiplicatively offset — pansori MVP applies both in sequence.
  if (char.conditions?.includes('slowed')) base = Math.floor(base / 2);
  // SRD Exhaustion — Speed is reduced by 5 ft per Exhaustion level.
  base = Math.max(0, base - 5 * (char.exhaustion_level ?? 0));
  const weight = charCarriedWeight(char);
  // SRD Goliath Powerful Build: count as one size larger for carrying
  // capacity. Mechanically: double the effective STR-based thresholds.
  const carryMult = char.species === 'goliath' ? 2 : 1;
  const str = char.str * carryMult;
  if (weight > str * 15) return 0;
  if (weight > str * 10) return Math.max(0, base - 20);
  if (weight > str * 5) return Math.max(0, base - 10);
  return base;
}

// True when `char` has Heavy armor equipped (looked up via the loot table).
// Used by Barbarian Fast Movement. With an empty loot table the category can't
// be resolved, so it returns false (the unarmored common case is unaffected).
function wearingHeavyArmor(char: Character, lootTable: LootItem[]): boolean {
  if (!equippedArmorId(char)) return false;
  const armorId = (char.inventory ?? []).find((i) => i.instance_id === equippedArmorId(char))?.id;
  if (!armorId) return false;
  return lootTable.find((l) => l.id === armorId)?.armorCategory === 'heavy';
}

function charCarriedWeight(char: Pick<Character, 'inventory'>): number {
  return (char.inventory ?? []).reduce((sum, i) => {
    const w = (i as { weight?: number }).weight ?? 0;
    const count = (i as { count?: number }).count ?? 1;
    return sum + w * count;
  }, 0);
}

// SRD Variant Encumbrance — Heavily Encumbered (>10×STR) gives
// disadvantage on STR/DEX/CON ability checks, saving throws, AND attack
// rolls. Encumbered (>5×STR) only reduces speed; we ignore it for
// disadvantage purposes. Used in attack and skill/save resolution paths.
export function isHeavilyEncumbered(
  char: Pick<Character, 'inventory' | 'str' | 'species'>
): boolean {
  const w = charCarriedWeight(char);
  // Goliath Powerful Build: count as one size larger for carrying capacity.
  const carryMult = char.species === 'goliath' ? 2 : 1;
  return w > char.str * 10 * carryMult;
}

// ─── Enemy lookup helpers (multi-enemy per room) ──────────────────────────────

function getRoomEnemies(seed: Seed, roomId: string): Enemy[] {
  return seed.enemies?.[roomId] ?? [];
}

// A hostile NPC participates in combat as a regular enemy — same grid, same
// initiative, same machinery. We surface it as an Enemy on the fly so the
// combat path doesn't need a separate "duel" code branch.
// `seed.npcs` is keyed by NPC id (each PlacedNpc carries its `roomId`), so a room
// can host multiple NPCs. These helpers centralize the two access shapes.
export function npcById(seed: Seed, npcId: string): PlacedNpc | undefined {
  return seed.npcs?.[npcId];
}
export function npcsInRoom(seed: Seed, roomId: string): PlacedNpc[] {
  return Object.values(seed.npcs ?? {}).filter((n) => n.roomId === roomId);
}

function npcAsEnemy(npc: PlacedNpc): Enemy {
  return {
    id: `npc:${npc.id}`,
    name: npc.name,
    proper_noun: npc.proper_noun,
    hp: npc.hp,
    ac: npc.ac,
    damage: npc.damage,
    toHit: npc.toHit,
    xp: npc.xp,
    dex: npc.dex,
  };
}

function getLivingRoomEnemies(state: GameState, seed: Seed, roomId: string): Enemy[] {
  const killed = state.enemies_killed ?? [];
  const base = getRoomEnemies(seed, roomId).filter((e) => !killed.includes(e.id));
  // Include every EFFECTIVELY hostile NPC in this room as an enemy — flipped
  // via state (attack_npc, a parley gone wrong) or AUTHORED hostile (a boss
  // statted as an NPC so it can parley). A successful parley that shifts the
  // attitude off hostile removes them from this list — they stand down.
  for (const npc of npcsInRoom(seed, roomId)) {
    const attitude = state.npc_attitudes?.[npc.id] ?? npc.attitude;
    if (attitude === 'hostile' && !killed.includes(`npc:${npc.id}`)) {
      base.push(npcAsEnemy(npc));
    }
  }
  return base;
}

/**
 * Apply an AoE saving-throw attack to the whole living party — the shared core
 * of the lair-action `aoe_save_damage` effect and monster Breath Weapons. Each
 * living PC rolls `savingThrow` vs `saveDC` (save proficiency + Barbarian
 * Danger Sense honored), taking `dice` `damageType` damage on a failure or half
 * on a success; per-PC concentration checks accumulate into the returned state.
 * Returns the new state + a per-PC narrative tail (the caller prepends the
 * action header).
 *
 * The area is abstracted to "every PC in the room" — cone/line geometry isn't
 * modeled (all PCs are assumed caught in the blast), matching the lair-action
 * convention.
 */
export function applyAoeSaveToParty(
  st: GameState,
  context: Context,
  opts: {
    dice: string;
    damageType: string;
    savingThrow: AbilityKey;
    saveDC: number;
    // Optional rider condition for a failed save (breath / lair that also
    // Blinds / Frightens / Poisons). Stamped for `conditionDuration` rounds.
    condition?: ConditionName;
    conditionDuration?: number;
  }
): { st: GameState; narrative: string } {
  const fullDmg = rollDice(opts.dice);
  const scoreKey = opts.savingThrow;
  // Iterate so each PC's concentration check (and any concentration-break
  // side-effects on st like Bless cleanup) accumulates into workingSt.
  let workingSt = st;
  let narrative = '';
  for (const origC of st.characters) {
    if (origC.dead) continue;
    const score = (origC[scoreKey] ?? 10) as number;
    // Pull save proficiency from class + feat sources (Wizard INT, Resilient,
    // etc.) and grant Barbarian Danger Sense Advantage on DEX saves.
    const proficient = hasSaveProficiency(origC, scoreKey, context);
    const dangerSenseAdv = scoreKey === 'dex' && hasDangerSense(origC);
    // Worn-gear save bonus (Cloak / Ring of Protection's +1 to all saves) —
    // folded into the effective DC, same mechanism as conditionSavingThrow.
    const dc = opts.saveDC - wornSaveBonus(origC, scoreKey, context.lootTable);
    const saveFailed = rollConditionSave(
      scoreKey,
      score,
      dc,
      proficient,
      origC.level,
      0,
      origC.conditions ?? [],
      dangerSenseAdv,
      false,
      d20TestPenalty(origC)
    );
    const dealt = saveFailed ? fullDmg : Math.floor(fullDmg / 2);
    const dmgResult = applyDamage(origC, workingSt, dealt);
    let damagedChar = dmgResult.char;
    workingSt = {
      ...dmgResult.st,
      characters: dmgResult.st.characters.map((c) => (c.id === damagedChar.id ? damagedChar : c)),
    };
    // Rider condition on a failed save (breath / lair) — applied to the survivor,
    // respecting immunity + the existing fear/charm source tracking.
    let condNote = '';
    if (
      saveFailed &&
      opts.condition &&
      !damagedChar.dead &&
      !damagedChar.conditions.includes(opts.condition) &&
      !conditionImmunitiesFor(damagedChar, workingSt).has(opts.condition)
    ) {
      damagedChar = inflictCondition(damagedChar, opts.condition);
      if (opts.conditionDuration) {
        damagedChar = {
          ...damagedChar,
          condition_durations: {
            ...damagedChar.condition_durations,
            [opts.condition]: opts.conditionDuration,
          },
        };
      }
      workingSt = commitCharacter(workingSt, damagedChar);
      condNote = ` ${damagedChar.name} is ${opts.condition}!`;
    }
    narrative += ` ${origC.name}: ${scoreKey.toUpperCase()} save vs DC ${opts.saveDC} — ${saveFailed ? 'fails' : 'succeeds (half)'} (${dealt} ${opts.damageType}).${dmgResult.concentrationNote}${condNote}`;
  }
  return { st: workingSt, narrative };
}

/**
 * SRD recharge Breath Weapon resolution for one enemy's turn. When the
 * creature's `breathWeapon` is charged (`breath_charged !== false`), it fires an
 * AoE save vs the whole party (via `applyAoeSaveToParty`), is marked spent, and
 * `fired: true` tells the turn loop to skip the normal attack/multiattack (the
 * breath IS the action). When spent (`false`), the engine first rolls the
 * recharge (a d6 ≥ `rechargeMin`); a failure returns `fired: false` so the
 * creature falls through to its melee attack. A no-op for any enemy without a
 * breath weapon (or one already at 0 HP).
 */
export function maybeFireBreathWeapon(args: {
  enemy: Enemy;
  enemyId: string;
  st: GameState;
  context: Context;
  narrative: string;
}): { fired: boolean; st: GameState; narrative: string } {
  const breath = args.enemy.breathWeapon;
  if (!breath) return { fired: false, st: args.st, narrative: args.narrative };
  let st = args.st;
  const ent = st.entities?.find((e) => e.id === args.enemyId && e.isEnemy);
  if (!ent || ent.hp <= 0) return { fired: false, st, narrative: args.narrative };

  let narrative = args.narrative;
  let turnHeaderShown = false;
  // Recharge: undefined ⇒ available (fresh combat); false ⇒ spent, roll a d6.
  if (ent.breath_charged === false) {
    const roll = rollDice('1d6');
    if (roll < (breath.rechargeMin ?? 5)) {
      return { fired: false, st, narrative }; // still spent — fall through to melee
    }
    narrative += `\n\n[${args.enemy.name}'s turn] ${breath.name} recharges!`;
    turnHeaderShown = true;
  }

  const res = applyAoeSaveToParty(st, args.context, {
    dice: breath.dice,
    damageType: breath.damageType,
    savingThrow: breath.savingThrow,
    saveDC: breath.saveDC,
    condition: breath.condition,
    conditionDuration: breath.conditionDuration,
  });
  if (!turnHeaderShown) narrative += `\n\n[${args.enemy.name}'s turn]`;
  narrative += ` 🔥 ${args.enemy.name} unleashes ${breath.name}!` + res.narrative;
  st = res.st;
  // Mark the breath spent on this entity (recharged at a later turn start).
  st = {
    ...st,
    entities: (st.entities ?? []).map((e) =>
      e.id === args.enemyId && e.isEnemy ? { ...e, breath_charged: false } : e
    ),
  };
  return { fired: true, st, narrative };
}

/**
 * SRD Death Burst (Magmin, the elemental Mephits) — when a creature with a
 * `deathBurst` drops to 0 HP it explodes, forcing an AoE save (via
 * `applyAoeSaveToParty`, the same whole-party machinery breath weapons use). A
 * once-per-creature `death_burst_fired` latch on the entity guarantees the blast
 * resolves exactly once no matter which of the ~20 kill sites felled it, and a
 * post-action sweep (called from `takeAction`) is where it lands.
 *
 * The trigger is the entity actually being at 0 HP — NOT mere membership in
 * `enemies_killed`, which a parley / Turn Undead removal also stamps. A creature
 * talked down or banished (hp > 0) does not explode.
 *
 * Simplification: like every other monster AoE in pansori, the emanation geometry
 * is abstracted to "the whole party" — the burst's `radiusFt` is narration only.
 * Ordering: deaths during the player's action and during the ensuing enemy turns
 * are all swept here, so a burst lands after the round's enemy actions rather than
 * at the exact instant of death; acceptable at this fidelity.
 */
export function applyDeathBursts(
  st: GameState,
  seed: Seed,
  context: Context
): { st: GameState; narrative: string } {
  let workingSt = st;
  let narrative = '';
  for (const ent of st.entities ?? []) {
    if (!ent.isEnemy || ent.hp > 0 || ent.death_burst_fired) continue;
    const enemy = getEnemyById(seed, ent.id);
    const burst = enemy?.deathBurst;
    if (!burst) continue;
    // Latch first so a re-entrant sweep (or a TPK mid-burst) can't double-fire.
    workingSt = {
      ...workingSt,
      entities: (workingSt.entities ?? []).map((e) =>
        e.id === ent.id && e.isEnemy ? { ...e, death_burst_fired: true } : e
      ),
    };
    const res = applyAoeSaveToParty(workingSt, context, {
      dice: burst.dice,
      damageType: burst.damageType,
      savingThrow: burst.savingThrow,
      saveDC: burst.saveDC,
      condition: burst.condition,
      conditionDuration: burst.conditionDuration,
    });
    workingSt = res.st;
    narrative +=
      `\n\n💥 ${enemy?.name ?? 'The creature'} explodes in a ${burst.name}!` + res.narrative;
  }
  return { st: workingSt, narrative };
}

/**
 * SRD petrification ladder — STAGE 1. Roll the save vs a Petrifying Gaze/Breath
 * for every living PC; a failure Restrains them and seeds `petrify_save` so the
 * two-stage escalation runs at their turn start (`resolvePetrifyLadder`). The
 * Restrained condition is stamped WITHOUT a duration entry so `tickConditions`
 * leaves it standing — the ladder, not the timer, owns its lifetime.
 *
 * A PC already on the ladder (or already Petrified) is skipped; a PC immune to
 * Restrained can't enter stage 1 at all. Mirrors `applyAoeSaveToParty`'s save
 * machinery (proficiency, worn save bonus, d20 penalties).
 */
export function applyPetrifyLadderToParty(
  st: GameState,
  context: Context,
  opts: { savingThrow: AbilityKey; saveDC: number }
): { st: GameState; narrative: string } {
  const scoreKey = opts.savingThrow;
  let workingSt = st;
  let narrative = '';
  for (const origC of st.characters) {
    if (origC.dead) continue;
    const immun = conditionImmunitiesFor(origC, workingSt);
    // The ladder begins with Restrained; a creature immune to it (or already
    // turned to stone / mid-ladder) shrugs the gaze off.
    if (immun.has('restrained') || origC.conditions.includes('petrified') || origC.petrify_save) {
      narrative += ` ${origC.name}: unaffected.`;
      continue;
    }
    const score = (origC[scoreKey] ?? 10) as number;
    const proficient = hasSaveProficiency(origC, scoreKey, context);
    const dc = opts.saveDC - wornSaveBonus(origC, scoreKey, context.lootTable);
    const saveFailed = rollConditionSave(
      scoreKey,
      score,
      dc,
      proficient,
      origC.level,
      0,
      origC.conditions ?? [],
      false,
      false,
      d20TestPenalty(origC)
    );
    if (!saveFailed) {
      narrative += ` ${origC.name}: ${scoreKey.toUpperCase()} save vs DC ${opts.saveDC} — resists the gaze.`;
      continue;
    }
    let afflicted = inflictCondition(origC, 'restrained');
    // Drop the timed entry so Restrained persists until the re-save resolves it.
    const { restrained: _drop, ...durs } = afflicted.condition_durations ?? {};
    afflicted = {
      ...afflicted,
      condition_durations: durs,
      petrify_save: { dc: opts.saveDC, ability: scoreKey, acted: false },
    };
    workingSt = commitCharacter(workingSt, afflicted);
    narrative += ` ${origC.name}: ${scoreKey.toUpperCase()} save vs DC ${opts.saveDC} — fails; stone creeps across their skin (Restrained).`;
  }
  return { st: workingSt, narrative };
}

/**
 * SRD petrification ladder — STAGE 2, run at the petrifying PC's turn start
 * (alongside `tickConditions` / `applyMonsterAuras`). Resolves the repeat save:
 *
 *   - first afflicted turn (`acted` false) → no save yet, just flip `acted`;
 *   - Restrained lifted by other means (cured, save-reroll strip) → clear marker;
 *   - re-save made → shake free (Restrained + marker cleared);
 *   - re-save failed → turn to stone (Petrified replaces Restrained), UNLESS the
 *     PC is immune to Petrified, in which case they stay Restrained and keep
 *     re-saving each turn.
 *
 * Returns the updated character + a narrative fragment; the caller commits it.
 */
export function resolvePetrifyLadder(
  char: Character,
  st: GameState,
  context: Context
): { char: Character; narrative: string } {
  const ps = char.petrify_save;
  if (!ps) return { char, narrative: '' };
  if (!char.conditions.includes('restrained')) {
    // Restrained ended by some other effect — the petrification fizzles.
    return { char: { ...char, petrify_save: undefined }, narrative: '' };
  }
  if (!ps.acted) {
    return { char: { ...char, petrify_save: { ...ps, acted: true } }, narrative: '' };
  }
  const score = (char[ps.ability] ?? 10) as number;
  const proficient = hasSaveProficiency(char, ps.ability, context);
  const dc = ps.dc - wornSaveBonus(char, ps.ability, context.lootTable);
  const saveFailed = rollConditionSave(
    ps.ability,
    score,
    dc,
    proficient,
    char.level,
    0,
    char.conditions ?? [],
    false,
    false,
    d20TestPenalty(char)
  );
  if (!saveFailed) {
    const cleared: Character = {
      ...char,
      conditions: char.conditions.filter((c) => c !== 'restrained'),
      petrify_save: undefined,
    };
    return {
      char: cleared,
      narrative: ` ${fmt.note(`[Petrification] ${char.name} breaks free before the stone sets (${ps.ability.toUpperCase()} save vs DC ${ps.dc}).`)}`,
    };
  }
  if (conditionImmunitiesFor(char, st).has('petrified')) {
    // Can't be petrified — stays Restrained and re-saves next turn.
    return {
      char,
      narrative: ` ${fmt.note(`[Petrification] ${char.name} fails the save but cannot be turned to stone — still Restrained.`)}`,
    };
  }
  const stoned = inflictCondition(
    {
      ...char,
      conditions: char.conditions.filter((c) => c !== 'restrained'),
      petrify_save: undefined,
    },
    'petrified'
  );
  return {
    char: stoned,
    narrative: ` ${fmt.note(`[Petrification] ${char.name} fails the save and turns to stone — Petrified!`)}`,
  };
}

/**
 * SRD recharge Petrifying Gaze / Breath resolution for one enemy's turn, mirroring
 * `maybeFireBreathWeapon`: when charged (`gaze_charged !== false`) it fires the
 * ladder's stage 1 across the party (via `applyPetrifyLadderToParty`), goes on
 * cooldown, and `fired: true` tells the turn loop the gaze WAS the turn (skip the
 * normal attack). When spent it rolls a d6 ≥ `rechargeMin` first. A no-op for any
 * enemy without a gaze (or one already at 0 HP).
 */
export function maybeFirePetrifyingGaze(args: {
  enemy: Enemy;
  enemyId: string;
  st: GameState;
  context: Context;
  narrative: string;
}): { fired: boolean; st: GameState; narrative: string } {
  const gaze = args.enemy.petrifyingGaze;
  if (!gaze) return { fired: false, st: args.st, narrative: args.narrative };
  let st = args.st;
  const ent = st.entities?.find((e) => e.id === args.enemyId && e.isEnemy);
  if (!ent || ent.hp <= 0) return { fired: false, st, narrative: args.narrative };

  let narrative = args.narrative;
  let turnHeaderShown = false;
  if (ent.gaze_charged === false) {
    const roll = rollDice('1d6');
    if (roll < (gaze.rechargeMin ?? 5)) {
      return { fired: false, st, narrative }; // still spent — fall through to melee
    }
    narrative += `\n\n[${args.enemy.name}'s turn] ${gaze.name} recharges!`;
    turnHeaderShown = true;
  }

  const res = applyPetrifyLadderToParty(st, args.context, {
    savingThrow: gaze.savingThrow,
    saveDC: gaze.saveDC,
  });
  if (!turnHeaderShown) narrative += `\n\n[${args.enemy.name}'s turn]`;
  narrative += ` 🗿 ${args.enemy.name} fixes the party with its ${gaze.name}!` + res.narrative;
  st = res.st;
  st = {
    ...st,
    entities: (st.entities ?? []).map((e) =>
      e.id === args.enemyId && e.isEnemy ? { ...e, gaze_charged: false } : e
    ),
  };
  return { fired: true, st, narrative };
}

// SRD — lair actions. Fire one randomly-picked action per round on
// the round-wrap path. Only fires if a living enemy with `lair_actions`
// is in the current room. Returns updated state, narrative addendum,
// and a `fired` flag so callers can skip the narrative-prefix work when
// nothing happened.
function fireLairAction(
  st: GameState,
  seed: Seed,
  context: Context
): { st: GameState; narrative: string; fired: boolean } {
  if (!st.combat_active) return { st, narrative: '', fired: false };
  const roomId = st.current_room;
  const livingEnemies = getLivingRoomEnemies(st, seed, roomId);
  const lairBoss = livingEnemies.find((e) => (e.lair_actions?.length ?? 0) > 0);
  if (!lairBoss?.lair_actions?.length) return { st, narrative: '', fired: false };
  const action = pick(lairBoss.lair_actions);
  if (action.kind === 'aoe_save_damage') {
    const res = applyAoeSaveToParty(st, context, {
      dice: action.dice,
      damageType: action.damageType,
      savingThrow: action.savingThrow as AbilityKey,
      saveDC: action.saveDC,
      condition: action.condition,
      conditionDuration: action.conditionDuration,
    });
    return {
      st: res.st,
      narrative: ` 🌀 Lair action: ${action.name} — ${action.narrative}` + res.narrative,
      fired: true,
    };
  }
  return { st, narrative: '', fired: false };
}

// RE-4 — persistent damage zone footprint. Cells within
// floor((radiusFt - 1) / SQUARE_SIZE) Chebyshev squares of the center, clipped
// to the grid: a 5-ft cube/radius → the single center cell, 10-ft → 3×3, etc.
export function zoneCells(
  center: GridPos,
  radiusFt: number,
  gridW: number,
  gridH: number
): GridPos[] {
  const r = Math.max(0, Math.floor((radiusFt - 1) / SQUARE_SIZE));
  const cells: GridPos[] = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x >= 0 && x < gridW && y >= 0 && y < gridH) cells.push({ x, y });
    }
  }
  return cells;
}

// Resolve the combat grid's cell count for a given room: the room's own
// `gridWidth`/`gridHeight` win, falling back to the campaign-wide `Context`
// default, then the shared default — all run through `clampCombatDim` so the
// backend bounds and the FE renderer agree on a safe range. Only the cell
// COUNT is per-room; the 5-ft scale is unchanged.
export function combatGridDims(
  roomId: string | undefined,
  seed: Seed,
  context: Context
): { w: number; h: number } {
  const room = seed.rooms?.find((r) => r.id === roomId);
  return {
    w: clampCombatDim(room?.gridWidth ?? context.gridWidth),
    h: clampCombatDim(room?.gridHeight ?? context.gridHeight),
  };
}

// RE-4 — apply one tick of a persistent damage zone to every hostile standing
// in its cells: roll `damage` (save-for-half if `savingThrow`), apply
// resistance, and resolve kills (XP split + room-clear). Shared by the on-cast
// tick and the round-wrap tick. Returns the updated state + a narrative add-on.
export function applyZoneTick(
  st: GameState,
  zone: SpellZone,
  seed: Seed,
  context: Context
): { st: GameState; narrative: string; dealt: number } {
  if (!st.entities) return { st, narrative: '', dealt: 0 };
  // SRD Darkness — a sight-blocking zone deals no damage; it only affects
  // visibility (read via `magicalDarknessCells` / `canSeeTarget`). Nothing to tick.
  if (zone.blocksSight) return { st, narrative: '', dealt: 0 };
  // Caster-following auras (Spirit Guardians) recompute their footprint from
  // the caster's CURRENT cell each tick, so the aura moves with the caster.
  let cells = zone.cells;
  if (zone.followsCaster) {
    const casterEnt = st.entities.find((e) => e.id === zone.casterId);
    if (casterEnt) {
      const zoneDims = combatGridDims(st.current_room, seed, context);
      cells = zoneCells(casterEnt.pos, zone.radiusFt ?? 15, zoneDims.w, zoneDims.h);
    }
  }
  const cellSet = new Set(cells.map((c) => `${c.x},${c.y}`));
  const enemies = getLivingRoomEnemies(st, seed, zone.roomId);
  let workingSt = st;
  let narrative = '';
  let dealt = 0;
  for (const enemy of enemies) {
    const ent = workingSt.entities?.find((e) => e.id === enemy.id && e.isEnemy);
    if (!ent || ent.hp <= 0 || !cellSet.has(`${ent.pos.x},${ent.pos.y}`)) continue;
    let dmg = rollDice(zone.damage);
    let saveTag = '';
    if (zone.savingThrow) {
      const score = (enemy as unknown as Record<string, number>)[zone.savingThrow] ?? 10;
      const failed = rollConditionSave(
        zone.savingThrow,
        score,
        zone.saveDC ?? 10,
        false,
        1,
        0,
        ent.conditions ?? []
      );
      dmg = failed ? dmg : zone.saveEffect === 'half' ? Math.floor(dmg / 2) : 0;
      saveTag = ` (${zone.savingThrow.toUpperCase()} ${failed ? 'fail' : 'save'})`;
    }
    const resisted = applyDamageMultiplier(dmg, zone.damageType, enemy).damage;
    const newHp = Math.max(0, ent.hp - resisted);
    dealt += ent.hp - newHp; // actual HP removed (counts toward a damage cap)
    workingSt = {
      ...workingSt,
      entities: (workingSt.entities ?? []).map((e) =>
        e.id === ent.id && e.isEnemy ? { ...e, hp: newHp } : e
      ),
    };
    narrative += ` ${enemy.name} takes ${resisted} ${zone.damageType}${saveTag}.`;
    if (newHp <= 0 && !workingSt.enemies_killed.includes(enemy.id)) {
      workingSt = { ...workingSt, enemies_killed: [...workingSt.enemies_killed, enemy.id] };
      const split = splitEncounterXp(workingSt, zone.casterId, enemy.xp ?? 10);
      workingSt = split.st;
      const killer = workingSt.characters.find((c) => c.id === zone.casterId);
      if (killer) {
        killer.xp = (killer.xp || 0) + split.share;
        narrative += applyPartyLevelUps(workingSt, killer, context);
      }
      narrative += ` ${enemy.name} is destroyed!`;
      if (isRoomCleared(workingSt, seed, zone.roomId)) workingSt = endCombatState(workingSt);
    }
  }
  return { st: workingSt, narrative, dealt };
}

// SRD anti-magic suppression (Antimagic Field, Globe of Invulnerability) — would
// a `suppressesMagic` zone in the current room stop this cast? `targetPos` is the
// spell's target/epicenter cell; omit it for a self/utility cast (the caster's
// own cell is used, so a caster standing inside an Antimagic Field can't cast at
// all). `spellLevel` should be the slot level (upcasts count toward Globe's cap).
//   - Globe (`suppressFromOutsideOnly`): blocks a spell ≤ maxLevel cast from
//     OUTSIDE the globe at a target INSIDE it.
//   - Antimagic Field: blocks any spell ≤ maxLevel with the caster OR the target
//     inside the field.
export function isSpellSuppressed(
  st: GameState,
  casterId: string,
  targetPos: GridPos | undefined,
  spellLevel: number,
  context?: Context
): { blocked: boolean; zoneName?: string } {
  // Act-scoped anti-magic — the active act is a region-wide dead-magic field
  // (an anti-magic occupation). Global, no geometry: every cast fizzles, in
  // combat or out. `maxLevel` caps which slot levels are stopped (omitted = all,
  // cantrips included). Checked first — it overrides any zone bookkeeping.
  const act = context?.campaign?.acts?.find((a) => a.id === st.current_act);
  if (act?.suppressesMagic) {
    const cap = act.suppressesMagic.maxLevel;
    if (cap === undefined || spellLevel <= cap) return { blocked: true, zoneName: act.name };
  }
  const zones = (st.spell_zones ?? []).filter(
    (z) => z.suppressesMagic && z.roomId === st.current_room
  );
  if (zones.length === 0 || !st.entities) return { blocked: false };
  const casterPos = st.entities.find((e) => e.id === casterId)?.pos;
  if (!casterPos) return { blocked: false };
  const tgt = targetPos ?? casterPos; // self / utility cast → the caster's cell
  for (const z of zones) {
    if (z.suppressMaxLevel !== undefined && spellLevel > z.suppressMaxLevel) continue;
    const owner = st.entities.find((e) => e.id === z.casterId);
    const center = z.followsCaster ? owner?.pos : z.center;
    if (!center) continue;
    const r = z.radiusFt ?? 10;
    const casterInside = distanceFeet(center, casterPos) <= r;
    const targetInside = distanceFeet(center, tgt) <= r;
    const blocked = z.suppressFromOutsideOnly
      ? !casterInside && targetInside
      : casterInside || targetInside;
    if (blocked) return { blocked: true, zoneName: z.name };
  }
  return { blocked: false };
}

// SRD Time Stop — a coarse signature of the enemies' state (total HP + condition
// count + kill count). The turn-advance hook compares it across a Time-Stopped
// turn: any change means the caster's action affected an enemy, which ends the
// time stop. (Buffing an ally isn't detected — a documented simplification; the
// rule that matters, "no free attacks under Time Stop", is enforced.)
function enemySignature(st: GameState): string {
  const es = (st.entities ?? []).filter((e) => e.isEnemy);
  const hp = es.reduce((a, e) => a + Math.max(0, e.hp), 0);
  const conds = es.reduce((a, e) => a + (e.conditions?.length ?? 0), 0);
  return `${hp}:${conds}:${st.enemies_killed?.length ?? 0}`;
}

// RE-4 — round-wrap tick for every persistent zone in the current room.
export function fireSpellZones(
  st: GameState,
  seed: Seed,
  context: Context
): { st: GameState; narrative: string } {
  if (!st.combat_active || !st.spell_zones?.length) return { st, narrative: '' };
  let workingSt = st;
  let narrative = '';
  let expiredNote = '';
  // Survivors of this round wrap. Concentration zones (no `rounds_left`/
  // `damageCap`) pass through untouched — `breakConcentration` is their timer.
  // Non-concentration zones (Guardian of Faith) decrement their round budget
  // and accumulate damage toward their cap, and are dropped when either runs out.
  const survivors: SpellZone[] = [];
  for (const zone of st.spell_zones) {
    if (zone.roomId !== workingSt.current_room) {
      survivors.push(zone); // zones in other rooms aren't active here
      continue;
    }
    const res = applyZoneTick(workingSt, zone, seed, context);
    workingSt = res.st;
    if (res.narrative) narrative += ` 🌀 ${zone.name}:${res.narrative}`;
    // A zone kill can clear the room (endCombatState wipes spell_zones); stop.
    if (!workingSt.combat_active) return { st: workingSt, narrative };
    const newDamageDealt = (zone.damageDealt ?? 0) + res.dealt;
    const newRounds = zone.rounds_left !== undefined ? zone.rounds_left - 1 : undefined;
    const expiredByTime = newRounds !== undefined && newRounds <= 0;
    const expiredByCap = zone.damageCap !== undefined && newDamageDealt >= zone.damageCap;
    if (expiredByTime || expiredByCap) {
      expiredNote += ` ${zone.name} fades.`;
      continue; // drop the zone
    }
    survivors.push({ ...zone, rounds_left: newRounds, damageDealt: newDamageDealt });
  }
  workingSt = { ...workingSt, spell_zones: survivors };
  return { st: workingSt, narrative: narrative + expiredNote };
}

// SRD — legendary actions. Fire AT MOST ONE after another creature's
// turn ends. Spends `legendary_action_points` (refreshed on the legendary
// creature's own turn). Picks the lowest-cost available action and resolves
// its effect immediately against the nearest living PC.
function fireLegendaryAction(
  st: GameState,
  seed: Seed,
  context: Context
): { st: GameState; narrative: string; fired: boolean } {
  if (!st.combat_active) return { st, narrative: '', fired: false };
  const roomId = st.current_room;
  const livingEnemies = getLivingRoomEnemies(st, seed, roomId);
  const legendary = livingEnemies.find(
    (e) => (e.legendary_actions?.length ?? 0) > 0 && (e.legendary_action_points ?? 0) > 0
  );
  if (!legendary?.legendary_actions?.length) return { st, narrative: '', fired: false };
  const sorted = [...legendary.legendary_actions].sort((a, b) => a.cost - b.cost);
  const action = sorted.find((a) => a.cost <= (legendary.legendary_action_points ?? 0));
  if (!action) return { st, narrative: '', fired: false };

  // Spend the points by mutating the seed enemy entry. Mirrors the
  // phase-transition mutation pattern at processBossPhaseTransitions.
  for (const [rk, list] of Object.entries(seed.enemies ?? {})) {
    const idx = list.findIndex((e) => e.id === legendary.id);
    if (idx >= 0) {
      const updated: Enemy = {
        ...list[idx],
        legendary_action_points: (list[idx].legendary_action_points ?? 0) - action.cost,
      };
      seed.enemies[rk] = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
      break;
    }
  }

  let narrative = ` ⚜️ Legendary action — ${legendary.name} uses ${action.name}.`;
  if (action.narrative) narrative += ` ${action.narrative}`;
  if (action.kind === 'extra_attack') {
    const nearestPcEnt = st.entities
      ?.filter((e) => !e.isEnemy && !e.isCompanion && e.hp > 0)
      .sort((a, b) => {
        const lairEnt = st.entities?.find((x) => x.id === legendary.id && x.isEnemy);
        if (!lairEnt) return 0;
        return distanceFeet(lairEnt.pos, a.pos) - distanceFeet(lairEnt.pos, b.pos);
      })[0];
    if (!nearestPcEnt) return { st, narrative, fired: true };
    const targetCharIdx = st.characters.findIndex((c) => c.id === nearestPcEnt.id && !c.dead);
    if (targetCharIdx < 0) return { st, narrative, fired: true };
    const target = st.characters[targetCharIdx];
    const legendaryLighting = seed?.rooms?.find((r) => r.id === roomId)?.lighting ?? 'bright';
    const legendaryObstacles = seed?.rooms?.find((r) => r.id === roomId)?.obstacles ?? [];
    const computed = computeEnemyAttack(
      legendary,
      target,
      st,
      context,
      false,
      legendaryLighting,
      legendaryObstacles
    );
    narrative += ` ${computed.fragment.prose}`;
    // Legendary actions skip the Shield-pause path — they're meant to be
    // a fast follow-up beat. Commit immediately: write proposed state
    // and push the corresponding CombatEvent.
    st = {
      ...computed.proposedSt,
      characters: computed.proposedSt.characters.map((c, i) =>
        i === targetCharIdx ? computed.proposedChar : c
      ),
      entities: (computed.proposedSt.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy ? { ...e, hp: computed.proposedChar.hp } : e
      ),
    };
    st = pushEvent(st, enemyAttackFragmentEvent(computed.fragment, st.round ?? 1));
    return { st, narrative, fired: true };
  }
  return { st, narrative, fired: true };
}

// Refresh a legendary creature's action-point pool. Called when their own
// initiative slot comes up (handled in the enemy turn loop).
function refreshLegendaryPool(seed: Seed, enemyId: string): void {
  for (const [rk, list] of Object.entries(seed.enemies ?? {})) {
    const idx = list.findIndex((e) => e.id === enemyId);
    if (idx >= 0) {
      const enemy = list[idx];
      if (!enemy.legendary_actions?.length) return;
      const pool = enemy.legendary_pool ?? 3;
      seed.enemies[rk] = [
        ...list.slice(0, idx),
        { ...enemy, legendary_action_points: pool },
        ...list.slice(idx + 1),
      ];
      return;
    }
  }
}

export function getEnemyById(seed: Seed, enemyId: string): Enemy | null {
  for (const list of Object.values(seed.enemies ?? {})) {
    const found = list.find((e) => e.id === enemyId);
    if (found) return found;
  }
  // NPC-as-enemy lookup: id is `npc:${npcId}`.
  if (enemyId.startsWith('npc:')) {
    const npc = npcById(seed, enemyId.slice('npc:'.length));
    if (npc) return npcAsEnemy(npc);
  }
  return null;
}

function hasLivingEnemy(state: GameState, seed: Seed, roomId: string): boolean {
  return getLivingRoomEnemies(state, seed, roomId).length > 0;
}

export function isRoomCleared(state: GameState, seed: Seed, roomId: string): boolean {
  const all = getRoomEnemies(seed, roomId);
  if (all.length === 0) return true;
  const killed = state.enemies_killed ?? [];
  return all.every((e) => killed.includes(e.id));
}

// ─── Initiative helpers ───────────────────────────────────────────────────────

export type InitEntry = { id: string; roll: number; is_enemy: boolean };

export function buildInitiativeOrder(
  chars: Character[],
  enemies: Enemy[],
  // SRD 5.2.1 — a Surprised combatant has Disadvantage on its Initiative roll
  // (the 2024 rule; surprise no longer skips a turn). Pass the ids of the
  // combatants caught unaware.
  surprisedIds: ReadonlySet<string> = new Set()
): InitEntry[] {
  // A single d20 with optional Advantage/Disadvantage (which cancel). SRD Alert
  // feat grants immunity to Surprise, so an Alert combatant never rolls at
  // Disadvantage from it.
  const rollInit = (adv: boolean, disadv: boolean): number => {
    if (adv && !disadv) return Math.max(rollDice('1d20'), rollDice('1d20'));
    if (disadv && !adv) return Math.min(rollDice('1d20'), rollDice('1d20'));
    return rollDice('1d20');
  };
  // Track DEX per entry for the tiebreaker. The InitEntry payload
  // doesn't expose DEX (clients don't need it), so we keep it in a
  // local map and use it only inside the sort comparator.
  const dexById = new Map<string, number>();
  for (const c of chars) dexById.set(c.id, c.dex);
  for (const e of enemies) dexById.set(e.id, e.dex ?? 10);
  const entries: InitEntry[] = [
    ...chars
      .filter((c) => !c.dead)
      .map((c) => {
        // SRD Alert feat — adds proficiency bonus to Initiative AND grants
        // immunity to the Surprised condition (so no Disadvantage from it).
        const isAlert = (c.feats ?? []).includes('alert');
        const alertBonus = isAlert ? profBonus(c.level) : 0;
        // SRD Barbarian Feral Instinct (L7) — Advantage on Initiative rolls.
        const feralAdv = getClassLevel(c, 'barbarian') >= 7;
        const surprised = !isAlert && surprisedIds.has(c.id);
        const d20 = rollInit(feralAdv, surprised);
        return {
          id: c.id,
          roll: d20 + abilityMod(c.dex) + alertBonus,
          is_enemy: false,
        };
      }),
    ...enemies.map((enemy) => ({
      id: enemy.id,
      roll: rollInit(false, surprisedIds.has(enemy.id)) + abilityMod(enemy.dex ?? 10),
      is_enemy: true,
    })),
  ];
  // Sort descending by roll. Tiebreakers (in order):
  //   1. Higher DEX score acts first.
  //   2. PCs before enemies (RAW SRD delegates to the DM; the
  //      friendly-side-wins convention matches every published
  //      adventure module's automated behavior).
  // Stable-sort isn't depended on — both tiebreakers are explicit
  // so the order is deterministic regardless of insertion order.
  entries.sort((a, b) => {
    if (b.roll !== a.roll) return b.roll - a.roll;
    const aDex = dexById.get(a.id) ?? 10;
    const bDex = dexById.get(b.id) ?? 10;
    if (bDex !== aDex) return bDex - aDex;
    // Tied roll + tied DEX → PC (is_enemy=false) goes first.
    if (a.is_enemy !== b.is_enemy) return a.is_enemy ? 1 : -1;
    return 0;
  });
  return entries;
}

// Plot armor maintenance for campaign-required members, run per action:
//   1. Backfill `Character.required` (matched name+class against
//      campaign.requiredMembers) for sessions created before the flag existed.
//   2. Enforce the invariant that a required member is NEVER dead OUT of combat —
//      revive any dead/downed one to 1 HP. (In combat they can fall; the
//      combat-end revival lives in endCombatState.) This self-heals saves that
//      predate the mechanic, and is a safety net for any path that ended combat
//      without reviving.
// The "back on their feet at 1 HP" flourish for one or more revived members.
function plotArmorNotice(names: string[]): string {
  if (names.length === 0) return '';
  const verb = names.length === 1 ? 'claws' : 'claw';
  return `${names.join(' and ')} ${verb} back from the edge of death — bloodied, but breathing.`;
}

export function backfillRequiredPlotArmor(st: GameState, context: Context): GameState {
  const required = context.campaign?.requiredMembers ?? [];
  if (required.length === 0) return st;
  const isReq = (c: Character) =>
    required.some((rm) => rm.name === c.name && rm.cls === c.character_class);
  let changed = false;
  const revivedNames: string[] = [];
  const characters = st.characters.map((c) => {
    const reqd = c.required || isReq(c);
    if (!reqd) return c;
    if (!st.combat_active && (c.dead || c.hp <= 0)) {
      changed = true;
      revivedNames.push(c.name);
      return {
        ...c,
        required: true,
        hp: 1,
        dead: false,
        stable: false,
        death_saves: { successes: 0, failures: 0 },
        died_at_round: undefined,
        conditions: c.conditions.filter((cond) => cond !== 'unconscious'),
      };
    }
    if (!c.required) {
      changed = true;
      return { ...c, required: true };
    }
    return c;
  });
  if (!changed) return st;
  return {
    ...st,
    characters,
    ...(revivedNames.length ? { revival_notice: plotArmorNotice(revivedNames) } : {}),
  };
}

export function endCombatState(st: GameState): GameState {
  // A wilderness encounter collapses straight back onto the map — march the
  // party to the cell they were travelling on and drop the transient encounter
  // room. No-op for authored-room combat (encounter_return unset).
  const collapsed = returnFromEncounter(st);
  // Plot armor — a campaign-required member that fell during the fight is
  // revived to 1 HP the moment combat ends (and clears its down/dead state), so
  // a mandatory pre-gen can't be permanently lost and a party with one standing
  // is never wiped. Player-built members are untouched (they need a real revive
  // or a long rest). See Character.required.
  const revivedChars = collapsed.characters.map((c) =>
    c.required && (c.dead || c.hp <= 0)
      ? {
          ...c,
          hp: 1,
          dead: false,
          stable: false,
          death_saves: { successes: 0, failures: 0 },
          died_at_round: undefined,
          conditions: c.conditions.filter((cond) => cond !== 'unconscious'),
        }
      : c
  );
  const anyRevived = revivedChars.some((c, i) => c !== collapsed.characters[i]);
  const revivedNames = collapsed.characters
    .filter((c) => c.required && (c.dead || c.hp <= 0))
    .map((c) => c.name);
  // Gate the return to exploration behind a "Continue" choice instead of
  // auto-switching the view the instant combat resolves — but only when the
  // party survived (an all-dead party goes to the game-over screen, not a
  // Continue prompt). Computed AFTER plot-armor revival.
  const partySurvived = revivedChars.some((c) => !c.dead);
  // Keep the combat battlefield on screen through the post-combat "Continue"
  // gate for EVERY survived fight — the player should see the field they just
  // fought (with the fallen enemy), not snap to the exploration map. For a
  // wilderness encounter `returnFromEncounter` already restored the
  // overworld/town level, so this is the only way to keep the battlefield; for
  // an authored room it overrides the local exploration map during the gate.
  // `continue` clears these entities when it dismisses the gate.
  const keepBattlefield = partySurvived;
  return {
    ...collapsed,
    combat_active: false,
    combat_over_pending: partySurvived,
    initiative_order: [],
    initiative_idx: 0,
    // Keep the battlefield through the Continue gate; sync any revived
    // required member's grid token off the skull (hp 0) back to 1 HP.
    entities: keepBattlefield
      ? anyRevived
        ? (st.entities ?? []).map((e) => {
            const rc = !e.isEnemy ? revivedChars.find((c) => c.id === e.id) : undefined;
            return rc ? { ...e, hp: rc.hp } : e;
          })
        : st.entities
      : undefined,
    movement_used: undefined,
    // Persistent damage zones are combat constructs; clear any that outlived the
    // fight so a non-concentration zone (Guardian of Faith) can't leak into the
    // next encounter. Concentration zones are already dropped by breakConcentration.
    spell_zones: [],
    // Plot-armor flourish — folded into the action narrative by takeAction.
    ...(revivedNames.length
      ? { revival_notice: plotArmorNotice(revivedNames) }
      : { revival_notice: collapsed.revival_notice }),
    characters: revivedChars.map((c) => {
      const conditions = c.conditions.filter((cond) => {
        // Round durations only tick on combat turns, so outside combat they
        // FREEZE — ghoul paralysis once rode through two rooms of exploration
        // into the next fight, and a mid-fight Hide left a cleric Invisible
        // forever. Minute-scale entries (≤ 10 rounds — inflicted conditions,
        // Hide's Invisible, Hold Person) are encounter effects: clear them.
        // Hour-scale spell buffs (Invisibility's 600) and 'permanent'
        // conditions (unconscious, petrified — no entry) persist; a broken
        // concentration already tears its own condition down.
        const dur = (c.condition_durations ?? {})[cond];
        if (typeof dur === 'number' && dur <= 10) return false;
        // Rage / Monk Superior Defense / Sorcerer Innate Sorcery / Paladin
        // Holy Nimbus end when combat ends ("lasts the encounter").
        if (
          cond === 'raging' ||
          cond === 'superior_defense' ||
          cond === 'innate_sorcery' ||
          cond === 'holy_nimbus' ||
          // Holy Aura's party ward (1 min ≈ encounter) doesn't carry over.
          cond === 'holy_warded'
        ) {
          return false;
        }
        // Spell-driven shapeshift (Shapechange / Animal Shapes) ends with the
        // encounter; a druid's own Wild Shape (no `shapeshift_spell`) persists.
        if (cond === 'wild_shaped' && c.shapeshift_spell) return false;
        return true;
      });
      const kept = new Set(conditions);
      return {
        ...c,
        turn_actions: { ...FRESH_TURN },
        conditions,
        // Duration entries only make sense for conditions still present.
        condition_durations: Object.fromEntries(
          Object.entries(c.condition_durations ?? {}).filter(([k]) => kept.has(k))
        ),
        // Totem Warrior totem clears with rage at combat end.
        totem_spirit: undefined,
        // Per-attack weapon riders (Divine Favor, the smites) last ~1 minute ≈ an
        // encounter; clear them when combat ends (the non-concentration ones —
        // Divine Favor / Searing Smite — have no other teardown).
        weapon_rider: undefined,
        pending_smite: undefined,
        // Fire Shield (retaliate) + resistance buffs (Fire Shield / Stoneskin /
        // Protection from Energy) are ~1-minute / encounter effects; clear them at
        // combat end so a non-concentration buff (Fire Shield) can't leak, and a
        // concentration buff that outlived an unbroken-concentration combat-end
        // doesn't linger.
        fire_shield: undefined,
        spell_resistances: undefined,
        condition_immunities: undefined,
        // Mirror Image duplicates (1 min ≈ encounter) don't carry to the next fight.
        mirror_images: undefined,
        // Blink (1 min ≈ encounter) doesn't carry to the next fight.
        blinking: undefined,
        // Sanctuary ward (1 min ≈ encounter) clears at combat end.
        sanctuary_dc: undefined,
        // Shillelagh (1 min ≈ encounter) — the imbued weapon reverts at combat end.
        shillelagh: undefined,
        // Dragon's Breath (1 min ≈ encounter) — the granted breath doesn't carry
        // to the next fight.
        granted_breath: undefined,
        // Spell-driven shapeshift (Shapechange / Animal Shapes) ends with the
        // encounter — clear the form (the `wild_shaped` condition itself is dropped
        // by the conditions filter above). A druid's own Wild Shape is left alone.
        ...(c.shapeshift_spell
          ? { wild_shape_form: undefined, shapeshift_spell: undefined, temp_hp: undefined }
          : {}),
      };
    }),
  };
}

// Encounter XP distribution — SRD / SRD 5.2.1 (Gaining XP,):
// the XP from a defeated creature is divided equally among all party
// members who participated. Pansori's participation model is "alive when
// the kill resolved" — a downed/unconscious PC (hp = 0, dead = false)
// still gets their share; only truly-dead PCs (`dead === true`) are
// excluded. Truncation via floor matches RAW (no fractional XP).
//
// Returns the share each PC received and an updated state with the share
// applied to every eligible character EXCEPT the killer. Callers keep
// their local mutable `char` reference and add the returned `share` to
// `char.xp` themselves — that preserves the downstream-read patterns the
// kill blocks use (level-up check, narrative composition, etc.) without
// requiring a refresh-from-state round trip.
export function splitEncounterXp(
  st: GameState,
  killerId: string,
  totalXp: number
): { st: GameState; share: number } {
  if (totalXp <= 0) return { st, share: 0 };
  const eligibleCount = st.characters.filter((c) => !c.dead).length;
  if (eligibleCount === 0) return { st, share: 0 };
  const share = Math.floor(totalXp / eligibleCount);
  if (share <= 0) return { st, share: 0 };
  return {
    st: {
      ...st,
      characters: st.characters.map((c) =>
        !c.dead && c.id !== killerId ? { ...c, xp: (c.xp || 0) + share } : c
      ),
    },
    share,
  };
}

/**
 * Apply one level in `className` to `char`. Mutates in place. Returns
 * the level-up narrative. Performs:
 *
 *   - `char.level++`
 *   - `class_levels[className]++` (initialized to 0 if absent)
 *   - HP gain: `1d<hit_die> + CON mod`; Dwarven Toughness adds +1.
 *   - Spell-slot recompute via the multiclass-aware `spellSlotsForChar`.
 *   - ASI pending when the **per-class** level lands on 4, 8, 12, 16,
 *     or 19 (RAW: ASIs are per-class milestones). For pure single-class
 *     PCs this still fires at total levels 4/8/12/16/19 since the two
 *     are equal.
 *   - Multiclass prof grants when this is the **first** level in a
 *     non-primary class (`applyMulticlassProfGrants`).
 */
// SRD Draconic Sorcery — Draconic Spells: always-prepared spells gained at
// sorcerer levels 3/5/7/9. pansori casts from `spells_known`, so they're merged
// in (idempotent) on subclass-select + level-up. Only the spells pansori has
// today are listed; higher tiers (Command, Dragon's Breath, Alter Self, Arcane
// Eye, Charm Monster, Legend Lore, Summon Dragon) await spell content.
const DRACONIC_SPELL_TABLE: Array<{ level: number; spells: string[] }> = [
  { level: 3, spells: ['chromatic_orb'] },
  { level: 5, spells: ['fear', 'fly'] },
];

/** Returns `char.spells_known` with the Draconic always-prepared spells the
 *  sorcerer's level grants merged in (a Draconic Sorcerer; idempotent). */
export function mergeDraconicSpells(char: Character): string[] {
  const lvl = getClassLevel(char, 'sorcerer');
  const known = new Set(char.spells_known ?? []);
  for (const tier of DRACONIC_SPELL_TABLE) {
    if (lvl >= tier.level) tier.spells.forEach((s) => known.add(s));
  }
  return [...known];
}

/**
 * Assign a subclass to a character (mutates in place) and return the narrative
 * note. SRD 5.2.1 gives each class exactly one subclass, so this is normally
 * auto-applied at level 3 by `applyLevelUpForClass` — no player choice. Shared
 * with the `select_subclass` handler (used by tests / FE). Applies the Draconic
 * Sorcerer side effects (retroactive Draconic Resilience HP + always-prepared
 * Draconic spells) since those are subclass-on-pick effects.
 */
export function applySubclass(char: Character, subclassId: string): string {
  char.subclass = subclassId;
  let note = ` ${char.name} follows the path of the ${subclassId.replace(/_/g, ' ')}!`;
  if (subclassId === 'draconic' && hasClass(char, 'sorcerer')) {
    const sorcLvl = getClassLevel(char, 'sorcerer');
    char.max_hp += sorcLvl;
    char.hp += sorcLvl;
    note += ` Draconic Resilience: +${sorcLvl} max HP (now ${char.hp}/${char.max_hp}).`;
    const before = (char.spells_known ?? []).length;
    char.spells_known = mergeDraconicSpells(char);
    if ((char.spells_known?.length ?? 0) > before) note += ` 🐉 Draconic Spells added.`;
  }
  return note;
}

export function applyLevelUpForClass(char: Character, className: string, context: Context): string {
  const cls = className.toLowerCase();
  // Backfill class_levels for legacy single-class fixtures that skip
  // normalizeState. After this, every char going through level-up has
  // a populated breakdown.
  const currentBreakdown = char.class_levels ?? {
    [char.character_class.toLowerCase()]: char.level ?? 1,
  };
  // Track FIRST level in this class for multiclass prof grants (RAW:
  // multiclass entry grants only a narrow proficiency subset).
  const isFirstLevelInClass = (currentBreakdown[cls] ?? 0) === 0;
  const wasDowned =
    char.hp <= 0 ||
    (char.conditions ?? []).includes('unconscious') ||
    (char.death_saves?.failures ?? 0) > 0;

  // Bump total level + per-class level in lockstep.
  char.level += 1;
  char.class_levels = {
    ...currentBreakdown,
    [cls]: (currentBreakdown[cls] ?? 0) + 1,
  };
  const newClassLevel = char.class_levels[cls];

  const dwarfLvlBonus = char.species === 'dwarf' ? 1 : 0;
  // SRD Draconic Sorcerer Draconic Resilience — +1 HP per
  // Sorcerer level (retroactive on subclass-select; +1 per level
  // taken thereafter). Stacks on top of the d6 roll.
  const draconicBonus = cls === 'sorcerer' && char.subclass === 'draconic' ? 1 : 0;
  const hpRoll =
    Math.max(1, rollDice(`1d${char.hit_die ?? 8}`) + abilityMod(char.con)) +
    dwarfLvlBonus +
    draconicBonus;
  char.max_hp += hpRoll;
  char.hp = Math.min(char.hp + hpRoll, char.max_hp);

  // Recompute slots from class_levels (multiclass-aware).
  char.spell_slots_max = spellSlotsForChar(char);

  let out: string;
  if (wasDowned) {
    out = ` ${char.name} reaches level ${char.level} in ${className} (+${hpRoll} HP, while unconscious).`;
  } else {
    const levelUpLine = pick(context.narratives.levelUp)
      .replace(/{level}/g, String(char.level))
      .replace(/{name}/g, char.name);
    // Only attach the class name when multiclassing has actually
    // happened (would be redundant noise for single-class PCs).
    const classNote =
      Object.keys(char.class_levels).length > 1 ? ` (${className} ${newClassLevel})` : '';
    out = ` ${char.name}: ${levelUpLine} (+${hpRoll} HP)${classNote}`;
  }

  // ASI / feat at per-class milestones (4, 8, 12, 16, 19). RAW: each
  // class gates its own ASI; multiclass PCs get one per qualifying
  // class-level boundary, not per total-level boundary.
  if ([4, 8, 12, 16, 19].includes(newClassLevel)) {
    char.asi_pending = true;
    out += ` ${className} level ${newClassLevel}: choose an Ability Score Improvement!`;
  }

  // 2024 Weapon Mastery slot growth — Fighter (L4/10/16) and Barbarian (L4/10)
  // master more weapons as they level. Surface the new pick(s) as a pending
  // choice resolved via `choose_weapon_mastery`.
  const newMasterySlots = weaponMasterySlotsForLevel(className, newClassLevel);
  const currentMasteryCount = (char.weapon_masteries ?? []).length;
  if (newMasterySlots > currentMasteryCount) {
    const gained = newMasterySlots - currentMasteryCount;
    char.weapon_mastery_pending = (char.weapon_mastery_pending ?? 0) + gained;
    out += ` ${className} level ${newClassLevel}: Weapon Mastery — choose ${gained} more weapon${gained === 1 ? '' : 's'} to master!`;
  }

  // Known-caster spells-on-level-gain (Wizard/Sorcerer/Bard/Warlock). When the
  // class's known/spellbook target grows, surface the new pick(s) as a pending
  // counter resolved via `learn_spell`. NO auto-fill (D-06) — the player picks.
  // Prepared casters (Cleric/Druid/Paladin/Ranger) return null here and accrue
  // nothing; they prepare from the full list. The owed delta counts only the
  // current non-cantrip known pool against the new target.
  const knownTarget = knownSpellTargetForLevel(className, newClassLevel);
  if (knownTarget !== null && context.spellTable) {
    const cantrips = new Set(casterSpellOptionsByLevel(className, context.spellTable, 0)[0] ?? []);
    const currentKnown = (char.spells_known ?? []).filter((id) => !cantrips.has(id)).length;
    const owed = Math.max(0, knownTarget - currentKnown - (char.spells_to_learn ?? 0));
    if (owed > 0) {
      char.spells_to_learn = (char.spells_to_learn ?? 0) + owed;
      out += ` ${className} level ${newClassLevel}: learn ${owed} new spell${owed === 1 ? '' : 's'}!`;
    }
  }

  // SRD Barbarian Primal Champion (L20 capstone): Strength and Constitution
  // each increase by 4, to a maximum of 30. The CON increase raises max HP
  // retroactively (same convention as an ASI CON bump). hpRoll above already
  // used the pre-boost CON, so this adds only the delta from the +4.
  if (cls === 'barbarian' && newClassLevel === 20) {
    const oldCon = char.con;
    char.str = Math.min(30, char.str + 4);
    char.con = Math.min(30, char.con + 4);
    const conModGain = abilityMod(char.con) - abilityMod(oldCon);
    if (conModGain > 0) {
      const hpGain = conModGain * char.level;
      char.max_hp += hpGain;
      char.hp += hpGain;
    }
    out += ` ⚔️ Primal Champion! ${char.name}'s Strength and Constitution surge (+4 each, max 30).`;
  }

  // SRD Monk Body and Mind (L20 capstone): Dexterity and Wisdom each increase
  // by 4, to a maximum of 25. (Neither affects max HP, so no retroactive bump.)
  if (cls === 'monk' && newClassLevel === 20) {
    char.dex = Math.min(25, char.dex + 4);
    char.wis = Math.min(25, char.wis + 4);
    out += ` 🧘 Body and Mind! ${char.name}'s Dexterity and Wisdom surge (+4 each, max 25).`;
  }

  // SRD Bard Words of Creation (L20 capstone): the bard always has Power Word
  // Heal and Power Word Kill prepared. pansori casts from `spells_known`, so
  // the grant just adds the two ids (idempotent). The second-target-within-
  // 10ft rider lives in the cast pipeline (heal.ts / powerWords.ts), gated on
  // `hasWordsOfCreation`.
  if (cls === 'bard' && newClassLevel === 20) {
    const known = new Set(char.spells_known ?? []);
    const before = known.size;
    known.add('power_word_heal');
    known.add('power_word_kill');
    if (known.size > before) char.spells_known = [...known];
    out += ` ✨ Words of Creation! ${char.name} always has Power Word Heal and Power Word Kill prepared.`;
  }

  // SRD Draconic Sorcery — gain newly-unlocked always-prepared Draconic spells.
  if (cls === 'sorcerer' && char.subclass === 'draconic') {
    const before = (char.spells_known ?? []).length;
    char.spells_known = mergeDraconicSpells(char);
    if (char.spells_known.length > before) out += ` 🐉 Draconic Spells expanded.`;
  }

  // First multiclass level: narrow proficiency grants per SRD (armor /
  // weapons, plus a class-list skill + tools for Bard / Ranger / Rogue). The
  // entry skill auto-picks from the context's class skill-choice options.
  if (isFirstLevelInClass && cls !== char.character_class.toLowerCase()) {
    const skillOptions = context.classSkillChoices?.[cls]?.options;
    const profNote = applyMulticlassProfGrants(char, cls, skillOptions);
    if (profNote) out += profNote;
  }

  // SRD 5.2.1 subclass — every class gains its single iconic subclass at
  // level 3. Since there's exactly one option, auto-assign it the moment the
  // primary class reaches L3 rather than surfacing a one-item choice. (Must
  // run AFTER the HP roll above so Draconic Resilience is applied retroactively
  // by applySubclass, not double-counted in this level's roll.)
  const primaryCls = char.character_class.toLowerCase();
  if (!char.subclass && (char.class_levels[primaryCls] ?? 0) >= 3) {
    const sub = SRD_SUBCLASS_FOR_CLASS[primaryCls];
    if (sub) out += applySubclass(char, sub);
  }

  return out;
}

// Auto-leveling is RETIRED — leveling is now player-driven via the leveling
// pane (out of combat: enter_leveling → the level_up_class cascade; see
// generateChoices' leveling gates + GameState.active_leveling). XP still accrues
// (splitEncounterXp / the give_xp consequence award it); the player advances
// each member by hand. These two functions are kept as no-ops so the ~13 kill
// sites that call `applyPartyLevelUps` need no change — they just stop leveling.
function applyLevelUpFromXp(_char: Character, _context: Context): string {
  return '';
}

export function applyPartyLevelUps(_st: GameState, _killer: Character, _context: Context): string {
  return '';
}

// Post-LLM fact-preservation check. The system prompt instructs the model
// to keep all numbers, damage values, outcomes, and named entities — but
// compliance isn't free. If the enhanced output drops a critical token
// from the input (a multi-digit number, a state word like "killed" /
// "downed" / "miss" / "hit"), we fall back to the raw narrative so the
// player isn't shown prose that misrepresents engine state.
//
// We deliberately only check for *dropped* facts, not *added* embellishment
// (prose flourish is the whole point of the LLM pass). Single-digit numbers
// are skipped because they're often grammatical artifacts ("1 round", "2
// turns") rather than mechanical facts.
export function preservesCriticalFacts(input: string, output: string): boolean {
  // Numbers: any 2+ digit sequence in input must appear in output.
  const inputNumbers = input.match(/\b\d{2,}\b/g) ?? [];
  for (const n of inputNumbers) {
    if (!output.includes(n)) return false;
  }
  // Outcome words: presence is binary — if input says "killed", output must too.
  const outcomeWords = ['killed', 'downed', 'critical', 'CRIT'];
  for (const w of outcomeWords) {
    if (input.includes(w) && !output.toLowerCase().includes(w.toLowerCase())) return false;
  }
  return true;
}

// Fiend Warlock — Dark One's Blessing (SRD): when you reduce a hostile
// creature to 0 HP, gain temp HP = CHA mod + warlock level (min 1).
export function grantDarkOnesBlessing(char: Character): string {
  if (!hasClass(char, 'warlock') || char.subclass !== 'fiend') return '';
  const grant = Math.max(1, getClassLevel(char, 'warlock') + abilityMod(char.cha));
  const prev = char.temp_hp ?? 0;
  if (grant > prev) char.temp_hp = grant;
  return ` 🔥 Dark One's Blessing: ${char.name} gains ${grant} temp HP.`;
}

// ─── Rest helper ──────────────────────────────────────────────────────────────

export function canRestInRoom(state: GameState, seed: Seed): boolean {
  const room = seed.rooms.find((r) => r.id === state.current_room);
  if (room?.canRest === false) return false;
  return !hasLivingEnemy(state, seed, state.current_room);
}

// ─── Trap helpers ─────────────────────────────────────────────────────────────

export function getRoomTrap(roomId: string, seed: Seed, context: Context): Trap | null {
  // Traps are defined on Room objects inside the campaign or room pool
  const campaignRoom = context.campaign?.rooms?.find((r) => r.id === roomId);
  if (campaignRoom?.trap) return campaignRoom.trap;
  const seedRoom = seed.rooms?.find((r) => r.id === roomId);
  if (seedRoom?.trap) return seedRoom.trap;
  return null;
}

export function trapSpent(state: GameState, roomId: string): boolean {
  return (
    (state.traps_triggered ?? []).includes(roomId) || (state.traps_disarmed ?? []).includes(roomId)
  );
}

// SRD Travel Pace check effects, surfaced through PASSIVE Perception (SRD
// passive rules: Advantage +5 / Disadvantage −5): Fast pace imposes
// Disadvantage on Wisdom (Perception) — the hurrying party spots less —
// and Slow grants Advantage. Normal is 0.
export function pacePerceptionMod(state: GameState): number {
  return state.travel_pace === 'fast' ? -5 : state.travel_pace === 'slow' ? 5 : 0;
}

export function partyDetectsTrap(characters: Character[], trap: Trap, paceMod = 0): boolean {
  return characters.some((c) => {
    if (c.dead) return false;
    const proficient = c.skill_proficiencies?.includes('Perception') ?? false;
    return passivePerception(c.wis, c.level, proficient) + paceMod >= trap.dc;
  });
}

// ─── Backward-compatibility normalizer ───────────────────────────────────────

// Backfill Character.owner_user_id for pre-multiplayer saves. New sessions
// set owner_user_id at character creation (every PC = host). Existing
// sessions stored before MP shipped have no owner field — every PC there
// gets the session's host user id. Called by routes/game.ts right after
// normalizeState; idempotent (only writes when the field is missing).
export function backfillOwnership(state: GameState, hostUserId: string): GameState {
  let mutated = false;
  const characters = state.characters.map((c) => {
    if (c.owner_user_id) return c;
    mutated = true;
    return { ...c, owner_user_id: hostUserId };
  });
  return mutated ? { ...state, characters } : state;
}

// Pre-id-keyed-dialogue saves carried `active_conversation.path` (number[]).
// The dialogue migration minted node ids = the dotted index path, so a numeric
// path [0,1] translates to nodePath ["0","0.1"] (cumulative dotted ids) — an
// exact cursor for content that predates the change. Idempotent: a state that
// already has nodePath passes through.
function migrateConversationCursor(
  conv: GameState['active_conversation'] | { path?: number[] } | undefined
): GameState['active_conversation'] {
  if (!conv) return undefined;
  if ('nodePath' in conv && Array.isArray((conv as GameState['active_conversation'])!.nodePath)) {
    return conv as GameState['active_conversation'];
  }
  const old = conv as { npcId: string; roomId: string; path?: number[]; prompt: string };
  const path = Array.isArray(old.path) ? old.path : [];
  const nodePath = path.map((_, i) => path.slice(0, i + 1).join('.'));
  return { npcId: old.npcId, roomId: old.roomId, nodePath, prompt: old.prompt };
}

export function normalizeState(raw: Record<string, unknown>): GameState {
  // Already new format — patch any fields added after initial rollout
  // (default-backfill), then route through the schema migration ladder
  // so version-stamping and any per-version logic land in one place.
  if (Array.isArray((raw as unknown as GameState).characters)) {
    const gs = raw as unknown as GameState;
    const backfilled: GameState = {
      ...gs,
      active_conversation: migrateConversationCursor(gs.active_conversation),
      short_rested_rooms: gs.short_rested_rooms ?? [],
      long_rested: gs.long_rested ?? false,
      npc_attitudes: gs.npc_attitudes ?? {},
      npc_talked: gs.npc_talked ?? [],
      traps_triggered: gs.traps_triggered ?? [],
      traps_disarmed: gs.traps_disarmed ?? [],
      objects_searched: gs.objects_searched ?? [],
      seen_choices: gs.seen_choices ?? [],
      characters: gs.characters.map((c) => {
        // Multiclass schema backfill — pre-multiclass saves omit
        // class_levels entirely. Synthesize from character_class +
        // level so the helpers in services/multiclass.ts can rely on
        // the field being present after normalization.
        const classLevels =
          c.class_levels && Object.keys(c.class_levels).length > 0
            ? c.class_levels
            : { [c.character_class.toLowerCase()]: c.level ?? 1 };
        const charWithLevels = { ...c, class_levels: classLevels };
        const existingSlots = c.spell_slots_max ?? {};
        const slotsMax =
          Object.keys(existingSlots).length > 0 ? existingSlots : spellSlotsForChar(charWithLevels);
        return {
          ...c,
          hit_die: c.hit_die ?? 8,
          hit_dice_remaining: c.hit_dice_remaining ?? c.level ?? 1,
          condition_durations: c.condition_durations ?? {},
          class_resource_uses: c.class_resource_uses ?? {},
          asi_pending: c.asi_pending ?? false,
          exhaustion_level: c.exhaustion_level ?? 0,
          spell_slots_max: slotsMax,
          spell_slots_used: c.spell_slots_used ?? {},
          spells_known: c.spells_known ?? [],
          background_id: c.background_id ?? null,
          skill_proficiencies: c.skill_proficiencies ?? [],
          tool_proficiencies: c.tool_proficiencies ?? [],
          armor_proficiencies: c.armor_proficiencies ?? [],
          weapon_proficiencies: c.weapon_proficiencies ?? [],
          attuned_items: c.attuned_items ?? ([] as string[]),
          class_levels: classLevels,
        };
      }),
    };
    return applyStateMigrations(backfilled);
  }

  const charId = randomUUID();
  const level = Number(raw.level ?? 1);
  const charClass = String(raw.character_class ?? 'Adventurer');
  const char: Character = {
    id: charId,
    name: String(raw.character_name ?? 'Hero'),
    character_class: charClass,
    class_levels: { [charClass.toLowerCase()]: level },
    portrait_url: (raw.portrait_url as string | null | undefined) ?? null,
    hp: Number(raw.hp ?? 20),
    max_hp: Number(raw.max_hp ?? 20),
    ac: Number(raw.ac ?? 10),
    str: Number(raw.str ?? 10),
    dex: Number(raw.dex ?? 10),
    con: Number(raw.con ?? 10),
    int: Number(raw.int ?? 10),
    wis: Number(raw.wis ?? 10),
    cha: Number(raw.cha ?? 10),
    xp: Number(raw.xp ?? 0),
    level,
    gold: Number(raw.gold ?? 5),
    inventory: (raw.inventory as InventoryItem[]) ?? [],
    // Body-slot equipment; migrates legacy equipped_weapon/armor/shield saves.
    equipment: equipmentFromLegacy(raw as Parameters<typeof equipmentFromLegacy>[0]),
    conditions: (raw.conditions as string[]) ?? [],
    condition_durations: (raw.condition_durations as Record<string, number>) ?? {},
    death_saves: (raw.death_saves as DeathSaves) ?? { successes: 0, failures: 0 },
    stable: Boolean(raw.stable),
    dead: Boolean(raw.dead),
    turn_actions: (raw.turn_actions as TurnActions) ?? { ...FRESH_TURN },
    initiative_roll: null,
    hit_die: 8,
    hit_dice_remaining: level,
    class_resource_uses: {},
    asi_pending: false,
    exhaustion_level: 0,
    spell_slots_max: {},
    spell_slots_used: {},
    spells_known: [],
    background_id: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    armor_proficiencies: [],
    weapon_proficiencies: [],
    attuned_items: [] as string[],
  };
  const oldRunLog = (raw.run_log as Array<{ action: string; narrative: string }>) ?? [];
  return applyStateMigrations({
    characters: [char],
    active_character_id: charId,
    current_room: String(raw.current_room ?? ''),
    visited_rooms: (raw.visited_rooms as string[]) ?? [],
    enemies_killed: (raw.enemies_killed as string[]) ?? [],
    loot_taken: (raw.loot_taken as string[]) ?? [],
    combat_active: Boolean(raw.combat_active),
    initiative_order: [],
    initiative_idx: 0,
    run_log: oldRunLog.map((e) => ({
      character_id: charId,
      action: e.action,
      narrative: e.narrative,
    })),
    room_log: (raw.room_log as string[]) ?? [],
    last_choices: undefined,
    short_rested_rooms: [],
    long_rested: false,
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: (raw.flags as Record<string, boolean | string | number>) ?? {},
  });
}

// ─── Arrival narrative ────────────────────────────────────────────────────────

export function buildArrivalNarrative(
  targetId: string,
  state: GameState,
  seed: Seed,
  context: Context,
  // First visit? Picks the room's `onFirstEnter` beat; repeats rotate the
  // `onEnter` pool. Callers re-describing the current room (examine / default /
  // death-save) leave this false; markerMove/sneak pass the transition's value.
  first = false
): string {
  // A room's arrival line is now authored on the room itself (pooled `onEnter`,
  // with `onFirstEnter` as the once-only beat); `genericArrival` is the
  // campaign-wide fallback for rooms with no enter hook.
  const room = seed.rooms.find((r) => r.id === targetId);
  const line =
    (first ? pickHookText(room?.onFirstEnter) : undefined) ??
    pickHookText(room?.onEnter) ??
    pick(context.narratives.genericArrival);
  let text = line.replace(/{world}/g, getWorldName(seed));

  const livingHere = getLivingRoomEnemies(state, seed, targetId);
  if (livingHere.length > 0) {
    const parts = livingHere.map((enemy) => {
      const hp = state.entities?.find((e) => e.id === enemy.id && e.isEnemy)?.hp ?? enemy.hp;
      return `${enemy.name} (HP ${hp}, AC ${enemy.ac})`;
    });
    text += ` Hostile here: ${parts.join(', ')}.`;
  }
  // (Previously: an else-branch appended `alreadyDead` pool text on
  // revisits to cleared rooms. The pool only contains attack-rejection
  // flavor like "That foe is already defeated.", which read as a stale
  // error message rather than re-entry flavor — see Vale playthrough
  // log, 2026-05-21. Cleared rooms now just rely on exits + loot for
  // their narrative cues.)
  const spotted = availableLootIn(state, seed, targetId);
  if (spotted.length === 1) {
    text += ` You spot a ${spotted[0].name} on the ground.`;
  } else if (spotted.length > 1) {
    const names = spotted.map((l) => l.name);
    const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    text += ` You spot ${list} here.`;
  }

  // Passive trap detection (5e DMG ch.5)
  const trap = getRoomTrap(targetId, seed, context);
  if (trap && !trapSpent(state, targetId)) {
    if (partyDetectsTrap(state.characters, trap, pacePerceptionMod(state))) {
      text += ' ' + (pickHookText(trap.detectNarrative) ?? '');
    }
    // If not detected, trap fires silently on next action — handled in takeAction
  }

  return text;
}

// ─── NPC helpers ─────────────────────────────────────────────────────────────

export function getNpcAttitude(state: GameState, npc: PlacedNpc): NpcAttitude {
  return state.npc_attitudes?.[npc.id] ?? npc.attitude;
}

// `npc_attitudes` / `enemies_killed` are keyed by NPC id (a room may hold several
// NPCs). Takes the npc id.
export function npcIsKilled(state: GameState, npcId: string): boolean {
  return !!(
    state.npc_attitudes?.[npcId] === 'hostile' && state.enemies_killed?.includes(`npc:${npcId}`)
  );
}

/**
 * Whether this NPC's dialogue tree actually OFFERS a given quest — i.e. some
 * response (at any nesting depth) advances it via an `advance_quest`
 * consequence. Drives the "quest available" [!] marker so a giver who also owns
 * a quest that only advances from the world (a step keyed on a kill / loot /
 * room-visit, never offered in dialogue) doesn't keep flagging [!] after the
 * dialogue quest is accepted.
 */
export function npcDialogueOffersQuest(npc: PlacedNpc, questId: string): boolean {
  const walk = (responses: NpcDialogueResponse[] | undefined): boolean =>
    (responses ?? []).some(
      (r) =>
        (r.consequences ?? []).some((c) => c.type === 'advance_quest' && c.questId === questId) ||
        walk(r.responses)
    );
  return walk(npc.responses);
}

// ─── Choice generation ────────────────────────────────────────────────────────

// Stable key for choice-dimming. Returns a string for choices the player
// benefits from seeing dimmed after one use; returns undefined for
// repeatable/transient choices (movement, combat verbs, inventory).
//
// Room-scoped action types (interact_object, examine, loot, talk_response)
// fold the current room id into the key so two physically distinct
// same-template objects (e.g. two crypts each with a "dirty_chest") get
// distinct keys. talk_response also includes the npc id from the active
// room so two NPCs sharing a response index don't collide.
export function seenKeyForAction(action: StructuredAction, state: GameState): string | undefined {
  const room = state.current_room;
  switch (action.type) {
    case 'talk_response': {
      // Include the active NPC id so two NPCs sharing a room (e.g. Old Elise +
      // Bram in pinegate_square) don't share response keys — otherwise dimming
      // Elise's response #0 would also dim Bram's #0. Include the conversation
      // path so the SAME response index at different nesting levels gets a
      // distinct key (picking root option 0 must not dim a nested option 0).
      const npcId = state.active_conversation?.npcId ?? '';
      const nodePath = (state.active_conversation?.nodePath ?? []).join('.');
      return `talk_response::${room}::${npcId}::${nodePath}::${action.responseId}`;
    }
    case 'interact_object':
      return `interact_object::${room}::${action.objectId}`;
    case 'accept_quest':
      return `accept_quest::${action.questId}`;
    case 'examine':
      return `examine::${room}`;
    case 'loot':
      return `loot::${room}${action.lootKey ? `::${action.lootKey}` : ''}`;
    default:
      return undefined;
  }
}

// English ordinal suffix for spell-slot labels (1st / 2nd / 3rd / 4th …).
// Slots only run 1–9 but the standard rule (teens take "th") is kept for
// correctness.
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Scale an upcast die expression by the number of slot levels above base.
// `upcastBonus` is the per-level bonus (e.g. "2d8" for Cure Wounds), so 2
// levels above base = "4d8". Earlier code pasted the level delta in front of
// the unscaled string ("1" + "2d8" → "+12d8"); this multiplies the dice
// count instead. Non-"NdM" shapes (flat numbers, "1d4+1") fall through to a
// best-effort: flat numbers scale, anything else shows the per-level bonus.
export function scaleUpcastDice(upcastBonus: string, levels: number): string {
  if (levels <= 1) return upcastBonus;
  const dice = /^(\d+)d(\d+)(.*)$/.exec(upcastBonus);
  if (dice) return `${Number(dice[1]) * levels}d${dice[2]}${dice[3]}`;
  const flat = /^(\d+)$/.exec(upcastBonus);
  if (flat) return `${Number(flat[1]) * levels}`;
  return upcastBonus;
}

// A friendly shop NPC's wares as `buy` choices, with faction-aware pricing
// folded in (factionShopPrice + the party's rep with the NPC's faction). Each is
// tagged `kind:'vendor'` so the frontend renders them in the VendorPanel.
// ─── Vendor economy helpers ───────────────────────────────────────────────────

// The current in-game day (Day 1 starts the campaign).
function shopDay(state: GameState): number {
  return Math.floor((state.world_minute ?? 0) / 1440) + 1;
}

/**
 * Daily restock — every vendor's stock and wallet reset at the start of each
 * in-game day. Lazy: called by the shop handlers (enter_shop / buy / sell)
 * before their logic, clearing the session maps when the day has rolled.
 */
export function maybeRestockShops(state: GameState): GameState {
  const day = shopDay(state);
  if (state.shop_restock_day === day) return state;
  return { ...state, shop_stock: {}, shop_gold: {}, shop_restock_day: day };
}

/** Remaining stock for an entry: today's session count, else the authored qty. */
export function shopStockLeft(
  state: GameState,
  npcId: string,
  entry: { itemId: string; qty?: number }
): number | undefined {
  if (entry.qty === undefined) return undefined; // unlimited
  return state.shop_stock?.[`${npcId}:${entry.itemId}`] ?? entry.qty;
}

/** The vendor's current wallet: today's session balance, else the authored float. */
export function shopGoldLeft(state: GameState, npc: PlacedNpc): number | undefined {
  if (npc.shopGold === undefined) return undefined; // unlimited
  return state.shop_gold?.[npc.id] ?? npc.shopGold;
}

/**
 * What the vendor pays for an item: half their OWN sale price when they
 * stock it, else half the item's SRD value (Equipment-table cost; magic
 * items per the rarity table) — min 1cr either way. Items with neither are
 * not bought. (Half is a table convention; the SRD is silent on a
 * used-goods rate.)
 */
export function shopSellPrice(
  npc: PlacedNpc,
  itemId: string,
  lootTable: LootItem[]
): number | undefined {
  const entry = npc.shop?.find((e) => e.itemId === itemId);
  if (entry) return Math.max(1, Math.floor(entry.price / 2));
  const value = lootTable.find((l) => l.id === itemId)?.value;
  return value !== undefined ? Math.max(1, Math.floor(value / 2)) : undefined;
}

function shopBuyChoices(npc: PlacedNpc, state: GameState, context: Context): GameChoice[] {
  if (!npc.shop?.length) return [];
  const faction = npc.factionId
    ? context.campaign?.factions?.find((f) => f.id === npc.factionId)
    : undefined;
  const rep = npc.factionId ? (state.faction_rep?.[npc.factionId] ?? 0) : 0;
  const out: GameChoice[] = [];
  for (const entry of npc.shop) {
    const item = context.lootTable.find((l) => l.id === entry.itemId);
    if (!item) continue;
    // Daily stock — a sold-out entry drops off the list until tomorrow.
    const left = shopStockLeft(state, npc.id, entry);
    if (left !== undefined && left <= 0) continue;
    const price = faction ? factionShopPrice(entry.price, rep, faction) : entry.price;
    const repNote =
      faction && price !== entry.price
        ? ` (${faction.name} ${price < entry.price ? 'discount' : 'markup'} from ${entry.price})`
        : '';
    const stockNote = left !== undefined ? ` (${left} left)` : '';
    out.push({
      label: `Buy ${item.name} — ${price}cr${repNote}${stockNote}`,
      action: { type: 'buy', itemId: entry.itemId, price },
      kind: 'vendor',
    });
  }
  // SELL side — the vendor buys back items THEY stock, at half their sale
  // price, capped by their wallet. One choice per distinct item the active
  // character carries unequipped/unattuned; each click sells one.
  const active = state.characters.find((c) => c.id === state.active_character_id);
  if (active) {
    const equippedIds = new Set(Object.values(active.equipment ?? {}));
    const attuned = new Set(active.attuned_items ?? []);
    const wallet = shopGoldLeft(state, npc);
    const offered = new Set<string>();
    for (const item of active.inventory ?? []) {
      if (offered.has(item.id)) continue;
      const price = shopSellPrice(npc, item.id, context.lootTable);
      if (price === undefined) continue; // the vendor doesn't deal in it
      const sellable = (active.inventory ?? []).filter(
        (i) =>
          i.id === item.id &&
          !equippedIds.has(i.instance_id ?? '') &&
          !attuned.has(i.instance_id ?? '')
      );
      if (sellable.length === 0) continue;
      if (wallet !== undefined && wallet < price) continue; // can't afford it today
      offered.add(item.id);
      const haveNote = sellable.length > 1 ? ` (have ${sellable.length})` : '';
      out.push({
        label: `Sell ${item.name} — ${price}cr${haveNote}`,
        action: { type: 'sell', itemId: item.id },
        kind: 'vendor',
      });
    }
  }
  return out;
}

// ── XP thresholds (SRD 5.2.1 Character Advancement) ─────────────────────────
// Total XP required to BE at each level. A character at level L advances when
// their total XP reaches the entry for L+1. Index 0 is unused; index 1 = 0.
// (Replaces the old compressed `level × 100` curve, which let a single quest
// reward vault a character several levels at once.)
export const XP_FOR_LEVEL: readonly number[] = [
  0, // (unused index 0)
  0, // L1
  300, // L2
  900, // L3
  2_700, // L4
  6_500, // L5
  14_000, // L6
  23_000, // L7
  34_000, // L8
  48_000, // L9
  64_000, // L10
  85_000, // L11
  100_000, // L12
  120_000, // L13
  140_000, // L14
  165_000, // L15
  195_000, // L16
  225_000, // L17
  265_000, // L18
  305_000, // L19
  355_000, // L20
];

/**
 * Total XP required to reach `level` per the SRD 5.2.1 Character Advancement
 * table. Levels at or below 1 need 0; levels past 20 clamp to the L20 entry.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return XP_FOR_LEVEL[Math.min(20, level)] ?? XP_FOR_LEVEL[20];
}

// ── Player-driven leveling (the leveling pane) ──────────────────────────────
// What level-up work a character has, in resolution order. Pending picks
// (ASI / weapon mastery from a prior advance) resolve BEFORE advancing again.
export function levelUpWorkFor(char: Character): 'advance' | 'asi' | 'mastery' | 'spells' | null {
  if (char.dead) return null;
  if (char.asi_pending) return 'asi';
  if ((char.weapon_mastery_pending ?? 0) > 0) return 'mastery';
  // Pending known-caster spell pick(s) resolve before advancing again.
  if ((char.spells_to_learn ?? 0) > 0) return 'spells';
  const level = char.level ?? 1;
  if (level < 20 && (char.xp ?? 0) >= xpForLevel(level + 1)) return 'advance';
  return null;
}

// The classes a character may advance into next: any class they already have,
// plus any they meet the 2024 multiclass ability prereq for (canMulticlassInto).
function levelClassChoices(char: Character): GameChoice[] {
  // The choice gains a level in the CHOSEN class — not the character's total
  // level. Continuing an existing class advances that class's level; picking a
  // class you have no levels in is a multiclass that grants its LEVEL 1 (your
  // total level still goes up by one). Label per-class so a Wizard 1 → 2 sees
  // "Advance Wizard → level 2" vs "Multiclass: Barbarian (level 1)", not a
  // misleading "Advance Barbarian → level 2".
  return levelUpClassOptions(char).map((cls) => {
    const name = `${cls[0].toUpperCase()}${cls.slice(1)}`;
    const classNext = getClassLevel(char, cls) + 1;
    const label =
      classNext === 1
        ? `Multiclass: ${name} (new class — level 1)`
        : `Advance ${name} → level ${classNext}`;
    return { label, action: { type: 'level_up_class' as const, className: cls } };
  });
}

// ASI / Epic-Boon choices for a character at an ASI milestone (asi_pending).
function asiChoicesFor(char: Character, context: Context): GameChoice[] {
  const statLabels: Record<string, string> = {
    str: 'STR',
    dex: 'DEX',
    con: 'CON',
    int: 'INT',
    wis: 'WIS',
    cha: 'CHA',
  };
  // Flag exactly one ASI option as the guided default from the static table
  // (D-02/D-03). Missing entry → flag nothing; never throw, never flag >1.
  const rec = LEVEL_RECOMMENDATIONS[char.character_class];
  const choices: GameChoice[] = (Object.keys(statLabels) as AbilityKey[]).map((stat) => ({
    label: `Ability Score Improvement: +2 ${statLabels[stat]} (currently ${char[stat]})`,
    action: { type: 'apply_asi' as const, stat },
    ...(rec && stat === rec.asi ? { recommended: true, rationale: rec.asiReason } : {}),
  }));
  // SRD level-19 Epic Boon: take a boon feat in place of the ASI; the +1 auto-
  // targets the best eligible ability (the boon's power is the meaningful pick).
  if ((char.level ?? 1) >= 19) {
    const isCaster = Object.keys(char.spell_slots_max ?? {}).length > 0;
    for (const feat of Object.values(context.featTable ?? {})) {
      if (feat.category !== 'epic-boon') continue;
      if (canTakeFeat(char, feat) !== '') continue;
      if (feat.effect.kind === 'epic-boon' && feat.effect.boon === 'spell-recall' && !isCaster) {
        continue;
      }
      const eligible =
        feat.abilityBonus && 'choices' in feat.abilityBonus
          ? (feat.abilityBonus.choices as AbilityKey[])
          : (['str'] as AbilityKey[]);
      const ability = eligible.reduce(
        (best, a) => ((char[a] ?? 10) > (char[best] ?? 10) ? a : best),
        eligible[0]
      );
      choices.push({
        label: `Epic Boon: ${feat.name} (+1 ${statLabels[ability]})`,
        action: { type: 'take_feat' as const, featId: feat.id, abilityChoice: ability },
      });
    }
  }
  return choices;
}

// Weapon-mastery picks for a character with pending mastery slot(s).
function masteryChoicesFor(char: Character, context: Context): GameChoice[] {
  const profs = context.classWeaponProficiencies?.[char.character_class] ?? [];
  const already = new Set(char.weapon_masteries ?? []);
  const options = masterableWeapons(profs, context.lootTable).filter((w) => !already.has(w.id));
  if (options.length === 0) {
    // Nothing left to master — offer the slot-clearing escape so it's not stuck.
    return [
      {
        label: 'No further weapons to master — continue.',
        action: { type: 'choose_weapon_mastery', weaponId: '' },
      },
    ];
  }
  // Flag exactly one mastery option as the guided default: the first offered
  // weapon whose id is in the static table's masteries list (D-02/D-03).
  // Missing entry / no match → flag nothing; never throw, never flag >1.
  const rec = LEVEL_RECOMMENDATIONS[char.character_class];
  const recId = rec?.masteries?.find((id) => options.some((w) => w.id === id));
  return options.map((w) => ({
    label: `Weapon Mastery: master ${w.name} (${w.mastery})`,
    action: { type: 'choose_weapon_mastery' as const, weaponId: w.id },
    ...(rec && recId && w.id === recId
      ? { recommended: true, rationale: rec.masteryReason ?? '' }
      : {}),
  }));
}

export function generateChoices(state: GameState, seed: Seed, context: Context): GameChoice[] {
  const char =
    state.characters.find((c) => c.id === state.active_character_id) ?? state.characters[0];
  if (!char) return [];

  if (char.dead) return [];

  // Post-combat gate — a fight just resolved. Offer ONLY "Continue" so the view
  // doesn't auto-switch straight back to exploration; the player acknowledges
  // the outcome, then `continue` clears the flag and the normal choices return.
  if (state.combat_over_pending && !state.combat_active) {
    return [{ label: 'Continue', action: { type: 'continue' }, kind: 'continue' }];
  }

  // Reaction window — only offer reaction-resolution choices until the
  // player decides. Suppresses everything else (attacks, movement, etc.).
  const pending = state.pending_reaction;
  if (pending && pending.eligibleCharIds.includes(char.id)) {
    // SRD PC-turn d20 reaction window — distinct shape from
    // the enemy-attack-base reactions (no attackerEnemyId; rollerCharId
    // instead). Branch early so the enemy-attack label lookup below
    // doesn't crash on the missing field.
    if (pending.kind === 'pc_d20') {
      // Offer every d20-fixing feature the roller has available. Stroke of Luck
      // (Rogue L20) rescues any miss incl. a fumble; Heroic Inspiration rerolls
      // a non-fumble miss. (Future sources — Lucky-RAW, Restore Balance — plug
      // in here.)
      const d20Choices: GameChoice[] = [];
      if (strokeOfLuckAvailable(char)) {
        d20Choices.push({
          label: `✦ Stroke of Luck — turn the miss (d20 ${pending.originalD20}) into a natural 20 (once per rest)`,
          action: { type: 'resolve_reaction', accept: true, source: 'stroke_of_luck' },
        });
      }
      if (
        char.inspiration &&
        !char.turn_actions?.inspiration_pending &&
        pending.originalD20 !== 1
      ) {
        d20Choices.push({
          label: `Spend Heroic Inspiration to reroll the d20 (was ${pending.originalD20}, MUST use new roll)`,
          action: { type: 'resolve_reaction', accept: true, source: 'inspiration' },
        });
      }
      d20Choices.push({
        label: `Decline — keep the missed attack (d20 ${pending.originalD20})`,
        action: { type: 'resolve_reaction', accept: false },
      });
      return d20Choices;
    }
    const enemyForLabel =
      seed.enemies?.[state.current_room]?.find((e) => e.id === pending.attackerEnemyId)?.name ??
      'attacker';
    if (pending.kind === 'shield') {
      // The proposed-damage value lives on the stashed fragment.
      // PendingShieldReaction types it as `unknown` (the FE doesn't
      // introspect it); narrow via a local shape just for the label.
      const proposedFragment = pending.pendingFragment as { damage?: number } | undefined;
      const proposedDmg = proposedFragment?.damage ?? 0;
      return [
        {
          label: `Cast Shield (reaction, 1st-level slot) — +5 AC, ${enemyForLabel}'s attack (total ${pending.atkTotal} vs AC ${pending.targetAcAtAttack}) misses!`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — take the hit (${proposedDmg} damage)`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'hellish_rebuke') {
      const dc = 8 + profBonus(char.level) + abilityMod(char.cha);
      const isTieflingInnate =
        char.species === 'tiefling' &&
        char.level >= 3 &&
        !char.class_resource_uses?.tiefling_rebuke_used;
      const costLabel = isTieflingInnate
        ? 'Infernal Legacy, 1/long rest'
        : 'reaction, 1st-level slot';
      return [
        {
          label: `Cast Hellish Rebuke (${costLabel}) — 2d10 fire on ${enemyForLabel} (DEX save DC ${dc} for half)`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — let the attack stand`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'counterspell') {
      // Auto-counter when the slot level ≥ the enemy spell's level (which
      // for Counterspell-base means level ≤ 3). Higher-level enemy spells
      // need an ability check; we surface both label variants for clarity.
      const autoCounter = pending.enemySpellLevel <= 3;
      const cs = autoCounter
        ? `auto-counter`
        : `ability check vs DC ${10 + pending.enemySpellLevel}`;
      return [
        {
          label: `Cast Counterspell (reaction, 3rd-level slot) — interrupt ${enemyForLabel}'s ${pending.enemySpellName} (${cs})`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — let ${pending.enemySpellName} resolve`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'deflect_attacks') {
      // SRD: the L13 upgrade ("Deflect Energy") extends the same feature to any
      // damage type — name it accordingly so the player knows it's the upgrade.
      const deflectName = getClassLevel(char, 'monk') >= 13 ? 'Deflect Energy' : 'Deflect Attacks';
      return [
        {
          label: `🥋 ${deflectName} (reaction) — reduce the ${enemyForLabel}'s ${pending.proposedDamage} damage by 1d10 + DEX + Monk level`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — take the hit (${pending.proposedDamage} damage)`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'uncanny_dodge') {
      return [
        {
          label: `🌀 Uncanny Dodge (reaction) — halve the ${enemyForLabel}'s ${pending.proposedDamage} damage`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — take the hit (${pending.proposedDamage} damage)`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'save_reroll') {
      // What a successful reroll achieves: shake off a condition, or shrug off
      // the failed-minus-saved damage on a damage-spell save.
      const outcome = pending.condition
        ? `the failed ${pending.condition} save`
        : pending.concentrationSpellId
          ? `the failed Concentration save (keep ${pending.concentrationSpellId})`
          : `the failed ${pending.saveAbility.toUpperCase()} save (avoid ${pending.damageRefund ?? 0} damage)`;
      const acceptLabel =
        pending.source === 'indomitable'
          ? `✦ Indomitable — reroll ${outcome} (once per long rest)`
          : `✦ Countercharm — ${pending.reactorName} rerolls ${outcome} with advantage (reaction)`;
      const declineLabel = pending.condition
        ? `Decline — stay ${pending.condition}`
        : pending.concentrationSpellId
          ? `Decline — lose Concentration on ${pending.concentrationSpellId}`
          : `Decline — take the full damage`;
      return [
        {
          label: acceptLabel,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: declineLabel,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
  }

  // Active conversation — surface ONLY the dialogue options (the responses at
  // the current node + Back when nested + End conversation) until the player
  // ends it. Mirrors the pending_reaction early-return. Out of combat; a stale
  // conversation (party left the room) falls through to the normal choices.
  // Vendor pane (nested under the conversation): when open, surface ONLY the
  // NPC's wares + a Back control. Mirrors the conversation early-return; a stale
  // shop (party left / NPC gone / no longer friendly) falls through.
  const shop = state.active_shop;
  if (shop && !state.combat_active && shop.roomId === state.current_room) {
    const snpc = npcById(seed, shop.npcId);
    if (snpc && !npcIsKilled(state, shop.npcId) && getNpcAttitude(state, snpc) === 'friendly') {
      const vendorChoices = shopBuyChoices(snpc, state, context);
      vendorChoices.push({
        label: '↩ Back',
        action: { type: 'exit_shop' as const },
        kind: 'vendor' as const,
      });
      return vendorChoices;
    }
  }

  // Town-teleport interstitial — a cast Teleport / Teleportation Circle is
  // waiting on a destination: offer ONLY the visited towns + a cancel.
  if (state.pending_teleport && !state.combat_active) {
    const spellName = context.spellTable?.[state.pending_teleport]?.name ?? 'Teleport';
    const dests: GameChoice[] = (state.visited_towns ?? [])
      .map((townId) => context.campaign?.towns?.find((t) => t.id === townId))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({
        label: `${spellName} → ${t.name}`,
        action: { type: 'teleport_to' as const, townId: t.id },
      }));
    dests.push({
      label: '✕ Let the spell dissipate',
      action: { type: 'cancel_teleport' as const },
    });
    return dests;
  }

  const conv = state.active_conversation;
  if (conv && !state.combat_active && conv.roomId === state.current_room) {
    const cnpc = npcById(seed, conv.npcId);
    if (cnpc && !npcIsKilled(state, conv.npcId)) {
      // Conditioned / one-shot options are filtered out here (hidden, never
      // grayed); each option carries its stable node id, so talk_response +
      // once-tracking stay stable as visibility (or authored order) shifts.
      const convoChoices: GameChoice[] = visibleResponses(cnpc, conv.nodePath, state, context).map(
        ({ response: r, id }) => {
          const action = { type: 'talk_response' as const, responseId: id };
          // Skill-gated options advertise the roll, mirroring the indifferent
          // NPC talk hint ("(CHA check DC 12)").
          const checkHint = r.check
            ? ` (${r.check.skill.charAt(0).toUpperCase() + r.check.skill.slice(1)} DC ${r.check.dc})`
            : '';
          // This early-return bypasses the end-of-function seenKey pass, so stamp
          // it here — lets the FE dim dialogue options the player already picked.
          return {
            label: `<To ${cnpc.name}> ${r.label}${checkHint}`,
            action,
            kind: 'conversation' as const,
            seenKey: seenKeyForAction(action, state),
          };
        }
      );
      if (conv.nodePath.length > 0) {
        convoChoices.push({
          label: '↩ Back',
          action: { type: 'conversation_back' as const },
          kind: 'conversation' as const,
        });
      }
      // A friendly NPC with wares offers a vendor pane (nested like a dialogue
      // branch). enter_shop opens it; generateChoices then returns the buy list.
      if (cnpc.shop?.length && getNpcAttitude(state, cnpc) === 'friendly') {
        convoChoices.push({
          label: '🛒 Check out my wares',
          action: { type: 'enter_shop' as const },
          kind: 'conversation' as const,
        });
      }
      convoChoices.push({
        label: '✕ End conversation',
        action: { type: 'end_conversation' as const },
        kind: 'conversation' as const,
      });
      return convoChoices;
    }
  }

  // ── Player-driven leveling ────────────────────────────────────────────────
  // Out of combat, leveling takes over the action surface (like conversation /
  // vendor). When `active_leveling` is set, the CASCADE gate drives ONE member's
  // level-up step (class pick → ASI/feat → weapon mastery) + a Back control.
  // Otherwise the ROSTER gate lists every member who can level. Both early-
  // return, so the normal options stay hidden until the party is done.
  if (!state.combat_active) {
    const lvl = state.active_leveling;
    if (lvl) {
      const m = state.characters.find((c) => c.id === lvl.characterId);
      const work = m ? levelUpWorkFor(m) : null;
      if (m && work) {
        const steps =
          work === 'advance'
            ? levelClassChoices(m)
            : work === 'asi'
              ? asiChoicesFor(m, context)
              : masteryChoicesFor(m, context);
        return [
          ...steps.map((c) => ({ ...c, kind: 'leveling' as const })),
          {
            label: '↩ Back to party',
            action: { type: 'exit_leveling' as const },
            kind: 'leveling' as const,
          },
        ];
      }
      // The leveling member has no work left — the terminal handler clears
      // `active_leveling`, so this only happens transiently; fall through to the
      // roster (which shows any remaining members).
    }
    const levelable = state.characters.filter((c) => levelUpWorkFor(c) !== null);
    if (levelable.length > 0) {
      return levelable.map((m) => ({
        label:
          levelUpWorkFor(m) === 'advance'
            ? `✨ Level up ${m.name} → level ${(m.level ?? 1) + 1}`
            : `✨ Finish leveling ${m.name}`,
        action: { type: 'enter_leveling' as const, characterId: m.id },
        kind: 'leveling' as const,
      }));
    }
  }

  const healItems = context.lootTable.filter((i) => i.heal);
  const healItem = char.inventory?.find((i) => healItems.find((h) => h.id === i.id));

  if (char.hp <= 0 && !char.stable)
    return [{ label: 'Roll death saving throw', action: { type: 'death_save' } }];
  if (char.hp <= 0 && char.stable)
    // Stable but unconscious: a self-quaff is only possible with a healing item
    // actually in the pack. Without one there's nothing to do but wait for an
    // ally's aid (don't offer a dead-end "Use healing item" that can't resolve).
    return healItem
      ? [{ label: `Use ${healItem.name}`, action: { type: 'use', itemId: healItem.id } }]
      : [{ label: 'Unconscious — wait for aid (pass)', action: { type: 'pass' } }];

  // SRD 5.2.1 — Surprise imposes Disadvantage on the Initiative roll (handled in
  // buildInitiativeOrder), not a lost turn; a surprised PC acts normally here.

  // Stunned / paralyzed / incapacitated / petrified: cannot take actions, bonus actions, reactions, or move
  const isIncapacitated = char.conditions.some((c) =>
    ['stunned', 'paralyzed', 'incapacitated', 'petrified'].includes(c)
  );
  if (isIncapacitated) {
    const cond = (
      char.conditions.find((c) =>
        ['stunned', 'paralyzed', 'incapacitated', 'petrified'].includes(c)
      ) ?? 'stunned'
    ).toUpperCase();
    return [{ label: `${cond} — cannot act this turn (pass)`, action: { type: 'pass' } }];
  }

  const choices: GameChoice[] = [];
  const roomId = state.current_room;
  const livingEnemies = getLivingRoomEnemies(state, seed, roomId).filter((e) => {
    const ent = state.entities?.find((ent) => ent.id === e.id && ent.isEnemy);
    if (!ent) return true;
    if (ent.hp <= 0) return false;
    // SRD Banishment — banished enemies are in a harmless demiplane
    // and aren't targetable. Filter them out of attack-target selection
    // here so cast / attack choices don't surface them.
    if (ent.conditions.includes('banished')) return false;
    return true;
  });
  const enemyAlive = livingEnemies.length > 0;

  // Trap: offer disarm if trap is detected (party passive Perception
  // beat the DC) but not yet spent. Disarm is an Action (cost.ts) — in
  // combat, hide the choice once the active PC has used their action,
  // otherwise the player can click 4 times in a row and get the same
  // "action already used" rejection each time (see Whispering Pines
  // log turns 51-54). Out of combat the action_used flag isn't enforced
  // so the choice always surfaces when the trap is detected.
  const roomTrap = getRoomTrap(roomId, seed, context);
  const trapDisarmActionAvailable = !state.combat_active || !char.turn_actions.action_used;
  if (
    roomTrap &&
    !trapSpent(state, roomId) &&
    partyDetectsTrap(state.characters, roomTrap, pacePerceptionMod(state)) &&
    trapDisarmActionAvailable
  ) {
    choices.push({
      label: `Disarm Trap — DEX check (DC ${roomTrap.dc})`,
      action: { type: 'disarm_trap' },
    });
  }

  // Attack is the Action (SRD). Don't offer it once the action is spent —
  // an unintended click on a stale Attack choice would otherwise pass through
  // the post-action auto-advance and end the turn (e.g. an out-of-range
  // attempt that should be a no-op).
  if (enemyAlive && (!state.combat_active || !char.turn_actions.action_used)) {
    if (livingEnemies.length === 1) {
      choices.push({
        label: `Attack the ${livingEnemies[0].name}`,
        action: { type: 'attack', targetEnemyId: livingEnemies[0].id },
        kind: 'attack',
      });
    } else {
      // Disambiguate when there are multiple enemies of (possibly) the same name
      const nameCounts = livingEnemies.reduce<Record<string, number>>((acc, e) => {
        acc[e.name] = (acc[e.name] ?? 0) + 1;
        return acc;
      }, {});
      const seen: Record<string, number> = {};
      for (const en of livingEnemies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const suffix =
          nameCounts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
        const ent = state.entities?.find((e) => e.id === en.id && e.isEnemy);
        const hpNote = ent ? ` (HP ${ent.hp}/${ent.maxHp})` : '';
        choices.push({
          label: `Attack ${en.name}${suffix}${hpNote}`,
          action: { type: 'attack', targetEnemyId: en.id },
          kind: 'attack',
        });
      }
    }
  }
  // Thrown splash weapons (Acid / Alchemist's Fire / Holy Water) — one choice
  // per held splash item × living enemy, gated like Attack (the Action).
  if (enemyAlive && (!state.combat_active || !char.turn_actions.action_used)) {
    const splashItems = (char.inventory ?? []).filter((i) => getItemData(i, context).splash);
    const seenSplash = new Set<string>();
    for (const item of splashItems) {
      if (seenSplash.has(item.id)) continue; // one entry per item type
      seenSplash.add(item.id);
      for (const en of livingEnemies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Throw ${item.name} at ${en.name}`,
          action: { type: 'throw_item', itemId: item.id, targetEnemyId: en.id },
          kind: 'attack',
        });
      }
    }
  }
  // Loot is suppressed while a hostile is in the room — RAW: you don't get
  // to casually pocket items with a Crypt Ghoul watching. Engage or escape
  // first. Mirrors the same author intent already enforced on Move-between-
  // rooms at the bottom of generateChoices. Each not-yet-taken item offers its
  // own "Pick up" choice; a positioned item is gated on the party marker being
  // adjacent (clicking its map token approaches first), while an item with no
  // `pos` (legacy) stays ungated.
  if (!enemyAlive) {
    for (const item of availableLootIn(state, seed, roomId)) {
      const adjacent = !item.pos || !state.marker_pos || chebyshev(state.marker_pos, item.pos) <= 1;
      if (!adjacent) continue;
      choices.push({
        label: `Pick up the ${item.name}`,
        action: { type: 'loot', lootKey: item.key },
      });
    }
  }
  // SRD 5.2.1: drinking/administering a potion is a Bonus Action. In
  // combat, suppress the choice if the bonus action is already spent.
  const potionBonusAvailable = !state.combat_active || !char.turn_actions.bonus_action_used;
  if (healItem && potionBonusAvailable && (!MAX_CHOICES || choices.length < MAX_CHOICES)) {
    const injured = state.characters.filter((c) => !c.dead && c.hp < c.max_hp);
    if (injured.length > 0) {
      if (state.characters.filter((c) => !c.dead).length === 1) {
        // Solo party: simple label, no target needed
        choices.push({
          label: `Use ${healItem.name} (bonus action)`,
          action: { type: 'use', itemId: healItem.id },
          requiresBonusAction: state.combat_active || undefined,
        });
      } else {
        // Multi-character: one choice per injured party member
        for (const member of injured) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const selfNote = member.id === char.id ? ' (self)' : '';
          choices.push({
            label: `Use ${healItem.name} on ${member.name}${selfNote} (bonus action, HP ${member.hp}/${member.max_hp})`,
            action: { type: 'use', itemId: healItem.id, targetCharId: member.id },
            requiresBonusAction: state.combat_active || undefined,
          });
        }
      }
    }
  }
  // Rest choices — only when no alive enemy in room and room allows it
  if (!state.combat_active && canRestInRoom(state, seed)) {
    const alreadyShortRested = (state.short_rested_rooms ?? []).includes(roomId);
    if (!alreadyShortRested && char.hit_dice_remaining > 0 && char.hp < char.max_hp) {
      choices.push({
        label: `Short Rest — spend a hit die (d${char.hit_die ?? 8}), ${char.hit_dice_remaining} remaining`,
        action: { type: 'short_rest' },
      });
    }
    if (!(state.long_rested ?? false)) {
      choices.push({
        label: 'Long Rest — full recovery (once per session)',
        action: { type: 'long_rest' },
      });
    }
  }
  // Spell-slot recovery (Wizard Arcane Recovery / Land Druid Natural Recovery) —
  // a player-chosen slot allocation (once per long rest), surfaced via the option
  // picker. Out of combat only; only when the feature is available + slots are
  // expended (so `enumerateRecoveryPlans` returns at least one plan).
  if (!state.combat_active && !enemyAlive) {
    for (const spec of availableRecoveries(char)) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const plans = enumerateRecoveryPlans(char, spec);
      if (plans.length === 0) continue;
      choices.push({
        label: `${featureLabel[spec.feature]} — recover up to ${spec.budget} slot-level(s)`,
        action: { type: 'recover_slots', recovery: spec.feature },
        pickOption: {
          param: 'plan',
          title: featureLabel[spec.feature],
          options: plans.map((p) => ({
            id: p.id,
            label: planLabel(p.levels),
            sub: `${planTotal(p.levels)} of ${spec.budget} levels · ${p.levels.length} slot(s)`,
          })),
        },
      });
    }
  }
  // Interactive object choices — once per object, collapsed into a single Interact action.
  // Out of combat: anyone can interact (consumes main action). In combat: blocked.
  const currentRoom = seed.rooms.find((r) => r.id === roomId);
  const canInteractObjects = currentRoom?.objects?.length && !enemyAlive;
  if (canInteractObjects && currentRoom?.objects) {
    const useBonus = false;
    for (const obj of currentRoom.objects) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const searchKey = `${roomId}:${obj.id}`;
      const alreadySearched = (state.objects_searched ?? []).includes(searchKey);
      // A positioned object renders as a map token; gate its Interact choice on
      // the party being adjacent (clicking the token approaches first). Objects
      // with no `pos` (legacy) stay ungated.
      const adjacent = !obj.pos || !state.marker_pos || chebyshev(state.marker_pos, obj.pos) <= 1;
      if (!alreadySearched && adjacent) {
        choices.push({
          label: useBonus
            ? `Fast Hands: Interact with ${obj.name} — bonus action`
            : `Interact with ${obj.name}`,
          action: { type: 'interact_object', objectId: obj.id },
          requiresBonusAction: useBonus || undefined,
        });
      }
    }
  }

  // NPC choices — a Talk + Attack per non-hostile, living NPC in the room (a
  // room may host several). Hostile NPCs surface as enemies via
  // getLivingRoomEnemies (and would set enemyAlive), so they use the regular
  // Attack choice instead; while any enemy is alive, social options are hidden.
  if (!enemyAlive) {
    const progressById = new Map((state.quest_progress ?? []).map((p) => [p.questId, p] as const));
    for (const npc of npcsInRoom(seed, roomId)) {
      if (npcIsKilled(state, npc.id)) continue;
      const attitude = getNpcAttitude(state, npc);
      if (attitude === 'hostile') continue;
      // A quest is "available here" only if it isn't already in progress AND this
      // NPC's dialogue actually offers it (so a world-activated follow-up quest
      // doesn't keep the [!] lit). `talk` opens conversation mode for this npc.
      const availableQuests = (context.campaign?.quests ?? [])
        .filter((q) => q.giverNpcId === npc.id)
        .filter((q) => !progressById.has(q.id) && npcDialogueOffersQuest(npc, q.id));
      const questNote = availableQuests.length > 0 ? ' [!]' : '';
      const dcNote = attitude === 'indifferent' ? ` (CHA check DC ${npc.persuasionDC ?? 12})` : '';
      choices.push({
        label: `Talk to ${npc.name}${dcNote}${questNote}`,
        action: { type: 'talk', npcId: npc.id },
      });
      choices.push({
        label: `Attack ${npc.name} (makes hostile)`,
        action: { type: 'attack_npc', npcId: npc.id },
      });
    }
  }

  // Parley — the third option next to Attack / Sneak when a hostile holds the
  // room: a hostile NPC WITH an authored dialogue tree can be talked to before
  // combat starts. Outcomes ride the dialogue's consequences (a stand-down is
  // set_npc_attitude off hostile, which drops them from the enemy list).
  // Bestiary monsters never parley — only authored NPCs can carry dialogue.
  if (enemyAlive && !state.combat_active) {
    for (const npc of npcsInRoom(seed, roomId)) {
      if (npcIsKilled(state, npc.id)) continue;
      if (getNpcAttitude(state, npc) !== 'hostile') continue;
      if ((npc.responses?.length ?? 0) === 0) continue;
      choices.push({
        label: `Parley with ${npc.name}`,
        action: { type: 'talk', npcId: npc.id },
      });
    }
  }

  // SRD Travel Pace — the overland stance dial, offered on the regional map
  // out of combat (one choice per pace the party is NOT already at). Each
  // click of travel spends up to an hour at the chosen speed; Fast/Slow also
  // swing passive Perception ∓5/+5 (the table's check effects).
  if (!state.combat_active && state.map_level === 'regional') {
    const currentPace = state.travel_pace ?? 'normal';
    const PACES: Array<['fast' | 'normal' | 'slow', string]> = [
      ['fast', 'Fast — 4 mi/hr, but the party spots less (Perception −5)'],
      ['normal', 'Normal — 3 mi/hr'],
      ['slow', 'Slow — 2 mi/hr, eyes sharp (Perception +5)'],
    ];
    for (const [pace, label] of PACES) {
      if (pace === currentPace) continue;
      choices.push({ label: `Set travel pace: ${label}`, action: { type: 'set_pace', pace } });
    }
  }

  // 3-level grid map model — travel is map-driven: the FE renders the active
  // grid (GridMapView) with every transition cell (region sites, town venues,
  // room exits / ascend) clickable + labelled, dispatching `marker_move` on
  // click. We no longer mirror those as redundant "Travel to / Enter / Leave"
  // text choices — the map IS the travel surface. (The `marker_move` action +
  // handler are unchanged; only the auto-generated duplicate choices are gone.)
  // ── Combat action economy choices ─────────────────────────────────────────
  if (state.combat_active && !char.turn_actions.action_used) {
    // Dash
    choices.push({
      label: `Dash — double movement this turn (${effectiveSpeed(char, context.lootTable)} extra ft)`,
      action: { type: 'dash' },
      kind: 'dash',
    });
    // Help — RAW (SRD): to grant advantage on an ally's attack, an enemy
    // must be within 5 ft of the helper. Without grid entities this gate can't
    // be enforced, so we conservatively only show the choice when the helper
    // has an adjacent enemy.
    const helperEnt = state.entities?.find((e) => e.id === char.id);
    const hasAdjacentEnemy =
      helperEnt &&
      state.entities?.some((e) => e.isEnemy && e.hp > 0 && distanceFeet(helperEnt.pos, e.pos) <= 5);
    if (hasAdjacentEnemy) {
      const aliveAllies = state.characters.filter((c) => !c.dead && c.id !== char.id);
      for (const ally of aliveAllies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Help ${ally.name} — give advantage on their next attack`,
          action: { type: 'help', targetId: ally.id },
        });
      }
    }
    // Ready
    if (enemyAlive) {
      choices.push({
        label: `Ready an action — set trigger and action to store`,
        action: {
          type: 'ready',
          trigger: 'enemy attacks',
          action: { type: 'attack', targetEnemyId: livingEnemies[0].id },
        },
        kind: 'ready',
      });
    }
  }

  // Use Reaction (trigger readied action) — shown when readied_action is set and reaction not yet used
  if (state.combat_active && canReact(char) && char.turn_actions.readied_action) {
    choices.push({
      label: `Trigger readied action: "${char.turn_actions.readied_action.trigger}"`,
      action: { type: 'use_reaction' },
    });
  }

  // ── SRD Haste extra-action menu ────────────────────────────────────────────
  // When a Hasted PC has spent their normal action but not the
  // Haste-granted extra, surface a restricted secondary menu (Attack /
  // Dash / Disengage / Hide). Each item wraps the inner action in a
  // `haste_extra_action` dispatch so the action_used gate is bypassed
  // and the extra slot is marked consumed.
  if (
    state.combat_active &&
    char.conditions.includes('hasted') &&
    char.turn_actions.action_used &&
    !char.turn_actions.haste_extra_action_used
  ) {
    if (enemyAlive) {
      // One Attack option per living enemy, mirroring the normal Attack
      // menu shape so the player can pick a specific target.
      if (livingEnemies.length === 1) {
        choices.push({
          label: `Haste extra: Attack the ${livingEnemies[0].name}`,
          action: {
            type: 'haste_extra_action',
            inner: { type: 'attack', targetEnemyId: livingEnemies[0].id },
          },
          kind: 'attack',
        });
      } else {
        for (const en of livingEnemies) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          choices.push({
            label: `Haste extra: Attack ${en.name}`,
            action: {
              type: 'haste_extra_action',
              inner: { type: 'attack', targetEnemyId: en.id },
            },
            kind: 'attack',
          });
        }
      }
    }
    choices.push({
      label: 'Haste extra: Dash — double movement',
      action: { type: 'haste_extra_action', inner: { type: 'dash' } },
      kind: 'dash',
    });
    choices.push({
      label: 'Haste extra: Disengage — no OAs this turn',
      action: { type: 'haste_extra_action', inner: { type: 'disengage' } },
    });
    choices.push({
      label: 'Haste extra: Hide — stealth check',
      action: { type: 'haste_extra_action', inner: { type: 'sneak' } },
    });
  }

  // ── Subclass ────────────────────────────────────────────────────────────────
  // No player choice: SRD 5.2.1 gives each class one subclass, auto-assigned at
  // level 3 by `applyLevelUpForClass` (see `applySubclass`). The `select_subclass`
  // action still exists for tests / explicit assignment, but it's not surfaced.

  // ── Fighting Style picks (Fighter L1/L7, Paladin/Ranger L2) ────────────────
  // RAW level-up choices, surfaced out of combat like subclass. (RE-2.)
  if (!state.combat_active) {
    const fsChosen = char.fighting_styles ?? [];
    if (fsChosen.length < fightingStyleSlots(char)) {
      for (const fs of OFFERED_FIGHTING_STYLE_IDS) {
        if (fsChosen.includes(fs)) continue;
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Choose Fighting Style: ${FIGHTING_STYLE_LABELS[fs]}`,
          action: { type: 'choose_fighting_style', style: fs },
        });
      }
    }
  }

  // ── Ranger Hunter feature-option picks (swappable on a rest) ───────────────
  // Generic picker over hunterFeatureOptions; offers the option(s) the Hunter
  // hasn't currently chosen. Hunter's Prey (L3) defaults to Colossus Slayer;
  // Defensive Tactics (L7) is unset until picked, so both are offered. (RE-2.)
  if (!state.combat_active && char.subclass === 'hunter' && hasClass(char, 'ranger')) {
    const rangerLvl = getClassLevel(char, 'ranger');
    for (const key of ['hunters_prey', 'defensive_tactics'] as const) {
      const def = hunterFeatureOptions[key];
      if (rangerLvl < def.level) continue;
      const current = key === 'hunters_prey' ? huntersPrey(char) : char.defensive_tactics;
      for (const option of def.options) {
        if (option === current) continue;
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `${def.feature}: ${def.labels[option]}`,
          action: { type: 'choose_hunter_option', feature: key, option },
        });
      }
    }
  }

  // ── Expertise picks (Rogue L1/L6, Bard L2/L9, Wizard Scholar L2) ───────────
  // Double proficiency in a chosen skill. RAW level-up choice, surfaced out of
  // combat like Fighting Style; offered per still-unchosen eligible skill while
  // a slot is open. Wizard's Scholar restricts the pool to knowledge skills via
  // `expertiseEligibleSkills`. (RE-2.)
  if (!state.combat_active) {
    const expChosen = char.expertise_skills ?? [];
    if (expChosen.length < expertiseSlots(char)) {
      const chosenLower = new Set(expChosen.map((s) => s.toLowerCase()));
      for (const skill of expertiseEligibleSkills(char)) {
        if (chosenLower.has(skill.toLowerCase())) continue;
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Choose Expertise: ${skill} (double proficiency)`,
          action: { type: 'choose_expertise', skill },
        });
      }
    }
  }

  // ── Cleric Divine Order (L1) — Protector / Thaumaturge ─────────────────────
  // One-time choice surfaced out of combat. Thaumaturge grants a concrete
  // extra Cleric cantrip (the first learnable one) plus the Arcana/Religion
  // bonus; RAW lets the player pick the cantrip — a dedicated pick is a
  // follow-up. (RE-2.)
  if (!state.combat_active && hasClass(char, 'cleric') && !char.divine_order) {
    choices.push({
      label: 'Divine Order: Protector (train with Martial weapons + Heavy armor)',
      action: { type: 'choose_divine_order', option: 'protector' },
    });
    const knownSet = new Set(char.spells_known ?? []);
    const extraCantrip = context.spellTable
      ? Object.values(context.spellTable).find(
          (s) =>
            s.level === 0 &&
            ((s as { spellList?: ReadonlyArray<string> }).spellList?.includes('divine') ?? false) &&
            !knownSet.has(s.id)
        )
      : undefined;
    choices.push({
      label: extraCantrip
        ? `Divine Order: Thaumaturge (learn ${extraCantrip.name}; +WIS to Arcana/Religion)`
        : 'Divine Order: Thaumaturge (+WIS to Arcana/Religion checks)',
      action: { type: 'choose_divine_order', option: 'thaumaturge', cantrip: extraCantrip?.id },
    });
  }

  // ── Cleric Blessed Strikes (L7) — Divine Strike / Potent Spellcasting ──────
  // One-time choice surfaced out of combat once the cleric reaches L7. (RE-2.)
  if (
    !state.combat_active &&
    hasClass(char, 'cleric') &&
    getClassLevel(char, 'cleric') >= 7 &&
    !char.blessed_strikes
  ) {
    choices.push({
      label: 'Blessed Strikes: Divine Strike (+1d8 radiant on a weapon hit, once/turn)',
      action: { type: 'choose_blessed_strikes', option: 'divine_strike' },
    });
    choices.push({
      label: 'Blessed Strikes: Potent Spellcasting (+WIS to Cleric cantrip damage)',
      action: { type: 'choose_blessed_strikes', option: 'potent_spellcasting' },
    });
  }

  // ── Wizard Spell Mastery (L18) + Signature Spells (L20) ────────────────────
  // One-time picks surfaced out of combat. Spell Mastery designates a L1 and a
  // L2 action spell for slot-free casting; Signature Spells designates two L3
  // spells for a free L3 cast each rest. Offered per still-open slot. (RE-2.)
  if (!state.combat_active && context.spellTable && getClassLevel(char, 'wizard') >= 18) {
    const known = char.spells_known ?? [];
    if (!char.spell_mastery_l1) {
      for (const id of known) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const s = context.spellTable[id];
        if (s?.level === 1 && s.castTime === 'action') {
          choices.push({
            label: `Spell Mastery (L1): master ${s.name} (cast at will, no slot)`,
            action: { type: 'choose_spell_mastery', tier: 1, spellId: id },
          });
        }
      }
    }
    if (!char.spell_mastery_l2) {
      for (const id of known) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const s = context.spellTable[id];
        if (s?.level === 2 && s.castTime === 'action') {
          choices.push({
            label: `Spell Mastery (L2): master ${s.name} (cast at will, no slot)`,
            action: { type: 'choose_spell_mastery', tier: 2, spellId: id },
          });
        }
      }
    }
    if (getClassLevel(char, 'wizard') >= 20 && (char.signature_spells ?? []).length < 2) {
      const sig = new Set(char.signature_spells ?? []);
      for (const id of known) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const s = context.spellTable[id];
        if (s?.level === 3 && !sig.has(id)) {
          choices.push({
            label: `Signature Spell: ${s.name} (free L3 cast each rest)`,
            action: { type: 'choose_signature_spell', spellId: id },
          });
        }
      }
    }
  }

  // ── Evoker Evocation Savant (L3) ───────────────────────────────────────────
  // Add free Wizard Evocation spells to the spellbook, up to the earned budget
  // (2 at L3 + 1 per new slot level). Offered out of combat. (RE-2.)
  if (
    !state.combat_active &&
    context.spellTable &&
    char.subclass === 'evoker' &&
    getClassLevel(char, 'wizard') >= 3 &&
    (char.class_resource_uses?.evocation_savant_claimed ?? 0) < evocationSavantBudget(char)
  ) {
    const maxSlot = Math.max(0, ...Object.keys(char.spell_slots_max ?? {}).map(Number));
    const known = new Set(char.spells_known ?? []);
    for (const s of Object.values(context.spellTable)) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      if (s.level < 1 || s.level > maxSlot || known.has(s.id) || !isEvocationSpell(s)) continue;
      if (!((s as { spellList?: ReadonlyArray<string> }).spellList?.includes('arcane') ?? false)) {
        continue;
      }
      choices.push({
        label: `Evocation Savant: learn ${s.name} (Lvl ${s.level}, free)`,
        action: { type: 'choose_evocation_savant', spellId: s.id },
      });
    }
  }

  // ── Fiend Warlock Fiendish Resilience (L10) ────────────────────────────────
  // Choose a damage type (not Force) to resist; re-chooseable out of combat.
  if (!state.combat_active && char.subclass === 'fiend' && getClassLevel(char, 'warlock') >= 10) {
    for (const dt of [
      'acid',
      'cold',
      'fire',
      'lightning',
      'necrotic',
      'poison',
      'psychic',
      'thunder',
    ]) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      if (char.fiendish_resilience === dt) continue;
      choices.push({
        label: `Fiendish Resilience: resist ${dt} damage`,
        action: { type: 'choose_fiendish_resilience', damageType: dt },
      });
    }
  }

  // ── Warlock Mystic Arcanum (L11/13/15/17) ──────────────────────────────────
  // Pick a L6-9 spell as the arcanum for each tier the warlock qualifies for
  // (out of combat), and cast a chosen arcanum once per long rest with no slot.
  if (context.spellTable && getClassLevel(char, 'warlock') >= 11) {
    const wlLevel = getClassLevel(char, 'warlock');
    const tierGate: Record<number, number> = { 6: 11, 7: 13, 8: 15, 9: 17 };
    // Pick surface (out of combat) — offer eligible spells for unfilled tiers.
    if (!state.combat_active) {
      for (const s of Object.values(context.spellTable)) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        if (s.level < 6 || s.level > 9) continue;
        if (wlLevel < (tierGate[s.level] ?? 99)) continue;
        if (char.mystic_arcanum?.[s.level] === s.id) continue;
        choices.push({
          label: `Mystic Arcanum (Lvl ${s.level}): designate ${s.name}`,
          action: { type: 'choose_mystic_arcanum', spellId: s.id },
        });
      }
    }
    // Cast surface — each chosen arcanum not yet spent this long rest.
    for (const [lvlStr, spellId] of Object.entries(char.mystic_arcanum ?? {})) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const lvl = Number(lvlStr);
      if (wlLevel < (tierGate[lvl] ?? 99)) continue;
      if ((char.class_resource_uses?.[`mystic_arcanum_${lvl}`] ?? 0) > 0) continue;
      const s = context.spellTable[spellId];
      if (!s) continue;
      const isOffensive = !!(s.damage || s.condition) || s.id === 'true_strike';
      if (isOffensive && !enemyAlive) continue;
      choices.push({
        label: `Mystic Arcanum — cast ${s.name} (Lvl ${lvl}, no slot)`,
        action: {
          type: 'cast_spell',
          spellId,
          slotLevel: lvl,
          targetEnemyId: isOffensive ? livingEnemies[0]?.id : undefined,
          mysticArcanum: true,
        },
        kind: 'cast_spell',
      });
    }
  }

  // ── Wizard Memorize Spell (L5) — short-rest prepared-spell swap ────────────
  // Replace one prepared level-1+ spell with another from the spellbook. Only
  // surfaces when the wizard has prepared spells AND unprepared known spells to
  // swap between (MAX_CHOICES caps the swap matrix). (RE-2.)
  if (!state.combat_active && context.spellTable && getClassLevel(char, 'wizard') >= 5) {
    const preparedSet = new Set(char.prepared_spells ?? []);
    const preparedLeveled = (char.prepared_spells ?? []).filter(
      (id) => (context.spellTable![id]?.level ?? 0) >= 1
    );
    const knownUnprepared = (char.spells_known ?? []).filter(
      (id) => (context.spellTable![id]?.level ?? 0) >= 1 && !preparedSet.has(id)
    );
    for (const out of preparedLeveled) {
      for (const inId of knownUnprepared) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Memorize Spell: swap ${context.spellTable[out]!.name} → ${context.spellTable[inId]!.name}`,
          action: { type: 'memorize_spell', swapOut: out, swapIn: inId },
        });
      }
    }
  }

  // ── Paladin Lay on Hands (L1) — bonus-action touch heal from the pool ──────
  // Works in combat (bonus action) and out of combat. One choice per injured
  // party member (including self). (RE-2.)
  {
    const lohPool = layOnHandsRemaining(char);
    const lohReady = lohPool > 0 && (!state.combat_active || !char.turn_actions.bonus_action_used);
    if (lohReady) {
      for (const member of state.characters) {
        if (member.dead || member.hp >= member.max_hp) continue;
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const selfTag = member.id === char.id ? ' (self)' : '';
        choices.push({
          label: `Lay on Hands${selfTag} → ${member.name} (${lohPool} HP in pool)`,
          action: { type: 'lay_on_hands', targetCharId: member.id },
          kind: 'class_feature',
          requiresBonusAction: state.combat_active || undefined,
        });
      }
      // SRD poison-cure: a flat 5 points ends Poisoned (no HP restored) — one
      // choice per Poisoned member, only when the pool can pay the flat cost.
      if (lohPool >= 5) {
        for (const member of state.characters) {
          if (member.dead || !(member.conditions ?? []).includes('poisoned')) continue;
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const selfTag = member.id === char.id ? ' (self)' : '';
          choices.push({
            label: `Lay on Hands — cure poison${selfTag} → ${member.name} (5 HP from pool)`,
            action: { type: 'lay_on_hands', targetCharId: member.id, cure: true },
            kind: 'class_feature',
            requiresBonusAction: state.combat_active || undefined,
          });
        }
      }
    }
  }

  // ── Prepare spells (out of combat, prep-class only) ────────────────────────
  if (!state.combat_active) {
    const prepClasses = ['cleric', 'paladin', 'druid', 'wizard'];
    if (prepClasses.some((c) => hasClass(char, c)) && (char.spells_known ?? []).length > 0) {
      const cap = preparedSpellsCap(char, context);
      // Cantrips are always known, not prepared (SRD) — exclude
      // them from the auto-prep list and from the cap math so the
      // player doesn't burn a prep slot on Sacred Flame.
      const known = (char.spells_known ?? []).filter(
        (id) => (context.spellTable?.[id]?.level ?? 0) > 0
      );
      // Clamp to the cap so the action always succeeds — picking which N
      // is a future UX, but auto-prep of the first N is far better than
      // a choice that always errors out.
      choices.push({
        label: `Prepare spells — ${Math.min(known.length, cap)} of ${known.length} known (max ${cap})`,
        action: { type: 'prepare_spells', spellIds: known.slice(0, cap) },
      });
    }
  }

  // Class feature bonus actions — shown only during combat while bonus action is still available
  if (state.combat_active && !char.turn_actions.bonus_action_used) {
    // RAW player-command for summoned creatures (Animate Dead, etc.): direct
    // one of your summons to attack a chosen enemy as a bonus action. The
    // summon otherwise fights on its AI-default (nearest enemy). Sets a
    // commanded target the ally-turn AI honors while that enemy lives.
    // (RE-1 Phase 4.5.)
    const ownedSummons = (state.entities ?? []).filter(
      (e) => e.summoned_by === char.id && entitySide(e) === 'ally' && e.hp > 0
    );
    if (ownedSummons.length > 0) {
      const cmdFoes = (state.entities ?? []).filter(
        (e) => entitySide(e) === 'enemy' && e.hp > 0 && !state.enemies_killed.includes(e.id)
      );
      const foeNameCounts: Record<string, number> = {};
      for (const f of cmdFoes) {
        const n = getEnemyById(seed, f.id)?.name ?? 'Enemy';
        foeNameCounts[n] = (foeNameCounts[n] ?? 0) + 1;
      }
      for (const sm of ownedSummons) {
        const smName = sm.companionName ?? 'Summon';
        const seenFoe: Record<string, number> = {};
        for (const foe of cmdFoes) {
          const fName = getEnemyById(seed, foe.id)?.name ?? 'Enemy';
          const suffix =
            foeNameCounts[fName] > 1 ? ` #${(seenFoe[fName] = (seenFoe[fName] ?? 0) + 1)}` : '';
          choices.push({
            label: `Command ${smName} to attack ${fName}${suffix} (bonus action)`,
            action: { type: 'command_summon', summonId: sm.id, targetEnemyId: foe.id },
            requiresBonusAction: true,
          });
        }
      }
    }

    const features = context.classFeatures?.[char.character_class] ?? [];
    if (features.includes('rage') && !char.conditions.includes('raging')) {
      const rageUses =
        char.class_resource_uses?.rage_uses ?? rageUsesMax(getClassLevel(char, 'barbarian'));
      if (rageUses > 0) {
        choices.push({
          label: `Rage — bonus action (${rageUses} use${rageUses === 1 ? '' : 's'} left)`,
          action: { type: 'use_class_feature', featureId: 'rage' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // SRD Paladin Holy Nimbus (Oath of Devotion L20) — bonus action, 1/long
    // rest: imbue the aura so enemies starting their turn in it take Radiant
    // damage (CHA + prof). (Holy Ward's save advantage vs Fiends/Undead is
    // narrated but not yet wired — the save sites don't carry attacker type.)
    if (
      char.subclass === 'devotion' &&
      getClassLevel(char, 'paladin') >= 20 &&
      !char.conditions.includes('holy_nimbus') &&
      !(char.class_resource_uses?.holy_nimbus_used ?? 0) &&
      !char.turn_actions.bonus_action_used
    ) {
      choices.push({
        label: 'Holy Nimbus — bonus action: radiant aura, 1/long rest',
        action: { type: 'use_class_feature', featureId: 'holy_nimbus' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // SRD Berserker Intimidating Presence (L14) — bonus action: a 30-ft WIS-save
    // fear, 1/long rest or by expending a Rage use.
    if (
      char.subclass === 'berserker' &&
      getClassLevel(char, 'barbarian') >= 14 &&
      !char.turn_actions.bonus_action_used &&
      ((char.class_resource_uses?.intimidating_presence_used ?? 0) === 0 ||
        (char.class_resource_uses?.rage_uses ?? rageUsesMax(getClassLevel(char, 'barbarian'))) > 0)
    ) {
      choices.push({
        label: 'Intimidating Presence — bonus action: 30-ft fear (WIS save)',
        action: { type: 'use_class_feature', featureId: 'intimidating_presence' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // Path of the Berserker — Frenzy (SRD): while raging, make a
    // single melee weapon attack as a bonus action each turn. RAW also
    // imposes exhaustion when the rage ends; deferred to keep MVP scope.
    if (
      char.subclass === 'berserker' &&
      hasClass(char, 'barbarian') &&
      char.conditions.includes('raging') &&
      enemyAlive
    ) {
      choices.push({
        label: `Frenzy — bonus melee attack (Berserker)`,
        action: { type: 'use_class_feature', featureId: 'frenzy_attack' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // Fighter L9 — Tactical Master (SRD). Pre-arm a mastery swap so the
    // next attack uses Push/Sap/Slow regardless of the weapon's actual
    // mastery. Available once per attack; cleared when the attack resolves.
    if (
      hasClass(char, 'fighter') &&
      getClassLevel(char, 'fighter') >= 9 &&
      state.combat_active &&
      !char.turn_actions.tactical_master_mastery &&
      enemyAlive
    ) {
      for (const m of ['push', 'sap', 'slow'] as const) {
        choices.push({
          label: `Tactical Master — swap next attack's mastery to ${m.toUpperCase()}`,
          action: { type: 'use_class_feature', featureId: `tactical_master_${m}` },
          kind: 'class_feature',
        });
      }
    }

    // SRD Dragonborn — Breath Weapon. Action; 15-ft cone; DEX save
    // for half. Damage scales with level (1d10/2d10/3d10/4d10 at L1/5/11/17).
    // 1/short rest, tracked via class_resource_uses.breath_weapon_used.
    if (
      char.species === 'dragonborn' &&
      state.combat_active &&
      enemyAlive &&
      !char.class_resource_uses?.breath_weapon_used
    ) {
      const breathDice = char.level >= 17 ? 4 : char.level >= 11 ? 3 : char.level >= 5 ? 2 : 1;
      choices.push({
        label: `Breath Weapon — 15-ft cone, ${breathDice}d10 fire, DEX save (1/short rest)`,
        action: { type: 'use_class_feature', featureId: 'breath_weapon' },
        kind: 'class_feature',
      });
    }

    // SRD Goliath — Large Form. Bonus action; become Large for ~10
    // rounds (1 min RAW), +10 ft speed and advantage on STR ability checks
    // while active. 1/short rest. Tracked via `large_form` condition.
    if (
      char.species === 'goliath' &&
      state.combat_active &&
      !char.class_resource_uses?.large_form_used &&
      !char.conditions.includes('large_form') &&
      !char.turn_actions.bonus_action_used
    ) {
      choices.push({
        label: 'Large Form — become Large for 10 rounds: +10 ft speed, adv on STR (1/short rest)',
        action: { type: 'use_class_feature', featureId: 'large_form' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // SRD Orc — Adrenaline Rush. Bonus action: take the Dash action
    // (refund full speed worth of movement) and gain temp HP equal to your
    // proficiency bonus. 1/short rest.
    if (
      char.species === 'orc' &&
      state.combat_active &&
      !char.class_resource_uses?.adrenaline_rush_used &&
      !char.turn_actions.bonus_action_used
    ) {
      const tempHpGrant = profBonus(char.level);
      choices.push({
        label: `Adrenaline Rush — bonus action Dash + ${tempHpGrant} temp HP (1/short rest)`,
        action: { type: 'use_class_feature', featureId: 'adrenaline_rush' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // Fighter: Second Wind (bonus action). SRD has multi-use scaling:
    // 2 uses at L1, 3 at L4, 4 at L10. All recover on a short or long rest.
    if (hasClass(char, 'fighter')) {
      const fighterLvl = getClassLevel(char, 'fighter');
      const secondWindMax = fighterLvl >= 10 ? 4 : fighterLvl >= 4 ? 3 : 2;
      const secondWindUsed = char.class_resource_uses?.second_wind ?? 0;
      const secondWindLeft = secondWindMax - secondWindUsed;
      if (secondWindLeft > 0) {
        choices.push({
          label: `Second Wind — bonus action: heal 1d10+${fighterLvl} HP (${secondWindLeft}/${secondWindMax} left)`,
          action: { type: 'use_class_feature', featureId: 'second_wind' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // Rogue L2+: Cunning Action (bonus action options)
    if (hasClass(char, 'rogue') && getClassLevel(char, 'rogue') >= 2) {
      choices.push({
        label: 'Cunning Action: Dash — extra movement as bonus action',
        action: { type: 'use_class_feature', featureId: 'cunning_action_dash' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
      choices.push({
        label: 'Cunning Action: Disengage — no OA this turn as bonus action',
        action: { type: 'use_class_feature', featureId: 'cunning_action_disengage' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
      // SRD Hide [Action] prerequisite — only offer Hide when the rogue is
      // Heavily Obscured or behind heavy cover and out of enemy line of sight.
      if (canAttemptHide(char, state, seed).allowed) {
        choices.push({
          label: 'Cunning Action: Hide — DC 15 Stealth check as bonus action',
          action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // SRD Rogue L3+: Steady Aim — bonus action for advantage on the next
    // attack, only if you haven't moved this turn (and your Speed drops to 0).
    if (
      hasClass(char, 'rogue') &&
      getClassLevel(char, 'rogue') >= 3 &&
      (state.movement_used?.[char.id] ?? 0) === 0
    ) {
      choices.push({
        label: 'Steady Aim — advantage on your next attack (Speed 0 this turn)',
        action: { type: 'use_class_feature', featureId: 'steady_aim' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // SRD Rogue L5+: Cunning Strike. Pre-commit an effect that fires
    // on the next Sneak Attack hit. Each effect costs 1 SA die (subtracted
    // from the SA damage roll). Setting a Cunning Strike is free — no
    // action cost.
    if (
      hasClass(char, 'rogue') &&
      getClassLevel(char, 'rogue') >= 5 &&
      !char.turn_actions.action_used &&
      !char.turn_actions.cunning_strike_pending &&
      enemyAlive
    ) {
      choices.push({
        label: 'Cunning Strike: Trip — DEX save or prone on Sneak Attack (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_trip' },
        kind: 'class_feature',
      });
      choices.push({
        label: 'Cunning Strike: Poison — CON save or poisoned on Sneak Attack (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_poison' },
        kind: 'class_feature',
      });
      choices.push({
        label: 'Cunning Strike: Withdraw — move half speed without OAs on hit (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_withdraw' },
        kind: 'class_feature',
      });
      choices.push({
        label: 'Cunning Strike: Disarm — drop target damage by ~2 on Sneak Attack (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_disarm' },
        kind: 'class_feature',
      });
      // SRD Devious Strikes (L14): Daze / Knock Out / Obscure.
      if (getClassLevel(char, 'rogue') >= 14) {
        choices.push({
          label: 'Cunning Strike: Daze — CON save or dazed next turn (2 SA dice)',
          action: { type: 'use_class_feature', featureId: 'cunning_strike_daze' },
          kind: 'class_feature',
        });
        choices.push({
          label: 'Cunning Strike: Knock Out — CON save or unconscious (6 SA dice)',
          action: { type: 'use_class_feature', featureId: 'cunning_strike_knock_out' },
          kind: 'class_feature',
        });
        choices.push({
          label: 'Cunning Strike: Obscure — the target is blinded (3 SA dice)',
          action: { type: 'use_class_feature', featureId: 'cunning_strike_obscure' },
          kind: 'class_feature',
        });
      }
      // SRD Supreme Sneak (Thief L9): Stealth Attack — keep your Hide.
      if (char.subclass === 'thief' && getClassLevel(char, 'rogue') >= 9) {
        choices.push({
          label: 'Cunning Strike: Stealth Attack — stay hidden after the strike (1 SA die)',
          action: { type: 'use_class_feature', featureId: 'cunning_strike_stealth_attack' },
          kind: 'class_feature',
        });
      }
    }

    // SRD Fiend Warlock Hurl Through Hell (L14) — once/turn after a hit.
    if (
      char.subclass === 'fiend' &&
      getClassLevel(char, 'warlock') >= 14 &&
      enemyAlive &&
      !char.turn_actions.hurl_through_hell_used
    ) {
      choices.push({
        label: 'Hurl Through Hell — after a hit: CHA save or 8d10 psychic + Incapacitated (1/turn)',
        action: { type: 'use_class_feature', featureId: 'hurl_through_hell' },
        kind: 'class_feature',
      });
    }

    // SRD Warlock Magical Cunning (L2) — bonus action: regain expended Pact
    // Magic slots (half, or all at L20 Eldritch Master), 1/long rest.
    if (
      hasClass(char, 'warlock') &&
      getClassLevel(char, 'warlock') >= 2 &&
      !char.turn_actions.bonus_action_used &&
      !(char.class_resource_uses?.magical_cunning_used ?? 0) &&
      Object.values(char.spell_slots_used ?? {}).reduce((a, b) => a + b, 0) > 0
    ) {
      choices.push({
        label: 'Magical Cunning — bonus action: regain expended Pact Magic slots (1/long rest)',
        action: { type: 'use_class_feature', featureId: 'magical_cunning' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // Bard: Bardic Inspiration (bonus action)
    if (hasClass(char, 'bard')) {
      const biUses =
        char.class_resource_uses?.bardic_inspiration ??
        Math.max(1, Math.floor(((char.cha ?? 10) - 10) / 2));
      const bardLvl = getClassLevel(char, 'bard');
      const inspDie = bardLvl >= 15 ? 'd12' : bardLvl >= 10 ? 'd10' : bardLvl >= 5 ? 'd8' : 'd6';
      if (biUses > 0) {
        choices.push({
          label: `Bardic Inspiration — give ally a ${inspDie} die (${biUses} left)`,
          action: { type: 'use_class_feature', featureId: 'bardic_inspiration' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }
  }

  // Fighter: Action Surge — shown in combat when not yet used
  if (
    state.combat_active &&
    hasClass(char, 'fighter') &&
    getClassLevel(char, 'fighter') >= 2 &&
    !char.class_resource_uses?.action_surge
  ) {
    choices.push({
      label: `Action Surge — gain one extra action this turn`,
      action: { type: 'use_class_feature', featureId: 'action_surge' },
      kind: 'class_feature',
    });
  }

  // Barbarian: Reckless Attack (SRD) — RAW costs nothing; it's a free
  // declaration made before the first attack on your turn. Advantage on STR
  // melee, but enemies have advantage attacking you until your next turn.
  // Must be available regardless of bonus-action state.
  if (
    state.combat_active &&
    hasClass(char, 'barbarian') &&
    getClassLevel(char, 'barbarian') >= 2 &&
    !char.turn_actions.reckless &&
    !char.turn_actions.action_used
  ) {
    choices.push({
      label:
        'Reckless Attack — advantage on STR melee this turn (enemies get advantage vs you too)',
      action: { type: 'use_class_feature', featureId: 'reckless_attack' },
      kind: 'class_feature',
    });
  }

  // ── Barbarian Brutal Strike (L9): pre-commit a rider while Reckless ──────────
  if (
    state.combat_active &&
    hasClass(char, 'barbarian') &&
    getClassLevel(char, 'barbarian') >= 9 &&
    char.turn_actions.reckless &&
    !char.turn_actions.brutal_strike_pending &&
    !char.turn_actions.action_used
  ) {
    choices.push({
      label:
        'Brutal Strike: Forceful Blow — forgo advantage; on hit +1d10 and push 15 ft, then close in',
      action: { type: 'use_class_feature', featureId: 'brutal_strike_forceful' },
      kind: 'class_feature',
    });
    choices.push({
      label: 'Brutal Strike: Hamstring Blow — forgo advantage; on hit +1d10 and −15 ft Speed',
      action: { type: 'use_class_feature', featureId: 'brutal_strike_hamstring' },
      kind: 'class_feature',
    });
  }

  // ── Monk choices ────────────────────────────────────────────────────────────
  // SRD renames Ki Points to Discipline Points; the internal storage
  // key stays `ki_points` so existing tests + state continue to work, but
  // UI labels say "DP" so the player sees 2024 terminology.
  if (hasClass(char, 'monk')) {
    const monkLvl = getClassLevel(char, 'monk');
    const kiLeft = char.class_resource_uses?.ki_points ?? monkLvl;
    const monkFreeAvailable = monkLvl >= 2 && !char.turn_actions.monk_free_used;
    if (state.combat_active && monkLvl >= 2) {
      if (kiLeft > 0 && char.turn_actions.action_used && !char.turn_actions.bonus_action_used) {
        choices.push({
          label: `Flurry of Blows — 2 unarmed strikes (1 DP, ${kiLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
      if (!char.turn_actions.bonus_action_used) {
        // Patient Defense (2024) — Dodge as bonus action. Free 1/turn at
        // L2+, or spend 1 DP for the free option + advantage on the next
        // DEX save before your next turn.
        if (monkFreeAvailable) {
          choices.push({
            label: 'Patient Defense — Dodge (free, 1/turn)',
            action: { type: 'use_class_feature', featureId: 'patient_defense_free' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
          // Step of the Wind: pick one effect for free.
          choices.push({
            label: 'Step of the Wind: Dash (free, 1/turn)',
            action: { type: 'use_class_feature', featureId: 'step_of_wind_free_dash' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
          choices.push({
            label: 'Step of the Wind: Disengage (free, 1/turn)',
            action: { type: 'use_class_feature', featureId: 'step_of_wind_free_disengage' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
        }
        if (kiLeft > 0) {
          choices.push({
            label: `Patient Defense (1 DP) — Dodge + advantage on next DEX save (${kiLeft} left)`,
            action: { type: 'use_class_feature', featureId: 'patient_defense_dp' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
          // Step of the Wind for 1 DP — Dash AND Disengage (both effects).
          choices.push({
            label: `Step of the Wind (1 DP) — Dash + Disengage (${kiLeft} left)`,
            action: { type: 'use_class_feature', featureId: 'step_of_wind_dash' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
        }
      }
      if (
        state.combat_active &&
        monkLvl >= 5 &&
        enemyAlive &&
        kiLeft > 0 &&
        !char.turn_actions.monk_stunning_strike_used
      ) {
        choices.push({
          label: `Stunning Strike — once/turn after a hit, CON save DC ${8 + profBonus(char.level) + abilityMod(char.wis ?? 10)} (1 DP, ${kiLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'stunning_strike' },
          kind: 'class_feature',
        });
      }
      // Superior Defense (L18): spend 3 DP for Resistance to all but force.
      if (monkLvl >= 18 && kiLeft >= 3 && !char.conditions.includes('superior_defense')) {
        choices.push({
          label: `Superior Defense — Resistance to all damage but force this combat (3 DP, ${kiLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'superior_defense' },
          kind: 'class_feature',
        });
      }
      // Open Hand Fleet Step (L11): a free Step of the Wind after a bonus action.
      if (
        char.subclass === 'open_hand' &&
        monkLvl >= 11 &&
        char.turn_actions.bonus_action_used &&
        !char.turn_actions.fleet_step_used
      ) {
        choices.push({
          label: 'Fleet Step — free Step of the Wind (Dash + Disengage)',
          action: { type: 'use_class_feature', featureId: 'fleet_step_dash' },
          kind: 'class_feature',
        });
      }
      // Open Hand Quivering Palm (L17): set lethal vibrations after an unarmed hit.
      if (char.subclass === 'open_hand' && monkLvl >= 17 && enemyAlive && kiLeft >= 4) {
        choices.push({
          label: `Quivering Palm — set lethal vibrations after an unarmed hit (4 Focus, ${kiLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'quivering_palm' },
          kind: 'class_feature',
        });
      }
      // Open Hand Quivering Palm — detonate the marked creature (an action).
      if (
        char.subclass === 'open_hand' &&
        monkLvl >= 17 &&
        char.quivering_palm_target &&
        !char.turn_actions.action_used
      ) {
        choices.push({
          label: 'Quivering Palm — detonate (action): 10d12 force, CON save for half',
          action: { type: 'use_class_feature', featureId: 'quivering_palm_detonate' },
          kind: 'class_feature',
        });
      }
    }
    // SRD Warrior of the Open Hand Wholeness of Body (L6): bonus-action
    // self-heal, WIS-mod uses per long rest. Usable in and out of combat
    // (a heal), so it lives outside the combat-only block above.
    if (
      char.subclass === 'open_hand' &&
      monkLvl >= 6 &&
      char.hp < char.max_hp &&
      !char.turn_actions.bonus_action_used
    ) {
      const wobMax = Math.max(1, abilityMod(char.wis));
      const wobLeft = wobMax - (char.class_resource_uses?.wholeness_of_body_used ?? 0);
      if (wobLeft > 0) {
        choices.push({
          label: `Wholeness of Body — heal (bonus action, ${wobLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'wholeness_of_body' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }
  }

  // ── Druid: Wild Shape ───────────────────────────────────────────────────────
  if (hasClass(char, 'druid')) {
    const wsUses = char.class_resource_uses?.wild_shape ?? 2;
    // Circle of the Moon (SRD) — Combat Wild Shape: use as a bonus
    const wsAvailable =
      !char.conditions.includes('wild_shaped') &&
      wsUses > 0 &&
      (!state.combat_active || !char.turn_actions.action_used);
    if (wsAvailable) {
      // SRD Beast Forms — surface one choice per accessible form. The
      // form's stat block replaces the druid's attack while shifted (see
      // BEAST_FORMS in contexts/srd/beast_forms.ts).
      // Wild Shape CR access scales with Druid level only.
      const forms = availableBeastForms(getClassLevel(char, 'druid'));
      for (const form of forms) {
        choices.push({
          label: `Wild Shape: ${form.name} (CR ${form.cr}) — ${form.descriptor}`,
          action: { type: 'use_class_feature', featureId: `wild_shape_${form.id}` },
          kind: 'class_feature',
        });
      }
    }
    if (char.conditions.includes('wild_shaped')) {
      choices.push({
        label: `Dismiss Wild Shape — return to normal form`,
        action: { type: 'use_class_feature', featureId: 'dismiss_wild_shape' },
        kind: 'class_feature',
      });
    }
  }

  // ── Sorcerer: Innate Sorcery (L1) ───────────────────────────────────────────
  if (
    state.combat_active &&
    hasClass(char, 'sorcerer') &&
    !char.turn_actions.bonus_action_used &&
    !char.conditions.includes('innate_sorcery') &&
    (char.class_resource_uses?.innate_sorcery_used ?? 0) < 2
  ) {
    const isLeft = 2 - (char.class_resource_uses?.innate_sorcery_used ?? 0);
    choices.push({
      label: `Innate Sorcery — +1 spell DC + Advantage on spell attacks (bonus action, ${isLeft} left)`,
      action: { type: 'use_class_feature', featureId: 'innate_sorcery' },
      kind: 'class_feature',
      requiresBonusAction: true,
    });
  }

  // ── Draconic Sorcery: Dragon Wings (L14) ────────────────────────────────────
  if (
    char.subclass === 'draconic' &&
    getClassLevel(char, 'sorcerer') >= 14 &&
    !char.turn_actions.bonus_action_used &&
    !char.fly_speed_ft
  ) {
    const dwUsed = char.class_resource_uses?.dragon_wings_used ?? 0;
    const dwSp = char.class_resource_uses?.sorcery_points ?? getClassLevel(char, 'sorcerer');
    if (dwUsed < 1 || dwSp >= 3) {
      choices.push({
        label:
          dwUsed < 1
            ? 'Dragon Wings — Fly Speed 60 ft (bonus action, 1/long rest)'
            : `Dragon Wings — Fly Speed 60 ft (bonus action, 3 SP, ${dwSp} left)`,
        action: { type: 'use_class_feature', featureId: 'dragon_wings' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }
  }

  // ── Draconic Sorcery: Elemental Affinity (L6) ───────────────────────────────
  if (
    !state.combat_active &&
    char.subclass === 'draconic' &&
    getClassLevel(char, 'sorcerer') >= 6 &&
    !char.elemental_affinity
  ) {
    for (const t of ['acid', 'cold', 'fire', 'lightning', 'poison'] as const) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      choices.push({
        label: `Elemental Affinity: ${t} (resistance + CHA to ${t} spell damage)`,
        action: { type: 'choose_elemental_affinity', damageType: t },
      });
    }
  }

  // ── Sorcerer: Metamagic ─────────────────────────────────────────────────────
  if (hasClass(char, 'sorcerer')) {
    const sorcLvl = getClassLevel(char, 'sorcerer');
    const spLeft = char.class_resource_uses?.sorcery_points ?? sorcLvl;
    const metamagicUseLabels: Record<string, string> = {
      careful: 'Careful Spell — allies in the area auto-succeed their save',
      distant: "Distant Spell — double the next spell's range",
      empowered: `Empowered Spell — reroll up to ${Math.max(1, abilityMod(char.cha ?? 10))} damage dice`,
      extended: 'Extended Spell — double concentration duration',
      heightened: 'Heightened Spell — one target has Disadvantage on its save',
      quickened: 'Quickened Spell — cast as a bonus action',
      seeking: 'Seeking Spell — reroll a missed spell attack',
      subtle: 'Subtle Spell — no verbal/somatic components',
      transmuted: "Transmuted Spell — change the spell's damage type",
      twinned: 'Twinned Spell — also strike a second creature',
    };
    // USE: offer each KNOWN, affordable Metamagic option.
    for (const [id, def] of Object.entries(metamagicOptions)) {
      if (!knowsMetamagic(char, id) || spLeft < def.cost) continue;
      if (id === 'quickened' && char.turn_actions.bonus_action_used) continue;
      choices.push({
        label: `Metamagic: ${metamagicUseLabels[id] ?? def.label} (${def.cost} SP, ${spLeft} left)`,
        action: { type: 'use_class_feature', featureId: `metamagic_${id}` },
        kind: 'class_feature',
      });
    }
    // LEARN: pick a new Metamagic option out of combat while a slot is open.
    if (!state.combat_active && (char.metamagics_known?.length ?? 0) < metamagicSlots(char)) {
      for (const [id, def] of Object.entries(metamagicOptions)) {
        if (knowsMetamagic(char, id)) continue;
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Learn Metamagic: ${def.label}`,
          action: { type: 'choose_metamagic', option: id },
        });
      }
    }
  }

  // ── Warlock: Invocations ─────────────────────────────────────────────────────
  // RAW (SRD): invocations are learned at level-up, not chosen mid-fight.
  // Gate to out-of-combat so this surfaces as a downtime/level-up decision.
  if (!state.combat_active && hasClass(char, 'warlock') && getClassLevel(char, 'warlock') >= 2) {
    if (!(char.feats ?? []).includes('agonizing_blast'))
      choices.push({
        label: `Learn Invocation: Agonizing Blast — +CHA to Eldritch Blast`,
        action: { type: 'use_class_feature', featureId: 'agonizing_blast' },
        kind: 'class_feature',
      });
    if (!(char.feats ?? []).includes('devils_sight'))
      choices.push({
        label: `Learn Invocation: Devil's Sight — see in magical darkness`,
        action: { type: 'use_class_feature', featureId: 'devils_sight' },
        kind: 'class_feature',
      });
  }

  // ── Subclass active features ────────────────────────────────────────────────
  if (state.combat_active && enemyAlive && char.subclass) {
    const cdLeft = char.class_resource_uses?.channel_divinity ?? 1;

    // Lore Bard: Cutting Words (reaction, costs Bardic Inspiration)
    if (char.subclass === 'lore' && hasClass(char, 'bard') && canReact(char)) {
      const biLeft2 = char.class_resource_uses?.bardic_inspiration ?? abilityMod(char.cha ?? 10);
      if (biLeft2 > 0)
        choices.push({
          label: `Cutting Words — subtract Inspiration die from enemy roll (reaction, ${biLeft2} left)`,
          action: { type: 'use_class_feature', featureId: 'cutting_words' },
          kind: 'class_feature',
        });
    }

    // SRD Cleric universal Channel Divinity options — available to
    // every Cleric regardless of subclass.
    if (hasClass(char, 'cleric') && cdLeft > 0 && state.combat_active && enemyAlive) {
      choices.push({
        label: `Divine Spark — 1d8+${abilityMod(char.wis)} radiant damage or heal (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'divine_spark' },
        kind: 'class_feature',
      });
      choices.push({
        label: `Turn Undead — undead in 30 ft, WIS save or flee (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'turn_undead' },
        kind: 'class_feature',
      });
    }
    // SRD Cleric L5: Sear Undead replaces Destroy Undead. AoE radiant
    // damage to all undead in 30 ft, WIS save halves.
    if (
      hasClass(char, 'cleric') &&
      getClassLevel(char, 'cleric') >= 5 &&
      cdLeft > 0 &&
      state.combat_active &&
      enemyAlive
    ) {
      const clericLvl = getClassLevel(char, 'cleric');
      choices.push({
        label: `Sear Undead — all undead in 30 ft take ${clericLvl}d8 radiant, WIS save halves (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'sear_undead' },
        kind: 'class_feature',
      });
    }

    // Life Cleric: Preserve Life (Channel Divinity, out-of-combat heal)
    if (char.subclass === 'life' && hasClass(char, 'cleric') && cdLeft > 0) {
      choices.push({
        label: `Preserve Life — distribute ${5 * getClassLevel(char, 'cleric')} HP among wounded allies (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'preserve_life' },
        kind: 'class_feature',
      });
    }

    // Devotion Paladin: Sacred Weapon (Channel Divinity)
    if (
      char.subclass === 'devotion' &&
      hasClass(char, 'paladin') &&
      cdLeft > 0 &&
      !char.class_resource_uses?.sacred_weapon_active
    ) {
      choices.push({
        label: `Sacred Weapon — +${abilityMod(char.cha ?? 10)} to attack rolls for 10 rounds (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'sacred_weapon' },
        kind: 'class_feature',
      });
    }

    // Hunter Ranger: Colossus Slayer (the Hunter's Prey option in effect;
    // suppressed when the ranger has chosen Horde Breaker instead).
    if (
      char.subclass === 'hunter' &&
      hasClass(char, 'ranger') &&
      huntersPrey(char) === 'colossus_slayer' &&
      !char.class_resource_uses?.colossus_slayer_used
    ) {
      choices.push({
        label: `Colossus Slayer — +1d8 on first hit vs bloodied target`,
        action: { type: 'use_class_feature', featureId: 'colossus_slayer' },
        kind: 'class_feature',
      });
    }
  }

  // Spell choices
  if (context.spellTable && (char.spells_known ?? []).length > 0) {
    const slots = char.spell_slots_max ?? {};
    const slotsUsed = char.spell_slots_used ?? {};
    // Prep classes (Cleric / Paladin / Druid) only cast spells in their
    // `prepared_spells` list — mirrors the runtime check at the cast site.
    // Cantrips are always castable (level 0). Surfacing unprepared spells
    // creates a UX trap: the player clicks "Cast Healing Word", gets a
    // "not prepared" rejection, and burns the action without effect (the
    // engine bails before the slot is spent, but the choice list keeps
    // showing the unprepared spell every turn).
    const prepClasses = new Set(['cleric', 'paladin', 'druid']);
    // Enforce prep when ANY of the PC's classes is a prep class.
    const enforcePrep = [...prepClasses].some((c) => hasClass(char, c));
    const preparedSet = new Set(char.prepared_spells ?? []);
    for (const spellId of char.spells_known) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const spell = context.spellTable[spellId];
      if (!spell) continue;

      // Prep gate: filter unprepared level-1+ spells out of the cast menu
      // for prep classes. If `prepared_spells` is empty (legacy state /
      // pre-prep flow), fall back to surfacing everything so the player
      // isn't left without options.
      if (enforcePrep && spell.level > 0 && preparedSet.size > 0 && !preparedSet.has(spellId)) {
        continue;
      }

      // Reaction-cast spells (e.g. Shield) only fire from a pending_reaction
      // window — don't surface them in the regular cast menu.
      if (spell.castTime === 'reaction') continue;
      const isBonusAction = spell.castTime === 'bonus_action';
      const actionBlocked = !isBonusAction && char.turn_actions.action_used;
      const bonusBlocked = isBonusAction && char.turn_actions.bonus_action_used;
      if (actionBlocked || bonusBlocked) continue;

      // Out-of-combat-only spells (long cast, e.g. Animate Dead) aren't
      // castable mid-fight — the cast site rejects them, so don't surface
      // them in the combat cast menu.
      if (spell.outOfCombatOnly && state.combat_active) continue;

      // Restrict offensive/condition spells to when an enemy is alive; heal spells when injured
      const isOffensive = !!(spell.damage || spell.condition) || spell.id === 'true_strike';
      const isHeal = !!spell.heal;
      if (isOffensive && !enemyAlive) continue;
      if (isHeal) {
        const injured = state.characters.filter((c) => !c.dead && c.hp < c.max_hp);
        if (injured.length === 0) continue;
      }

      // SRD Spare the Dying — one choice per DOWNED ally (0 HP, dying, not yet
      // stable). Offered only when someone is dying; routed through the ally-buff
      // path with the chosen target. Skips the generic emission below.
      if (spell.stabilizes) {
        const dying = state.characters.filter((c) => !c.dead && c.hp <= 0 && !c.stable);
        if (dying.length === 0) continue;
        const stNote = isBonusAction ? ', bonus action' : '';
        for (const ally of dying) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          choices.push({
            label: `Cast ${spell.name} (cantrip${stNote}) → stabilize ${ally.name}`,
            action: { type: 'cast_spell', spellId, slotLevel: 0, targetCharId: ally.id },
            requiresBonusAction: isBonusAction || undefined,
            kind: 'cast_spell',
          });
        }
        continue;
      }

      // Summon spells (Animate Dead): emit one cast choice per available
      // slot level × creature variant (Skeleton / Zombie). RAW multi-raise
      // scales the count by slot level above base (countPerUpcastLevel).
      // Handled here so we skip the generic per-slot emission below.
      // (RE-1 Phase 4.5.)
      if (spell.summon) {
        const sBase = spell.level ?? 1;
        const sMax = Math.max(
          sBase,
          ...Object.keys(slots)
            .map(Number)
            .filter((l) => l >= sBase)
        );
        const variants = [spell.summon, ...(spell.summon.variants ?? [])];
        const perUpcast = spell.summon.countPerUpcastLevel ?? 0;
        const summonBase = spell.summon.baseCount ?? 1;
        for (let sl = sBase; sl <= sMax; sl++) {
          const avail = (slots[sl] ?? 0) - (slotsUsed[sl] ?? 0);
          if (avail <= 0) continue;
          const count = Math.max(1, summonBase + perUpcast * (sl - sBase));
          const slotLabel = sl === sBase ? `Lvl ${sl}` : `${ordinal(sl)} slot`;
          for (const v of variants) {
            if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
            const crew = count === 1 ? v.name : `${count} ${v.name}s`;
            choices.push({
              label: `Cast ${spell.name} (${slotLabel}) — raise ${crew} (${avail} slot${avail === 1 ? '' : 's'} left)`,
              action: { type: 'cast_spell', spellId, slotLevel: sl, summonVariant: v.name },
              kind: 'cast_spell',
            });
          }
        }
        continue;
      }

      // Optional AoE preview metadata for the grid renderer.
      const aoePreview = spell.blastRadius
        ? {
            shape: ((spell as { aoeShape?: 'sphere' | 'cone' | 'cube' | 'line' }).aoeShape ??
              'sphere') as 'sphere' | 'cone' | 'cube' | 'line',
            radiusFt: spell.blastRadius,
            rangeKind: spell.rangeKind,
          }
        : undefined;

      // For single-target offensive spells with 2+ living enemies, emit
      // one cast choice per enemy so the caster picks their target — RAW
      // (Guiding Bolt, Sacred Flame, Fire Bolt, Inflict Wounds, etc. all
      // say "a creature of your choice"). Mirrors the Attack-per-enemy
      // loop. Exclusions:
      //   - AoE spells (`blastRadius`): a single origin choice is still
      //     emitted; per-origin picker is a separate follow-up.
      //   - Spells with their own multi-target variants below (magic_missile;
      //     eldritch_blast at L5+ multi-beam): they emit focus-fire and
      //     spread choices in dedicated blocks — don't duplicate here.
      const enemyDisambig = (() => {
        const counts: Record<string, number> = {};
        for (const e of livingEnemies) counts[e.name] = (counts[e.name] ?? 0) + 1;
        const seen: Record<string, number> = {};
        return (en: { name: string }) =>
          counts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
      })();
      const hasOwnMultiTargetVariants =
        spellId === 'magic_missile' || (spellId === 'eldritch_blast' && char.level >= 5);
      // SRD Bane — the caster chooses up to 3 enemies (a target picker), so it
      // gets ONE choice (tagged `pickTargets`) rather than the per-enemy spread.
      const isEnemyTargetPicker = spellId === 'bane';
      const emitPerEnemy =
        isOffensive &&
        !spell.blastRadius &&
        !hasOwnMultiTargetVariants &&
        !isEnemyTargetPicker &&
        livingEnemies.length >= 2;

      // Option pickers (single-select): Polymorph's beast form, Greater
      // Restoration's effect. Tagged on the cast choice so the FE opens an
      // option dialog; the cast path honors the chosen id (else its default).
      const pickOption: GameChoice['pickOption'] =
        spellId === 'polymorph' ||
        spellId === 'true_polymorph' ||
        spellId === 'shapechange' ||
        spellId === 'animal_shapes'
          ? {
              param: 'beastForm',
              title: 'Choose a beast form',
              options: Object.values(BEAST_FORMS).map((f) => ({
                id: f.id,
                label: f.name,
                sub: `CR ${f.cr} · ${f.hp ?? 11} HP`,
              })),
            }
          : spellId === 'greater_restoration'
            ? {
                param: 'restorationEffect',
                title: 'Greater Restoration — choose an effect to remove',
                options: [
                  { id: 'exhaustion', label: 'Reduce Exhaustion by 1' },
                  { id: 'charmed', label: 'End the Charmed condition' },
                  { id: 'petrified', label: 'End the Petrified condition' },
                  { id: 'hp_max', label: 'Restore drained Hit Point maximum' },
                ],
              }
            : spellId === 'protection_from_energy'
              ? {
                  param: 'resistType',
                  title: 'Protection from Energy — choose a damage type to resist',
                  options: [
                    { id: 'acid', label: 'Acid' },
                    { id: 'cold', label: 'Cold' },
                    { id: 'fire', label: 'Fire' },
                    { id: 'lightning', label: 'Lightning' },
                    { id: 'thunder', label: 'Thunder' },
                  ],
                }
              : spellId === 'dragons_breath'
                ? {
                    param: 'breathType',
                    title: "Dragon's Breath — choose the breath's damage type",
                    options: [
                      { id: 'acid', label: 'Acid' },
                      { id: 'cold', label: 'Cold' },
                      { id: 'fire', label: 'Fire' },
                      { id: 'lightning', label: 'Lightning' },
                      { id: 'poison', label: 'Poison' },
                    ],
                  }
                : spellId === 'blindness_deafness'
                  ? {
                      param: 'conditionChoice',
                      title: 'Blindness/Deafness — choose the affliction',
                      options: [
                        { id: 'blinded', label: 'Blinded' },
                        { id: 'deafened', label: 'Deafened' },
                      ],
                    }
                  : spellId === 'wish'
                    ? {
                        // SRD Wish (basic use) — duplicate any spell of level 1-8.
                        param: 'wishSpellId',
                        title: 'Wish — duplicate a spell (level 8 or lower)',
                        options: Object.values(context.spellTable ?? {})
                          .filter((s) => s.level >= 1 && s.level <= 8)
                          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                          .map((s) => ({ id: s.id, label: s.name, sub: `Lvl ${s.level}` })),
                      }
                    : spellId === 'resistance'
                      ? {
                          param: 'resistType',
                          title: 'Resistance — choose a damage type to reduce',
                          options: [
                            { id: 'acid', label: 'Acid' },
                            { id: 'bludgeoning', label: 'Bludgeoning' },
                            { id: 'cold', label: 'Cold' },
                            { id: 'fire', label: 'Fire' },
                            { id: 'lightning', label: 'Lightning' },
                            { id: 'necrotic', label: 'Necrotic' },
                            { id: 'piercing', label: 'Piercing' },
                            { id: 'poison', label: 'Poison' },
                            { id: 'radiant', label: 'Radiant' },
                            { id: 'slashing', label: 'Slashing' },
                            { id: 'thunder', label: 'Thunder' },
                          ],
                        }
                      : undefined;

      if (spell.level === 0) {
        // Cantrip: no slot needed
        const slotNote = isBonusAction ? ', bonus action' : '';
        // Tag a cantrip granted by Magic Initiate so its source is clear in the
        // list (it's otherwise identical to a class cantrip — at-will, no slot).
        const cantripTag = Object.values(char.feat_choices ?? {}).some(
          (c) => c?.magicInitiateCantrips?.includes(spellId) ?? false
        )
          ? ', Magic Initiate'
          : '';
        if (emitPerEnemy) {
          // One choice per living enemy. `enemyDisambig` is consumed in
          // declaration order across calls so #1/#2 stay stable.
          for (const en of livingEnemies) {
            if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
            const suffix = enemyDisambig(en);
            choices.push({
              label: `Cast ${spell.name} (cantrip${slotNote}${cantripTag}) → ${en.name}${suffix}`,
              action: { type: 'cast_spell', spellId, slotLevel: 0, targetEnemyId: en.id },
              requiresBonusAction: isBonusAction || undefined,
              aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: en.id } : undefined,
              kind: 'cast_spell',
            });
          }
        } else {
          const targetId = isOffensive ? livingEnemies[0]?.id : undefined;
          choices.push({
            label: `Cast ${spell.name} (cantrip${slotNote}${cantripTag})`,
            action: { type: 'cast_spell', spellId, slotLevel: 0, targetEnemyId: targetId },
            requiresBonusAction: isBonusAction || undefined,
            aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: targetId } : undefined,
            kind: 'cast_spell',
          });
        }
      } else {
        // Leveled spell: emit one choice per available slot level (base + upcasts).
        // SRD Ritual casting (10 min, no slot, out of combat) — when
        // the spell is tagged ritualCasting AND the PC has a ritual-cast-
        // eligible class (Wizard / Cleric / Druid / Bard) AND combat is
        // not active, emit an additional "Cast as ritual" choice. The
        // ritual cast surface fires alongside any slot-based options so
        // the player can pick (e.g. slot Identify in combat-prep, or
        // ritual when out of slots).
        const baseLevel = spell.level ?? 1;
        const canRitual =
          (spell as { ritualCasting?: boolean }).ritualCasting === true &&
          !state.combat_active &&
          canRitualCast(char);
        if (canRitual) {
          choices.push({
            label: `Cast ${spell.name} as a ritual (10 min, no slot)`,
            action: { type: 'cast_spell', spellId, slotLevel: baseLevel, ritual: true },
            kind: 'cast_spell',
          });
        }
        const maxSlotLevel = Math.max(
          ...Object.keys(slots)
            .map(Number)
            .filter((l) => l >= baseLevel)
        );
        // SRD Magic Initiate free L1 cast — this specific spell can be cast once
        // per long rest with NO slot (precast.ts applies the freebie). Offer +
        // label the base-level cast even with no slot available, so a non-caster
        // (or a slot-depleted caster) can still use the feat's free cast.
        const miFreeAvailable =
          baseLevel > 0 &&
          Object.values(char.feat_choices ?? {}).some((c) => c?.magicInitiateL1 === spellId) &&
          (char.class_resource_uses?.magic_initiate_l1_used ?? 0) === 0;
        const upperSlotLevel = miFreeAvailable
          ? Math.max(baseLevel, Number.isFinite(maxSlotLevel) ? maxSlotLevel : baseLevel)
          : maxSlotLevel;
        let emittedAny = false;
        for (let sl = baseLevel; sl <= upperSlotLevel; sl++) {
          const avail = (slots[sl] ?? 0) - (slotsUsed[sl] ?? 0);
          const isFreeBase = sl === baseLevel && miFreeAvailable;
          if (avail <= 0 && !isFreeBase) continue;
          emittedAny = true;
          const isUpcast = sl > baseLevel;
          const upcastPart =
            isUpcast && spell.upcastBonus
              ? ` — upcast +${scaleUpcastDice(spell.upcastBonus, sl - baseLevel)}`
              : '';
          const slotNote = isBonusAction ? ', bonus action' : '';
          // The parenthetical descriptor: the freebie reads "free, Magic Initiate"
          // (with a ✦ prefix); any other cast reads its slot level.
          const castPrefix = isFreeBase ? '✦ ' : '';
          const levelDesc = isFreeBase
            ? 'free, Magic Initiate'
            : `${sl === baseLevel ? `Lvl ${sl}` : `${ordinal(sl)} slot`}${slotNote}${upcastPart}`;
          if (emitPerEnemy) {
            // Per-enemy basic choices at this slot level. `enemyDisambig`
            // is reset per slot below to keep #1/#2 numbering stable
            // within each slot's choice batch.
            const slotDisambig = (() => {
              const counts: Record<string, number> = {};
              for (const e of livingEnemies) counts[e.name] = (counts[e.name] ?? 0) + 1;
              const seen: Record<string, number> = {};
              return (en: { name: string }) =>
                counts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
            })();
            for (const en of livingEnemies) {
              if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
              const suffix = slotDisambig(en);
              choices.push({
                label: `${castPrefix}Cast ${spell.name} (${levelDesc}) → ${en.name}${suffix}`,
                action: { type: 'cast_spell', spellId, slotLevel: sl, targetEnemyId: en.id },
                requiresBonusAction: isBonusAction || undefined,
                aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: en.id } : undefined,
                kind: 'cast_spell',
                pickOption,
              });
            }
          } else {
            const targetId = isOffensive ? livingEnemies[0]?.id : undefined;
            // SRD Bless / Bane — the caster chooses up to 3 creatures (+1 per
            // slot above 1st). Tag the choice so the FE opens a target picker;
            // the cast path honors the chosen targets (else auto-picks). Bless
            // affects allies; Bane affects enemies.
            const pickTargets =
              spellId === 'bless'
                ? { side: 'ally' as const, max: 3 + (sl - baseLevel) }
                : spellId === 'bane'
                  ? { side: 'enemy' as const, max: 3 + (sl - baseLevel) }
                  : undefined;
            choices.push({
              label: `${castPrefix}Cast ${spell.name} (${levelDesc}${isFreeBase ? '' : ` — ${avail} slot${avail === 1 ? '' : 's'} left`})`,
              action: { type: 'cast_spell', spellId, slotLevel: sl, targetEnemyId: targetId },
              requiresBonusAction: isBonusAction || undefined,
              aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: targetId } : undefined,
              kind: 'cast_spell',
              pickTargets,
              pickOption,
            });
          }
          // SRD Magic Missile multi-target: when there are 2+ living
          // enemies, emit a focus-fire choice per enemy + one "spread evenly"
          // choice that distributes darts across all targets.
          if (spellId === 'magic_missile' && livingEnemies.length >= 2) {
            const dartCount = 2 + sl; // 3 at L1 slot, 4 at L2, etc.
            for (const e of livingEnemies) {
              choices.push({
                label: `Cast ${spell.name} (${sl === baseLevel ? `Lvl ${sl}` : `${ordinal(sl)} slot`}) — focus fire ${dartCount} darts → ${e.name}`,
                action: {
                  type: 'cast_spell',
                  spellId,
                  slotLevel: sl,
                  targetEnemyId: e.id,
                  targetEnemyIds: Array(dartCount).fill(e.id),
                },
                kind: 'cast_spell',
              });
            }
            // Spread evenly across the first min(darts, enemies) targets,
            // round-robin so extras pile on the earliest.
            const spread: string[] = [];
            for (let i = 0; i < dartCount; i++) {
              spread.push(livingEnemies[i % livingEnemies.length].id);
            }
            const names = livingEnemies
              .slice(0, Math.min(dartCount, livingEnemies.length))
              .map((e) => e.name)
              .join(', ');
            choices.push({
              label: `Cast ${spell.name} (${sl === baseLevel ? `Lvl ${sl}` : `${ordinal(sl)} slot`}) — spread ${dartCount} darts across ${names}`,
              action: {
                type: 'cast_spell',
                spellId,
                slotLevel: sl,
                targetEnemyId: livingEnemies[0].id,
                targetEnemyIds: spread,
              },
              kind: 'cast_spell',
            });
          }
        }
        if (!emittedAny) continue;
      }
      // SRD Eldritch Blast multi-beam (L5+ — 2 beams; L11+ 3; L17+ 4).
      // Emit per-target focus-fire + a spread variant when multiple enemies
      // are alive. Cantrip path handled separately above (only adds extras
      // when level + multi-enemy conditions are met).
      if (spellId === 'eldritch_blast' && char.level >= 5 && livingEnemies.length >= 2) {
        const beamCount = char.level >= 17 ? 4 : char.level >= 11 ? 3 : 2;
        for (const e of livingEnemies) {
          choices.push({
            label: `Cast ${spell.name} (cantrip) — focus fire ${beamCount} beams → ${e.name}`,
            action: {
              type: 'cast_spell',
              spellId,
              slotLevel: 0,
              targetEnemyId: e.id,
              targetEnemyIds: Array(beamCount).fill(e.id),
            },
            kind: 'cast_spell',
          });
        }
        const spread: string[] = [];
        for (let i = 0; i < beamCount; i++) {
          spread.push(livingEnemies[i % livingEnemies.length].id);
        }
        const names = livingEnemies
          .slice(0, Math.min(beamCount, livingEnemies.length))
          .map((e) => e.name)
          .join(', ');
        choices.push({
          label: `Cast ${spell.name} (cantrip) — spread ${beamCount} beams across ${names}`,
          action: {
            type: 'cast_spell',
            spellId,
            slotLevel: 0,
            targetEnemyId: livingEnemies[0].id,
            targetEnemyIds: spread,
          },
          kind: 'cast_spell',
        });
      }
    }
  }

  // SRD Divine Intervention (Cleric L10) — a Magic action, 1/Long Rest:
  // cast a Cleric spell (level 1-5, non-Reaction) with no slot or Material
  // components. We surface one free-cast choice per eligible PREPARED Cleric
  // spell. (RAW allows the entire Cleric list; pansori offers the prepared
  // subset to keep the menu bounded and reuse prep data — the value DI adds
  // here is the slot-free cast.) Greater Divine Intervention (L20, the Wish
  // option) is deferred: pansori implements no Wish spell.
  if (
    context.spellTable &&
    getClassLevel(char, 'cleric') >= 10 &&
    !(char.class_resource_uses?.divine_intervention_used ?? 0) &&
    !char.turn_actions.action_used
  ) {
    for (const spellId of char.prepared_spells ?? []) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const spell = context.spellTable[spellId];
      if (!spell) continue;
      const onClericList =
        (spell as { spellList?: ReadonlyArray<string> }).spellList?.includes('divine') ?? false;
      if (!onClericList || spell.level === 0 || spell.level > 5) continue;
      if (spell.castTime === 'reaction' || spell.summon || spell.revive) continue;
      if (spell.outOfCombatOnly && state.combat_active) continue;
      const isOffensive = !!(spell.damage || spell.condition) || spell.id === 'true_strike';
      if (isOffensive && !enemyAlive) continue;
      if (spell.heal && state.characters.every((c) => c.dead || c.hp >= c.max_hp)) continue;
      choices.push({
        label: `Divine Intervention — cast ${spell.name} (no slot)`,
        action: {
          type: 'cast_spell',
          spellId,
          slotLevel: spell.level,
          targetEnemyId: isOffensive ? livingEnemies[0]?.id : undefined,
          divineIntervention: true,
        },
        kind: 'cast_spell',
      });
    }
  }

  // ── Evoker Overchannel (L14) ───────────────────────────────────────────────
  // Offer a maximize-damage variant of each damaging spell the evoker can cast
  // with a level 1-5 slot. The first use per long rest is free; later uses deal
  // escalating Necrotic backlash (handled in precast). (RE-2.)
  if (
    context.spellTable &&
    char.subclass === 'evoker' &&
    getClassLevel(char, 'wizard') >= 14 &&
    !char.turn_actions.action_used
  ) {
    const ocSlots = char.spell_slots_max ?? {};
    const ocSlotsUsed = char.spell_slots_used ?? {};
    for (const spellId of char.spells_known ?? []) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const spell = context.spellTable[spellId];
      if (!spell || !spell.damage || spell.level < 1 || spell.level > 5) continue;
      if (spell.castTime === 'reaction') continue;
      if ((ocSlots[spell.level] ?? 0) - (ocSlotsUsed[spell.level] ?? 0) <= 0) continue;
      const isOffensive = !!(spell.damage || spell.condition);
      if (isOffensive && !enemyAlive) continue;
      choices.push({
        label: `Overchannel — cast ${spell.name} (Lvl ${spell.level}, maximum damage)`,
        action: {
          type: 'cast_spell',
          spellId,
          slotLevel: spell.level,
          targetEnemyId: isOffensive ? livingEnemies[0]?.id : undefined,
          overchannel: true,
        },
        kind: 'cast_spell',
      });
    }
  }

  // Two-weapon fighting bonus action: both weapons must be light
  if (
    state.combat_active &&
    char.turn_actions.action_used &&
    !char.turn_actions.bonus_action_used
  ) {
    const equippedWpnItem = equippedWeaponId(char)
      ? context.lootTable.find(
          (l) => l.id === char.inventory.find((i) => i.instance_id === equippedWeaponId(char))?.id
        )
      : null;
    // SRD 5.2.1 — two-weapon fighting requires both weapons to
    // be one-handed melee Light weapons.
    const mainHandEligible =
      equippedWpnItem &&
      equippedWpnItem.slot === 'weapon' &&
      equippedWpnItem.range !== 'ranged' &&
      equippedWpnItem.light;
    if (mainHandEligible) {
      const offhandItem = char.inventory
        .filter((i) => i.instance_id !== equippedWeaponId(char))
        .map((i) => context.lootTable.find((l) => l.id === i.id))
        .find((l) => l?.slot === 'weapon' && l.range !== 'ranged' && l.light);
      if (offhandItem) {
        choices.push({
          label: `Two-weapon attack — off-hand ${offhandItem.name} (no ability mod to damage)`,
          action: { type: 'two_weapon_attack', targetEnemyId: livingEnemies[0]?.id },
          requiresBonusAction: true,
          kind: 'two_weapon_attack',
        });
      }
    }
  }

  // Land Druid — Land's Aid (bonus action, 2 uses per long rest).
  // Surfaces 3 variants: heal + harm-necrotic + harm-radiant.
  if (
    !char.turn_actions.bonus_action_used &&
    char.subclass === 'land' &&
    hasClass(char, 'druid') &&
    getClassLevel(char, 'druid') >= 3
  ) {
    const used = char.class_resource_uses?.lands_aid_used ?? 0;
    const remaining = 2 - used;
    if (remaining > 0) {
      const dl = getClassLevel(char, 'druid');
      choices.push({
        label: `Land's Aid (heal) — heal one ally for 2d6+${dl} HP (${remaining}/2 uses left)`,
        action: { type: 'use_lands_aid', variant: 'heal' },
        requiresBonusAction: true,
        kind: 'class_feature',
      });
      if (state.combat_active && enemyAlive) {
        choices.push({
          label: `Land's Aid (necrotic) — 2d6+${dl} necrotic to an enemy, CON save halves (${remaining}/2 uses left)`,
          action: { type: 'use_lands_aid', variant: 'harm_necrotic' },
          requiresBonusAction: true,
          kind: 'class_feature',
        });
        choices.push({
          label: `Land's Aid (radiant) — 2d6+${dl} radiant to an enemy, CON save halves (${remaining}/2 uses left)`,
          action: { type: 'use_lands_aid', variant: 'harm_radiant' },
          requiresBonusAction: true,
          kind: 'class_feature',
        });
      }
    }
  }

  // Try to escape grapple — SRD 5.2.1, contested Athletics or Acrobatics
  if (
    state.combat_active &&
    !char.turn_actions.action_used &&
    char.conditions.includes('grappled')
  ) {
    choices.push({
      label: 'Try to escape grapple — Athletics or Acrobatics vs grappler',
      action: { type: 'try_escape_grapple' },
    });
  }

  // Spend Heroic Inspiration on the next d20 (SRD) — one-shot
  // advantage on any d20 test (attack, save, or ability check).
  // Available in or out of combat once the char has it stored and hasn't
  // already queued it this turn.
  if (char.inspiration && !char.turn_actions.inspiration_pending) {
    choices.push({
      label: '✦ Spend Heroic Inspiration — advantage on your next d20 (attack, save, or check)',
      action: { type: 'spend_inspiration' },
    });
  }

  // Stand up from prone — SRD 5.2.1: costs half the creature's speed.
  if (state.combat_active && char.conditions.includes('prone')) {
    const speedFt = effectiveSpeed(char, context.lootTable);
    const standCost = Math.floor(speedFt / 2);
    const usedFt = (state.movement_used ?? {})[char.id] ?? 0;
    if (speedFt - usedFt >= standCost) {
      choices.push({
        label: `Stand up — costs ${standCost} ft of movement`,
        action: { type: 'stand_up' },
      });
    }
  }

  // SRD Mounted Combat — Mount a willing ally mount within 5 ft, or Dismount
  // the one you ride. Each costs half your Speed of movement. A rideable mount
  // is an ally entity carrying a `speed_ft` (set for Phantom Steed at spawn).
  if (state.combat_active && state.entities) {
    const riderEnt = state.entities.find((e) => e.id === char.id);
    const speedFt = effectiveSpeed(char, context.lootTable);
    const moveCost = Math.floor(speedFt / 2);
    const usedFt = (state.movement_used ?? {})[char.id] ?? 0;
    const canAfford = speedFt - usedFt >= moveCost;
    if (riderEnt?.mount_id) {
      choices.push({
        label: `Dismount — climb down (costs ${moveCost} ft of movement)`,
        action: { type: 'dismount' },
        kind: 'mount',
      });
    } else if (riderEnt && canAfford) {
      for (const m of state.entities) {
        if (m.isEnemy || m.hp <= 0 || m.rider_id || m.speed_ft === undefined) continue;
        const adjacent =
          Math.max(Math.abs(m.pos.x - riderEnt.pos.x), Math.abs(m.pos.y - riderEnt.pos.y)) <= 1;
        if (!adjacent) continue;
        choices.push({
          label: `Mount ${m.companionName ?? 'the steed'} (costs ${moveCost} ft of movement)`,
          action: { type: 'mount', mountId: m.id },
          kind: 'mount',
        });
      }
    }
  }

  // Grapple/Shove choices — one per living enemy
  if (enemyAlive && !char.turn_actions.action_used) {
    const nameCounts = livingEnemies.reduce<Record<string, number>>((acc, e) => {
      acc[e.name] = (acc[e.name] ?? 0) + 1;
      return acc;
    }, {});
    const seen: Record<string, number> = {};
    for (const en of livingEnemies) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const suffix =
        nameCounts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
      choices.push({
        label: `Grapple the ${en.name}${suffix} — STR vs STR/DEX contest`,
        action: { type: 'grapple', targetEnemyId: en.id },
        kind: 'grapple',
      });
      choices.push({
        label: `Shove the ${en.name}${suffix} — STR vs STR/DEX contest (knocks prone)`,
        action: { type: 'shove', targetEnemyId: en.id },
        kind: 'shove',
      });
    }
  }

  // Dodge / Disengage — available in combat when action not yet used
  if (state.combat_active && !char.turn_actions.action_used) {
    choices.push({
      label: 'Dodge — attacks against you have disadvantage until your next turn',
      action: { type: 'dodge' },
      kind: 'dodge',
    });
    choices.push({
      label: 'Disengage — move without triggering opportunity attacks',
      action: { type: 'disengage' },
      kind: 'disengage',
    });
    // SRD 5.2.1 Hide [Action] — any class, as an Action, when the
    // obscurement/cover + out-of-line-of-sight prerequisite is met. (Rogues
    // also get Hide as a Bonus Action via Cunning Action, offered separately.)
    if (canAttemptHide(char, state, seed).allowed) {
      choices.push({
        label: 'Hide — DC 15 Stealth check (gain the Invisible condition on a success)',
        action: { type: 'hide' },
        kind: 'hide',
      });
    }
  }

  // ── Reposition a placed damage zone (Flaming Sphere / Moonbeam / Call
  // Lightning) onto an enemy within the spell's move range. Offered per zone
  // the active PC owns, when the move's action-economy slot is free. (RE-4.)
  if (state.combat_active && (state.spell_zones?.length ?? 0) > 0 && state.entities) {
    for (const z of state.spell_zones ?? []) {
      if (z.casterId !== char.id || z.followsCaster || !z.center) continue;
      const zoneSpell = context.spellTable?.[z.spellId];
      const moveFt = zoneSpell?.zoneMoveFt;
      const moveCost = zoneSpell?.zoneMoveCost;
      if (!moveFt || !moveCost) continue;
      const slotFree =
        moveCost === 'bonus_action'
          ? !char.turn_actions.bonus_action_used
          : !char.turn_actions.action_used;
      if (!slotFree) continue;
      const center = z.center;
      for (const en of livingEnemies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const ent = state.entities.find((e) => e.id === en.id && e.isEnemy);
        if (!ent || distanceFeet(center, ent.pos) > moveFt) continue;
        choices.push({
          label: `Move ${z.name} onto the ${en.name} (${moveCost === 'bonus_action' ? 'bonus action' : 'action'})`,
          action: { type: 'move_zone', zoneId: z.id, to: ent.pos },
          kind: 'move_zone',
        });
      }
    }
  }

  // ── Re-issue a recurring spell attack (Spiritual Weapon / Vampiric Touch) at
  // a target, for the spell's recurring cost, when that slot is free. (RE-4.)
  if (state.combat_active && char.recurring_attack && livingEnemies.length > 0) {
    const ra = char.recurring_attack;
    const slotFree =
      ra.cost === 'bonus_action'
        ? !char.turn_actions.bonus_action_used
        : !char.turn_actions.action_used;
    if (slotFree) {
      for (const en of livingEnemies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `${ra.name}: attack the ${en.name} (${ra.cost === 'bonus_action' ? 'bonus action' : 'action'})`,
          action: { type: 'recurring_spell_attack', targetEnemyId: en.id },
          kind: 'recurring_spell_attack',
        });
      }
    }
  }

  // ── SRD Dragon's Breath — exhale a 15-ft cone toward an enemy (the holder's
  // action), once per turn for the spell's duration. One choice per living
  // enemy to aim the cone.
  if (
    state.combat_active &&
    char.granted_breath &&
    !char.turn_actions.action_used &&
    livingEnemies.length > 0
  ) {
    for (const en of livingEnemies) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      choices.push({
        label: `Exhale ${char.granted_breath.damageType} breath (15-ft cone) → the ${en.name}`,
        action: { type: 'use_breath', targetEnemyId: en.id },
        kind: 'use_breath',
      });
    }
  }

  // Attune choices — out of combat, for unnattuned items that require attunement
  if (!state.combat_active) {
    const attuned = char.attuned_items ?? [];
    if (attuned.length < 3) {
      for (const invItem of char.inventory) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const lootItem = context.lootTable.find((l) => l.id === invItem.id);
        if (lootItem?.requiresAttunement && !attuned.includes(invItem.instance_id)) {
          choices.push({
            label: `Attune to ${invItem.name}`,
            action: { type: 'attune', instanceId: invItem.instance_id },
          });
        }
      }
    }
  }

  // End turn: available in combat after the character's action is used
  // (auto-advance fires when no bonus choices exist, but this allows explicit forfeiture)
  if (state.combat_active && char.turn_actions.action_used) {
    choices.push({ label: 'End turn', action: { type: 'end_turn' } });
  }
  const isImmobilized = char.conditions.some((c) => ['grappled', 'restrained'].includes(c));

  // Grid movement choices — shown in combat when entities are tracked on the grid
  if (state.entities && state.combat_active && !isImmobilized) {
    const charEntity = state.entities.find((e) => e.id === char.id);
    if (charEntity) {
      const speedFt = effectiveSpeed(char, context.lootTable);
      const usedFt = (state.movement_used ?? {})[char.id] ?? 0;
      const remaining = speedFt - usedFt;
      const { w: gw, h: gh } = combatGridDims(state.current_room, seed, context);
      // Dead entities (corpses) don't block movement — walk over them.
      const occupied = new Set(
        state.entities
          .filter((e) => e.id !== char.id && e.hp > 0)
          .map((e) => `${e.pos.x},${e.pos.y}`)
      );
      const DIRS: Array<{ label: ChoiceDirection; dx: number; dy: number }> = [
        { label: 'N', dx: 0, dy: -1 },
        { label: 'NE', dx: 1, dy: -1 },
        { label: 'E', dx: 1, dy: 0 },
        { label: 'SE', dx: 1, dy: 1 },
        { label: 'S', dx: 0, dy: 1 },
        { label: 'SW', dx: -1, dy: 1 },
        { label: 'W', dx: -1, dy: 0 },
        { label: 'NW', dx: -1, dy: -1 },
      ];
      if (remaining > 0) {
        for (const dir of DIRS) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const nx = charEntity.pos.x + dir.dx;
          const ny = charEntity.pos.y + dir.dy;
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
          if (occupied.has(`${nx},${ny}`)) continue;
          choices.push({
            label: `Move ${dir.label} → (${nx},${ny}) [${remaining - 5}ft left]`,
            action: { type: 'grid_move', entityId: char.id, to: { x: nx, y: ny } },
            kind: 'grid_move',
            direction: dir.label,
          });
        }
      }
    }
  }
  const sliced = MAX_CHOICES ? choices.slice(0, MAX_CHOICES) : choices;
  // Stamp seenKey on each choice (undefined for kinds not worth dimming).
  // Centralizing the stamp here means each emit site doesn't need to know
  // its own disambiguation rules.
  return sliced.map((c) => {
    const k = seenKeyForAction(c.action, state);
    return k ? { ...c, seenKey: k } : c;
  });
}

// ─── Script engine: rule evaluation ──────────────────────────────────────────

export async function runRules(
  state: GameState,
  context: Context,
  action: StructuredAction,
  prevRoomId: string,
  seed: Seed
): Promise<{ state: GameState; extraNarrative: string }> {
  const rules = context.rules;
  if (!rules?.length) return { state, extraNarrative: '' };

  const activeChar =
    state.characters.find((c) => c.id === state.active_character_id) ?? state.characters[0];
  if (!activeChar) return { state, extraNarrative: '' };

  // Filter out once-rules that have already fired
  const eligibleRules = rules.filter((r) => !r.once || !state.flags[`rule_fired_${r.name}`]);
  if (!eligibleRules.length) return { state, extraNarrative: '' };

  // Flags are spread as top-level facts so rules can reference them directly
  // (e.g. { fact: 'boss_defeated', operator: 'equal', value: true }).
  // Named facts below take precedence over any same-named flag.
  const facts: Record<string, unknown> = {
    ...state.flags,
    action: action.type,
    room_id: state.current_room,
    // The NPC the party is mid-conversation with ('' otherwise) — lets a
    // "talk to <NPC>" rule scope to the specific NPC, not just the room (a room
    // may host several NPCs, e.g. Pinegate Square holds Old Elise AND Bram).
    npc_id: state.active_conversation?.npcId ?? '',
    prev_room_id: prevRoomId,
    visited_rooms: state.visited_rooms,
    enemies_killed: state.enemies_killed,
    loot_taken: state.loot_taken,
    combat_active: state.combat_active,
    flags: state.flags,
    active_hp: activeChar.hp,
    active_max_hp: activeChar.max_hp,
    active_level: activeChar.level,
    active_class: activeChar.character_class,
    active_conditions: activeChar.conditions,
  };

  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const rule of eligibleRules) {
    engine.addRule({
      name: rule.name,
      priority: rule.priority ?? 1,
      conditions: rule.conditions as Parameters<typeof engine.addRule>[0]['conditions'],
      event: { type: rule.name },
    });
  }

  const { events } = await engine.run(facts as Parameters<typeof engine.run>[0]);
  const firedNames = new Set(events.map((e) => e.type));

  if (!firedNames.size) return { state, extraNarrative: '' };

  // Apply consequences for each fired rule in declaration order
  let st = state;
  const narrativeParts: string[] = [];

  for (const rule of eligibleRules) {
    if (!firedNames.has(rule.name)) continue;

    for (const c of rule.consequences) {
      st = applyConsequence(c, st, seed, activeChar.id, narrativeParts, context);
    }

    if (rule.once) {
      st = { ...st, flags: { ...st.flags, [`rule_fired_${rule.name}`]: true } };
    }
  }

  return { state: st, extraNarrative: narrativeParts.join(' ') };
}

export function applyConsequence(
  c: GameConsequence,
  st: GameState,
  seed: Seed,
  activeCharId: string,
  narrativeParts: string[],
  // Optional: when supplied, `give_xp` triggers immediate level-ups via
  // `applyLevelUpFromXp`. Older call sites that don't pass it still
  // award the XP — the level-up will fire on the next kill grant.
  context?: Context
): GameState {
  switch (c.type) {
    case 'add_narrative':
      narrativeParts.push(c.text);
      return st;

    case 'set_flag':
      return { ...st, flags: { ...st.flags, [c.key]: c.value } };

    case 'adjust_flag': {
      // Relative numeric change (campaign counters/meters); flag read as 0 when
      // unset or non-numeric.
      const cur = Number(st.flags?.[c.key] ?? 0);
      return { ...st, flags: { ...st.flags, [c.key]: (Number.isFinite(cur) ? cur : 0) + c.delta } };
    }

    case 'start_quest': {
      // Activate a quest from a script trigger (dialogue node, quest reward
      // chain). Idempotent: an existing progress entry — active, completed
      // or failed — leaves the state untouched, so a replayed trigger can't
      // resurrect or duplicate a quest. The activation line mirrors the
      // route's auto-activation announcement.
      const def = context?.campaign?.quests?.find((q) => q.id === c.questId);
      if (!def) {
        console.warn(`[consequence] start_quest: no quest with id "${c.questId}" — skipped`);
        return st;
      }
      const progress = st.quest_progress ?? [];
      if (progress.some((qp) => qp.questId === c.questId)) return st;
      narrativeParts.push(`\n\n✦ Quest accepted — ${def.title}. ${def.desc}`);
      return {
        ...st,
        quest_progress: [...progress, { questId: c.questId, status: 'active', completedSteps: [] }],
      };
    }

    case 'give_item': {
      const targetId = c.characterId ?? activeCharId;
      // `seed.loot` is keyed by room id and holds positioned-loot lists, so look
      // the item up by id across every room's placement list — then fall back to
      // the composed loot table (context), so a dialogue/quest reward can grant
      // ANY catalog or custom item, not only ones already placed in a room.
      const lootEntry =
        Object.values(seed.loot ?? {})
          .flat()
          .find((l) => l?.id === c.itemId) ??
        context?.lootTable.find((l) => l.id === c.itemId) ??
        null;
      if (!lootEntry) return st;
      const newItem = { ...lootEntry, instance_id: randomUUID() };
      const characters = st.characters.map((ch) =>
        ch.id === targetId ? { ...ch, inventory: [...ch.inventory, newItem] } : ch
      );
      return { ...st, characters };
    }

    case 'modify_hp': {
      const targetId = c.characterId ?? activeCharId;
      const characters = st.characters.map((ch) => {
        if (ch.id !== targetId) return ch;
        const newHp = Math.max(0, Math.min(ch.max_hp, ch.hp + c.amount));
        return { ...ch, hp: newHp };
      });
      return { ...st, characters };
    }

    case 'unlock_room': {
      // Mark the room as already visited so it appears on the map without being locked
      if (st.visited_rooms.includes(c.roomId)) return st;
      return { ...st, visited_rooms: [...st.visited_rooms, c.roomId] };
    }

    case 'spawn_enemy': {
      // Look up the enemy template by its instance id (searched across all rooms).
      // Note: this consequence only adds a grid entity; it does not add to seed.enemies
      // (seeds are treated as immutable for the duration of an action).
      const template = getEnemyById(seed, c.enemyId);
      if (!template) return st;
      if (st.entities) {
        const spawnedEntity: import('../types.js').CombatEntity = {
          id: `${c.enemyId}@${c.roomId}#${Date.now()}`,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: template.hp,
          maxHp: template.hp,
          conditions: [],
          condition_durations: {},
        };
        return { ...st, entities: [...st.entities, spawnedEntity] };
      }
      return st;
    }

    case 'set_escape':
      // Handled by takeAction's escaped flag; we signal via a flag that
      // the route can check after runRules returns.
      return { ...st, flags: { ...st.flags, _rule_escape: true } };

    case 'give_gold': {
      // Gold lands on the active character. Surfaced in narrative so
      // the player sees the reward immediately ("+150 gold").
      const characters = st.characters.map((ch) =>
        ch.id === activeCharId ? { ...ch, gold: (ch.gold ?? 0) + c.amount } : ch
      );
      narrativeParts.push(`+${c.amount} gold.`);
      return { ...st, characters };
    }

    case 'give_xp': {
      // Quest XP — split the amount evenly across all living party
      // members (rounded down). Mirrors how `splitEncounterXp` shares
      // kill XP, but every eligible PC gets a share (no killer carve-out).
      // When context is provided, also trigger immediate level-ups so
      // the player sees the level bump on quest turn-in instead of
      // having to wait for the next kill.
      if (c.amount <= 0) return st;
      const living = st.characters.filter((ch) => !ch.dead);
      const eligibleCount = living.length;
      if (eligibleCount === 0) return st;
      const share = Math.floor(c.amount / eligibleCount);
      if (share <= 0) {
        narrativeParts.push(`+${c.amount} XP awarded but party too large for a share.`);
        return st;
      }
      // Apply XP to a mutable clone so applyLevelUpFromXp (which mutates
      // its argument) can run on each living PC without losing the XP write.
      const livingIds = new Set(living.map((ch) => ch.id));
      let levelUpNote = '';
      const characters = st.characters.map((ch) => {
        if (!livingIds.has(ch.id)) return ch;
        const next: Character = { ...ch, xp: (ch.xp || 0) + share };
        if (context) {
          levelUpNote += applyLevelUpFromXp(next, context);
        }
        return next;
      });
      // Show the authored total + per-PC share so the player can see
      // the quest's reward magnitude and what each PC actually got.
      // Solo parties collapse to just the total (each = total).
      narrativeParts.push(
        eligibleCount > 1 ? `+${c.amount} XP (+${share} each).` : `+${c.amount} XP.`
      );
      if (levelUpNote) narrativeParts.push(levelUpNote.trim());
      return { ...st, characters };
    }

    case 'set_faction_rep': {
      const cur = st.faction_rep?.[c.factionId] ?? 0;
      const next = cur + c.delta;
      narrativeParts.push(`${c.delta >= 0 ? '+' : ''}${c.delta} reputation with ${c.factionId}.`);
      return { ...st, faction_rep: { ...(st.faction_rep ?? {}), [c.factionId]: next } };
    }

    case 'set_npc_attitude': {
      // npc_attitudes is keyed by the NPC's id (a room may host several NPCs).
      return {
        ...st,
        npc_attitudes: { ...(st.npc_attitudes ?? {}), [c.npcId]: c.attitude },
      };
    }

    case 'advance_quest': {
      const progress = st.quest_progress ?? [];
      const existing = progress.find((p) => p.questId === c.questId);
      if (existing) {
        if (existing.completedSteps.includes(c.stepId)) return st;
        return {
          ...st,
          quest_progress: progress.map((p) =>
            p.questId === c.questId ? { ...p, completedSteps: [...p.completedSteps, c.stepId] } : p
          ),
        };
      }
      // Quest not yet accepted — start it active with this step done
      return {
        ...st,
        quest_progress: [
          ...progress,
          { questId: c.questId, status: 'active', completedSteps: [c.stepId] },
        ],
      };
    }

    case 'travel_to':
      // Update the location pointer; preserves room_id (caller picks
      // a destination room separately if needed).
      return { ...st, current_location_id: c.locationId, current_district_id: undefined };

    case 'consume_item': {
      // Remove ONE instance of itemId from whichever party member has
      // it. Quest turn-ins (Guild Ledger, Moonstone Amulet, etc.) use
      // this so the item leaves the player's pack at completion.
      let removed = false;
      const characters = st.characters.map((ch) => {
        if (removed) return ch;
        const idx = ch.inventory.findIndex((i) => i.id === c.itemId);
        if (idx < 0) return ch;
        removed = true;
        return { ...ch, inventory: ch.inventory.filter((_, i) => i !== idx) };
      });
      return { ...st, characters };
    }

    default:
      return st;
  }
}

// ─── Loot effects + act transitions (acts ⊃ quests) ──────────────────────────

// Apply a LootEffect — grant/revoke items to REQUIRED party members only,
// resolved by name+class against campaign.requiredMembers (user-added members
// are never targeted; we can't predict them). Grants reuse give_item's item
// resolution; revokes pull one instance from the named member. An unresolvable
// member or item is skipped. Shared by acts (start/end) and quests
// (start/complete).
export function applyLootEffect(
  effect: LootEffect | undefined,
  st: GameState,
  seed: Seed,
  context: Context,
  narrativeParts: string[]
): GameState {
  if (!effect) return st;
  const required = context.campaign?.requiredMembers ?? [];
  const findMember = (name: string) =>
    st.characters.find(
      (c) =>
        c.name === name && required.some((rm) => rm.name === c.name && rm.cls === c.character_class)
    );
  for (const g of effect.grant ?? []) {
    const target = findMember(g.member);
    if (target) {
      st = applyConsequence(
        { type: 'give_item', itemId: g.itemId, characterId: target.id },
        st,
        seed,
        target.id,
        narrativeParts,
        context
      );
    }
  }
  for (const r of effect.revoke ?? []) {
    const target = findMember(r.member);
    if (!target) continue;
    const idx = target.inventory.findIndex((i) => i.id === r.itemId);
    if (idx < 0) continue;
    const removed = target.inventory[idx];
    st = {
      ...st,
      characters: st.characters.map((c) =>
        c.id === target.id ? { ...c, inventory: c.inventory.filter((_, k) => k !== idx) } : c
      ),
    };
    narrativeParts.push(`${target.name} hands over ${removed.name}.`);
  }
  return st;
}

// If a completed quest is the CURRENT act's advance trigger, move to the next
// act: play onEnd + endEffect → relocate to the next act's region/coords → set
// current_act → activate the next act's startActive quests (+ their startEffect)
// → startEffect + onStart. No-op if there's no current act, no trigger match, or
// it's already the last act.
// Enter `next` act from `prev`: onEnd + endEffect → relocate (region-gate patch)
// → set current_act → activate next act's startActive quests (+ startEffect) →
// startEffect + onStart; a terminal act (ending) resolves the campaign.
function enterAct(
  st: GameState,
  prev: Act,
  next: Act,
  seed: Seed,
  context: Context,
  narrativeParts: string[]
): GameState {
  const endLine = pickHookText(prev.onEnd);
  if (endLine) narrativeParts.push(`\n\n${endLine}`);
  st = applyLootEffect(prev.endEffect, st, seed, context, narrativeParts);

  const region = context.campaign?.regions?.find((r) => r.id === next.startingRegionId);
  st = {
    ...st,
    current_act: next.id,
    // Act transitions often FIRE from a dialogue consequence (the Silverford
    // truce/war choice) — the conversation must close with the act, or it
    // dangles forever: the NPC's tree is gone with the old room, the engine
    // keeps surfacing only ambient choices, and the dialogue overlay loops on
    // "Set travel pace" (the 2026-06-14 incident).
    active_conversation: undefined,
    ...(region
      ? {
          map_level: 'regional' as const,
          current_region_id: region.id,
          marker_pos: next.startPos ?? region.startPos,
          current_town_id: undefined,
          current_room: '',
          region_marker_pos: undefined,
          visited_regions: Array.from(new Set([...(st.visited_regions ?? []), region.id])),
        }
      : {}),
  };
  if (region) st = revealRegional(context.campaign, st);

  for (const q of (context.campaign?.quests ?? []).filter(
    (q) => q.actId === next.id && q.startActive
  )) {
    if (!(st.quest_progress ?? []).some((p) => p.questId === q.id)) {
      st = {
        ...st,
        quest_progress: [
          ...(st.quest_progress ?? []),
          { questId: q.id, status: 'active', completedSteps: [] },
        ],
      };
      st = applyLootEffect(q.startEffect, st, seed, context, narrativeParts);
    }
  }

  st = applyLootEffect(next.startEffect, st, seed, context, narrativeParts);
  const startLine = pickHookText(next.onStart);
  narrativeParts.push(`\n\n✦ ${next.name}.${startLine ? ` ${startLine}` : ''}`);

  // Terminal act → resolve the campaign (the FE shows an ending screen).
  if (next.ending) {
    st = {
      ...st,
      campaign_outcome: {
        outcome: next.ending.outcome,
        ...(next.ending.text ? { text: next.ending.text } : {}),
      },
    };
    if (next.ending.text) narrativeParts.push(`\n\n${next.ending.text}`);
  }
  return st;
}

// Evaluate the CURRENT act's transitions every action: the FIRST edge whose
// `when` holds advances to its target act. The legacy `trigger` is folded in as
// a final success edge (→ next act by order). No-op once the campaign is
// resolved, or when nothing matches.
export function advanceActIfTriggered(
  st: GameState,
  seed: Seed,
  context: Context,
  facts: CampaignFacts,
  narrativeParts: string[]
): GameState {
  const acts = context.campaign?.acts ?? [];
  if (acts.length === 0 || st.campaign_outcome) return st;
  const curIdx = acts.findIndex((a) => a.id === (st.current_act ?? acts[0].id));
  const cur = acts[curIdx];
  if (!cur) return st;

  const edges: Array<{ holds: boolean; to: string | undefined }> = (cur.transitions ?? []).map(
    (t) => ({ holds: evalCondition(t.when, facts as unknown as Record<string, unknown>), to: t.to })
  );
  if (cur.trigger) {
    const t = cur.trigger;
    const holds = t.stepId
      ? (facts.steps_done ?? []).includes(`${t.questId}:${t.stepId}`)
      : (facts.quests_completed ?? []).includes(t.questId);
    edges.push({ holds, to: acts[curIdx + 1]?.id });
  }

  for (const e of edges) {
    if (!e.holds) continue;
    const next = acts.find((a) => a.id === e.to);
    if (!next || next.id === cur.id) continue; // unknown / self-loop → skip
    return enterAct(st, cur, next, seed, context, narrativeParts);
  }
  return st;
}

// ─── Enemy turn auto-resolve (with reaction-window support) ───────────────────

// SRD: reactions interrupt the attacker's resolve. When an enemy's
// attack lands within Shield's window ([AC, AC+4]) on a defender who has
// Shield prepared + a 1st-level slot + an unused reaction, this helper sets
// `st.pending_reaction` and returns `paused: true` so the engine can yield
// control to the player. Calling again from `resolve_reaction` resumes the
// loop from the saved coordinates.
//
// Eligibility for Shield is checked at the per-sub-attack level. Multiattacks
// pause mid-burst; remaining sub-attacks resume after the decision.
// Shared eligibility check: target alive + has an unused reaction + knows
// the spell + has a level-1+ slot + the spell exists in this campaign's
// spell table. Each reaction adds its own trigger predicate on top.
function knowsSpellWithSlot(target: Character, spellId: string, context: Context): boolean {
  if (target.dead || target.hp <= 0) return false;
  if (!canReact(target)) return false;
  const knows =
    (target.prepared_spells ?? []).includes(spellId) ||
    (target.spells_known ?? []).includes(spellId);
  if (!knows) return false;
  const slotsMax = target.spell_slots_max ?? {};
  const slotsUsed = target.spell_slots_used ?? {};
  const hasL1Slot = Object.entries(slotsMax).some(([lvl, max]) => {
    const lvlN = Number(lvl);
    return lvlN >= 1 && (max ?? 0) > (slotsUsed[lvlN] ?? 0);
  });
  if (!hasL1Slot) return false;
  if (!context.spellTable?.[spellId]) return false;
  return true;
}

function isShieldEligible(
  target: Character,
  atkTotal: number,
  targetAc: number,
  context: Context
): boolean {
  if (!knowsSpellWithSlot(target, 'shield', context)) return false;
  // Outside the [AC, AC+4] window, +5 AC from Shield wouldn't change the result.
  if (atkTotal < targetAc || atkTotal > targetAc + 4) return false;
  return true;
}

/**
 * Uncanny Dodge (SRD Rogue L5). Triggers BEFORE damage commits when
 * the Rogue can see the attacker — halves damage from that one
 * attack at the cost of their reaction.
 *
 * Modeled prereqs:
 *   - PC must be a Rogue (class match, since multi-class isn't modeled).
 *   - Rogue level ≥ 5.
 *   - Reaction not yet used this round.
 *   - Target conscious (`hp > 0` BEFORE the proposed damage commits).
 *   - "Can see the attacker" is modeled loosely as "PC is not blinded"
 *     (line-of-sight blocking by walls isn't tracked yet — see TODO
 *     "Party line-of-sight indicators on the grid"). Blindness is a
 *     condition the engine tracks; checking it here avoids a clearly
 *     wrong narrative ("you halve the damage from the goblin you
 *     can't see").
 */
function isUncannyDodgeEligible(target: Character): boolean {
  if (!hasClass(target, 'rogue')) return false;
  if (getClassLevel(target, 'rogue') < 5) return false;
  if (!canReact(target)) return false;
  if (target.hp <= 0) return false;
  if (target.conditions?.includes('blinded')) return false;
  return true;
}

// Deflect Attacks (SRD Monk L3) — a Reaction that reduces the damage from a
// Bludgeoning/Piercing/Slashing attack by 1d10 + DEX + Monk level. 2024 RAW
// doesn't require seeing the attacker (unlike Uncanny Dodge), so there's no
// blinded gate. Eligibility is checked AFTER the attack proposal so the window
// only opens on a damaging B/P/S hit with a Reaction available.
function isDeflectAttacksEligible(target: Character, damageType: string | undefined): boolean {
  const monkLevel = getClassLevel(target, 'monk');
  if (monkLevel < 3) return false;
  if (!canReact(target)) return false;
  if (target.hp <= 0) return false;
  // SRD Deflect Energy (Monk L13): Deflect Attacks now works against attacks
  // dealing ANY damage type, not just Bludgeoning/Piercing/Slashing.
  if (monkLevel >= 13) return true;
  return ['bludgeoning', 'piercing', 'slashing'].includes(damageType ?? 'bludgeoning');
}

// Hellish Rebuke (SRD) — triggers AFTER damage applies. Requires the
// PC to be conscious (target.hp > 0 after the hit), within 60 ft of the
// attacker (we have grid positions), and Warlock-only since that's the spell
// list it appears on. Multi-class isn't modeled, so the class check is exact.
function isHellishRebukeEligible(
  target: Character,
  targetPos: { x: number; y: number } | undefined,
  attackerPos: { x: number; y: number } | undefined,
  context: Context
): boolean {
  // SRD: Warlocks cast it from their spell list; Tieflings L3+ get it
  // as a racial Innate spell (1/long rest, no slot cost).
  const isWarlock =
    hasClass(target, 'warlock') && knowsSpellWithSlot(target, 'hellish_rebuke', context);
  const isTieflingInnate =
    target.species === 'tiefling' &&
    target.level >= 3 &&
    !target.class_resource_uses?.tiefling_rebuke_used &&
    !!context.spellTable?.['hellish_rebuke'];
  if (!isWarlock && !isTieflingInnate) return false;
  if (!targetPos || !attackerPos) return false;
  if (distanceFeet(targetPos, attackerPos) > 60) return false;
  return true;
}

// Resolve a pending enemy spell's damage on its intended target. Used by
// the Counterspell decline path (and by counterspell-failed-check). Returns
// undefined if there's nothing to apply (spell has no damage, target dead).
export function applyEnemySpellDamage(
  st: GameState,
  rx: { enemySpellId: string; intendedTargetPcId: string },
  context: Context
):
  | { st: GameState; targetHp: number; targetName: string; dmgRoll: number; damageType: string }
  | undefined {
  const tgtIdx = st.characters.findIndex((c) => c.id === rx.intendedTargetPcId);
  if (tgtIdx < 0) return undefined;
  const spell = context.spellTable?.[rx.enemySpellId];
  if (!spell?.damage) return undefined;
  const dmgRoll = rollDice(spell.damage);
  const tgt = st.characters[tgtIdx];
  const newHp = Math.max(0, tgt.hp - dmgRoll);
  const newSt = commitCharacter(st, { ...tgt, hp: newHp });
  return {
    st: newSt,
    targetHp: newHp,
    targetName: tgt.name,
    dmgRoll,
    damageType: spell.damageType ?? 'damage',
  };
}

// Counterspell (SRD) — triggers when a creature within 60 ft is
// casting a spell. Requires Counterspell prepared/known + a 3rd-level slot
// (since the spell itself is 3rd level — slots ≥ spell level only).
function isCounterspellEligible(
  reactor: Character,
  reactorPos: { x: number; y: number } | undefined,
  casterPos: { x: number; y: number } | undefined,
  context: Context
): boolean {
  if (reactor.dead || reactor.hp <= 0) return false;
  if (!canReact(reactor)) return false;
  const knows =
    (reactor.prepared_spells ?? []).includes('counterspell') ||
    (reactor.spells_known ?? []).includes('counterspell');
  if (!knows) return false;
  // Need a level-3+ slot to cast counterspell at its base level.
  const slotsMax = reactor.spell_slots_max ?? {};
  const slotsUsed = reactor.spell_slots_used ?? {};
  const hasL3Slot = Object.entries(slotsMax).some(([lvl, max]) => {
    const lvlN = Number(lvl);
    return lvlN >= 3 && (max ?? 0) > (slotsUsed[lvlN] ?? 0);
  });
  if (!hasL3Slot) return false;
  if (!context.spellTable?.counterspell) return false;
  if (!reactorPos || !casterPos) return false;
  if (distanceFeet(reactorPos, casterPos) > 60) return false;
  return true;
}

interface EnemyTurnResult {
  st: GameState;
  narrative: string;
  exitAdvIdx: number;
  roundWrapped: boolean;
  paused: boolean;
}

// Tactical-grid approach planner for an enemy that wants to melee `targetPos`.
// Returns the destination square (within `reachFt` of target, unoccupied) and
// the truncated step path the enemy will walk this turn. Walks up to
// `speedFt`; if the closest in-reach square is farther than that, the enemy
// covers as much of the path as movement allows and `reached` is false.
// Returns null when no path exists to any in-reach square (e.g. fully boxed
// in by allies).
function planEnemyApproach(args: {
  st: GameState;
  seed: Seed;
  enemyId: string;
  enemyPos: GridPos;
  targetPos: GridPos;
  reachFt: number;
  speedFt: number;
  context: Context;
  roomId: string;
  roomObstacles?: GridPos[];
}): { newPos: GridPos; pathSquares: GridPos[]; reached: boolean } | null {
  const { w: gridW, h: gridH } = combatGridDims(args.roomId, args.seed, args.context);
  const blocked = [
    ...(args.st.entities ?? []).filter((e) => e.id !== args.enemyId && e.hp > 0).map((e) => e.pos),
    ...(args.roomObstacles ?? []),
  ];
  const reachSquares = Math.max(1, Math.floor(args.reachFt / SQUARE_SIZE));
  // Candidate end squares: any unoccupied square within reachSquares (Chebyshev)
  // of the target.
  const candidates: GridPos[] = [];
  for (let dx = -reachSquares; dx <= reachSquares; dx++) {
    for (let dy = -reachSquares; dy <= reachSquares; dy++) {
      if (dx === 0 && dy === 0) continue;
      const cand = { x: args.targetPos.x + dx, y: args.targetPos.y + dy };
      if (cand.x < 0 || cand.x >= gridW || cand.y < 0 || cand.y >= gridH) continue;
      if (blocked.some((b) => posEqual(b, cand))) continue;
      candidates.push(cand);
    }
  }
  // Prefer the candidate closest to the enemy's current position so the path
  // is minimal — the enemy moves only as far as needed.
  candidates.sort(
    (a, b) =>
      Math.max(Math.abs(args.enemyPos.x - a.x), Math.abs(args.enemyPos.y - a.y)) -
      Math.max(Math.abs(args.enemyPos.x - b.x), Math.abs(args.enemyPos.y - b.y))
  );
  const maxSquares = Math.max(0, Math.floor(args.speedFt / SQUARE_SIZE));
  for (const dest of candidates) {
    const path = findPath(args.enemyPos, dest, blocked, gridW, gridH);
    if (path && path.length > 0) {
      const truncated = path.slice(0, maxSquares);
      if (truncated.length === 0) {
        // Speed 0 — no movement at all.
        return { newPos: args.enemyPos, pathSquares: [], reached: false };
      }
      const newPos = truncated[truncated.length - 1];
      const reached =
        Math.max(Math.abs(newPos.x - args.targetPos.x), Math.abs(newPos.y - args.targetPos.y)) <=
        reachSquares;
      return { newPos, pathSquares: truncated, reached };
    }
  }
  return null;
}

// Resolves opportunity attacks PCs make against an enemy who walked out of
// their melee threat zone (SRD 5.2.1). Mirrors the PC-side OA loop in
// the grid_move handler: auto-fires for any PC with a reaction available and
// a melee weapon (or unarmed) in hand, consumes the PC's reaction, applies
// damage to the enemy entity, and marks the enemy killed if it hits 0 HP.
// Returns early as soon as the enemy is killed so subsequent PCs don't get
// to attack a corpse.
function applyPcOpportunityAttacks(args: {
  st: GameState;
  enemyId: string;
  oaTargets: CombatEntity[]; // PC entities whose threat zone was broken
  enemyAc: number;
  enemyName: string;
  context: Context;
}): { st: GameState; enemyKilled: boolean; narrative: string } {
  let st = args.st;
  let enemyHpNow = st.entities?.find((e) => e.id === args.enemyId && e.isEnemy)?.hp ?? 0;
  let enemyKilled = false;
  let narrative = '';
  for (const pcEnt of args.oaTargets) {
    if (enemyKilled) break;
    const pcIdx = st.characters.findIndex((c) => c.id === pcEnt.id);
    if (pcIdx < 0) continue;
    const pc = st.characters[pcIdx];
    if (pc.dead || pc.stable || pc.hp <= 0) continue;
    if (!canReact(pc)) continue;
    // Incapacitated PCs can't take reactions.
    if (
      pc.conditions?.some((c) =>
        ['incapacitated', 'paralyzed', 'stunned', 'unconscious'].includes(c)
      )
    )
      continue;
    // OA can only be made with a melee weapon (SRD). Ranged-only weapons
    // don't qualify; thrown melee weapons (handaxe, dagger) do because they
    // have a melee profile too.
    const weaponInstance = equippedWeaponId(pc)
      ? pc.inventory?.find((i) => i.instance_id === equippedWeaponId(pc))
      : null;
    const weaponItem = weaponInstance
      ? args.context.lootTable.find((l) => l.id === weaponInstance.id)
      : null;
    if (weaponItem?.range === 'ranged' && !weaponItem.thrown) continue;
    const weaponProficient = hasWeaponProficiency(
      pc.weapon_proficiencies ?? [],
      weaponItem?.weaponType,
      weaponItem ?? undefined
    );
    const atk = resolvePlayerAttack(
      { str: pc.str, dex: pc.dex, level: pc.level },
      weaponItem?.damage ?? null,
      args.enemyAc,
      weaponItem?.finesse ?? false,
      false,
      false,
      weaponProficient,
      false,
      20,
      0,
      pc.species === 'halfling'
    );
    // Reaction consumed regardless of hit/miss.
    st = {
      ...st,
      characters: st.characters.map((c, i) =>
        i === pcIdx ? { ...c, turn_actions: { ...c.turn_actions, reaction_used: true } } : c
      ),
    };
    if (atk.hit) {
      enemyHpNow = Math.max(0, enemyHpNow - atk.damage);
      narrative += ` ⚔ ${pc.name} opportunity attack hits ${args.enemyName} for ${fmt.dmg(atk.damage)}!`;
      st = {
        ...st,
        entities: (st.entities ?? []).map((e) =>
          e.id === args.enemyId && e.isEnemy ? { ...e, hp: enemyHpNow } : e
        ),
      };
      if (enemyHpNow <= 0) {
        enemyKilled = true;
        st = {
          ...st,
          enemies_killed: [...st.enemies_killed, args.enemyId],
        };
        narrative += ` ${args.enemyName} drops!`;
      }
    } else {
      narrative += ` ⚔ ${pc.name} opportunity attack misses ${args.enemyName}.`;
    }
  }
  return { st, enemyKilled, narrative };
}

/**
 * SRD Berserker Retaliation (Barbarian L10) — after the barbarian takes damage
 * from an adjacent creature, it uses its Reaction to make one melee attack back
 * against that creature. A single-attacker analogue of
 * `applyPcOpportunityAttacks`: rolls a melee swing, consumes the reaction, and
 * applies damage + kill. (Rage damage bonus isn't added — matching the
 * simplified OA attack profile.)
 */
function applyBarbarianRetaliation(args: {
  st: GameState;
  barbarianId: string;
  enemyId: string;
  enemyAc: number;
  enemyName: string;
  context: Context;
}): { st: GameState; narrative: string } {
  let st = args.st;
  const pcIdx = st.characters.findIndex((c) => c.id === args.barbarianId);
  if (pcIdx < 0) return { st, narrative: '' };
  const pc = st.characters[pcIdx];
  const weaponInstance = equippedWeaponId(pc)
    ? pc.inventory?.find((i) => i.instance_id === equippedWeaponId(pc))
    : null;
  const weaponItem = weaponInstance
    ? args.context.lootTable.find((l) => l.id === weaponInstance.id)
    : null;
  // Retaliation is a melee attack — a ranged-only weapon can't make it.
  if (weaponItem?.range === 'ranged' && !weaponItem.thrown) return { st, narrative: '' };
  const weaponProficient = hasWeaponProficiency(
    pc.weapon_proficiencies ?? [],
    weaponItem?.weaponType,
    weaponItem ?? undefined
  );
  const atk = resolvePlayerAttack(
    { str: pc.str, dex: pc.dex, level: pc.level },
    weaponItem?.damage ?? null,
    args.enemyAc,
    weaponItem?.finesse ?? false,
    false,
    false,
    weaponProficient,
    false,
    20,
    0,
    pc.species === 'halfling'
  );
  st = {
    ...st,
    characters: st.characters.map((c, i) =>
      i === pcIdx ? { ...c, turn_actions: { ...c.turn_actions, reaction_used: true } } : c
    ),
  };
  if (!atk.hit) {
    return { st, narrative: ` 💢 ${pc.name} retaliates against ${args.enemyName} — but misses.` };
  }
  const enemyHpNow = Math.max(
    0,
    (st.entities?.find((e) => e.id === args.enemyId && e.isEnemy)?.hp ?? 0) - atk.damage
  );
  st = {
    ...st,
    entities: (st.entities ?? []).map((e) =>
      e.id === args.enemyId && e.isEnemy ? { ...e, hp: enemyHpNow } : e
    ),
  };
  let narrative = ` 💢 ${pc.name} retaliates against ${args.enemyName} for ${fmt.dmg(atk.damage)}!`;
  if (enemyHpNow <= 0) {
    st = { ...st, enemies_killed: [...st.enemies_killed, args.enemyId] };
    narrative += ` ${args.enemyName} drops!`;
  }
  return { st, narrative };
}

/**
 * Run an enemy's multiattack sequence against a PC target. Each
 * iteration calls `computeEnemyAttack` to roll the attack + damage
 * into a proposed snapshot, then checks for two reaction windows
 * that pause the loop:
 *
 *   1. **Shield reaction** (BEFORE damage commits) — the PC can cast
 *      Shield to negate this specific hit. `computeEnemyAttack`
 *      already rolled the concentration save into proposed state;
 *      we stash that snapshot so a Shield-decline commits it
 *      verbatim and a Shield-accept discards it (closing the
 *      Shield-vs-concentration ordering bug).
 *   2. **Hellish Rebuke** (AFTER damage commits) — the PC can deal
 *      2d10 fire back to the attacker.
 *
 * Either pause returns `'paused'`; the caller exits with
 * `paused: true` so the resume cycle picks up at
 * `resumeFromMultiattackIdx`.
 *
 * The Orc Relentless Endurance bump (1 HP instead of 0) and the
 * Massive Damage Death check both run inline here against the
 * commit snapshot.
 *
 * `'completed'` means the full multiattack ran without a pause —
 * caller proceeds to death save processing and the per-turn
 * commitCharacter at the end of the enemy turn.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5).
 */
/**
 * Build an enemy-actor `ActionContext` for routing a single enemy action
 * (e.g. `enemy_attack`) through `dispatchAction`. Only the fields the
 * enemy path actually reads are meaningful — actor / st / context /
 * narrative + `roomObstacleCells` (read by `handleEnemyAttack` so walls
 * block a light source from revealing a target). The rest are inert
 * placeholders the enemy-attack handler never reads. (EE-2.)
 */
function buildEnemyActionCtx(args: {
  st: GameState;
  seed: Seed;
  context: Context;
  worldName: string;
  enemy: Enemy;
  ent: CombatEntity | undefined;
  narrative: string;
}): ActionContext {
  const { st, seed, context, worldName, enemy, ent, narrative } = args;
  return {
    context,
    state: st,
    worldName,
    prevRoomId: st.current_room,
    roomId: st.current_room,
    roomObstacleCells: [
      ...(seed.rooms.find((r) => r.id === st.current_room)?.obstacles ?? []),
      ...wallObstacleCells(st, st.current_room, 'los'),
    ],
    livingEnemiesInRoom: [],
    enemy: undefined,
    enemyAlive: false,
    placedLoot: [],
    seed,
    st,
    actor: enemyActor(enemy, ent),
    narrative,
    escaped: false,
    usedInitiative: false,
    fragments: [],
    commitChar() {
      if (this.actor.kind === 'pc') this.st = commitCharacter(this.st, this.actor.char);
    },
  };
}

/**
 * Resolve a SINGLE enemy sub-attack against `target` (one swing of a
 * multiattack). Extracted from `runEnemyMultiattackLoop` so the same
 * per-attack core can be driven both by the inline loop and (Phase
 * "dispatcher-integrated enemy turns") by the `enemy_attack` handler.
 *
 * Returns one of:
 *   - `paused`        — a PC reaction window opened (Shield / Uncanny
 *     Dodge / Hellish Rebuke); `pending_reaction` is stashed with the
 *     resume coords and the caller must stop and surface the reaction.
 *   - `killed-massive`— the swing dealt massive damage; target is dead.
 *   - `done`          — swing resolved (hit or miss); caller continues
 *     the multiattack with the returned `target` (loop stops on hp 0).
 *
 * `mi` / `advIdx` only feed the pause resume coords; behavior is
 * otherwise independent of the surrounding loop.
 */
export type EnemySubAttackResult =
  | { outcome: 'paused'; st: GameState; narrative: string }
  | { outcome: 'killed-massive'; st: GameState; target: Character; narrative: string }
  | { outcome: 'done'; st: GameState; target: Character; narrative: string };

export function resolveEnemySubAttack(args: {
  enemy: Enemy;
  enemyId: string;
  enemyEnt: CombatEntity | undefined;
  target: Character;
  st: GameState;
  context: Context;
  advIdx: number;
  mi: number;
  narrative: string;
  // SRD Vision & Light — current room light level (threaded from the caller,
  // which has the seed). Defaults to 'bright'.
  roomLighting?: 'bright' | 'dim' | 'dark' | 'sunlight';
  // SRD Vision & Light — the room's solid obstacle cells (walls), threaded so a
  // light source can't illuminate a target behind a wall.
  roomObstacles?: GridPos[];
}): EnemySubAttackResult {
  const { enemy, enemyId, enemyEnt, context, advIdx, mi } = args;
  let st = args.st;
  let target = args.target;
  let narrative = args.narrative;
  const prevHp = target.hp;
  const computed = computeEnemyAttack(
    enemy,
    target,
    st,
    context,
    false,
    args.roomLighting ?? 'bright',
    args.roomObstacles ?? []
  );
  // Shield reaction window — pause before committing the proposed snapshot.
  if (computed.hit && isShieldEligible(target, computed.atkTotal, target.ac, context)) {
    st = {
      ...st,
      pending_reaction: {
        kind: 'shield',
        attackerEnemyId: enemyId,
        targetCharId: target.id,
        atkTotal: computed.atkTotal,
        targetAcAtAttack: target.ac,
        pendingFragment: computed.fragment as EnemyAttackHitFragment,
        pendingProposedChar: computed.proposedChar,
        // Clear the inner pending_reaction to avoid self-recursion
        // when stashing the proposed snapshot.
        pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
        resumeFromInitiativeIdx: advIdx,
        resumeFromMultiattackIdx: mi + 1,
        narrativeSoFar: narrative,
        eligibleCharIds: [target.id],
      },
      // Put the reactor in the driver's seat so the FE prompts them.
      active_character_id: target.id,
    };
    narrative += ` ⚡ ${enemy.name} strikes ${target.name} — total ${fmt.roll(computed.atkTotal)} vs ${fmt.ac(target.ac)}. Shield available!`;
    return { outcome: 'paused', st, narrative };
  }

  // Uncanny Dodge reaction window (Rogue L5+). Triggers BEFORE
  // damage commits when the Rogue can see the attacker. Same
  // proposed-snapshot stash pattern as Shield; the resolver in
  // reaction.ts halves `proposedDamage` before committing.
  if (computed.hit && computed.hpLost > 0 && isUncannyDodgeEligible(target)) {
    st = {
      ...st,
      pending_reaction: {
        kind: 'uncanny_dodge',
        attackerEnemyId: enemyId,
        targetCharId: target.id,
        atkTotal: computed.atkTotal,
        proposedDamage: computed.hpLost,
        pendingFragment: computed.fragment as EnemyAttackHitFragment,
        pendingProposedChar: computed.proposedChar,
        pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
        resumeFromInitiativeIdx: advIdx,
        resumeFromMultiattackIdx: mi + 1,
        narrativeSoFar: narrative,
        eligibleCharIds: [target.id],
      },
      active_character_id: target.id,
    };
    narrative += ` ⚡ ${enemy.name} strikes ${target.name} for ${fmt.dmg(computed.hpLost)} — Uncanny Dodge available!`;
    return { outcome: 'paused', st, narrative };
  }

  // Deflect Attacks reaction window (Monk L3+). Triggers BEFORE damage commits
  // on a Bludgeoning/Piercing/Slashing hit. Same proposed-snapshot stash as
  // Uncanny Dodge; the resolver reduces `proposedDamage` by 1d10 + DEX + Monk
  // level before committing. Checked after Uncanny Dodge so a Rogue/Monk
  // multiclass spends Uncanny Dodge first (both consume the single reaction).
  if (computed.hit && computed.hpLost > 0 && isDeflectAttacksEligible(target, enemy.damageType)) {
    st = {
      ...st,
      pending_reaction: {
        kind: 'deflect_attacks',
        attackerEnemyId: enemyId,
        targetCharId: target.id,
        atkTotal: computed.atkTotal,
        proposedDamage: computed.hpLost,
        pendingFragment: computed.fragment as EnemyAttackHitFragment,
        pendingProposedChar: computed.proposedChar,
        pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
        resumeFromInitiativeIdx: advIdx,
        resumeFromMultiattackIdx: mi + 1,
        narrativeSoFar: narrative,
        eligibleCharIds: [target.id],
      },
      active_character_id: target.id,
    };
    narrative += ` 🥋 ${enemy.name} strikes ${target.name} for ${fmt.dmg(computed.hpLost)} — Deflect Attacks available!`;
    return { outcome: 'paused', st, narrative };
  }
  // No Shield / Uncanny Dodge / Deflect window — commit the proposed character + state.
  // Orc Relentless Endurance: when reduced to 0 HP (and not killed
  // outright by massive damage), the Orc drops to 1 HP instead.
  // 1/long rest.
  const proposedHp = computed.proposedChar.hp;
  const orcReUsed = target.class_resource_uses?.relentless_endurance_used === 1;
  let orcSaveFired = false;
  if (
    target.species === 'orc' &&
    !orcReUsed &&
    prevHp > 0 &&
    proposedHp === 0 &&
    !isMassiveDamageDeath(prevHp, computed.hpLost, target.max_hp)
  ) {
    orcSaveFired = true;
    target = {
      ...computed.proposedChar,
      hp: 1,
      class_resource_uses: {
        ...(computed.proposedChar.class_resource_uses ?? {}),
        relentless_endurance_used: 1,
      },
    };
  } else {
    target = computed.proposedChar;
  }
  // SRD Barbarian Relentless Rage (L11): if you drop to 0 HP while raging (and
  // aren't killed outright), a CON save — DC 10, +5 per prior use this rest —
  // leaves you at 2× Barbarian level HP instead. Doesn't stack with the Orc
  // bump (which already kept the target up). Scoped to the enemy-attack
  // knockout path, like Orc Relentless Endurance.
  let relentlessRageFired = false;
  if (
    !orcSaveFired &&
    prevHp > 0 &&
    target.hp === 0 &&
    (target.conditions ?? []).includes('raging') &&
    getClassLevel(target, 'barbarian') >= 11 &&
    !isMassiveDamageDeath(prevHp, computed.hpLost, target.max_hp)
  ) {
    const used = target.class_resource_uses?.relentless_rage_used ?? 0;
    const dc = 10 + 5 * used;
    const conSave = rollDice('1d20') + abilityMod(target.con) - d20TestPenalty(target);
    if (conSave >= dc) {
      relentlessRageFired = true;
      target = {
        ...target,
        hp: 2 * getClassLevel(target, 'barbarian'),
        class_resource_uses: {
          ...(target.class_resource_uses ?? {}),
          relentless_rage_used: used + 1,
        },
      };
    }
  }
  st = computed.proposedSt;
  if (orcSaveFired) {
    narrative += ` 🪓 Relentless Endurance! ${target.name} stays standing at ${fmt.hp(1)} HP.`;
  }
  if (relentlessRageFired) {
    narrative += ` 🪓 Relentless Rage! ${target.name} refuses to fall — back up at ${fmt.hp(target.hp)} HP.`;
  }
  narrative += ` ${computed.fragment.prose}`;
  st = pushEvent(st, enemyAttackFragmentEvent(computed.fragment, st.round ?? 1));
  if (isMassiveDamageDeath(prevHp, computed.hpLost, target.max_hp)) {
    target = { ...target, dead: true, stable: false, died_at_round: st.round ?? 1 };
    narrative += ` MASSIVE DAMAGE — ${target.name} is killed outright!`;
    return { outcome: 'killed-massive', st, target, narrative };
  }

  // Hellish Rebuke (SRD) — triggers AFTER damage applies. The
  // damage is already on the books in `target`; if the player
  // accepts, the resolve path deals damage back to the attacker.
  // Commit the new target HP to state BEFORE pausing so the resumed
  // run sees the correct HP.
  if (computed.hit && computed.hpLost > 0 && target.hp > 0) {
    const myPos = st.entities?.find((e) => e.id === target.id)?.pos;
    if (isHellishRebukeEligible(target, myPos, enemyEnt?.pos, context)) {
      st = {
        ...commitCharacter(st, target),
        pending_reaction: {
          kind: 'hellish_rebuke',
          attackerEnemyId: enemyId,
          targetCharId: target.id,
          resumeFromInitiativeIdx: advIdx,
          resumeFromMultiattackIdx: mi + 1,
          narrativeSoFar: narrative,
          eligibleCharIds: [target.id],
        },
        active_character_id: target.id,
      };
      narrative += ` 🔥 ${target.name} could retaliate with Hellish Rebuke!`;
      return { outcome: 'paused', st, narrative };
    }
  }

  // Interactive save-reroll window (Fighter Indomitable / Bard Countercharm).
  // A save-based onHitEffect condition just landed and the target (or an ally
  // bard) can reroll it. Like Hellish Rebuke this opens AFTER damage commits, so
  // we must commit `target` into state before pausing (the caller's normal
  // post-attack commit is skipped on a pause). The reroll outcome is pre-rolled
  // in `computeEnemyAttack`; accepting removes the condition when it succeeds.
  if (computed.pendingSaveReroll && target.hp > 0) {
    const srr = computed.pendingSaveReroll;
    st = {
      ...commitCharacter(st, target),
      pending_reaction: {
        kind: 'save_reroll',
        attackerEnemyId: enemyId,
        targetCharId: target.id,
        reactorCharId: srr.reactorId,
        reactorName: srr.reactorName,
        source: srr.source,
        condition: srr.condition,
        damageRefund: srr.damageRefund,
        concentrationSpellId: srr.concentrationSpellId,
        saveAbility: srr.saveAbility,
        saveDc: srr.saveDc,
        rerollSucceeds: srr.succeeds,
        resumeFromInitiativeIdx: advIdx,
        resumeFromMultiattackIdx: mi + 1,
        narrativeSoFar: narrative,
        eligibleCharIds: [srr.reactorId],
      },
      active_character_id: srr.reactorId,
    };
    const verb = srr.source === 'indomitable' ? 'Indomitable' : 'Countercharm';
    const what = srr.condition
      ? `the failed ${srr.condition} save`
      : srr.concentrationSpellId
        ? `the failed Concentration save (${srr.concentrationSpellId})`
        : 'the failed save';
    narrative += ` ✦ ${srr.reactorName} could use ${verb} to reroll ${what}!`;
    return { outcome: 'paused', st, narrative };
  }
  return { outcome: 'done', st, target, narrative };
}

async function runEnemyMultiattackLoop(args: {
  enemy: Enemy;
  enemyId: string;
  enemyEnt: CombatEntity | undefined;
  target: Character;
  st: GameState;
  resumeMi: number;
  attackCount: number;
  advIdx: number;
  context: Context;
  narrative: string;
  seed: Seed;
  worldName: string;
}): Promise<
  | {
      kind: 'paused';
      st: GameState;
      narrative: string;
    }
  | {
      kind: 'completed';
      st: GameState;
      target: Character;
      narrative: string;
      massiveDeath: boolean;
    }
> {
  const { attackCount } = args;
  let st = args.st;
  let target = args.target;
  let narrative = args.narrative;
  let massiveDeath = false;
  // SRD Gnoll Rampage (1/Day) — set when a swing this turn deals damage to a
  // target that was ALREADY Bloodied (HP ≤ half its max BEFORE the hit).
  let rampageTriggered = false;
  for (let mi = args.resumeMi; mi < attackCount && target.hp > 0; mi++) {
    const preHitHp = target.hp;
    const wasBloodied = preHitHp <= Math.floor(target.max_hp / 2);
    // EE-2 — route each swing through the dispatcher with an enemy actor.
    // The handler resolves the swing (via resolveEnemySubAttack) and
    // reports its tagged outcome back on ctx.enemySubAttack.
    const ctx = buildEnemyActionCtx({
      st,
      seed: args.seed,
      context: args.context,
      worldName: args.worldName,
      enemy: args.enemy,
      ent: args.enemyEnt,
      narrative,
    });
    await dispatchAction(ctx, {
      type: 'enemy_attack',
      targetCharId: target.id,
      advIdx: args.advIdx,
      multiattackIdx: mi,
    });
    st = ctx.st;
    narrative = ctx.narrative;
    const sub = ctx.enemySubAttack;
    // Defensive: the handler always sets this for an enemy actor; bail
    // safely (treat as turn-ending) if it somehow didn't.
    if (!sub) break;
    if (sub.outcome === 'paused') return { kind: 'paused', st, narrative };
    target = sub.target;
    if (wasBloodied && target.hp < preHitHp) rampageTriggered = true;
    // Commit each swing's result into st before the next one. The dispatcher
    // re-reads the target from st.characters by id, so without this commit a
    // Multiattack's later swings recompute from the pre-turn HP and only the
    // last swing's damage (and any conditions it applied) would stick. Mid-turn
    // commit also lets a condition applied by an earlier swing (e.g. Paralyzed)
    // inform later swings, as RAW intends.
    st = commitCharacter(st, target);
    if (sub.outcome === 'killed-massive') {
      massiveDeath = true;
      break;
    }
  }

  // ── SRD Gnoll Rampage (1/Day) ──────────────────────────────────────────
  // Immediately after a swing damaged an already-Bloodied target, the gnoll
  // moves up to half its Speed and makes one extra attack. Once per encounter
  // (1/day), tracked on the entity. Fires only while the same target still
  // stands; the kill-then-move-and-retarget case (and the half-Speed move
  // itself, unneeded for an adjacent re-attack) are deferred.
  const gnollEnt = st.entities?.find((e) => e.id === args.enemyId && e.isEnemy);
  if (
    rampageTriggered &&
    args.enemy.rampage &&
    gnollEnt &&
    !gnollEnt.rampage_used &&
    target.hp > 0 &&
    !massiveDeath
  ) {
    // Mark the 1/day use BEFORE the extra swing so it can't recurse.
    st = {
      ...st,
      entities: (st.entities ?? []).map((e) =>
        e.id === args.enemyId && e.isEnemy ? { ...e, rampage_used: true } : e
      ),
    };
    // (The loop already committed `target` into st.characters after the final
    // swing, so the extra Rend stacks on the damage dealt this turn.)
    narrative += ` 🐺 Rampage! The ${args.enemy.name} surges in for an extra attack.`;
    const ctx = buildEnemyActionCtx({
      st,
      seed: args.seed,
      context: args.context,
      worldName: args.worldName,
      enemy: args.enemy,
      ent: args.enemyEnt,
      narrative,
    });
    await dispatchAction(ctx, {
      type: 'enemy_attack',
      targetCharId: target.id,
      advIdx: args.advIdx,
      multiattackIdx: attackCount, // a fresh index past the normal swings
    });
    st = ctx.st;
    narrative = ctx.narrative;
    const sub = ctx.enemySubAttack;
    if (sub) {
      if (sub.outcome === 'paused') return { kind: 'paused', st, narrative };
      target = sub.target;
      if (sub.outcome === 'killed-massive') massiveDeath = true;
    }
  }
  return { kind: 'completed', st, target, narrative, massiveDeath };
}

/**
 * Tactical approach movement for an enemy that wants to melee a PC.
 * SRD 5.2.1 — the enemy must be within `attackReachFt` of the
 * target before its swing connects; otherwise it walks up to
 * `speedFt` toward an in-reach square. PCs whose threat zone is
 * broken by the move get opportunity attacks (which may kill the
 * mover).
 *
 * Returns one of:
 *   - `'proceed-to-attack'` — either resuming a multi-attack
 *     (`resumeMi > 0`), already in reach (`!needsToMove`), or
 *     successfully closed to reach this turn. Caller proceeds to the
 *     multiattack loop. `movementHeaderPrinted` indicates whether
 *     the `[Name's turn]` header was already emitted by this helper.
 *   - `'skip-turn'` — no path found, enemy killed by an OA, or
 *     moved but still out of reach. Caller advances initiative and
 *     continues the loop.
 *
 * Grappled / restrained enemies have effective speed 0 → no path →
 * skip-turn with a "held in place" message.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5).
 */
export function attemptEnemyApproach(args: {
  enemy: Enemy;
  enemyId: string;
  target: Character;
  st: GameState;
  seed: Seed;
  resumeMi: number;
  context: Context;
  roomObstacleCells: GridPos[];
  narrative: string;
}):
  | { kind: 'proceed-to-attack'; st: GameState; narrative: string; movementHeaderPrinted: boolean }
  | { kind: 'skip-turn'; st: GameState; narrative: string } {
  const { enemy, enemyId, target, st, seed, resumeMi, context, roomObstacleCells } = args;
  let narrative = args.narrative;
  const reachFt = enemy.attackReachFt ?? 5;
  const baseSpeedFt = enemy.speedFt ?? DEFAULT_SPEED_FEET;
  const enemyEntPreMove = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
  const targetEntPreMove = st.entities?.find((e) => e.id === target.id);
  const enemyImmobile =
    enemyEntPreMove?.conditions?.some((c) => c === 'grappled' || c === 'restrained') ?? false;
  // SRD Frightened — a Frightened creature can't willingly move closer to the
  // source of its fear. When the target it would approach IS that source, it's
  // held in place (can still attack at Disadvantage if already in reach).
  const fearHeld =
    !!enemyEntPreMove?.conditions?.includes('frightened') &&
    !!enemyEntPreMove?.frightened_by &&
    target.id === enemyEntPreMove.frightened_by;
  // SRD Barbarian Hamstring Blow (Brutal Strike) — −15 ft Speed.
  const hamstrungFt = enemyEntPreMove?.conditions?.includes('hamstrung') ? 15 : 0;
  // SRD Thief Devious Strikes (Daze) — on its next turn the target does ONLY
  // ONE of move / action / bonus action. Simplified: a dazed enemy forgoes its
  // movement and so attacks only if a target is already in reach (otherwise it
  // does nothing) — it never both closes AND attacks. The condition self-clears
  // on the round-wrap enemy tick.
  const dazedHeld = enemyEntPreMove?.conditions?.includes('dazed') ?? false;
  const effectiveEnemySpeedFt =
    enemyImmobile || fearHeld || dazedHeld ? 0 : Math.max(0, baseSpeedFt - hamstrungFt);
  const needsToMove =
    !!enemyEntPreMove &&
    !!targetEntPreMove &&
    distanceFeet(enemyEntPreMove.pos, targetEntPreMove.pos) > reachFt;

  // Skip the movement work entirely when resuming a multi-attack or
  // when already in reach. Caller falls through to the attack loop.
  if (resumeMi !== 0 || !needsToMove || !enemyEntPreMove || !targetEntPreMove) {
    // SRD charge rider — a fresh turn (resumeMi 0) with no approach means no
    // charge: clear any stale stamp so a prior turn's run-up can't trigger it.
    // On a resume, preserve the charge stamped by this turn's earlier approach.
    const clearedSt =
      resumeMi === 0 && enemyEntPreMove?.charged_ft
        ? {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === enemyId && e.isEnemy ? { ...e, charged_ft: 0 } : e
            ),
          }
        : st;
    return { kind: 'proceed-to-attack', st: clearedSt, narrative, movementHeaderPrinted: false };
  }

  narrative += `\n\n[${enemy.name}'s turn]`;
  const plan = planEnemyApproach({
    st,
    seed,
    enemyId,
    enemyPos: enemyEntPreMove.pos,
    targetPos: targetEntPreMove.pos,
    reachFt,
    speedFt: effectiveEnemySpeedFt,
    context,
    roomId: st.current_room,
    roomObstacles: roomObstacleCells,
  });
  const distBefore = distanceFeet(enemyEntPreMove.pos, targetEntPreMove.pos);
  if (!plan || plan.pathSquares.length === 0) {
    narrative += fearHeld
      ? ` ${enemy.name} is too frightened to advance on ${target.name} this turn.`
      : enemyImmobile
        ? ` ${enemy.name} is held in place (${enemyEntPreMove.conditions.includes('restrained') ? 'restrained' : 'grappled'}) and can't reach ${target.name} this turn.`
        : ` ${enemy.name} can't find a path to ${target.name} this turn.`;
    return { kind: 'skip-turn', st, narrative };
  }

  // Apply PC opportunity attacks from squares the enemy is leaving.
  const oaTriggers = opportunityAttackTriggers(
    enemyEntPreMove.pos,
    plan.newPos,
    st.entities ?? [],
    true
  );
  const oaRes = applyPcOpportunityAttacks({
    st,
    enemyId,
    oaTargets: oaTriggers,
    enemyAc: enemy.ac,
    enemyName: enemy.name,
    context,
  });
  let nextSt = oaRes.st;
  const stepsFt = plan.pathSquares.length * SQUARE_SIZE;
  narrative += ` ${enemy.name} closes ${stepsFt} ft toward ${target.name} (${distBefore} ft → ${distanceFeet(plan.newPos, targetEntPreMove.pos)} ft).${oaRes.narrative}`;
  if (oaRes.enemyKilled) {
    return { kind: 'skip-turn', st: nextSt, narrative };
  }

  // Commit the new enemy position + stamp the charge distance (feet moved
  // straight toward the target this turn — read by the charge rider in
  // computeEnemyAttack).
  nextSt = {
    ...nextSt,
    entities: (nextSt.entities ?? []).map((e) =>
      e.id === enemyId ? { ...e, pos: plan.newPos, charged_ft: stepsFt } : e
    ),
  };
  if (!plan.reached) {
    narrative += ` ${enemy.name} is still out of reach — no attack this round.`;
    return { kind: 'skip-turn', st: nextSt, narrative };
  }
  return { kind: 'proceed-to-attack', st: nextSt, narrative, movementHeaderPrinted: true };
}

/**
 * Enemy spell-cast intent + resolution. Called at the start of an
 * enemy's turn before the melee/multiattack path. Returns one of three
 * outcomes:
 *
 *   - `'no-cast'` — the enemy doesn't have a spell list, the
 *     castChance roll missed, the spell doesn't deal damage, or the
 *     caller is mid-multiattack (`resumeMi > 0`). Fall through to
 *     melee.
 *   - `'counterspell-pending'` — a party PC qualifies for Counterspell;
 *     `pending_reaction` is staged + active_character_id moved to the
 *     reactor. Caller returns `{paused: true}` immediately.
 *   - `'spell-resolved'` — no counterspeller available; the spell
 *     resolves now and damage is committed. Caller advances initiative
 *     and continues (the spell IS this turn's action, no melee follows).
 *
 * Extracted from `runEnemyTurns` as part of the architecture audit #5
 * refactor. The block was ~90 lines of deeply-nested branches; lifting
 * it gives the closure a clean three-way dispatch and exposes the
 * outcome surface for direct tests.
 */
/**
 * AoE enemy damage spell (Fireball, Cone of Cold, Lightning Bolt, …) — the
 * mirror of the PC `runAoeSpell` from the other side. The epicenter is the
 * chosen target PC's cell (sphere) or the directional shape (cone/line/cube)
 * extends from the caster toward it. Damage is rolled ONCE (SRD 5.2.1: one roll
 * for the whole spell) and applied to every party-side creature in the area;
 * each rolls its own save — a failure takes full damage, a success takes half
 * on `saveEffect: 'half'` (none on `'negates'`). Evasion zeroes a successful DEX
 * save-for-half. A dual-type spell's second component (Flame Strike's radiant)
 * is rolled once and applied the same way. Friendly fire is skipped — the caster
 * spares its own allies. Unlike the single-target path, an AoE cast does NOT
 * open the interactive Indomitable reroll window (saves resolve immediately);
 * Counterspell still gates the whole spell upstream in `attemptEnemySpellCast`.
 */
// Apply an enemy AoE spell's rider condition to a PC who failed its save
// (an enemy casting a Sunburst/Weird-style spell → Blinded / Frightened). The
// mirror of the PC-side AoE rider: respects condition immunity, stamps the
// spell's duration (else the condition table default), records the fear/charm
// source. Returns the updated state + a note fragment.
function applyEnemySpellConditionToPc(
  st: GameState,
  spell: Spell,
  pcId: string,
  enemyId: string
): { st: GameState; note: string } {
  const cond = spell.condition;
  if (!cond) return { st, note: '' };
  const pc = st.characters.find((c) => c.id === pcId);
  if (!pc || pc.dead || pc.conditions.includes(cond)) return { st, note: '' };
  if (conditionImmunitiesFor(pc, st).has(cond))
    return { st, note: ` ${pc.name} is immune to ${cond}.` };
  const sourceId = cond === 'frightened' || cond === 'charmed' ? enemyId : undefined;
  let updated = inflictCondition(pc, cond, sourceId);
  if (spell.conditionDuration) {
    updated = {
      ...updated,
      condition_durations: { ...updated.condition_durations, [cond]: spell.conditionDuration },
    };
  }
  return { st: commitCharacter(st, updated), note: ` ${pc.name} is ${cond}!` };
}

function resolveEnemyAoeSpell(args: {
  enemy: Enemy;
  spell: Spell;
  target: Character;
  st: GameState;
  narrative: string;
  context?: Context;
  casterPos?: GridPos;
  epicenter: GridPos;
  entities: CombatEntity[];
}): { st: GameState; target: Character; narrative: string } {
  const { enemy, spell, casterPos, epicenter, entities } = args;
  let st = args.st;
  const shape = spell.aoeShape ?? 'sphere';
  const radius = spell.blastRadius ?? 0;
  const dc = enemy.spellSaveDC ?? 8 + Math.floor((enemy.toHit + 5) / 2);
  const save = spell.savingThrow ?? 'dex';

  const inArea =
    shape === 'cone' && casterPos
      ? entitiesInCone(casterPos, epicenter, radius, entities)
      : shape === 'line' && casterPos
        ? entitiesInLine(casterPos, epicenter, radius, entities)
        : shape === 'cube' && casterPos
          ? entitiesInCube(casterPos, epicenter, radius, entities)
          : entitiesInBlast(epicenter, radius, entities);
  // Party-side creatures only (no friendly fire), resolved against live PCs.
  const victimIds = new Set(inArea.filter((e) => !e.isEnemy).map((e) => e.id));

  // SRD — one damage roll for the whole spell, shared by every target.
  const dmgRoll = rollDice(spell.damage ?? '0');
  const dmgRoll2 = spell.damage2 ? rollDice(spell.damage2) : 0;
  const half = (n: number): number => Math.floor(n / 2);

  let narrative = args.narrative + ` ${enemy.name} unleashes ${spell.name}!`;
  const struck = st.characters.filter((c) => !c.dead && victimIds.has(c.id));
  for (const c of struck) {
    const saveScore = (c[save] ?? 10) as number;
    const saveProf =
      args.context && hasSaveProficiency(c, save, args.context) ? profBonus(c.level) : 0;
    const dangerSenseAdv = save === 'dex' && hasDangerSense(c);
    const d20 = dangerSenseAdv ? Math.max(rollDice('1d20'), rollDice('1d20')) : rollDice('1d20');
    const total = d20 + abilityMod(saveScore) + saveProf + auraOfProtectionBonus(c, st);
    const saved = total >= dc;
    const evasion = save === 'dex' && spell.saveEffect === 'half' && hasEvasion(c);
    const effOf = (rolled: number): number => {
      if (evasion) return saved ? 0 : half(rolled);
      if (saved) return spell.saveEffect === 'half' ? half(rolled) : 0;
      return rolled;
    };
    const dmg = effOf(dmgRoll) + effOf(dmgRoll2);
    const evasionNote = evasion ? ' ✦ Evasion' : '';
    const newHp = Math.max(0, c.hp - dmg);
    st = commitCharacter(st, { ...c, hp: newHp });
    narrative += ` ${c.name} ${fmt.save(save.toUpperCase(), total)} vs ${fmt.dc(dc)} — ${saved ? 'saves' : 'fails'}, ${fmt.dmg(dmg)} ${spell.damageType ?? 'damage'}.${evasionNote}`;
    // SRD AoE rider condition (Sunburst → Blinded, Weird → Frightened): a PC who
    // failed and is still standing gains the spell's condition.
    if (!saved && spell.condition && newHp > 0) {
      const cr = applyEnemySpellConditionToPc(st, spell, c.id, enemy.id);
      st = cr.st;
      narrative += cr.note;
    }
  }
  if (struck.length === 0) narrative += ' No one is caught in the blast.';
  const primary = st.characters.find((c) => c.id === args.target.id) ?? args.target;
  return { st, target: primary, narrative };
}

/**
 * Resolve an enemy's damage spell against a PC: roll damage, apply the
 * saving throw (half / negates / full), reduce HP, and commit. Extracted
 * from `attemptEnemySpellCast` so the resolution runs through the dispatched
 * `enemy_cast` handler (EE-3) while the cast DECISION + Counterspell window
 * stay in the orchestrator. The enemy spell model is the stripped-down
 * `{ damage, savingThrow, saveEffect, damageType }` — distinct from the PC
 * `castSpell` pipeline by design (same split as the EE-2 attack resolvers).
 * AoE spells (with `blastRadius`) branch to `resolveEnemyAoeSpell`.
 */
// Resolve an enemy's single-target CONDITION spell (Hold Person → Paralyzed,
// Cause Fear → Frightened) against a PC. Uses the canonical conditionSavingThrow
// — proficiency, Aura of Protection, and the auto-resolving rerolls (Indomitable,
// Stroke of Luck, Lucky, Dark One's Luck, Improve Fate, Bardic, Countercharm) —
// so the condition lands only on a CONFIRMED failed save. The rerolls
// auto-resolve here (no interactive window, unlike the PC-side onHitEffect path).
function resolveEnemyConditionCast(args: {
  enemy: Enemy;
  spell: Spell;
  target: Character;
  st: GameState;
  narrative: string;
  context?: Context;
}): { st: GameState; target: Character; narrative: string } {
  const { enemy, spell, target } = args;
  const cond = spell.condition!;
  let st = args.st;
  let narrative = `${args.narrative} ${enemy.name} casts ${spell.name} at ${target.name}!`;
  if (conditionImmunitiesFor(target, st).has(cond)) {
    return {
      st,
      target,
      narrative: `${narrative} ${fmt.note(`[${target.name} is immune to ${cond}]`)}`,
    };
  }
  const ability = spell.savingThrow;
  const dc = enemy.spellSaveDC ?? 8 + Math.floor((enemy.toHit + 5) / 2);
  let updated = target;
  let applied: boolean;
  if (ability && args.context) {
    const res = conditionSavingThrow(
      { condition: cond, ability, dc } as OnHitEffect & { ability: AbilityKey; dc: number },
      updated,
      st,
      args.context,
      auraOfProtectionBonus(updated, st),
      false // auto-resolve the PC's rerolls inline (no interactive window)
    );
    applied = res.applied;
    if (res.indomitableConsumed) {
      updated = consumeIndomitable(updated);
      narrative += ' ✦ Indomitable — rerolled the save!';
    }
    if (res.strokeOfLuckConsumed) updated = consumeStrokeOfLuck(updated);
    if (res.darkOnesLuckConsumed) updated = consumeDarkOnesLuck(updated);
    if (res.improveFateConsumed) updated = consumeImproveFate(updated);
    if (res.inspirationConsumed) {
      updated = {
        ...updated,
        inspiration: false,
        turn_actions: { ...updated.turn_actions, inspiration_pending: false },
      };
    }
    if (res.luckConsumed) {
      updated = { ...updated, turn_actions: { ...updated.turn_actions, luck_pending: false } };
    }
    if (res.bardicInspirationConsumed) updated = { ...updated, bardic_inspiration_die: undefined };
    if (res.countercharmBardId) {
      const bardId = res.countercharmBardId;
      if (bardId === updated.id) {
        updated = { ...updated, turn_actions: { ...updated.turn_actions, reaction_used: true } };
      } else {
        st = {
          ...st,
          characters: st.characters.map((c) =>
            c.id === bardId ? { ...c, turn_actions: { ...c.turn_actions, reaction_used: true } } : c
          ),
        };
      }
    }
  } else {
    // No save ability / no context (unit harness) — plain save vs DC.
    const score = ability ? ((target[ability] ?? 10) as number) : 10;
    applied = ability ? rollDice('1d20') + abilityMod(score) < dc : true;
  }
  if (applied) {
    const src = cond === 'frightened' || cond === 'charmed' ? enemy.id : undefined;
    updated = inflictCondition(updated, cond, src);
    if (cond === 'charmed') updated = { ...updated, charmer_id: enemy.id };
    if (spell.conditionDuration) {
      updated = {
        ...updated,
        condition_durations: { ...updated.condition_durations, [cond]: spell.conditionDuration },
      };
    }
    narrative += ` ${target.name} is ${cond}!`;
  } else {
    narrative += ` ${target.name} resists.`;
  }
  return { st: commitCharacter(st, updated), target: updated, narrative };
}

export function resolveEnemySpell(args: {
  enemy: Enemy;
  spell: Spell;
  target: Character;
  st: GameState;
  narrative: string;
  // SRD — a creature adds its proficiency bonus to saving throws it's
  // proficient in. Threaded so this resolver can credit class save proficiency
  // + the features that widen it (Resilient, Slippery Mind, Disciplined
  // Survivor). Optional: when omitted (unit tests that pin other mechanics) the
  // proficiency bonus is skipped, preserving their dice math.
  context?: Context;
}): {
  st: GameState;
  target: Character;
  narrative: string;
  // Set when a failed damage-spell save deferred to an interactive Indomitable
  // reroll; the caller (`attemptEnemySpellCast` → `runEnemyTurns`) opens the
  // `save_reroll` window with resume coords.
  pendingSaveReroll?: PendingSaveRerollInfo;
} {
  const { enemy, spell, target } = args;
  let narrative = args.narrative;
  // Pure single-target condition spell (Hold Person, Cause Fear): no damage, not
  // an area — resolve the save + apply the condition (with the PC's rerolls).
  if (spell.condition && !spell.damage && !spell.blastRadius) {
    const r = resolveEnemyConditionCast({ ...args, narrative });
    return { st: r.st, target: r.target, narrative: r.narrative };
  }
  // AoE damage spell (Fireball, Cone of Cold, …): when the grid is populated and
  // both the caster and the chosen epicenter PC have positions, every party-side
  // creature in the area rolls its own save. Falls through to the single-target
  // path when positions are missing (unit tests that pin the dice math).
  if (spell.blastRadius && args.st.entities) {
    const ents = args.st.entities;
    const casterPos = ents.find((e) => e.id === enemy.id && e.isEnemy)?.pos;
    const epicenter = ents.find((e) => e.id === target.id && !e.isEnemy)?.pos;
    if (epicenter) {
      const r = resolveEnemyAoeSpell({
        enemy,
        spell,
        target,
        st: args.st,
        narrative,
        context: args.context,
        casterPos,
        epicenter,
        entities: ents,
      });
      return { st: r.st, target: r.target, narrative: r.narrative };
    }
  }
  const dmgRoll = rollDice(spell.damage ?? '0');
  let newTarget: Character;
  let pendingSaveReroll: PendingSaveRerollInfo | undefined;
  if (spell.savingThrow) {
    const saveScore = (target[spell.savingThrow] ?? 10) as number;
    const dc = enemy.spellSaveDC ?? 8 + Math.floor((enemy.toHit + 5) / 2);
    // SRD proficiency bonus on the save when the target is proficient in this
    // ability's saving throw (class grant / Resilient / Slippery Mind /
    // Disciplined Survivor). Without `context` we can't resolve class saves, so
    // it's skipped.
    const saveProf =
      args.context && hasSaveProficiency(target, spell.savingThrow, args.context)
        ? profBonus(target.level)
        : 0;
    // SRD Barbarian Danger Sense (L2): Advantage on DEX saves.
    const dangerSenseAdv = spell.savingThrow === 'dex' && hasDangerSense(target);
    const saveD20 = dangerSenseAdv
      ? Math.max(rollDice('1d20'), rollDice('1d20'))
      : rollDice('1d20');
    const save =
      saveD20 + abilityMod(saveScore) + saveProf + auraOfProtectionBonus(target, args.st);
    let saved = save >= dc;
    let workingTarget = target;
    let rescueNote = '';
    // SRD Evasion (Rogue/Monk L7): on a DEX save-for-half, take no damage
    // on a success and half on a failure (vs the normal half / full).
    const evasion =
      spell.savingThrow === 'dex' && spell.saveEffect === 'half' && hasEvasion(target);
    // Damage for a given save outcome (used both for the committed damage and
    // the interactive Indomitable refund = failed-minus-saved).
    const dmgFor = (didSave: boolean): number => {
      if (evasion) return didSave ? 0 : Math.floor(dmgRoll / 2);
      if (didSave && spell.saveEffect === 'half') return Math.floor(dmgRoll / 2);
      if (didSave && spell.saveEffect === 'negates') return 0;
      return dmgRoll;
    };
    // SRD Fighter Indomitable — INTERACTIVE: a failed damage-spell save defers
    // to a `save_reroll` window (the player chooses whether to spend the
    // per-rest reroll). Pre-roll the outcome here; the window refunds the
    // failed-minus-saved damage on an accept that succeeds.
    if (!saved && indomitableRemaining(target) > 0) {
      const reroll =
        rollDice('1d20') +
        abilityMod(saveScore) +
        saveProf +
        auraOfProtectionBonus(target, args.st) +
        indomitableBonus(target);
      pendingSaveReroll = {
        source: 'indomitable',
        reactorId: target.id,
        reactorName: target.name,
        succeeds: reroll >= dc,
        saveAbility: spell.savingThrow,
        saveDc: dc,
        damageRefund: dmgFor(false) - dmgFor(true),
      };
    }
    // SRD Rogue Stroke of Luck — auto (not an interactive prompt): turn the
    // failed save into a 20 when it rescues. If it rescues, there's nothing for
    // Indomitable to do, so drop the deferred window.
    if (!saved && strokeOfLuckAvailable(target)) {
      const mods = abilityMod(saveScore) + saveProf + auraOfProtectionBonus(target, args.st);
      if (20 + mods >= dc) {
        saved = true;
        workingTarget = consumeStrokeOfLuck(target);
        rescueNote = ' ✦ Stroke of Luck';
        pendingSaveReroll = undefined;
      }
    }
    const evasionNote = evasion ? ' ✦ Evasion' : '';
    const dmg = dmgFor(saved);
    newTarget = { ...workingTarget, hp: Math.max(0, workingTarget.hp - dmg) };
    narrative += ` ${enemy.name} casts ${spell.name}! ${target.name} ${fmt.save(spell.savingThrow.toUpperCase(), save)} vs ${fmt.dc(dc)} — ${saved ? 'saves' : 'fails'}, ${fmt.dmg(dmg)} ${spell.damageType ?? 'damage'}.${rescueNote}${evasionNote}`;
  } else {
    newTarget = { ...target, hp: Math.max(0, target.hp - dmgRoll) };
    narrative += ` ${enemy.name} casts ${spell.name}! ${target.name} takes ${fmt.dmg(dmgRoll)} ${spell.damageType ?? 'damage'}.`;
  }
  return {
    st: commitCharacter(args.st, newTarget),
    target: newTarget,
    narrative,
    pendingSaveReroll,
  };
}

async function attemptEnemySpellCast(args: {
  enemy: Enemy;
  enemyId: string;
  enemyEnt: CombatEntity | undefined;
  target: Character;
  targetCharIdx: number;
  st: GameState;
  context: Context;
  resumeMi: number;
  advIdx: number;
  orderLen: number;
  narrative: string;
  seed: Seed;
  worldName: string;
}): Promise<
  | { kind: 'no-cast' }
  | { kind: 'counterspell-pending'; st: GameState; narrative: string }
  | {
      kind: 'spell-resolved';
      st: GameState;
      target: Character;
      narrative: string;
      pendingSaveReroll?: PendingSaveRerollInfo;
    }
> {
  const {
    enemy,
    enemyId,
    enemyEnt,
    target,
    targetCharIdx,
    st,
    context,
    resumeMi,
    advIdx,
    orderLen,
  } = args;
  let narrative = args.narrative;
  // `resumeMi > 0` means we're already mid-multiattack from a prior
  // pause/resume cycle — don't re-decide cast intent.
  if (
    resumeMi !== 0 ||
    !enemy.spells ||
    enemy.spells.length === 0 ||
    (enemy.castChance ?? 0) === 0 ||
    Math.random() >= (enemy.castChance ?? 0)
  ) {
    return { kind: 'no-cast' };
  }
  const spellId = pick(enemy.spells);
  const spell = context.spellTable?.[spellId];
  // The enemy resolver handles damage spells and single-target condition spells
  // (Hold Person, Cause Fear). Anything else (pure narrative) isn't castable.
  if (!spell?.damage && !spell?.condition) return { kind: 'no-cast' };

  // SRD anti-magic suppression — an enemy spell crossing an Antimagic Field /
  // Globe of Invulnerability (or cast within an act-scoped dead-magic field)
  // fizzles before it's cast.
  const supTargetPos = st.entities?.find((e) => e.id === target.id && !e.isEnemy)?.pos;
  if (isSpellSuppressed(st, enemyId, supTargetPos, spell.level, context).blocked) {
    return { kind: 'no-cast' };
  }

  // Counterspell eligibility — check all party PCs.
  const reactor = st.characters.find((c) =>
    isCounterspellEligible(c, st.entities?.find((e) => e.id === c.id)?.pos, enemyEnt?.pos, context)
  );
  if (reactor) {
    const stagedSt: GameState = {
      ...st,
      pending_reaction: {
        kind: 'counterspell',
        attackerEnemyId: enemyId,
        targetCharId: reactor.id,
        intendedTargetPcId: target.id,
        enemySpellId: spellId,
        enemySpellLevel: spell.level,
        enemySpellName: spell.name,
        // Counterspell collapses the WHOLE enemy turn — there's no
        // further sub-attack to resume to. Point past this enemy so
        // the loop continues with the next initiative slot.
        resumeFromInitiativeIdx: (advIdx + 1) % orderLen,
        resumeFromMultiattackIdx: 0,
        narrativeSoFar: narrative,
        eligibleCharIds: [reactor.id],
      },
      active_character_id: reactor.id,
    };
    narrative += ` ✨ ${enemy.name} begins casting ${spell.name}! Counterspell available.`;
    return { kind: 'counterspell-pending', st: stagedSt, narrative };
  }

  // No counterspeller — resolve the spell through the dispatcher with an
  // enemy actor (EE-3). The handler runs `resolveEnemySpell` and commits the
  // damaged target into ctx.st; we read it back by index for the caller.
  const castCtx = buildEnemyActionCtx({
    st,
    seed: args.seed,
    context,
    worldName: args.worldName,
    enemy,
    ent: enemyEnt,
    narrative,
  });
  await dispatchAction(castCtx, { type: 'enemy_cast', spellId, targetCharId: target.id });
  return {
    kind: 'spell-resolved',
    st: castCtx.st,
    target: castCtx.st.characters[targetCharIdx] ?? target,
    narrative: castCtx.narrative,
    pendingSaveReroll: castCtx.enemyCastSaveReroll,
  };
}

/**
 * Pick the nearest living non-companion PC for an enemy to attack.
 * Returns the enemy's own entity (for downstream positioning checks),
 * the chosen target entity, and the target's index in `st.characters`
 * (so callers can write back updates without re-searching).
 *
 * `targetCharIdx === -1` means no eligible target (no living PCs in
 * range, or all are companions). Callers should advance the
 * initiative slot when this happens.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5). The
 * extraction makes the target-selection contract observable and sets
 * up a future swap-in for per-enemy targeting AI (e.g., focus the
 * lowest-HP PC, target the cleric first, etc.) without touching the
 * surrounding closure.
 */
/**
 * The combat side an entity fights for. Falls back to `isEnemy` /
 * `isCompanion` when `side` is unset (back-compat for entities created
 * before the field existed). (RE-1 Phase 4.)
 */
export function entitySide(e: CombatEntity): EntitySide {
  return e.side ?? (e.isEnemy ? 'enemy' : e.isCompanion ? 'ally' : 'pc');
}

/**
 * Sides an actor on `side` will attack. Enemies target PCs only for now
 * — companions / summons (`'ally'`) become valid enemy targets in P4.3
 * (a deliberate behavior change with its own tests). Today's enemy
 * targeting (nearest PC, skipping companions) is preserved.
 */
export function hostileTargetSides(side: EntitySide): EntitySide[] {
  return side === 'enemy' ? ['pc'] : ['enemy'];
}

/**
 * Nearest living hostile combatant to the actor, keyed on `side`
 * (generalizes the enemy-only `selectEnemyMeleeTarget`). `targetCharIdx`
 * is the `st.characters` index when the target is a PC, else -1.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5) and generalized
 * to any actor side for RE-1 Phase 4. Behavior-preserving for enemies:
 * `hostileTargetSides('enemy')` is `['pc']`, equivalent to the prior
 * `!isEnemy && !isCompanion` filter.
 */
export function selectTarget(
  actorId: string,
  st: GameState
): {
  actorEnt: CombatEntity | undefined;
  targetEnt: CombatEntity | undefined;
  targetCharIdx: number;
} {
  const actorEnt = st.entities?.find((e) => e.id === actorId);
  const targetSides: EntitySide[] = actorEnt ? hostileTargetSides(entitySide(actorEnt)) : ['pc'];
  // SRD Charmed — a Charmed creature can't attack its charmer. Drop the charmer
  // from the candidate pool; if that leaves no target, the creature stands down
  // (the caller's `targetCharIdx < 0` gate ends its turn).
  const charmerId = actorEnt?.conditions?.includes('charmed') ? actorEnt.charmer_id : undefined;
  const candidates = (st.entities ?? []).filter(
    (e) => targetSides.includes(entitySide(e)) && e.hp > 0 && e.id !== charmerId
  );
  // RAW player-command (summons): honor an explicit commanded target while
  // it's alive and still a valid hostile; otherwise fall back to the
  // AI-default nearest enemy. (RE-1 Phase 4.5.)
  const commanded = actorEnt?.commanded_target_id
    ? candidates.find((e) => e.id === actorEnt.commanded_target_id)
    : undefined;
  const targetEnt =
    commanded ??
    [...candidates].sort((a, b) => {
      if (!actorEnt) return 0;
      return distanceFeet(actorEnt.pos, a.pos) - distanceFeet(actorEnt.pos, b.pos);
    })[0];
  const targetCharIdx = st.characters.findIndex((c) => c.id === targetEnt?.id && !c.dead);
  return { actorEnt, targetEnt, targetCharIdx };
}

/**
 * Apply damage to a non-PC combatant entity (enemy or ally / summon),
 * clamping HP to >= 0. PCs route damage through `applyDamage` +
 * `commitCharacter` instead (temp HP, concentration, exhaustion clamp);
 * non-PC combatants have only an entity HP pool. (RE-1 Phase 4.)
 */
export function applyDamageToEntity(st: GameState, entityId: string, dmg: number): GameState {
  return {
    ...st,
    entities: (st.entities ?? []).map((e) =>
      e.id === entityId ? { ...e, hp: Math.max(0, e.hp - dmg) } : e
    ),
  };
}

/**
 * SRD forced displacement (Thunderwave, Gust of Wind). Push `entityId`
 * `pushFt` feet directly away from `fromPos` (the caster), stopping at the
 * grid edge or the first blocker — pathed via `planEnemyApproach` toward the
 * away-edge with the push distance as the movement budget (the same primitive
 * Compulsion's stagger uses). Returns the new state + how far the creature
 * was actually moved (0 if cornered).
 */
export function pushEntityAway(
  st: GameState,
  entityId: string,
  fromPos: GridPos,
  pushFt: number,
  context: Context,
  seed: Seed,
  roomId: string,
  roomObstacles: GridPos[] = []
): { st: GameState; pushedFt: number } {
  const ent = st.entities?.find((e) => e.id === entityId);
  if (!ent || pushFt <= 0) return { st, pushedFt: 0 };
  const epos = ent.pos;
  const { w: gw, h: gh } = combatGridDims(roomId, seed, context);
  const dy = Math.sign(epos.y - fromPos.y);
  let dx = Math.sign(epos.x - fromPos.x);
  if (dx === 0 && dy === 0) dx = 1; // overlapping — pick a direction
  const awayTarget = {
    x: Math.max(0, Math.min(gw - 1, epos.x + dx * gw)),
    y: Math.max(0, Math.min(gh - 1, epos.y + dy * gh)),
  };
  const plan = planEnemyApproach({
    st,
    seed,
    enemyId: entityId,
    enemyPos: epos,
    targetPos: awayTarget,
    reachFt: 0,
    speedFt: pushFt,
    context,
    roomId,
    roomObstacles,
  });
  if (!plan || plan.pathSquares.length === 0) return { st, pushedFt: 0 };
  return {
    st: {
      ...st,
      entities: (st.entities ?? []).map((e) =>
        e.id === entityId ? { ...e, pos: plan.newPos } : e
      ),
    },
    pushedFt: plan.pathSquares.length * SQUARE_SIZE,
  };
}

/**
 * SRD Dominate — "Whenever the target takes damage, it repeats the save,
 * ending the spell on itself on a success." Call (with the active
 * `ActionContext`) after a `dominated` enemy survives an instance of damage:
 * roll the enemy's WIS save against the controlling caster's stamped DC, and
 * on success drop the caster's concentration (which strips `dominated` from
 * the entity) and append a break-free note. No-op when the target isn't
 * dominated or is already down. Mutates `ctx.st`/`ctx.narrative` (and the
 * caster's actor clone when the dominator is the acting PC, so the
 * end-of-action commit doesn't restore the concentration).
 */
export function dominatedDamageReSave(
  ctx: {
    st: GameState;
    seed: Seed;
    context?: Context;
    narrative: string;
    actor: { kind: string; char?: Character };
  },
  targetId: string,
  targetName: string
): void {
  const ent = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
  if (!ent || ent.hp <= 0 || !ent.conditions.includes('dominated')) return;
  const caster = ctx.st.characters.find(
    (c) => c.concentrating_on?.condition === 'dominated' && !c.dead
  );
  const dc = caster?.concentrating_on?.save_dc ?? 13;
  const stats = getEnemyById(ctx.seed, targetId);
  const wis = (stats as unknown as Record<string, number>)?.wis ?? 10;
  const failed = rollConditionSave('wis', wis, dc, false, 1, 0, ent.conditions);
  if (failed) return;
  // Save succeeded — the spell ends on the target. For single-target Dominate
  // that means the caster's concentration drops (which clears `dominated`).
  if (caster) {
    const res = breakConcentration(caster, ctx.st, ctx.context);
    ctx.st = {
      ...res.st,
      characters: res.st.characters.map((c) => (c.id === caster.id ? res.char : c)),
    };
    // If the dominator is the acting PC, clear the concentration on the actor
    // clone too — otherwise the end-of-action commit writes the stale value back.
    if (ctx.actor.kind === 'pc' && ctx.actor.char?.id === caster.id) {
      ctx.actor.char = { ...ctx.actor.char, concentrating_on: null };
    }
  } else {
    // No caster found (defensive) — just clear the condition off the entity.
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === targetId && e.isEnemy
          ? { ...e, conditions: e.conditions.filter((c) => c !== 'dominated') }
          : e
      ),
    };
  }
  ctx.narrative += ` The ${targetName} breaks free of domination!`;
}

/**
 * Spawn an ally combatant (companion / summon) into combat: add the
 * entity to `entities` and an `is_enemy: false` slot to
 * `initiative_order` (placed right after `afterId` — e.g. the summoning
 * caster — so it acts alongside its owner, else appended). The caller
 * builds the `CombatEntity` (side: 'ally', stat block, `summoned_by`,
 * `summon_concentration`). (RE-1 Phase 4.)
 */
export function addAllyCombatant(
  st: GameState,
  ally: CombatEntity,
  opts?: { initiativeRoll?: number; afterId?: string }
): GameState {
  const entry = { id: ally.id, roll: opts?.initiativeRoll ?? 0, is_enemy: false };
  const order = st.initiative_order ?? [];
  const afterIdx = opts?.afterId ? order.findIndex((e) => e.id === opts.afterId) : -1;
  const nextOrder =
    afterIdx >= 0
      ? [...order.slice(0, afterIdx + 1), entry, ...order.slice(afterIdx + 1)]
      : [...order, entry];
  return {
    ...st,
    entities: [...(st.entities ?? []), ally],
    initiative_order: nextOrder,
  };
}

/**
 * Remove a combatant (typically an ally / summon) from combat: drop it
 * from both `entities` and `initiative_order`. Note: removing an
 * initiative slot shifts later indices, so callers mid-turn-loop must
 * re-derive any in-flight `initiative_idx`. (RE-1 Phase 4.)
 */
export function removeCombatant(st: GameState, entityId: string): GameState {
  return {
    ...st,
    entities: (st.entities ?? []).filter((e) => e.id !== entityId),
    initiative_order: (st.initiative_order ?? []).filter((e) => e.id !== entityId),
  };
}

/**
 * Materialize `state.summoned_allies` into combat: for each persistent
 * ally owned by a living PC who's present, add an `ally` `CombatEntity`
 * (positioned just behind its owner) + an initiative slot right after
 * the owner via `addAllyCombatant`. Idempotent (skips allies already on
 * the grid) and a no-op when there are no summons — so existing combats
 * are unaffected. Called from `runCombatStart`. (RE-1 Phase 4.)
 */
export function seedSummonedAllies(st: GameState): GameState {
  let next = st;
  for (const summon of st.summoned_allies ?? []) {
    const owner = next.characters.find((c) => c.id === summon.ownerId && !c.dead);
    if (!owner) continue; // owner dead / not in this party → summon doesn't appear
    if (next.entities?.some((e) => e.id === summon.id)) continue; // already on the grid
    const ownerEnt = next.entities?.find((e) => e.id === summon.ownerId);
    // SRD Mounted Combat — a mount shares its rider's space; everything else
    // tucks in just behind the owner.
    const pos =
      ownerEnt && summon.isMount
        ? { x: ownerEnt.pos.x, y: ownerEnt.pos.y }
        : ownerEnt
          ? { x: ownerEnt.pos.x, y: ownerEnt.pos.y + 1 }
          : { x: 1, y: 2 };
    const ally: CombatEntity = {
      id: summon.id,
      isEnemy: false,
      side: 'ally',
      companionName: summon.name,
      pos,
      hp: summon.maxHp,
      maxHp: summon.maxHp,
      conditions: [],
      condition_durations: {},
      ac: summon.ac,
      toHit: summon.toHit,
      damage: summon.damage,
      summoned_by: summon.ownerId,
      summon_concentration: false,
      noAttack: summon.noAttack,
      // SRD Mounted Combat — auto-mount: bind the steed to its owner. The
      // rider's `mount_id` is stamped below (the owner entity already exists).
      ...(summon.isMount ? { rider_id: summon.ownerId, speed_ft: summon.speed ?? 60 } : {}),
    };
    next = addAllyCombatant(next, ally, {
      afterId: summon.ownerId,
      initiativeRoll: owner.initiative_roll ?? 0,
    });
    // Complete the rider→mount binding on the owner entity.
    if (summon.isMount) {
      next = {
        ...next,
        entities: (next.entities ?? []).map((e) =>
          e.id === summon.ownerId ? { ...e, mount_id: summon.id } : e
        ),
      };
    }
  }
  return next;
}

/**
 * One AI-default turn for an ally combatant (companion / summon): pick
 * the nearest enemy via `selectTarget`, close to melee reach if needed
 * (provoking opportunity attacks from enemies it leaves), then make a
 * single stat-block melee attack. Uses the simple `resolveEnemyAttack`
 * roll + `applyDamageToEntity` — NOT the PC-target `computeEnemyAttack`,
 * whose proposed-snapshot + PC reaction windows allies don't trigger.
 * Allies have no per-creature speed/reach fields yet, so they default to
 * 5 ft reach + the standard movement budget. The RAW player-command
 * override (P4.5) calls the same primitives on the owner's turn.
 * Returns the new state + the action narrative (the caller owns the
 * `[<name>'s turn]` header). (RE-1 Phase 4.)
 */
export function runAllyTurn(args: {
  allyEnt: CombatEntity;
  st: GameState;
  seed: Seed;
  context: Context;
  roomObstacles?: GridPos[];
}): { st: GameState; narrative: string } {
  const { allyEnt, seed, context } = args;
  let st = args.st;
  let narrative = '';
  const allyName = allyEnt.companionName ?? 'Ally';
  const { targetEnt } = selectTarget(allyEnt.id, st);
  if (!targetEnt) return { st, narrative: '' };
  const foe = getEnemyById(seed, targetEnt.id);
  const foeName = foe?.name ?? 'the enemy';
  const foeAc = foe?.ac ?? targetEnt.ac ?? 10;

  // ── SRD Find Familiar — a non-combatant ally can't take the Attack action, so
  // it takes the Help action instead: it harries the nearest foe, granting its
  // owner Advantage on their next attack (`help_target_id`, consumed in
  // `computeToHitContext`). Positioning is abstracted — the familiar flits in.
  if (allyEnt.noAttack) {
    const ownerId = allyEnt.summoned_by;
    const owner = ownerId ? st.characters.find((c) => c.id === ownerId && !c.dead) : undefined;
    if (owner) {
      st = { ...st, help_target_id: owner.id };
      return {
        st,
        narrative: ` ${allyName} harries ${foeName} (Help) — ${owner.name} has Advantage on their next attack.`,
      };
    }
    return { st, narrative: ` ${allyName} scouts the fray but holds back.` };
  }

  // ── Approach if out of melee reach (5 ft). ──────────────────────────
  let moverPos = allyEnt.pos;
  if (distanceFeet(moverPos, targetEnt.pos) > 5) {
    const plan = planEnemyApproach({
      st,
      seed,
      enemyId: allyEnt.id,
      enemyPos: moverPos,
      targetPos: targetEnt.pos,
      reachFt: 5,
      speedFt: DEFAULT_SPEED_FEET,
      context,
      roomId: st.current_room,
      roomObstacles: args.roomObstacles,
    });
    if (!plan || plan.pathSquares.length === 0) {
      return { st, narrative: ` ${allyName} can't find a path to ${foeName} this turn.` };
    }
    // Opportunity attacks from enemies whose reach the ally is leaving
    // (moverIsEnemy: false → the threatening side is the enemies).
    const oaEnemies = opportunityAttackTriggers(moverPos, plan.newPos, st.entities ?? [], false);
    let allyHp = allyEnt.hp;
    for (const oaE of oaEnemies) {
      if (st.enemies_killed.includes(oaE.id)) continue;
      const oaStats = getEnemyById(seed, oaE.id);
      if (!oaStats) continue;
      const oaRes = resolveEnemyAttack(oaStats, allyEnt.ac ?? 10);
      if (oaRes.hit) {
        st = applyDamageToEntity(st, allyEnt.id, oaRes.damage);
        allyHp = Math.max(0, allyHp - oaRes.damage);
        narrative += ` (Opportunity attack from ${oaStats.name}: ${fmt.dmg(oaRes.damage)}!)`;
      }
    }
    moverPos = plan.newPos;
    st = {
      ...st,
      entities: (st.entities ?? []).map((e) =>
        e.id === allyEnt.id ? { ...e, pos: plan.newPos } : e
      ),
    };
    narrative += ` ${allyName} closes ${plan.pathSquares.length * SQUARE_SIZE} ft toward ${foeName}.`;
    if (allyHp <= 0) {
      return { st, narrative: `${narrative} ${allyName} falls before reaching ${foeName}!` };
    }
    if (!plan.reached) {
      return { st, narrative: `${narrative} ${allyName} is still out of reach.` };
    }
  }

  // ── Attack. ─────────────────────────────────────────────────────────
  const res = resolveEnemyAttack(
    { toHit: allyEnt.toHit ?? 0, damage: allyEnt.damage ?? '1d4' },
    foeAc
  );
  if (!res.hit) {
    return {
      st,
      narrative: `${narrative} ${allyName} attacks ${foeName} — ${fmt.roll(res.total)} vs ${fmt.ac(foeAc)}, miss.`,
    };
  }
  st = applyDamageToEntity(st, targetEnt.id, res.damage);
  narrative += ` ${allyName} attacks ${foeName} — ${fmt.roll(res.total)} vs ${fmt.ac(foeAc)}, ${fmt.dmg(res.damage)} damage!`;
  const slain = (st.entities?.find((e) => e.id === targetEnt.id)?.hp ?? 0) <= 0;
  if (slain) {
    st = { ...st, enemies_killed: [...st.enemies_killed, targetEnt.id] };
    narrative += ` ${foeName} is slain!`;
    const anyEnemyLeft = (st.entities ?? []).some(
      (e) => entitySide(e) === 'enemy' && e.hp > 0 && !st.enemies_killed.includes(e.id)
    );
    if (!anyEnemyLeft) st = endCombatState(st);
  }
  return { st, narrative };
}

/**
 * SRD 5.2.1 Hide [Action] prerequisite. RAW: you can attempt to Hide only
 * while you're **Heavily Obscured or behind Three-Quarters / Total Cover**,
 * **and** you must be **out of any enemy's line of sight**. Modelled on the
 * combat grid:
 *   - A **dark** room is Heavily Obscured. Pansori enemies have no darkvision
 *     (see `effectiveLightFor` / the sneak path), so darkness satisfies the
 *     prerequisite outright — no enemy can see you.
 *   - Otherwise, for **every** living enemy on the grid the PC must either be
 *     out of that enemy's line of sight (a solid obstacle between them = Total
 *     Cover) or have at least **Three-Quarters Cover** (`coverBonus` === 5).
 *     Half cover and open ground don't qualify — RAW.
 *
 * Dim light is only *lightly* obscured (Disadvantage on the searcher's sight
 * Perception, handled on the find side), so it does NOT by itself permit
 * Hiding. Degrades to allowed when off-grid (no tracked entities) — there's no
 * position to verify, so the attempt is trusted.
 */
export function canAttemptHide(
  char: Character,
  st: GameState,
  seed: Seed
): { allowed: boolean; reason: string } {
  const lighting = seed.rooms.find((r) => r.id === st.current_room)?.lighting ?? 'bright';
  if (lighting === 'dark') return { allowed: true, reason: '' };
  if (!st.entities) return { allowed: true, reason: '' };
  const self = st.entities.find((e) => e.id === char.id);
  if (!self) return { allowed: true, reason: '' };
  const enemies = st.entities.filter((e) => e.isEnemy && e.hp > 0);
  if (enemies.length === 0) return { allowed: true, reason: '' };
  const obstacles = [
    ...(seed.rooms.find((r) => r.id === st.current_room)?.obstacles ?? []),
    ...wallObstacleCells(st, st.current_room, 'los'),
  ];
  // A watcher is any living enemy that can plainly see the PC: clear line of
  // sight AND less than Three-Quarters Cover. If one exists, Hide is illegal.
  const watcher = enemies.some(
    (en) =>
      hasLineOfSight(en.pos, self.pos, obstacles) && coverBonus(en.pos, self.pos, obstacles) < 5
  );
  if (watcher) {
    return {
      allowed: false,
      reason:
        'you are in the open — without Heavy Obscurement or at least three-quarters cover, a watching enemy can still see you',
    };
  }
  return { allowed: true, reason: '' };
}

/**
 * Hide DC check for an enemy attacking an invisible PC. The SRD
 * Hide rules use a stable hide DC (rolled at Hide-action time and
 * stashed on the character); enemies check against it via passive
 * Perception first, then active Search if passive falls short.
 *
 * Outcomes:
 *   - `'spotted-passive'`: enemy passive ≥ DC → invisible drops, attack proceeds.
 *   - `'spotted-active'`: passive failed but active Search ≥ DC → invisible
 *     drops, but the enemy used their action to Search so no attack this turn.
 *   - `'not-spotted'`: both checks failed → PC stays hidden, no attack this turn.
 *   - `'not-hidden'`: no Hide DC tracked / target not invisible → caller proceeds.
 *
 * Mutates the target's `conditions` (removes invisible) and clears
 * `hide_dc` when the PC is spotted. Returns the updated state.
 *
 * Extracted from `runEnemyTurns` as part of the multi-PR refactor to
 * monsters-as-first-class-action-subjects (architecture audit item
 * #5). The extraction makes the closure thinner and gives future PRs
 * a self-contained handler to wire through the dispatcher.
 */
export function resolveEnemyHideCheck(
  enemy: Enemy,
  target: Character,
  targetCharIdx: number,
  st: GameState
): {
  outcome: 'spotted-passive' | 'spotted-active' | 'not-spotted' | 'not-hidden';
  st: GameState;
  target: Character;
  narrative: string;
} {
  if (!target.conditions?.includes('invisible') || (target.hide_dc ?? 0) === 0) {
    return { outcome: 'not-hidden', st, target, narrative: '' };
  }
  const hideDc = target.hide_dc!;
  const enemyWis = (enemy as unknown as Record<string, number>)?.wis ?? 10;
  const passivePer = 10 + abilityMod(enemyWis);
  if (passivePer >= hideDc) {
    const newTarget: Character = {
      ...target,
      conditions: (target.conditions ?? []).filter((c) => c !== 'invisible'),
      hide_dc: undefined,
    };
    return {
      outcome: 'spotted-passive',
      st: {
        ...st,
        characters: st.characters.map((c, i) => (i === targetCharIdx ? newTarget : c)),
      },
      target: newTarget,
      narrative: ` ${enemy.name} spots ${target.name} (passive Perception ${passivePer} vs hide DC ${hideDc}).`,
    };
  }
  const activeSearch = rollDice('1d20') + abilityMod(enemyWis);
  if (activeSearch >= hideDc) {
    const newTarget: Character = {
      ...target,
      conditions: (target.conditions ?? []).filter((c) => c !== 'invisible'),
      hide_dc: undefined,
    };
    return {
      outcome: 'spotted-active',
      st: {
        ...st,
        characters: st.characters.map((c, i) => (i === targetCharIdx ? newTarget : c)),
      },
      target: newTarget,
      narrative: ` ${enemy.name} actively searches and locates ${target.name}! (Search ${activeSearch} vs hide DC ${hideDc}; attack forfeited this turn.)`,
    };
  }
  return {
    outcome: 'not-spotted',
    st,
    target,
    narrative: ` ${enemy.name} searches the room but cannot find ${target.name}. (Search ${activeSearch} vs hide DC ${hideDc}; turn lost.)`,
  };
}

export async function runEnemyTurns(args: {
  st: GameState;
  seed: Seed;
  context: Context;
  worldName: string;
  startAdvIdx: number;
  startMultiattackIdx: number; // 0 = haven't started; N = N sub-attacks already done
  startRoundWrapped: boolean;
  initialCurrentIdx: number; // anchor for the safety "loop back to start" break
}): Promise<EnemyTurnResult> {
  let st = args.st;
  let narrative = '';
  let advIdx = args.startAdvIdx;
  let roundWrapped = args.startRoundWrapped;
  const orderLen = st.initiative_order.length;
  let resumeMi = args.startMultiattackIdx;
  // Static obstacles in the current room — pathfinding for enemy approach
  // must route around these the same way PC movement does. Includes transient
  // wall spells: their cells block both enemy movement and line of sight.
  const roomObstacleCells = [
    ...(args.seed.rooms.find((r) => r.id === st.current_room)?.obstacles ?? []),
    ...wallObstacleCells(st, st.current_room, 'movement'),
    ...wallObstacleCells(st, st.current_room, 'los'),
  ];

  while (
    st.combat_active &&
    st.initiative_order[advIdx] &&
    (st.initiative_order[advIdx].is_enemy ||
      st.entities?.some(
        (e) => e.id === st.initiative_order[advIdx].id && entitySide(e) === 'ally' && e.hp > 0
      ) ||
      (st.characters.find((c) => c.id === st.initiative_order[advIdx].id)?.dead ?? false))
  ) {
    const eEntry = st.initiative_order[advIdx];
    const rm = getEnemyById(args.seed, eEntry.id);
    // RE-1 Phase 4 — ally (companion / summon) AI-default turn. Fires when
    // this initiative entry is a living side:'ally' entity. Delegated to
    // `runAllyTurn`; the loop only owns the turn header + advance.
    const allyEnt = st.entities?.find((e) => e.id === eEntry.id);
    // SRD Mounted Combat — a controlled mount that's currently ridden gets no
    // independent turn; it moves on its rider's turn (handled in grid_move).
    if (allyEnt && allyEnt.rider_id) {
      resumeMi = 0;
      const prevAdvIdxMount = advIdx;
      advIdx = (advIdx + 1) % orderLen;
      if (advIdx === 0 && prevAdvIdxMount !== 0) roundWrapped = true;
      if (advIdx === args.initialCurrentIdx) break;
      continue;
    }
    if (allyEnt && entitySide(allyEnt) === 'ally' && allyEnt.hp > 0) {
      const allyTurn = runAllyTurn({
        allyEnt,
        st,
        seed: args.seed,
        context: args.context,
        roomObstacles: roomObstacleCells,
      });
      st = allyTurn.st;
      if (allyTurn.narrative) {
        narrative += `\n\n[${allyEnt.companionName ?? 'Ally'}'s turn]${allyTurn.narrative}`;
      }
      resumeMi = 0;
      const prevAdvIdxAlly = advIdx;
      advIdx = (advIdx + 1) % orderLen;
      if (advIdx === 0 && prevAdvIdxAlly !== 0) roundWrapped = true;
      if (advIdx === args.initialCurrentIdx) break;
      continue;
    }
    if (rm && !st.enemies_killed.includes(eEntry.id)) {
      // SRD 5.2.1 — Surprise now imposes Disadvantage on the Initiative roll
      // (applied in buildInitiativeOrder), NOT a skipped turn. So a surprised
      // creature takes its turn normally here; no skip.
      // SRD Banishment — banished creatures are in a harmless
      // demiplane and skip their turn entirely. The condition is
      // cleared by the caster's concentration drop in
      // breakConcentration, so the creature returns the moment the
      // caster takes too much damage or willingly ends the spell.
      const banishedEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (banishedEnt && banishedEnt.conditions.includes('banished')) {
        narrative += `\n\n[${rm.name} is banished — out of reach this turn.]`;
        resumeMi = 0;
        const prevAdvIdxBanish = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxBanish !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD Polymorph — polymorphed creatures retain their
      // personality but use the new form's actions (RAW). Pansori
      // MVP skips their turn entirely — the beast form's attack
      // profile would need to substitute for the seed template's
      // damage/toHit, which is a deeper refactor of computeEnemyAttack.
      // Skipping is the safe simplification; the player still gets
      // value from "this dragon is now a passive wolf for the duration".
      const polymorphedEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (polymorphedEnt && polymorphedEnt.conditions.includes('polymorphed')) {
        const formName = polymorphedEnt.polymorph_state?.formName ?? 'a beast';
        narrative += `\n\n[${rm.name} is polymorphed into ${formName} — no actions this turn.]`;
        resumeMi = 0;
        const prevAdvIdxPoly = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxPoly !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD Command ("Halt") — a commanded creature is compelled to lose
      // its turn (no move or action). The condition is consumed here on
      // the skip, so the command applies for exactly one turn ("on its
      // next turn") and the creature acts normally the round after.
      const commandedEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (commandedEnt && commandedEnt.conditions.includes('commanded')) {
        narrative += `\n\n[${rm.name} is compelled to halt — losing their turn.]`;
        st = {
          ...st,
          entities: (st.entities ?? []).map((e) =>
            e.id === eEntry.id && e.isEnemy
              ? { ...e, conditions: e.conditions.filter((c) => c !== 'commanded') }
              : e
          ),
        };
        resumeMi = 0;
        const prevAdvIdxCmd = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxCmd !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD "save ends" conditions (Power Word Stun's Stunned, Slow's slowed):
      // the creature repeats the save at the END of each of its turns. Modeled
      // at turn start (like Confusion): each condition gets ≥1 full afflicted
      // turn (gated by `save_ends_acted`), then re-saves on each subsequent turn
      // — a success clears it. Runs before the incapacitation skip below so a
      // creature that shakes off Stunned can act this turn.
      const seEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (seEnt?.save_ends && Object.keys(seEnt.save_ends).length > 0) {
        const acted = new Set(seEnt.save_ends_acted ?? []);
        const nextActed = new Set(acted);
        const cleared: string[] = [];
        // SRD Phantasmal Killer / Force — a failed end-of-turn save takes the
        // illusion's psychic damage again. Accrued across save-ends conditions.
        let recurDamage = 0;
        let recurType = '';
        let recurLabel = 'the illusion';
        let recurCasterId: string | undefined;
        for (const [cond, info] of Object.entries(seEnt.save_ends)) {
          if (!acted.has(cond)) {
            nextActed.add(cond); // first afflicted turn — no save yet
            continue;
          }
          const score = (rm as unknown as Record<string, number>)[info.ability] ?? 10;
          const failed = rollConditionSave(
            info.ability,
            score,
            info.dc,
            false,
            1,
            0,
            seEnt.conditions
          );
          if (!failed) {
            cleared.push(cond);
          } else if (info.recurDice) {
            recurDamage += applyDamageMultiplier(
              rollDice(info.recurDice),
              info.recurType,
              rm
            ).damage;
            recurType = info.recurType ?? recurType;
            recurLabel = info.label ?? recurLabel;
            recurCasterId = info.casterId ?? recurCasterId;
          }
        }
        const recurNewHp = Math.max(0, seEnt.hp - recurDamage);
        if (cleared.length > 0 || nextActed.size !== acted.size || recurDamage > 0) {
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) => {
              if (e.id !== eEntry.id || !e.isEnemy) return e;
              const nextSaveEnds = { ...(e.save_ends ?? {}) };
              for (const c of cleared) delete nextSaveEnds[c];
              return {
                ...e,
                hp: recurDamage > 0 ? recurNewHp : e.hp,
                conditions: e.conditions.filter((c) => !cleared.includes(c)),
                save_ends: nextSaveEnds,
                save_ends_acted: [...nextActed].filter((c) => !cleared.includes(c)),
              };
            }),
          };
          if (cleared.length > 0) {
            narrative += `\n\n[${rm.name} shakes off ${cleared.join(', ')}.]`;
          }
          if (recurDamage > 0) {
            narrative += `\n\n[${rm.name} takes ${recurDamage} ${recurType} from ${recurLabel}${recurNewHp <= 0 ? ' and succumbs' : ''}.]`;
          }
          // The recurring tick dropped the creature — resolve the kill (XP to
          // the caster, room-clear) and skip its turn.
          if (recurDamage > 0 && recurNewHp <= 0 && !st.enemies_killed.includes(eEntry.id)) {
            st = { ...st, enemies_killed: [...st.enemies_killed, eEntry.id] };
            if (recurCasterId) {
              const split = splitEncounterXp(st, recurCasterId, rm.xp ?? 10);
              st = split.st;
              const killer = st.characters.find((c) => c.id === recurCasterId);
              if (killer) {
                killer.xp = (killer.xp || 0) + split.share;
                narrative += applyPartyLevelUps(st, killer, args.context);
              }
            }
            if (isRoomCleared(st, args.seed, st.current_room)) st = endCombatState(st);
            resumeMi = 0;
            const prevAdvIdxDot = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdxDot !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }
        }
      }
      // SRD — a creature with an incapacitating condition can't take actions,
      // move, or react: it loses its turn. (Hold Person/Monster's paralyzed,
      // Sleep's unconscious, Power Word Stun / Stunning Strike's stunned, Flesh
      // to Stone's petrified.) Evaluated after the save-ends re-save above.
      const incapConds = ['stunned', 'paralyzed', 'incapacitated', 'unconscious', 'petrified'];
      const incapEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      const incapCond = incapEnt?.conditions.find((c) => incapConds.includes(c));
      if (incapCond) {
        narrative += `\n\n[${rm.name} is ${incapCond} and can't act this turn.]`;
        resumeMi = 0;
        const prevAdvIdxIncap = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxIncap !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD Confusion — a confused creature behaves erratically and re-saves
      // at the END of each of its turns. So it stays confused for at least its
      // first full turn: the loop skips the re-save on that first turn
      // (`confused_acted` unset) and evaluates the end-of-turn save at the
      // START of each subsequent turn (`confused_acted` set) — functionally
      // identical, since nothing affects the creature between its turn's end
      // and its next start. While still confused, 1d10 decides the turn: 1-6
      // lose the turn; 7-8 lash out at a random ally within reach (friendly
      // fire — RAW any creature in reach, narrowed to allies so the party is
      // never hit on this result); 9-10 act normally. Cleared for all targets
      // when the caster's concentration drops.
      const confusedEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (confusedEnt && confusedEnt.conditions.includes('confused')) {
        let stillConfused = true;
        if (confusedEnt.confused_acted) {
          // Deferred end-of-(previous-)turn re-save.
          const confCaster = st.characters.find(
            (c) => c.concentrating_on?.condition === 'confused' && !c.dead
          );
          const confDc = confCaster?.concentrating_on?.save_dc ?? 13;
          const confWis = (rm as unknown as Record<string, number>).wis ?? 10;
          const reSaveFailed = rollConditionSave(
            'wis',
            confWis,
            confDc,
            false,
            1,
            0,
            confusedEnt.conditions
          );
          if (!reSaveFailed) {
            stillConfused = false;
            narrative += `\n\n[${rm.name} shakes off the confusion.]`;
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === eEntry.id && e.isEnemy
                  ? {
                      ...e,
                      conditions: e.conditions.filter((c) => c !== 'confused'),
                      confused_acted: false,
                    }
                  : e
              ),
            };
            // fall through — the recovered creature takes its normal turn.
          }
        }
        if (stillConfused) {
          // Mark that the creature has now spent a turn confused (this gates
          // its end-of-turn re-save, evaluated at the start of its next turn).
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === eEntry.id && e.isEnemy ? { ...e, confused_acted: true } : e
            ),
          };
          const behavior = rollDice('1d10');
          if (behavior <= 8) {
            if (behavior >= 7) {
              // 7-8: melee attack a random creature within reach (RAW). The
              // pool is ANY adjacent creature — other enemies, allies/summons,
              // AND the party — so a confused creature can turn on its own side
              // or lash out at a nearby PC.
              const confPos = confusedEnt.pos;
              const reachable = (st.entities ?? []).filter(
                (e) =>
                  e.id !== eEntry.id &&
                  e.hp > 0 &&
                  !st.enemies_killed.includes(e.id) &&
                  distanceFeet(e.pos, confPos) <= 5
              );
              if (reachable.length > 0) {
                const victim = reachable[Math.floor(Math.random() * reachable.length)];
                const pcVictim = st.characters.find((c) => c.id === victim.id && !c.dead);
                if (pcVictim) {
                  // Attack a party member: roll vs the PC's AC and route damage
                  // through the canonical PC path (temp HP, concentration save,
                  // knockout) — so a hit on the caster can break their own spell.
                  const res = resolveEnemyAttack(
                    { toHit: rm.toHit ?? 0, damage: rm.damage ?? '1d4' },
                    pcVictim.ac ?? 10
                  );
                  if (res.hit) {
                    const dmgRes = applyDamage(pcVictim, st, res.damage, { context: args.context });
                    st = commitCharacter(dmgRes.st, dmgRes.char);
                    narrative += `\n\n[${rm.name} is confused and turns on ${pcVictim.name} — ${res.damage} damage!]`;
                    if (dmgRes.concentrationNote) narrative += ` ${dmgRes.concentrationNote}`;
                    if (dmgRes.knockedOut) narrative += ` ${pcVictim.name} is knocked unconscious!`;
                  } else {
                    narrative += `\n\n[${rm.name} is confused and swings wildly at ${pcVictim.name} — miss.]`;
                  }
                } else {
                  // Attack another combatant entity (enemy, or a party ally / summon).
                  const victimStats = getEnemyById(args.seed, victim.id);
                  const victimAc = victimStats?.ac ?? victim.ac ?? 10;
                  const victimName = victimStats?.name ?? victim.companionName ?? 'a creature';
                  const res = resolveEnemyAttack(
                    { toHit: rm.toHit ?? 0, damage: rm.damage ?? '1d4' },
                    victimAc
                  );
                  if (res.hit) {
                    st = applyDamageToEntity(st, victim.id, res.damage);
                    narrative += `\n\n[${rm.name} is confused and turns on ${victimName} — ${res.damage} damage!]`;
                    if ((st.entities?.find((e) => e.id === victim.id)?.hp ?? 0) <= 0) {
                      narrative += ` ${victimName} is slain!`;
                      // Only enemies count as defeated foes (XP / room-clear) — a
                      // slain party ally or summon must not be logged as a kill.
                      if (victim.isEnemy) {
                        st.enemies_killed = [...st.enemies_killed, victim.id];
                        if (isRoomCleared(st, args.seed, st.current_room)) st = endCombatState(st);
                      }
                    } else if (victim.isEnemy) {
                      // SRD Dominate — a dominated enemy caught by friendly fire
                      // takes damage and so repeats its save to break free.
                      const drCtx = {
                        st,
                        seed: args.seed,
                        context: args.context,
                        narrative: '',
                        actor: { kind: 'enemy' as const },
                      };
                      dominatedDamageReSave(drCtx, victim.id, victimName);
                      st = drCtx.st;
                      narrative += drCtx.narrative;
                    }
                  } else {
                    narrative += `\n\n[${rm.name} is confused and swings wildly at ${victimName} — miss.]`;
                  }
                }
              } else {
                narrative += `\n\n[${rm.name} is confused and flails at nothing.]`;
              }
            } else {
              // 1-6: the creature loses its turn.
              narrative += `\n\n[${rm.name} is confused and wastes its turn.]`;
            }
            resumeMi = 0;
            const prevAdvIdxConf = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdxConf !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }
          // 9-10: acts normally despite the confusion — fall through.
          narrative += `\n\n[${rm.name} acts with purpose despite its confusion.]`;
        }
      }
      // SRD Compulsion — a compelled creature is driven to flee: it uses its
      // full movement to stagger away from the caster (no action), then
      // re-saves (RAW: "after moving in this way, repeat the save"). The
      // direction is fixed to "away from the caster" (pansori simplification).
      // Cleared on a successful re-save or when the caster's concentration drops.
      const compelledEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (compelledEnt && compelledEnt.conditions.includes('compelled')) {
        const compelCaster = st.characters.find(
          (c) => c.concentrating_on?.condition === 'compelled' && !c.dead
        );
        const casterEnt = compelCaster
          ? st.entities?.find((e) => e.id === compelCaster.id && !e.isEnemy)
          : undefined;
        const epos = compelledEnt.pos;
        if (casterEnt) {
          // Aim at the grid edge in the direction away from the caster and path
          // toward it, so the creature moves as far from the caster as its speed
          // allows. The target must stay on-grid or the pathfinder finds no
          // destination cell.
          const { w: gw, h: gh } = combatGridDims(st.current_room, args.seed, args.context);
          const vx = epos.x - casterEnt.pos.x;
          const vy = epos.y - casterEnt.pos.y;
          const awayTarget = {
            x: Math.max(0, Math.min(gw - 1, epos.x + (vx === 0 ? 1 : Math.sign(vx)) * gw)),
            y: Math.max(0, Math.min(gh - 1, epos.y + (vy === 0 ? 1 : Math.sign(vy)) * gh)),
          };
          const plan = planEnemyApproach({
            st,
            seed: args.seed,
            enemyId: eEntry.id,
            enemyPos: epos,
            targetPos: awayTarget,
            reachFt: 0,
            speedFt: (rm as unknown as Record<string, number>).speedFt ?? DEFAULT_SPEED_FEET,
            context: args.context,
            roomId: st.current_room,
            roomObstacles: roomObstacleCells,
          });
          if (plan && plan.pathSquares.length > 0) {
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === eEntry.id && e.isEnemy ? { ...e, pos: plan.newPos } : e
              ),
            };
            narrative += `\n\n[${rm.name} is compelled to stagger ${plan.pathSquares.length * SQUARE_SIZE} ft away.]`;
          } else {
            narrative += `\n\n[${rm.name} is compelled but cornered — it can't move away.]`;
          }
        }
        // Re-save after the forced movement.
        const compelDc = compelCaster?.concentrating_on?.save_dc ?? 13;
        const compelWis = (rm as unknown as Record<string, number>).wis ?? 10;
        const compelReSaveFailed = rollConditionSave(
          'wis',
          compelWis,
          compelDc,
          false,
          1,
          0,
          compelledEnt.conditions
        );
        if (!compelReSaveFailed) {
          narrative += ` ${rm.name} shakes off the compulsion.`;
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === eEntry.id && e.isEnemy
                ? { ...e, conditions: e.conditions.filter((c) => c !== 'compelled') }
                : e
            ),
          };
        }
        resumeMi = 0;
        const prevAdvIdxCompel = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxCompel !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD Dominate — a dominated creature fights for the party: on its turn
      // it approaches and attacks the nearest OTHER living enemy. If none
      // remain it stands guard. Cleared when the caster's concentration drops.
      // (On-damage re-save + manual command surface deferred — pansori
      // auto-pilots the creature, the RAW "acts to protect itself" fallback.)
      const dominatedEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      if (dominatedEnt && dominatedEnt.conditions.includes('dominated')) {
        const foes = (st.entities ?? []).filter(
          (e) =>
            e.isEnemy &&
            e.id !== eEntry.id &&
            e.hp > 0 &&
            !st.enemies_killed.includes(e.id) &&
            !e.conditions.includes('dominated')
        );
        if (foes.length > 0) {
          let pos = dominatedEnt.pos;
          const victim = [...foes].sort(
            (a, b) => distanceFeet(pos, a.pos) - distanceFeet(pos, b.pos)
          )[0];
          const victimStats = getEnemyById(args.seed, victim.id);
          const victimAc = victimStats?.ac ?? victim.ac ?? 10;
          const victimName = victimStats?.name ?? 'the enemy';
          if (distanceFeet(pos, victim.pos) > 5) {
            const plan = planEnemyApproach({
              st,
              seed: args.seed,
              enemyId: eEntry.id,
              enemyPos: pos,
              targetPos: victim.pos,
              reachFt: 5,
              speedFt: (rm as unknown as Record<string, number>).speedFt ?? DEFAULT_SPEED_FEET,
              context: args.context,
              roomId: st.current_room,
              roomObstacles: roomObstacleCells,
            });
            if (plan && plan.pathSquares.length > 0) {
              pos = plan.newPos;
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === eEntry.id && e.isEnemy ? { ...e, pos: plan.newPos } : e
                ),
              };
              narrative += `\n\n[${rm.name} (dominated) advances on ${victimName}.]`;
            }
          }
          if (distanceFeet(pos, victim.pos) <= 5) {
            const res = resolveEnemyAttack(
              { toHit: rm.toHit ?? 0, damage: rm.damage ?? '1d4' },
              victimAc
            );
            if (res.hit) {
              st = applyDamageToEntity(st, victim.id, res.damage);
              narrative += `\n\n[${rm.name} (dominated) strikes ${victimName} — ${res.damage} damage!]`;
              if ((st.entities?.find((e) => e.id === victim.id)?.hp ?? 0) <= 0) {
                st.enemies_killed = [...st.enemies_killed, victim.id];
                narrative += ` ${victimName} is slain!`;
                if (isRoomCleared(st, args.seed, st.current_room)) st = endCombatState(st);
              }
            } else {
              narrative += `\n\n[${rm.name} (dominated) attacks ${victimName} — miss.]`;
            }
          } else {
            narrative += `\n\n[${rm.name} (dominated) can't reach ${victimName} this turn.]`;
          }
        } else {
          narrative += `\n\n[${rm.name} (dominated) stands guard — no other enemy to attack.]`;
        }
        resumeMi = 0;
        const prevAdvIdxDom = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxDom !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD Paladin Holy Nimbus (Devotion L20) — an enemy that starts its turn
      // within an active nimbus aura takes Radiant damage (CHA + prof). Resolved
      // before the enemy acts; a kill ends its turn (and combat if room clears).
      const nimbusDmg = holyNimbusRadiant(eEntry.id, st);
      if (nimbusDmg > 0) {
        const nEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
        const newHp = Math.max(0, (nEnt?.hp ?? rm.hp) - nimbusDmg);
        st = {
          ...st,
          entities: (st.entities ?? []).map((e) =>
            e.id === eEntry.id && e.isEnemy ? { ...e, hp: newHp } : e
          ),
        };
        narrative += `\n\n[Holy Nimbus] ${rm.name} starts its turn in the radiant aura — ${nimbusDmg} radiant${newHp <= 0 ? ' (destroyed!)' : ` (${newHp} HP left)`}.`;
        if (newHp <= 0) {
          const nimbusPc = st.characters.find(
            (c) => c.conditions.includes('holy_nimbus') && getClassLevel(c, 'paladin') >= 20
          );
          if (nimbusPc) {
            const split = splitEncounterXp(st, nimbusPc.id, rm.xp ?? 0);
            st = split.st;
            st = {
              ...st,
              characters: st.characters.map((c) =>
                c.id === nimbusPc.id ? { ...c, xp: (c.xp || 0) + split.share } : c
              ),
            };
          }
          st.enemies_killed = [...st.enemies_killed, eEntry.id];
          if (isRoomCleared(st, args.seed, st.current_room)) st = endCombatState(st);
          resumeMi = 0;
          const prevAdvIdxNimbus = advIdx;
          advIdx = (advIdx + 1) % orderLen;
          if (advIdx === 0 && prevAdvIdxNimbus !== 0) roundWrapped = true;
          if (advIdx === args.initialCurrentIdx) break;
          continue;
        }
      }
      // SRD — legendary action pool refreshes at the start of the
      // legendary creature's own turn.
      if (rm.legendary_actions?.length) refreshLegendaryPool(args.seed, rm.id);
      // SRD Regeneration (Troll, Vampire Spawn, Hydra) — regain HP at the
      // start of this creature's turn, unless a blocking damage type landed
      // since its last turn (`regen_blocked`, set by the enemyHpAfterDamage
      // floor; consumed + cleared here). A creature at 0 HP stays down —
      // kills are final, simplifying the RAW "dies only if it can't
      // regenerate at 0" window.
      if (rm.regeneration) {
        const regenEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
        if (regenEnt && regenEnt.hp > 0) {
          if (rm.regen_blocked) {
            rm.regen_blocked = false;
            narrative += `\n\n${fmt.note(`[${rm.name}'s wounds smolder — no regeneration this turn.]`)}`;
          } else if (regenEnt.hp < regenEnt.maxHp) {
            const healedTo = Math.min(regenEnt.maxHp, regenEnt.hp + rm.regeneration);
            const gained = healedTo - regenEnt.hp;
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === eEntry.id && e.isEnemy ? { ...e, hp: healedTo } : e
              ),
            };
            narrative += `\n\n${fmt.note(`[${rm.name} regenerates ${gained} HP (${healedTo}/${regenEnt.maxHp}).]`)}`;
          }
        }
      }
      const { actorEnt: eEnt, targetCharIdx } = selectTarget(eEntry.id, st);
      if (targetCharIdx >= 0) {
        let target = st.characters[targetCharIdx];
        // SRD Hide DC tracking — delegated to `resolveEnemyHideCheck`.
        // See that function's JSDoc for the outcome matrix.
        const hideResult = resolveEnemyHideCheck(rm, target, targetCharIdx, st);
        st = hideResult.st;
        target = hideResult.target;
        narrative += hideResult.narrative;
        const hideBlockedAttack =
          hideResult.outcome === 'spotted-active' || hideResult.outcome === 'not-spotted';
        if (hideBlockedAttack) {
          // End this enemy's turn — they used their action to Search.
          const prevAdvIdxHide = advIdx;
          advIdx = (advIdx + 1) % orderLen;
          if (advIdx === 0 && prevAdvIdxHide !== 0) roundWrapped = true;
          if (advIdx === args.initialCurrentIdx) break;
          continue;
        }
        if (!target.dead && target.hp > 0) {
          // ── Breath weapon (recharge AoE) ─ fires as the whole turn ────────
          // A charged Breath Weapon (a dragon's Fire Breath) replaces the
          // attack/multiattack: every PC saves vs an AoE. It then goes on
          // cooldown until it recharges at a later turn start.
          const breathRes = maybeFireBreathWeapon({
            enemy: rm,
            enemyId: eEntry.id,
            st,
            context: args.context,
            narrative,
          });
          if (breathRes.fired) {
            st = breathRes.st;
            narrative = breathRes.narrative;
            // The breath can drop the party — end combat on a TPK.
            if (st.characters.every((c) => c.dead)) st = endCombatState(st);
            resumeMi = 0;
            const prevAdvIdxBreath = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdxBreath !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }

          // ── Petrifying Gaze / Breath (recharge cone) ─ fires as the whole turn
          // A charged Petrifying Gaze (Basilisk, Medusa, Gorgon) replaces the
          // attack: every PC saves vs the petrification ladder's stage 1. It then
          // goes on cooldown until it recharges at a later turn start.
          const gazeRes = maybeFirePetrifyingGaze({
            enemy: rm,
            enemyId: eEntry.id,
            st,
            context: args.context,
            narrative,
          });
          if (gazeRes.fired) {
            st = gazeRes.st;
            narrative = gazeRes.narrative;
            resumeMi = 0;
            const prevAdvIdxGaze = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdxGaze !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }

          // ── Spell-cast intent ─ delegated to `attemptEnemySpellCast` ──────
          const spellResult = await attemptEnemySpellCast({
            enemy: rm,
            enemyId: eEntry.id,
            enemyEnt: eEnt,
            target,
            targetCharIdx,
            st,
            context: args.context,
            resumeMi,
            advIdx,
            orderLen,
            narrative,
            seed: args.seed,
            worldName: args.worldName,
          });
          if (spellResult.kind === 'counterspell-pending') {
            return {
              st: spellResult.st,
              narrative: spellResult.narrative,
              exitAdvIdx: advIdx,
              roundWrapped,
              paused: true,
            };
          }
          if (spellResult.kind === 'spell-resolved') {
            st = spellResult.st;
            target = spellResult.target;
            narrative = spellResult.narrative;
            // Interactive Indomitable on a failed damage-spell save — the spell
            // already resolved (full damage committed); open a `save_reroll`
            // window and pause. The spell IS the enemy's whole turn, so resume
            // at the NEXT initiative entry after the reaction is decided.
            const srr = spellResult.pendingSaveReroll;
            if (srr) {
              const resumeIdx = (advIdx + 1) % orderLen;
              st = {
                ...st,
                pending_reaction: {
                  kind: 'save_reroll',
                  attackerEnemyId: eEntry.id,
                  targetCharId: srr.reactorId,
                  reactorCharId: srr.reactorId,
                  reactorName: srr.reactorName,
                  source: srr.source,
                  condition: srr.condition,
                  damageRefund: srr.damageRefund,
                  saveAbility: srr.saveAbility,
                  saveDc: srr.saveDc,
                  rerollSucceeds: srr.succeeds,
                  resumeFromInitiativeIdx: resumeIdx,
                  resumeFromMultiattackIdx: 0,
                  narrativeSoFar: narrative,
                  eligibleCharIds: [srr.reactorId],
                },
                active_character_id: srr.reactorId,
              };
              narrative += ` ✦ ${srr.reactorName} could use Indomitable to reroll the failed ${srr.saveAbility.toUpperCase()} save!`;
              return { st, narrative, exitAdvIdx: advIdx, roundWrapped, paused: true };
            }
            // Skip the multi-attack — spell IS the action this turn.
            resumeMi = 0;
            const prevAdvIdx2 = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdx2 !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }
          // spellResult.kind === 'no-cast' → fall through to melee.

          // ── Tactical movement step ─ delegated to `attemptEnemyApproach` ───
          // ── Approach/move step ─ dispatched as `enemy_move` (EE-4) ────────
          const moveCtx = buildEnemyActionCtx({
            st,
            seed: args.seed,
            context: args.context,
            worldName: args.worldName,
            enemy: rm,
            ent: eEnt,
            narrative,
          });
          await dispatchAction(moveCtx, {
            type: 'enemy_move',
            targetCharId: target.id,
            resumeMi,
          });
          st = moveCtx.st;
          narrative = moveCtx.narrative;
          const approach = moveCtx.enemyApproach;
          if (!approach || approach.kind === 'skip-turn') {
            resumeMi = 0;
            const prevAdvIdxMove = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdxMove !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }
          const movementHeaderPrinted = approach.movementHeaderPrinted;
          const attackCount = rm.multiattack ?? 1;
          if (resumeMi === 0 && !movementHeaderPrinted) {
            narrative += `\n\n[${rm.name}'s turn]`;
          }
          // ── Multiattack loop ─ delegated to `runEnemyMultiattackLoop` ─────
          const targetHpBeforeAtk = target.hp; // for Berserker Retaliation
          const multi = await runEnemyMultiattackLoop({
            enemy: rm,
            enemyId: eEntry.id,
            enemyEnt: eEnt,
            target,
            st,
            resumeMi,
            attackCount,
            advIdx,
            context: args.context,
            narrative,
            seed: args.seed,
            worldName: args.worldName,
          });
          if (multi.kind === 'paused') {
            return {
              st: multi.st,
              narrative: multi.narrative,
              exitAdvIdx: advIdx,
              roundWrapped,
              paused: true,
            };
          }
          st = multi.st;
          target = multi.target;
          narrative = multi.narrative;
          const massiveDeath = multi.massiveDeath;

          if (target.hp <= 0 && !target.dead && !massiveDeath) {
            const {
              narrative: dsNarr,
              newChar: newTarget,
              endedCombat,
            } = processDeathSave(
              { ...target, death_saves: target.death_saves ?? { successes: 0, failures: 0 } },
              rm,
              args.context,
              args.worldName,
              // Multiattack call path — the enemy just hit the downed
              // PC; trigger the SRD 2-failure-on-attack penalty.
              true,
              st.round ?? 1
            );
            target = newTarget;
            narrative += ' ' + dsNarr;
            if (endedCombat) st = endCombatState(st);
          } else if (massiveDeath) {
            const allDead = st.characters.every((c, i) => (i === targetCharIdx ? true : c.dead));
            if (allDead) st = endCombatState(st);
          }
          st = commitCharacter(st, target);

          // SRD Berserker Retaliation (L10) — the barbarian took damage from
          // this enemy; if it's adjacent and a reaction is available, strike
          // back. Auto-resolves (mirrors the auto OA / save policies).
          const retalBarb = st.characters[targetCharIdx];
          if (
            retalBarb &&
            hasRetaliation(retalBarb) &&
            canReact(retalBarb) &&
            !retalBarb.dead &&
            retalBarb.hp > 0 &&
            retalBarb.hp < targetHpBeforeAtk &&
            !st.enemies_killed.includes(eEntry.id)
          ) {
            const enemyEntRetal = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
            const barbEntRetal = st.entities?.find((e) => e.id === retalBarb.id && !e.isEnemy);
            const adjacent =
              enemyEntRetal && barbEntRetal
                ? Math.max(
                    Math.abs(enemyEntRetal.pos.x - barbEntRetal.pos.x),
                    Math.abs(enemyEntRetal.pos.y - barbEntRetal.pos.y)
                  ) <= 1
                : true; // off the grid: assume the melee attacker is adjacent
            if (adjacent && (enemyEntRetal?.hp ?? 0) > 0) {
              const retal = applyBarbarianRetaliation({
                st,
                barbarianId: retalBarb.id,
                enemyId: eEntry.id,
                enemyAc: rm.ac,
                enemyName: rm.name,
                context: args.context,
              });
              st = retal.st;
              narrative += retal.narrative;
            }
          }

          // SRD Fire Shield — a creature that hit the warded PC with a melee
          // attack this turn takes the shield's damage (auto, no roll/reaction).
          // Modeled once per enemy turn (RAW per-hit) when the enemy is adjacent.
          const shieldPc = st.characters[targetCharIdx];
          if (
            shieldPc?.fire_shield &&
            !shieldPc.dead &&
            shieldPc.hp > 0 &&
            shieldPc.hp < targetHpBeforeAtk &&
            !st.enemies_killed.includes(eEntry.id)
          ) {
            const fsEnemyEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
            const fsPcEnt = st.entities?.find((e) => e.id === shieldPc.id && !e.isEnemy);
            const fsAdjacent =
              fsEnemyEnt && fsPcEnt
                ? Math.max(
                    Math.abs(fsEnemyEnt.pos.x - fsPcEnt.pos.x),
                    Math.abs(fsEnemyEnt.pos.y - fsPcEnt.pos.y)
                  ) <= 1
                : true; // off the grid: assume the melee attacker is adjacent
            if (fsAdjacent && (fsEnemyEnt?.hp ?? 0) > 0) {
              const fsDmg = rollDice(shieldPc.fire_shield.dice);
              st = applyDamageToEntity(st, eEntry.id, fsDmg);
              narrative += ` 🔥 ${rm.name} is seared by ${shieldPc.name}'s Fire Shield for ${fmt.dmg(fsDmg)} ${shieldPc.fire_shield.damageType}!`;
              if (
                (st.entities?.find((e) => e.id === eEntry.id)?.hp ?? 1) <= 0 &&
                !st.enemies_killed.includes(eEntry.id)
              ) {
                st = { ...st, enemies_killed: [...st.enemies_killed, eEntry.id] };
                narrative += ` ${rm.name} is destroyed!`;
                if (isRoomCleared(st, args.seed, st.current_room)) st = endCombatState(st);
              }
            }
          }
        }
      }
    }

    // Reset resumeMi after the first iteration; subsequent enemies start fresh.
    resumeMi = 0;
    const prevAdvIdx = advIdx;
    advIdx = (advIdx + 1) % orderLen;
    if (advIdx === 0 && prevAdvIdx !== 0) roundWrapped = true;
    if (advIdx === args.initialCurrentIdx) break;
  }

  return { st, narrative, exitAdvIdx: advIdx, roundWrapped, paused: false };
}

// ─── Main action handler ──────────────────────────────────────────────────────

export async function takeAction({
  action,
  history = [],
  state,
  seed: seedArg,
  context,
}: {
  action: StructuredAction;
  history: unknown[];
  state: GameState;
  seed: Seed;
  context: Context;
}) {
  void history;

  // Plot armor upkeep: backfill `required` on pre-mechanic saves and revive any
  // required member left dead while out of combat (they're never permanently
  // lost). Runs before the action so a revived member can act this turn.
  state = backfillRequiredPlotArmor(state, context);

  // Pre-action HP snapshot (per entity/character id) for the charm-break sweep:
  // any Charmed creature that loses HP this action has its charm end (SRD).
  const prevHpForCharm = new Map<string, number>();
  for (const e of state.entities ?? []) prevHpForCharm.set(e.id, e.hp);
  for (const c of state.characters) prevHpForCharm.set(c.id, c.hp);

  const prevRoomId = state.current_room;
  // Allow mutation in travel case (rebinding local variable only)
  let seed = seedArg;

  // Resolve and clone the active character
  const charIdx = state.characters.findIndex((c) => c.id === state.active_character_id);
  const safeIdx = charIdx >= 0 ? charIdx : 0;
  let char: Character = { ...state.characters[safeIdx] };

  // Clone world state
  let st: GameState = {
    ...state,
    enemies_killed: state.enemies_killed || [],
    loot_taken: state.loot_taken || [],
    combat_active: state.combat_active ?? false,
    initiative_order: state.initiative_order ?? [],
    initiative_idx: state.initiative_idx ?? 0,
    room_log: state.room_log ?? [],
    short_rested_rooms: state.short_rested_rooms ?? [],
    long_rested: state.long_rested ?? false,
    npc_attitudes: state.npc_attitudes ?? {},
    npc_talked: state.npc_talked ?? [],
    objects_searched: state.objects_searched ?? [],
    flags: state.flags ?? {},
  };

  // Re-apply boss phase effects to the seed (fresh from DB each request) so
  // any boss whose phase_index > 0 has the current statline before resolving
  // the player's action.
  rehydrateBossPhases(seed, st);

  // Ensure character fields have safe defaults
  char = {
    ...char,
    conditions: char.conditions ?? [],
    condition_durations: char.condition_durations ?? {},
    death_saves: char.death_saves ?? { successes: 0, failures: 0 },
    stable: char.stable ?? false,
    dead: char.dead ?? false,
    turn_actions: char.turn_actions ?? { ...FRESH_TURN },
    inventory: char.inventory ?? [],
    hit_die: char.hit_die ?? 8,
    hit_dice_remaining: char.hit_dice_remaining ?? char.level ?? 1,
    class_resource_uses: char.class_resource_uses ?? {},
    asi_pending: char.asi_pending ?? false,
    exhaustion_level: char.exhaustion_level ?? 0,
    spell_slots_max: char.spell_slots_max ?? {},
    spell_slots_used: char.spell_slots_used ?? {},
    spells_known: char.spells_known ?? [],
    background_id: char.background_id ?? null,
    skill_proficiencies: char.skill_proficiencies ?? [],
    tool_proficiencies: char.tool_proficiencies ?? [],
    armor_proficiencies: char.armor_proficiencies ?? [],
    weapon_proficiencies: char.weapon_proficiencies ?? [],
    attuned_items: char.attuned_items ?? [],
  };

  const worldName = getWorldName(seed);
  const roomId = st.current_room;
  // Static obstacle cells (columns, walls, debris) in the current room, plus
  // any transient sight-blocking wall spell (Wall of Fire/Force). Combined
  // with entity positions when computing cover / line of sight below so the
  // grid feels tactically real.
  const roomObstacleCells = [
    ...(seed.rooms.find((r) => r.id === roomId)?.obstacles ?? []),
    ...wallObstacleCells(st, roomId, 'los'),
  ];
  // Living enemies in this room (multi-enemy support). For legacy narrative use,
  // `enemy` is the first living enemy; resolution code should target a specific
  // enemy via `action.targetEnemyId`. Banished enemies (Banishment spell) are
  // filtered out — they're in a harmless demiplane and not targetable until the
  // caster's concentration drops.
  const livingEnemiesInRoom = getLivingRoomEnemies(st, seed, roomId).filter((e) => {
    const ent = st.entities?.find((ent) => ent.id === e.id && ent.isEnemy);
    if (!ent) return true;
    if (ent.hp <= 0) return false;
    if (ent.conditions.includes('banished')) return false;
    return true;
  });
  const enemy: Enemy | undefined = livingEnemiesInRoom[0];
  const enemyAlive = livingEnemiesInRoom.length > 0;
  const placedLoot = availableLootIn(st, seed, roomId);

  let narrative = '';
  let escaped = false;
  // Track whether initiative was used this action (determines active_character advancement)
  let usedInitiative = false;

  // ── Undetected trap fires on first action in room ─────────────────────────
  // (Detected traps offer a 'disarm_trap' choice instead; this handles the case
  //  where no character's passive Perception beat the trap DC.)
  if (action.type !== 'disarm_trap' && action.type !== 'marker_move') {
    const hiddenTrap = getRoomTrap(roomId, seed, context);
    if (
      hiddenTrap &&
      !trapSpent(st, roomId) &&
      !partyDetectsTrap(st.characters, hiddenTrap, pacePerceptionMod(st))
    ) {
      st.traps_triggered = [...(st.traps_triggered ?? []), roomId];
      const trapDmg = rollDice(hiddenTrap.damage);
      const dmgResult = applyDamage(char, st, trapDmg);
      char = dmgResult.char;
      st = dmgResult.st;
      narrative +=
        (pickHookText(hiddenTrap.triggerNarrative) ?? '')
          .replace(/{name}/g, char.name)
          .replace(/{dmg}/g, String(trapDmg)) +
        dmgResult.concentrationNote +
        ' ';
      if (hiddenTrap.condition && char.hp > 0) {
        char.conditions = [...new Set([...char.conditions, hiddenTrap.condition])];
        if (hiddenTrap.conditionDuration)
          char.condition_durations = {
            ...char.condition_durations,
            [hiddenTrap.condition]: hiddenTrap.conditionDuration,
          };
      }
      commitChar();
    }
  }

  // Helper: write char back to st, and sync HP into grid entity if present
  function commitChar() {
    st = commitCharacter(st, char);
  }

  // ── Death saves override all actions when HP = 0 ───────────────────────────
  if (char.hp <= 0 && !char.dead) {
    if (char.stable) {
      if (action.type === 'use') {
        const held = char.inventory?.find((i) => i.id === action.itemId);
        if (held) {
          const itemData = getItemData(held, context);
          if (itemData.heal) {
            const healed = rollDice(itemData.heal);
            const firstIdx = char.inventory.findIndex((i) => i.id === held.id);
            char.hp = Math.min(char.max_hp, 1 + healed);
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            char.stable = false;
            narrative = `Barely conscious, you manage to use the ${held.name} — you recover ${fmt.hp(healed)} HP and pull yourself up (now ${fmt.hp(char.hp, char.max_hp)}).`;
          } else {
            narrative = `You are stable but unconscious. Only a healing item can restore you.`;
          }
        } else {
          narrative = `You are stable but unconscious. Only a healing item can restore you.`;
        }
      } else {
        narrative = `You are stable but unconscious. You need a healing item to regain consciousness.`;
      }
    } else {
      const {
        narrative: dsNarr,
        newChar,
        died,
        endedCombat,
      } = processDeathSave(
        char,
        enemyAlive ? enemy : null,
        context,
        worldName,
        false,
        st.round ?? 1
      );
      narrative = dsNarr;
      char = newChar;
      if (endedCombat) st = endCombatState(st);
      if (died) {
        commitChar();
        let allDead = st.characters.every((c) => c.dead);
        // Plot armor — if that death dropped the last PC but the party holds a
        // required member, end combat (which revives required members to 1 HP)
        // instead of a game-over. endCombatState clears the fight; the revived
        // member wakes alone, bloodied but alive.
        if (allDead && st.characters.some((c) => c.required)) {
          st = endCombatState(st);
          allDead = st.characters.every((c) => c.dead);
        }
        st.run_log = [
          ...(st.run_log || []),
          { character_id: char.id, action: action.type, narrative },
        ];
        // Multi-PC parties: when one PC dies on their death save, the
        // remaining living PCs continue. Advance active_character_id off
        // the corpse and surface choices for the next living PC so the
        // run isn't soft-locked. (Solo party / TPK: allDead is true and
        // there's nothing to advance to — the front-end shows the
        // game-over screen.)
        if (!allDead) {
          const livingAfterDeath = st.characters.filter((c) => !c.dead);
          if (livingAfterDeath.length > 0) {
            st.active_character_id = livingAfterDeath[0].id;
          }
          // Fold in the plot-armor flourish if the rescue above revived someone.
          if (st.revival_notice) {
            narrative = `${narrative} ${st.revival_notice}`.trim();
            st = { ...st, revival_notice: undefined };
          }
          st.last_choices = generateChoices(st, seed, context);
          return {
            narrative,
            choices: st.last_choices,
            newState: st,
            seed,
            escaped: false,
            dead: false,
          };
        }
        return { narrative, choices: [], newState: st, seed, escaped: false, dead: allDead };
      }
    }
    commitChar();
    // Advance to next living character round-robin (death save = passive, not a true turn)
    const living = st.characters.filter((c) => !c.dead);
    if (living.length > 0) {
      const idx = living.findIndex((c) => c.id === char.id);
      st.active_character_id = living[(idx + 1) % living.length].id;
    }
    st.run_log = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
    st.last_choices = generateChoices(st, seed, context);
    return { narrative, choices: st.last_choices, newState: st, seed, escaped: false, dead: false };
  }

  // Exhaustion level 6 = death (SRD)
  if ((char.exhaustion_level ?? 0) >= 6 && !char.dead) {
    char.dead = true;
    char.died_at_round = st.round ?? 0;
    narrative = `${char.name} succumbs to exhaustion (level 6) and dies.`;
    commitChar();
    st.run_log = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
    const allDeadExhaustion = st.characters.every((c) => c.dead);
    st.last_choices = generateChoices(st, seed, context);
    return {
      narrative,
      choices: st.last_choices,
      newState: st,
      seed,
      escaped: false,
      dead: allDeadExhaustion,
    };
  }

  // Action handlers extracted into services/actions/* receive this ctx and
  // mutate its fields in place. The dispatch result has three shapes:
  //
  //  - { handled: false }: no handler is registered for this action type;
  //    fall through to the inline legacy switch below.
  //  - { handled: true }: a leaf handler ran — sync the working-state ctx
  //    fields back into local bindings and continue with the post-action
  //    epilogue (initiative, runRules, narrative, etc.).
  //  - { handled: true, replaceWith }: a transformer handler staged
  //    pre-mutations and asks takeAction to re-enter from the top with a
  //    different action (e.g. attack_npc → attack). Return the recursive
  //    call's result directly — the inner takeAction runs its own epilogue
  //    so the outer one must NOT run again, or enemy turns / runRules /
  //    LLM enhance would double-fire.
  //
  // PRs land one handler at a time until the switch empties out.
  const ctx: ActionContext = {
    context,
    state,
    worldName,
    prevRoomId,
    roomId,
    roomObstacleCells,
    livingEnemiesInRoom,
    enemy,
    enemyAlive,
    placedLoot,
    seed,
    st,
    actor: pcActor(char, safeIdx),
    narrative,
    escaped,
    usedInitiative,
    fragments: [],
    commitChar() {
      if (this.actor.kind === 'pc') this.st = commitCharacter(this.st, this.actor.char);
    },
  };

  // Slow lock snapshot — captured BEFORE dispatch so the post-action
  // hook can detect a false→true transition on either slot and mirror
  // it to the other. See the Slow block right after `commitChar()`.
  const slowSnapshotActionUsed = char.turn_actions.action_used;
  const slowSnapshotBonusUsed = char.turn_actions.bonus_action_used;

  // SRD Time Stop — snapshot the enemies' state before the action so the
  // turn-advance hook can tell whether a Time-Stopped turn affected an enemy
  // (which ends the time stop). Captured for every combat action so the casting
  // turn itself (a self spell, no enemy change) doesn't read as "affected".
  const preActionEnemySig = st.combat_active ? enemySignature(st) : '';

  const dispatchResult = await dispatchAction(ctx, action);
  if (dispatchResult.handled && dispatchResult.replaceWith) {
    // Transformer: the handler staged pre-mutations into ctx (e.g. flipped
    // attitude); re-enter takeAction with the new action against the
    // staged state. The recursive call owns the epilogue.
    return await takeAction({
      action: dispatchResult.replaceWith,
      history,
      state: ctx.st,
      seed: ctx.seed,
      context,
    });
  }
  if (dispatchResult.handled) {
    // Render any structured fragments the handler pushed into ctx.fragments
    // (see services/narrative/compose.ts). For unmigrated handlers this is
    // a no-op; for migrated ones, the composer appends rendered prose to
    // ctx.narrative and pushes corresponding CombatEvents to ctx.st.
    composeFragments(ctx);
    seed = ctx.seed;
    st = ctx.st;
    if (ctx.actor.kind === 'pc') char = ctx.actor.char;
    narrative = ctx.narrative;
    escaped = ctx.escaped;
    usedInitiative = ctx.usedInitiative;
  }

  if (!dispatchResult.handled)
    switch (action.type) {
      // The `examine` action is registered in the dispatch table
      // (services/actions/examineDefault.ts); this default arm catches
      // truly unknown action types and falls back to the same arrival
      // narrative the examine handler emits.
      default: {
        narrative = buildArrivalNarrative(roomId, st, seed, context);
        if (st.combat_active) narrative += ` You are in combat!`;
        if (char.conditions.length > 0)
          narrative += ` ${fmt.note(`[Conditions: ${char.conditions.join(', ')}]`)}`;
        break;
      }
    }

  // ── Slow's action-OR-bonus economy ─────────────────────────────────────────
  // SRD 5.2.1 Slow — "It can use either an action or a bonus action on its
  // turn, not both." Mirror the false→true transition on either slot to
  // the other so the existing choice generator (which gates on
  // action_used / bonus_action_used) naturally hides the unavailable type
  // after the first is consumed. Reaction restriction + one-attack cap +
  // somatic-fail are deferred (each is its own sub-system).
  if (char.conditions.includes('slowed')) {
    const turn = char.turn_actions;
    const actionJustUsed = !slowSnapshotActionUsed && turn.action_used;
    const bonusJustUsed = !slowSnapshotBonusUsed && turn.bonus_action_used;
    if (actionJustUsed && !turn.bonus_action_used) {
      char = {
        ...char,
        turn_actions: { ...turn, bonus_action_used: true },
      };
      narrative += ` ${fmt.note('[Slowed: bonus action locked.]')}`;
    } else if (bonusJustUsed && !turn.action_used) {
      char = {
        ...char,
        turn_actions: { ...turn, action_used: true },
      };
      narrative += ` ${fmt.note('[Slowed: action locked.]')}`;
    }
  }

  // ── SRD Time Stop — ends the instant a turn affects an enemy ───────────────
  // Checked every action (not just at turn end) so it ends mid-turn, as RAW.
  // The enemy signature changing means this action dealt damage / a condition /
  // a kill, which drops the bank to 0 (the grant hook below then won't fire).
  if (
    (char.time_stop_turns ?? 0) > 0 &&
    st.combat_active &&
    enemySignature(st) !== preActionEnemySig
  ) {
    char = { ...char, time_stop_turns: 0 };
    narrative += ` ⏳ The frozen moment shatters — striking an enemy ends the time stop.`;
  }

  // ── Write char back into state ─────────────────────────────────────────────
  commitChar();

  // ── Auto-advance initiative when action is used and no bonus choices remain ─
  // When class features add bonus-action choices (requiresBonusAction: true),
  // this block will stay false and the player gets another pick before advancing.
  // SRD: movement is its own resource on your turn, separate from the
  // Action. Don't auto-advance while the character still has movement left —
  // otherwise a click that was a no-op (e.g. a too-far grid_move that errored
  // with "not enough movement") would end the turn. The player can always
  // forfeit unused movement via the explicit "End turn" choice.
  if (st.combat_active && !usedInitiative && st.characters[safeIdx].turn_actions.action_used) {
    const activeChar = st.characters[safeIdx];
    const hasBonusChoices = generateChoices(st, seed, context).some((c) => c.requiresBonusAction);
    const speedFt = effectiveSpeed(activeChar, context.lootTable);
    const usedFt = st.movement_used?.[activeChar.id] ?? 0;
    const hasMovementLeft = !!st.entities && usedFt < speedFt;
    // SRD Haste — when the PC is Hasted and hasn't yet spent the
    // extra action, hold off auto-advance so the player can see and
    // choose from the Haste-extra menu. They can always explicitly
    // forfeit it via End turn.
    const hasUnspentHasteExtra =
      activeChar.conditions.includes('hasted') && !activeChar.turn_actions.haste_extra_action_used;
    if (!hasBonusChoices && !hasMovementLeft && !hasUnspentHasteExtra) {
      usedInitiative = true;
    }
  }

  // ── SRD Time Stop — grant the next frozen-time turn ────────────────────────
  // When the just-ended turn belongs to a PC with banked Time-Stop turns (and
  // the time stop wasn't ended this turn by striking an enemy — that zeroed the
  // bank before commitChar above), refresh their turn and suppress the advance
  // so the same creature acts again while everyone else stays frozen.
  if (usedInitiative && st.combat_active && (st.characters[safeIdx]?.time_stop_turns ?? 0) > 0) {
    const tsChar = st.characters[safeIdx];
    const left = (tsChar.time_stop_turns ?? 0) - 1;
    st = commitCharacter(st, { ...tsChar, time_stop_turns: left, turn_actions: { ...FRESH_TURN } });
    char = st.characters[safeIdx];
    st = { ...st, movement_used: { ...(st.movement_used ?? {}), [char.id]: 0 } };
    narrative += ` ⏳ Time stands still — ${char.name} takes another turn${left > 0 ? ` (${left} left)` : ''}.`;
    usedInitiative = false; // same creature acts again — don't pass the turn
  }

  // ── Advance initiative / active character ──────────────────────────────────
  if (usedInitiative && st.combat_active && st.initiative_order.length > 0) {
    // Advance from current player's initiative position
    const orderLen = st.initiative_order.length;
    const currentIdx = st.initiative_idx ?? 0;

    // SRD Monk Self-Restoration (L10): at the end of your turn, remove one of
    // Charmed / Frightened / Poisoned from yourself. The turn just ending is
    // the PC at `currentIdx` (before initiative advances below).
    const endingEntry = st.initiative_order[currentIdx];
    if (endingEntry && !endingEntry.is_enemy) {
      const endIdx = st.characters.findIndex((c) => c.id === endingEntry.id);
      const ending = endIdx >= 0 ? st.characters[endIdx] : undefined;
      if (ending && getClassLevel(ending, 'monk') >= 10) {
        const toRemove = (ending.conditions ?? []).find((c) =>
          ['charmed', 'frightened', 'poisoned'].includes(c)
        );
        if (toRemove) {
          const cleaned = {
            ...ending,
            conditions: ending.conditions.filter((c) => c !== toRemove),
            ...(toRemove === 'charmed' ? { charmer_id: undefined } : {}),
          };
          st = { ...st, characters: st.characters.map((c, i) => (i === endIdx ? cleaned : c)) };
          narrative += ` ${fmt.note(`[Self-Restoration: ${ending.name} shakes off ${toRemove}]`)}`;
        }
      }

      // SRD Paladin Aura of Courage / Devotion + buff immunities (Freedom of
      // Movement, Mind Blank) — a now-immune condition ends on the creature (the
      // guards block new applications; this clears one already present, e.g. a
      // grapple/restrain when Freedom of Movement comes up).
      const aIdx = st.characters.findIndex((c) => c.id === endingEntry.id);
      const a = aIdx >= 0 ? st.characters[aIdx] : undefined;
      if (a && !a.dead) {
        const immune = conditionImmunitiesFor(a, st);
        const cleared = (a.conditions ?? []).filter((c) => immune.has(c));
        if (cleared.length > 0) {
          const freed = {
            ...a,
            conditions: a.conditions.filter((c) => !immune.has(c)),
            ...(cleared.includes('charmed') ? { charmer_id: undefined } : {}),
          };
          st = { ...st, characters: st.characters.map((c, i) => (i === aIdx ? freed : c)) };
          narrative += ` ${fmt.note(`[Aura: ${a.name} is freed from ${cleared.join(', ')}]`)}`;
        }
      }
    }

    const startAdvIdx = (currentIdx + 1) % orderLen;
    const initialRoundWrapped = startAdvIdx === 0;

    // SRD — legendary action: fires AFTER another creature's turn ends.
    // Resolved before runEnemyTurns so the spend is recorded against the
    // current pool; the legendary creature's own turn (later in the loop)
    // will refresh the pool for the next round.
    const legendaryRes = fireLegendaryAction(st, seed, context);
    st = legendaryRes.st;
    narrative += legendaryRes.narrative;

    const turnRes = await runEnemyTurns({
      st,
      seed,
      context,
      worldName,
      startAdvIdx,
      startMultiattackIdx: 0,
      startRoundWrapped: initialRoundWrapped,
      initialCurrentIdx: currentIdx,
    });
    st = turnRes.st;
    narrative += turnRes.narrative;
    const advIdx = turnRes.exitAdvIdx;
    const roundWrapped = turnRes.roundWrapped && !turnRes.paused;

    // Save the resume point in initiative_idx so a pause leaves a coherent
    // state; the resolve_reaction handler will re-enter runEnemyTurns from
    // the saved coords inside pending_reaction.
    if (turnRes.paused) st.initiative_idx = advIdx;

    if (roundWrapped) {
      // New round: bump the round counter (so combat-event payloads tag the
      // right round), reset turn_actions, movement budgets, and clear
      // surprise (SRD).
      st = {
        ...st,
        round: (st.round ?? 1) + 1,
        movement_used: {},
        surprised: [],
        characters: st.characters.map((c) => ({ ...c, turn_actions: { ...FRESH_TURN } })),
        // Brutal Strike Hamstring lasts "until the start of your next turn" —
        // approximated as one full round; cleared on round wrap. Enemy
        // reactions (Bandit Captain Parry) also refresh here.
        entities: (st.entities ?? []).map((e) => {
          const conditions = e.conditions.includes('hamstrung')
            ? e.conditions.filter((c) => c !== 'hamstrung')
            : e.conditions;
          if (conditions === e.conditions && !e.reaction_used) return e;
          return { ...e, conditions, reaction_used: false };
        }),
      };
      // Tick enemy timed conditions (Charm Person/Monster, Blindness, Color
      // Spray): decrement their stamped durations and expire those reaching 0.
      const enemyCondRes = tickEnemyConditions(st);
      st = enemyCondRes.st;
      narrative += enemyCondRes.narrative;
      // SRD — lair action fires on round start (init count 20).
      const lairRes = fireLairAction(st, seed, context);
      st = lairRes.st;
      narrative += lairRes.narrative;
      // RE-4 — persistent damage zones (Cloud of Daggers, …) tick on round wrap,
      // damaging hostiles standing in them. Runs before the concentration tick
      // so a zone whose concentration is about to expire still deals its final
      // round of damage.
      const zoneRes = fireSpellZones(st, seed, context);
      st = zoneRes.st;
      narrative += zoneRes.narrative;
      // Concentration timers tick once per full round (SRD 5.2.1 — round
      // = 6 sec). Spells whose budget reaches 0 end cleanly via
      // breakConcentration so linked conditions (Bless's `blessed`, Hold
      // Person's `paralyzed`, etc.) clear at the same time.
      const concRes = tickConcentrationDurations(st, context);
      st = concRes.st;
      narrative += concRes.narrative;
      // RE-4 — non-concentration recurring spell attacks (Spiritual Weapon)
      // expire on their own round timer. (Concentration ones — Vampiric Touch —
      // are governed by the concentration tick + breakConcentration above.)
      st = {
        ...st,
        characters: st.characters.map((c) => {
          const ra = c.recurring_attack;
          if (!ra || ra.concentration) return c;
          const left = ra.rounds_left - 1;
          return left <= 0
            ? { ...c, recurring_attack: null }
            : { ...c, recurring_attack: { ...ra, rounds_left: left } };
        }),
      };
    }

    // Pause path: runEnemyTurns already set initiative_idx and active_character_id
    // to the reactor; skip the next-PC promotion below.
    if (!turnRes.paused) {
      st.initiative_idx = advIdx;

      // Set active character to whoever's turn it is in the order;
      // reset their turn_actions and tick conditions as their new turn begins.
      const currentEntry = st.initiative_order[advIdx];
      if (currentEntry && !currentEntry.is_enemy) {
        const nextCharIdx = st.characters.findIndex((c) => c.id === currentEntry.id && !c.dead);
        if (nextCharIdx >= 0) {
          // Reset movement for this character's new turn
          st = { ...st, movement_used: { ...(st.movement_used ?? {}), [currentEntry.id]: 0 } };
          const withFreshTurn = { ...st.characters[nextCharIdx], turn_actions: { ...FRESH_TURN } };
          let ticked = tickConditions(withFreshTurn);
          if (ticked.conditions.length !== st.characters[nextCharIdx].conditions.length) {
            const expired = st.characters[nextCharIdx].conditions.filter(
              (c) => !ticked.conditions.includes(c)
            );
            narrative += ` ${fmt.note(`[${ticked.name}] Condition${expired.length > 1 ? 's' : ''} cleared: ${expired.join(', ')}.`)}`;
          }
          // SRD Champion Heroic Warrior (L10) — gain Heroic Inspiration at the
          // start of a combat turn whenever you lack it.
          if (hasHeroicWarrior(ticked) && !ticked.inspiration) {
            ticked = { ...ticked, inspiration: true };
            narrative += ` ${fmt.note(`[Heroic Warrior] ${ticked.name} gains Heroic Inspiration.`)}`;
          }
          // SRD monster auras / emanations (Ghast Stench) — a PC that starts its
          // turn within an enemy aura makes the aura's save or suffers its effect.
          const auraRes = applyMonsterAuras(ticked, st, seed, context);
          ticked = auraRes.char;
          st = auraRes.st;
          narrative += auraRes.narrative;
          // SRD petrification ladder — the Restrained PC repeats its save as its
          // turn begins (first afflicted turn is free); a failure turns it to stone.
          const petrifyRes = resolvePetrifyLadder(ticked, st, context);
          ticked = petrifyRes.char;
          narrative += petrifyRes.narrative;
          st = { ...st, characters: st.characters.map((c, i) => (i === nextCharIdx ? ticked : c)) };
          st.active_character_id = ticked.id;
        }
      }
    }
  }
  // Out-of-combat: active_character_id stays on whoever the player
  // chose. RAW has no initiative outside combat (SRD 5.2.1) — the
  // party operates as a unit — so the prior auto-rotate every action
  // was non-RAW and made NPC dialogue feel jarring (different PC
  // credited per response). Players hand the spotlight off explicitly
  // via the `set_active_character` action (PartyRail tile click).

  // Run script-engine rules against the post-action state
  const { state: afterRules, extraNarrative } = await runRules(
    st,
    context,
    action,
    prevRoomId,
    seed
  );
  st = afterRules;

  // set_escape consequence signals via flag
  if (st.flags._rule_escape) {
    escaped = true;
    const { _rule_escape: _, ...restFlags } = st.flags;
    st = { ...st, flags: restFlags };
  }

  // SRD Death Burst — any creature that hit 0 HP this action (player attack,
  // spell AoE, or an opportunity attack during the enemy turns above) and carries
  // a `deathBurst` explodes now. Folded into `narrative` before the LLM-
  // enhancement pass so the blast's damage/save facts get enhanced + preserved.
  {
    const burstRes = applyDeathBursts(st, seed, context);
    if (burstRes.narrative) {
      st = burstRes.st;
      narrative += burstRes.narrative;
    }
  }

  // Speaker prefix for multi-PC parties — prepend "[CharName] " so the
  // reader can tell whose turn this was. Combat narratives (combatHit,
  // combatMiss, etc.) draw from pools with second-person ("Your attack
  // connects..."), third-person impersonal ("A solid strike lands..."),
  // and enemy-first ("The Crypt Ghoul reels...") openers — none of those
  // identify the active character. We only suppress the prefix when the
  // narrative *already* starts with the character's name (e.g. an enemy
  // attack narrative that opens with "Sage takes 5 damage" — the active
  // character is the one being damaged, so the prose already names them).
  // Solo-character parties are unambiguous and skip the prefix entirely.
  const livingPartyCount = st.characters.filter((c) => !c.dead).length;
  const body = extraNarrative ? `${narrative}\n\n${extraNarrative}` : narrative;
  const alreadyNamedAtStart =
    narrative.startsWith(`${char.name} `) ||
    narrative.startsWith(`${char.name}:`) ||
    narrative.startsWith(`[${char.name}]`);
  // Skip the prefix on an empty turn (e.g. a "Continue" that only clears a
  // post-combat gate) — otherwise the log shows a bare "[Name]" with nothing
  // after it.
  const speakerPrefix =
    livingPartyCount > 1 && !alreadyNamedAtStart && body.trim().length > 0 ? `[${char.name}] ` : '';
  // Strip leading blank lines before prefixing. Some reaction/inspiration
  // narratives prepend a "\n\n" paragraph separator assuming prior content
  // (e.g. reaction.ts's Heroic Inspiration reroll); when the reaction is the
  // whole turn that separator is spurious and would strand a bare "[Name]"
  // above a blank line instead of sitting next to the first sentence.
  const rawNarrative = speakerPrefix + body.replace(/^\s+/, '');

  const activeRoom = seed.rooms.find((r) => r.id === st.current_room);
  // The LLM rewrites prose freely. We strip:
  //   - non-note tokens (`{{dmg|5}}` → "5") so the LLM sees the numbers
  //     it must preserve for `preservesCriticalFacts`
  //   - note tokens (`{{note|[Sneak Attack: +7]}}`) entirely — mechanical
  //     asides aren't narrative and shouldn't be woven into prose. They
  //     reach the FE intact (as styled sidebar pills) on either the
  //     enhanced or the raw-fallback path.
  // When LLM is enabled the user trades styled-token rendering of damage
  // numbers etc. for atmospheric prose; mechanical notes remain styled
  // either way; the structured combat_log retains all mechanical data.
  // With the default NoneProvider (passthrough) the FE renders the
  // tokenised raw narrative directly.
  const llmInput = stripForLlm(rawNarrative);
  const enhanced = await llmProvider.enhance(llmInput, {
    worldName: seed.world_name,
    charName: char.name,
    charClass: char.character_class,
    roomName: activeRoom?.name ?? st.current_room,
    // Pronouns for the active character + a party roster, so the narration
    // refers to each member correctly (derived from Character.gender).
    pronouns: pronounsForGender(char.gender),
    partyPronouns: st.characters
      .map((c) => `${c.name} (${pronounsForGender(c.gender)})`)
      .join('; '),
  });
  // Passthrough: if the provider returned the input unchanged (NoneProvider
  // or LLM error fallback), restore the tokenised raw narrative so the FE
  // can render styled spans.
  //
  // Fact-preservation check: the LLM is instructed to keep all numbers and
  // outcome words, but compliance isn't free. If the enhancement drops a
  // damage number, a critical state word ("killed", "downed"), or a PC
  // name, the player gets prose that misrepresents engine state — fall
  // back to the tokenised raw narrative instead.
  const enhancementFaithful =
    enhanced === llmInput || (enhanced.length > 0 && preservesCriticalFacts(llmInput, enhanced));
  const finalNarrative = enhanced === llmInput || !enhancementFaithful ? rawNarrative : enhanced;

  // SRD 5.2.1 — Invisible: attacking reveals location. The condition
  // ends after the attack; the character must re-Hide to regain it.
  // EXCEPTION: SRD Greater Invisibility (and Invisibility cast as a
  // BUFF, not from Hide) explicitly allows attacking while invisible —
  // the condition source is magical and persists. Self-cast invisibility
  // spells are exempted from this break-on-attack rule.
  {
    const attackActions = new Set(['attack', 'attack_npc', 'two_weapon_attack', 'cast_spell']);
    const SPELLS_THAT_KEEP_INVISIBILITY = new Set(['greater_invisibility']);
    const castSpellId =
      action.type === 'cast_spell' ? (action as { spellId?: string }).spellId : undefined;
    // If the player is concentrating on a magical-invisibility spell,
    // attacking does NOT drop the condition. We approximate by reading
    // `concentrating_on.spellId`.
    const concSpellId = char.concentrating_on?.spellId;
    // Casting an invisibility-GRANTING spell (Invisibility / Greater
    // Invisibility) must not strip the condition it applies on the very same
    // cast — only a SUBSEQUENT attack/cast reveals the caster. A later regular-
    // Invisibility cast/attack still breaks it (concSpellId isn't in the keep
    // set), while Greater Invisibility persists via that set.
    const grantsInvisible = castSpellId
      ? context.spellTable?.[castSpellId]?.condition === 'invisible'
      : false;
    const keepsInvisible =
      grantsInvisible ||
      (castSpellId && SPELLS_THAT_KEEP_INVISIBILITY.has(castSpellId)) ||
      (concSpellId && SPELLS_THAT_KEEP_INVISIBILITY.has(concSpellId));
    if (attackActions.has(action.type) && !keepsInvisible) {
      st = {
        ...st,
        characters: st.characters.map((c) =>
          c.id === char.id && c.conditions.includes('invisible')
            ? {
                ...c,
                conditions: c.conditions.filter((cc) => cc !== 'invisible'),
                hide_dc: undefined,
              }
            : c
        ),
      };
    }
  }

  // SRD 5.2.1 — Unconscious ends when the creature regains any HP.
  // The condition is registered with duration: 'permanent' and only
  // explicitly cleared by the natural-20 death save path. Healing a
  // downed PC (Cure Wounds, Healing Word, healing potion, quest
  // reward modify_hp) brought them above 0 HP but left the condition
  // intact — leaving the PC "alive but still unconscious", unable
  // to act, with enemies still getting advantage on attacks.
  // This sweep drops the condition whenever a living PC has hp > 0.
  // Also resets `death_saves` and `stable` since they're tied to the
  // unconscious lifecycle.
  {
    let anyRevived = false;
    let updated = st;
    for (let i = 0; i < updated.characters.length; i++) {
      const c = updated.characters[i];
      if (c.dead) continue;
      if (c.hp <= 0) continue;
      if (!c.conditions.includes('unconscious')) continue;
      const revived: Character = {
        ...c,
        conditions: c.conditions.filter((cc) => cc !== 'unconscious'),
        condition_durations: Object.fromEntries(
          Object.entries(c.condition_durations ?? {}).filter(([k]) => k !== 'unconscious')
        ),
        death_saves: { successes: 0, failures: 0 },
        stable: false,
      };
      updated = {
        ...updated,
        characters: updated.characters.map((cc, idx) => (idx === i ? revived : cc)),
        entities: (updated.entities ?? []).map((e) =>
          e.id === c.id && !e.isEnemy
            ? { ...e, conditions: e.conditions.filter((cc) => cc !== 'unconscious') }
            : e
        ),
      };
      anyRevived = true;
    }
    if (anyRevived) st = updated;
  }

  // SRD 5.2.1 — Concentration ends when the caster is incapacitated or
  // dies. We don't catch every state transition mid-handler, so sweep here.
  {
    const incapCond = new Set([
      'incapacitated',
      'paralyzed',
      'stunned',
      'unconscious',
      'petrified',
    ]);
    let anyBroken = false;
    let updated = st;
    for (let i = 0; i < updated.characters.length; i++) {
      const c = updated.characters[i];
      if (!c.concentrating_on) continue;
      const isIncap = c.dead || c.hp <= 0 || c.conditions.some((cc) => incapCond.has(cc));
      if (isIncap) {
        const r = breakConcentration(c, updated, context);
        anyBroken = true;
        updated = {
          ...r.st,
          characters: r.st.characters.map((cc) => (cc.id === c.id ? r.char : cc)),
        };
      }
    }
    if (anyBroken) st = updated;
  }

  // SRD 5.2.1 — Grappled ends if the grappler is incapacitated. Sweep here
  // so deaths/conditions applied this turn drop their grapples for the next turn.
  if (st.entities && st.entities.some((e) => e.grappled_by)) {
    const killed = new Set(st.enemies_killed ?? []);
    const incapacitated = (id: string): boolean => {
      if (killed.has(id)) return true;
      const ent = st.entities!.find((x) => x.id === id);
      if (
        ent &&
        (ent.hp <= 0 ||
          ent.conditions.some((c) =>
            ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
          ))
      ) {
        return true;
      }
      const pc = st.characters.find((x) => x.id === id);
      if (
        pc &&
        (pc.dead ||
          pc.hp <= 0 ||
          pc.conditions.some((c) =>
            ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
          ))
      ) {
        return true;
      }
      return false;
    };
    let touched = false;
    const sweptEntities = st.entities.map((e) => {
      if (e.grappled_by && incapacitated(e.grappled_by)) {
        touched = true;
        return {
          ...e,
          conditions: e.conditions.filter((c) => c !== 'grappled'),
          grappled_by: undefined,
        };
      }
      return e;
    });
    if (touched) {
      st = { ...st, entities: sweptEntities };
      // Also clear the grappled condition on any PC whose grappler is incapacitated.
      st = {
        ...st,
        characters: st.characters.map((c) => {
          const ent = st.entities!.find((e) => e.id === c.id);
          if (ent && !ent.conditions.includes('grappled') && c.conditions.includes('grappled')) {
            return { ...c, conditions: c.conditions.filter((cc) => cc !== 'grappled') };
          }
          return c;
        }),
      };
    }
  }

  // Boss-phase transition check: if any enemy is a boss whose hp dropped
  // below the next phase threshold during this action, increment its phase
  // index, mutate the seed's stats accordingly, and emit a `phase_transition`
  // event. Runs before final-narrative + choices so the new statline is the
  // one rendered into the next round's prompts.
  st = processBossPhaseTransitions(st, seed);

  // Fold the plot-armor revival flourish into this action's narrative (and clear
  // the transient marker) so the player sees "…claws back from the edge of death"
  // right after the combat that ended, or after the action that self-healed them.
  const narrativeOut = st.revival_notice
    ? `${finalNarrative} ${st.revival_notice}`.trim()
    : finalNarrative;
  if (st.revival_notice) st = { ...st, revival_notice: undefined };

  const roomChanged = st.current_room !== state.current_room;
  st.run_log = [
    ...(st.run_log || []),
    { character_id: char.id, action: action.type, narrative: narrativeOut },
  ];
  st.room_log = roomChanged ? [narrativeOut] : [...(st.room_log ?? []), narrativeOut];

  // Record the action's seenKey (if any) so the FE can dim repeat
  // presentations of the same choice. Computed against the pre-action
  // state so "I clicked this in room X" survives an action that
  // teleported the party. Dedupes via Set semantics.
  const usedKey = seenKeyForAction(action, state);
  if (usedKey && !(st.seen_choices ?? []).includes(usedKey)) {
    st.seen_choices = [...(st.seen_choices ?? []), usedKey];
  }

  // SRD — break Charm on any creature that took damage this action.
  st = breakCharmOnDamage(st, prevHpForCharm);
  // SRD Warding Bond — redirect a warded ally's damage to its warder.
  st = redirectWardingBondDamage(st, prevHpForCharm);

  st.last_choices = generateChoices(st, seed, context);

  const allDead = st.characters.every((c) => c.dead);

  return {
    narrative: narrativeOut,
    choices: st.last_choices,
    newState: st,
    // The seed is normally immutable, but a few actions mutate it in place
    // (e.g. `marker_move` materializes a rolled wilderness-encounter enemy into
    // `seed.enemies`). Return it so the route persists the change — otherwise
    // the encounter enemy vanishes next request and the party is stranded in
    // the empty encounter room with only rest options.
    seed,
    escaped,
    dead: allDead,
  };
}
