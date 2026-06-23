// Campaign-integrity guards for The Sky Is Falling — catching the class of
// silent, game-breaking content bugs the first playtest hit:
//   1. A wall of impassable terrain that strands sites (a full-width water row
//      walled Miller's Thicket / Vane's camp off from the hub — "No path there",
//      and the main quest could never complete).
//   2. The store_flip rule's enemy-id list drifting from the room's rat count
//      (clear the rats, but the shop never opens).
// These assert over the authored fixture, so a future edit that reintroduces
// either bug fails here instead of in someone's playthrough.

import type { Act, GameRule, Quest } from '../../types.js';
import type {
  CampaignRegion,
  CampaignRoom,
  CampaignRoomNpc,
  CampaignRoomNpcResponse,
  CampaignTown,
} from '../../services/campaignContent.js';
import { ELARA, JAREK, QUENTIN, VANE_ACT2 } from '../../campaignData/skyIsFalling/npcsAct2.js';
import { describe, expect, it } from 'vitest';
import { ACTS } from '../../campaignData/skyIsFalling/acts.js';
import { QUESTS_ACT2 } from '../../campaignData/skyIsFalling/questsAct2.js';
import { REGIONS } from '../../campaignData/skyIsFalling/regions.js';
import { REGIONS_ACT2 } from '../../campaignData/skyIsFalling/regionsAct2.js';
import { ROOMS } from '../../campaignData/skyIsFalling/rooms.js';
import { ROOMS_ACT2 } from '../../campaignData/skyIsFalling/roomsAct2.js';
import { RULES } from '../../campaignData/skyIsFalling/rules.js';
import { RULES_ACT2 } from '../../campaignData/skyIsFalling/rulesAct2.js';
import { SKY_CAMPAIGN_SECTIONS } from '../../campaignData/skyIsFalling/index.js';
import { TERRAIN } from '../../types.js';
import { TOWNS } from '../../campaignData/skyIsFalling/towns.js';
import { TOWNS_ACT2 } from '../../campaignData/skyIsFalling/townsAct2.js';

