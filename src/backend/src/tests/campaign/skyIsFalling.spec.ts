// Campaign-integrity guards for The Sky Is Falling — catching the class of
// silent, game-breaking content bugs the first playtest hit:
//   1. A wall of impassable terrain that strands sites (a full-width water row
//      walled Miller's Thicket / Vane's camp off from the hub — "No path there",
//      and the main quest could never complete).
//   2. The store_flip rule's enemy-id list drifting from the room's rat count
//      (clear the rats, but the shop never opens).
// These assert over the authored fixture, so a future edit that reintroduces
// either bug fails here instead of in someone's playthrough.

import type {
  CampaignRegion,
  CampaignRoom,
  CampaignRoomNpc,
  CampaignRoomNpcResponse,
  CampaignTown,
} from '../../services/campaignContent.js';
import { ELARA, QUENTIN, VANE_ACT2 } from '../../campaignData/skyIsFalling/npcsAct2.js';
import type { GameRule, Quest } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { QUESTS_ACT2 } from '../../campaignData/skyIsFalling/questsAct2.js';
import { REGIONS } from '../../campaignData/skyIsFalling/regions.js';
import { REGIONS_ACT2 } from '../../campaignData/skyIsFalling/regionsAct2.js';
import { ROOMS } from '../../campaignData/skyIsFalling/rooms.js';
import { ROOMS_ACT2 } from '../../campaignData/skyIsFalling/roomsAct2.js';
import { RULES } from '../../campaignData/skyIsFalling/rules.js';
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

  it('no undercroft room places enemies or npcs (empty-but-ready, D-08)', () => {
    for (const id of UNDERCROFT_IDS) {
      const room = byId.get(id)! as CampaignRoom & { enemies?: unknown[]; npcs?: unknown[] };
      expect(
        room.enemies,
        `undercroft room "${id}" must not place enemies yet (Phase 4)`
      ).toBeUndefined();
      expect(room.npcs, `undercroft room "${id}" must not place npcs yet`).toBeUndefined();
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
