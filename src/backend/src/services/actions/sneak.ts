import {
  abilityMod,
  d20TestPenalty,
  effectiveLightFor,
  passivePerceptionDcInLight,
  skillCheck,
} from '../rulesEngine.js';
import {
  buildArrivalNarrative,
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
  endCombatState,
  isHeavilyEncumbered,
  pick,
} from '../gameEngine.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from '../strokeOfLuck.js';
import { hasExpertise, hasJackOfAllTrades, hasReliableTalent, peerlessSkillDie } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { updatePcActor } from './actor.js';

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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can sneak.' };
  const { char, safeIdx } = ctx.actor;
  if (!ctx.enemyAlive || !ctx.enemy) {
    return { rejected: 'Nothing to sneak past. You move freely.' };
  }
  const enemy = ctx.enemy;
  // 2024 PHB lighting (PHB p.190). Dim light gives observers
  // Disadvantage on sight Perception (-5 to passive); dark light
  // heavily obscures (effective passive 0 — sneak auto-succeeds).
  // Pansori enemies don't track darkvision today, so the observer's
  // effective light equals the room's lighting. Darkvision on the
  // sneaker side doesn't change the observer's view, so we don't
  // pass it here.
  const roomLighting = ctx.seed.rooms.find((r) => r.id === ctx.roomId)?.lighting ?? 'bright';
  const enemyEffectiveLight = effectiveLightFor(roomLighting, 0);
  const sneakDC = passivePerceptionDcInLight(enemy.wis ?? 10, enemyEffectiveLight);
  const livingParty = ctx.st.characters
    .filter((c) => !c.dead)
    .map((c) => (c.id === char.id ? char : c));
  // The active PC's char may mutate (inspiration consumption) — track it
  // through the map so we can write the post-roll state back.
  let activeChar = char;
  const rolls = livingParty.map((member) => {
    const isActive = member.id === char.id;
    const proficient =
      ctx.context.classSkills[member.character_class]?.includes('stealth') ?? false;
    // 2024 Exhaustion is a flat −2/level penalty (folded into d20TestPenalty),
    // not Disadvantage.
    const checkDisadv = isHeavilyEncumbered(member);
    const inspAdv = isActive ? consumeInspirationForCheck(member) : false;
    const luckAdv = isActive ? consumeLuckForCheck(member) : false;
    const bardicRoll = isActive ? consumeBardicForCheck(member) : 0;
    if (isActive) activeChar = member;
    const peerlessRollSneak = isActive ? peerlessSkillDie(member) : 0;
    const check = skillCheck(
      member.dex,
      sneakDC - bardicRoll,
      proficient,
      member.level,
      checkDisadv,
      hasExpertise(member, 'Stealth'),
      hasJackOfAllTrades(member),
      inspAdv || luckAdv,
      member.species === 'halfling',
      hasReliableTalent(member),
      isActive && strokeOfLuckAvailable(member),
      d20TestPenalty(member),
      peerlessRollSneak
    );
    // Only the active PC auto-spends a once-per-rest resource (same policy as
    // Inspiration/Luck/Bardic above). Stroke of Luck and Peerless Skill are
    // mutually exclusive (skillCheck only fires Peerless when SoL didn't).
    if (isActive && check.strokeOfLuckUsed) activeChar = consumeStrokeOfLuck(member);
    else if (isActive && check.peerlessSkillUsed) {
      const biSneak = member.class_resource_uses?.bardic_inspiration ?? abilityMod(member.cha);
      activeChar = {
        ...member,
        class_resource_uses: {
          ...(member.class_resource_uses ?? {}),
          bardic_inspiration: Math.max(0, biSneak - 1),
        },
      };
    }
    return { name: member.name, check, mod: abilityMod(member.dex) };
  });
  updatePcActor(ctx, activeChar);
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
        updatePcActor(ctx, { conditions: [] });
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
            characters: ctx.st.characters.map((c, i) => (i === safeIdx ? char : c)),
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
