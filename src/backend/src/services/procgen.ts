import { randomUUID } from 'crypto';
import type { Context, Seed, LootItem } from '../types.js';

function roll(sides: number): number { return Math.floor(Math.random() * sides) + 1; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function weightedPick(table: LootItem[]): LootItem {
  const total = table.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of table) { r -= item.weight; if (r <= 0) return { ...item }; }
  return { ...table[0] };
}

export function generateShipSeed(context: Context): Seed {
  const roomCount  = 5 + roll(4); // 6–9 rooms per run
  const escapeId   = context.escapeRoomId;
  const startId    = context.startRoomId;
  const startRoom  = context.roomPool.find(r => r.id === startId)!;
  const escapeRoom = context.roomPool.find(r => r.id === escapeId)!;

  const middle = [...context.roomPool]
    .filter(r => r.id !== startId && r.id !== escapeId)
    .sort(() => Math.random() - 0.5)
    .slice(0, roomCount - 2)
    .map(r => ({ id: r.id, name: r.name, desc: pick(r.descs) }));

  const findDesc = (id: string) => pick(context.roomPool.find(r => r.id === id)!.descs);

  const rooms = [
    { id: startId,  name: startRoom.name,  desc: findDesc(startId) },
    ...middle,
    { id: escapeId, name: escapeRoom.name, desc: findDesc(escapeId) },
  ];

  const connections: Record<string, string[]> = {};
  rooms.forEach((r, i) => {
    connections[r.id] = [];
    if (i > 0)               connections[r.id].push(rooms[i - 1].id);
    if (i < rooms.length - 1) connections[r.id].push(rooms[i + 1].id);
  });
  for (let i = 0; i < 2; i++) {
    const a = pick(rooms), b = pick(rooms);
    if (a.id !== b.id && !connections[a.id].includes(b.id)) {
      connections[a.id].push(b.id);
      connections[b.id].push(a.id);
    }
  }

  const enemies: Seed['enemies'] = {};
  const loot: Seed['loot']       = {};
  rooms.forEach(r => {
    if (r.id !== startId && Math.random() < 0.6) {
      enemies[r.id] = {
        name:   pick(context.enemyTypes),
        hp:     4 + roll(8),
        ac:     10 + roll(4),
        damage: `${roll(2)}d${pick([4, 6, 8])}`,
      };
    }
    if (Math.random() < 0.5) {
      loot[r.id] = weightedPick(context.lootTable);
    }
  });

  const worldName = pick(context.worldNames);

  return {
    context_id: context.id,
    world_name: worldName,
    ship_name:  worldName,
    intro:      pick(context.introTexts),
    rooms,
    connections,
    enemies,
    loot,
    seed_id:    randomUUID(),
  };
}
