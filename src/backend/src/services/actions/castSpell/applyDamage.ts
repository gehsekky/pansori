import type { Enemy, Spell } from '../../../types.js';
import {
  applyPartyLevelUps,
  endCombatState,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { applyDamageMultiplier } from '../../rulesEngine.js';
import { fmt } from '../../narrativeFmt.js';

/**
 * Single-target damage applicator for the attack-roll, save-with-
 * damage, and auto-hit branches. Multiplies the dealt damage by
 * enemy resistance / vulnerability (appending the note inline),
 * writes the new HP on the grid entity, and on kill: splits XP,
 * appends Dark One's Blessing, ends combat if the room is cleared,
 * emits the killShot narrative, and bumps party level-ups.
 *
 * Called by the orchestrator AFTER the per-shape branch has set
 * `spellDmg` + `spellHit`, gated on `spellDmg > 0 || spellHit`.
 */
export function applySingleTargetDamage(
  ctx: ActionContext,
  spellTarget: Enemy,
  spellTargetId: string,
  spell: Spell,
  spellDmgIn: number
): void {
  const { damage: effSpellDmg, note: spellDmgNote } = applyDamageMultiplier(
    spellDmgIn,
    spell.damageType,
    spellTarget
  );
  if (spellDmgNote) ctx.narrative += spellDmgNote;
  const spellDmg = effSpellDmg;
  const enemyEntSpell = ctx.st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
  const curEnemyHpSpell = enemyEntSpell?.hp ?? 0;
  const newEnemyHpSpell = curEnemyHpSpell - spellDmg;
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === spellTargetId && e.isEnemy ? { ...e, hp: newEnemyHpSpell } : e
    ),
  };
  if (newEnemyHpSpell <= 0) {
    const xpGain = spellTarget.xp ?? 10;
    const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
    ctx.st = split.st;
    const xpShare = split.share;
    ctx.char.xp = (ctx.char.xp || 0) + xpShare;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
      ),
    };
    ctx.st.enemies_killed = [...ctx.st.enemies_killed, spellTargetId];
    ctx.narrative += grantDarkOnesBlessing(ctx.char);
    if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
      ctx.st = endCombatState(ctx.st);
    }
    ctx.narrative +=
      ' ' +
      pick(ctx.context.narratives.killShot)
        .replace('{enemy}', spellTarget.name)
        .replace('{xp}', String(xpShare));
    ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
  } else {
    ctx.narrative += ` The ${spellTarget.name} has ${fmt.hp(newEnemyHpSpell)} HP remaining.`;
  }
}