// BFS over the region's passable cells (overland `water`/`mountain` etc. block;
// an unknown cosmetic type is treated passable, matching the engine guard).
function reachableCells(region: CampaignRegion): Set<string> {
  const h = region.grid.length;
  const w = region.grid[0]?.length ?? 0;
  const passable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const t = region.grid[y]?.[x]?.t;
    return t ? (TERRAIN[t as keyof typeof TERRAIN]?.passable ?? true) : true;
  };
  const seen = new Set<string>();
  const start = region.startPos;
  if (!passable(start.x, start.y)) return seen; // start itself walled → nothing reachable
  const queue: Array<{ x: number; y: number }> = [start];
  seen.add(`${start.x},${start.y}`);
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (passable(nx, ny) && !seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

describe('The Sky Is Falling — region navigability', () => {
  it('every region site is reachable from the start position (no terrain wall strands a site)', () => {
    // Both Act I (REGIONS) and Act II (REGIONS_ACT2 — the Valerion heartland)
    // are held to the no-strand invariant: every authored site must be BFS-
    // reachable from its region's startPos over passable cells.
    for (const region of [...REGIONS, ...REGIONS_ACT2] as CampaignRegion[]) {
      const reachable = reachableCells(region);
      for (const site of region.sites ?? []) {
        expect(
          reachable.has(`${site.pos.x},${site.pos.y}`),
          `site "${site.id}" at (${site.pos.x},${site.pos.y}) is unreachable from start in region "${region.id}"`
        ).toBe(true);
      }
    }
  });
});

describe('The Sky Is Falling — room object placement', () => {
  it('every searchable object carries an in-bounds authored pos off the entry/exit cells', () => {
    // The 3D room renders objects as physical interactables. Unplaced objects
    // get auto-placed by the view, but the flagship campaign places them
    // deliberately so the flavor text and the spot agree (the Brine Barrels
    // incident, 2026-06-13: no pos → invisible in the 3D den).
    // Both Act I (ROOMS) and Act II (ROOMS_ACT2 — the capital venue + flavor-
    // site interiors) are held to the deliberate-placement invariant.
    for (const room of [...ROOMS, ...ROOMS_ACT2] as CampaignRoom[]) {
      const w = room.grid[0]?.length ?? 0;
      const h = room.grid.length;
      const blocked = new Set<string>([`${room.entryPos.x},${room.entryPos.y}`]);
      for (const ex of room.exits ?? []) blocked.add(`${ex.pos.x},${ex.pos.y}`);
      for (const n of room.npcs ?? []) if (n.pos) blocked.add(`${n.pos.x},${n.pos.y}`);
      for (const o of room.objects ?? []) {
        expect(o.pos, `object "${o.id}" in room "${room.id}" has no authored pos`).toBeDefined();
        const p = o.pos!;
        expect(p.x >= 0 && p.x < w && p.y >= 0 && p.y < h, `object "${o.id}" out of bounds`).toBe(
          true
        );
        expect(
          blocked.has(`${p.x},${p.y}`),
          `object "${o.id}" sits on an entry/exit/npc cell in room "${room.id}"`
        ).toBe(false);
        blocked.add(`${p.x},${p.y}`); // objects must not stack either
      }
    }
  });
});

describe('The Sky Is Falling — Act II venue wiring (region → town → room)', () => {
  // Guards the GEO-02 chain: a player must be able to walk from the heartland
  // region into a capital district town and step into each of its venue rooms.
  // A future edit that renames a town, drops a gate, or strands a venue room
  // fails here instead of in a playthrough (the region→town→room references are
  // by string id and have no compile-time link).
  const townsAct2 = TOWNS_ACT2 as CampaignTown[];
  const allTowns = [...(TOWNS as CampaignTown[]), ...townsAct2];
  const allRoomIds = new Set(
    [...(ROOMS as CampaignRoom[]), ...(ROOMS_ACT2 as CampaignRoom[])].map((r) => r.id)
  );
  const townIds = new Set(allTowns.map((t) => t.id));

  it('every Act II region kind:"town" site townId resolves to a real town', () => {
    for (const region of REGIONS_ACT2 as CampaignRegion[]) {
      for (const site of region.sites ?? []) {
        if (site.kind !== 'town') continue;
        expect(
          site.townId && townIds.has(site.townId),
          `region "${region.id}" town-site "${site.id}" townId "${site.townId}" has no matching town`
        ).toBe(true);
      }
    }
  });

  it('every Act II region kind:"local" site entryRoomId resolves to a real room', () => {
    for (const region of REGIONS_ACT2 as CampaignRegion[]) {
      for (const site of region.sites ?? []) {
        if (site.kind !== 'local') continue;
        expect(
          site.entryRoomId && allRoomIds.has(site.entryRoomId),
          `region "${region.id}" local-site "${site.id}" entryRoomId "${site.entryRoomId}" has no matching room`
        ).toBe(true);
      }
    }
  });

  it('every Act II town kind:"interior" venue entryRoomId resolves to a real room', () => {
    for (const town of townsAct2) {
      for (const venue of town.venues ?? []) {
        if (venue.kind !== 'interior') continue;
        expect(
          venue.entryRoomId && allRoomIds.has(venue.entryRoomId),
          `town "${town.id}" venue "${venue.id}" entryRoomId "${venue.entryRoomId}" has no matching room`
        ).toBe(true);
      }
    }
  });

  it('every Act II district town has exactly one kind:"gate" venue back to the region', () => {
    for (const town of townsAct2) {
      const gates = (town.venues ?? []).filter((v) => v.kind === 'gate');
      expect(gates.length, `town "${town.id}" must have exactly one gate venue`).toBe(1);
      // A gate is a region exit, not a room — it must NOT carry an entryRoomId.
      expect(
        gates[0]?.entryRoomId,
        `town "${town.id}" gate "${gates[0]?.id}" must not carry an entryRoomId`
      ).toBeUndefined();
    }
  });
});

describe('Act II — Weaver-cell undercroft connectivity', () => {
  // Guards the GEO-03 raid chain (D-06/D-08/D-09): the descent from the Grand
  // Library resolves, no undercroft toRoomId dangles, every chain room is
  // reachable from the approach room, and the approach links back up to the
  // Library. A future edit that strands a raid room or breaks the descent fails
  // here instead of in a playthrough (the exits are by string id, no
  // compile-time link).
  const rooms = ROOMS_ACT2 as CampaignRoom[];
  const allRoomIds = new Set([...(ROOMS as CampaignRoom[]), ...rooms].map((r) => r.id));
  const byId = new Map(rooms.map((r) => [r.id, r]));

  const LIBRARY_ID = 'grand_library_room';
  const APPROACH_ID = 'library_undercroft_approach';
  const UNDERCROFT_IDS = rooms
    .filter((r) => r.id.startsWith('library_undercroft_'))
    .map((r) => r.id);

  it('the Grand Library room has a descent exit targeting a real undercroft room (D-09)', () => {
    const library = byId.get(LIBRARY_ID);
    expect(library, `room "${LIBRARY_ID}" must exist as the descent anchor`).toBeDefined();
    const descent = (library!.exits ?? []).find(
      (ex) => ex.toRoomId && ex.toRoomId.startsWith('library_undercroft_')
    );
    expect(
      descent,
      `room "${LIBRARY_ID}" must have a toRoomId descent into the undercroft`
    ).toBeDefined();
    expect(
      descent!.toRoomId === APPROACH_ID && allRoomIds.has(descent!.toRoomId),
      `descent target "${descent?.toRoomId}" must be the undercroft approach room`
    ).toBe(true);
  });

  it('the undercroft is a chain of at least three rooms', () => {
    expect(UNDERCROFT_IDS.length).toBeGreaterThanOrEqual(3);
  });

  it('every undercroft toRoomId exit targets a real room (no dangling exits)', () => {
    for (const id of UNDERCROFT_IDS) {
      const room = byId.get(id)!;
      for (const ex of room.exits ?? []) {
        if (!ex.toRoomId) continue;
        expect(
          allRoomIds.has(ex.toRoomId),
          `undercroft room "${id}" exit toRoomId "${ex.toRoomId}" has no matching room`
        ).toBe(true);
      }
    }
  });

  it('every undercroft room is reachable from the approach room (no stranded raid room)', () => {
    // BFS over the room graph's toRoomId exits, restricted to the undercroft set.
    const undercroft = new Set(UNDERCROFT_IDS);
    const seen = new Set<string>([APPROACH_ID]);
    const queue = [APPROACH_ID];
    while (queue.length) {
      const room = byId.get(queue.shift()!)!;
      for (const ex of room.exits ?? []) {
        const next = ex.toRoomId;
        if (next && undercroft.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const id of UNDERCROFT_IDS) {
      expect(seen.has(id), `undercroft room "${id}" is unreachable from the approach room`).toBe(
        true
      );
    }
  });

  it('the approach room links back up to the Grand Library (the return path, D-09)', () => {
    const approach = byId.get(APPROACH_ID);
    expect(approach, `room "${APPROACH_ID}" must exist`).toBeDefined();
    const back = (approach!.exits ?? []).find((ex) => ex.toRoomId === LIBRARY_ID);
    expect(
      back,
      `room "${APPROACH_ID}" must have a toRoomId exit back to "${LIBRARY_ID}"`
    ).toBeDefined();
  });

  // Plan 04-01 INVERTS the old empty-but-ready guard (D-08 → D-04): the raid is
  // now placed. Each undercroft room is a fightable encounter; none places npcs.
  it('every undercroft room now places a non-empty enemies encounter (the raid, D-04)', () => {
    for (const id of UNDERCROFT_IDS) {
      const room = byId.get(id)! as CampaignRoom & { enemies?: unknown[]; npcs?: unknown[] };
      expect(
        room.enemies && room.enemies.length > 0,
        `undercroft room "${id}" must place a raid encounter (Plan 04-01)`
      ).toBe(true);
      expect(room.npcs, `undercroft room "${id}" must not place npcs`).toBeUndefined();
    }
  });

  it('the core room places exactly one Weaver Magus + two Weaver Adept, named for the clear rule', () => {
    const core = byId.get('library_undercroft_core')!;
    const placements = core.enemies ?? [];
    const magus = placements.filter((e) => e.name === 'Weaver Magus');
    const adepts = placements.filter((e) => e.name === 'Weaver Adept');
    expect(magus.length).toBe(1);
    expect((magus[0].count ?? 1) === 1).toBe(true);
    expect(magus[0].id).toBe('library_undercroft_core#magus');
    expect(adepts.length).toBe(2);
    expect(adepts.every((a) => (a.count ?? 1) === 1)).toBe(true);
    expect(adepts.map((a) => a.id).sort()).toEqual([
      'library_undercroft_core#adept1',
      'library_undercroft_core#adept2',
    ]);
  });

  // Mirrors the store_flip rule-integrity model (L270+): each clear rule's
  // enemies_killed id list must equal the placed named-id set in its room — so a
  // future edit that drifts the rule ids from the placement fails here, not in a
  // silently-never-clearing playthrough (RESEARCH Pitfall 1).
  it('each raid-clear rule keys exactly on the named placed enemies in its room', () => {
    const ruleByRoom: Array<[string, string]> = [
      ['library_undercroft_approach', 'fuel_cell_approach_clear'],
      ['library_undercroft_inner', 'fuel_cell_inner_clear'],
      ['library_undercroft_core', 'fuel_cell_core_clear'],
    ];
    const ruleNamed = new Map(RULES_ACT2.map((r) => [r.name, r] as const));
    for (const [roomId, ruleName] of ruleByRoom) {
      const room = byId.get(roomId)!;
      const placedIds = (room.enemies ?? [])
        .filter((e) => (e.count ?? 1) === 1 && typeof e.id === 'string')
        .map((e) => e.id as string)
        .sort();
      const rule = ruleNamed.get(ruleName)!;
      const conds = (rule.conditions as { all?: Array<Record<string, unknown>> }).all ?? [];
      const ruleIds = conds
        .filter((c) => c.fact === 'enemies_killed' && c.operator === 'contains')
        .map((c) => c.value as string)
        .sort();
      expect(
        ruleIds,
        `rule "${ruleName}" id list must equal the named placements in "${roomId}"`
      ).toEqual(placedIds);
    }
  });
});

describe('The Sky Is Falling — store_flip rule integrity', () => {
  it('the store_flip rule lists exactly one id per Giant Rat in store_room', () => {
    const store = (ROOMS as CampaignRoom[]).find((r) => r.id === 'store_room');
    const ratCount = store?.enemies?.find((e) => e.name === 'Giant Rat')?.count ?? 0;
    expect(ratCount).toBeGreaterThan(0);

    const flip = (RULES as GameRule[]).find((r) => r.name === 'store_flip');
    const conds = (flip?.conditions as { all?: Array<{ value?: unknown }> })?.all ?? [];
    const ratIds = conds
      .map((c) => c.value)
      .filter((v): v is string => typeof v === 'string' && v.startsWith('store_room#'));

    // One condition per spawned rat, and they're the positional ids #0..#(n-1).
    expect(ratIds.sort()).toEqual(
      Array.from({ length: ratCount }, (_, i) => `store_room#${i}`).sort()
    );
  });
});

// ─── Act II slice 1: the court-arrival friction beat ──────────────────────────
// Reads a flag key off a QuestStep.condition ({fact:'flags', path:'$.x', …}) —
// mirrors the flag() helper shape the quest modules author.
function stepFlagKey(condition: object): string | undefined {
  const c = condition as { fact?: string; path?: string };
  if (c.fact !== 'flags' || typeof c.path !== 'string') return undefined;
  const m = c.path.match(/^\$\.(.+)$/);
  return m?.[1];
}

describe('Act II — q_act2_open (court arrival)', () => {
  const quest = (QUESTS_ACT2 as Quest[]).find((q) => q.id === 'q_act2_open');

  it('q_act2_open is a startActive act2 quest given by Vane', () => {
    expect(quest, 'QUESTS_ACT2 must contain q_act2_open').toBeDefined();
    expect(quest!.startActive).toBe(true);
    expect(quest!.actId).toBe('act2');
    expect(quest!.giverNpcId).toBe('npc_vane');
  });

  it('q_act2_open has a step whose condition keys on the met_quentin flag', () => {
    const flagKeys = (quest?.steps ?? []).map((s) => stepFlagKey(s.condition));
    expect(flagKeys).toContain('met_quentin');
  });

  it('every q_act2_open step flag has a matching set_flag site in the court NPCs (flag-linkage)', () => {
    // Pitfall 3: a QuestStep.condition flag with no setting site never completes.
    // Collect set_flag keys across the court duo, then assert each step flag is set.
    const setFlagKeys = collectSetFlagKeys([VANE_ACT2, QUENTIN]);
    for (const step of quest?.steps ?? []) {
      const key = stepFlagKey(step.condition);
      if (!key) continue;
      expect(
        setFlagKeys.has(key),
        `q_act2_open step "${step.id}" flag "${key}" has no set_flag site in the court NPCs`
      ).toBe(true);
    }
  });
});

// Walk an NPC's response tree (responses may nest) and a check node's
// onSuccess/onFail, collecting every { type:'set_flag', key } target — the
// setting-site half of the flag-linkage contract.
function collectSetFlagKeys(npcs: CampaignRoomNpc[]): Set<string> {
  const keys = new Set<string>();
  const eat = (cons: Array<Record<string, unknown>> | undefined) => {
    for (const c of cons ?? []) {
      if (c.type === 'set_flag' && typeof c.key === 'string') keys.add(c.key);
    }
  };
  const walk = (responses: CampaignRoomNpcResponse[] | undefined) => {
    for (const r of responses ?? []) {
      eat(r.consequences);
      const check = r.check as
        | { onSuccess?: Array<Record<string, unknown>>; onFail?: Array<Record<string, unknown>> }
        | undefined;
      eat(check?.onSuccess);
      eat(check?.onFail);
      walk(r.responses);
    }
  };
  for (const npc of npcs) walk(npc.responses);
  return keys;
}

describe('Act II — court NPCs (Vane + Quentin)', () => {
  it('VANE_ACT2 reuses npc_vane and QUENTIN is npc_quentin, both friendly', () => {
    expect(VANE_ACT2.id).toBe('npc_vane');
    expect(VANE_ACT2.attitude).toBe('friendly');
    expect(QUENTIN.id).toBe('npc_quentin');
    expect(QUENTIN.attitude).toBe('friendly');
  });

  it('QUENTIN’s opening response sets met_quentin (meeting him is the trigger)', () => {
    const setFlagKeys = collectSetFlagKeys([QUENTIN]);
    expect(setFlagKeys.has('met_quentin')).toBe(true);
  });

  it('no court-NPC check converts a quest-giver to hostile on failure (retry-friendly)', () => {
    // Lorien incident discipline: a failed check must NOT set_npc_attitude→hostile.
    const json = JSON.stringify([VANE_ACT2, QUENTIN]);
    const hostileFlip = /"type"\s*:\s*"set_npc_attitude"[^}]*"attitude"\s*:\s*"hostile"/.test(json);
    expect(hostileFlip, 'court NPCs must not flip to hostile on a failed check').toBe(false);
  });

  it('VANE_ACT2 authors no silverford_outcome / war-state responses (deferred to Phase 5)', () => {
    const json = JSON.stringify(VANE_ACT2);
    expect(json.includes('silverford_outcome')).toBe(false);
  });
});

describe('Act II — valerion_court_room (the friction tableau)', () => {
  const court = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'valerion_court_room');

  it('the court room plays a non-empty onEnter friction tableau', () => {
    expect(court, 'valerion_court_room must exist').toBeDefined();
    const onEnter = Array.isArray(court!.onEnter)
      ? court!.onEnter
      : court!.onEnter
        ? [court!.onEnter]
        : [];
    expect(onEnter.length).toBeGreaterThan(0);
    expect(onEnter.every((line) => line.trim().length > 0)).toBe(true);
  });

  it('the court room embeds Vane + Quentin on valid, non-colliding, in-bounds cells', () => {
    const w = court!.grid[0]?.length ?? 0;
    const h = court!.grid.length;
    const blocked = new Set<string>([`${court!.entryPos.x},${court!.entryPos.y}`]);
    for (const ex of court!.exits ?? []) blocked.add(`${ex.pos.x},${ex.pos.y}`);

    const ids = (court!.npcs ?? []).map((n) => n.id);
    expect(ids).toContain('npc_vane');
    expect(ids).toContain('npc_quentin');

    for (const n of court!.npcs ?? []) {
      expect(n.pos, `court npc "${n.id}" has no pos`).toBeDefined();
      const p = n.pos!;
      expect(p.x >= 0 && p.x < w && p.y >= 0 && p.y < h, `court npc "${n.id}" out of bounds`).toBe(
        true
      );
      expect(
        blocked.has(`${p.x},${p.y}`),
        `court npc "${n.id}" sits on an entry/exit/other-npc cell`
      ).toBe(false);
      blocked.add(`${p.x},${p.y}`); // npcs must not stack either
    }
  });
});

describe('Act II — index.ts quests-section wiring (Pitfall 2)', () => {
  it('the seeded quests section concatenates QUESTS_ACT2 (q_act2_open is present)', () => {
    const questsSection = SKY_CAMPAIGN_SECTIONS.find((s) => s.section === 'quests');
    expect(questsSection, 'a quests section must be seeded').toBeDefined();
    const quests = questsSection!.value as Quest[];
    expect(quests.some((q) => q.id === 'q_act2_open')).toBe(true);
  });
});

// ─── Act II slice 2: the "Mythic Geometry" library decode ─────────────────────
// Flatten an NPC's response tree (responses may nest) into a single array so the
// decode guards can scan every authored node, not just top-level ones.
function flattenResponses(npc: CampaignRoomNpc): CampaignRoomNpcResponse[] {
  const out: CampaignRoomNpcResponse[] = [];
  const walk = (responses: CampaignRoomNpcResponse[] | undefined) => {
    for (const r of responses ?? []) {
      out.push(r);
      walk(r.responses);
    }
  };
  walk(npc.responses);
  return out;
}

// Does a response (its consequences and/or a check's onSuccess/onFail) fire a
// set_flag for `key`? — the setting-site test the decode guards lean on.
function setsFlag(r: CampaignRoomNpcResponse, key: string): boolean {
  const hit = (cons: Array<Record<string, unknown>> | undefined) =>
    (cons ?? []).some((c) => c.type === 'set_flag' && c.key === key);
  const check = r.check as
    | { onSuccess?: Array<Record<string, unknown>>; onFail?: Array<Record<string, unknown>> }
    | undefined;
  return hit(r.consequences) || hit(check?.onSuccess) || hit(check?.onFail);
}

// Collect the leaf conditions of a response.condition (handles {all}/{any}/{not}
// nesting) — lets a guard ask "does this line reference flag X / item Y at all?".
function leafConditions(condition: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (c: unknown) => {
    if (c === null || typeof c !== 'object') return;
    const obj = c as Record<string, unknown>;
    if (Array.isArray(obj.all)) return obj.all.forEach(walk);
    if (Array.isArray(obj.any)) return obj.any.forEach(walk);
    if (obj.not !== undefined) return walk(obj.not);
    out.push(obj);
  };
  walk(condition);
  return out;
}

// Does a response's condition reference the chrono_shard party-item (any path
// to a `party_items … chrono_shard` leaf)? — used to prove the safety net.
function gatesOnChronoShard(r: CampaignRoomNpcResponse): boolean {
  return leafConditions(r.condition).some(
    (leaf) => leaf.fact === 'party_items' && leaf.value === 'chrono_shard'
  );
}

// Does a response's condition reference the martha_hint flag at all?
function gatesOnMarthaHint(r: CampaignRoomNpcResponse): boolean {
  return leafConditions(r.condition).some(
    (leaf) => leaf.fact === 'flags' && leaf.path === '$.martha_hint'
  );
}

describe('Act II — q_library gating + the Mythic Geometry decode (ELARA)', () => {
  const responses = flattenResponses(ELARA);

  it('ELARA is npc_elara, friendly', () => {
    expect(ELARA.id).toBe('npc_elara');
    expect(ELARA.attitude).toBe('friendly');
  });

  it('ELARA grants library_access + starts q_library, gated on met_quentin', () => {
    const grant = responses.find((r) =>
      (r.consequences ?? []).some((c) => c.type === 'start_quest' && c.questId === 'q_library')
    );
    expect(grant, 'ELARA must fire start_quest q_library on some response').toBeDefined();
    // The grant is gated on met_quentin (slice-1 flag).
    expect(
      leafConditions(grant!.condition).some(
        (leaf) =>
          leaf.fact === 'flags' &&
          leaf.path === '$.met_quentin' &&
          leaf.operator === 'equal' &&
          leaf.value === true
      ),
      'the q_library grant must be gated on met_quentin === true'
    ).toBe(true);
    // It also sets library_access.
    expect(setsFlag(grant!, 'library_access'), 'the grant must set library_access').toBe(true);
  });

  it('every decode check rolls persuasion (never arcana/history/investigation)', () => {
    // The check.skill union is CHA-only; an arcana/history/investigation skill
    // would silently roll off Charisma (Pitfall 1). Assert each check's skill is
    // persuasion, and that none of the wrong skills appear as a check.skill.
    const checks = responses
      .map((r) => r.check as { skill?: string } | undefined)
      .filter((c): c is { skill?: string } => !!c);
    expect(checks.length, 'ELARA must author at least one decode check').toBeGreaterThan(0);
    for (const c of checks) {
      expect(c.skill, `decode check skill "${c.skill}" must be persuasion`).toBe('persuasion');
    }
  });

  it('no decode check flips Elara to hostile on failure (retry-friendly, LORIEN idiom)', () => {
    const json = JSON.stringify(ELARA);
    const hostileFlip = /"type"\s*:\s*"set_npc_attitude"[^}]*"attitude"\s*:\s*"hostile"/.test(json);
    expect(hostileFlip, 'ELARA must not flip to hostile on a failed decode check').toBe(false);
    // And no decode check carries `once` — they must be retriable.
    for (const r of responses) {
      if (r.check) {
        expect(r.once, `decode check "${r.id}" must not be once (retry-friendly)`).not.toBe(true);
      }
    }
  });

  it('coords_decoded is set on BOTH a martha_hint-gated line and a neutral line (both-paths)', () => {
    const setters = responses.filter((r) => setsFlag(r, 'coords_decoded'));
    expect(setters.length, 'at least two lines must set coords_decoded').toBeGreaterThanOrEqual(2);
    const marthaLine = setters.find((r) => gatesOnMarthaHint(r));
    const neutralLine = setters.find((r) => !gatesOnMarthaHint(r));
    expect(
      marthaLine,
      'a martha_hint-gated line must set coords_decoded (Act I callback)'
    ).toBeDefined();
    expect(
      neutralLine,
      'a neutral (no-martha_hint) line must also set coords_decoded'
    ).toBeDefined();
  });

  it('coords_decoded is reachable WITHOUT the chrono_shard (safety net)', () => {
    // At least one coords_decoded setter must NOT gate on chrono_shard, and its
    // whole condition chain must be shard-free — so a shard-less party reaches it.
    const setters = responses.filter((r) => setsFlag(r, 'coords_decoded'));
    const shardFree = setters.filter((r) => !gatesOnChronoShard(r));
    expect(
      shardFree.length,
      'a coords_decoded path must exist that does not gate on chrono_shard'
    ).toBeGreaterThan(0);
  });
});

