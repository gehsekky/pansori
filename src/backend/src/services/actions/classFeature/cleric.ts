import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import { applyPartyLevelUps, getEnemyById, pushEvent, splitEncounterXp } from '../../gameEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { fmt } from '../../narrativeFmt.js';

/**
 * Cleric features. All 2024 PHB Channel Divinity variants except
 * Turn Undead (which Wizard's Counterspell parallel is the cast
 * handler's job).
 *
 *  - `divine_spark`: universal CD. 1d8 + WIS radiant to the current
 *    enemy (or heal toggle, future). Reads CURRENT entity HP, not
 *    seed template HP — preserves accumulated combat damage.
 *  - `turn_undead`: universal CD, Magic Action. 30-ft WIS-save AoE
 *    on undead enemies (matched by name keyword regex). Failure →
 *    frightened condition.
 *  - `sear_undead`: L5+ CD, replaces 2014 Destroy Undead. 30-ft AoE
 *    Nd8 radiant (N = cleric level), WIS save halves.
 *  - `preserve_life` (Life): CD. Distribute 5×level HP among wounded
 *    allies, capped at half max HP per target.
 */
export function handleClericFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'divine_spark') {
    if (!hasClass(ctx.char, 'cleric')) {
      ctx.narrative = 'Only Clerics have Divine Spark.';
      return true;
    }
    const cdUsesDS = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesDS <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesDS - 1,
    };
    const dsRoll = rollDice('1d8') + abilityMod(ctx.char.wis);
    // Read the CURRENT entity HP, not the seed's template HP — otherwise
    // Divine Spark resets the target to (full_hp - damage) and wipes
    // every prior turn's accumulated damage. (Vale playthrough log,
    // 2026-05-21: Ghoul jumped from 19 → 37 mid-combat after DS.)
    const enemyEntForDs = ctx.st.entities?.find((e) => e.id === ctx.enemy!.id && e.isEnemy);
    const currentDsHp = enemyEntForDs?.hp ?? ctx.enemy!.hp;
    const dsHp = Math.max(0, currentDsHp - dsRoll);
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.enemy!.id && e.isEnemy ? { ...e, hp: dsHp } : e
      ),
    };
    ctx.st = pushEvent(ctx.st, {
      kind: 'attack_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      targetId: ctx.enemy!.id,
      targetName: ctx.enemy!.name,
      damage: dsRoll,
      damageType: 'radiant',
      isCrit: false,
      toHit: 0,
      targetAc: ctx.enemy.ac,
      round: ctx.st.round ?? 1,
    });
    ctx.narrative = `✦ Divine Spark! ${ctx.enemy!.name} takes ${fmt.dmg(dsRoll)} radiant damage. (${cdUsesDS - 1} Channel Divinity remaining)`;
    if (dsHp <= 0) {
      const split = splitEncounterXp(ctx.st, ctx.char.id, ctx.enemy!.xp ?? 0);
      ctx.st = split.st;
      ctx.char.xp = (ctx.char.xp || 0) + split.share;
      ctx.narrative += ` ${ctx.enemy!.name} is destroyed.`;
      ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
    }
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'turn_undead') {
    if (!hasClass(ctx.char, 'cleric')) {
      ctx.narrative = 'Only Clerics have Turn Undead.';
      return true;
    }
    const cdUsesTU = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesTU <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    if (ctx.char.turn_actions.action_used) {
      ctx.narrative = 'Action already used this turn.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesTU - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
    const tuDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    const selfEntTU = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    // Identify undead enemies. Convention: enemy name keyword match — RAW
    // would check creature type but our enemy templates don't carry that.
    const undeadKeywords = /skeleton|ghoul|shadow|zombie|lich|wraith|undead|crypt/i;
    const turnedIds: string[] = [];
    const lines: string[] = [];
    for (const e of ctx.st.entities ?? []) {
      if (!e.isEnemy || e.hp <= 0) continue;
      if (!selfEntTU) continue;
      const dist = Math.max(
        Math.abs(e.pos.x - selfEntTU.pos.x),
        Math.abs(e.pos.y - selfEntTU.pos.y)
      );
      if (dist > 6) continue; // 30 ft = 6 squares
      const enemyData = getEnemyById(ctx.seed, e.id);
      if (!enemyData || !undeadKeywords.test(enemyData.name)) continue;
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      // Per-target save event (composed via fragment so the combat
      // log captures the roll). Prose is empty because the
      // consolidated `lines` array drives the player-facing narrative.
      composeNow(ctx, {
        kind: 'save',
        characterId: e.id,
        characterName: enemyData.name,
        ability: 'wis',
        roll: save,
        dc: tuDC,
        success: save >= tuDC,
        vs: 'Turn Undead',
        prose: '',
      });
      if (save < tuDC) {
        turnedIds.push(e.id);
        lines.push(`${enemyData.name}: WIS ${save} vs DC ${tuDC} — turned!`);
        composeNow(ctx, {
          kind: 'condition_applied',
          targetId: e.id,
          targetName: enemyData.name,
          condition: 'frightened',
          source: 'Turn Undead',
          prose: '',
        });
      } else {
        lines.push(`${enemyData.name}: WIS ${save} vs DC ${tuDC} — resists.`);
      }
    }
    if (turnedIds.length > 0) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          turnedIds.includes(e.id)
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
    }
    ctx.narrative =
      lines.length > 0
        ? `✦ Turn Undead! ${lines.join(' ')} (${cdUsesTU - 1} Channel Divinity remaining)`
        : `Turn Undead — no undead within 30 ft. (${cdUsesTU - 1} Channel Divinity remaining)`;
    return true;
  }

  if (fid === 'sear_undead') {
    if (!hasClass(ctx.char, 'cleric')) {
      ctx.narrative = 'Only Clerics have Sear Undead.';
      return true;
    }
    const clericLvl = getClassLevel(ctx.char, 'cleric');
    if (clericLvl < 5) {
      ctx.narrative = 'Sear Undead requires Cleric level 5.';
      return true;
    }
    const cdUsesSU = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesSU <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesSU - 1,
    };
    const suDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    const selfEntSU = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    const undeadRegex = /skeleton|ghoul|shadow|zombie|lich|wraith|undead|crypt/i;
    const lines: string[] = [];
    const newEntities = (ctx.st.entities ?? []).map((e) => {
      if (!e.isEnemy || e.hp <= 0 || !selfEntSU) return e;
      const dist = Math.max(
        Math.abs(e.pos.x - selfEntSU.pos.x),
        Math.abs(e.pos.y - selfEntSU.pos.y)
      );
      if (dist > 6) return e;
      const enemyData = getEnemyById(ctx.seed, e.id);
      if (!enemyData || !undeadRegex.test(enemyData.name)) return e;
      const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
      const save = rollDice('1d20') + abilityMod(wisScore);
      // Sear Undead damage scales with Cleric level only.
      const fullDmg = rollDice(`${clericLvl}d8`);
      const dmg = save >= suDC ? Math.floor(fullDmg / 2) : fullDmg;
      // Per-target save event for the combat log (prose=''; the
      // consolidated narrative below combines all targets).
      composeNow(ctx, {
        kind: 'save',
        characterId: e.id,
        characterName: enemyData.name,
        ability: 'wis',
        roll: save,
        dc: suDC,
        success: save >= suDC,
        vs: 'Sear Undead',
        prose: '',
      });
      lines.push(
        `${enemyData.name}: WIS ${save} vs DC ${suDC} — ${dmg} radiant${save >= suDC ? ' (half)' : ''}`
      );
      return { ...e, hp: Math.max(0, e.hp - dmg) };
    });
    ctx.st = { ...ctx.st, entities: newEntities };
    ctx.narrative =
      lines.length > 0
        ? `☀️ Sear Undead! ${lines.join(' · ')} (${cdUsesSU - 1} Channel Divinity remaining)`
        : `Sear Undead — no undead within 30 ft. (${cdUsesSU - 1} Channel Divinity remaining)`;
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'preserve_life') {
    if (ctx.char.subclass !== 'life') {
      ctx.narrative = 'Only Life Clerics have Preserve Life.';
      return true;
    }
    const cdUses = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUses <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining (recover on short rest).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUses - 1,
    };
    // Preserve Life pool: 5 × Cleric level.
    const poolHp = 5 * getClassLevel(ctx.char, 'cleric');
    const woundedAllies = ctx.st.characters.filter(
      (c) => !c.dead && c.hp < c.max_hp && c.id !== ctx.char.id
    );
    let preserved = 0;
    let remaining = poolHp;
    const healedIds = new Map<string, number>();
    const updatedChars = ctx.st.characters.map((c) => {
      if (!c.dead && c.hp < c.max_hp && c.id !== ctx.char.id && remaining > 0) {
        const half = Math.floor(c.max_hp / 2);
        if (c.hp >= half) return c;
        const heal = Math.min(remaining, half - c.hp);
        preserved += heal;
        remaining -= heal;
        const newHp = c.hp + heal;
        healedIds.set(c.id, newHp);
        return { ...c, hp: newHp };
      }
      return c;
    });
    ctx.st = {
      ...ctx.st,
      characters: updatedChars,
      // Sync grid entity HP for every PC who got healed so the
      // battlefield reflects immediately. commitChar() only updates
      // the caster's entity, not the targets'.
      entities: (ctx.st.entities ?? []).map((e) =>
        !e.isEnemy && healedIds.has(e.id) ? { ...e, hp: healedIds.get(e.id)! } : e
      ),
    };
    const eligibleCount = woundedAllies.filter((c) => c.hp < Math.floor(c.max_hp / 2)).length;
    if (preserved === 0) {
      const reason =
        woundedAllies.length === 0
          ? 'no wounded allies in range'
          : eligibleCount === 0
            ? 'every wounded ally is already above half HP'
            : 'no eligible target';
      ctx.narrative = `${ctx.char.name} — Preserve Life! No HP distributed (${reason}). (${cdUses - 1} Channel Divinity remaining)`;
    } else {
      ctx.narrative = `${ctx.char.name} — Preserve Life! Distributed ${preserved} HP among ${eligibleCount} eligible ally${eligibleCount === 1 ? '' : 'ies'} (pool: ${poolHp}). (${cdUses - 1} Channel Divinity remaining)`;
    }
    return true;
  }

  return false;
}
