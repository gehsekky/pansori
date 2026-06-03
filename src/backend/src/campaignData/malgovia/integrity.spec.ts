// Campaign structural integrity for Malgovia. Validates the fully ASSEMBLED
// context (whatever index.ts exports), so it holds both before and after the
// de-fold: every cross-reference between sites / venues / rooms / npcs / quests
// resolves to a real entity, and every site is reachable from the start.
//
// This is the safety net for the grove/pines de-fold (those sub-campaigns have
// no playthrough coverage): if the static merge drops a room, mis-keys an npc,
// or breaks a quest giver, an assertion here fails immediately.

import { describe, expect, it } from 'vitest';
import type { GameState } from '../../types.js';
import { activeGrid } from '../../services/mapEngine.js';
import { context } from './index.js';
import { findPath } from '../../services/gridEngine.js';

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
    for (const [roomId, npc] of npcEntries) {
      expect(roomIds.has(roomId), `npc placement on missing room ${roomId}`).toBe(true);
      expect(npc.roomId, `npc ${npc.id} roomId disagrees with its key ${roomId}`).toBe(roomId);
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
