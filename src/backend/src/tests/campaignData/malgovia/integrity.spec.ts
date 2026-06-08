// Campaign structural integrity for Malgovia. Validates the fully ASSEMBLED
// context (whatever index.ts exports), so it holds both before and after the
// de-fold: every cross-reference between sites / venues / rooms / npcs / quests
// resolves to a real entity, and every site is reachable from the start.
//
// This is the safety net for the grove/pines de-fold (those sub-campaigns have
// no playthrough coverage): if the static merge drops a room, mis-keys an npc,
// or breaks a quest giver, an assertion here fails immediately.

import { describe, expect, it } from 'vitest';
import type { GameState } from '../../../types.js';
import { activeGrid } from '../../../services/mapEngine.js';
import { context } from '../../../campaignData/malgovia/index.js';
import { findPath } from '../../../services/gridEngine.js';

const camp = context.campaign!;
const roomIds = new Set(camp.rooms.map((r) => r.id));
const townIds = new Set((camp.towns ?? []).map((t) => t.id));
const npcEntries = Object.entries(camp.npcs ?? {});
const npcIds = new Set(npcEntries.map(([, n]) => n.id));

describe('Malgovia integrity — cross-references resolve', () => {
  it('every region site points at a real town / entry room', () => {
    for (const region of camp.regions ?? []) {
      for (const s of region.sites) {
        if (s.kind === 'town') {
          expect(townIds.has(s.townId!), `site ${s.id} → missing town ${s.townId}`).toBe(true);
        } else {
          expect(roomIds.has(s.entryRoomId!), `site ${s.id} → missing room ${s.entryRoomId}`).toBe(
            true
          );
        }
      }
    }
  });

  it('every town interior venue points at a real room', () => {
    for (const town of camp.towns ?? []) {
      for (const v of town.venues) {
        if (v.kind === 'interior') {
          expect(
            roomIds.has(v.entryRoomId!),
            `venue ${v.id} in ${town.id} → missing room ${v.entryRoomId}`
          ).toBe(true);
        }
      }
    }
  });

  it('every non-ascend room exit points at a real room', () => {
    for (const room of camp.rooms) {
      for (const e of room.exits ?? []) {
        if (!e.ascends) {
          expect(
            roomIds.has(e.toRoomId!),
            `room ${room.id} exit → missing room ${e.toRoomId}`
          ).toBe(true);
        }
      }
    }
  });

  it('npc / enemy / loot placements key off real rooms', () => {
    // npcs are keyed by npc.id (a room may host several); each value carries the
    // roomId it sits in, which must be a real room.
    for (const [npcId, npc] of npcEntries) {
      expect(npc.id, `npc key ${npcId} disagrees with its id ${npc.id}`).toBe(npcId);
      expect(roomIds.has(npc.roomId), `npc ${npc.id} placed in missing room ${npc.roomId}`).toBe(
        true
      );
    }
    // NPCs sharing a room must occupy distinct cells (so each renders its own token).
    const posByRoom = new Map<string, Set<string>>();
    for (const [, npc] of npcEntries) {
      if (!npc.pos) continue;
      const seen = posByRoom.get(npc.roomId) ?? new Set<string>();
      const key = `${npc.pos.x},${npc.pos.y}`;
      expect(seen.has(key), `npc ${npc.id} overlaps another npc at ${key} in ${npc.roomId}`).toBe(
        false
      );
      seen.add(key);
      posByRoom.set(npc.roomId, seen);
    }
    for (const roomId of Object.keys(camp.enemies ?? {})) {
      expect(roomIds.has(roomId), `enemy placement on missing room ${roomId}`).toBe(true);
    }
    for (const roomId of Object.keys(camp.loot ?? {})) {
      expect(roomIds.has(roomId), `loot placement on missing room ${roomId}`).toBe(true);
    }
  });

  it('every quest giver is a placed npc', () => {
    for (const q of camp.quests ?? []) {
      if (q.giverNpcId) {
        expect(npcIds.has(q.giverNpcId), `quest ${q.id} → missing giver ${q.giverNpcId}`).toBe(
          true
        );
      }
    }
  });
});

