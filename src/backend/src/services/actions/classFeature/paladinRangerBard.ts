import { ABJURED_TAG, ABJURE_FOES_RANGE_FT, abjureFoesTargetCount } from '../../paladinFeatures.js';
import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import { bardicInspirationLeft, bardicInspirationMax, lowestOpenSlot } from '../../bardFeatures.js';
import { channelDivinityUsesMax, getClassLevel, hasClass, huntersPrey } from '../../multiclass.js';
import {
  endCombatState,
  enemyHpAfterDamage,
  getEnemyById,
  isRoomCleared,
} from '../../gameEngine.js';
import { enemySaveD20, legendaryResist } from '../../monsterSaves.js';
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
 *   - `font_of_inspiration` (L5): spend a spell slot to regain a BI use.
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
 *   - `abjure_foes` (L9): CHA-mod foes within 60 ft, WIS save → Frightened
 *     until damaged (1 minute).
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

  // SRD Font of Inspiration (Bard L5) — no action: expend a spell slot (the
  // lowest open one) to regain one expended Bardic Inspiration use.
  if (fid === 'font_of_inspiration') {
    if (getClassLevel(char, 'bard') < 5) {
      ctx.narrative = 'Font of Inspiration requires Bard level 5.';
      return true;
    }
    const left = bardicInspirationLeft(char);
    if (left >= bardicInspirationMax(char)) {
      ctx.narrative = 'Your Bardic Inspiration is already full.';
      return true;
    }
    const slot = lowestOpenSlot(char);
    if (slot === 0) {
      ctx.narrative = 'No spell slot left to spend.';
      return true;
    }
    char.spell_slots_used = {
      ...(char.spell_slots_used ?? {}),
      [slot]: (char.spell_slots_used?.[slot] ?? 0) + 1,
    };
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      bardic_inspiration: left + 1,
    };
    ctx.narrative = `${char.name} spends a level ${slot} spell slot — Font of Inspiration restores a Bardic Inspiration use (${left + 1} left).`;
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
    // Central enemy-damage floor — Undead Fortitude can avert the drop to 0.
    const { hp: csHp, note: fortNote } = enemyHpAfterDamage(ctx.enemy, csTarget.hp, csDmg, {
      damageType: 'piercing',
    });
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.enemy?.id && e.isEnemy ? { ...e, hp: csHp } : e
      ),
    };
    ctx.narrative = `Colossus Slayer! +${fmt.dmg(csDmg)} piercing damage on a bloodied foe (${csHp <= 0 ? 'killed' : `${fmt.hp(csHp)} HP remaining`}).${fortNote}`;
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
    const cdUsesDev = char.class_resource_uses?.channel_divinity ?? channelDivinityUsesMax(char);
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

  // SRD Abjure Foes (Paladin L9) — Magic action, one Channel Divinity use:
  // up to CHA-mod (min 1) visible creatures within 60 ft make a WIS save or are
  // Frightened for 1 minute, ending early if the creature takes damage. The
  // nearest enemies are chosen.
  if (fid === 'abjure_foes') {
    if (getClassLevel(char, 'paladin') < 9) {
      ctx.narrative = 'Abjure Foes requires Paladin level 9.';
      return true;
    }
    const cdLeft = char.class_resource_uses?.channel_divinity ?? channelDivinityUsesMax(char);
    if (cdLeft <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    if (char.turn_actions.action_used) {
      ctx.narrative = 'Action already used this turn.';
      return true;
    }
    const selfEnt = ctx.st.entities?.find((e) => e.id === char.id);
    if (!ctx.st.combat_active || !selfEnt) {
      ctx.narrative = 'Abjure Foes needs foes in sight.';
      return true;
    }
    const targets = (ctx.st.entities ?? [])
      .filter(
        (e) =>
          e.isEnemy &&
          e.hp > 0 &&
          !e.conditions.includes('invisible') &&
          distanceFeet(selfEnt.pos, e.pos) <= ABJURE_FOES_RANGE_FT
      )
      .sort((a, b) => distanceFeet(selfEnt.pos, a.pos) - distanceFeet(selfEnt.pos, b.pos))
      .slice(0, abjureFoesTargetCount(char));
    if (targets.length === 0) {
      ctx.narrative = `No foes within ${ABJURE_FOES_RANGE_FT} ft to abjure.`;
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      channel_divinity: cdLeft - 1,
    };
    char.turn_actions = { ...char.turn_actions, action_used: true };
    const dc = 8 + profBonus(char.level) + abilityMod(char.cha);
    const frightened = new Set<string>();
    const lines: string[] = [];
    for (const e of targets) {
      const data = getEnemyById(ctx.seed, e.id);
      if (!data) continue;
      if ((data.condition_immunities ?? []).includes('frightened')) {
        lines.push(`${data.name} can't be Frightened.`);
        continue;
      }
      const wis = (data as unknown as Record<string, number>).wis ?? 10;
      const save = enemySaveD20(data, true, () => rollDice('1d20')) + abilityMod(wis);
      const lr = legendaryResist(ctx.st, { ...data, id: e.id }, save < dc);
      composeNow(ctx, {
        kind: 'save',
        characterId: e.id,
        characterName: data.name,
        ability: 'wis',
        roll: save,
        dc,
        success: !lr.failed,
        vs: 'Abjure Foes',
        prose: '',
      });
      if (lr.failed) {
        frightened.add(e.id);
        lines.push(`${data.name}: WIS ${save} vs DC ${dc} — Frightened!`);
      } else {
        lines.push(`${data.name}: WIS ${save} vs DC ${dc} — resists.${lr.note}`);
      }
    }
    if (frightened.size > 0) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          frightened.has(e.id)
            ? {
                ...e,
                conditions: [
                  ...e.conditions.filter((c) => c !== 'frightened' && c !== ABJURED_TAG),
                  'frightened',
                  ABJURED_TAG,
                ],
                condition_durations: {
                  ...e.condition_durations,
                  frightened: 10,
                  [ABJURED_TAG]: 10,
                },
              }
            : e
        ),
      };
    }
    ctx.narrative = `✦ ${char.name} presents their holy symbol — Abjure Foes! ${lines.join(' ')} (${cdLeft - 1} Channel Divinity remaining)`;
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
