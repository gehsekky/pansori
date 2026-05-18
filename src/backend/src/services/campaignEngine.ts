import type {
  CampaignFacts,
  CampaignState,
  Faction,
  GameState,
  NpcAttitude,
  Quest,
  QuestStatus,
} from '../types.js';
import { Engine, type TopLevelCondition } from 'json-rules-engine';

// ─── DB helpers ───────────────────────────────────────────────────────────────

 
type DB = any;

export async function loadCampaignState(
  db: DB,
  userId: string,
  campaignId: string
): Promise<CampaignState> {
  const row = await db.query(
    `SELECT state FROM campaign_states WHERE user_id = $1 AND campaign_id = $2`,
    [userId, campaignId]
  );
  if (row.rows.length) return row.rows[0].state as CampaignState;

  // First visit — create a blank state
  const blank: CampaignState = {
    campaign_id: campaignId,
    user_id: userId,
    world_day: 1,
    current_location: '',
    flags: {},
    quests: [],
    faction_rep: {},
    npc_attitudes: {},
  };
  await db.query(
    `INSERT INTO campaign_states (user_id, campaign_id, state)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, campaign_id) DO NOTHING`,
    [userId, campaignId, JSON.stringify(blank)]
  );
  return blank;
}

export async function saveCampaignState(db: DB, state: CampaignState): Promise<void> {
  await db.query(
    `INSERT INTO campaign_states (user_id, campaign_id, state, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, campaign_id)
     DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [state.user_id, state.campaign_id, JSON.stringify(state)]
  );
}

// ─── Merge / extract ──────────────────────────────────────────────────────────

// Copy campaign-level data from CampaignState into the GameState before play
export function mergeCampaignIntoGameState(gs: GameState, cs: CampaignState): GameState {
  return {
    ...gs,
    current_location_id: gs.current_location_id ?? cs.current_location,
    campaign_flags: { ...cs.flags, ...gs.campaign_flags },
    quest_progress: gs.quest_progress ?? cs.quests,
    faction_rep: gs.faction_rep ?? cs.faction_rep,
    world_day: gs.world_day ?? cs.world_day,
    npc_attitudes: { ...cs.npc_attitudes, ...gs.npc_attitudes },
  };
}

// Write back the campaign-mutable fields from GameState into a new CampaignState
export function extractCampaignDelta(prev: CampaignState, gs: GameState): CampaignState {
  return {
    ...prev,
    current_location: gs.current_location_id ?? prev.current_location,
    flags: { ...prev.flags, ...gs.campaign_flags },
    quests: gs.quest_progress ?? prev.quests,
    faction_rep: gs.faction_rep ?? prev.faction_rep,
    world_day: gs.world_day ?? prev.world_day,
    npc_attitudes: { ...prev.npc_attitudes, ...gs.npc_attitudes },
  };
}

// ─── Quest evaluation ─────────────────────────────────────────────────────────

export async function evaluateQuestSteps(
  cs: CampaignState,
  quests: Quest[],
  facts: CampaignFacts
): Promise<{ questId: string; completedStepIds: string[] }[]> {
  const active = cs.quests.filter((qp) => qp.status === 'active');
  const results: { questId: string; completedStepIds: string[] }[] = [];

  for (const qp of active) {
    const def = quests.find((q) => q.id === qp.questId);
    if (!def) continue;

    const newlyCompleted: string[] = [];
    for (const step of def.steps) {
      if (qp.completedSteps.includes(step.id)) continue;

      const engine = new Engine();
      engine.addRule({
        name: step.id,
        conditions: step.condition as TopLevelCondition,
        event: { type: 'step_met' },
      });
      const { results: ruleResults } = await engine.run(
        facts as unknown as Record<string, unknown>
      );
      if (ruleResults.length > 0) newlyCompleted.push(step.id);
    }
    if (newlyCompleted.length)
      results.push({ questId: qp.questId, completedStepIds: newlyCompleted });
  }

  return results;
}

// Apply quest step completions to a CampaignState copy; auto-complete quests when all steps done
export function applyQuestCompletions(
  cs: CampaignState,
  quests: Quest[],
  completions: { questId: string; completedStepIds: string[] }[]
): { cs: CampaignState; completedQuestIds: string[] } {
  let updated = {
    ...cs,
    quests: cs.quests.map((q) => ({ ...q, completedSteps: [...q.completedSteps] })),
  };
  const completedQuestIds: string[] = [];

  for (const { questId, completedStepIds } of completions) {
    const def = quests.find((q) => q.id === questId);
    const qp = updated.quests.find((q) => q.questId === questId);
    if (!def || !qp) continue;

    for (const sid of completedStepIds) {
      if (!qp.completedSteps.includes(sid)) qp.completedSteps.push(sid);
    }

    const allDone = def.steps.every((s) => qp.completedSteps.includes(s.id));
    if (allDone && qp.status === 'active') {
      qp.status = 'completed' as QuestStatus;
      completedQuestIds.push(questId);
      if (def.factionId && def.repGain) {
        updated = {
          ...updated,
          faction_rep: {
            ...updated.faction_rep,
            [def.factionId]: (updated.faction_rep[def.factionId] ?? 0) + def.repGain,
          },
        };
      }
    }
  }

  return { cs: updated, completedQuestIds };
}

// ─── Faction helpers ──────────────────────────────────────────────────────────

export function factionAttitude(
  rep: number,
  faction: Faction
): 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'exalted' {
  const t = faction.thresholds;
  if (rep >= t.exalted) return 'exalted';
  if (rep >= t.friendly) return 'friendly';
  if (rep >= t.neutral) return 'neutral';
  if (rep >= t.unfriendly) return 'unfriendly';
  return 'hostile';
}

export function factionShopPrice(basePrice: number, rep: number, faction: Faction): number {
  const attitude = factionAttitude(rep, faction);
  const modifier = faction.shopPriceModifiers[attitude] ?? 1.0;
  return Math.max(1, Math.round(basePrice * modifier));
}

// ─── NPC attitude from campaign state ────────────────────────────────────────

export function getNpcAttitude(
  cs: CampaignState,
  npcId: string,
  defaultAttitude: NpcAttitude = 'indifferent'
): NpcAttitude {
  return cs.npc_attitudes[npcId] ?? defaultAttitude;
}
