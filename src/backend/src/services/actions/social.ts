import { abilityMod, d20TestPenalty, profBonus, rollDice, skillCheck } from '../rulesEngine.js';
import { adjacentPositions, chebyshev } from '../gridEngine.js';
import {
  applyConsequence,
  consumeLuckForCheck,
  getNpcAttitude,
  maybeRestockShops,
  npcById,
  npcIsKilled,
  npcsInRoom,
  shopGoldLeft,
  shopSellPrice,
  shopStockLeft,
} from '../gameEngine.js';
import { applyGuidanceDie, consumeGuidanceDie, updatePcActor } from './actor.js';
import { hasExpertise, hasJackOfAllTrades, hasReliableTalent } from '../multiclass.js';
import { onceKey, visibleResponses } from '../dialogueGating.js';
import type { ActionHandler } from './types.js';
import type { ActiveGrid } from '../mapEngine.js';
import type { GridPos } from '../../types.js';
import { activeGrid } from '../mapEngine.js';
import { randomUUID } from 'crypto';
import { responsesAtPath } from '../conversation.js';

/**
 * The cell the party marker walks to when approaching an NPC: a free square
 * ADJACENT to the NPC (closest to where the party already stands, for the
 * shortest visual walk). Stays put if already adjacent; falls back to the NPC's
 * own cell only when every neighbor is blocked.
 */
export function approachCell(
  grid: ActiveGrid,
  from: GridPos | undefined,
  target: GridPos
): GridPos {
  if (from && chebyshev(from, target) <= 1) return from;
  const blocked = new Set(grid.obstacles.map((o) => `${o.x},${o.y}`));
  const candidates = adjacentPositions(target).filter(
    (p) =>
      p.x >= 0 && p.x < grid.width && p.y >= 0 && p.y < grid.height && !blocked.has(`${p.x},${p.y}`)
  );
  if (candidates.length === 0) return target;
  if (from) candidates.sort((a, b) => chebyshev(a, from) - chebyshev(b, from));
  return candidates[0];
}

/**
 * `talk`: open dialogue with the NPC in the current room. Indifferent
 * NPCs require a Persuasion (CHA) check to engage; on success they
 * flip to friendly. Hostile NPCs attack instead. Greeting + response
 * options are appended inline as stage-direction hints (matches the
 * UI button format).
 */
