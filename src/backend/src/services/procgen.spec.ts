import type { Context, Seed } from '../types.js';
import { describe, expect, it } from 'vitest';
import { generateRoguelikeSeed, generateSeed } from './procgen.js';
import { context as sandboxCtx } from '../contexts/sandbox.js';
import { context as valeCtx } from '../contexts/vale_of_shadows.js';
import { context as whisperingCtx } from '../contexts/whispering_pines.js';

function validateSeed(ctx: Context, seed: Seed) {
  const roomIds = new Set(seed.rooms.map((r) => r.id));

  it('has the correct context_id', () => {
    expect(seed.context_id).toBe(ctx.id);
  });

  it('world_name comes from the context worldNames list', () => {
    expect(ctx.worldNames).toContain(seed.world_name);
  });

  it('intro comes from the context introTexts list', () => {
    expect(ctx.introTexts).toContain(seed.intro);
  });

  it('seed_id is a UUID', () => {
    expect(seed.seed_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('room count is between 6 and 9', () => {
    expect(seed.rooms.length).toBeGreaterThanOrEqual(6);
    expect(seed.rooms.length).toBeLessThanOrEqual(9);
  });

  it('first room is the context startRoomId', () => {
    expect(seed.rooms[0].id).toBe(ctx.startRoomId);
  });

  it('last room is the context escapeRoomId', () => {
    expect(seed.rooms[seed.rooms.length - 1].id).toBe(ctx.escapeRoomId);
  });

  it('all room IDs are unique', () => {
    expect(roomIds.size).toBe(seed.rooms.length);
  });

  it('all room IDs are from the context roomPool', () => {
    const poolIds = new Set(ctx.roomPool.map((r) => r.id));
    for (const room of seed.rooms) {
      expect(poolIds.has(room.id)).toBe(true);
    }
  });

  it('every room has a non-empty name and desc', () => {
    for (const room of seed.rooms) {
      expect(room.name.length).toBeGreaterThan(0);
      expect(room.desc.length).toBeGreaterThan(0);
    }
  });

  it('every room appears in connections', () => {
    for (const room of seed.rooms) {
      expect(seed.connections[room.id]).toBeDefined();
    }
  });

  it('all connection targets are valid room IDs', () => {
    for (const [from, targets] of Object.entries(seed.connections)) {
      expect(roomIds.has(from), `connection key "${from}" is not a valid room`).toBe(true);
      for (const to of targets) {
        expect(roomIds.has(to), `connection target "${to}" is not a valid room`).toBe(true);
      }
    }
  });

  it('connections are bidirectional', () => {
    for (const [from, targets] of Object.entries(seed.connections)) {
      for (const to of targets) {
        expect(
          seed.connections[to]?.includes(from),
          `connection ${from}→${to} has no reverse`
        ).toBe(true);
      }
    }
  });

  it('start room connects to at least one adjacent room', () => {
    expect(seed.connections[ctx.startRoomId].length).toBeGreaterThanOrEqual(1);
  });

  it('enemies reference valid templates', () => {
    const templateNames = new Set(ctx.enemyTemplates.map((t) => t.name));
    for (const [roomId, enemiesInRoom] of Object.entries(seed.enemies)) {
      for (const enemy of enemiesInRoom) {
        expect(
          templateNames.has(enemy.name),
          `enemy in room "${roomId}" has unknown name "${enemy.name}"`
        ).toBe(true);
      }
    }
  });

  it('enemies have positive HP and AC', () => {
    for (const enemiesInRoom of Object.values(seed.enemies)) {
      for (const enemy of enemiesInRoom) {
        expect(enemy.hp).toBeGreaterThan(0);
        expect(enemy.ac).toBeGreaterThan(0);
      }
    }
  });

  it('loot items reference valid loot table entries', () => {
    const lootIds = new Set(ctx.lootTable.map((l) => l.id));
    for (const [roomId, item] of Object.entries(seed.loot)) {
      expect(lootIds.has(item.id), `loot in room "${roomId}" has unknown id "${item.id}"`).toBe(
        true
      );
    }
  });

  it('enemies are not placed in the start room', () => {
    expect(seed.enemies[ctx.startRoomId]).toBeUndefined();
  });

  it('seed has an npcs record', () => {
    expect(typeof seed.npcs).toBe('object');
    expect(seed.npcs).not.toBeNull();
  });

  it('NPCs are not placed in the start room', () => {
    expect(seed.npcs[ctx.startRoomId]).toBeUndefined();
  });

  it('NPCs are not placed in the escape room', () => {
    expect(seed.npcs[ctx.escapeRoomId]).toBeUndefined();
  });

  it('NPCs are not placed in rooms that already have enemies', () => {
    for (const roomId of Object.keys(seed.npcs)) {
      expect(seed.enemies[roomId]).toBeUndefined();
    }
  });

  it('placed NPCs have IDs from npcTemplates (if context defines any)', () => {
    if (!ctx.npcTemplates?.length) return;
    const validIds = new Set(ctx.npcTemplates.map((t) => t.id));
    for (const [roomId, npc] of Object.entries(seed.npcs)) {
      expect(validIds.has(npc.id), `NPC in room "${roomId}" has unknown id "${npc.id}"`).toBe(true);
    }
  });

  it('placed NPCs record the correct roomId', () => {
    for (const [roomId, npc] of Object.entries(seed.npcs)) {
      expect(npc.roomId).toBe(roomId);
    }
  });
}

describe('generateRoguelikeSeed — sandbox', () => {
  const seed = generateRoguelikeSeed(sandboxCtx);
  validateSeed(sandboxCtx, seed);

  it('obstacles, when seeded, stay in the middle band (away from spawn rows)', () => {
    const gh = sandboxCtx.gridHeight ?? 8;
    const gw = sandboxCtx.gridWidth ?? 8;
    for (const room of seed.rooms) {
      for (const o of room.obstacles ?? []) {
        expect(o.y).toBeGreaterThanOrEqual(3);
        expect(o.y).toBeLessThanOrEqual(gh - 3);
        expect(o.x).toBeGreaterThanOrEqual(1);
        expect(o.x).toBeLessThanOrEqual(gw - 2);
      }
    }
  });

  it('obstacles only land on rooms that have enemies (combat rooms)', () => {
    // Across many seeds: every obstacle should be in a combat room.
    for (let trial = 0; trial < 30; trial++) {
      const s = generateRoguelikeSeed(sandboxCtx);
      for (const room of s.rooms) {
        if (room.obstacles?.length) {
          expect(s.enemies?.[room.id]?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it('over many seeds, at least one room gets obstacles (procgen actually fires)', () => {
    let found = false;
    for (let trial = 0; trial < 50 && !found; trial++) {
      const s = generateRoguelikeSeed(sandboxCtx);
      found = s.rooms.some((r) => (r.obstacles?.length ?? 0) > 0);
    }
    expect(found).toBe(true);
  });

  it('difficult terrain, when seeded, stays in the same middle band as obstacles', () => {
    const gh = sandboxCtx.gridHeight ?? 8;
    const gw = sandboxCtx.gridWidth ?? 8;
    for (const room of seed.rooms) {
      for (const o of room.difficultTerrain ?? []) {
        expect(o.y).toBeGreaterThanOrEqual(3);
        expect(o.y).toBeLessThanOrEqual(gh - 3);
        expect(o.x).toBeGreaterThanOrEqual(1);
        expect(o.x).toBeLessThanOrEqual(gw - 2);
      }
    }
  });

  it('difficult terrain only lands on combat rooms', () => {
    for (let trial = 0; trial < 30; trial++) {
      const s = generateRoguelikeSeed(sandboxCtx);
      for (const room of s.rooms) {
        if (room.difficultTerrain?.length) {
          expect(s.enemies?.[room.id]?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it('difficult terrain never overlaps obstacles in the same room', () => {
    for (let trial = 0; trial < 50; trial++) {
      const s = generateRoguelikeSeed(sandboxCtx);
      for (const room of s.rooms) {
        const obsKeys = new Set((room.obstacles ?? []).map((p) => `${p.x},${p.y}`));
        for (const dt of room.difficultTerrain ?? []) {
          expect(obsKeys.has(`${dt.x},${dt.y}`)).toBe(false);
        }
      }
    }
  });

  it('over many seeds, at least one room gets difficult terrain', () => {
    let found = false;
    for (let trial = 0; trial < 80 && !found; trial++) {
      const s = generateRoguelikeSeed(sandboxCtx);
      found = s.rooms.some((r) => (r.difficultTerrain?.length ?? 0) > 0);
    }
    expect(found).toBe(true);
  });
});

// ─── Campaign seed validation ────────────────────────────────────────────────
// Campaign contexts are authored content, not procedurally generated. The seed
// should mirror the campaign rooms/connections verbatim and populate NPCs from
// campaign.npcs (no longer always empty).

describe('generateSeed — Vale of Shadows campaign', () => {
  const seed = generateSeed(valeCtx, 1);

  it('uses campaign rooms verbatim', () => {
    expect(seed.rooms.map((r) => r.id)).toEqual(valeCtx.campaign!.rooms.map((r) => r.id));
  });

  it('places authored NPCs at their campaign-declared rooms', () => {
    // Vale binds Aldric (market), Sister Maren (temple), Dusk (slums).
    expect(seed.npcs?.millhaven_market?.id).toBe('npc_aldric');
    expect(seed.npcs?.millhaven_temple?.id).toBe('npc_sister_maren');
    expect(seed.npcs?.millhaven_slums?.id).toBe('npc_dusk');
  });

  it('rooms with placed NPCs are not enemy rooms', () => {
    for (const roomId of Object.keys(seed.npcs ?? {})) {
      expect(seed.enemies?.[roomId] ?? []).toEqual([]);
    }
  });
});

describe('generateSeed — Whispering Pines campaign', () => {
  const seed = generateSeed(whisperingCtx, 1);

  it('uses campaign rooms verbatim', () => {
    expect(seed.rooms.map((r) => r.id)).toEqual(whisperingCtx.campaign!.rooms.map((r) => r.id));
  });

  it('places authored NPCs at their campaign-declared rooms', () => {
    expect(seed.npcs?.pines_tavern?.id).toBe('npc_brann');
    expect(seed.npcs?.pines_lodge?.id).toBe('npc_marta');
    expect(seed.npcs?.pines_warden?.id).toBe('npc_riese');
  });

  it('boss enemy is placed at the ritual apex with multiattack and fire vulnerability', () => {
    const boss = seed.enemies?.spire_ritual_apex?.[0];
    expect(boss?.name).toBe('Frost Acolyte');
    expect(boss?.multiattack).toBe(2);
    expect(boss?.vulnerabilities).toContain('fire');
  });

  it('quest items live in the campaign loot table', () => {
    expect(seed.loot?.spire_cult_chamber?.id).toBe('halden_locket');
    expect(seed.loot?.spire_ritual_apex?.id).toBe('cult_idol');
  });

  it('wilderness encounter table is reachable through Frozen Pass connections', () => {
    // pass_climb is the wilderness room sitting between town and the spire
    expect(seed.connections?.pass_climb).toContain('spire_entrance');
    expect(seed.connections?.pass_climb).toContain('pines_square');
  });
});

// ─── Campaign feature-coverage parity ────────────────────────────────────────
// Both campaigns should expose the full 12-class roster, 4 backgrounds, and
// the spell catalog (no longer a sandbox-only privilege).

describe('campaign feature parity', () => {
  const EXPECTED_CLASSES = [
    'Fighter',
    'Rogue',
    'Wizard',
    'Cleric',
    'Ranger',
    'Paladin',
    'Bard',
    'Druid',
    'Sorcerer',
    'Warlock',
    'Monk',
    'Barbarian',
  ];
  const EXPECTED_BACKGROUNDS = ['soldier', 'criminal', 'sage', 'acolyte'];
  const EXPECTED_SPELLS_SUBSET = [
    'fire_bolt',
    'misty_step',
    'fireball',
    'eldritch_blast',
    'healing_word',
    'shillelagh',
    'entangle',
    'charm_person',
    'sleep',
    'hold_person',
    'spiritual_weapon',
    'hex',
  ];

  for (const [label, ctx] of [
    ['Vale of Shadows', valeCtx],
    ['Whispering Pines', whisperingCtx],
  ] as const) {
    describe(label, () => {
      it('exposes all 12 classes in classPrimaryStats', () => {
        for (const cls of EXPECTED_CLASSES) {
          expect(ctx.classPrimaryStats[cls]).toBeDefined();
        }
      });

      it('every class has a starting loot entry', () => {
        for (const cls of EXPECTED_CLASSES) {
          expect(ctx.classStartingLoot?.[cls]?.length).toBeGreaterThan(0);
        }
      });

      it('starting loot items all resolve in the loot table', () => {
        const lootIds = new Set(ctx.lootTable.map((l) => l.id));
        for (const cls of EXPECTED_CLASSES) {
          for (const itemId of ctx.classStartingLoot?.[cls] ?? []) {
            expect(lootIds.has(itemId)).toBe(true);
          }
        }
      });

      it('Druid / Sorcerer / Warlock have spell lists and slot tables', () => {
        for (const caster of ['Druid', 'Sorcerer', 'Warlock'] as const) {
          expect(ctx.classSpells?.[caster]?.length).toBeGreaterThan(0);
          expect(ctx.classSpellSlots?.[caster]?.length).toBeGreaterThan(0);
          expect(ctx.spellcastingAbility?.[caster]).toBeDefined();
        }
      });

      it('exposes 4 character backgrounds', () => {
        const ids = (ctx.backgrounds ?? []).map((b) => b.id);
        for (const bg of EXPECTED_BACKGROUNDS) {
          expect(ids).toContain(bg);
        }
      });

      it('spell table includes the previously-missing sandbox spells', () => {
        for (const sid of EXPECTED_SPELLS_SUBSET) {
          expect(ctx.spellTable?.[sid]).toBeDefined();
        }
      });
    });
  }

  it('Vale has a trap and a searchable object in the dungeon', () => {
    const charnel = valeCtx.campaign!.rooms.find((r) => r.id === 'dungeon_charnel_hall');
    expect(charnel?.trap?.id).toBe('charnel_hall_blade');
    const antechamber = valeCtx.campaign!.rooms.find((r) => r.id === 'dungeon_antechamber');
    expect(antechamber?.objects?.[0]?.id).toBe('funeral_urns');
    const garrison = valeCtx.campaign!.rooms.find((r) => r.id === 'millhaven_garrison');
    expect(garrison?.objects?.[0]?.id).toBe('captain_strongbox');
  });

  it('Whispering Pines has a trap and a searchable object', () => {
    const frozenHall = whisperingCtx.campaign!.rooms.find((r) => r.id === 'spire_frozen_hall');
    expect(frozenHall?.trap?.id).toBe('frozen_hall_icicle');
    const lodge = whisperingCtx.campaign!.rooms.find((r) => r.id === 'pines_lodge');
    expect(lodge?.objects?.[0]?.id).toBe('trapper_locker');
  });
});
