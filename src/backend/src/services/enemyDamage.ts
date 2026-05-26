import { abilityMod, rollDice } from './rulesEngine.js';
import { fmt } from './narrativeFmt.js';

/**
 * The minimal slice the floor reads off the seed `Enemy` — kept narrow so
 * the helper stays trivially testable with a literal stub.
 */
export interface EnemyDamageSubject {
  undeadFortitude?: boolean;
  con?: number;
  name?: string;
}

export interface EnemyDamageOpts {
  /** Damage type of this instance — Radiant is exempt from Undead Fortitude. */
  damageType?: string;
  /** A Critical Hit is exempt from Undead Fortitude. */
  isCrit?: boolean;
}

/**
 * Central enemy-damage floor — the single place that decides what HP an
 * enemy is left at after a damage instance, i.e. whether a hit that "would
 * drop it to 0" actually kills.
 *
 * Today it hosts one trait: **Undead Fortitude** (Zombie). SRD 5.2.1 — if
 * damage reduces the undead to 0 HP, it makes a Constitution saving throw
 * (DC 5 + the damage taken) and drops to 1 HP on a success, UNLESS the
 * damage is Radiant or from a Critical Hit.
 *
 * For every enemy WITHOUT `undeadFortitude` the result is exactly
 * `max(0, cur - dmg)`, so all existing combat is unchanged — the hook is a
 * provable no-op until a monster opts in. Future on-damage / on-"reduced
 * to 0" traits (damage thresholds, regeneration interaction, death
 * triggers) should funnel through here rather than re-deriving the
 * `<= 0` decision at each call site.
 *
 * @param enemy   the seed Enemy (read for the trait flag + CON); `undefined`
 *                is treated as a plain creature with no floor trait.
 * @param curHp   the entity's current HP before this instance.
 * @param dmgToHp the damage actually landing on HP (after temp-HP / resist
 *                adjustments the caller has already applied).
 */
export function enemyHpAfterDamage(
  enemy: EnemyDamageSubject | undefined,
  curHp: number,
  dmgToHp: number,
  opts: EnemyDamageOpts = {}
): { hp: number; note: string; fortitudeSaved: boolean } {
  const remaining = curHp - dmgToHp;
  if (remaining > 0) return { hp: remaining, note: '', fortitudeSaved: false };
  // The instance would drop the enemy to 0 — Undead Fortitude gets a save.
  if (
    enemy?.undeadFortitude &&
    dmgToHp > 0 &&
    opts.damageType?.toLowerCase() !== 'radiant' &&
    !opts.isCrit
  ) {
    const dc = 5 + dmgToHp;
    const roll = rollDice('1d20') + abilityMod(enemy.con ?? 10);
    if (roll >= dc) {
      return {
        hp: 1,
        note: ` ${fmt.note(
          `[Undead Fortitude: CON ${roll} vs DC ${dc} — the ${enemy.name ?? 'undead'} refuses to fall (1 HP)]`
        )}`,
        fortitudeSaved: true,
      };
    }
  }
  return { hp: 0, note: '', fortitudeSaved: false };
}