export const handleTalk: ActionHandler<{ type: 'talk'; npcId: string }> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can talk.' };
  const { char } = ctx.actor;
  const npc = npcById(ctx.seed, action.npcId);
  if (!npc) {
    ctx.narrative = 'There is no one to talk to here.';
    return;
  }
  if (npcIsKilled(ctx.st, npc.id)) {
    ctx.narrative = 'They are dead.';
    return;
  }
  const attitude = getNpcAttitude(ctx.st, npc);
  // Parley: a hostile with an AUTHORED dialogue tree can be talked to before
  // swords are drawn (out of combat only) — the conversation opens straight
  // on the greeting, no CHA gate (per-node check/condition nodes are the
  // gate). A hostile with no dialogue stays exactly that.
  const canParley =
    attitude === 'hostile' && !ctx.st.combat_active && (npc.responses?.length ?? 0) > 0;
  if (attitude === 'hostile' && !canParley) {
    ctx.narrative = `${npc.name} snarls at you and attacks!`;
    return;
  }

  // The greeting is the NPC speaking — prefix the speaker so the narrative
  // pane reads as dialogue (matching the talk_response exchange format).
  // FIRST-time talks (npc_talked) play firstGreeting when authored; every
  // later talk plays the plain greeting — the NPC-hook twin of the level
  // hooks' FIRST-overrides-plain rule.
  const greetingText = ctx.st.npc_talked.includes(npc.id)
    ? npc.greeting
    : (npc.firstGreeting ?? npc.greeting);
  const spokenGreeting = `${npc.name}: "${greetingText}"`;
  let narrative: string;
  if (attitude === 'indifferent') {
    const dc = npc.persuasionDC ?? 12;
    const chaMod = abilityMod(char.cha);
    const roll = rollDice('1d20') + chaMod + profBonus(char.level);
    const success = roll >= dc;
    if (success) {
      ctx.st = {
        ...ctx.st,
        npc_attitudes: { ...ctx.st.npc_attitudes, [npc.id]: 'friendly' },
      };
      narrative = `You approach ${npc.name} with care (CHA check ${roll} vs DC ${dc} — success). ${spokenGreeting}`;
    } else {
      ctx.narrative = `${npc.name} eyes you warily (CHA check ${roll} vs DC ${dc} — fail). They're not ready to talk yet.`;
      return;
    }
  } else {
    narrative = spokenGreeting;
  }

  if (!ctx.st.npc_talked.includes(npc.id)) {
    ctx.st = { ...ctx.st, npc_talked: [...ctx.st.npc_talked, npc.id] };
  }
  // Open conversation mode (out of combat only). generateChoices then surfaces
  // ONLY the dialogue options (responses at the current node + End conversation,
  // + Back when nested) until the player ends it. The dedicated FE panel renders
  // `active_conversation.prompt` (the NPC's current line) + those choices.
  if (!ctx.st.combat_active) {
    // Walk the party up to the NPC: move the marker to a free cell adjacent to
    // the NPC's token before opening the conversation. No-op if the NPC has no
    // position or the party is already adjacent.
    if (npc.pos && ctx.st.marker_pos) {
      const grid = activeGrid(ctx.context.campaign, ctx.seed.rooms, ctx.st);
      if (grid) {
        ctx.st = { ...ctx.st, marker_pos: approachCell(grid, ctx.st.marker_pos, npc.pos) };
      }
    }
    ctx.st = {
      ...ctx.st,
      active_conversation: { npcId: npc.id, roomId: ctx.roomId, path: [], prompt: greetingText },
    };
  } else {
    updatePcActor(ctx, { turn_actions: { ...char.turn_actions, action_used: true } });
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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can respond in dialogue.' };
  const { char } = ctx.actor;
  // The conversation tracks which NPC we're talking to; fall back to the room's
  // first NPC for a direct dispatch with no active conversation.
  const conv = ctx.st.active_conversation;
  const npc = conv ? npcById(ctx.seed, conv.npcId) : npcsInRoom(ctx.seed, ctx.roomId)[0];
  if (!npc) {
    ctx.narrative = 'There is no one here.';
    return;
  }
  // `responseIdx` is relative to the conversation's current node (the path
  // tracks the nested level); default to the root list for a direct dispatch.
  const path = conv?.path ?? [];
  const node = responsesAtPath(npc, path);
  const response = node[action.responseIdx];
  if (!response) {
    ctx.narrative = 'Invalid response.';
    return;
  }
  // Server-side gate re-check: a stale client (or a consequence that just
  // flipped a fact mid-conversation) can submit an option that is no longer
  // visible — refuse it the same way as an out-of-range index. The check
  // mirrors visibleResponses (condition + once), indexed on the unfiltered
  // tree so responseIdx means the same node both places.
  if (!visibleResponses(npc, path, ctx.st, ctx.context).some((v) => v.idx === action.responseIdx)) {
    ctx.narrative = 'Invalid response.';
    return;
  }
  // One-shot options are spent the moment they're picked — recorded for the
  // whole playthrough (like objects_searched), BEFORE consequences run so a
  // consequence can't re-surface the node it just consumed.
  if (response.once) {
    ctx.st = {
      ...ctx.st,
      dialogue_chosen: [
        ...(ctx.st.dialogue_chosen ?? []),
        onceKey(npc.id, path, action.responseIdx),
      ],
    };
  }
  // Shared by the plain and check paths: run a consequence list, then
  // refresh the actor from the post-consequence state — applyConsequence
  // writes character changes (give_gold / give_xp / give_item) into ctx.st,
  // and without the refresh the epilogue's commitChar would write the
  // PRE-consequence character back over the reward (the narrative would
  // say "+10 gold" while the gold vanished).
  const runConsequences = (list: typeof response.consequences): string => {
    if (!list?.length) return '';
    const narrativeParts: string[] = [];
    for (const c of list) {
      ctx.st = applyConsequence(c, ctx.st, ctx.seed, char.id, narrativeParts, ctx.context);
    }
    const enriched = ctx.st.characters.find((c2) => c2.id === char.id);
    if (enriched) updatePcActor(ctx, enriched);
    return narrativeParts.length ? ' ' + narrativeParts.join(' ') : '';
  };

  // The player's side of the exchange — the chosen line reads as the
  // character speaking it, so the narrative pane carries BOTH halves of
  // the conversation (authors write labels as spoken player lines).
  const playerLine = `${char.name}: "${response.label}"`;

  // Skill-gated node: roll the CHA-based social check, pick the outcome's
  // reply + consequences; children open ONLY on success. Without `once`, a
  // failed check stays on the menu for a retry.
  if (response.check) {
    const chk = response.check;
    const luckActive = consumeLuckForCheck(char);
    const gDie = consumeGuidanceDie(ctx);
    const result = applyGuidanceDie(
      skillCheck(
        char.cha,
        chk.dc,
        char.skill_proficiencies?.includes(chk.skill) ?? false,
        char.level,
        false,
        hasExpertise(char, chk.skill),
        hasJackOfAllTrades(char),
        luckActive,
        char.species === 'halfling',
        hasReliableTalent(char),
        false,
        d20TestPenalty(char)
      ),
      gDie,
      chk.dc
    );
    const skillLabel = chk.skill.charAt(0).toUpperCase() + chk.skill.slice(1);
    const outcomeReply = result.success ? chk.successReply : chk.failReply;
    let narrative = `${playerLine} (${skillLabel} ${result.total} vs DC ${chk.dc} — ${
      result.success ? 'success' : 'fail'
    }). ${npc.name}: "${outcomeReply}"`;
    narrative += runConsequences(result.success ? chk.onSuccess : chk.onFail);
    if (conv) {
      const descend = result.success && (response.responses?.length ?? 0) > 0;
      ctx.st = {
        ...ctx.st,
        active_conversation: {
          ...conv,
          path: descend ? [...path, action.responseIdx] : path,
          prompt: outcomeReply,
        },
      };
    }
    ctx.narrative = narrative;
    return;
  }

  let narrative = `${playerLine} ${
    response.reply ? `${npc.name}: "${response.reply}"` : `${npc.name} nods.`
  }`;
  narrative += runConsequences(response.consequences);
  // Walk the conversation: a branch (has children) descends a level; a leaf
  // keeps the current options. The prompt becomes the NPC's reply either way.
  if (conv) {
    const descend = (response.responses?.length ?? 0) > 0;
    ctx.st = {
      ...ctx.st,
      active_conversation: {
        ...conv,
        path: descend ? [...path, action.responseIdx] : path,
        prompt: response.reply ?? `${npc.name} nods.`,
      },
    };
  }
  ctx.narrative = narrative;
};

