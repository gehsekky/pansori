import type { Enemy, Spell } from '../../../types.js';
import { cantripDamageDice, rollDice, upcastDamage } from '../../rulesEngine.js';
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
  const spellDmg = rollDice(autoHitExpr || spell.damage || '0');
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
