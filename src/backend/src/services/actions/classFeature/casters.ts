import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { distanceFeet } from '../../gridEngine.js';
import { getEnemyById } from '../../gameEngine.js';

/**
 * Caster features for Sorcerer, Warlock, and Wizard. Bundled because
 * each class only contributes 1-3 small features; not worth its own
 * file at this scale.
 *
 * Sorcerer Metamagic (Twinned, Quickened, Empowered): stage on the
 * sorcerer via `metamagic_active`; the cast_spell handler reads the
 * flag and adjusts target counts / damage rerolls / bonus-action
 * timing.
 *
 * Warlock Invocations (Agonizing Blast, Devil's Sight): passive
 * toggles into `char.feats`. The attack/spell handlers read those
 * tags. Agonizing adds +CHA per Eldritch Blast beam; Devil's Sight
 * lets the Warlock see in magical darkness (rendering hook).
 *
 * Archfey Patron — Fey Presence: AoE WIS save in 10 ft → frightened.
 * 1/short rest. The 2024 PHB shape (no charm option) since fright is
 * already encoded in the engine; charm would need a new movement
 * gate path.
 *
 * Wizard Arcane Ward (Abjurer subclass): create a 2 × level HP ward
 * that absorbs damage before HP. Damage-absorbtion hook is in the
 * enemy-attack resolver elsewhere.
 */