/**
 * `conversation_back`: step up one nested dialogue level. The prompt reverts to
 * the parent branch's reply (or the greeting at the root).
 */
export const handleConversationBack: ActionHandler<{ type: 'conversation_back' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs converse.' };
  const conv = ctx.st.active_conversation;
  if (!conv) {
    ctx.narrative = 'No conversation to step back from.';
    return;
  }
  const npc = npcById(ctx.seed, conv.npcId);
  const newPath = conv.path.slice(0, -1);
  let prompt = npc?.greeting ?? '';
  if (npc && newPath.length > 0) {
    // The response that opened this (now-parent) level.
    const parent = responsesAtPath(npc, newPath.slice(0, -1))[newPath[newPath.length - 1]];
    prompt = parent?.reply ?? npc.greeting;
  }
  ctx.st = { ...ctx.st, active_conversation: { ...conv, path: newPath, prompt } };
  ctx.narrative = prompt;
};

/**
 * `end_conversation`: close the dialogue. generateChoices returns to the normal
 * choice set (move / trade / attack / etc.).
 */
export const handleEndConversation: ActionHandler<{ type: 'end_conversation' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs converse.' };
  const npc = ctx.st.active_conversation
    ? npcById(ctx.seed, ctx.st.active_conversation.npcId)
    : undefined;
  // Goodbye narrative hooks — the farewell twin of the greeting pair: the
  // FIRST explicit end of a conversation with this NPC plays firstGoodbye
  // when authored; every later end plays the plain goodbye. No goodbye
  // authored ⇒ just the generic ending line.
  let goodbye = '';
  if (npc) {
    const farewelled = ctx.st.npc_farewelled ?? [];
    const text = farewelled.includes(npc.id) ? npc.goodbye : (npc.firstGoodbye ?? npc.goodbye);
    if (text) goodbye = `${npc.name}: "${text}" `;
    if (!farewelled.includes(npc.id)) {
      ctx.st = { ...ctx.st, npc_farewelled: [...farewelled, npc.id] };
    }
  }
  // Ending the talk also closes any open vendor pane (it nests under the talk).
  ctx.st = { ...ctx.st, active_conversation: undefined, active_shop: undefined };
  ctx.narrative = npc
    ? `${goodbye}You end the conversation with ${npc.name}.`
    : 'You end the conversation.';
};

