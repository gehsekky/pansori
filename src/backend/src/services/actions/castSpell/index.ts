import { isSpellOutOfRange, runPrecast } from './precast.js';
import type { ActionHandler } from '../types.js';
import type { Enemy } from '../../../types.js';
import { applySingleTargetDamage } from './applyDamage.js';
import { composeNow } from '../../narrative/compose.js';
import { pick } from '../../gameEngine.js';
import { pickCastPrefix } from './utils.js';
import { runAoeSpell } from './aoe.js';
import { runAttackRollSpell } from './attackRoll.js';
import { runAutoHitSpell } from './autoHit.js';
import { runBuffSpell } from './buff.js';
import { runCombatStart } from '../attack/combatStart.js';
import { runHealSpell } from './heal.js';
import { runMultiTargetSpell } from './multiTarget.js';
import { runSaveSpell } from './save.js';
import { runUtilitySpell } from './utility.js';

// `pickCastPrefix` is consumed by the spec + future call sites that
// want to build cast-narrative prefixes outside the handler. Lives
// in ./utils.js; re-exported here so the import path stays the same.
export { pickCastPrefix };

/**
 * `cast_spell`: spell-casting dispatch. Thin orchestrator over the
 * per-phase modules under `castSpell/`:
 *
 *  1. `runPrecast` — armor / deafened / ritual / prep / slot /
 *     material / Quickened gates; expends the slot; marks action
 *     economy; runs Magic Initiate free-cast detection, EK War
 *     Magic flag, Wild Magic Surge, and resolves the casting
 *     ability + score + DC + slotNote.
 *  2. `divine_smite_spell` special-case — buffs the next weapon hit,
 *     no target needed.
 *  3. `runHealSpell` — heal spells (Cure Wounds, Healing Word).
 *  4. `runBuffSpell` — self/ally/self_or_ally buffs (Heroism, Aid,
 *     Mage Armor, Shield of Faith, Greater Invisibility).
 *  5. `runUtilitySpell` — narrative-only + Bless 3-target buff.
 *  6. Offensive precast — need a living enemy + target resolution +
 *     range check (with full slot/action-economy refund on out-of-
 *     range via `isSpellOutOfRange`).
 *  7. `runMultiTargetSpell` — Magic Missile / Eldritch Blast loop.
 *  8. Per-shape branch: `runAttackRollSpell` → `runSaveSpell` →
 *     `runAutoHitSpell`. Save branch may handle kill resolution
 *     inline (condition + damage path); other branches set
 *     `spellDmg` + `spellHit` for the applicator.
 *  9. `runAoeSpell` — sphere / cone / cube / line resolution on
 *     the grid (handles its own per-target kill resolution).
 * 10. `applySingleTargetDamage` — runs when the branch deferred
 *     damage application: resistance multiplier + grid HP write +
 *     kill resolution.
 */
