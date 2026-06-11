import { abilityMod, d20TestPenalty, effectiveLightFor, skillCheck } from '../rulesEngine.js';
import {
  applyConsequence,
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
} from '../gameEngine.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from '../strokeOfLuck.js';
import {
  hasExpertise,
  hasJackOfAllTrades,
  hasReliableTalent,
  peerlessSkillDie,
} from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { pickHookText } from '../mapEngine.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

/**
 * `interact_object`: search a room object (chest, body, altar, etc.).
 * Out of combat, this is a free interaction. In combat: blocked
 * unless the character is a Thief (Rogue L3+ subclass), in which
 * case Fast Hands (SRD) lets them use a bonus action.
 *
 * Flavor objects (nothing to find — no lootIds AND no onFound) are
 * one-shot, text only. Searchable objects roll a search check —
 * INT (Investigation, default) or WIS (Perception) per `searchSkill`;
 * on success, add lootIds to inventory (recorded in loot_taken so
 * quest checks fire) and fire onFound consequences once. On failure:
 * the object stays in the choice list for a retry (the seenKey written
 * by takeAction dims the button visually).
 *
 * ctx.narrative is APPENDED to, never overwritten — takeAction seeds it
 * with the hidden-trap trigger text (an undetected room trap fires on the
 * first non-move action) and an overwrite would swallow that announcement
 * while its damage/condition still landed.
 */