/**
 * `enter_shop`: open the NPC's wares as a vendor pane nested under the current
 * conversation. generateChoices then surfaces ONLY the buy choices + a Back
 * control (`exit_shop`). Requires an active conversation in this room with a
 * friendly NPC that actually has a shop.
 */
export const handleEnterShop: ActionHandler<{ type: 'enter_shop' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can shop.' };
  const conv = ctx.st.active_conversation;
  const npc = conv ? npcById(ctx.seed, conv.npcId) : undefined;
  if (!conv || !npc) {
    ctx.narrative = 'There is no one to trade with.';
    return;
  }
  if (getNpcAttitude(ctx.st, npc) !== 'friendly' || !npc.shop?.length) {
    ctx.narrative = `${npc.name} has nothing to sell you.`;
    return;
  }
  ctx.st = maybeRestockShops(ctx.st);
  ctx.st = { ...ctx.st, active_shop: { npcId: conv.npcId, roomId: conv.roomId } };
  const wallet = shopGoldLeft(ctx.st, npc);
  ctx.narrative = `You browse ${npc.name}'s wares.${
    wallet !== undefined ? ` (${npc.name} is carrying ${wallet}cr.)` : ''
  }`;
};

/**
 * `exit_shop`: close the vendor pane and drop back to the conversation (the
 * `active_conversation` is left intact).
 */
