import type { ActionHandler } from './types.js';
import { fmt } from '../narrativeFmt.js';
import { pick } from '../gameEngine.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

/**
 * `loot`: pick up a placed item from the current room. `lootKey` selects which
 * item (a room may hold several); omitted → the first available. Idempotent —
 * once taken, the item's `key` is in `state.loot_taken`, so it drops out of
 * `ctx.placedLoot` and a repeat call falls to "already looted". Blocked while a
 * hostile is present. Magic items (`type === 'misc'` && `requiresAttunement`)
 * land unidentified unless the picker has Arcana or Investigation.
 */
export const handleLoot: ActionHandler<{ type: 'loot'; lootKey?: string }> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can loot.' };
  const { char } = ctx.actor;
  if (ctx.placedLoot.length === 0) {
    ctx.narrative = pick(ctx.context.narratives.noLoot);
    return;
  }
  if (ctx.enemyAlive) {
    ctx.narrative = 'A hostile is watching — you cannot loot until the room is clear.';
    return;
  }
  const loot = action.lootKey
    ? ctx.placedLoot.find((l) => l.key === action.lootKey)
    : ctx.placedLoot[0];
  if (!loot) {
    ctx.narrative = pick(ctx.context.narratives.alreadyLooted);
    return;
  }
  // Drop the map-placement fields (pos/key) before the item enters inventory.
  const { pos: _pos, key: _key, ...item } = loot;
  updatePcActor(ctx, {
    inventory: [...(char.inventory || []), { ...item, instance_id: randomUUID() }],
  });
  // Track BOTH the placement key (per-item availability gate) and the item id
  // (quest conditions like `loot_taken contains 'guild_ledger'`).
  ctx.st = {
    ...ctx.st,
    loot_taken: [...ctx.st.loot_taken, ...(loot.key ? [loot.key] : []), loot.id],
  };
  let narrative = pick(ctx.context.narratives.lootPickedUp).replace(/{item}/g, loot.name);
  const isMagicMisc = loot.type === 'misc' && !!loot.requiresAttunement;
  const hasIdentify =
    ctx.context.classSkills[char.character_class]?.some((s) =>
      ['arcana', 'investigation'].includes(s)
    ) ?? false;
  if (isMagicMisc && !hasIdentify) {
    narrative += ` ${fmt.note(`[${loot.name}: unidentified]`)}`;
  } else {
    narrative += ` ${fmt.note(`[${loot.name}: ${loot.desc}]`)}`;
    if (hasIdentify && isMagicMisc) {
      narrative += ' Your expertise lets you identify it immediately.';
    }
  }
  ctx.narrative = narrative;
};
