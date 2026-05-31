import {
  type AttackContext,
  extraAttackCountForChar,
  resolveOneAttack,
} from './resolveOneAttack.js';
import { getClassLevel, huntersPrey } from '../../multiclass.js';
import type { ActionHandler } from '../types.js';
import { computeToHitContext } from './toHit.js';
import { runCombatStart } from './combatStart.js';
import { runPreattack } from './preattack.js';
import { strokeOfLuckAvailable } from '../../strokeOfLuck.js';
import { updatePcActor } from '../actor.js';

/**
 * `attack`: the core melee/ranged combat resolution. Pansori's biggest
 * single action. Lifted verbatim from gameEngine.ts in PR 14; internal
 * sub-splits (pre-attack guards / combat-start / resolve-one-attack /
 * post-hit effects) land in follow-up PRs.
 *
 * Pipeline:
 *  1. Pre-attack gates: target resolution, grid range, charmed/stunned/
 *     paralyzed, weapon resolution (versatile + beast form override),
 *     ranged ammo consumption. See attack/preattack.ts.
 *  2. Combat-start (first attack): build initiative order, seed grid
 *     entities (PCs + Beastmaster companions + enemies), surprise check
 *     via group Stealth vs enemy passive Perception, opening-blow text.
 *     See attack/combatStart.ts.
 *  3. To-hit context: armor/weapon proficiency, condition advantages,
 *     cover/flanking, Help target, Vow/Reckless/Inspiration/
 *     Pack Tactics/Vex/Studied/Wolf Totem adv/disadv stacking. See
 *     attack/toHit.ts.
 *  4. `resolveOneAttack` (per attack): rolls, BI/Bless re-rolls,
 *     fumble + miss + hit branches, sneak attack, rage damage,
 *     damage multiplier, narrative + combat_log events, Cunning
 *     Strike effects, weapon mastery effects (Vex/Topple/Push/Sap/
 *     Slow/Cleave), kill resolution (XP split, Dark One's Blessing,
 *     end combat on room clear). See attack/resolveOneAttack.ts.
 *  5. First attack + Extra Attack loop (Fighter L5+).
 */
