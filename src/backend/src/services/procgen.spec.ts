import { describe, it, expect } from 'vitest';
import { generateRoguelikeSeed } from './procgen.js';
import { context as dungeonCtx } from '../contexts/dungeon-crawler.js';
import { context as scifiCtx }   from '../contexts/scifi-terror.js';
import type { Context, Seed } from '../types.js';

function validateSeed(ctx: Context, seed: Seed) {
  const roomIds = new Set(seed.rooms.map(r => r.id));

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
    const poolIds = new Set(ctx.roomPool.map(r => r.id));
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
    const templateNames = new Set(ctx.enemyTemplates.map(t => t.name));
    for (const [roomId, enemy] of Object.entries(seed.enemies)) {
      expect(templateNames.has(enemy.name), `enemy in room "${roomId}" has unknown name "${enemy.name}"`).toBe(true);
    }
  });

  it('enemies have positive HP and AC', () => {
    for (const enemy of Object.values(seed.enemies)) {
      expect(enemy.hp).toBeGreaterThan(0);
      expect(enemy.ac).toBeGreaterThan(0);
    }
  });

  it('loot items reference valid loot table entries', () => {
    const lootIds = new Set(ctx.lootTable.map(l => l.id));
    for (const [roomId, item] of Object.entries(seed.loot)) {
      expect(lootIds.has(item.id), `loot in room "${roomId}" has unknown id "${item.id}"`).toBe(true);
    }
  });

  it('enemies are not placed in the start room', () => {
    expect(seed.enemies[ctx.startRoomId]).toBeUndefined();
  });
}

describe('generateRoguelikeSeed — dungeon-crawler', () => {
  const seed = generateRoguelikeSeed(dungeonCtx);
  validateSeed(dungeonCtx, seed);
});

describe('generateRoguelikeSeed — scifi-terror', () => {
  const seed = generateRoguelikeSeed(scifiCtx);
  validateSeed(scifiCtx, seed);
});
