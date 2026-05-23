import type { Character, GameState } from '../types.js';
import { checkConcentration, clampHpForExhaustion, inflictCondition } from './gameEngine.js';
import { rollDice } from './rulesEngine.js';

/**
 * Single-entry helper for applying damage to a PC. Centralizes the
 * cross-cutting effects that every damage source needs to honor:
 *
 *   1. Temp HP absorption (SRD 5.2.1 p.17–18). Temp HP soaks damage
 *      before regular HP and is decremented; it doesn't stack with
 *      itself.
 *   2. Exhaustion-4 max-HP halving (PHB p.291). HP can't exceed
 *      floor(max_hp / 2) while exhaustion ≥ 4; damage that would land
 *      below that is reported as actual loss.
 *   3. Concentration check (SRD 5.2.1 p.203). Any damage taken while
 *      concentrating triggers a CON save against DC max(10, dmg/2).
 *      Failure ends the spell and clears any linked conditions on
 *      allies / enemies.
 *   4. HP floor at 0 — knock-out detection. The 2024 PHB death-saving
 *      path stays in the caller (different sources narrate the
 *      transition differently — trap "you collapse" vs. spell
 *      "incinerates you"); this helper just reports `knockedOut: true`.
 *
 * NOT included (yet — separate PR):
 *   - Resistance / vulnerability (Rage, Petrified, species, Beast Form,
 *     Abjurer Arcane Ward). Sites that currently bypass it (traps,
 *     lair actions, consumables) continue to bypass it; the
 *     enemy-attack path keeps its own inlined logic until that
 *     migration lands.
 *   - Enemy-side damage. Enemies don't concentrate or carry temp HP
 *     in the current schema; their HP is mutated in-place by the
 *     attack handlers. Once monsters become first-class action
 *     subjects (TODO item #5) this helper grows a sibling for
 *     enemy damage.
 *
 * Caller writes the returned char + st into its working bindings:
 *   const result = applyDamage(ctx.char, ctx.st, dmg);
 *   ctx.char = result.char;
 *   ctx.st = result.st;
 *   ctx.narrative += result.concentrationNote;
 *
 * The caller is still responsible for `commitChar()` /
 * `st.characters` sync — same contract as `checkConcentration`.
 */

export interface ApplyDamageOptions {
  /** Skip the SRD concentration save (rare — only when caller already rolled it). */
  skipConcentration?: boolean;
  /** Skip temp HP absorption (e.g. damage that bypasses resistances/buffers). */
  skipTempHp?: boolean;
  /**
   * Game context. Passed through to breakConcentration so that
   * concentration-linked AC buffs (Shield of Faith) can clear the
   * shield_of_faith_active flag + recompute AC when the caster's
   * concentration breaks under damage. Without this, the +2 AC flag
   * stays set after the spell technically ends.
   */
  context?: import('../types.js').Context;
}

export interface ApplyDamageResult {
  char: Character;
  st: GameState;
  /** Final HP lost after temp HP absorption and exhaustion clamp. */
  amountDealt: number;
  /** Damage soaked by temp HP. 0 if no temp HP or skipTempHp. */
  tempHpAbsorbed: number;
  /** Remaining temp HP after absorption (handy for narrative). */
  tempHpRemaining: number;
  /** Narrative fragment from `checkConcentration` — `''` if not concentrating / no break. */
  concentrationNote: string;
  /** True if the save failed and the spell ended this call. */
  concentrationBroken: boolean;
  /** True if HP dropped to 0 from this damage (caller handles death-save transition). */
  knockedOut: boolean;
}

