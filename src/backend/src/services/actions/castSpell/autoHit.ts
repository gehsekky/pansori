import type { Enemy, Spell } from '../../../types.js';
import {
  abilityMod,
  cantripDamageDice,
  maxDice,
  rollDice,
  rollDiceEmpowered,
  upcastDamage,
} from '../../rulesEngine.js';
import {
  elementalAffinityBonus,
  empoweredEvocationBonus,
  potentSpellcastingBonus,
} from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { pickCastPrefix } from './utils.js';

/**
 * Auto-hit damage branch — spells with damage but no save and no
 * attack roll (Magic Missile single-target shape). Rolls the damage
 * dice (cantrip scaling or slot-upcast), emits a `spell_auto_hit`
 * fragment, and returns the rolled damage for the orchestrator's
 * single-target damage applier to handle resistance + kill resolution.
 */
export function runAutoHitSpell(
  ctx: ActionContext,
  spellTarget: Enemy,
  spell: Spell,
  slotLevel: number,
  slotNote: string
): { spellDmg: number } {
  if (ctx.actor.kind !== 'pc') return { spellDmg: 0 };
  const { char } = ctx.actor;
  const autoHitExpr =
    spell.level === 0 ? cantripDamageDice(spell, char.level) : upcastDamage(spell, slotLevel);
  // SRD Metamagic Empowered Spell — reroll up to CHA-mod of the lowest dice;
  // Draconic Elemental Affinity — +CHA to the damage roll of the affinity type.
  const spellDmg =
    (ctx.overchannel
      ? maxDice(autoHitExpr || spell.damage || '0')
      : ctx.metamagic?.includes('empowered')
        ? rollDiceEmpowered(autoHitExpr || spell.damage || '0', Math.max(1, abilityMod(char.cha)))
        : rollDice(autoHitExpr || spell.damage || '0')) +
    elementalAffinityBonus(char, spell.damageType) +
    potentSpellcastingBonus(char, spell) +
    empoweredEvocationBonus(char, spell);
  composeNow(ctx, {
    kind: 'spell_auto_hit',
    attackerId: char.id,
    attackerName: char.name,
    target: spellTarget,
    spellId: spell.id,
    spellName: spell.name,
    castPrefix: pickCastPrefix(spell, {
      name: char.name,
      spell: spell.name,
      slotNote,
    }),
    damage: spellDmg,
    damageType: spell.damageType ?? '',
  });
  return { spellDmg };
}