export const handleExitShop: ActionHandler<{ type: 'exit_shop' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can shop.' };
  const npc = ctx.st.active_shop ? npcById(ctx.seed, ctx.st.active_shop.npcId) : undefined;
  ctx.st = { ...ctx.st, active_shop: undefined };
  ctx.narrative = npc ? `You step back from ${npc.name}'s wares.` : 'You step back from the wares.';
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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can buy.' };
  const { char } = ctx.actor;
  // Buying happens inside the vendor pane, so the seller is active_shop's NPC.
  const npc = ctx.st.active_shop
    ? npcById(ctx.seed, ctx.st.active_shop.npcId)
    : npcsInRoom(ctx.seed, ctx.roomId)[0];
  if (!npc) {
    ctx.narrative = 'There is no one to buy from.';
    return;
  }
  if (getNpcAttitude(ctx.st, npc) !== 'friendly') {
    ctx.narrative = `${npc.name} won't trade with you right now.`;
    return;
  }
  if (char.gold < action.price) {
    ctx.narrative = `You can't afford that — you only have ${char.gold}cr.`;
    return;
  }
  const lootEntry = ctx.context.lootTable.find((l) => l.id === action.itemId);
  if (!lootEntry) {
    ctx.narrative = 'That item is not available.';
    return;
  }
  // Vendor economy — the day may have rolled since the pane opened.
  ctx.st = maybeRestockShops(ctx.st);
  const entry = npc.shop?.find((e) => e.itemId === action.itemId);
  const left = entry ? shopStockLeft(ctx.st, npc.id, entry) : undefined;
  if (left !== undefined && left <= 0) {
    ctx.narrative = `${npc.name} is sold out of ${lootEntry.name} — try again tomorrow.`;
    return;
  }
  if (left !== undefined) {
    ctx.st = {
      ...ctx.st,
      shop_stock: { ...(ctx.st.shop_stock ?? {}), [`${npc.id}:${action.itemId}`]: left - 1 },
    };
  }
  // The party's coin lands in the vendor's wallet (tracked only when finite) —
  // it's the budget they can pay back out when the party SELLS.
  const wallet = shopGoldLeft(ctx.st, npc);
  if (wallet !== undefined) {
    ctx.st = {
      ...ctx.st,
      shop_gold: { ...(ctx.st.shop_gold ?? {}), [npc.id]: wallet + action.price },
    };
  }
  updatePcActor(ctx, {
    gold: char.gold - action.price,
    inventory: [...char.inventory, { ...lootEntry, instance_id: randomUUID() }],
  });
  ctx.narrative = `You hand over ${action.price}cr and receive ${lootEntry.name}. ${npc.name} pockets the credits with a nod.`;
};

/**
 * `sell`: trade one item from the active character's pack to the open
 * vendor. The vendor only buys what THEY stock, at half their sale price
 * (min 1cr), and — when their wallet is finite — only while they can pay;
 * the party's purchases replenish that wallet. Equipped / attuned items
 * must be freed first.
 */
export const handleSell: ActionHandler<{ type: 'sell'; itemId: string }> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can sell.' };
  const { char } = ctx.actor;
  const npc = ctx.st.active_shop
    ? npcById(ctx.seed, ctx.st.active_shop.npcId)
    : npcsInRoom(ctx.seed, ctx.roomId)[0];
  if (!npc) {
    ctx.narrative = 'There is no one to sell to.';
    return;
  }
  if (getNpcAttitude(ctx.st, npc) !== 'friendly') {
    ctx.narrative = `${npc.name} won't trade with you right now.`;
    return;
  }
  ctx.st = maybeRestockShops(ctx.st);
  const price = shopSellPrice(npc, action.itemId, ctx.context.lootTable);
  if (price === undefined) {
    ctx.narrative = `${npc.name} doesn't deal in that.`;
    return;
  }
  const equippedIds = new Set(Object.values(char.equipment ?? {}));
  const attuned = new Set(char.attuned_items ?? []);
  const instance = (char.inventory ?? []).find(
    (i) =>
      i.id === action.itemId &&
      !equippedIds.has(i.instance_id ?? '') &&
      !attuned.has(i.instance_id ?? '')
  );
  if (!instance) {
    ctx.narrative = `You have no unequipped ${action.itemId} to sell.`;
    return;
  }
  const wallet = shopGoldLeft(ctx.st, npc);
  if (wallet !== undefined && wallet < price) {
    ctx.narrative = `${npc.name} turns out empty pockets — come back tomorrow.`;
    return;
  }
  if (wallet !== undefined) {
    ctx.st = {
      ...ctx.st,
      shop_gold: { ...(ctx.st.shop_gold ?? {}), [npc.id]: wallet - price },
    };
  }
  updatePcActor(ctx, {
    gold: char.gold + price,
    inventory: (char.inventory ?? []).filter((i) => i.instance_id !== instance.instance_id),
  });
  ctx.narrative = `${npc.name} looks ${instance.name} over and counts out ${price}cr.`;
};

