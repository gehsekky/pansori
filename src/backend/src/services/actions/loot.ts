import type { ActionHandler } from './types.js';
import { pick } from '../gameEngine.js';
import { randomUUID } from 'crypto';

/**
 * `loot`: pick up the room's loot entry. Idempotent — repeated calls
 * fall to the "already looted" message because `state.loot_taken`
 * contains the roomId after the first pickup. Blocked while a hostile
 * is present. Magic items (`type === 'misc'` && `requiresAttunement`)
 * land unidentified unless the picker has Arcana or Investigation.
 */
export const handleLoot: ActionHandler<{ type: 'loot' }> = (ctx) => {
  if (!ctx.loot) {
    ctx.narrative = pick(ctx.context.narratives.noLoot);
    return;
  }
  if (!ctx.lootAvail) {
    ctx.narrative = pick(ctx.context.narratives.alreadyLooted);
    return;
  }
  if (ctx.enemyAlive) {
    ctx.narrative = 'A hostile is watching — you cannot loot until the room is clear.';
    return;
  }
  const loot = ctx.loot;
  ctx.char = {
    ...ctx.char,
    inventory: [...(ctx.char.inventory || []), { ...loot, instance_id: randomUUID() }],
  };
  // Track BOTH the roomId (lootAvail gate) and the item id (quest
  // conditions like `loot_taken contains 'guild_ledger'`).
  ctx.st = {
    ...ctx.st,
    loot_taken: [...ctx.st.loot_taken, ctx.roomId, loot.id],
  };
  let narrative = pick(ctx.context.narratives.lootPickedUp).replace(/{item}/g, loot.name);
  const isMagicMisc = loot.type === 'misc' && !!loot.requiresAttunement;
  const hasIdentify =
    ctx.context.classSkills[ctx.char.character_class]?.some((s) =>
      ['arcana', 'investigation'].includes(s)
    ) ?? false;
  if (isMagicMisc && !hasIdentify) {
    narrative += ` [${loot.name}: unidentified]`;
  } else {
    narrative += ` [${loot.name}: ${loot.desc}]`;
    if (hasIdentify && isMagicMisc) {
      narrative += ' Your expertise lets you identify it immediately.';
    }
  }
  ctx.narrative = narrative;
};