export const handleInteractObject: ActionHandler<{
  type: 'interact_object';
  objectId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can search objects.' };
  const { char } = ctx.actor;
  const currentSeedRoom = ctx.seed.rooms.find((r) => r.id === ctx.roomId);
  const obj = currentSeedRoom?.objects?.find((o) => o.id === action.objectId);
  if (!obj) {
    ctx.narrative = (ctx.narrative ?? '') + 'There is nothing like that here.';
    return;
  }

  // Narrative hooks are variant pools — pick one (post-pick token substitution
  // stays as-is). interactText is always present (defaulted at overlay time).
  const interactText = pickHookText(obj.interactText) ?? '';
  const searchKey = `${ctx.roomId}:${obj.id}`;
  if ((ctx.st.objects_searched ?? []).includes(searchKey)) {
    ctx.narrative = (ctx.narrative ?? '') + `You have already searched the ${obj.name}.`;
    return;
  }

  let nextChar = char;
  let nextSt = ctx.st;

  if (nextSt.combat_active) {
    ctx.narrative = (ctx.narrative ?? '') + 'You cannot interact with objects during combat.';
    return;
  }

  // A flavor object (not searchable, or with nothing to find — no loot AND no
  // onFound consequences) is text-only and one-shot.
  if (!obj.searchable || (!obj.lootIds?.length && !obj.onFound?.length)) {
    nextSt = { ...nextSt, objects_searched: [...(nextSt.objects_searched ?? []), searchKey] };
    updatePcActor(ctx, nextChar);
    ctx.st = nextSt;
    ctx.narrative = (ctx.narrative ?? '') + interactText;
    return;
  }

  // Which ability the search rolls — INT (Investigation, the default: deduce)
  // or WIS (Perception: spot). A forensic scene mixes the two ("read the scorch
  // pattern" vs "spot the tracks").
  const usePerception = obj.searchSkill === 'perception';
  const skillName = usePerception ? 'Perception' : 'Investigation';
  const abilityScore = usePerception ? nextChar.wis : nextChar.int;
  const proficient =
    nextChar.skill_proficiencies?.some((s) => s.toLowerCase() === skillName.toLowerCase()) ?? false;
  // 2024 Exhaustion is a flat −2/level penalty (folded into d20TestPenalty
  // below), not Disadvantage.
  const inspAdv = consumeInspirationForCheck(nextChar);
  const luckAdv = consumeLuckForCheck(nextChar);
  const bardicRoll = consumeBardicForCheck(nextChar);
  // SRD Vision & Light — searching by sight in a Lightly/Heavily Obscured room
  // is at Disadvantage. Darkvision shifts the searcher one step brighter
  // (`effectiveLightFor`), so a darkvision searcher is unhindered in the dark;
  // 'sunlight' is just Bright Light here.
  const roomLighting = currentSeedRoom?.lighting ?? 'bright';
  const effectiveLight = effectiveLightFor(
    roomLighting === 'sunlight' ? 'bright' : roomLighting,
    nextChar.darkvision_ft ?? 0
  );
  const lowLightDisadv = effectiveLight !== 'bright';
  const check = skillCheck(
    abilityScore,
    (obj.searchDC ?? 12) - bardicRoll,
    proficient,
    nextChar.level,
    lowLightDisadv,
    hasExpertise(nextChar, skillName),
    hasJackOfAllTrades(nextChar),
    inspAdv || luckAdv,
    nextChar.species === 'halfling',
    hasReliableTalent(nextChar),
    strokeOfLuckAvailable(nextChar),
    d20TestPenalty(nextChar),
    peerlessSkillDie(nextChar)
  );
  if (check.strokeOfLuckUsed) nextChar = consumeStrokeOfLuck(nextChar);
  if (check.peerlessSkillUsed) {
    const biUses = nextChar.class_resource_uses?.bardic_inspiration ?? abilityMod(nextChar.cha);
    nextChar = {
      ...nextChar,
      class_resource_uses: {
        ...(nextChar.class_resource_uses ?? {}),
        bardic_inspiration: Math.max(0, biUses - 1),
      },
    };
  }

  let narrative: string;
  if (check.success) {
    const gained: string[] = [];
    const gainedIds: string[] = [];
    for (const lootId of obj.lootIds ?? []) {
      const item = ctx.context.lootTable.find((l) => l.id === lootId);
      if (item) {
        nextChar = {
          ...nextChar,
          inventory: [...(nextChar.inventory ?? []), { ...item, instance_id: randomUUID() }],
        };
        gained.push(item.name);
        gainedIds.push(item.id);
      }
    }
    if (gainedIds.length) {
      nextSt = { ...nextSt, loot_taken: [...(nextSt.loot_taken ?? []), ...gainedIds] };
    }
    nextSt = { ...nextSt, objects_searched: [...(nextSt.objects_searched ?? []), searchKey] };
    const foundDesc =
      pickHookText(obj.foundText) ?? (gained.length ? `You find: ${gained.join(', ')}.` : '');
    narrative = `${interactText} (${skillName}: ${check.roll}+${abilityMod(abilityScore)}=${check.total} vs DC ${obj.searchDC ?? 12} — success!) ${foundDesc}`;
    // Fire the object's onFound consequences ONCE (after loot). Sync the looted
    // searcher into state first so a consequence (give_xp level-up, etc.) sees
    // the fresh character, then read it back so the post-handler commit keeps it.
    if (obj.onFound?.length && ctx.actor.kind === 'pc') {
      const idx = ctx.actor.safeIdx;
      nextSt = {
        ...nextSt,
        characters: nextSt.characters.map((c, i) => (i === idx ? nextChar : c)),
      };
      const parts: string[] = [];
      for (const con of obj.onFound) {
        nextSt = applyConsequence(con, nextSt, ctx.seed, nextChar.id, parts, ctx.context);
      }
      nextChar = nextSt.characters[idx] ?? nextChar;
      if (parts.length) narrative += ' ' + parts.join(' ');
    }
  } else {
    narrative = `${interactText} (${skillName}: ${check.roll}+${abilityMod(abilityScore)}=${check.total} vs DC ${obj.searchDC ?? 12} — fail.) ${pickHookText(obj.emptyText) ?? 'You can try again.'}`;
  }
  updatePcActor(ctx, nextChar);
  ctx.st = nextSt;
  ctx.narrative = (ctx.narrative ?? '') + narrative;
};
