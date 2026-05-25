import { abilityMod, d20TestPenalty, profBonus, rollDice, skillCheck } from '../rulesEngine.js';
import {
  applyConsequence,
  consumeLuckForCheck,
  getNpcAttitude,
  npcIsKilled,
} from '../gameEngine.js';
import { hasExpertise, hasJackOfAllTrades, hasReliableTalent } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

/**
 * `talk`: open dialogue with the NPC in the current room. Indifferent
 * NPCs require a Persuasion (CHA) check to engage; on success they
 * flip to friendly. Hostile NPCs attack instead. Greeting + response
 * options are appended inline as stage-direction hints (matches the
 * UI button format).
 */
export const handleTalk: ActionHandler<{ type: 'talk' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can talk.' };
  const { char } = ctx.actor;
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
    const chaMod = abilityMod(char.cha);
    const roll = rollDice('1d20') + chaMod + profBonus(char.level);
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
      ctx.st = applyConsequence(c, ctx.st, ctx.seed, char.id, narrativeParts, ctx.context);
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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can buy.' };
  const { char } = ctx.actor;
  const npc = ctx.seed.npcs?.[ctx.roomId];
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
  updatePcActor(ctx, {
    gold: char.gold - action.price,
    inventory: [...char.inventory, { ...lootEntry, instance_id: randomUUID() }],
  });
  ctx.narrative = `You hand over ${action.price}cr and receive ${lootEntry.name}. ${npc.name} pockets the credits with a nod.`;
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
export const handleAttackNpc: ActionHandler<{ type: 'attack_npc' }> = (ctx) => {
  const npc = ctx.seed.npcs?.[ctx.roomId];
  if (!npc) {
    ctx.narrative = 'There is no one to attack here.';
    return;
  }
  if (npcIsKilled(ctx.st, ctx.roomId)) {
    ctx.narrative = 'Already dead.';
    return;
  }
  ctx.st = {
    ...ctx.st,
    npc_attitudes: { ...ctx.st.npc_attitudes, [ctx.roomId]: 'hostile' },
  };
  ctx.commitChar();
  return { replaceWith: { type: 'attack', targetEnemyId: `npc:${ctx.roomId}` } };
};

/**
 * 2024 PHB **Influence action**. Distinct from `talk` (free narrative
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
  targetNpcRoomId?: string;
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can use the Influence action.' };
  const { char } = ctx.actor;
  // Resolve target: prefer explicit npc room, then explicit enemy,
  // then current-room npc if either is omitted.
  const npcRoomId = action.targetNpcRoomId ?? ctx.roomId;
  const npc = ctx.seed.npcs?.[npcRoomId];
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
  // Routed through skillCheck so social checks gain Expertise / Jack of All
  // Trades / Reliable Talent / Halfling Lucky, consistent with other skills.
  const check = skillCheck(
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
      const currentAttitude = ctx.st.npc_attitudes?.[npcRoomId] ?? npc.attitude;
      const nextAttitude =
        currentAttitude === 'hostile'
          ? 'indifferent'
          : currentAttitude === 'indifferent'
            ? 'friendly'
            : 'friendly';
      ctx.st = {
        ...ctx.st,
        npc_attitudes: { ...ctx.st.npc_attitudes, [npcRoomId]: nextAttitude },
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
 * 2024 PHB **Study action**. INT-based mental-deduction action,
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
  const studyCheck = skillCheck(
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