describe('Act II — q_library quest shape + flag-linkage', () => {
  const quest = (QUESTS_ACT2 as Quest[]).find((q) => q.id === 'q_library');

  it('q_library is an Elara-given act2 quest that is NOT startActive', () => {
    expect(quest, 'QUESTS_ACT2 must contain q_library').toBeDefined();
    expect(quest!.title).toBe('Mythic Geometry');
    expect(quest!.actId).toBe('act2');
    expect(quest!.giverNpcId).toBe('npc_elara');
    // Started by Elara's start_quest, NOT seeded active at act entry.
    expect(quest!.startActive).not.toBe(true);
  });

  it('q_library has a final step whose condition keys on coords_decoded', () => {
    const steps = quest?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    const finalKey = stepFlagKey(steps[steps.length - 1].condition);
    expect(finalKey).toBe('coords_decoded');
  });

  it('every q_library step flag has a matching set_flag site in ELARA (flag-linkage)', () => {
    // Pitfall 3: a QuestStep.condition flag with no setting site never completes.
    const setFlagKeys = collectSetFlagKeys([ELARA]);
    for (const step of quest?.steps ?? []) {
      const key = stepFlagKey(step.condition);
      if (!key) continue;
      expect(
        setFlagKeys.has(key),
        `q_library step "${step.id}" flag "${key}" has no set_flag site in ELARA`
      ).toBe(true);
    }
  });
});

