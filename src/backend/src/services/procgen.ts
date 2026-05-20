import type { Context, Enemy, LootItem, PlacedNpc, Seed } from '../types.js';
import { randomUUID } from 'crypto';

function roll(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(table: LootItem[]): LootItem {
  const total = table.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of table) {
    r -= item.weight;
    if (r <= 0) return { ...item };
  }
  return { ...table[0] };
}

export function generateSeed(context: Context, partySize = 1): Seed {
  if (context.mapType === 'campaign' && context.campaign) {
    const c = context.campaign;
    // Scale campaign enemy HP by party size
    const scaledEnemies: Record<string, Enemy[]> = {};
    for (const [roomId, enemiesInRoom] of Object.entries(c.enemies ?? {})) {
      scaledEnemies[roomId] = enemiesInRoom.map((enemy) => {
        const scaled = scaleEnemyHp(enemy.hp, partySize);
        return { ...enemy, hp: scaled, maxHp: scaled };
      });
    }
    return {
      context_id: context.id,
      world_name: c.world_name,
      ship_name: c.world_name,
      intro: c.intro,
      rooms: c.rooms,
      connections: c.connections,
      enemies: scaledEnemies,
      loot: c.loot ?? {},
      npcs: c.npcs ?? {},
      seed_id: randomUUID(),
    };
  }
  return generateRoguelikeSeed(context, partySize);
}

// HP scaling formula: 1× solo, 1.5× 2-player, 2× 3-player, 2.5× 4-player
function scaleEnemyHp(baseHp: number, partySize: number): number {
  return Math.max(1, Math.round(baseHp * (0.5 + partySize * 0.5)));
}

export function generateRoguelikeSeed(context: Context, partySize = 1): Seed {
  const roomCount = 5 + roll(4); // 6–9 rooms per run
  const escapeId = context.escapeRoomId;
  const startId = context.startRoomId;
  const startRoom = context.roomPool.find((r) => r.id === startId)!;
  const escapeRoom = context.roomPool.find((r) => r.id === escapeId)!;

  const middle = [...context.roomPool]
    .filter((r) => r.id !== startId && r.id !== escapeId)
    .sort(() => Math.random() - 0.5)
    .slice(0, roomCount - 2)
    .map((r) => ({
      id: r.id,
      name: r.name,
      desc: pick(r.descs),
      ...(r.trap ? { trap: r.trap } : {}),
      ...(r.objects?.length ? { objects: r.objects } : {}),
    }));

  const findDesc = (id: string) => pick(context.roomPool.find((r) => r.id === id)!.descs);
  const findTrap = (id: string) => context.roomPool.find((r) => r.id === id)?.trap;
  const findObjects = (id: string) => context.roomPool.find((r) => r.id === id)?.objects;

  const rooms = [
    {
      id: startId,
      name: startRoom.name,
      desc: findDesc(startId),
      ...(findTrap(startId) ? { trap: findTrap(startId) } : {}),
      ...(findObjects(startId)?.length ? { objects: findObjects(startId) } : {}),
    },
    ...middle,
    {
      id: escapeId,
      name: escapeRoom.name,
      desc: findDesc(escapeId),
      ...(findTrap(escapeId) ? { trap: findTrap(escapeId) } : {}),
      ...(findObjects(escapeId)?.length ? { objects: findObjects(escapeId) } : {}),
    },
  ];

  const connections: Record<string, string[]> = {};
  rooms.forEach((r, i) => {
    connections[r.id] = [];
    if (i > 0) connections[r.id].push(rooms[i - 1].id);
    if (i < rooms.length - 1) connections[r.id].push(rooms[i + 1].id);
  });
  for (let i = 0; i < 2; i++) {
    const a = pick(rooms),
      b = pick(rooms);
    if (a.id !== b.id && !connections[a.id].includes(b.id)) {
      connections[a.id].push(b.id);
      connections[b.id].push(a.id);
    }
  }

  // BFS from start to determine each room's distance for CR scaling
  const dist: Record<string, number> = { [startId]: 0 };
  const queue = [startId];
  while (queue.length) {
    const curr = queue.shift()!;
    for (const next of connections[curr] ?? []) {
      if (dist[next] === undefined) {
        dist[next] = dist[curr] + 1;
        queue.push(next);
      }
    }
  }
  const maxDist = Math.max(1, ...Object.values(dist));

  const enemies: Seed['enemies'] = {};
  const loot: Seed['loot'] = {};
  const npcs: Seed['npcs'] = {};
  rooms.forEach((r) => {
    if (r.id !== startId && Math.random() < 0.6) {
      const normalized = (dist[r.id] ?? 0) / maxDist;
      const maxCr = normalized < 0.34 ? 1 : normalized < 0.67 ? 5 : Infinity;
      const pool = context.enemyTemplates.filter((t) => t.cr <= maxCr);
      const template = pick(pool.length ? pool : context.enemyTemplates);
      const scaledHp = scaleEnemyHp(template.hp, partySize);
      enemies[r.id] = [
        {
          id: `${r.id}#0`,
          name: template.name,
          hp: scaledHp,
          maxHp: scaledHp,
          ac: template.ac,
          damage: template.damage,
          toHit: template.toHit,
          xp: template.xp,
          str: template.str,
          dex: template.dex,
          con: template.con,
          int: template.int,
          wis: template.wis,
          cha: template.cha,
          onHitEffect: template.onHitEffect,
          multiattack: template.multiattack,
          resistances: template.resistances,
          vulnerabilities: template.vulnerabilities,
          immunities: template.immunities,
          condition_immunities: template.condition_immunities,
          spells: template.spells,
          castChance: template.castChance,
          spellSaveDC: template.spellSaveDC,
          spellAttackBonus: template.spellAttackBonus,
          attackReachFt: template.attackReachFt,
          speedFt: template.speedFt,
          phases: template.phases,
          damageType: template.damageType,
        },
      ];
    }
    if (Math.random() < 0.5) {
      loot[r.id] = weightedPick(context.lootTable);
    }
    // NPC placement: only in rooms without an enemy, excluding start/escape
    const spawnChance = context.npcSpawnChance ?? 0;
    if (
      spawnChance > 0 &&
      context.npcTemplates?.length &&
      !enemies[r.id] &&
      r.id !== startId &&
      r.id !== context.escapeRoomId &&
      Math.random() < spawnChance
    ) {
      const template = pick(context.npcTemplates);
      const placed: PlacedNpc = { ...template, roomId: r.id };
      npcs[r.id] = placed;
    }
  });

  const worldName = pick(context.worldNames);

  return {
    context_id: context.id,
    world_name: worldName,
    ship_name: worldName,
    intro: pick(context.introTexts),
    rooms,
    connections,
    enemies,
    loot,
    npcs,
    seed_id: randomUUID(),
  };
}
