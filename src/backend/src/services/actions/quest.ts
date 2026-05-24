import type { ActionHandler } from './types.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

/**
 * `accept_quest`: opt in to a quest defined in the campaign. Adds a
 * `quest_progress` row with status='active' and an empty completed-
 * steps list. Idempotent: re-accepting already-active quests is
 * rejected with a notice.
 */
export const handleAcceptQuest: ActionHandler<{ type: 'accept_quest'; questId: string }> = (
  ctx,
  action
) => {
  const questDef = ctx.context.campaign?.quests?.find((q) => q.id === action.questId);
  if (!questDef) {
    ctx.narrative = 'Unknown quest.';
    return;
  }
  const existingProgress = (ctx.st.quest_progress ?? []).find(
    (qp) => qp.questId === action.questId
  );
  if (existingProgress) {
    ctx.narrative = `You have already accepted "${questDef.title}".`;
    return;
  }
  ctx.st = {
    ...ctx.st,
    quest_progress: [
      ...(ctx.st.quest_progress ?? []),
      { questId: action.questId, status: 'active', completedSteps: [] },
    ],
  };
  ctx.narrative = `Quest accepted: "${questDef.title}" — ${questDef.desc}`;
  ctx.usedInitiative = false;
};

/**
 * `complete_quest`: manual completion trigger (most quests auto-
 * complete via the rules engine). Verifies every step is done, then
 * applies rewards: give_item adds with fresh instance_id, give_gold
 * adds to char.gold, modify_hp heals (capped at max_hp), set_faction_rep
 * adjusts faction standing.
 */
export const handleCompleteQuest: ActionHandler<{ type: 'complete_quest'; questId: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can complete quests.' };
  const { char } = ctx.actor;
  const cqDef = ctx.context.campaign?.quests?.find((q) => q.id === action.questId);
  if (!cqDef) {
    ctx.narrative = 'Unknown quest.';
    return;
  }
  const cqProgress = (ctx.st.quest_progress ?? []).find((qp) => qp.questId === action.questId);
  if (!cqProgress || cqProgress.status !== 'active') {
    ctx.narrative = `Quest "${cqDef.title}" is not active.`;
    return;
  }
  const allStepsDone = cqDef.steps.every((s) => cqProgress.completedSteps.includes(s.id));
  if (!allStepsDone) {
    const remaining = cqDef.steps.filter((s) => !cqProgress.completedSteps.includes(s.id));
    ctx.narrative = `Quest "${cqDef.title}" is not yet complete. Remaining: ${remaining.map((s) => s.desc).join('; ')}`;
    return;
  }

  const rewardLines: string[] = [];
  let nextChar = char;
  let nextSt = ctx.st;
  for (const reward of cqDef.rewards) {
    if (reward.type === 'give_item') {
      const item = ctx.context.lootTable.find((l) => l.id === reward.itemId);
      if (item) {
        nextChar = {
          ...nextChar,
          inventory: [...nextChar.inventory, { instance_id: randomUUID(), ...item }],
        };
        rewardLines.push(`received ${item.name}`);
      }
    } else if (reward.type === 'give_gold') {
      nextChar = { ...nextChar, gold: (nextChar.gold ?? 0) + reward.amount };
      rewardLines.push(`${reward.amount} gold`);
    } else if (reward.type === 'modify_hp') {
      nextChar = { ...nextChar, hp: Math.min(nextChar.max_hp, nextChar.hp + reward.amount) };
    } else if (reward.type === 'set_faction_rep') {
      nextSt = {
        ...nextSt,
        faction_rep: {
          ...(nextSt.faction_rep ?? {}),
          [reward.factionId]: ((nextSt.faction_rep ?? {})[reward.factionId] ?? 0) + reward.delta,
        },
      };
      rewardLines.push(`+${reward.delta} rep with faction`);
    }
  }
  nextSt = {
    ...nextSt,
    quest_progress: (nextSt.quest_progress ?? []).map((qp) =>
      qp.questId === action.questId ? { ...qp, status: 'completed' } : qp
    ),
  };
  updatePcActor(ctx, nextChar);
  ctx.st = nextSt;
  const rewardStr = rewardLines.length ? ` Rewards: ${rewardLines.join(', ')}.` : '';
  ctx.narrative = `Quest complete: "${cqDef.title}".${rewardStr}`;
  ctx.usedInitiative = false;
};