describe('Act II — grand_library_room (Elara embedded, descent intact)', () => {
  const library = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'grand_library_room');

  it('the library room embeds Elara on a valid, non-colliding, in-bounds cell', () => {
    expect(library, 'grand_library_room must exist').toBeDefined();
    const w = library!.grid[0]?.length ?? 0;
    const h = library!.grid.length;
    const blocked = new Set<string>([`${library!.entryPos.x},${library!.entryPos.y}`]);
    for (const ex of library!.exits ?? []) blocked.add(`${ex.pos.x},${ex.pos.y}`);

    const elara = (library!.npcs ?? []).find((n) => n.id === 'npc_elara');
    expect(elara, 'grand_library_room must embed npc_elara').toBeDefined();
    const p = elara!.pos!;
    expect(p, 'Elara must have an authored pos').toBeDefined();
    expect(
      p.x >= 0 && p.x < w && p.y >= 0 && p.y < h,
      `Elara pos (${p.x},${p.y}) out of bounds on the ${w}×${h} grid`
    ).toBe(true);
    expect(
      blocked.has(`${p.x},${p.y}`),
      `Elara sits on the entry (${library!.entryPos.x},${library!.entryPos.y}) or a descent-exit cell`
    ).toBe(false);
  });

  it('the library keeps BOTH exits — the ascends-out AND the undercroft descent (D-09)', () => {
    const exits = library!.exits ?? [];
    expect(
      exits.some((ex) => ex.ascends === true),
      'the ascends-out exit must remain'
    ).toBe(true);
    expect(
      exits.some((ex) => ex.toRoomId === 'library_undercroft_approach'),
      'the toRoomId descent into the undercroft must remain (Phase 2 chain)'
    ).toBe(true);
  });
});

// ─── Act II slice (Plan 04-01): the q_fuel_cell raid — RULES_ACT2 ──────────────
// The combat→flag wiring for the Weaver-cell raid. Each undercroft room's clear
// rule keys on its named enemy ids (enemies_killed contains 'roomId#name') and
// sets the room-clear flag; the core rule writes relic_fuel_cell='party'. Without
// this module seeded into the rules section, every raid clear silently no-ops
// (RESEARCH Pitfall 2). These guards mirror the store_flip integrity model.

// Collect the set_flag consequences (key + value) a rule fires.
function ruleSetFlags(rule: GameRule | undefined): Array<{ key: string; value: unknown }> {
  return (rule?.consequences ?? [])
    .filter(
      (c): c is Extract<GameRule['consequences'][number], { type: 'set_flag' }> =>
        c.type === 'set_flag'
    )
    .map((c) => ({ key: c.key, value: c.value }));
}

// Collect the enemies_killed id strings a rule's conditions require.
function ruleKilledIds(rule: GameRule | undefined): string[] {
  const conds = (rule?.conditions as { all?: Array<Record<string, unknown>> })?.all ?? [];
  return conds
    .filter((c) => c.fact === 'enemies_killed' && c.operator === 'contains')
    .map((c) => c.value)
    .filter((v): v is string => typeof v === 'string');
}

describe('Act II — RULES_ACT2 raid-clear rules (Plan 04-01)', () => {
  const byName = new Map(RULES_ACT2.map((r) => [r.name, r] as const));

  it('exports the three raid-clear rules', () => {
    expect(byName.has('fuel_cell_approach_clear')).toBe(true);
    expect(byName.has('fuel_cell_inner_clear')).toBe(true);
    expect(byName.has('fuel_cell_core_clear')).toBe(true);
  });

  it('the approach rule sets undercroft_approach_clear, once', () => {
    const r = byName.get('fuel_cell_approach_clear');
    expect(r!.once).toBe(true);
    expect(
      ruleSetFlags(r).some((f) => f.key === 'undercroft_approach_clear' && f.value === true)
    ).toBe(true);
  });

  it('the inner rule sets undercroft_inner_clear, once', () => {
    const r = byName.get('fuel_cell_inner_clear');
    expect(r!.once).toBe(true);
    expect(
      ruleSetFlags(r).some((f) => f.key === 'undercroft_inner_clear' && f.value === true)
    ).toBe(true);
  });

  it('the core rule writes relic_fuel_cell = string "party", once', () => {
    const r = byName.get('fuel_cell_core_clear');
    expect(r!.once).toBe(true);
    const relic = ruleSetFlags(r).find((f) => f.key === 'relic_fuel_cell');
    expect(relic, 'core rule must set relic_fuel_cell').toBeDefined();
    expect(relic!.value).toBe('party');
  });

  it('the core rule keys on the three named core enemies (no positional #0/#1 ids)', () => {
    const ids = ruleKilledIds(byName.get('fuel_cell_core_clear'));
    expect(ids.sort()).toEqual(
      [
        'library_undercroft_core#adept1',
        'library_undercroft_core#adept2',
        'library_undercroft_core#magus',
      ].sort()
    );
  });
});

describe('Act II — index.ts rules-section wiring (Pitfall 2)', () => {
  it('the seeded rules section concatenates RULES_ACT2 AND keeps Act I rules', () => {
    const rulesSection = SKY_CAMPAIGN_SECTIONS.find((s) => s.section === 'rules');
    expect(rulesSection, 'a rules section must be seeded').toBeDefined();
    const rules = rulesSection!.value as GameRule[];
    // Act II raid rules present…
    expect(rules.some((r) => r.name === 'fuel_cell_approach_clear')).toBe(true);
    expect(rules.some((r) => r.name === 'fuel_cell_inner_clear')).toBe(true);
    expect(rules.some((r) => r.name === 'fuel_cell_core_clear')).toBe(true);
    // …and the Act I rules still seeded (concat, not replace).
    expect(rules.some((r) => r.name === 'store_flip')).toBe(true);
  });
});

// The set_flag keys any RULES_ACT2 rule writes — the rule half of the
// flag-linkage contract (the raid flags are set by rules, not dialogue).
function rulesAct2SetFlagKeys(): Set<string> {
  const keys = new Set<string>();
  for (const r of RULES_ACT2) {
    for (const c of r.consequences ?? []) {
      if (c.type === 'set_flag') keys.add(c.key);
    }
  }
  return keys;
}

describe('Act II — q_fuel_cell quest shape + flag-linkage (Plan 04-01)', () => {
  const quest = (QUESTS_ACT2 as Quest[]).find((q) => q.id === 'q_fuel_cell');

  it('q_fuel_cell is an Elara-given act2 quest that is NOT startActive', () => {
    expect(quest, 'QUESTS_ACT2 must contain q_fuel_cell').toBeDefined();
    expect(quest!.title).toBe('The Heart of the Saint');
    expect(quest!.actId).toBe('act2');
    expect(quest!.giverNpcId).toBe('npc_elara');
    expect(quest!.startActive).not.toBe(true);
  });

  it('q_fuel_cell has a final step keyed on relic_fuel_cell', () => {
    const steps = quest?.steps ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const finalKey = stepFlagKey(steps[steps.length - 1].condition);
    expect(finalKey).toBe('relic_fuel_cell');
  });

  it('every q_fuel_cell step flag has a writing site (ELARA dialogue OR a RULES_ACT2 rule)', () => {
    // Pitfall 3 (flag-linkage): the raid flags are written by RULES_ACT2, so the
    // setting-site set spans both ELARA's tree and the rules module.
    const setSites = new Set<string>([...collectSetFlagKeys([ELARA]), ...rulesAct2SetFlagKeys()]);
    for (const step of quest?.steps ?? []) {
      const key = stepFlagKey(step.condition);
      if (!key) continue;
      expect(
        setSites.has(key),
        `q_fuel_cell step "${step.id}" flag "${key}" has no writing site (dialogue or rule)`
      ).toBe(true);
    }
  });
});

describe('Act II — ELARA hands off q_fuel_cell on coords_decoded (D-03)', () => {
  const responses = flattenResponses(ELARA);

  it('ELARA fires start_quest q_fuel_cell gated on coords_decoded', () => {
    const handoff = responses.find((r) =>
      (r.consequences ?? []).some((c) => c.type === 'start_quest' && c.questId === 'q_fuel_cell')
    );
    expect(handoff, 'ELARA must fire start_quest q_fuel_cell on some response').toBeDefined();
    expect(
      leafConditions(handoff!.condition).some(
        (leaf) =>
          leaf.fact === 'flags' &&
          leaf.path === '$.coords_decoded' &&
          leaf.operator === 'equal' &&
          leaf.value === true
      ),
      'the q_fuel_cell handoff must be gated on coords_decoded === true'
    ).toBe(true);
  });
});

