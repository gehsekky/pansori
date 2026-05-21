import { abilityMod, profBonus, rollDice } from '../rulesEngine.js';
import { applyConsequence, getNpcAttitude, npcIsKilled } from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import { randomUUID } from 'crypto';

/**
 * `talk`: open dialogue with the NPC in the current room. Indifferent
 * NPCs require a Persuasion (CHA) check to engage; on success they
 * flip to friendly. Hostile NPCs attack instead. Greeting + response
 * options are appended inline as stage-direction hints (matches the
 * UI button format).
 */
export const handleTalk: ActionHandler<{ type: 'talk' }> = (ctx) => {
  const npc = ctx.seed.npcs?.[ctx.roomId];
  if (!npc) {
    ctx.narrative = 'There is no one to talk to here.';
    return;
  }
  if (npcIsKilled(ctx.st, ctx.roomId)) {
    ctx.narrative = 'They are dead.';
    return;
  }
  const attitude = getNpcAttitude(ctx.st, npc);
  if (attitude === 'hostile') {
    ctx.narrative = `${npc.name} snarls at you and attacks!`;
    return;
  }

  let narrative: string;
  if (attitude === 'indifferent') {
    const dc = npc.persuasionDC ?? 12;
    const chaMod = abilityMod(ctx.char.cha);
    const roll = rollDice('1d20') + chaMod + profBonus(ctx.char.level);
    const success = roll >= dc;
    if (success) {
      ctx.st = {
        ...ctx.st,
        npc_attitudes: { ...ctx.st.npc_attitudes, [ctx.roomId]: 'friendly' },
      };
      narrative = `You approach ${npc.name} with care (CHA check ${roll} vs DC ${dc} — success). ${npc.greeting}`;
    } else {
      ctx.narrative = `${npc.name} eyes you warily (CHA check ${roll} vs DC ${dc} — fail). They're not ready to talk yet.`;
      return;
    }
  } else {
    narrative = npc.greeting;
  }

  if (!ctx.st.npc_talked.includes(ctx.roomId)) {
    ctx.st = { ...ctx.st, npc_talked: [...ctx.st.npc_talked, ctx.roomId] };
  }
  if (npc.responses.length > 0) {
    narrative += ' [' + npc.responses.map((r) => `<To ${npc.name}> ${r.label}`).join(' | ') + ']';
  }
  if (ctx.st.combat_active) {
    ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
  }
  ctx.narrative = narrative;
};

/**
 * `talk_response`: pick one of the NPC's response options. Plays the
 * reply prose and fires any attached consequences (quest unlocks,
 * faction rep, item grants, etc.) via the shared `applyConsequence`.
 */
export const handleTalkResponse: ActionHandler<{
  type: 'talk_response';
  responseIdx: number;
}> = (ctx, action) => {
  const npc = ctx.seed.npcs?.[ctx.roomId];
  if (!npc) {
    ctx.narrative = 'There is no one here.';
    return;
  }
  const response = npc.responses[action.responseIdx];
  if (!response) {
    ctx.narrative = 'Invalid response.';
    return;
  }
  let narrative = response.reply ? `${npc.name}: "${response.reply}"` : `${npc.name} nods.`;
  if (response.consequences?.length) {
    const narrativeParts: string[] = [];
    for (const c of response.consequences) {
      ctx.st = applyConsequence(c, ctx.st, ctx.seed, ctx.char.id, narrativeParts, ctx.context);
    }
    if (narrativeParts.length) narrative += ' ' + narrativeParts.join(' ');
  }
  ctx.narrative = narrative;
};

/**
 * `buy`: hand over gold for an item from the NPC's inventory. Only
 * friendly NPCs trade. Price comes from the chosen choice (the BE
 * stamps it with faction-aware pricing via factionShopPrice). The
 * looted item gets a fresh instance_id so multiple copies don't
 * collide on equip/transfer.
 */
export const handleBuy: ActionHandler<{
  type: 'buy';
  itemId: string;
  price: number;
}> = (ctx, action) => {
  const npc = ctx.seed.npcs?.[ctx.roomId];
  if (!npc) {
    ctx.narrative = 'There is no one to buy from.';
    return;
  }
  if (getNpcAttitude(ctx.st, npc) !== 'friendly') {
    ctx.narrative = `${npc.name} won't trade with you right now.`;
    return;
  }
  if (ctx.char.gold < action.price) {
    ctx.narrative = `You can't afford that — you only have ${ctx.char.gold}cr.`;
    return;
  }
  const lootEntry = ctx.context.lootTable.find((l) => l.id === action.itemId);
  if (!lootEntry) {
    ctx.narrative = 'That item is not available.';
    return;
  }
  ctx.char = {
    ...ctx.char,
    gold: ctx.char.gold - action.price,
    inventory: [...ctx.char.inventory, { ...lootEntry, instance_id: randomUUID() }],
  };
  ctx.narrative = `You hand over ${action.price}cr and receive ${lootEntry.name}. ${npc.name} pockets the credits with a nod.`;
};