/**
 * `attack_npc`: trigger that flips a non-hostile NPC to hostile and
 * then dispatches as a regular `attack` against the npc-as-enemy
 * (getLivingRoomEnemies + getEnemyById surface NPCs via `npc:${roomId}`
 * once flipped, so combat initiative includes them).
 *
 * Returns `replaceWith` — the original takeAction's epilogue is
 * skipped because the recursive takeAction re-entering with the new
 * `attack` action runs its own epilogue (enemy turns, runRules, LLM
 * enhance, etc.). Without that, we'd double-fire enemy turns and
 * narrative enhancement.
 */
export const handleAttackNpc: ActionHandler<{ type: 'attack_npc'; npcId: string }> = (
  ctx,
  action
) => {
  const npc = npcById(ctx.seed, action.npcId);
  if (!npc) {
    ctx.narrative = 'There is no one to attack here.';
    return;
  }
  if (npcIsKilled(ctx.st, npc.id)) {
    ctx.narrative = 'Already dead.';
    return;
  }
  ctx.st = {
    ...ctx.st,
    npc_attitudes: { ...ctx.st.npc_attitudes, [npc.id]: 'hostile' },
  };
  ctx.commitChar();
  return { replaceWith: { type: 'attack', targetEnemyId: `npc:${npc.id}` } };
};

/**
 * SRD **Influence action**. Distinct from `talk` (free narrative
 * dialogue):
 *
 *   - **Talk** = open-ended chat, costless, no skill check. Player
 *     learns information and uncovers dialogue paths.
 *   - **Influence** = mechanical attempt to change an NPC's behavior
 *     or coerce an enemy mid-fight. Triggers a CHA-based skill check.
 *
 * Costs:
 *   - In combat: consumes the Action for the turn (no attack on a
 *     turn the Rogue tries to talk a bandit into yielding).
 *   - Out of combat: no action cost (the 10-min narrative time
 *     investment doesn't translate to Pansori's turn loop).
 *
 * DC: `max(15, target's INT)`. Roll d20 + CHA mod + proficiency
 * bonus (if the PC is proficient in the chosen skill).
 *
 * Outcomes:
 *   - **Enemy target, success**: enemy yields / flees — added to
 *     `enemies_killed` so the engine treats them as removed without
 *     XP penalty. Narrative says they retreated.
 *   - **Enemy target, fail**: action spent, narrative-only.
 *   - **NPC target, success**: shifts `npc_attitudes[roomId]` one
 *     step friendlier (hostile → indifferent → friendly).
 *   - **NPC target, fail**: narrative-only.
 *
 * The pre-existing `talk` flow's implicit Persuasion check for
 * indifferent NPCs remains — those are framed as "the act of
 * approaching counts as a soft check." `influence` is the explicit,
 * high-stakes path.
 */
