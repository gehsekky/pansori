import {
  abilityMod,
  applyDamageMultiplier,
  profBonus,
  rollCritical,
  rollDice,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  getEnemyById,
  isRoomCleared,
  pushEvent,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { distanceFeet } from '../../gridEngine.js';
import { fmt } from '../../narrativeFmt.js';

/**
 * Paladin + Ranger + Bard features. Three small classes bundled —
 * mostly Channel Divinity (Paladin) and subclass utility.
 *
 *  Bard (Lore subclass only — base Bard bonus action is here too):
 *   - `bardic_inspiration`: grant a die to an ally (d6→d12 by level).
 *   - `cutting_words` (Lore): reaction. Spend a BI use; the next
 *     enemy attack/check takes a die-roll subtraction. Stages
 *     state.cutting_words_penalty for the attack handler.
 *
 *  Ranger:
 *   - `colossus_slayer` (Hunter): once per turn vs a bloodied target,
 *     +1d8 damage. Bloodied = HP < max_hp.
 *   - `command_companion` (Beastmaster L3+): bonus action attack from
 *     the wolf companion. The companion entity comes from PR 14's
 *     combat-start initialization.
 *
 *  Paladin Channel Divinity:
 *   - `sacred_weapon` (Devotion): +CHA to attack rolls for 1 minute.
 *     Read by attack.ts via state.sacred_weapon_active flag.
 *   - `vow_of_enmity` (Vengeance): tag the current target for
 *     attack-roll advantage. state.vow_of_enmity_target picks it up.
 *   - `abjure_enemy` (Vengeance): WIS save → frightened.
 */
export function handlePaladinRangerBardFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'bardic_inspiration') {
    if (ctx.char.character_class.toLowerCase() !== 'bard') {
      ctx.narrative = 'Only Bards have Bardic Inspiration.';
      return true;
    }
    const biUses =
      ctx.char.class_resource_uses?.bardic_inspiration ??
      Math.max(1, Math.floor((ctx.char.cha - 10) / 2));
    if (biUses <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const ally = ctx.st.characters.find((c) => c.id !== ctx.char.id && !c.dead && c.hp > 0);
    if (!ally) {
      ctx.narrative = 'No ally to inspire.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biUses - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const inspDie =
      ctx.char.level >= 15
        ? 'd12'
        : ctx.char.level >= 10
          ? 'd10'
          : ctx.char.level >= 5
            ? 'd8'
            : 'd6';
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) =>
        c.id === ally.id ? { ...c, bardic_inspiration_die: inspDie } : c
      ),
    };
    ctx.narrative = `${ctx.char.name} grants Bardic Inspiration (${inspDie}) to ${ally.name}! (${biUses - 1} use${biUses - 1 === 1 ? '' : 's'} remaining)`;
    return true;
  }

  if (fid === 'colossus_slayer') {
    if (ctx.char.subclass !== 'hunter') {
      ctx.narrative = 'Only Hunter Rangers have Colossus Slayer.';
      return true;
    }
    const csTarget = ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy);
    if (!ctx.enemyAlive || !csTarget) {
      ctx.narrative = 'No living target.';
      return true;
    }
    const enemyMaxHp =
      (ctx.enemy as unknown as Record<string, number>)['max_hp'] ?? csTarget.hp * 2;
    if (csTarget.hp >= enemyMaxHp) {
      ctx.narrative = 'Colossus Slayer only triggers on a bloodied (below max HP) target.';
      return true;
    }
    if ((ctx.char.class_resource_uses?.colossus_slayer_used ?? 0) >= 1) {
      ctx.narrative = 'Colossus Slayer already triggered this turn.';
      return true;
    }
    const csDmg = rollDice('1d8');
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      colossus_slayer_used: 1,
    };
    const csHp = (ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy)?.hp ?? 0) - csDmg;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.roomId && e.isEnemy ? { ...e, hp: Math.max(0, csHp) } : e
      ),
    };
    ctx.narrative = `Colossus Slayer! +${fmt.dmg(csDmg)} piercing damage on a bloodied foe (${csHp <= 0 ? 'killed' : `${fmt.hp(Math.max(0, csHp))} HP remaining`}).`;
    if (csHp <= 0) {
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, ctx.roomId];
      ctx.st = endCombatState(ctx.st);
    }
    return true;
  }

  if (fid === 'command_companion') {
    if (
      ctx.char.subclass !== 'beastmaster' ||
      ctx.char.character_class.toLowerCase() !== 'ranger'
    ) {
      ctx.narrative = 'Only Beastmaster Rangers can command an animal companion.';
      return true;
    }
    if (ctx.char.level < 3) {
      ctx.narrative = 'Animal Companion unlocks at Ranger level 3.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const comp = ctx.st.entities?.find(
      (e) => e.isCompanion && e.companionOwnerId === ctx.char.id && e.hp > 0
    );
    if (!comp) {
      ctx.narrative = 'Your animal companion is unavailable.';
      return true;
    }
    const targetEnt = (ctx.st.entities ?? [])
      .filter((e) => e.isEnemy && e.hp > 0)
      .sort((a, b) => distanceFeet(comp.pos, a.pos) - distanceFeet(comp.pos, b.pos))[0];
    if (!targetEnt) {
      ctx.narrative = 'No living enemy in sight for the companion.';
      return true;
    }
    const targetEnemy = getEnemyById(ctx.seed, targetEnt.id);
    if (!targetEnemy) {
      ctx.narrative = "Companion's target is unreachable.";
      return true;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.usedInitiative = true;
    const toHit = comp.toHit ?? 4;
    const dmgDice = comp.damage ?? '2d4+2';
    const compName = comp.companionName ?? 'companion';
    const attackRoll = rollDice('1d20');
    const total = attackRoll + toHit;
    if (attackRoll === 1) {
      ctx.narrative = `${compName} lunges but misses wildly! (d20:1+${toHit}=${total} vs AC ${targetEnemy.ac})`;
    } else if (attackRoll === 20 || total >= targetEnemy.ac) {
      const isCrit = attackRoll === 20;
      const dmg = isCrit ? rollCritical(dmgDice) : rollDice(dmgDice);
      const { damage: finalDmg, note } = applyDamageMultiplier(dmg, 'piercing', targetEnemy);
      const curHp = targetEnt.hp;
      const newHp = Math.max(0, curHp - finalDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetEnt.id && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative = `${compName} bites the ${targetEnemy.name}! ${finalDmg} piercing damage${isCrit ? ' (CRIT)' : ''} (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})${note}`;
      if (newHp <= 0) {
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, targetEnt.id];
        ctx.narrative += ` ${targetEnemy.name} falls!`;
        const xpGain = targetEnemy.xp ?? 10;
        const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
        }
      }
    } else {
      ctx.narrative = `${compName} bites at the ${targetEnemy.name} but misses. (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})`;
    }
    return true;
  }

  if (fid === 'sacred_weapon') {
    if (ctx.char.subclass !== 'devotion') {
      ctx.narrative = 'Only Devotion Paladins have Sacred Weapon.';
      return true;
    }
    const cdUsesDev = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesDev <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesDev - 1,
      sacred_weapon_active: 1,
    };
    const chaMod = abilityMod(ctx.char.cha);
    ctx.narrative = `${ctx.char.name} — Sacred Weapon! +${chaMod} to attack rolls for 1 minute (10 rounds). Your weapon gleams with divine light. (${cdUsesDev - 1} Channel Divinity remaining)`;
    return true;
  }

  if (fid === 'vow_of_enmity') {
    if (ctx.char.subclass !== 'vengeance') {
      ctx.narrative = 'Only Vengeance Paladins have Vow of Enmity.';
      return true;
    }
    const cdUsesVen = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesVen <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesVen - 1,
    };
    ctx.st = { ...ctx.st, vow_of_enmity_target: ctx.roomId };
    ctx.narrative = `${ctx.char.name} — Vow of Enmity! You have advantage on all attack rolls against ${ctx.enemy?.name ?? 'your target'} for 1 minute. (${cdUsesVen - 1} Channel Divinity remaining)`;
    return true;
  }

  if (fid === 'abjure_enemy') {
    if (ctx.char.subclass !== 'vengeance') {
      ctx.narrative = 'Only Vengeance Paladins have Abjure Enemy.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    const cdUsesVen2 = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesVen2 <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesVen2 - 1,
    };
    const wisSave =
      rollDice('1d20') + abilityMod((ctx.enemy as unknown as Record<string, number>)['wis'] ?? 10);
    const frightenDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
    const abjureSuccess = wisSave >= frightenDC;
    ctx.st = pushEvent(ctx.st, {
      kind: 'save',
      characterId: ctx.enemy!.id,
      characterName: ctx.enemy!.name,
      ability: 'wis',
      roll: wisSave,
      dc: frightenDC,
      success: abjureSuccess,
      vs: 'Abjure Enemy',
      round: ctx.st.round ?? 1,
    });
    if (!abjureSuccess) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === ctx.roomId && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId: ctx.enemy!.id,
        targetName: ctx.enemy!.name,
        condition: 'frightened',
        source: 'Abjure Enemy',
        prose: `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${ctx.enemy!.name} is frightened! (${cdUsesVen2 - 1} Channel Divinity remaining)`,
      });
    } else {
      ctx.narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${ctx.enemy!.name} resists. (${cdUsesVen2 - 1} Channel Divinity remaining)`;
    }
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'cutting_words') {
    if (ctx.char.subclass !== 'lore') {
      ctx.narrative = 'Only Lore Bards have Cutting Words.';
      return true;
    }
    if (ctx.char.turn_actions.reaction_used) {
      ctx.narrative = 'Reaction already used this turn.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    const biLeft = ctx.char.class_resource_uses?.bardic_inspiration ?? abilityMod(ctx.char.cha);
    if (biLeft <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biLeft - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, reaction_used: true };
    const cuttingDie =
      ctx.char.level >= 15 ? 12 : ctx.char.level >= 10 ? 10 : ctx.char.level >= 5 ? 8 : 6;
    const cuttingRoll = rollDice(`1d${cuttingDie}`);
    ctx.narrative = `${ctx.char.name} — Cutting Words! Subtract ${cuttingRoll} from ${ctx.enemy!.name}'s next attack roll or ability check this round. (${biLeft - 1} Bardic Inspiration remaining)`;
    ctx.st = { ...ctx.st, cutting_words_penalty: cuttingRoll };
    return true;
  }

  return false;
}