describe('Malgovia integrity — no duplicate ids (guards the de-fold merge)', () => {
  const dupsById = <T>(items: T[], key: (t: T) => string): string[] => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const it of items) {
      const k = key(it);
      if (seen.has(k)) dups.push(k);
      seen.add(k);
    }
    return dups;
  };

  it('rooms / towns / quests / factions / loot / enemy templates have unique ids', () => {
    expect(dupsById(camp.rooms, (r) => r.id)).toEqual([]);
    expect(dupsById(camp.towns ?? [], (t) => t.id)).toEqual([]);
    expect(dupsById(camp.quests ?? [], (q) => q.id)).toEqual([]);
    expect(dupsById(camp.factions ?? [], (f) => f.id)).toEqual([]);
    expect(dupsById(context.lootTable, (i) => i.id)).toEqual([]);
    // enemyTemplates are keyed by name (no id).
    expect(dupsById(context.enemyTemplates, (e) => e.name)).toEqual([]);
    // region site ids unique across all regions.
    const sites = (camp.regions ?? []).flatMap((r) => r.sites);
    expect(dupsById(sites, (s) => s.id)).toEqual([]);
  });
});

describe('Malgovia integrity — every site is reachable from the start', () => {
  it('finds a path from the region start to each site', () => {
    const st = {
      map_level: 'regional',
      current_region_id: camp.regions![0].id,
      visited_rooms: [],
    } as unknown as GameState;
    const grid = activeGrid(context.campaign, camp.rooms, st)!;
    expect(grid.level).toBe('regional');
    for (const t of grid.transitions) {
      const path = findPath(grid.startPos, t.pos, grid.obstacles, grid.width, grid.height);
      expect(path, `no path from start to ${t.label} (${t.pos.x},${t.pos.y})`).toBeTruthy();
    }
  });
});

describe('Malgovia is open-ended — no side-arc ends the whole adventure', () => {
  it('no quest reward is set_escape (regression: the folded grove arc once did)', () => {
    const enders = (camp.quests ?? [])
      .filter((q) => (q.rewards ?? []).some((r) => r.type === 'set_escape'))
      .map((q) => q.id);
    expect(enders).toEqual([]);
  });
});

describe('The Silent Grove — right-sized starter climax', () => {
  it('requires DEFEATING the Fey Trickster (after reaching the Oak), then taking the heart', () => {
    const grove = (camp.quests ?? []).find((q) => q.id === 'quest_silent_grove')!;
    // The defeat step is a required gate keyed on killing the Trickster.
    const defeat = grove.steps.find((s) => s.id === 'step_defeat_trickster')!;
    expect(defeat).toBeTruthy();
    const conds = JSON.stringify(defeat.condition);
    expect(conds).toContain('enemies_killed');
    expect(conds).toContain('ancient_oak#0');
    // …and it comes AFTER merely reaching the Oak (reaching alone never completes it).
    const reachIdx = grove.steps.findIndex((s) => s.id === 'step_reach_oak');
    const defeatIdx = grove.steps.findIndex((s) => s.id === 'step_defeat_trickster');
    expect(defeatIdx).toBeGreaterThan(reachIdx);
    // The folded-in final step (from the former "Break the Trickster's Hold")
    // recovers the Oak's heart — so the consolidated quest has a single climax.
    const last = grove.steps[grove.steps.length - 1];
    expect(last.id).toBe('step_take_heart');
    expect(JSON.stringify(last.condition)).toContain('oak_heart');
  });

  it('the Fey Trickster is a level-1-appropriate boss (no CR-4 base, no dead Hex config)', () => {
    const fey = (camp.enemies?.ancient_oak ?? []).find((e) => e.id === 'ancient_oak#0')!;
    expect(fey.name).toBe('Fey Trickster');
    expect(fey.hp).toBeLessThanOrEqual(20); // base; ×2.5 for a 4-PC party
    expect(fey.multiattack ?? 1).toBe(1); // single attack at low level
    expect(fey.spells ?? []).toEqual([]); // Hex never resolved (enemy cast = damage only)
    expect(fey.onHitEffect?.condition).toBe('charmed'); // its working signature
  });

  it('the grove minion is a weak beast, not an 85-HP Brown Bear', () => {
    const minion = (camp.enemies?.ancient_oak ?? []).find((e) => e.id === 'ancient_oak#1')!;
    expect(minion.name).not.toBe('Brown Bear');
    expect(minion.hp).toBeLessThanOrEqual(15); // base; ×2.5 scaled is still modest
  });
});