describe('Act II — relic_fuel_cell outcome contract (Task 4, A4 resolution)', () => {
  it('the ONLY authored relic_fuel_cell value across Act II content is "party" (no "sect" write)', () => {
    // D-02 / A4: the engine surfaces a game-over on TPK/retreat — it does NOT
    // auto-write relic_fuel_cell='sect'. So `party` is the sole authored write
    // (the core-clear rule); `sect` is the read-as-NOT-'party' fallback the
    // Phase-5 ending interprets. Scan all Act II content for any 'sect' write.
    const blob = JSON.stringify([RULES_ACT2, QUESTS_ACT2, ELARA, QUENTIN, VANE_ACT2]);
    const sectWrite = /"key"\s*:\s*"relic_fuel_cell"[\s\S]{0,40}?"value"\s*:\s*"sect"/.test(blob);
    expect(sectWrite, 'no Act II rule or dialogue may write relic_fuel_cell="sect"').toBe(false);

    // And confirm the only authored value is 'party'.
    const partyWrite = RULES_ACT2.some((r) =>
      (r.consequences ?? []).some(
        (c) => c.type === 'set_flag' && c.key === 'relic_fuel_cell' && c.value === 'party'
      )
    );
    expect(partyWrite, 'the core-clear rule must write relic_fuel_cell="party"').toBe(true);
  });
});

// ─── Act II slice (Plan 04-02): the Jarek ball ambush mechanism (Task 1) ──────
// PLANNER-RESOLVED engine read (Open Q1 / RESEARCH Assumption A1, Pitfall 3):
// combat begins ONLY via runCombatStart, which fires on a PC attack/spell against
// an enemy already materialized in the current room (ctx.livingEnemiesInRoom). A
// dialogue `spawn_enemy` consequence merely adds a stray grid entity (synthetic
// id `${enemyId}@${roomId}#${Date.now()}`, hardcoded pos 5,5) and does NOT start
// initiative — and its synthetic id can never be a clear-rule target. THEREFORE
// the Jarek ambush is authored as ROOM-PLACED enemies in valerion_ball_room
// (D-08), NOT via spawn_enemy-from-dialogue. This guard locks that decision: no
// Act II NPC dialogue may drive the Jarek ambush through a spawn_enemy
// consequence — the fragile path is forbidden by construction.
// Scan an NPC's full response tree (incl. check onSuccess/onFail) for a
// spawn_enemy consequence — the fragile-path detector the ambush guard leans on.
function firesSpawnEnemy(npc: CampaignRoomNpc): boolean {
  const hasSpawn = (cons: Array<Record<string, unknown>> | undefined): boolean =>
    (cons ?? []).some((c) => c.type === 'spawn_enemy');
  const walk = (responses: CampaignRoomNpcResponse[] | undefined): boolean => {
    for (const r of responses ?? []) {
      if (hasSpawn(r.consequences)) return true;
      const check = r.check as
        | { onSuccess?: Array<Record<string, unknown>>; onFail?: Array<Record<string, unknown>> }
        | undefined;
      if (hasSpawn(check?.onSuccess) || hasSpawn(check?.onFail)) return true;
      if (walk(r.responses)) return true;
    }
    return false;
  };
  return walk(npc.responses);
}

describe('Act II — the Jarek ambush is room-placed, not dialogue spawn_enemy (Plan 04-02, Task 1)', () => {
  it('no Act II NPC dialogue fires a spawn_enemy consequence (the ambush is room-placed)', () => {
    // The ambush troopers live in the ball room's `enemies` array (combat starts
    // the normal PC-attack way); a spawn_enemy in dialogue would be the fragile,
    // never-clearing path the engine read rules out (Pitfall 3). This guard covers
    // every authored Act II NPC and stays valid as the Jarek tree is added.
    const act2Npcs: CampaignRoomNpc[] = [VANE_ACT2, QUENTIN, ELARA, JAREK];
    for (const npc of act2Npcs) {
      expect(
        firesSpawnEnemy(npc),
        `Act II NPC "${npc.id}" must not drive an ambush via spawn_enemy (the Jarek ambush is room-placed; engine read, Pitfall 3)`
      ).toBe(false);
    }
  });

  it('the ball room places the Jarek ambush troopers as room enemies (the room-placed path)', () => {
    // The mechanism's positive half: valerion_ball_room carries the ambush in its
    // `enemies` array, so attacking a trooper starts combat the normal PC-attack way.
    const ball = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'valerion_ball_room') as
      | (CampaignRoom & { enemies?: Array<{ name: string; id?: string }> })
      | undefined;
    expect(ball, 'valerion_ball_room must exist').toBeDefined();
    expect(
      (ball!.enemies ?? []).length,
      'the ball room must place the ambush troopers as room enemies'
    ).toBeGreaterThan(0);
  });
});

// ─── Act II slice (Plan 04-02): the Jarek negotiation tree (Task 2) ───────────
describe('Act II — JAREK negotiation tree (allied/wary/hostile), retry-friendly', () => {
  const responses = flattenResponses(JAREK);

  it('JAREK is npc_jarek, friendly (the menu opens with no CHA gate)', () => {
    expect(JAREK.id).toBe('npc_jarek');
    expect(JAREK.attitude).toBe('friendly');
  });

  it('every JAREK check rolls persuasion (never arcana/investigation — CHA-only union)', () => {
    const checks = responses
      .map((r) => r.check as { skill?: string } | undefined)
      .filter((c): c is { skill?: string } => !!c);
    expect(checks.length, 'JAREK must author at least one negotiation check').toBeGreaterThan(0);
    for (const c of checks) {
      expect(c.skill, `JAREK check skill "${c.skill}" must be persuasion`).toBe('persuasion');
    }
  });

  it('no JAREK check flips to hostile on failure and none is `once` (retry-friendly, LORIEN idiom)', () => {
    // A failed roll must NOT set hostile and must NOT be the only path forward.
    const json = JSON.stringify(JAREK);
    const hostileFlip = /"type"\s*:\s*"set_npc_attitude"[^}]*"attitude"\s*:\s*"hostile"/.test(json);
    expect(hostileFlip, 'JAREK must not flip to hostile via a check (set_npc_attitude)').toBe(
      false
    );
    for (const r of responses) {
      if (r.check) {
        expect(r.once, `JAREK check "${r.id}" must not be once (retry-friendly)`).not.toBe(true);
        // onFail must set NO flag — a failed roll never decides jarek_stance.
        const onFail = (r.check as { onFail?: Array<Record<string, unknown>> }).onFail ?? [];
        expect(
          onFail.some((c) => c.type === 'set_flag'),
          `JAREK check "${r.id}" onFail must not set any flag (a failed roll decides nothing)`
        ).toBe(false);
      }
    }
  });

  it('the persuasion check sets jarek_stance=allied ONLY on success (onSuccess), never on fail', () => {
    const checkResp = responses.find((r) => r.check);
    expect(checkResp, 'JAREK must have a negotiation check').toBeDefined();
    const check = checkResp!.check as {
      onSuccess?: Array<Record<string, unknown>>;
      onFail?: Array<Record<string, unknown>>;
    };
    expect(
      (check.onSuccess ?? []).some(
        (c) => c.type === 'set_flag' && c.key === 'jarek_stance' && c.value === 'allied'
      ),
      'the check onSuccess must set jarek_stance=allied'
    ).toBe(true);
    expect(
      (check.onFail ?? []).some((c) => c.type === 'set_flag' && c.key === 'jarek_stance'),
      'the check onFail must NOT set jarek_stance'
    ).toBe(false);
  });

  it('jarek_stance is authored to all three values allied/wary/hostile across distinct paths', () => {
    // Collect every (path, value) jarek_stance write across the tree.
    const stanceValues = new Set<string>();
    const eat = (cons: Array<Record<string, unknown>> | undefined) => {
      for (const c of cons ?? []) {
        if (c.type === 'set_flag' && c.key === 'jarek_stance' && typeof c.value === 'string') {
          stanceValues.add(c.value);
        }
      }
    };
    for (const r of responses) {
      eat(r.consequences);
      const check = r.check as
        | { onSuccess?: Array<Record<string, unknown>>; onFail?: Array<Record<string, unknown>> }
        | undefined;
      eat(check?.onSuccess);
      eat(check?.onFail);
    }
    expect([...stanceValues].sort()).toEqual(['allied', 'hostile', 'wary']);
  });

  it('the hostile path is a SEPARATE player-chosen option (not the check), and cues the ambush', () => {
    // hostile is set by a plain `consequences` option, NOT inside a check's
    // onSuccess/onFail — so it can only be reached by deliberately picking it.
    const hostileViaConsequences = responses.some(
      (r) =>
        !r.check &&
        (r.consequences ?? []).some(
          (c) => c.type === 'set_flag' && c.key === 'jarek_stance' && c.value === 'hostile'
        )
    );
    expect(
      hostileViaConsequences,
      'jarek_stance=hostile must be a separate player-chosen option, not a check outcome'
    ).toBe(true);
    // And that same option adds an ambush narrative beat (the cue to draw steel).
    const hostileOpt = responses.find((r) =>
      (r.consequences ?? []).some(
        (c) => c.type === 'set_flag' && c.key === 'jarek_stance' && c.value === 'hostile'
      )
    );
    expect(
      (hostileOpt!.consequences ?? []).some((c) => c.type === 'add_narrative'),
      'the hostile option must add an ambush narrative beat'
    ).toBe(true);
  });
});