export const handleInfluence: ActionHandler<{
  type: 'influence';
  skill: 'persuasion' | 'deception' | 'intimidation';
  targetNpcId?: string;
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can use the Influence action.' };
  const { char } = ctx.actor;
  // Resolve target: an explicit npc, an explicit enemy, else the room's first NPC.
  const npc = action.targetNpcId
    ? npcById(ctx.seed, action.targetNpcId)
    : npcsInRoom(ctx.seed, ctx.roomId)[0];
  const enemy = action.targetEnemyId
    ? ctx.livingEnemiesInRoom.find((e) => e.id === action.targetEnemyId)
    : null;

  if (!npc && !enemy) {
    return { rejected: 'No valid target to influence here.' };
  }

  // DC: max(15, target INT). Monsters have `int` in their template;
  // NPCs do not (their template has only the social `persuasionDC`
  // we already use for `talk`). For NPC targets we use the higher of
  // 15 or the existing `persuasionDC`.
  const targetIntScore = enemy
    ? ((enemy as unknown as Record<string, number>).int ?? 10)
    : (npc?.persuasionDC ?? 12);
  const dc = Math.max(15, targetIntScore);

  const skillName = action.skill; // 'persuasion' | 'deception' | 'intimidation' (all CHA)
  // Lucky feat — queued via `use_luck` grants advantage on the check.
  const luckActive = consumeLuckForCheck(char);
  const gDie = consumeGuidanceDie(ctx);
  // Routed through skillCheck so social checks gain Expertise / Jack of All
  // Trades / Reliable Talent / Halfling Lucky, consistent with other skills.
  const check = applyGuidanceDie(
    skillCheck(
      char.cha,
      dc,
      char.skill_proficiencies?.includes(skillName) ?? false,
      char.level,
      false,
      hasExpertise(char, skillName),
      hasJackOfAllTrades(char),
      luckActive,
      char.species === 'halfling',
      hasReliableTalent(char),
      false,
      d20TestPenalty(char)
    ),
    gDie,
    dc
  );
  const total = check.total;
  const success = check.success;

  const skillLabel = {
    persuasion: 'Persuasion',
    deception: 'Deception',
    intimidation: 'Intimidation',
  }[action.skill];

  // Combat-mode action cost: spend the Action regardless of success.
  // The check is committed effort; failure still costs the action slot.
  const inCombat = ctx.st.combat_active === true;
  if (inCombat) {
    updatePcActor(ctx, { turn_actions: { ...char.turn_actions, action_used: true } });
  }

  if (success) {
    if (enemy) {
      // Enemy yields. Mark as killed (no XP) and narrate the retreat.
      ctx.st = {
        ...ctx.st,
        enemies_killed: [...ctx.st.enemies_killed, enemy.id],
      };
      ctx.narrative = `${char.name} attempts a ${skillLabel} check on ${enemy.name} (${total} vs DC ${dc}) — success! ${enemy.name} yields and retreats from the fight.`;
    } else if (npc) {
      const currentAttitude = ctx.st.npc_attitudes?.[npc.id] ?? npc.attitude;
      const nextAttitude =
        currentAttitude === 'hostile'
          ? 'indifferent'
          : currentAttitude === 'indifferent'
            ? 'friendly'
            : 'friendly';
      ctx.st = {
        ...ctx.st,
        npc_attitudes: { ...ctx.st.npc_attitudes, [npc.id]: nextAttitude },
      };
      ctx.narrative = `${char.name} uses ${skillLabel} on ${npc.name} (${total} vs DC ${dc}) — success! ${npc.name}'s attitude shifts to ${nextAttitude}.`;
    }
  } else {
    const targetName = enemy ? enemy.name : (npc?.name ?? 'them');
    ctx.narrative = `${char.name} tries to ${skillLabel.toLowerCase()} ${targetName} (${total} vs DC ${dc}) — fails. ${targetName} is unmoved.`;
  }
  ctx.usedInitiative = inCombat;
};

/**
 * SRD **Study action**. INT-based mental-deduction action,
 * distinct from `examine` (which is informal in pansori — short
 * sensory description with no roll). 5.5e splits the old "look at
 * something" into:
 *
 *   - **Search** (WIS) — physical senses; spot hidden things.
 *   - **Study** (INT) — recall lore, deduce mechanism, identify
 *     creatures.
 *
 * This handler covers the **creature-analysis** branch: roll INT +
 * skill (Arcana / History / Investigation / Nature / Religion) vs
 * DC. On success, reveal the target's known weaknesses
 * (`vulnerabilities`, `resistances`, `immunities`,
 * `condition_immunities`) so the player can make informed
 * tactical choices. Failure spends the action with no info.
 *
 * DC: `15 + Math.floor(enemy.cr ?? 0)` for creature analysis.
 * (Pansori monsters don't all carry CR; fall back to 15.)
 *
 * In combat: consumes the Action. Out of combat: no cost. The
 * object-analysis and free-form lore-recall branches are TODO —
 * the type already accepts `loreTopic` so future PRs can extend
 * here.
 */
