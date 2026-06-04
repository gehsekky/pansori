import type { ActionContext, ActionHandler } from '../types.js';
import type { Enemy, Spell } from '../../../types.js';
import { isSpellOutOfRange, runPrecast } from './precast.js';
import { rollDice, transmutedDamageType } from '../../rulesEngine.js';
import { runPowerWordKill, runPowerWordStun } from './powerWords.js';
import { BEAST_FORMS } from '../../../campaignData/srd/index.js';
import { applySingleTargetDamage } from './applyDamage.js';
import { composeNow } from '../../narrative/compose.js';
import { pick } from '../../gameEngine.js';
import { pickCastPrefix } from './utils.js';
import { runAoeConditionSpell } from './aoeCondition.js';
import { runAoeSpell } from './aoe.js';
import { runAttackRollSpell } from './attackRoll.js';
import { runAutoHitSpell } from './autoHit.js';
import { runBuffSpell } from './buff.js';
import { runCombatStart } from '../attack/combatStart.js';
import { runDivineWord } from './divineWord.js';
import { runEnlargeReduce } from './enlargeReduce.js';
import { runHealSpell } from './heal.js';
import { runMultiTargetSpell } from './multiTarget.js';
import { runPrismaticSpray } from './prismaticSpray.js';
import { runRecurringAttackSpell } from '../recurringSpellAttack.js';
import { runReviveSpell } from './revive.js';
import { runSaveSpell } from './save.js';
import { runShapeshiftSpell } from './shapeshift.js';
import { runSummonSpell } from './summon.js';
import { runUtilitySpell } from './utility.js';
import { runWallSpell } from './wall.js';
import { runZoneSpell } from './zone.js';
import { updatePcActor } from '../actor.js';

/**
 * SRD Ice Knife — apply the secondary cold burst centered on the target. Rolls
 * the AoE damage (base + per-slot-level upcast), synthesizes a sphere save
 * spell, and reuses `runAoeSpell` (epicenter = the targeted enemy). Fires on a
 * hit OR a miss; a no-op when there are no grid entities.
 */