export function handleCasterFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'metamagic_twinned') {
    if (!hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    // Sorcery points scale with Sorcerer level.
    const spPool =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spPool < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'twinned' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Twinned Spell! Your next spell will target a second creature. (${spPool - 1} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_quickened') {
    if (!hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    // SRD 5.2.1 p.67: can't activate Quickened if you've already cast
    // a level 1+ spell this turn.
    if (ctx.char.turn_actions.leveled_spell_cast) {
      ctx.narrative =
        'You have already cast a level 1+ spell this turn — Quickened Spell cannot be used.';
      return true;
    }
    const spPool2 =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spPool2 < 2) {
      ctx.narrative = 'Not enough sorcery points (need 2).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool2 - 2,
    };
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      action_used: false,
      quickened_used: true,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'quickened' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Quickened Spell! Cast your next spell as a bonus action. (${spPool2 - 2} sorcery points remaining)`;
    return true;
  }

  if (fid === 'metamagic_empowered') {
    if (!hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Sorcerers have Metamagic.';
      return true;
    }
    const spPool3 =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spPool3 < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spPool3 - 1,
    };
    ctx.st = { ...ctx.st, metamagic_active: 'empowered' };
    ctx.narrative = `${ctx.char.name} — Metamagic: Empowered Spell! You may reroll up to ${abilityMod(ctx.char.cha)} damage dice on your next spell. (${spPool3 - 1} sorcery points remaining)`;
    return true;
  }

  if (fid === 'agonizing_blast') {
    if (!hasClass(ctx.char, 'warlock')) {
      ctx.narrative = 'Only Warlocks can take Agonizing Blast.';
      return true;
    }
    const hasIt = ctx.char.feats?.includes('agonizing_blast') ?? false;
    if (hasIt) {
      ctx.narrative = 'You already have the Agonizing Blast invocation.';
      return true;
    }
    ctx.char.feats = [...(ctx.char.feats ?? []), 'agonizing_blast'];
    ctx.narrative = `${ctx.char.name} gains the Agonizing Blast invocation — Eldritch Blast now adds +${abilityMod(ctx.char.cha)} force damage per beam.`;
    return true;
  }

  if (fid === 'devils_sight') {
    if (!hasClass(ctx.char, 'warlock')) {
      ctx.narrative = "Only Warlocks can take Devil's Sight.";
      return true;
    }
    const hasIt2 = ctx.char.feats?.includes('devils_sight') ?? false;
    if (hasIt2) {
      ctx.narrative = "You already have the Devil's Sight invocation.";
      return true;
    }
    ctx.char.feats = [...(ctx.char.feats ?? []), 'devils_sight'];
    ctx.narrative = `${ctx.char.name} gains Devil's Sight — you can see normally in magical darkness.`;
    return true;
  }

  if (fid === 'arcane_ward') {
    if (ctx.char.subclass !== 'abjurer') {
      ctx.narrative = 'Only Abjurer Wizards have Arcane Ward.';
      return true;
    }
    // Arcane Ward HP = 2 × Wizard level (Abjurer subclass).
    const wardHp = 2 * getClassLevel(ctx.char, 'wizard');
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), arcane_ward: wardHp };
    ctx.narrative = `${ctx.char.name} creates an Arcane Ward with ${wardHp} HP. It absorbs damage before your HP is reduced.`;
    return true;
  }

  if (fid === 'fey_presence') {
    if (ctx.char.subclass !== 'archfey' || !hasClass(ctx.char, 'warlock')) {
      ctx.narrative = 'Only Archfey Warlocks have Fey Presence.';
      return true;
    }
    if (ctx.char.class_resource_uses?.fey_presence_used) {
      ctx.narrative = 'Fey Presence already used — recovers on a short rest.';
      return true;
    }
    const selfEnt = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    if (!selfEnt) {
      ctx.narrative = 'Fey Presence requires a grid position.';
      return true;
    }
    const dc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
    const inRangeEnemies = (ctx.st.entities ?? []).filter(
      (e) => e.isEnemy && e.hp > 0 && distanceFeet(e.pos, selfEnt.pos) <= 10
    );
    if (inRangeEnemies.length === 0) {
      ctx.narrative = 'No enemies within 10 ft to ensnare with Fey Presence.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      fey_presence_used: 1,
    };
    const lines: string[] = [];
    const frightenedIds = new Set<string>();
    for (const e of inRangeEnemies) {
      const enemyData = getEnemyById(ctx.seed, e.id);
      const targetName = enemyData?.name ?? e.id;
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      const feySuccess = save >= dc;
      // Per-target save event for the combat log (prose=''; the
      // consolidated narrative below combines all targets).
      composeNow(ctx, {
        kind: 'save',
        characterId: e.id,
        characterName: targetName,
        ability: 'wis',
        roll: save,
        dc,
        success: feySuccess,
        vs: 'Fey Presence',
        prose: '',
      });
      if (!feySuccess) {
        frightenedIds.add(e.id);
        lines.push(`${targetName}: WIS ${save} vs DC ${dc} — frightened!`);
        composeNow(ctx, {
          kind: 'condition_applied',
          targetId: e.id,
          targetName,
          condition: 'frightened',
          source: 'Fey Presence',
          prose: '',
        });
      } else {
        lines.push(`${targetName}: WIS ${save} vs DC ${dc} — resists.`);
      }
    }
    if (frightenedIds.size > 0) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          frightenedIds.has(e.id)
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
    }
    ctx.narrative = `🌿 Fey Presence! ${ctx.char.name} radiates fey magic. ${lines.join(' ')}`;
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'bastion_of_law') {
    // 2024 PHB Clockwork Soul Sorcerer L3. Bonus action: spend 1
    // sorcery point, target a creature within 30 ft (caster or one
    // ally for pansori MVP — RAW allows any creature you can see).
    // The target gains 5 temp HP. RAW lets the caster spend 1-5 SP
    // for 5N temp HP; pansori MVP fixes at 1 SP / 5 temp HP. Multi-
    // point spend is a follow-up once the choice list supports
    // variable-cost options without ballooning button count.
    if (ctx.char.subclass !== 'clockwork_soul' || !hasClass(ctx.char, 'sorcerer')) {
      ctx.narrative = 'Only Clockwork Soul Sorcerers have Bastion of Law.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const spBol =
      ctx.char.class_resource_uses?.sorcery_points ?? getClassLevel(ctx.char, 'sorcerer');
    if (spBol < 1) {
      ctx.narrative = 'Not enough sorcery points (need 1).';
      return true;
    }
    const grant = 5;
    // Target selection: most-injured living ally (mirrors heal
    // targeting), falling back to the caster if no eligible ally.
    const injured = ctx.st.characters.filter(
      (c) => !c.dead && c.hp < c.max_hp && c.id !== ctx.char.id
    );
    const target = injured.length > 0 ? injured.reduce((a, b) => (a.hp < b.hp ? a : b)) : ctx.char;
    const isSelf = target.id === ctx.char.id;
    if (isSelf) {
      const prev = ctx.char.temp_hp ?? 0;
      if (grant > prev) ctx.char.temp_hp = grant;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === target.id ? { ...c, temp_hp: Math.max(c.temp_hp ?? 0, grant) } : c
        ),
      };
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      sorcery_points: spBol - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `⚙ Bastion of Law — ${ctx.char.name} channels ordered protection. ${target.name} gains ${grant} temp HP. (${spBol - 1} sorcery points remaining)`;
    return true;
  }

  return false;
}
