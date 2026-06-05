import type { Enemy, Spell } from '../../../types.js';
import {
  applyPartyLevelUps,
  dominatedDamageReSave,
  endCombatState,
  enemyHpAfterDamage,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { applyDamageMultiplier } from '../../rulesEngine.js';
import { fillEnemyTokens } from '../../narrative/enemyName.js';
import { fmt } from '../../narrativeFmt.js';
import { grantEnemyDrops } from '../enemyDrops.js';

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
  spellDmgIn: number,
  opts?: { bypassResistance?: boolean }
): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  // `bypassResistance` — used by Power Word Kill's instant-death branch:
  // the target simply dies, which is not damage, so resistance /
  // vulnerability must not scale it. The 12d12-psychic fallback for
  // high-HP targets does run through the multiplier (it IS damage).
  const { damage: effSpellDmg, note: spellDmgNote } = opts?.bypassResistance
    ? { damage: spellDmgIn, note: '' }
    : applyDamageMultiplier(spellDmgIn, spell.damageType, spellTarget);
  if (spellDmgNote) ctx.narrative += spellDmgNote;
  const spellDmg = effSpellDmg;
  const enemyEntSpell = ctx.st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
  const curEnemyHpSpell = enemyEntSpell?.hp ?? 0;
  // Central enemy-damage floor — Undead Fortitude can avert the drop to 0.
  // Spell-attack crits aren't plumbed to this helper, so a crit cantrip still
  // offers the save (a minor RAW over-generosity vs the far commoner save /
  // auto-hit branches, which never crit).
  const { hp: newEnemyHpSpell, note: fortitudeNote } = enemyHpAfterDamage(
    spellTarget,
    curEnemyHpSpell,
    spellDmg,
    { damageType: spell.damageType }
  );
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === spellTargetId && e.isEnemy ? { ...e, hp: newEnemyHpSpell } : e
    ),
  };
  if (newEnemyHpSpell <= 0) {
    const xpGain = spellTarget.xp ?? 10;
    const split = splitEncounterXp(ctx.st, char.id, xpGain);
    ctx.st = split.st;
    const xpShare = split.share;
    char.xp = (char.xp || 0) + xpShare;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
      ),
    };
    ctx.st.enemies_killed = [...ctx.st.enemies_killed, spellTargetId];
    ctx.narrative += grantDarkOnesBlessing(char);
    if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
      ctx.st = endCombatState(ctx.st);
    }
    ctx.narrative +=
      ' ' +
      fillEnemyTokens(pick(ctx.context.narratives.killShot), spellTarget).replace(
        '{xp}',
        String(xpShare)
      );
    grantEnemyDrops(ctx, spellTarget);
    ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
  } else {
    ctx.narrative += fortitudeNote;
    ctx.narrative += ` The ${spellTarget.name} has ${fmt.hp(newEnemyHpSpell)} HP remaining.`;
    // SRD Dominate — taking damage lets the target re-save to break free.
    dominatedDamageReSave(ctx, spellTargetId, spellTarget.name);
  }
}
