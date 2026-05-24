import type { Enemy, Spell } from '../../../types.js';
import {
  abilityMod,
  cantripDamageDice,
  resolveSpellAttack,
  rollCritical,
  rollDice,
  upcastDamage,
} from '../../rulesEngine.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { pickCastPrefix } from './utils.js';

/**
 * Spell-attack-roll branch. Rolls one attack vs the target's AC,
 * emits hit / miss fragments, and returns the rolled damage + whether
 * the hit landed (so the orchestrator's downstream single-target
 * damage block can apply resistance / vulnerability + kill resolution).
 *
 * On miss, emits `spell_attack_miss` and signals the orchestrator to
 * return immediately via `done: true`. On hit, emits `spell_attack_hit`
 * (the orchestrator's damage applicator handles resistance + kill).
 */
export function runAttackRollSpell(
  ctx: ActionContext,
  spellTarget: Enemy,
  spell: Spell,
  slotLevel: number,
  castingScore: number,
  slotNote: string
): { done: boolean; spellDmg: number; spellHit: boolean } {
  if (ctx.actor.kind !== 'pc') return { done: true, spellDmg: 0, spellHit: false };
  const { char } = ctx.actor;
  // SRD Sorcerer Innate Sorcery (L1): Advantage on Sorcerer spell attack rolls
  // while active.
  const innateAdv = char.conditions.includes('innate_sorcery');
  const atk = resolveSpellAttack(char.level, castingScore, spellTarget.ac, innateAdv);
  const spellHit = atk.hit;
  const atkNote = ` (spell attack ${atk.roll}+${atk.bonus}=${atk.total} vs AC ${spellTarget.ac})`;
  const castPrefix = pickCastPrefix(spell, {
    name: char.name,
    spell: spell.name,
    slotNote,
    target: spellTarget.name,
  });
  if (!spellHit) {
    composeNow(ctx, {
      kind: 'spell_attack_miss',
      attackerId: char.id,
      attackerName: char.name,
      target: spellTarget,
      spellId: spell.id,
      spellName: spell.name,
      castPrefix,
      toHit: atk.total,
      targetAc: spellTarget.ac,
      atkNote,
    });
    return { done: true, spellDmg: 0, spellHit: false };
  }
  const atkDmgExpr =
    spell.level === 0 ? cantripDamageDice(spell, char.level) : upcastDamage(spell, slotLevel);
  let spellDmg = atk.critical ? rollCritical(atkDmgExpr || null) : rollDice(atkDmgExpr || '1d4');
  // Agonizing Blast: Warlock invocation — add CHA mod to Eldritch Blast damage
  const agonizingBonus =
    spell.id === 'eldritch_blast' && (char.feats ?? []).includes('agonizing_blast')
      ? Math.max(0, abilityMod(char.cha))
      : 0;
  spellDmg += agonizingBonus;
  composeNow(ctx, {
    kind: 'spell_attack_hit',
    attackerId: char.id,
    attackerName: char.name,
    target: spellTarget,
    spellId: spell.id,
    spellName: spell.name,
    castPrefix,
    damage: spellDmg,
    damageType: spell.damageType ?? '',
    isCrit: atk.critical,
    toHit: atk.total,
    targetAc: spellTarget.ac,
    atkNote,
    bonuses: agonizingBonus > 0 ? [{ label: `Agonizing Blast: +${agonizingBonus}` }] : undefined,
  });
  return { done: false, spellDmg, spellHit: true };
}
