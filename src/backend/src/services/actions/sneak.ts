import { abilityMod, passivePerceptionDC, skillCheck } from '../rulesEngine.js';
import {
  buildArrivalNarrative,
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
  endCombatState,
  isHeavilyEncumbered,
  pick,
} from '../gameEngine.js';
import type { ActionHandler } from './types.js';

/**
 * `sneak`: SRD p.6 group ability check. Every living party member
 * rolls Stealth (DEX) vs the enemy's passive Perception DC; the
 * group passes if at least half succeed. Only the active PC auto-
 * spends Heroic Inspiration / Bardic Inspiration — passive party
 * members keep their resources.
 *
 * On success: drops combat state (if active), clears the active
 * PC's conditions (e.g. surprise), and moves to the first adjacent
 * room. Always consumes the action and ends the combat turn.
 */
export const handleSneak: ActionHandler<{ type: 'sneak' }> = (ctx) => {
  if (!ctx.enemyAlive || !ctx.enemy) {
    return { rejected: 'Nothing to sneak past. You move freely.' };
  }
  const enemy = ctx.enemy;
  const sneakDC = passivePerceptionDC(enemy.wis ?? 10);
  const livingParty = ctx.st.characters
    .filter((c) => !c.dead)
    .map((c) => (c.id === ctx.char.id ? ctx.char : c));
  // The active PC's char may mutate (inspiration consumption) — track it
  // through the map so we can write the post-roll state back.
  let activeChar = ctx.char;
  const rolls = livingParty.map((member) => {
    const isActive = member.id === ctx.char.id;
    const proficient =
      ctx.context.classSkills[member.character_class]?.includes('stealth') ?? false;
    const exhaustionDisadv1 = (member.exhaustion_level ?? 0) >= 1;
    const checkDisadv = exhaustionDisadv1 || isHeavilyEncumbered(member);
    const inspAdv = isActive ? consumeInspirationForCheck(member) : false;
    const luckAdv = isActive ? consumeLuckForCheck(member) : false;
    const bardicRoll = isActive ? consumeBardicForCheck(member) : 0;
    if (isActive) activeChar = member;
    const check = skillCheck(
      member.dex,
      sneakDC - bardicRoll,
      proficient,
      member.level,
      checkDisadv,
      false,
      false,
      inspAdv || luckAdv,
      member.species === 'halfling'
    );
    return { name: member.name, check, mod: abilityMod(member.dex) };
  });
  ctx.char = activeChar;
  const successes = rolls.filter((r) => r.check.success).length;
  const groupPasses = 2 * successes >= livingParty.length;
  const detailLines = rolls
    .map(
      (r) => `${r.name}: ${r.check.roll}+${r.mod}=${r.check.total} ${r.check.success ? '✓' : '✗'}`
    )
    .join('; ');
  const groupNote =
    livingParty.length > 1
      ? ` Group check: ${successes}/${livingParty.length} pass${groupPasses ? '' : ' — group fails'}.`
      : '';
  let narrative: string;
  if (groupPasses) {
    narrative = pick(ctx.context.narratives.sneakSuccess).replace('{enemy}', enemy.name);
    narrative += `${groupNote} (DC ${sneakDC}; ${detailLines})`;
    if (ctx.adjacent.length > 0) {
      const target = ctx.adjacent[0];
      if (ctx.st.combat_active) {
        ctx.st = endCombatState(ctx.st);
        ctx.char = { ...ctx.char, conditions: [] };
      }
      ctx.st = {
        ...ctx.st,
        current_room: target.id,
        visited_rooms: ctx.st.visited_rooms.includes(target.id)
          ? ctx.st.visited_rooms
          : [...ctx.st.visited_rooms, target.id],
      };
      narrative +=
        ' ' +
        buildArrivalNarrative(
          target.id,
          {
            ...ctx.st,
            characters: ctx.st.characters.map((c, i) => (i === ctx.safeIdx ? ctx.char : c)),
          },
          ctx.seed,
          ctx.context
        );
    }
  } else {
    narrative = `The party fails to slip past the ${enemy.name}.${groupNote} (DC ${sneakDC}; ${detailLines})`;
  }
  if (ctx.st.combat_active) ctx.usedInitiative = true;
  ctx.narrative = narrative;
};