export function applyDamage(
  char: Character,
  st: GameState,
  rawAmount: number,
  opts: ApplyDamageOptions = {}
): ApplyDamageResult {
  if (rawAmount <= 0) {
    return {
      char,
      st,
      amountDealt: 0,
      tempHpAbsorbed: 0,
      tempHpRemaining: char.temp_hp ?? 0,
      concentrationNote: '',
      concentrationBroken: false,
      knockedOut: false,
    };
  }

  // Temp HP absorption first.
  let remaining = rawAmount;
  let tempHpAbsorbed = 0;
  let newTempHp = char.temp_hp ?? 0;
  if (!opts.skipTempHp && newTempHp > 0) {
    tempHpAbsorbed = Math.min(newTempHp, remaining);
    remaining -= tempHpAbsorbed;
    newTempHp -= tempHpAbsorbed;
  }

  // Apply to HP, then clamp for exhaustion-4 (which can cap below the
  // damaged value). The actual HP delta accounts for the clamp so
  // narrative numbers stay honest.
  const proposedHp = Math.max(0, char.hp - remaining);
  // SRD Death Ward — "The first time the target would drop to 0
  // HP before the spell ends, the target instead drops to 1 HP,
  // and the spell ends." Intercept here before exhaustion clamp;
  // the +1 HP is what the player walks away with. One-shot: flag
  // clears on consumption.
  const deathWardSaves = proposedHp === 0 && char.hp > 0 && char.death_ward_active;
  const postWardHp = deathWardSaves ? 1 : proposedHp;
  const clampedHp = clampHpForExhaustion(postWardHp, char.max_hp, char.exhaustion_level ?? 0);
  const amountDealt = char.hp - clampedHp;

  let newChar: Character = {
    ...char,
    hp: clampedHp,
    ...(tempHpAbsorbed > 0 ? { temp_hp: newTempHp } : {}),
    ...(deathWardSaves ? { death_ward_active: false } : {}),
  };
  let newSt = st;

  // Concentration check (uses amountDealt, not raw — temp HP absorption
  // doesn't trigger a save per RAW; only damage that actually hit HP).
  let concentrationNote = '';
  let concentrationBroken = false;
  if (!opts.skipConcentration && amountDealt > 0) {
    const before = newChar.concentrating_on;
    const conc = checkConcentration(newChar, newSt, amountDealt, opts.context);
    newChar = conc.char;
    newSt = conc.st;
    concentrationNote = conc.note;
    concentrationBroken = before != null && conc.char.concentrating_on == null;
  }

  // 2024 PHB — a creature reduced to 0 HP without being killed
  // outright becomes Unconscious. Inflict the condition here so
  // every damage path (enemy attacks, traps, falling, mystery
  // consumables, OA) consistently transitions to the right
  // condition state. The post-action sweep in gameEngine.ts
  // already clears Unconscious when hp > 0 again.
  const knockedOut = clampedHp === 0 && char.hp > 0 && !char.dead;
  if (knockedOut && !newChar.conditions.includes('unconscious')) {
    newChar = inflictCondition(newChar, 'unconscious');
    // Mirror onto the entity row so the renderer's "sleeping"
    // badge tracks state.
    newSt = {
      ...newSt,
      entities: (newSt.entities ?? []).map((e) =>
        e.id === newChar.id && !e.isEnemy
          ? {
              ...e,
              conditions: e.conditions.includes('unconscious')
                ? e.conditions
                : [...e.conditions, 'unconscious'],
            }
          : e
      ),
    };
  }

  return {
    char: newChar,
    st: newSt,
    amountDealt,
    tempHpAbsorbed,
    tempHpRemaining: newTempHp,
    concentrationNote,
    concentrationBroken,
    knockedOut,
  };
}

/**
 * 2024 PHB falling damage. 1d6 bludgeoning per 10 feet fallen,
 * capped at 20d6 (terminal velocity at 200 ft). The creature lands
 * prone if it takes damage from the fall (and survives) — falls of
 * 0 ft or less are no-ops.
 *
 * Routes through `applyDamage` so temp_hp absorption + exhaustion
 * clamp + concentration check all fire normally. The prone
 * condition is applied via `inflictCondition` on the post-damage
 * character; if the fall kills (or knocks unconscious), the prone
 * condition is intentionally skipped (a dying character is already
 * unconscious + prone-equivalent).
 *
 * No game system currently triggers this — Pansori doesn't model
 * jumping, flying, or pit traps that drop creatures. The helper
 * exists so future content (Misty Step into open air, Levitate
 * dispel, knockback off ledges) has a one-call path that's RAW-
 * correct. Bludgeoning damage type is fixed.
 */
export function applyFallingDamage(
  char: Character,
  distanceFt: number,
  st: GameState
): {
  char: Character;
  st: GameState;
  amountDealt: number;
  /** Number of d6 rolled (capped at 20). 0 means no fall. */
  diceRolled: number;
  /** Raw roll total before any reductions (temp_hp etc.). */
  rolledDamage: number;
  /** Prone applied after the fall (false on knockout / death). */
  landedProne: boolean;
  /** Combined narrative chunk including concentration note if any. */
  narrative: string;
} {
  if (distanceFt < 10) {
    return {
      char,
      st,
      amountDealt: 0,
      diceRolled: 0,
      rolledDamage: 0,
      landedProne: false,
      narrative: '',
    };
  }
  const diceRolled = Math.min(20, Math.floor(distanceFt / 10));
  const rolledDamage = rollDice(`${diceRolled}d6`);
  const result = applyDamage(char, st, rolledDamage);
  // Prone only if the fall did damage AND the character is still
  // conscious afterward.
  let nextChar = result.char;
  let landedProne = false;
  if (result.amountDealt > 0 && nextChar.hp > 0 && !nextChar.dead) {
    nextChar = inflictCondition(nextChar, 'prone');
    landedProne = true;
  }
  const proneNote = landedProne ? ' — lands prone.' : '';
  const narrative = `${char.name} falls ${distanceFt} ft and takes ${result.amountDealt} bludgeoning damage (${diceRolled}d6 → ${rolledDamage})${proneNote}${result.concentrationNote}`;
  return {
    char: nextChar,
    st: result.st,
    amountDealt: result.amountDealt,
    diceRolled,
    rolledDamage,
    landedProne,
    narrative,
  };
}
