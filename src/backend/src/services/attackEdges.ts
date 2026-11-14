import { CONDITIONS, DISADV_CONDITIONS, PLAYER_ADV_CONDITIONS } from './conditions/registry.js';
import type { Character, Enemy } from '../types.js';
import { canSeeTarget, coverBonus, distanceFeet, magicalDarknessCells } from './gridEngine.js';
import { d20TestPenalty, seesInDarkness } from './rulesEngine.js';
import { getClassLevel, hasFeralSenses, piercesMagicalDarkness } from './multiclass.js';
import type { ActionContext } from './actions/types.js';
import { grappledAttackDisadvantage } from './unarmedStrike.js';
import { isHeavilyEncumbered } from './gameEngine.js';
import { updatePcActor } from './actions/actor.js';

// SRD: Rules Glossary — Advantage / Disadvantage sources that apply to ANY
// attack roll a PC makes against an enemy (weapon, unarmed, or spell): the
// attacker's own conditions, the target's conditions, Ranged Attacks in Close
// Combat, Cover, Vision & Light, and the one-shot "your next attack roll" grants
// (Help, Heroic Inspiration, Steady Aim, Vex, Studied Attacks). Weapon-only
// sources (armor training, Heavy + Small, thrown long range, Reckless Attack,
// flanking, Pack Tactics) stay in `computeToHitContext`.

export interface AttackEdges {
  /** Ranged attack with a non-Incapacitated enemy within 5 ft. */
  rangedInMelee: boolean;
  /** The attacker's own disadvantage conditions (Poisoned, Prone, ...). */
  selfDisadvConditions: string[];
  /** The attacker's own advantage conditions (Invisible). */
  selfAdv: boolean;
  heavilyEncumbered: boolean;
  /** Grappled, attacking someone other than the grappler. */
  grappled: boolean;
  /** Target is Prone and the attacker is within 5 ft. */
  proneAdv: boolean;
  /** Target is Prone and the attacker is farther than 5 ft. */
  proneDisadv: boolean;
  /** Target conditions that grant attackers Advantage (Paralyzed, Stunned, ...). */
  targetAdvConditions: string[];
  /** Target conditions that impose Disadvantage on attackers (Invisible, Blur). */
  targetDisadvConditions: string[];
  /** The PC can't see the target in darkness. */
  darknessDisadv: boolean;
  /** The target can't see the PC in darkness. */
  darknessAdv: boolean;
  /** Help / Precise Hunter / Inspiration / Luck / Steady Aim / Vex / Studied. */
  grantedAdv: string[];
  coverAcBonus: number;
  /** A hit is a Critical Hit (Paralyzed / Unconscious target within 5 ft). */
  autoCritOnHit: boolean;
  /** Flat penalty on the d20 (Exhaustion, Raise Dead). */
  penalty: number;
  advantage: boolean;
  disadvantage: boolean;
}

/** Target conditions that grant attackers Advantage, per the registry + Faerie Fire. */
const TARGET_ADV = (c: string) =>
  c !== 'prone' &&
  (CONDITIONS[c]?.grantsAdvantageToAttackers === true ||
    // SRD Faerie Fire — attack rolls against an outlined creature have Advantage.
    c === 'faerie_fired');

/**
 * Compute every generic Advantage / Disadvantage source for the active PC
 * attacking `targetId`. Consumes the one-shot grants (Help, Inspiration, Luck,
 * Steady Aim, Vex, Studied) on ctx — call it once per attack roll.
 *
 * `fromAdjacent` makes the attack come from within 5 ft of the target regardless
 * of grid positions (Spiritual Weapon, which attacks from its own space).
 */
