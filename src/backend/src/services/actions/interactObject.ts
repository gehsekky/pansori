import { abilityMod, skillCheck } from '../rulesEngine.js';
import {
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
} from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

/**
 * `interact_object`: search a room object (chest, body, altar, etc.).
 * Out of combat, this is a free interaction. In combat: blocked
 * unless the character is a Thief (Rogue L3+ subclass), in which
 * case Fast Hands (PHB p.97) lets them use a bonus action.
 *
 * Flavor objects (no DC, no lootIds) are one-shot — text only.
 * Searchable objects roll INT (Investigation) DC; on success, add
 * lootIds to inventory and record in loot_taken so quest checks
 * fire whether the item was floor-loot or container-loot. On
 * failure: object stays in the choice list so the player can retry
 * (the seenKey written by takeAction dims the button visually).
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
    ctx.narrative = 'There is nothing like that here.';
    return;
  }

  const searchKey = `${ctx.roomId}:${obj.id}`;
  if ((ctx.st.objects_searched ?? []).includes(searchKey)) {
    ctx.narrative = `You have already searched the ${obj.name}.`;
    return;
  }

  let nextChar = char;
  let nextSt = ctx.st;

  if (nextSt.combat_active) {
    ctx.narrative = 'You cannot interact with objects during combat.';
    return;
  }

  if (!obj.searchable || !obj.lootIds?.length) {
    nextSt = { ...nextSt, objects_searched: [...(nextSt.objects_searched ?? []), searchKey] };
    updatePcActor(ctx, nextChar);
    ctx.st = nextSt;
    ctx.narrative = obj.interactText;
    return;
  }

  const proficient =
    nextChar.skill_proficiencies?.some(
      (s) => s.toLowerCase() === 'investigation' || s.toLowerCase() === 'perception'
    ) ?? false;
  // INT (Investigation) — heavy encumbrance affects only STR/DEX/CON in 2024
  // RAW, so we only honour exhaustion here.
  const exhaustionDisadv1 = (nextChar.exhaustion_level ?? 0) >= 1;
  const inspAdv = consumeInspirationForCheck(nextChar);
  const luckAdv = consumeLuckForCheck(nextChar);
  const bardicRoll = consumeBardicForCheck(nextChar);
  const check = skillCheck(
    nextChar.int,
    (obj.searchDC ?? 12) - bardicRoll,
    proficient,
    nextChar.level,
    exhaustionDisadv1,
    false,
    false,
    inspAdv || luckAdv,
    nextChar.species === 'halfling'
  );

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
  ctx.narrative = narrative;
};
