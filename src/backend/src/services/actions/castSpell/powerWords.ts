import type { Character, Enemy, Spell } from '../../../types.js';
import type { ActionContext } from '../types.js';
import { applySingleTargetDamage } from './applyDamage.js';
import { composeNow } from '../../narrative/compose.js';
import { distanceFeet } from '../../gridEngine.js';
import { hasWordsOfCreation } from '../../multiclass.js';
import { pickCastPrefix } from './utils.js';
import { rollDice } from '../../rulesEngine.js';

/**
 * SRD Power Word Kill (L9 Enchantment) — "You compel one creature you
 * can see within range to die. If the target has 100 Hit Points or
 * fewer, it dies. Otherwise, it takes 12d12 Psychic damage." No save,
 * no attack roll. The death branch is NOT damage, so it ignores
 * resistance/vulnerability (`bypassResistance`); the 12d12 fallback for
 * high-HP targets is real psychic damage and runs through the
 * multiplier as usual.
 *
 * A Bard's L20 Words of Creation lets the spell also strike a second
 * creature within 10 ft of the first — resolved here after the primary.
 *
 * Intercepted in the castSpell orchestrator after the combat-start +
 * range gates, so it owns kill resolution for both targets via
 * `applySingleTargetDamage`.
 */
export function runPowerWordKill(
  ctx: ActionContext,
  spellTarget: Enemy,
  spellTargetId: string,
  spell: Spell,
  slotNote: string
): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;

  resolveOne(ctx, char, spellTarget, spellTargetId, spell, slotNote);

  // Words of Creation: a second target within 10 ft of the first.
  if (!hasWordsOfCreation(char)) return;
  const entities = ctx.st.entities ?? [];
  const primaryPos = entities.find((e) => e.id === spellTargetId && e.isEnemy)?.pos;
  if (!primaryPos) return;
  const killed = new Set(ctx.st.enemies_killed);
  const inRange = entities.filter(
    (e) =>
      e.isEnemy &&
      e.id !== spellTargetId &&
      (e.hp ?? 0) > 0 &&
      !killed.has(e.id) &&
      distanceFeet(primaryPos, e.pos) <= 10
  );
  if (inRange.length === 0) return;
  const secondEnt = inRange.reduce((a, b) =>
    distanceFeet(primaryPos, a.pos) <= distanceFeet(primaryPos, b.pos) ? a : b
  );
  const secondEnemy = ctx.livingEnemiesInRoom.find((en) => en.id === secondEnt.id);
  if (!secondEnemy) return;
  resolveOne(ctx, char, secondEnemy, secondEnt.id, spell, '', true);
}

function resolveOne(
  ctx: ActionContext,
  char: Character,
  enemy: Enemy,
  enemyId: string,
  spell: Spell,
  slotNote: string,
  isSecond = false
): void {
  const ent = ctx.st.entities?.find((e) => e.id === enemyId && e.isEnemy);
  const curHp = ent?.hp ?? 0;
  if (curHp <= 0) return; // already dead (e.g. cleared by the primary)
  const castPrefix = pickCastPrefix(spell, {
    name: char.name,
    spell: spell.name,
    slotNote,
    target: enemy.name,
  });
  const woc = isSecond ? ' (Words of Creation)' : '';
  if (curHp <= 100) {
    // ≤100 HP → dies outright. Damage equal to current HP guarantees
    // the kill; bypassResistance keeps it from being scaled away.
    composeNow(ctx, {
      kind: 'spell_utility',
      prose: `${castPrefix}! ${enemy.name} has 100 HP or fewer — the word of death takes hold${woc}.`,
    });
    applySingleTargetDamage(ctx, enemy, enemyId, spell, curHp, { bypassResistance: true });
  } else {
    // >100 HP → 12d12 psychic (resistance applies normally).
    const dmg = rollDice('12d12');
    composeNow(ctx, {
      kind: 'spell_auto_hit',
      attackerId: char.id,
      attackerName: char.name,
      target: enemy,
      spellId: spell.id,
      spellName: spell.name,
      castPrefix,
      damage: dmg,
      damageType: spell.damageType ?? 'psychic',
    });
    applySingleTargetDamage(ctx, enemy, enemyId, spell, dmg);
  }
}
