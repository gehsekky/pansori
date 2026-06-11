// Cross-section reference lint — a NON-BLOCKING validation pass over a
// campaign's authored content. Campaign sections are saved independently and in
// any order, so a hard FK across them isn't feasible; instead this walks the
// FK-like references (a dialogue `start_quest` → a quest id, a quest's
// `factionId` → a faction, a site's `entryRoomId` → a room, condition facts that
// name quest/faction/item/room/town/npc ids) and reports any that don't resolve
// against the campaign's definitions. The runtime otherwise only `console.warn`s
// on a dangling ref at apply time; this surfaces them at edit time.
//
// Operates on the DB-authored sections (every shipped campaign is DB-authored —
// the built-in code campaigns were dropped). A reference into content that
// exists ONLY in a code base template would read as unknown; acceptable for an
// advisory lint.

import {
  type CampaignRoomNpcResponse,
  getCampaignActs,
  getCampaignQuests,
  getCampaignRegions,
  getCampaignRooms,
  getCampaignTowns,
  getDbSection,
} from './campaignContent.js';
import type { Faction, GameRule } from '../types.js';
import { composeLootTable, getCampaignCustomItems, getItemCatalog } from './itemCatalog.js';
import type { Pool } from 'pg';

export type LintCategory =
  | 'quest'
  | 'faction'
  | 'npc'
  | 'room'
  | 'town'
  | 'item'
  | 'location'
  | 'act'
  | 'region'
  | 'member';

export interface LintIssue {
  severity: 'warning';
  category: LintCategory;
  // Human-readable place the reference was authored (e.g. quest / dialogue path).
  location: string;
  message: string;
}

// One '...' value, an array of them, or neither → a flat list of string ids.
function idsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' ? [value] : [];
}