export const handleStudy: ActionHandler<{
  type: 'study';
  skill: 'arcana' | 'history' | 'investigation' | 'nature' | 'religion';
  targetEnemyId?: string;
  loreTopic?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can use the Study action.' };
  const { char } = ctx.actor;
  const enemy = action.targetEnemyId
    ? ctx.livingEnemiesInRoom.find((e) => e.id === action.targetEnemyId)
    : null;
  // For now, creature-analysis is the only resolved branch. Free-form
  // lore + object analysis bounce off with a narrative-only message.
  if (!enemy) {
    if (action.loreTopic) {
      ctx.narrative = `${char.name} contemplates "${action.loreTopic}", but the engine doesn't yet model freeform lore recall.`;
      return;
    }
    return { rejected: 'No valid creature to study here.' };
  }

  const enemyCr = (enemy as unknown as Record<string, number>).cr ?? 0;
  const dc = 15 + Math.floor(enemyCr);
  const skillName = action.skill;
  const studyLuckActive = consumeLuckForCheck(char);
  // SRD Cleric Divine Order (Thaumaturge) — add WIS (min +1) to Intelligence
  // (Arcana/Religion) checks. `divine_order` is only ever set on a Cleric.
  const thaumaturgeBonus =
    char.divine_order === 'thaumaturge' && (skillName === 'arcana' || skillName === 'religion')
      ? Math.max(1, abilityMod(char.wis))
      : 0;
  // Routed through skillCheck (Study skills are all INT) so it gains Expertise /
  // Jack of All Trades / Reliable Talent / Halfling Lucky. The Thaumaturge bonus
  // folds into the DC (lowered by it), mirroring how Bardic dice are handled.
  const studyGuidance = consumeGuidanceDie(ctx);
  const studyCheck = applyGuidanceDie(
    skillCheck(
      char.int,
      dc - thaumaturgeBonus,
      char.skill_proficiencies?.includes(skillName) ?? false,
      char.level,
      false,
      hasExpertise(char, skillName),
      hasJackOfAllTrades(char),
      studyLuckActive,
      char.species === 'halfling',
      hasReliableTalent(char),
      false,
      d20TestPenalty(char)
    ),
    studyGuidance,
    dc - thaumaturgeBonus
  );
  const total = studyCheck.total + thaumaturgeBonus;
  const success = studyCheck.success;

  const skillLabel = {
    arcana: 'Arcana',
    history: 'History',
    investigation: 'Investigation',
    nature: 'Nature',
    religion: 'Religion',
  }[action.skill];

  const inCombat = ctx.st.combat_active === true;
  if (inCombat) {
    updatePcActor(ctx, { turn_actions: { ...char.turn_actions, action_used: true } });
  }

  if (!success) {
    ctx.narrative = `${char.name} studies ${enemy.name} (INT ${skillLabel} ${total} vs DC ${dc}) — fails to recall anything useful.`;
    ctx.usedInitiative = inCombat;
    return;
  }

  const facts: string[] = [];
  if (enemy.vulnerabilities && enemy.vulnerabilities.length > 0) {
    facts.push(`vulnerable to ${enemy.vulnerabilities.join(', ')}`);
  }
  if (enemy.resistances && enemy.resistances.length > 0) {
    facts.push(`resistant to ${enemy.resistances.join(', ')}`);
  }
  if (enemy.immunities && enemy.immunities.length > 0) {
    facts.push(`immune to ${enemy.immunities.join(', ')}`);
  }
  if (enemy.condition_immunities && enemy.condition_immunities.length > 0) {
    facts.push(`cannot be ${enemy.condition_immunities.join(' / ')}`);
  }
  const summary = facts.length > 0 ? facts.join('; ') : 'no notable weaknesses or strengths';
  ctx.narrative = `${char.name} studies ${enemy.name} (INT ${skillLabel} ${total} vs DC ${dc}) — success! ${enemy.name} is ${summary}.`;
  ctx.usedInitiative = inCombat;
};
