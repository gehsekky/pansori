import {
  abilityMod,
  profBonus,
  rageDamageBonus,
  rageUsesMax,
  rollDice,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  getEnemyById,
  getItemData,
  isRoomCleared,
  splitEncounterXp,
} from '../../gameEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import type { InventoryItem } from '../../../types.js';

/**
 * Barbarian + Berserker features (SRD-only build).
 *
 * Returns `true` if the action's featureId matched a Barbarian
 * feature (caller stops the per-class dispatch chain). Returns
 * `false` to let the chain continue.
 *
 *  - `rage`: bonus action. Long-rest resource (rageUsesMax per
 *    barbarian level). +STR melee damage, resistance to physical
 *    attacks.
 *  - `reckless_attack`: L2+ free toggle. Advantage on STR melee
 *    attacks this turn; enemies have advantage against you until
 *    your next turn.
 *  - `frenzy_attack`: Berserker subclass — the SRD-iconic
 *    Barbarian path. While raging, one extra melee weapon attack
 *    as a bonus action. Exhaustion-on-rage-end is deferred.
 */
export function handleBarbarianFeature(ctx: ActionContext, fid: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  const features = ctx.context.classFeatures?.[char.character_class] ?? [];

  if (fid === 'rage') {
    if (!features.includes('rage')) {
      ctx.narrative = `${char.character_class} does not have Rage.`;
      return true;
    }
    if (char.conditions.includes('raging')) {
      ctx.narrative = 'You are already raging!';
      return true;
    }
    // Rage uses + damage scale with BARBARIAN level (not total level).
    const barbLvl = getClassLevel(char, 'barbarian');
    const rageUses = char.class_resource_uses?.rage_uses ?? rageUsesMax(barbLvl);
    if (rageUses <= 0) {
      ctx.narrative = 'No rage uses remaining. They recover on a long rest.';
      return true;
    }
    char.conditions = [...char.conditions, 'raging'];
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      rage_uses: rageUses - 1,
    };
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${char.name} RAGES! +${rageDamageBonus(barbLvl)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)`;
    return true;
  }

  if (fid === 'reckless_attack') {
    if (!hasClass(char, 'barbarian')) {
      ctx.narrative = 'Only Barbarians have Reckless Attack.';
      return true;
    }
    if (getClassLevel(char, 'barbarian') < 2) {
      ctx.narrative = 'Reckless Attack requires Barbarian level 2.';
      return true;
    }
    if (char.turn_actions.reckless) {
      ctx.narrative = 'You are already attacking recklessly this turn.';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, reckless: true };
    ctx.narrative = `${char.name} attacks recklessly! Advantage on STR melee attacks this turn — but enemies have advantage against you until your next turn.`;
    return true;
  }

  if (fid === 'frenzy_attack') {
    if (char.subclass !== 'berserker' || !hasClass(char, 'barbarian')) {
      ctx.narrative = 'Only Berserker Barbarians have Frenzy.';
      return true;
    }
    if (!char.conditions.includes('raging')) {
      ctx.narrative = 'You must be raging to use Frenzy.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No enemy to Frenzy attack.';
      return true;
    }
    const frWeapon = char.equipped_weapon
      ? getItemData(
          char.inventory?.find((i) => i.instance_id === char.equipped_weapon) as InventoryItem,
          ctx.context
        )
      : null;
    if (frWeapon?.range === 'ranged') {
      ctx.narrative = 'Frenzy requires a melee weapon.';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    const frTarget = ctx.livingEnemiesInRoom[0] ?? ctx.enemy;
    const frToHit = rollDice('1d20') + abilityMod(char.str) + profBonus(char.level);
    if (frToHit >= (frTarget.ac ?? 10)) {
      const dmgDice = frWeapon?.damage ?? '1d4';
      const frDmg = Math.max(
        1,
        rollDice(dmgDice) + abilityMod(char.str) + rageDamageBonus(getClassLevel(char, 'barbarian'))
      );
      const curHp = ctx.st.entities?.find((e) => e.id === frTarget.id && e.isEnemy)?.hp ?? 0;
      const newHp = Math.max(0, curHp - frDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === frTarget.id && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative = `💢 ${char.name} — Frenzy! (${frToHit} hits AC ${frTarget.ac}) ${frDmg} ${frWeapon?.damageType ?? 'bludgeoning'}${newHp <= 0 ? ` — ${frTarget.name} falls!` : ''}`;
      if (newHp <= 0) {
        const split = splitEncounterXp(ctx.st, char.id, frTarget.xp ?? 10);
        ctx.st = split.st;
        char.xp = (char.xp || 0) + split.share;
        ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, frTarget.id];
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
          char.conditions = char.conditions.filter((c) => c !== 'raging');
        }
      }
    } else {
      ctx.narrative = `💢 ${char.name} — Frenzy! (${frToHit} vs AC ${frTarget.ac}) — miss.`;
    }
    return true;
  }

  if (fid === 'brutal_strike_forceful' || fid === 'brutal_strike_hamstring') {
    if (!hasClass(char, 'barbarian') || getClassLevel(char, 'barbarian') < 9) {
      ctx.narrative = 'Brutal Strike requires Barbarian level 9.';
      return true;
    }
    if (!char.turn_actions.reckless) {
      ctx.narrative = 'Brutal Strike requires Reckless Attack this turn.';
      return true;
    }
    const rider = fid === 'brutal_strike_forceful' ? 'forceful' : 'hamstring';
    char.turn_actions = { ...char.turn_actions, brutal_strike_pending: rider };
    const label =
      rider === 'forceful'
        ? 'Forceful Blow (push 15 ft, then close in)'
        : 'Hamstring Blow (−15 ft Speed)';
    ctx.narrative = `${char.name} readies a Brutal Strike — ${label}. The next Strength melee attack forgoes advantage; on a hit it deals +1d10 and applies the effect.`;
    return true;
  }

  if (fid === 'intimidating_presence') {
    if (char.subclass !== 'berserker' || getClassLevel(char, 'barbarian') < 14) {
      ctx.narrative = 'Intimidating Presence requires a Berserker of level 14.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    // 1/long rest, or spend a Rage use to use it again.
    const ipUsed = char.class_resource_uses?.intimidating_presence_used ?? 0;
    const rageLeft =
      char.class_resource_uses?.rage_uses ?? rageUsesMax(getClassLevel(char, 'barbarian'));
    if (ipUsed > 0 && rageLeft <= 0) {
      ctx.narrative =
        'Intimidating Presence is spent — it returns after a long rest (or expend a Rage use).';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    char.class_resource_uses =
      ipUsed === 0
        ? { ...(char.class_resource_uses ?? {}), intimidating_presence_used: 1 }
        : { ...(char.class_resource_uses ?? {}), rage_uses: rageLeft - 1 };
    const ipDC = 8 + abilityMod(char.str) + profBonus(char.level);
    const selfEntIP = ctx.st.entities?.find((e) => e.id === char.id);
    const frightenedIds: string[] = [];
    const ipLines: string[] = [];
    for (const e of ctx.st.entities ?? []) {
      if (!e.isEnemy || e.hp <= 0 || !selfEntIP) continue;
      const dist = Math.max(
        Math.abs(e.pos.x - selfEntIP.pos.x),
        Math.abs(e.pos.y - selfEntIP.pos.y)
      );
      if (dist > 6) continue; // 30 ft = 6 squares
      const enemyData = getEnemyById(ctx.seed, e.id);
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      if (save < ipDC) {
        frightenedIds.push(e.id);
        ipLines.push(`${enemyData?.name ?? 'enemy'}: WIS ${save} vs DC ${ipDC} — frightened!`);
      } else {
        ipLines.push(`${enemyData?.name ?? 'enemy'}: WIS ${save} vs DC ${ipDC} — resists.`);
      }
    }
    if (frightenedIds.length > 0) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          frightenedIds.includes(e.id)
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
    }
    ctx.narrative =
      ipLines.length > 0
        ? `😱 ${char.name}'s Intimidating Presence! ${ipLines.join(' ')}`
        : `${char.name} unleashes Intimidating Presence — no creatures within 30 ft.`;
    return true;
  }

  return false;
}