describe('Act II — valerion_ball_room (Jarek embedded, ambush room-placed)', () => {
  const ball = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'valerion_ball_room') as
    | (CampaignRoom & { enemies?: Array<{ name: string; count?: number; id?: string }> })
    | undefined;

  it('embeds Jarek on a valid, in-bounds cell off the entry/exit (Pitfall 4)', () => {
    expect(ball, 'valerion_ball_room must exist').toBeDefined();
    const w = ball!.grid[0]?.length ?? 0;
    const h = ball!.grid.length;
    const blocked = new Set<string>([`${ball!.entryPos.x},${ball!.entryPos.y}`]);
    for (const ex of ball!.exits ?? []) blocked.add(`${ex.pos.x},${ex.pos.y}`);
    const jarek = (ball!.npcs ?? []).find((n) => n.id === 'npc_jarek');
    expect(jarek, 'valerion_ball_room must embed npc_jarek').toBeDefined();
    const p = jarek!.pos!;
    expect(p, 'Jarek must have an authored pos').toBeDefined();
    expect(
      p.x >= 0 && p.x < w && p.y >= 0 && p.y < h,
      `Jarek pos (${p.x},${p.y}) out of bounds on the ${w}×${h} grid`
    ).toBe(true);
    expect(
      blocked.has(`${p.x},${p.y}`),
      `Jarek sits on the entry/exit cell (${ball!.entryPos.x},${ball!.entryPos.y})`
    ).toBe(false);
  });

  it('places the ambush troopers with the two count-1 named ids the clear rule keys on, exact reskin names', () => {
    const placements = ball!.enemies ?? [];
    // The named, count-1 ids (clear-rule targets).
    const namedIds = placements
      .filter((e) => (e.count ?? 1) === 1 && typeof e.id === 'string')
      .map((e) => e.id as string)
      .sort();
    expect(namedIds).toEqual(['valerion_ball_room#trooper1', 'valerion_ball_room#trooper2']);
    // Every placement uses an exact Act II reskin clone name (never a bare SRD name).
    const RESKIN = new Set(['Subverted Vanguard', 'Subverted Sentry']);
    for (const e of placements) {
      expect(RESKIN.has(e.name), `ambush enemy "${e.name}" must be an Act II reskin name`).toBe(
        true
      );
    }
  });
});

// ─── Act II slice (Plan 04-02): jarek_ambush_clear rule + q_jarek (Task 3) ────

// Pull every leaf condition that references the jarek_stance flag out of a quest
// step's (possibly all/any/not-nested) condition — used to prove a step keys on
// the stance even when it's an `any`-of-values shape (which stepFlagKey can't read).
function stepReferencesFlag(condition: unknown, key: string): boolean {
  return leafConditions(condition).some(
    (leaf) => leaf.fact === 'flags' && leaf.path === `$.${key}`
  );
}

describe('Act II — jarek_ambush_clear rule integrity (Plan 04-02, Task 3)', () => {
  const byName = new Map(RULES_ACT2.map((r) => [r.name, r] as const));

  it('jarek_ambush_clear is appended to RULES_ACT2 (alongside the fuel-cell rules)', () => {
    expect(byName.has('jarek_ambush_clear')).toBe(true);
    // The Plan 01 fuel-cell rules are still present (append, not replace).
    expect(byName.has('fuel_cell_core_clear')).toBe(true);
  });

  it('jarek_ambush_clear sets jarek_ambush_cleared=true, once, and does NOT touch jarek_stance', () => {
    const r = byName.get('jarek_ambush_clear');
    expect(r!.once).toBe(true);
    expect(
      ruleSetFlags(r).some((f) => f.key === 'jarek_ambush_cleared' && f.value === true),
      'must set jarek_ambush_cleared=true'
    ).toBe(true);
    // No authored hostility on the quest-giver: the rule never writes jarek_stance.
    expect(
      ruleSetFlags(r).some((f) => f.key === 'jarek_stance'),
      'the ambush-clear rule must not write jarek_stance (stance is dialogue-only)'
    ).toBe(false);
  });

  it('jarek_ambush_clear keys exactly on the two named ball troopers placed in the room', () => {
    // store_flip integrity: the rule's id list must equal the room's count-1 named
    // placements — so a drift between rule and placement fails here, not in a
    // silently-never-clearing playthrough (RESEARCH Pitfall 1).
    const ball = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'valerion_ball_room') as
      | (CampaignRoom & { enemies?: Array<{ name: string; count?: number; id?: string }> })
      | undefined;
    const placedIds = (ball!.enemies ?? [])
      .filter((e) => (e.count ?? 1) === 1 && typeof e.id === 'string')
      .map((e) => e.id as string)
      .sort();
    const ruleIds = ruleKilledIds(byName.get('jarek_ambush_clear')).sort();
    expect(ruleIds).toEqual(placedIds);
  });

  it('the seeded rules section concatenates jarek_ambush_clear (Pitfall 2)', () => {
    const rulesSection = SKY_CAMPAIGN_SECTIONS.find((s) => s.section === 'rules');
    const rules = rulesSection!.value as GameRule[];
    expect(rules.some((r) => r.name === 'jarek_ambush_clear')).toBe(true);
  });
});

describe('Act II — q_jarek quest shape + flag-linkage (Plan 04-02, Task 3)', () => {
  const quest = (QUESTS_ACT2 as Quest[]).find((q) => q.id === 'q_jarek');

  it('q_jarek is a Jarek-given act2 quest that is NOT startActive', () => {
    expect(quest, 'QUESTS_ACT2 must contain q_jarek').toBeDefined();
    expect(quest!.title).toBe('The Inquisitor’s Suspicion');
    expect(quest!.actId).toBe('act2');
    expect(quest!.giverNpcId).toBe('npc_jarek');
    expect(quest!.startActive).not.toBe(true);
  });

  it('q_jarek has a step keyed on jarek_stance', () => {
    const steps = quest?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    expect(
      steps.some((s) => stepReferencesFlag(s.condition, 'jarek_stance')),
      'q_jarek must have a step whose condition keys on jarek_stance'
    ).toBe(true);
  });

  it('the jarek_stance step covers all three authored stance values (allied/wary/hostile)', () => {
    // The `any`-of-values shape closes the quest on whichever outcome the player
    // reached — so every JAREK-set stance value must be a completing condition.
    const step = (quest?.steps ?? []).find((s) => stepReferencesFlag(s.condition, 'jarek_stance'));
    const stanceValues = leafConditions(step!.condition)
      .filter((leaf) => leaf.fact === 'flags' && leaf.path === '$.jarek_stance')
      .map((leaf) => leaf.value as string)
      .sort();
    expect(stanceValues).toEqual(['allied', 'hostile', 'wary']);
  });

  it('every q_jarek stance value has a matching set_flag site in JAREK (flag-linkage)', () => {
    // Pitfall 3: a step value with no dialogue writer never completes. Collect the
    // (key,value) jarek_stance writes JAREK authors and assert each step value is set.
    const writtenStances = new Set<string>();
    const eat = (cons: Array<Record<string, unknown>> | undefined) => {
      for (const c of cons ?? []) {
        if (c.type === 'set_flag' && c.key === 'jarek_stance' && typeof c.value === 'string') {
          writtenStances.add(c.value);
        }
      }
    };
    for (const r of flattenResponses(JAREK)) {
      eat(r.consequences);
      const check = r.check as
        | { onSuccess?: Array<Record<string, unknown>>; onFail?: Array<Record<string, unknown>> }
        | undefined;
      eat(check?.onSuccess);
      eat(check?.onFail);
    }
    const step = (quest?.steps ?? []).find((s) => stepReferencesFlag(s.condition, 'jarek_stance'));
    const stepValues = leafConditions(step!.condition)
      .filter((leaf) => leaf.fact === 'flags' && leaf.path === '$.jarek_stance')
      .map((leaf) => leaf.value as string);
    for (const v of stepValues) {
      expect(
        writtenStances.has(v),
        `q_jarek step value jarek_stance="${v}" has no set_flag site in JAREK`
      ).toBe(true);
    }
  });

  it('the seeded quests section concatenates q_jarek (Pitfall 2)', () => {
    const questsSection = SKY_CAMPAIGN_SECTIONS.find((s) => s.section === 'quests');
    const quests = questsSection!.value as Quest[];
    expect(quests.some((q) => q.id === 'q_jarek')).toBe(true);
  });
});