export const handleCastSpell: ActionHandler<{
  type: 'cast_spell';
  spellId: string;
  slotLevel: number;
}> = (ctx, action) => {
  const { spellId, slotLevel } = action;
  const spell = ctx.context.spellTable?.[spellId];
  if (!spell) {
    ctx.narrative = `Unknown spell: ${spellId}.`;
    return;
  }

  const precast = runPrecast(
    ctx,
    action as { type: 'cast_spell'; spellId: string; slotLevel: number; ritual?: boolean },
    spell
  );
  if (precast.done) return;
  const { castingScore, slotNote, dc, isRitualCast } = precast;

  // ── Divine Smite (2024 PHB) ────────────────────────────────────────────
  // Bonus-action pre-buff: queues 2d8 radiant on the caster's next
  // successful weapon attack, upcast +1d8 per slot level above 1st.
  // The buff doesn't deal damage on cast — it stashes
  // `divine_smite_dice` on the character; the attack handler reads
  // and clears it on hit. Caller already paid the slot above.
  if (spell.id === 'divine_smite_spell') {
    const upcastBonus = Math.max(0, slotLevel - 1);
    const dice = 2 + upcastBonus;
    ctx.char.divine_smite_dice = dice;
    composeNow(ctx, {
      kind: 'spell_utility',
      prose: `${ctx.char.name} channels divine power${slotNote}! Their next weapon hit will deal an additional ${dice}d8 radiant damage.`,
    });
    return;
  }

  // ── Heal spells ────────────────────────────────────────────────────────
  if (spell.heal) {
    runHealSpell(ctx, spell, slotLevel, castingScore, slotNote);
    return;
  }

  // ── Self / ally buff spells (early) ──────────────────────────────────
  // Spells where `targetType` is 'self', 'ally', or 'self_or_ally' don't
  // need a living enemy — they apply a condition and/or temp HP and/or a
  // max-HP bonus to the caster or a chosen party member. Wired BEFORE
  // the utility-spell early-return so non-condition buffs (Heroism +
  // tempHpGrant, Aid + maxHpBonus, Mage Armor) don't get short-circuited.
  if (
    runBuffSpell(
      ctx,
      action as { type: 'cast_spell'; spellId: string; slotLevel: number; targetCharId?: string },
      spell,
      slotLevel,
      slotNote
    )
  ) {
    return;
  }

  // ── Utility spells (no damage, no save, no attack, no condition) ─────
  if (runUtilitySpell(ctx, spell, slotNote)) {
    return;
  }

  // ── Offensive spells — need a living ctx.enemy ───────────────────────
  if (!ctx.enemy || !ctx.enemyAlive) {
    ctx.narrative = pick(ctx.context.narratives.noEnemy);
    return;
  }

  // Resolve targeted ctx.enemy: explicit targetEnemyId wins; fallback to first living
  const spellTargetId: string =
    (action as { type: 'cast_spell'; targetEnemyId?: string }).targetEnemyId ?? ctx.enemy.id;
  const spellTarget: Enemy =
    ctx.livingEnemiesInRoom.find((e) => e.id === spellTargetId) ?? ctx.enemy;

  // Combat-start hook. If a hostile spell is the first engaging action
  // in a fresh room (no combat yet, no entities seeded), `runCombatStart`
  // rolls initiative, seeds grid entities, and runs the surprise check
  // — the same setup the Attack handler does. Without this,
  // `applySingleTargetDamage` reads the missing entity's HP as 0 and
  // fake-kills the target with any positive damage (Spiritual Weapon
  // one-shotting bosses, etc.). `runCombatStart` is idempotent (returns
  // early when `combat_active` is set), so re-casting during combat is
  // a no-op.
  //
  // Three integration concerns:
  //   1. precast mutated ctx.char (slot spent, action_used, gold, etc.)
  //      but those mutations live on the local ctx.char reference;
  //      they aren't in ctx.st.characters yet. runCombatStart rebuilds
  //      ctx.char from `ctx.st.characters` (line ~44, freshChar
  //      lookup) — without `commitChar()` first, the rebuild reverts
  //      every precast mutation. Commit before the call so they stick.
  //   2. combatStart overwrites `ctx.narrative` — save + prepend so
  //      precast's prelude (material-cost note) survives.
  //   3. combatStart resets `turn_actions` to FRESH_TURN, undoing the
  //      `action_used` (or `bonus_action_used`) precast just set. Save
  //      the precast turn_actions and restore after the call.
  const precastNarrative = ctx.narrative;
  const precastTurnActions = ctx.char.turn_actions;
  ctx.commitChar();
  runCombatStart(ctx, spellTarget);
  if (precastNarrative) {
    ctx.narrative = precastNarrative + ctx.narrative;
  }
  ctx.char = { ...ctx.char, turn_actions: precastTurnActions };
  ctx.commitChar();

  // SRD 5.2.1 — enforce spell range against the grid when entities exist.
  // 'self' spells need no target check (they originate from the caster).
  // 'touch' = adjacent only (≤ 1 grid square / 5 ft).
  // 'ranged' = up to spell.rangeFt feet of grid distance.
  if (isSpellOutOfRange(ctx, spell, spellTargetId, spellTarget.name, slotLevel, isRitualCast)) {
    return;
  }

  // 2024 PHB Magic Missile / Eldritch Blast multi-target.
  if (
    runMultiTargetSpell(
      ctx,
      action as { type: 'cast_spell'; spellId: string; targetEnemyIds?: string[] },
      spell,
      castingScore,
      slotNote
    )
  ) {
    return;
  }

  // Per-shape resolution. Each branch sets spellDmg + spellHit for
  // the AOE / single-target damage block. The save branch may return
  // done:true when the condition+damage path handles kill resolution
  // inline (Hold Person etc.).
  let spellDmg = 0;
  let spellHit = true;
  if (spell.attackRoll) {
    const r = runAttackRollSpell(ctx, spellTarget, spell, slotLevel, castingScore, slotNote);
    if (r.done) return;
    spellDmg = r.spellDmg;
    spellHit = r.spellHit;
  } else if (spell.savingThrow) {
    const r = runSaveSpell(ctx, spellTarget, spellTargetId, spell, slotLevel, slotNote, dc);
    if (r.done) return;
    spellDmg = r.spellDmg;
    spellHit = r.spellHit;
  } else if (spell.damage && !spell.savingThrow && !spell.attackRoll) {
    const r = runAutoHitSpell(ctx, spellTarget, spell, slotLevel, slotNote);
    spellDmg = r.spellDmg;
  }

  // ── AOE spells on grid ────────────────────────────────────────────────
  // If the spell has a blastRadius and grid entities exist, resolve
  // against all entities in the blast instead of the single-target path.
  if (runAoeSpell(ctx, spell, slotLevel, dc, spellDmg)) {
    return;
  }

  // Apply damage to single enemy target
  if (spellDmg > 0 || spellHit) {
    applySingleTargetDamage(ctx, spellTarget, spellTargetId, spell, spellDmg);
  }

  ctx.usedInitiative = true;
};
