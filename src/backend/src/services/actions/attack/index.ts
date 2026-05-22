import {
  type AttackContext,
  extraAttackCountForChar,
  resolveOneAttack,
} from './resolveOneAttack.js';
import type { ActionHandler } from '../types.js';
import { computeToHitContext } from './toHit.js';
import { runCombatStart } from './combatStart.js';
import { runPreattack } from './preattack.js';

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
 *     cover/flanking, Help target, Assassin/Vow/Reckless/Inspiration/
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
  };

  // ── First attack ─────────────────────────────────────────────────────
  const killed = resolveOneAttack(ctx, atkCtx, '');
  if (!killed) {
    // ── Extra Attack (Fighter L5+, Ranger/Paladin/Barbarian/Monk L5) ───
    // SRD 5.2.1 p.90 "Loading": a Loading weapon fires only once per
    // Action/Bonus/Reaction regardless of Extra Attack.
    // Multiclass: `extraAttackCountForChar` walks all class levels
    // and takes the max. RAW: Extra Attack from multiple classes
    // doesn't add together — a Fighter 5 / Ranger 5 gets 1 extra
    // (not 2). The Fighter L11/20 cap only applies when the PC
    // actually has 11+ fighter levels.
    const extraCount = weaponItem?.loading ? 0 : extraAttackCountForChar(ctx.char);
    for (let ei = 0; ei < extraCount; ei++) {
      if ((ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.hp ?? 0) <= 0) break;
      const killedExtra = resolveOneAttack(ctx, atkCtx, `Attack ${ei + 2} — `);
      if (killedExtra) break;
    }
  }

  // Action consumed. Initiative advances unless a bonus-action choice is
  // available (checked after commitChar — see auto-advance block below
  // the switch).
  ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
};
