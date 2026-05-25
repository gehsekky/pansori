import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import { endCombatState, isRoomCleared } from '../../gameEngine.js';
import { getClassLevel, hasClass, huntersPrey } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
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
 *   - `abjure_enemy` (Vengeance): WIS save → frightened.
 */
export function handlePaladinRangerBardFeature(ctx: ActionContext, fid: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (fid === 'bardic_inspiration') {
    if (!hasClass(char, 'bard')) {
      ctx.narrative = 'Only Bards have Bardic Inspiration.';
      return true;
    }
    const biUses =
      char.class_resource_uses?.bardic_inspiration ?? Math.max(1, Math.floor((char.cha - 10) / 2));
    if (biUses <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const ally = ctx.st.characters.find((c) => c.id !== char.id && !c.dead && c.hp > 0);
    if (!ally) {
      ctx.narrative = 'No ally to inspire.';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      bardic_inspiration: biUses - 1,
    };
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    // Bardic Inspiration die scales with Bard level.
    const bardLvl = getClassLevel(char, 'bard');
    const inspDie = bardLvl >= 15 ? 'd12' : bardLvl >= 10 ? 'd10' : bardLvl >= 5 ? 'd8' : 'd6';
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) =>
        c.id === ally.id ? { ...c, bardic_inspiration_die: inspDie } : c
      ),
    };
    ctx.narrative = `${char.name} grants Bardic Inspiration (${inspDie}) to ${ally.name}! (${biUses - 1} use${biUses - 1 === 1 ? '' : 's'} remaining)`;
    return true;
  }

  if (fid === 'colossus_slayer') {
    if (char.subclass !== 'hunter') {
      ctx.narrative = 'Only Hunter Rangers have Colossus Slayer.';
      return true;
    }
    if (huntersPrey(char) === 'horde_breaker') {
      ctx.narrative = 'You have chosen Horde Breaker as your Hunter’s Prey, not Colossus Slayer.';
      return true;
    }
    const csTarget = ctx.st.entities?.find((e) => e.id === ctx.enemy?.id && e.isEnemy);
    if (!ctx.enemyAlive || !ctx.enemy || !csTarget) {
      ctx.narrative = 'No living target.';
      return true;
    }
    const enemyMaxHp =
      (ctx.enemy as unknown as Record<string, number>)['max_hp'] ?? csTarget.hp * 2;
    if (csTarget.hp >= enemyMaxHp) {
      ctx.narrative = 'Colossus Slayer only triggers on a bloodied (below max HP) target.';
      return true;
    }
    if ((char.class_resource_uses?.colossus_slayer_used ?? 0) >= 1) {
      ctx.narrative = 'Colossus Slayer already triggered this turn.';
      return true;
    }
    const csDmg = rollDice('1d8');
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      colossus_slayer_used: 1,
    };
    const csHp = csTarget.hp - csDmg;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.enemy?.id && e.isEnemy ? { ...e, hp: Math.max(0, csHp) } : e
      ),
    };
    ctx.narrative = `Colossus Slayer! +${fmt.dmg(csDmg)} piercing damage on a bloodied foe (${csHp <= 0 ? 'killed' : `${fmt.hp(Math.max(0, csHp))} HP remaining`}).`;
    if (csHp <= 0) {
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, ctx.enemy.id];
      // Only end combat once every enemy in the room is down — matches
      // the canonical attack handler's pattern. Was previously
      // unconditional, which ended combat early in multi-enemy rooms.
      if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
        ctx.st = endCombatState(ctx.st);
      }
    }
    return true;
  }

  if (fid === 'sacred_weapon') {
    if (char.subclass !== 'devotion') {
      ctx.narrative = 'Only Devotion Paladins have Sacred Weapon.';
      return true;
    }
    const cdUsesDev = char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesDev <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      channel_divinity: cdUsesDev - 1,
      sacred_weapon_active: 1,
    };
    const chaMod = abilityMod(char.cha);
    ctx.narrative = `${char.name} — Sacred Weapon! +${chaMod} to attack rolls for 1 minute (10 rounds). Your weapon gleams with divine light. (${cdUsesDev - 1} Channel Divinity remaining)`;
    return true;
  }

  if (fid === 'holy_nimbus') {
    if (char.subclass !== 'devotion' || getClassLevel(char, 'paladin') < 20) {
      ctx.narrative = 'Holy Nimbus requires a Devotion Paladin of level 20.';
      return true;
    }
    if ((char.class_resource_uses?.holy_nimbus_used ?? 0) > 0) {
      ctx.narrative = 'Holy Nimbus is spent — it returns after a long rest.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), holy_nimbus_used: 1 };
    // Encounter-long marker condition (like raging) — cleared by endCombatState.
    char.conditions = [...char.conditions.filter((c) => c !== 'holy_nimbus'), 'holy_nimbus'];
    const nimbusDmg = abilityMod(char.cha) + profBonus(char.level);
    ctx.narrative = `${char.name} blazes with a Holy Nimbus! Enemies that start their turn in the aura take ${nimbusDmg} radiant damage, and ${char.name} has advantage on saves forced by Fiends and Undead.`;
    return true;
  }

  if (fid === 'cutting_words') {
    if (char.subclass !== 'lore') {
      ctx.narrative = 'Only Lore Bards have Cutting Words.';
      return true;
    }
    if (char.turn_actions.reaction_used) {
      ctx.narrative = 'Reaction already used this turn.';
      return true;
    }
    if ((char.conditions ?? []).includes('slowed')) {
      ctx.narrative = "You are Slowed — you can't take reactions this turn.";
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    const biLeft = char.class_resource_uses?.bardic_inspiration ?? abilityMod(char.cha);
    if (biLeft <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      bardic_inspiration: biLeft - 1,
    };
    char.turn_actions = { ...char.turn_actions, reaction_used: true };
    // Cutting Words die scales with Bard level (Bardic Inspiration die).
    const cwBardLvl = getClassLevel(char, 'bard');
    const cuttingDie = cwBardLvl >= 15 ? 12 : cwBardLvl >= 10 ? 10 : cwBardLvl >= 5 ? 8 : 6;
    const cuttingRoll = rollDice(`1d${cuttingDie}`);
    ctx.narrative = `${char.name} — Cutting Words! Subtract ${cuttingRoll} from ${ctx.enemy!.name}'s next attack roll or ability check this round. (${biLeft - 1} Bardic Inspiration remaining)`;
    ctx.st = { ...ctx.st, cutting_words_penalty: cuttingRoll };
    return true;
  }

  return false;
}