export function computeAttackEdges(
  ctx: ActionContext,
  target: Enemy,
  targetId: string,
  opts: { ranged: boolean; fromAdjacent?: boolean }
): AttackEdges {
  if (ctx.actor.kind !== 'pc') throw new Error('computeAttackEdges: PC actor only');
  const char: Character = ctx.actor.char;
  const ents = ctx.st.entities ?? [];
  const pcEnt = ents.find((e) => e.id === char.id && !e.isEnemy);
  const tgtEnt = ents.find((e) => e.id === targetId && e.isEnemy);
  const tgtConds = tgtEnt?.conditions ?? [];
  // Without grid positions, treat the attack as point-blank (melee) and the
  // attacker as free of nearby threats — the pre-grid default.
  const dist =
    opts.fromAdjacent || !pcEnt || !tgtEnt
      ? opts.ranged
        ? 6
        : 5
      : distanceFeet(pcEnt.pos, tgtEnt.pos);
  const within5 = opts.fromAdjacent || !pcEnt || !tgtEnt ? !opts.ranged : dist <= 5;

  // SRD Ranged Attacks in Close Combat — Disadvantage with a non-Incapacitated
  // enemy within 5 ft. (The "who can see you" clause isn't modeled.)
  const rangedInMelee =
    opts.ranged &&
    !!pcEnt &&
    ents.some(
      (e) =>
        e.isEnemy &&
        e.hp > 0 &&
        !e.conditions.includes('incapacitated') &&
        distanceFeet(pcEnt.pos, e.pos) <= 5
    );

  // SRD Ranger Feral Senses (L18) — Blindsight; Blinded doesn't hamper the
  // ranger's own attacks.
  const ignoreBlinded = hasFeralSenses(char);
  const selfDisadvConditions = char.conditions.filter(
    (c) => DISADV_CONDITIONS.has(c) && !(c === 'blinded' && ignoreBlinded)
  );
  const selfAdv = char.conditions.some((c) => PLAYER_ADV_CONDITIONS.has(c));
  const heavilyEncumbered = isHeavilyEncumbered(char);
  const grappled = grappledAttackDisadvantage(char.conditions, pcEnt?.grappled_by, targetId);

  // SRD Prone — Advantage if the attacker is within 5 ft, else Disadvantage.
  const targetProne = tgtConds.includes('prone');
  const proneAdv = targetProne && within5;
  const proneDisadv = targetProne && !within5;
  const targetAdvConditions = tgtConds.filter(TARGET_ADV);
  // SRD Invisible — negated by See Invisibility (`sees_invisible`).
  const targetDisadvConditions = tgtConds.filter(
    (c) =>
      CONDITIONS[c]?.imposesDisadvantageOnAttackers === true &&
      !(c === 'invisible' && char.sees_invisible)
  );
  // SRD Paralyzed / Unconscious — any hit from within 5 ft is a Critical Hit.
  const autoCritOnHit =
    within5 && (tgtConds.includes('paralyzed') || tgtConds.includes('unconscious'));

  // SRD Cover — the target's AC bonus from creatures + obstacles in the way.
  let coverAcBonus = 0;
  if (pcEnt && tgtEnt && !opts.fromAdjacent) {
    const obstacles = [
      ...ents.filter((e) => e.id !== char.id && e.id !== targetId).map((e) => e.pos),
      ...ctx.roomObstacleCells,
    ];
    coverAcBonus = coverBonus(pcEnt.pos, tgtEnt.pos, obstacles);
  }

  // SRD Vision & Light — in a dark room a creature that can't see is
  // effectively Blinded: it attacks at Disadvantage, and attacks against it
  // have Advantage. Enemies default to 60 ft darkvision.
  const roomDark = ctx.seed?.rooms?.find((r) => r.id === ctx.roomId)?.lighting === 'dark';
  const pcBlindsight = piercesMagicalDarkness(char);
  const darknessCells = magicalDarknessCells(ctx.st.spell_zones);
  const pcCanSeeTarget = canSeeTarget({
    observerPos: pcEnt?.pos,
    targetPos: tgtEnt?.pos,
    observerCanSeeInDark: seesInDarkness(char.darkvision_ft ?? 0, pcBlindsight),
    observerPiercesMagicalDarkness: pcBlindsight,
    roomDark,
    entities: ents,
    darknessCells,
    obstacles: ctx.roomObstacleCells,
  });
  const targetCanSeePc = canSeeTarget({
    observerPos: tgtEnt?.pos,
    targetPos: pcEnt?.pos,
    observerCanSeeInDark: seesInDarkness(target.darkvision_ft ?? 60, false),
    observerPiercesMagicalDarkness: false,
    roomDark,
    entities: ents,
    darknessCells,
    obstacles: ctx.roomObstacleCells,
  });
  const darknessDisadv = !pcCanSeeTarget;
  const darknessAdv = !targetCanSeePc;

  // One-shot "next attack roll" grants, consumed here.
  const grantedAdv: string[] = [];
  if (ctx.st.help_target_id === char.id) {
    grantedAdv.push('Help');
    ctx.st = { ...ctx.st, help_target_id: undefined };
  }
  // SRD Ranger Precise Hunter (L17) — Advantage vs your Hunter's Mark target.
  if (getClassLevel(char, 'ranger') >= 17 && char.hunters_mark_target_id === targetId) {
    grantedAdv.push('Precise Hunter');
  }
  const ta = ctx.actor.char.turn_actions;
  if (ta.inspiration_pending) {
    grantedAdv.push('Heroic Inspiration');
    updatePcActor(ctx, { turn_actions: { ...ta, inspiration_pending: false }, inspiration: false });
  }
  if (ctx.actor.char.turn_actions.luck_pending) {
    grantedAdv.push('Luck');
    updatePcActor(ctx, {
      turn_actions: { ...ctx.actor.char.turn_actions, luck_pending: false },
    });
  }
  // SRD Rogue Steady Aim (L3) — Advantage on the next attack roll this turn.
  if (ctx.actor.char.turn_actions.steady_aim_pending) {
    grantedAdv.push('Steady Aim');
    updatePcActor(ctx, {
      turn_actions: { ...ctx.actor.char.turn_actions, steady_aim_pending: false },
    });
  }
  // SRD Vex mastery / Fighter Studied Attacks (L13) — Advantage on the next
  // attack roll against the tagged creature; the tag is consumed.
  for (const [tag, label] of [
    [`vexed_by_${char.id}`, 'Vex'],
    [`studied_by_${char.id}`, 'Studied Attacks'],
  ] as const) {
    const has = !!ctx.st.entities?.find(
      (e) => e.id === targetId && e.isEnemy && e.conditions.includes(tag)
    );
    if (!has) continue;
    grantedAdv.push(label);
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === targetId && e.isEnemy
          ? { ...e, conditions: e.conditions.filter((c) => c !== tag) }
          : e
      ),
    };
  }

  const advantage =
    selfAdv || proneAdv || targetAdvConditions.length > 0 || darknessAdv || grantedAdv.length > 0;
  const disadvantage =
    rangedInMelee ||
    selfDisadvConditions.length > 0 ||
    heavilyEncumbered ||
    grappled ||
    proneDisadv ||
    targetDisadvConditions.length > 0 ||
    darknessDisadv;

  return {
    rangedInMelee,
    selfDisadvConditions,
    selfAdv,
    heavilyEncumbered,
    grappled,
    proneAdv,
    proneDisadv,
    targetAdvConditions,
    targetDisadvConditions,
    darknessDisadv,
    darknessAdv,
    grantedAdv,
    coverAcBonus,
    autoCritOnHit,
    penalty: d20TestPenalty(char),
    advantage,
    disadvantage,
  };
}

/** A short "(advantage — …)" / "(disadvantage — …)" note for a spell attack. */
export function attackEdgeNote(e: AttackEdges): string {
  const dis = [
    e.rangedInMelee ? 'ranged in melee' : '',
    e.selfDisadvConditions.join(', '),
    e.heavilyEncumbered ? 'heavily encumbered' : '',
    e.grappled ? 'grappled' : '',
    e.proneDisadv ? 'target prone (beyond 5 ft)' : '',
    e.darknessDisadv ? "can't see the target" : '',
    e.targetDisadvConditions.map((c) => `target ${c}`).join(', '),
  ].filter(Boolean);
  const adv = [
    e.selfAdv ? 'unseen' : '',
    e.proneAdv ? 'target prone' : '',
    e.targetAdvConditions.map((c) => `target ${c.replace('_', ' ')}`).join(', '),
    e.darknessAdv ? "target can't see you" : '',
    ...e.grantedAdv,
  ].filter(Boolean);
  if (adv.length && dis.length) return ' (advantage and disadvantage cancel)';
  if (dis.length) return ` (disadvantage — ${dis.join(', ')})`;
  if (adv.length) return ` (advantage — ${adv.join(', ')})`;
  return '';
}
