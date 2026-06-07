import { abilityMod, d20TestPenalty, effectiveLightFor, skillCheck } from '../rulesEngine.js';
import {
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
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

/**
 * `interact_object`: search a room object (chest, body, altar, etc.).
 * Out of combat, this is a free interaction. In combat: blocked
 * unless the character is a Thief (Rogue L3+ subclass), in which
 * case Fast Hands (SRD) lets them use a bonus action.
 *
 * Flavor objects (no DC, no lootIds) are one-shot — text only.
 * Searchable objects roll INT (Investigation) DC; on success, add
 * lootIds to inventory and record in loot_taken so quest checks
 * fire whether the item was floor-loot or container-loot. On
 * failure: object stays in the choice list so the player can retry
 * (the seenKey written by takeAction dims the button visually).
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

  if (!obj.searchable || !obj.lootIds?.length) {
    nextSt = { ...nextSt, objects_searched: [...(nextSt.objects_searched ?? []), searchKey] };
    updatePcActor(ctx, nextChar);
    ctx.st = nextSt;
    ctx.narrative = (ctx.narrative ?? '') + obj.interactText;
    return;
  }

  const proficient =
    nextChar.skill_proficiencies?.some(
      (s) => s.toLowerCase() === 'investigation' || s.toLowerCase() === 'perception'
    ) ?? false;
  // INT (Investigation). 2024 Exhaustion is a flat −2/level penalty (folded
  // into d20TestPenalty below), not Disadvantage.
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
    nextChar.int,
    (obj.searchDC ?? 12) - bardicRoll,
    proficient,
    nextChar.level,
    lowLightDisadv,
    hasExpertise(nextChar, 'Investigation'),
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
    for (const lootId of obj.lootIds) {
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
    const foundDesc = obj.foundText ?? `You find: ${gained.join(', ')}.`;
    narrative = `${obj.interactText} (Investigation: ${check.roll}+${abilityMod(nextChar.int)}=${check.total} vs DC ${obj.searchDC ?? 12} — success!) ${foundDesc}`;
  } else {
    narrative = `${obj.interactText} (Investigation: ${check.roll}+${abilityMod(nextChar.int)}=${check.total} vs DC ${obj.searchDC ?? 12} — fail.) ${obj.emptyText ?? 'You can try again.'}`;
  }
  updatePcActor(ctx, nextChar);
  ctx.st = nextSt;
  ctx.narrative = (ctx.narrative ?? '') + narrative;
};