function runSecondaryAoeBurst(
  ctx: ActionContext,
  spell: Spell,
  slotLevel: number,
  dc: number
): void {
  const sa = spell.secondaryAoe;
  if (!sa) return;
  let dmg = rollDice(sa.damage);
  if (sa.upcastBonus && slotLevel > spell.level) {
    for (let i = 0; i < slotLevel - spell.level; i++) dmg += rollDice(sa.upcastBonus);
  }
  const synth: Spell = {
    ...spell,
    attackRoll: false,
    damage: sa.damage,
    damageType: sa.damageType,
    savingThrow: sa.savingThrow,
    saveEffect: sa.saveEffect,
    blastRadius: sa.blastRadius,
    aoeShape: 'sphere',
    condition: undefined,
    secondaryAoe: undefined,
  };
  runAoeSpell(ctx, synth, slotLevel, dc, dmg);
}

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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can cast spells.' };
  const pc = ctx.actor;
  const { spellId, slotLevel } = action;
  const spell = ctx.context.spellTable?.[spellId];
  if (!spell) {
    ctx.narrative = `Unknown spell: ${spellId}.`;
    return;
  }

  const precast = runPrecast(
    ctx,
    action as {
      type: 'cast_spell';
      spellId: string;
      slotLevel: number;
      ritual?: boolean;
      divineIntervention?: boolean;
      overchannel?: boolean;
      mysticArcanum?: boolean;
      wishDuplicate?: boolean;
    },
    spell
  );
  if (precast.done) return;
  const { castingScore, slotNote, dc, isRitualCast, freeCast } = precast;

  // ── SRD Wish (basic use) ────────────────────────────────────────────────
  // Wish's own 9th-level slot was just spent in precast. If the caster chose a
  // spell to duplicate (level 1-8), re-dispatch it as a FREE duplicate
  // (`wishDuplicate` → precast skips slot / prep / material / level gates). The
  // turn's action was already consumed by Wish, so the duplicate rides on it.
  if (spell.id === 'wish') {
    const dupId = (action as { wishSpellId?: string }).wishSpellId;
    const dup = dupId ? ctx.context.spellTable?.[dupId] : undefined;
    if (dup && dup.level >= 1 && dup.level <= 8) {
      ctx.narrative = `🌟 ${pc.char.name} speaks a wish — reality reshapes to duplicate ${dup.name}.`;
      ctx.commitChar(); // persist the 9th-slot spend before re-entering takeAction
      return {
        replaceWith: {
          type: 'cast_spell',
          spellId: dup.id,
          slotLevel: dup.level,
          wishDuplicate: true,
          targetEnemyId: (action as { targetEnemyId?: string }).targetEnemyId,
          targetCharId: (action as { targetCharId?: string }).targetCharId,
          beastForm: (action as { beastForm?: string }).beastForm,
        },
      };
    }
    // No valid duplicate chosen → fall through to Wish's narrative (the
    // open-ended "alter reality" use is adjudicated at the table).
  }

  // ── Divine Smite (2024 PHB) ────────────────────────────────────────────
  // Bonus-action pre-buff: queues 2d8 radiant on the caster's next
  // successful weapon attack, upcast +1d8 per slot level above 1st.
  // The buff doesn't deal damage on cast — it stashes
  // `divine_smite_dice` on the character; the attack handler reads
  // and clears it on hit. Caller already paid the slot above.
  if (spell.id === 'divine_smite_spell') {
    const upcastBonus = Math.max(0, slotLevel - 1);
    const dice = 2 + upcastBonus;
    pc.char.divine_smite_dice = dice;
    composeNow(ctx, {
      kind: 'spell_utility',
      prose: `${pc.char.name} channels divine power${slotNote}! Their next weapon hit will deal an additional ${dice}d8 radiant damage.`,
    });
    return;
  }

  // ── Heal spells ────────────────────────────────────────────────────────
  if (spell.heal) {
    runHealSpell(ctx, spell, slotLevel, castingScore, slotNote);
    return;
  }

  // ── Bring-from-dead spells ────────────────────────────────────────────
  // Spells with `revive` set target a dead PC (the only state where
  // `dead === true`). Runs before the offensive enemy-required check
  // because revive doesn't need a living enemy, and before utility
  // because the revive validator wants to own the no-target error.
  if (
    runReviveSpell(
      ctx,
      action as {
        type: 'cast_spell';
        spellId: string;
        slotLevel: number;
        targetCharId?: string;
      },
      spell,
      slotNote
    )
  ) {
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
      action as {
        type: 'cast_spell';
        spellId: string;
        slotLevel: number;
        targetCharId?: string;
        restorationEffect?: string;
        resistType?: string;
        breathType?: string;
      },
      spell,
      slotLevel,
      slotNote,
      dc
    )
  ) {
    return;
  }

  // ── Enlarge/Reduce — target-determined buff (ally→Enlarged) / debuff
  // (enemy→Reduced), Concentration. Runs before the offensive enemy-required
  // check so an ally/self target resolves without a living enemy.
  if (
    runEnlargeReduce(
      ctx,
      action as {
        type: 'cast_spell';
        spellId: string;
        targetCharId?: string;
        targetEnemyId?: string;
      },
      spell
    )
  ) {
    return;
  }

  // ── Summon spells (Animate Dead) — out-of-combat, add a persistent
  // ally to summoned_allies; seeded into combat by seedSummonedAllies.
  // Runs before runUtilitySpell so it isn't swallowed as a no-op.
  if (
    runSummonSpell(
      ctx,
      spell,
      slotNote,
      slotLevel,
      (action as { summonVariant?: string }).summonVariant,
      castingScore
    )
  ) {
    return;
  }

  // ── Shapeshift spells (Shapechange, Animal Shapes) — put the caster / party
  // into a beast form via the wild_shaped machinery. Runs before runUtilitySpell
  // so it isn't swallowed as a no-op narrative.
  if (runShapeshiftSpell(ctx, spell, (action as { beastForm?: string }).beastForm)) {
    return;
  }

  // ── Utility spells (no damage, no save, no attack, no condition) ─────
  // Bless reads the player-chosen `targetCharIds` (else auto-picks).
  if (
    runUtilitySpell(
      ctx,
      spell,
      slotNote,
      (action as { targetCharIds?: string[] }).targetCharIds,
      slotLevel
    )
  ) {
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
  //   1. precast mutated pc.char (slot spent, action_used, gold, etc.)
  //      but those mutations live on the local pc.char reference;
  //      they aren't in ctx.st.characters yet. runCombatStart rebuilds
  //      pc.char from `ctx.st.characters` (line ~44, freshChar
  //      lookup) — without `commitChar()` first, the rebuild reverts
  //      every precast mutation. Commit before the call so they stick.
  //   2. combatStart overwrites `ctx.narrative` — save + prepend so
  //      precast's prelude (material-cost note) survives.
  //   3. combatStart resets `turn_actions` to FRESH_TURN, undoing the
  //      `action_used` (or `bonus_action_used`) precast just set. Save
  //      the precast turn_actions and restore after the call.
  const precastNarrative = ctx.narrative;
  const precastTurnActions = pc.char.turn_actions;
  ctx.commitChar();
  runCombatStart(ctx, spellTarget);
  if (precastNarrative) {
    ctx.narrative = precastNarrative + ctx.narrative;
  }
  updatePcActor(ctx, { turn_actions: precastTurnActions });
  ctx.commitChar();

  // SRD 5.2.1 — enforce spell range against the grid when entities exist.
  // 'self' spells need no target check (they originate from the caster).
  // 'touch' = adjacent only (≤ 1 grid square / 5 ft).
  // 'ranged' = up to spell.rangeFt feet of grid distance.
  if (
    isSpellOutOfRange(
      ctx,
      spell,
      spellTargetId,
      spellTarget.name,
      slotLevel,
      isRitualCast,
      freeCast
    )
  ) {
    return;
  }

  // SRD Hunter's Mark (L1) — mark the target enemy: set the tracked id +
  // concentration, no immediate damage. The +1d6/+1d10 Force rider on the
  // caster's hits lives in resolveOneAttack.
  if (spell.id === 'hunters_mark') {
    updatePcActor(ctx, {
      hunters_mark_target_id: spellTargetId,
      concentrating_on: { spellId: 'hunters_mark', rounds_left: spell.durationRounds ?? 600 },
    });
    ctx.narrative =
      (ctx.narrative ?? '') +
      pickCastPrefix(spell, {
        name: pc.char.name,
        spell: spell.name,
        slotNote,
        target: spellTarget.name,
      }) +
      '.';
    ctx.usedInitiative = true;
    return;
  }

  // SRD Power Word Kill (L9) — instant death if the target has ≤100 HP,
  // else 12d12 psychic; a L20 Bard's Words of Creation adds a second
  // target within 10 ft. Owns its own kill resolution, so it short-
  // circuits the generic auto-hit / single-target damage path below.
  if (spell.id === 'power_word_kill') {
    runPowerWordKill(ctx, spellTarget, spellTargetId, spell, slotNote);
    ctx.usedInitiative = true;
    return;
  }

  // SRD Power Word Stun (L8) — Stuns a target with ≤150 HP (CON save-ends each
  // turn), else drops its Speed to 0. No save/attack on cast; owns its own
  // resolution, so it short-circuits the generic damage path below.
  if (spell.id === 'power_word_stun') {
    runPowerWordStun(ctx, spellTarget, spellTargetId, spell, slotNote, dc);
    ctx.usedInitiative = true;
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

  // SRD Metamagic Transmuted Spell — change the spell's damage type to a
  // favorable one for this cast. A typed copy is threaded through the damage
  // branches + resistance multiplier (the rest of the spell is unchanged).
  const dmgSpell =
    ctx.metamagic?.includes('transmuted') && spell.damageType
      ? { ...spell, damageType: transmutedDamageType(spellTarget, spell.damageType) }
      : spell;

  // SRD Prismatic Spray — eight rays in a cone; each creature makes ONE DEX save,
  // then 1d8 picks its ray (damage / Restrain / Blind / two rays). Owns full
  // resolution, so it short-circuits the generic save / AoE damage path below.
  if (spell.prismaticRays) {
    runPrismaticSpray(ctx, spell, slotLevel, dc);
    ctx.usedInitiative = true;
    return;
  }

  // SRD Divine Word — each enemy in range makes a CHA save; on a failure a
  // target with ≤50 HP is slain or stunned/blinded/deafened by its current-HP
  // bracket. Owns full resolution, short-circuiting the generic save path.
  if (spell.divineWord) {
    runDivineWord(ctx, spell, dc);
    ctx.usedInitiative = true;
    return;
  }

  // SRD Metamagic Twinned Spell — a single-target spell also strikes a second
  // creature. Fully gated behind metamagic === 'twinned' so the normal cast
  // path below is untouched. Resolves the spell against the primary AND a 2nd
  // living enemy, each fully (a per-target miss doesn't skip the other).
  // Doesn't apply to AoE spells (RAW: Twinned needs a single-target spell).
  if (ctx.metamagic?.includes('twinned') && !spell.blastRadius) {
    const resolveTwin = (tgt: Enemy, tgtId: string): void => {
      let dmg = 0;
      let hit = true;
      if (spell.attackRoll) {
        const r = runAttackRollSpell(ctx, tgt, dmgSpell, slotLevel, castingScore, slotNote);
        if (r.done) return; // miss — fragment emitted, no damage to apply
        dmg = r.spellDmg;
        hit = r.spellHit;
      } else if (spell.savingThrow) {
        const r = runSaveSpell(ctx, tgt, tgtId, dmgSpell, slotLevel, slotNote, dc);
        if (r.done) return; // condition-save path handled it inline
        dmg = r.spellDmg;
        hit = r.spellHit;
      } else if (spell.damage) {
        dmg = runAutoHitSpell(ctx, tgt, dmgSpell, slotLevel, slotNote).spellDmg;
      }
      if (dmg > 0 || hit) applySingleTargetDamage(ctx, tgt, tgtId, dmgSpell, dmg);
    };
    resolveTwin(spellTarget, spellTargetId);
    const twin = ctx.livingEnemiesInRoom.find(
      (e) =>
        e.id !== spellTargetId &&
        (ctx.st.entities?.find((en) => en.id === e.id && en.isEnemy)?.hp ?? 0) > 0
    );
    if (twin) {
      ctx.narrative += ' [Twinned Spell]';
      resolveTwin(twin, twin.id);
    }
    ctx.usedInitiative = true;
    return;
  }

  // RE-4 — persistent damage zone spells (Cloud of Daggers, …) own their full
  // resolution: stamp the zone on the target's cell, bind concentration, and
  // tick once. No per-target attack/save roll here — the zone tick (now and on
  // each round wrap) applies the damage.
  if (spell.persistentZone && runZoneSpell(ctx, dmgSpell, slotLevel, dc, spellTargetId)) {
    return;
  }

  // RE-4 — recurring spell-attack spells (Spiritual Weapon, Vampiric Touch):
  // make the first spell attack and record `recurring_attack` so the caster can
  // re-issue it each turn (`recurring_spell_attack`).
  if (spell.recurringAttack) {
    runRecurringAttackSpell(ctx, dmgSpell, slotLevel, castingScore, spellTargetId);
    return;
  }

  // RE-4 — AoE condition spells (Confusion): apply the condition to every
  // hostile in the blast that fails the save (the single-target save branch
  // below only conditions the primary target). Opt-in via `aoeCondition`.
  if (spell.aoeCondition && runAoeConditionSpell(ctx, spell, dc)) {
    return;
  }

  // Multi-target save-condition spells (Bane): the FE picker supplies the chosen
  // enemies in `targetEnemyIds`. Resolve the save+condition independently for
  // each (reusing the single-target save resolver), so each enemy rolls its own
  // CHA save and the `baned` condition + concentration apply per failure. Only
  // for explicit-list spells (no blastRadius / aoeCondition); absent the list,
  // it falls through to the single-target branch below (back-compat).
  const multiTargetIds = (action as { targetEnemyIds?: string[] }).targetEnemyIds;
  if (
    spell.savingThrow &&
    spell.condition &&
    !spell.blastRadius &&
    !spell.aoeCondition &&
    Array.isArray(multiTargetIds) &&
    multiTargetIds.length > 0
  ) {
    for (const tid of multiTargetIds) {
      const tgt = ctx.livingEnemiesInRoom.find((e) => e.id === tid);
      if (tgt) runSaveSpell(ctx, tgt, tid, dmgSpell, slotLevel, slotNote, dc);
    }
    ctx.usedInitiative = true;
    return;
  }

  // Per-shape resolution. Each branch sets spellDmg + spellHit for
  // the AOE / single-target damage block. The save branch may return
  // done:true when the condition+damage path handles kill resolution
  // inline (Hold Person etc.).
  let spellDmg = 0;
  let spellHit = true;
  if (spell.attackRoll) {
    const r = runAttackRollSpell(ctx, spellTarget, dmgSpell, slotLevel, castingScore, slotNote);
    // SRD Ice Knife — the shard explodes whether the attack hit or missed,
    // bursting a save-for-half/negates AoE centered on the target. Reuses the
    // AoE path with a synthesized cold spell; runs before the hit/miss early
    // return so it always fires.
    if (spell.secondaryAoe) {
      runSecondaryAoeBurst(ctx, spell, slotLevel, dc);
    }
    if (r.done) return;
    spellDmg = r.spellDmg;
    spellHit = r.spellHit;
  } else if (spell.savingThrow) {
    // Polymorph — resolve the player-chosen beast form (else the resolver
    // defaults to Wolf). The form's HP becomes the polymorph Temp HP pool.
    const beastFormId = (action as { beastForm?: string }).beastForm;
    const form = beastFormId ? BEAST_FORMS[beastFormId] : undefined;
    const polymorphForm = form ? { name: form.name, hp: form.hp ?? 11 } : undefined;
    const r = runSaveSpell(
      ctx,
      spellTarget,
      spellTargetId,
      dmgSpell,
      slotLevel,
      slotNote,
      dc,
      polymorphForm
    );
    if (r.done) return;
    spellDmg = r.spellDmg;
    spellHit = r.spellHit;
  } else if (spell.damage && !spell.savingThrow && !spell.attackRoll) {
    const r = runAutoHitSpell(ctx, spellTarget, dmgSpell, slotLevel, slotNote);
    spellDmg = r.spellDmg;
  }

  // ── Wall/terrain spells ───────────────────────────────────────────────
  // A wall spell deals any formation damage, then raises a transient barrier
  // (blocks movement and/or line of sight) tied to the caster's concentration.
  if (spell.wall && runWallSpell(ctx, dmgSpell, slotLevel, dc, spellDmg, spellTargetId)) {
    return;
  }

  // ── AOE spells on grid ────────────────────────────────────────────────
  // If the spell has a blastRadius and grid entities exist, resolve
  // against all entities in the blast instead of the single-target path.
  if (runAoeSpell(ctx, dmgSpell, slotLevel, dc, spellDmg)) {
    return;
  }

  // Apply damage to single enemy target
  if (spellDmg > 0 || spellHit) {
    applySingleTargetDamage(ctx, spellTarget, spellTargetId, dmgSpell, spellDmg);
  }

  ctx.usedInitiative = true;
};