export const handleAttack: ActionHandler<{ type: 'attack'; targetEnemyId?: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can attack.' };
  const pc = ctx.actor;
  // ── Pre-attack: target resolution, range/charm/incapacitation gates,
  //    weapon resolution (Beast Form override, Versatile/Flex), and
  //    ranged-ammo consumption. The runPreattack function mutates ctx
  //    (narrative, usedInitiative, inventory) and returns done:true to
  //    short-circuit, or the resolved weapon/target payload the rest of
  //    the pipeline needs.
  const pre = runPreattack(ctx, action);
  if (pre.done) return;
  const { target, targetId, weaponItem, weaponDamage, isVersatile, weaponLabel } = pre;

  // ── Combat-start: only fires on the first attack of an encounter.
  //    Rolls initiative for everyone, seeds grid entities (PCs +
  //    Beastmaster companions + enemies), runs the surprise check, and
  //    emits the opening-blow narrative.
  runCombatStart(ctx, target);

  // ── To-hit context: compute armor/weapon proficiency, all the
  //    advantage/disadvantage sources, cover/flanking, crit threshold,
  //    Sacred Weapon and Guided Strike bonuses, etc. Mutates ctx to
  //    consume one-shot tags (Vex, Studied, Help target, Heroic
  //    Inspiration, Guided Strike).
  const toHit = computeToHitContext(ctx, { target, targetId, weaponItem });

  // Bundle everything resolveOneAttack reads into one struct so the
  // extra-attack loop reuses the same captured state across iterations
  // (adv/disadv computed once, stable across the loop).
  const atkCtx: AttackContext = {
    target,
    targetId,
    weaponItem,
    weaponDamage,
    isVersatile,
    weaponLabel,
    toHit,
    // Defer Stroke of Luck — on a miss the first attack opens an interactive
    // reaction window (below) instead of auto-converting the miss to a hit.
    deferStrokeOfLuck: true,
  };

  // 2024 PHB Heroic Inspiration post-roll reaction window — snapshot
  // the pre-attack state so the reaction resolver can rewind on accept
  // (the resolver re-runs this attack with a forced d20).
  const preAttackChar = pc.char;
  const preAttackSt = ctx.st;

  // ── First attack ─────────────────────────────────────────────────────
  const killed = resolveOneAttack(ctx, atkCtx, '');

  // 2024 PHB Heroic Inspiration post-roll pause. SRD: "expend it to
  // reroll any die immediately after rolling it, and you must use the
  // new roll." Pansori MVP surfaces the prompt only on a missed
  // attack — RAW would also let you reroll a hit for crit chasing,
  // but the UX cost of paging through "do you want to reroll your
  // hit?" on every attack is too high for MVP.
  //
  // Pre-declared `spend_inspiration` (advantage at roll time) takes
  // priority — if `inspiration_pending` is set, the advantage already
  // applied and we don't surface the post-roll reaction (Inspiration
  // is already spent).
  const lastResult = ctx.lastAttackResult;
  // Heroic Inspiration can reroll a non-fumble miss; Stroke of Luck (Rogue L20,
  // 1/rest) can rescue ANY miss — including a fumble — by forcing a natural 20.
  // Either makes a missed first attack pause for an interactive reaction.
  const inspirationAvail =
    !!pc.char.inspiration && !pc.char.turn_actions?.inspiration_pending && !lastResult?.fumble;
  const strokeAvail = strokeOfLuckAvailable(pc.char);
  const shouldPauseD20 =
    !killed && !!lastResult && !lastResult.hit && (inspirationAvail || strokeAvail);

  if (shouldPauseD20 && lastResult) {
    // Stash the proposed snapshot (post-miss) + pre-attack snapshot
    // (for rewind) + attack-context (for re-resolve with forced d20).
    // Resolver in reaction.ts consumes these. `source` records the primary
    // available feature; generateChoices offers every available source.
    ctx.st = {
      ...ctx.st,
      pending_reaction: {
        kind: 'pc_d20',
        source: inspirationAvail ? 'inspiration' : 'stroke_of_luck',
        rollerCharId: pc.char.id,
        rollContext: 'attack',
        originalD20: lastResult.d20,
        originalTotal: lastResult.total,
        originalHit: lastResult.hit,
        eligibleCharIds: [pc.char.id],
        // BE-only narrowing of the attack-context blob — FE just
        // round-trips this and reads kind/source/d20 for the choice
        // label.
        attackContext: {
          preAttackChar,
          preAttackSt,
          atkCtx,
        },
        pendingProposedChar: pc.char,
        pendingProposedSt: ctx.st,
        resumeFromInitiativeIdx: ctx.st.initiative_idx,
      },
    };
    // Don't run Extra Attack and don't consume the action — the
    // resolver decides whether the attack happens at all.
    return;
  }

  if (!killed) {
    // ── Extra Attack (Fighter L5+, Ranger/Paladin/Barbarian/Monk L5) ───
    // SRD 5.2.1 p.90 "Loading": a Loading weapon fires only once per
    // Action/Bonus/Reaction regardless of Extra Attack.
    // SRD Haste — "That action can be used only to take the Attack
    // (one weapon attack only)." When the haste_extra_action wrapper
    // delegated to this handler, `haste_extra_action_used` is already
    // true (the wrapper marks the slot consumed before delegating);
    // we read that flag here to suppress the Extra Attack loop.
    // Multiclass: `extraAttackCountForChar` walks all class levels
    // and takes the max. RAW: Extra Attack from multiple classes
    // doesn't add together — a Fighter 5 / Ranger 5 gets 1 extra
    // (not 2). The Fighter L11/20 cap only applies when the PC
    // actually has 11+ fighter levels.
    const isHasteExtra = pc.char.turn_actions.haste_extra_action_used;
    const extraCount = weaponItem?.loading || isHasteExtra ? 0 : extraAttackCountForChar(pc.char);
    for (let ei = 0; ei < extraCount; ei++) {
      if ((ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.hp ?? 0) <= 0) break;
      const killedExtra = resolveOneAttack(ctx, atkCtx, `Attack ${ei + 2} — `);
      if (killedExtra) break;
    }
  }

  // ── Ranger Horde Breaker (Hunter's Prey option) ────────────────────────
  // Once per turn, an extra attack with the same weapon against a different
  // creature within 5 ft of the original target (a separate attack roll).
  if (
    weaponItem &&
    huntersPrey(pc.char) === 'horde_breaker' &&
    pc.char.subclass === 'hunter' &&
    getClassLevel(pc.char, 'ranger') >= 3 &&
    !pc.char.turn_actions.horde_breaker_used
  ) {
    const origEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
    const hbEnt = origEnt
      ? (ctx.st.entities ?? []).find(
          (e) =>
            e.isEnemy &&
            e.hp > 0 &&
            e.id !== targetId &&
            Math.max(Math.abs(e.pos.x - origEnt.pos.x), Math.abs(e.pos.y - origEnt.pos.y)) <= 1
        )
      : undefined;
    const hbEnemy = hbEnt ? ctx.livingEnemiesInRoom.find((en) => en.id === hbEnt.id) : undefined;
    if (hbEnt && hbEnemy) {
      updatePcActor(ctx, {
        turn_actions: { ...pc.char.turn_actions, horde_breaker_used: true },
      });
      const hbToHit = computeToHitContext(ctx, {
        target: hbEnemy,
        targetId: hbEnt.id,
        weaponItem,
      });
      const hbAtkCtx: AttackContext = {
        target: hbEnemy,
        targetId: hbEnt.id,
        weaponItem,
        weaponDamage,
        isVersatile,
        weaponLabel,
        toHit: hbToHit,
      };
      resolveOneAttack(ctx, hbAtkCtx, 'Horde Breaker — ');
    }
  }

  // Action consumed. Initiative advances unless a bonus-action choice is
  // available (checked after commitChar — see auto-advance block below
  // the switch).
  updatePcActor(ctx, { turn_actions: { ...pc.char.turn_actions, action_used: true } });
};