// ─── Act II slice (Plan 04-03): the Quentin "Old Money" tree (Task 1) ─────────
describe('Act II — QUENTIN "Old Money" tree (start_quest + retry-friendly gauntlet)', () => {
  const responses = flattenResponses(QUENTIN);

  it('QUENTIN is still npc_quentin, friendly, and still sets met_quentin (cameo intact)', () => {
    // Mirror the Phase-3 cameo guards: extending the tree must not break the
    // friendly attitude or the meeting-is-the-trigger met_quentin set.
    expect(QUENTIN.id).toBe('npc_quentin');
    expect(QUENTIN.attitude).toBe('friendly');
    expect(collectSetFlagKeys([QUENTIN]).has('met_quentin')).toBe(true);
  });

  it('QUENTIN fires start_quest q_quentin_thread on a once beat gated on met_quentin (D-12)', () => {
    const starter = responses.find((r) =>
      (r.consequences ?? []).some(
        (c) => c.type === 'start_quest' && c.questId === 'q_quentin_thread'
      )
    );
    expect(
      starter,
      'QUENTIN must fire start_quest q_quentin_thread on some response'
    ).toBeDefined();
    expect(starter!.once, 'the quest-start beat must be once').toBe(true);
    expect(
      leafConditions(starter!.condition).some(
        (leaf) =>
          leaf.fact === 'flags' &&
          leaf.path === '$.met_quentin' &&
          leaf.operator === 'equal' &&
          leaf.value === true
      ),
      'the q_quentin_thread start must be gated on met_quentin === true'
    ).toBe(true);
  });

  it('every QUENTIN investigation check rolls a CHA skill, onFail: [], no once, no hostile-flip', () => {
    // CHA-only union (persuasion/deception/intimidation) — never investigation/
    // history/arcana (which would silently roll off Charisma). Retry-friendly per
    // the LORIEN idiom: onFail: [], no `once` on the check node, no hostile flip.
    const CHA = new Set(['persuasion', 'deception', 'intimidation']);
    const json = JSON.stringify(QUENTIN);
    const hostileFlip = /"type"\s*:\s*"set_npc_attitude"[^}]*"attitude"\s*:\s*"hostile"/.test(json);
    expect(hostileFlip, 'QUENTIN must not flip to hostile on a failed check').toBe(false);

    const checkResponses = responses.filter((r) => r.check);
    expect(
      checkResponses.length,
      'QUENTIN must author at least one investigation check'
    ).toBeGreaterThan(0);
    for (const r of checkResponses) {
      const check = r.check as { skill?: string; onFail?: unknown[] };
      expect(
        CHA.has(check.skill ?? ''),
        `check "${r.id}" skill "${check.skill}" must be CHA-only`
      ).toBe(true);
      expect(r.once, `check "${r.id}" must not be once (retry-friendly)`).not.toBe(true);
      expect(
        (check.onFail ?? []).length,
        `check "${r.id}" onFail must be empty (a failed roll decides nothing)`
      ).toBe(0);
    }
  });

  it('the Julian family-ruin callback is condition-gated with a neutral fallback (both-paths, D-13)', () => {
    // Mirror the martha_hint both-paths guard: quentin_evidence_seal must be set on
    // BOTH a julian_in_party-gated callback line AND a neutral sibling, NEITHER
    // hard-gating the trail on the optional Julian thread, and NEITHER a roll.
    const setters = responses.filter((r) => setsFlag(r, 'quentin_evidence_seal'));
    expect(
      setters.length,
      'at least two lines must set quentin_evidence_seal (both-paths)'
    ).toBeGreaterThanOrEqual(2);
    const gatesOnJulian = (r: CampaignRoomNpcResponse) =>
      leafConditions(r.condition).some(
        (leaf) => leaf.fact === 'flags' && leaf.path === '$.julian_in_party'
      );
    const julianLine = setters.find((r) => gatesOnJulian(r));
    const neutralLine = setters.find((r) => !gatesOnJulian(r));
    expect(
      julianLine,
      'a julian_in_party-gated callback must set quentin_evidence_seal'
    ).toBeDefined();
    expect(
      neutralLine,
      'a neutral (no-julian) line must also set quentin_evidence_seal'
    ).toBeDefined();
    // Neither both-paths line is a check — the Julian payoff is flavor, never a roll.
    expect(
      julianLine!.check,
      'the Julian callback must not be a check (never a Julian-specific roll)'
    ).toBeUndefined();
    expect(neutralLine!.check, 'the neutral seal line must not be a check').toBeUndefined();
  });
});

// ─── Act II slice (Plan 04-03): the Vance-estate lieutenant room + venue (Task 2) ─
describe('Act II — vance_cellar_room lieutenant fight + venue wiring (Plan 04-03, Task 2)', () => {
  const cellar = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'vance_cellar_room') as
    | (CampaignRoom & { enemies?: Array<{ name: string; count?: number; id?: string }> })
    | undefined;

  it('vance_cellar_room exists with an ascends-back exit', () => {
    expect(cellar, 'vance_cellar_room must exist').toBeDefined();
    expect(
      (cellar!.exits ?? []).some((ex) => ex.ascends === true),
      'the cellar must have an ascends-back exit to the district'
    ).toBe(true);
  });

  it('places exactly one count-1 named Weaver Magus lieutenant (the clear-rule target)', () => {
    const placements = cellar!.enemies ?? [];
    const magus = placements.filter((e) => e.name === 'Weaver Magus');
    expect(magus.length, 'exactly one Weaver Magus lieutenant').toBe(1);
    expect((magus[0].count ?? 1) === 1, 'the lieutenant is count-1').toBe(true);
    expect(magus[0].id).toBe('vance_cellar_room#lieutenant');
  });

  it('every cellar enemy uses an exact Act II reskin clone name, full SRD numbers (strict-SRD)', () => {
    const RESKIN = new Set(['Weaver Magus', 'Subverted Vanguard', 'Subverted Sentry']);
    for (const e of cellar!.enemies ?? []) {
      expect(RESKIN.has(e.name), `cellar enemy "${e.name}" must be an Act II reskin name`).toBe(
        true
      );
    }
  });

  it('the lieutenant is a DISTINCT instance from the undercroft core Magus (D-11)', () => {
    const core = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'library_undercroft_core') as
      | (CampaignRoom & { enemies?: Array<{ id?: string }> })
      | undefined;
    const coreIds = new Set((core!.enemies ?? []).map((e) => e.id));
    expect(
      coreIds.has('vance_cellar_room#lieutenant'),
      'the lieutenant id must not collide with a core enemy id'
    ).toBe(false);
  });

  it('a Court-District kind:"interior" venue resolves to vance_cellar_room; each district keeps one gate', () => {
    const court = (TOWNS_ACT2 as CampaignTown[]).find((t) => t.id === 'valerion_court_district');
    expect(court, 'the Court District must exist').toBeDefined();
    const venue = (court!.venues ?? []).find((v) => v.entryRoomId === 'vance_cellar_room');
    expect(venue, 'a Court-District venue must open vance_cellar_room').toBeDefined();
    expect(venue!.kind, 'the Vance-estate venue must be kind:"interior"').toBe('interior');
    const gates = (court!.venues ?? []).filter((v) => v.kind === 'gate');
    expect(gates.length, 'the Court District must keep exactly one gate venue').toBe(1);
  });
});

// ─── Act II slice (Plan 04-03): quentin_lieutenant_down rule + q_quentin_thread (Task 3) ─
describe('Act II — quentin_lieutenant_down rule integrity (Plan 04-03, Task 3)', () => {
  const byName = new Map(RULES_ACT2.map((r) => [r.name, r] as const));

  it('quentin_lieutenant_down is appended to RULES_ACT2 (alongside the prior rules)', () => {
    expect(byName.has('quentin_lieutenant_down')).toBe(true);
    // The earlier Act II rules are still present (append, not replace).
    expect(byName.has('fuel_cell_core_clear')).toBe(true);
    expect(byName.has('jarek_ambush_clear')).toBe(true);
  });

  it('quentin_lieutenant_down sets quentin_exposed=true, once', () => {
    const r = byName.get('quentin_lieutenant_down');
    expect(r!.once).toBe(true);
    expect(
      ruleSetFlags(r).some((f) => f.key === 'quentin_exposed' && f.value === true),
      'must set quentin_exposed=true'
    ).toBe(true);
  });

  it('quentin_lieutenant_down keys exactly on the placed Vance-cellar lieutenant id (store_flip integrity)', () => {
    // The rule's id list must equal the room's count-1 named lieutenant placement —
    // so a drift between rule and placement fails here, not in a silently-
    // never-clearing playthrough (RESEARCH Pitfall 1).
    const cellar = (ROOMS_ACT2 as CampaignRoom[]).find((r) => r.id === 'vance_cellar_room') as
      | (CampaignRoom & { enemies?: Array<{ name: string; count?: number; id?: string }> })
      | undefined;
    const lieutenant = (cellar!.enemies ?? []).find((e) => e.id === 'vance_cellar_room#lieutenant');
    expect(lieutenant, 'the cellar must place the named lieutenant').toBeDefined();
    const ruleIds = ruleKilledIds(byName.get('quentin_lieutenant_down'));
    expect(ruleIds).toEqual(['vance_cellar_room#lieutenant']);
  });

  it('the seeded rules section concatenates quentin_lieutenant_down (Pitfall 2)', () => {
    const rulesSection = SKY_CAMPAIGN_SECTIONS.find((s) => s.section === 'rules');
    const rules = rulesSection!.value as GameRule[];
    expect(rules.some((r) => r.name === 'quentin_lieutenant_down')).toBe(true);
  });
});

describe('Act II — q_quentin_thread quest shape + flag-linkage (Plan 04-03, Task 3)', () => {
  const quest = (QUESTS_ACT2 as Quest[]).find((q) => q.id === 'q_quentin_thread');

  it('q_quentin_thread is a Quentin-given act2 quest that is NOT startActive', () => {
    expect(quest, 'QUESTS_ACT2 must contain q_quentin_thread').toBeDefined();
    expect(quest!.title).toBe('Old Money');
    expect(quest!.actId).toBe('act2');
    expect(quest!.giverNpcId).toBe('npc_quentin');
    expect(quest!.startActive).not.toBe(true);
  });

  it('q_quentin_thread has a final step keyed on quentin_exposed', () => {
    const steps = quest?.steps ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const finalKey = stepFlagKey(steps[steps.length - 1].condition);
    expect(finalKey).toBe('quentin_exposed');
  });

  it('every q_quentin_thread step flag has a writing site (QUENTIN dialogue OR a RULES_ACT2 rule)', () => {
    // Pitfall 3 (flag-linkage): the evidence flags are written by QUENTIN's
    // gauntlet; quentin_exposed is written by the lieutenant-kill rule. The
    // setting-site set spans both.
    const setSites = new Set<string>([...collectSetFlagKeys([QUENTIN]), ...rulesAct2SetFlagKeys()]);
    for (const step of quest?.steps ?? []) {
      const key = stepFlagKey(step.condition);
      if (!key) continue;
      expect(
        setSites.has(key),
        `q_quentin_thread step "${step.id}" flag "${key}" has no writing site (dialogue or rule)`
      ).toBe(true);
    }
  });

  it('the seeded quests section concatenates q_quentin_thread (Pitfall 2)', () => {
    const questsSection = SKY_CAMPAIGN_SECTIONS.find((s) => s.section === 'quests');
    const quests = questsSection!.value as Quest[];
    expect(quests.some((q) => q.id === 'q_quentin_thread')).toBe(true);
  });
});

