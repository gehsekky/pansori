import type { Enemy, Spell } from '../../../types.js';
import {
  applyPartyLevelUps,
  endCombatState,
  getEnemyById,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { entitiesInBlast } from '../../gridEngine.js';
import { fillEnemyTokens } from '../../narrative/enemyName.js';
import { fmt } from '../../narrativeFmt.js';
import { grantEnemyDrops } from '../enemyDrops.js';
import { rollConditionSave } from '../../rulesEngine.js';

// SRD Divine Word (L7 Evocation, Cleric) — a word of power. Each enemy within
// range (RAW: "each creature of your choice"; pansori targets the hostiles)
// makes a Charisma save; on a failure, a target with 50 HP or fewer suffers an
// effect keyed to its CURRENT Hit Points:
//   ≤20 → dies
//   21–30 → Blinded + Deafened + Stunned (1 hour)
//   31–40 → Blinded + Deafened (10 minutes)
//   41–50 → Deafened (1 minute)
// A target above 50 HP is unaffected. The RAW rider that banishes a failed
// Celestial / Elemental / Fey / Fiend to its home plane is deferred — pansori
// doesn't model creature type or planar origin.

// 6-second rounds: 1 minute = 10, 10 minutes = 100, 1 hour = 600.
const DUR_1_MIN = 10;
const DUR_10_MIN = 100;
const DUR_1_HOUR = 600;

function stampConditions(
  ctx: ActionContext,
  targetId: string,
  enemy: Enemy,
  conds: Array<{ id: 'blinded' | 'deafened' | 'stunned'; dur: number }>
): void {
  const applied = conds.filter((c) => !enemy.condition_immunities?.includes(c.id));
  const immune = conds.filter((c) => enemy.condition_immunities?.includes(c.id));
  if (immune.length > 0) {
    ctx.narrative += ` ${fmt.note(`[${enemy.name} immune to ${immune.map((c) => c.id).join(', ')}]`)}`;
  }
  if (applied.length === 0) return;
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) => {
      if (e.id !== targetId || !e.isEnemy) return e;
      let conditions = e.conditions;
      const condition_durations = { ...e.condition_durations };
      for (const c of applied) {
        conditions = [...conditions.filter((x) => x !== c.id), c.id];
        condition_durations[c.id] = c.dur;
      }
      return { ...e, conditions, condition_durations };
    }),
  };
}

function killEnemy(ctx: ActionContext, enemy: Enemy, targetId: string): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const split = splitEncounterXp(ctx.st, char.id, enemy.xp ?? 10);
  ctx.st = split.st;
  char.xp = (char.xp || 0) + split.share;
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === targetId && e.isEnemy ? { ...e, hp: 0 } : e
    ),
  };
  ctx.st.enemies_killed = [...ctx.st.enemies_killed, targetId];
  ctx.narrative += grantDarkOnesBlessing(char);
  if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
    ctx.st = endCombatState(ctx.st);
  }
  ctx.narrative +=
    ' ' +
    fillEnemyTokens(pick(ctx.context.narratives.killShot), enemy).replace(
      '{xp}',
      String(split.share)
    );
  grantEnemyDrops(ctx, enemy);
  ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
}

export function runDivineWord(ctx: ActionContext, spell: Spell, dc: number): boolean {
  if (ctx.actor.kind !== 'pc' || !ctx.st.entities) return false;
  const { char } = ctx.actor;
  const casterPos = ctx.st.entities.find((e) => e.id === char.id)?.pos;
  if (!casterPos) return false;
  const rangeFt = spell.rangeFt ?? 30;
  const targets = entitiesInBlast(casterPos, rangeFt, ctx.st.entities).filter((t) => t.isEnemy);
  ctx.narrative += ` ${fmt.note(`[Divine Word ${rangeFt}ft]`)}`;

  for (const target of targets) {
    const enemy = getEnemyById(ctx.seed, target.id);
    if (!enemy) continue;
    const hp = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0;
    if (hp <= 0) continue;

    const score = (enemy as unknown as Record<string, number>)['cha'] ?? 10;
    const conds = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy)?.conditions ?? [];
    const failed = rollConditionSave('cha', score, dc, false, char.level, 0, conds);
    ctx.narrative += ` ${enemy.name}: ${failed ? 'fails' : 'succeeds'} CHA save`;
    if (!failed) {
      ctx.narrative += '.';
      continue;
    }
    if (hp > 50) {
      ctx.narrative +=
        ' — endures the Word (only the badly wounded are felled; the outsider plane-banish is deferred).';
      continue;
    }
    if (hp <= 20) {
      ctx.narrative += ' — struck down by the Word!';
      killEnemy(ctx, enemy, target.id);
    } else if (hp <= 30) {
      ctx.narrative += ' — Blinded, Deafened, and Stunned!';
      stampConditions(ctx, target.id, enemy, [
        { id: 'blinded', dur: DUR_1_HOUR },
        { id: 'deafened', dur: DUR_1_HOUR },
        { id: 'stunned', dur: DUR_1_HOUR },
      ]);
    } else if (hp <= 40) {
      ctx.narrative += ' — Blinded and Deafened!';
      stampConditions(ctx, target.id, enemy, [
        { id: 'blinded', dur: DUR_10_MIN },
        { id: 'deafened', dur: DUR_10_MIN },
      ]);
    } else {
      ctx.narrative += ' — Deafened!';
      stampConditions(ctx, target.id, enemy, [{ id: 'deafened', dur: DUR_1_MIN }]);
    }
  }

  ctx.usedInitiative = true;
  return true;
}
