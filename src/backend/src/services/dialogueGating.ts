import type {
  CampaignFacts,
  Context,
  GameState,
  NpcDialogueResponse,
  PlacedNpc,
  QuestProgress,
} from '../types.js';
import { factionAttitude } from './campaignEngine.js';
import { formatGameClock } from './gameClock.js';
import { responsesAtPath } from './conversation.js';

/**
 * Dialogue gating — conditions + one-shot options on NPC dialogue nodes.
 *
 * A dialogue response may carry a `condition` (the SAME json-rules-engine
 * shape quest steps use, evaluated against CampaignFacts) and/or `once`
 * (chosen → gone for the rest of the playthrough). Gated options are
 * HIDDEN, never grayed out — locked paths stay a surprise.
 *
 * Quest steps run through the real json-rules-engine (async, in the action
 * route); choice generation is synchronous, so dialogue conditions use the
 * small synchronous evaluator below. It covers the standard operator set +
 * all/any/not nesting + simple `$.dot.path` fact paths — the subset quest
 * authors already use. Anything it can't understand evaluates FALSE (the
 * option hides): a typo'd condition reads as "locked", which the author
 * notices immediately, instead of leaking a gated branch.
 */

// ─── Synchronous condition evaluator ─────────────────────────────────────────

type Facts = Record<string, unknown>;

/** Resolve a `$.a.b` jsonpath-lite path against a fact value. */
function resolvePath(value: unknown, path: string): unknown {
  if (!path.startsWith('$.')) return undefined;
  let cur: unknown = value;
  for (const seg of path.slice(2).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function evalLeaf(cond: Record<string, unknown>, facts: Facts): boolean {
  const factName = cond.fact;
  if (typeof factName !== 'string') return false;
  let actual: unknown = facts[factName];
  if (typeof cond.path === 'string') actual = resolvePath(actual, cond.path);
  const expected = cond.value;
  switch (cond.operator) {
    case 'equal':
      return actual === expected;
    case 'notEqual':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'notIn':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'contains':
      return Array.isArray(actual) && actual.includes(expected);
    case 'doesNotContain':
      return Array.isArray(actual) && !actual.includes(expected);
    case 'lessThan':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lessThanInclusive':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'greaterThan':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'greaterThanInclusive':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    default:
      // Unknown operator — fail closed (the option stays hidden).
      return false;
  }
}

/**
 * Evaluate a json-rules-engine TopLevelCondition synchronously against a
 * facts object. Supports {all}/{any}/{not} nesting and the standard leaf
 * operators; malformed input is FALSE (fail closed).
 */
export function evalCondition(cond: unknown, facts: Facts): boolean {
  if (cond === null || typeof cond !== 'object') return false;
  const c = cond as Record<string, unknown>;
  if (Array.isArray(c.all)) return c.all.every((sub) => evalCondition(sub, facts));
  if (Array.isArray(c.any)) return c.any.some((sub) => evalCondition(sub, facts));
  if (c.not !== undefined) return !evalCondition(c.not, facts);
  return evalLeaf(c, facts);
}

// ─── Facts ────────────────────────────────────────────────────────────────────

/**
 * Derived progress facts — quest ids flattened by status, completed steps as
 * 'questId:stepId', and faction rep resolved to named tiers via each
 * faction's own thresholds. Shared by the quest-evaluation facts (the action
 * route) and dialogue gating, so one vocabulary gates both.
 */
export function derivedProgressFacts(
  questProgress: QuestProgress[],
  factionRep: Record<string, number>,
  context: Context
): Pick<CampaignFacts, 'quests_active' | 'quests_completed' | 'steps_done' | 'faction_tier'> {
  const quests_active: string[] = [];
  const quests_completed: string[] = [];
  const steps_done: string[] = [];
  for (const qp of questProgress) {
    if (qp.status === 'active') quests_active.push(qp.questId);
    if (qp.status === 'completed') quests_completed.push(qp.questId);
    for (const stepId of qp.completedSteps) steps_done.push(`${qp.questId}:${stepId}`);
  }
  const faction_tier: Record<string, string> = {};
  for (const f of context.campaign?.factions ?? []) {
    faction_tier[f.id] = factionAttitude(factionRep[f.id] ?? 0, f);
  }
  return { quests_active, quests_completed, steps_done, faction_tier };
}

/**
 * Build the full CampaignFacts for a GameState — the dialogue-side twin of
 * the action route's quest-facts construction (kept field-for-field in sync;
 * `action` is '' because dialogue visibility never keys on the action that
 * exposed it).
 */
export function dialogueFacts(st: GameState, context: Context): CampaignFacts {
  const activeChar = st.characters.find((c) => c.id === st.active_character_id) ?? st.characters[0];
  return {
    action: '',
    room_id: st.current_room,
    npc_id: st.active_conversation?.npcId ?? '',
    current_town_id: st.current_town_id ?? '',
    location_id: '',
    enemies_killed: st.enemies_killed,
    loot_taken: st.loot_taken,
    visited_rooms: st.visited_rooms ?? [],
    flags: st.flags,
    campaign_flags: st.campaign_flags ?? {},
    quest_progress: st.quest_progress ?? [],
    faction_rep: st.faction_rep ?? {},
    ...derivedProgressFacts(st.quest_progress ?? [], st.faction_rep ?? {}, context),
    party_items: st.characters.flatMap((c) => (c.inventory ?? []).map((i) => i.id)),
    world_minute: st.world_minute ?? 0,
    world_day: formatGameClock(st.world_minute ?? 0).day,
    active_level: activeChar?.level ?? 1,
    active_class: activeChar?.character_class ?? '',
  };
}

// ─── Visibility ───────────────────────────────────────────────────────────────

/** GameState.dialogue_chosen key for a node: npcId + its index path. */
export function onceKey(npcId: string, path: number[], idx: number): string {
  return `${npcId}:${[...path, idx].join('.')}`;
}

/**
 * The dialogue responses VISIBLE at a conversation node, carrying their
 * ORIGINAL index in the unfiltered tree. `active_conversation.path` and
 * `talk_response.responseIdx` always index the unfiltered tree, so hiding
 * an option never shifts its siblings' identities mid-conversation.
 */
export function visibleResponses(
  npc: PlacedNpc,
  path: number[],
  st: GameState,
  context: Context
): Array<{ response: NpcDialogueResponse; idx: number }> {
  const node = responsesAtPath(npc, path);
  if (node.length === 0) return [];
  // Facts built once per node, not per option.
  let facts: Facts | null = null;
  const chosen = st.dialogue_chosen ?? [];
  const out: Array<{ response: NpcDialogueResponse; idx: number }> = [];
  node.forEach((response, idx) => {
    if (response.once && chosen.includes(onceKey(npc.id, path, idx))) return;
    if (response.condition) {
      facts ??= dialogueFacts(st, context) as unknown as Facts;
      if (!evalCondition(response.condition, facts)) return;
    }
    out.push({ response, idx });
  });
  return out;
}