export async function lintCampaign(pool: Pool, campaignId: string): Promise<LintIssue[]> {
  const [quests, rooms, regions, towns] = await Promise.all([
    getCampaignQuests(pool, campaignId),
    getCampaignRooms(pool, campaignId),
    getCampaignRegions(pool, campaignId),
    getCampaignTowns(pool, campaignId),
  ]);
  const factions = ((await getDbSection(pool, campaignId, 'factions')).value as Faction[]) ?? [];
  const rules = ((await getDbSection(pool, campaignId, 'rules')).value as GameRule[]) ?? [];
  const acts = await getCampaignActs(pool, campaignId);
  // Required members (loot-effect targets) live in the recommendedParty section.
  const recParty = (await getDbSection(pool, campaignId, 'recommendedParty')).value as
    | { requiredMembers?: { name: string }[] }
    | undefined;
  const itemIds = new Set(
    composeLootTable(
      await getCampaignCustomItems(pool, campaignId),
      [],
      await getItemCatalog(pool)
    ).map((i) => i.id)
  );

  // ── Definition id sets ──
  const questIds = new Set(quests.map((q) => q.id));
  const stepsByQuest = new Map(quests.map((q) => [q.id, new Set(q.steps.map((s) => s.id))]));
  const factionIds = new Set(factions.map((f) => f.id));
  const roomIds = new Set(rooms.map((r) => r.id));
  const npcIds = new Set(rooms.flatMap((r) => (r.npcs ?? []).map((n) => n.id)));
  const townIds = new Set(towns.map((t) => t.id));
  const actIds = new Set(acts.map((a) => a.id));
  const regionIds = new Set(regions.map((r) => r.id));
  const memberNames = new Set((recParty?.requiredMembers ?? []).map((m) => m.name));
  const locationIds = new Set<string>([
    ...regions.flatMap((r) => (r.sites ?? []).map((s) => s.id)),
    ...towns.flatMap((t) => (t.venues ?? []).map((v) => v.id)),
  ]);

  const issues: LintIssue[] = [];
  const add = (category: LintCategory, location: string, message: string) =>
    issues.push({ severity: 'warning', category, location, message });

  // ── Loot effects (acts + quests): item id + required-member targets ──
  const checkLootEffect = (
    effect:
      | {
          grant?: { itemId: string; member: string }[];
          revoke?: { itemId: string; member: string }[];
        }
      | undefined,
    where: string
  ) => {
    if (!effect) return;
    for (const e of [...(effect.grant ?? []), ...(effect.revoke ?? [])]) {
      if (e.itemId && !itemIds.has(e.itemId))
        add('item', where, `loot → unknown item "${e.itemId}"`);
      if (e.member && !memberNames.has(e.member))
        add('member', where, `loot → unknown required member "${e.member}"`);
    }
  };

  // ── Consequence references (dialogue, quest rewards, rules) ──
  const checkConsequences = (list: unknown, where: string) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const cc = c as Record<string, unknown>;
      const id = (k: string) => (typeof cc[k] === 'string' ? (cc[k] as string) : undefined);
      switch (cc.type) {
        case 'start_quest': {
          const q = id('questId');
          if (q && !questIds.has(q)) add('quest', where, `start_quest → unknown quest "${q}"`);
          break;
        }
        case 'advance_quest': {
          const q = id('questId');
          const s = id('stepId');
          if (q && !questIds.has(q)) add('quest', where, `advance_quest → unknown quest "${q}"`);
          else if (q && s && !stepsByQuest.get(q)?.has(s))
            add('quest', where, `advance_quest → unknown step "${q}:${s}"`);
          break;
        }
        case 'give_item':
        case 'consume_item': {
          const i = id('itemId');
          if (i && !itemIds.has(i)) add('item', where, `${cc.type} → unknown item "${i}"`);
          break;
        }
        case 'set_npc_attitude': {
          const n = id('npcId');
          if (n && !npcIds.has(n)) add('npc', where, `set_npc_attitude → unknown NPC "${n}"`);
          break;
        }
        case 'set_faction_rep': {
          const f = id('factionId');
          if (f && !factionIds.has(f))
            add('faction', where, `set_faction_rep → unknown faction "${f}"`);
          break;
        }
        case 'unlock_room':
        case 'spawn_enemy': {
          const r = id('roomId');
          if (r && !roomIds.has(r)) add('room', where, `${cc.type} → unknown room "${r}"`);
          break;
        }
        case 'travel_to': {
          const l = id('locationId');
          if (l && !locationIds.has(l))
            add('location', where, `travel_to → unknown location "${l}"`);
          break;
        }
      }
    }
  };

  // ── Condition references (json-rules-engine trees) ──
  const checkCondition = (cond: unknown, where: string) => {
    if (!cond || typeof cond !== 'object') return;
    const c = cond as Record<string, unknown>;
    if (Array.isArray(c.all)) return c.all.forEach((sub) => checkCondition(sub, where));
    if (Array.isArray(c.any)) return c.any.forEach((sub) => checkCondition(sub, where));
    if (c.not !== undefined) return checkCondition(c.not, where);
    // Leaf: {fact, operator, value, path?}. For faction facts the id is in the
    // path ($.<factionId>); for the rest it's in value (string or array).
    const path = typeof c.path === 'string' ? c.path : undefined;
    switch (c.fact) {
      case 'quests_active':
      case 'quests_completed':
        for (const id of idsOf(c.value))
          if (!questIds.has(id)) add('quest', where, `condition → unknown quest "${id}"`);
        break;
      case 'steps_done':
        for (const pair of idsOf(c.value)) {
          const [qid, sid] = pair.split(':');
          if (!questIds.has(qid))
            add('quest', where, `condition steps_done → unknown quest "${qid}"`);
          else if (sid && !stepsByQuest.get(qid)?.has(sid))
            add('quest', where, `condition steps_done → unknown step "${qid}:${sid}"`);
        }
        break;
      case 'faction_tier':
      case 'faction_rep': {
        const fid = path?.replace(/^\$\.?/, '');
        if (fid && !factionIds.has(fid))
          add('faction', where, `condition → unknown faction "${fid}"`);
        break;
      }
      case 'party_items':
        for (const id of idsOf(c.value))
          if (!itemIds.has(id)) add('item', where, `condition → unknown item "${id}"`);
        break;
      case 'room_id':
      case 'prev_room_id':
      case 'visited_rooms':
        for (const id of idsOf(c.value))
          if (!roomIds.has(id)) add('room', where, `condition → unknown room "${id}"`);
        break;
      case 'current_town_id':
        for (const id of idsOf(c.value))
          if (!townIds.has(id)) add('town', where, `condition → unknown town "${id}"`);
        break;
      case 'npc_id':
        for (const id of idsOf(c.value))
          if (!npcIds.has(id)) add('npc', where, `condition → unknown NPC "${id}"`);
        break;
    }
  };

  // ── Walk authored content ──
  // All node ids within one NPC's dialogue tree — `goto` targets must resolve to
  // one (a dangling goto silently no-ops at runtime).
  const collectNodeIds = (responses: CampaignRoomNpcResponse[] | undefined, into: Set<string>) => {
    for (const r of responses ?? []) {
      if (r.id) into.add(r.id);
      collectNodeIds(r.responses, into);
    }
    return into;
  };
  const walkResponses = (
    responses: CampaignRoomNpcResponse[] | undefined,
    where: string,
    nodeIds: Set<string>
  ) => {
    (responses ?? []).forEach((resp, i) => {
      const w = `${where} → reply ${i}${resp.label ? ` ("${resp.label}")` : ''}`;
      if (resp.goto && !nodeIds.has(resp.goto))
        add('npc', w, `goto → unknown dialogue node "${resp.goto}"`);
      checkConsequences(resp.consequences, w);
      const check = resp.check as Record<string, unknown> | undefined;
      if (check) {
        checkConsequences(check.onSuccess, `${w} (success)`);
        checkConsequences(check.onFail, `${w} (fail)`);
      }
      if (resp.condition) checkCondition(resp.condition, `${w} [condition]`);
      walkResponses(resp.responses, w, nodeIds);
    });
  };

  for (const q of quests) {
    if (q.giverNpcId && !npcIds.has(q.giverNpcId))
      add('npc', `quest "${q.id}"`, `giverNpcId → unknown NPC "${q.giverNpcId}"`);
    if (q.factionId && !factionIds.has(q.factionId))
      add('faction', `quest "${q.id}"`, `factionId → unknown faction "${q.factionId}"`);
    if (q.actId && !actIds.has(q.actId))
      add('act', `quest "${q.id}"`, `actId → unknown act "${q.actId}"`);
    checkConsequences(q.rewards, `quest "${q.id}" reward`);
    checkLootEffect(q.startEffect, `quest "${q.id}" start loot`);
    checkLootEffect(q.completeEffect, `quest "${q.id}" complete loot`);
    for (const s of q.steps)
      checkCondition(s.condition, `quest "${q.id}" step "${s.id}" [condition]`);
  }

  for (const a of acts) {
    if (a.trigger?.questId && !questIds.has(a.trigger.questId))
      add('quest', `act "${a.id}" trigger`, `trigger → unknown quest "${a.trigger.questId}"`);
    if (a.startingRegionId && !regionIds.has(a.startingRegionId))
      add('region', `act "${a.id}"`, `startingRegionId → unknown region "${a.startingRegionId}"`);
    checkLootEffect(a.startEffect, `act "${a.id}" start loot`);
    checkLootEffect(a.endEffect, `act "${a.id}" end loot`);
    // Branching edges: target act must exist; the `when` reuses the condition walker.
    (a.transitions ?? []).forEach((t, ti) => {
      if (t.to && !actIds.has(t.to))
        add('act', `act "${a.id}" transition ${ti}`, `to → unknown act "${t.to}"`);
      checkCondition(t.when, `act "${a.id}" transition ${ti} [when]`);
    });
  }

  for (const r of rooms)
    for (const n of r.npcs ?? [])
      walkResponses(
        n.responses,
        `room "${r.id}" NPC "${n.id}"`,
        collectNodeIds(n.responses, new Set<string>())
      );

  for (const rule of rules) {
    checkCondition(rule.conditions, `rule "${rule.name}" [condition]`);
    checkConsequences(rule.consequences, `rule "${rule.name}"`);
  }

  for (const reg of regions)
    for (const s of reg.sites ?? []) {
      if (s.townId && !townIds.has(s.townId))
        add('town', `region "${reg.id}" site "${s.id}"`, `townId → unknown town "${s.townId}"`);
      if (s.entryRoomId && !roomIds.has(s.entryRoomId))
        add(
          'room',
          `region "${reg.id}" site "${s.id}"`,
          `entryRoomId → unknown room "${s.entryRoomId}"`
        );
    }

  for (const t of towns)
    for (const v of t.venues ?? []) {
      if (v.entryRoomId && !roomIds.has(v.entryRoomId))
        add(
          'room',
          `town "${t.id}" venue "${v.id}"`,
          `entryRoomId → unknown room "${v.entryRoomId}"`
        );
    }

  return issues;
}