// ── Helpers for the act-graph close specs (Plan 05-01) ───────────────────────
// Walk an act-edge `when` composite down to its leaf conditions (the same {all}/
// {any}/{not} shape evalCondition reads), so a guard can ask "does this edge
// gate on flag/quest X?" structurally rather than string-matching the JSON.
function edgeLeaves(when: unknown): Array<Record<string, unknown>> {
  return leafConditions(when);
}
// Does an edge's `when` carry a leaf matching (fact, path?, operator, value)?
function hasLeaf(
  when: unknown,
  match: { fact: string; path?: string; operator?: string; value?: unknown }
): boolean {
  return edgeLeaves(when).some(
    (leaf) =>
      leaf.fact === match.fact &&
      (match.path === undefined || leaf.path === match.path) &&
      (match.operator === undefined || leaf.operator === match.operator) &&
      (match.value === undefined || leaf.value === match.value)
  );
}

describe('Act II — act-graph close + branched ending (Plan 05-01)', () => {
  const act2 = (ACTS as Act[]).find((a) => a.id === 'act2');
  const secured = (ACTS as Act[]).find((a) => a.id === 'act2_end_secured');
  const lost = (ACTS as Act[]).find((a) => a.id === 'act2_end_lost');

  it('act2 now carries a transitions array of exactly two edges', () => {
    expect(act2, 'ACTS must contain act2').toBeDefined();
    expect(act2!.transitions, 'act2 must have transitions').toBeDefined();
    expect(act2!.transitions!.length).toBe(2);
  });

  it('first-match-wins order: relic-gated → act2_end_secured at index 0, bare fallback → act2_end_lost at index 1', () => {
    const edges = act2!.transitions!;
    expect(edges[0].to).toBe('act2_end_secured');
    expect(edges[1].to).toBe('act2_end_lost');
    // The index-0 edge is the relic-ownership branch (relic_fuel_cell == party).
    expect(
      hasLeaf(edges[0].when, {
        fact: 'flags',
        path: '$.relic_fuel_cell',
        operator: 'equal',
        value: 'party',
      }),
      'edge 0 (act2_end_secured) must gate on relic_fuel_cell == party'
    ).toBe(true);
    // The fallback edge does NOT carry the relic gate (absence-of-party read).
    expect(
      hasLeaf(edges[1].when, { fact: 'flags', path: '$.relic_fuel_cell' }),
      'edge 1 (act2_end_lost) must NOT gate on relic_fuel_cell (bare fallback)'
    ).toBe(false);
  });

  it('both edges are an `all` composite carrying q_fuel_cell + coords_decoded + act2_departed', () => {
    for (const edge of act2!.transitions!) {
      const when = edge.when as Record<string, unknown>;
      expect(
        Array.isArray(when.all),
        `edge → ${edge.to} `.concat('must be an `all` composite')
      ).toBe(true);
      expect(
        hasLeaf(when, { fact: 'quests_completed', operator: 'contains', value: 'q_fuel_cell' }),
        `edge → ${edge.to} must require quests_completed contains q_fuel_cell`
      ).toBe(true);
      expect(
        hasLeaf(when, { fact: 'flags', path: '$.coords_decoded', operator: 'equal', value: true }),
        `edge → ${edge.to} must require flags.coords_decoded == true`
      ).toBe(true);
      expect(
        hasLeaf(when, { fact: 'flags', path: '$.act2_departed', operator: 'equal', value: true }),
        `edge → ${edge.to} must require flags.act2_departed == true`
      ).toBe(true);
    }
  });

  it('act2_end_secured and act2_end_lost are terminal ending acts with a non-empty static text', () => {
    for (const term of [secured, lost]) {
      expect(term, 'both terminal acts must exist in ACTS').toBeDefined();
      expect(term!.ending, `${term!.id} must be a terminal ending act`).toBeDefined();
      expect(typeof term!.ending!.outcome).toBe('string');
      expect(
        term!.ending!.outcome.length,
        `${term!.id} ending.outcome must be set`
      ).toBeGreaterThan(0);
      expect(typeof term!.ending!.text).toBe('string');
      expect(
        (term!.ending!.text ?? '').length,
        `${term!.id} ending.text must be non-empty`
      ).toBeGreaterThan(0);
      // The handoff stub ends on "To be continued… Act III".
      expect(
        /To be continued.*Act III/.test(term!.ending!.text ?? ''),
        `${term!.id} ending.text must hand off to Act III`
      ).toBe(true);
    }
  });
});

// Does a response's condition reference flag `key` with the given value (handles
// the {all}/{any}/{not} composite shape via leafConditions)?
function gatesOnFlagValue(r: CampaignRoomNpcResponse, key: string, value: unknown): boolean {
  return leafConditions(r.condition).some(
    (leaf) => leaf.fact === 'flags' && leaf.path === `$.${key}` && leaf.value === value
  );
}
describe('Act II — Elara eve-of-departure debrief (Plan 05-01)', () => {
  const responses = flattenResponses(ELARA);
  const debrief = responses.find((r) => r.id === 'elara_debrief');

  it('the debrief opener is gated on q_fuel_cell complete + coords_decoded', () => {
    expect(debrief, 'ELARA must author an elara_debrief opener').toBeDefined();
    const leaves = leafConditions(debrief!.condition);
    expect(
      leaves.some(
        (l) =>
          l.fact === 'quests_completed' && l.operator === 'contains' && l.value === 'q_fuel_cell'
      ),
      'debrief opener must require quests_completed contains q_fuel_cell'
    ).toBe(true);
    expect(
      leaves.some((l) => l.fact === 'flags' && l.path === '$.coords_decoded' && l.value === true),
      'debrief opener must require flags.coords_decoded == true'
    ).toBe(true);
  });

  it('relic_fuel_cell has BOTH a positive party leaf AND a negated absence leaf (no dead end)', () => {
    // The positive leaf gates directly on relic_fuel_cell == party (top-level
    // equal). The absence leaf is a {not: relic_fuel_cell == party} composite —
    // runtime-correct via evalCondition's `not`, and reachable whenever the
    // party is NOT held. Distinguish them structurally by the top-level `not`,
    // since leafConditions flattens both down to the same inner leaf.
    const isNegatedRelic = (r: CampaignRoomNpcResponse): boolean => {
      const c = r.condition as { not?: Record<string, unknown> } | undefined;
      return (
        !!c?.not &&
        c.not.fact === 'flags' &&
        c.not.path === '$.relic_fuel_cell' &&
        c.not.value === 'party'
      );
    };
    const isPositiveRelic = (r: CampaignRoomNpcResponse): boolean => {
      const c = r.condition as { fact?: string; path?: string; value?: unknown } | undefined;
      return c?.fact === 'flags' && c.path === '$.relic_fuel_cell' && c.value === 'party';
    };
    expect(
      responses.some(isPositiveRelic),
      'a positive relic_fuel_cell == party debrief leaf must exist'
    ).toBe(true);
    expect(
      responses.some(isNegatedRelic),
      'a negated {not: relic_fuel_cell == party} absence leaf must exist (no dead end)'
    ).toBe(true);
  });

  it('quentin_exposed has a condition-gated callback leaf', () => {
    expect(
      responses.some((r) => gatesOnFlagValue(r, 'quentin_exposed', true)),
      'a quentin_exposed == true debrief leaf must exist'
    ).toBe(true);
  });

  it('jarek_stance has allied / wary / hostile sibling leaves', () => {
    for (const stance of ['allied', 'wary', 'hostile']) {
      expect(
        responses.some((r) => gatesOnFlagValue(r, 'jarek_stance', stance)),
        `a jarek_stance == ${stance} debrief leaf must exist`
      ).toBe(true);
    }
  });

  it('silverford_outcome has truce / war sibling leaves', () => {
    for (const outcome of ['truce', 'war']) {
      expect(
        responses.some((r) => gatesOnFlagValue(r, 'silverford_outcome', outcome)),
        `a silverford_outcome == ${outcome} debrief leaf must exist`
      ).toBe(true);
    }
  });

  it('the callback leaves are pure flavor — they write no flags', () => {
    // Only elara_depart writes a flag; the four-flag callbacks set nothing.
    const callbackIds = [
      'elara_debrief_relic_secured',
      'elara_debrief_relic_lost',
      'elara_debrief_quentin',
      'elara_debrief_jarek_allied',
      'elara_debrief_jarek_wary',
      'elara_debrief_jarek_hostile',
      'elara_debrief_silverford_truce',
      'elara_debrief_silverford_war',
    ];
    for (const id of callbackIds) {
      const leaf = responses.find((r) => r.id === id);
      expect(leaf, `callback leaf ${id} must exist`).toBeDefined();
      expect(
        (leaf!.consequences ?? []).length,
        `callback leaf ${id} must carry no consequences (pure flavor)`
      ).toBe(0);
    }
  });

  it('elara_depart writes act2_departed (the third edge gate)', () => {
    const depart = responses.find((r) => r.id === 'elara_depart');
    expect(depart, 'an elara_depart choice must exist').toBeDefined();
    expect(setsFlag(depart!, 'act2_departed'), 'elara_depart must set act2_departed').toBe(true);
    // The depart leaf is replayable-safe (not once-locked).
    expect(depart!.once, 'elara_depart must not be once-locked').not.toBe(true);
  });
});
