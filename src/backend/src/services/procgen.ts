import type { Context, Enemy, GridPos, LootItem, PlacedNpc, Room, Seed } from '../types.js';
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

  const rooms: Room[] = [
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
  const gridW = context.gridWidth ?? 8;
  const gridH = context.gridHeight ?? 8;
  // 60% of combat rooms get 1-3 obstacles placed in the middle band so they
  // don't collide with PC (rows 0-1, companions at row 2) or enemy spawn
  // points (row gh-2). Middle band: y in [3, gh-3], x in [1, gw-2].
  function seedObstacles(): GridPos[] {
    const yMin = 3;
    const yMax = Math.max(yMin, gridH - 3); // inclusive upper bound
    const yRange = yMax - yMin + 1;
    if (yRange <= 0 || gridW < 4) return [];
    const count = 1 + roll(3); // 1-3 obstacles
    const taken = new Set<string>();
    const out: GridPos[] = [];
    for (let tries = 0; tries < 20 && out.length < count; tries++) {
      const x = 1 + roll(gridW - 2) - 1; // [1, gridW-2]
      const y = yMin + roll(yRange) - 1; // [yMin, yMax]
      const key = `${x},${y}`;
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ x, y });
    }
    return out;
  }

  // Difficult terrain — 2× movement cost cells (rubble, vines, ice, mud).
  // Same middle band as obstacles so it doesn't intrude on spawn rows.
  // Skips cells already taken by obstacles in this room so they don't
  // stack visually + mechanically on the same square.
  function seedDifficultTerrain(existing: GridPos[]): GridPos[] {
    const yMin = 3;
    const yMax = Math.max(yMin, gridH - 3);
    const yRange = yMax - yMin + 1;
    if (yRange <= 0 || gridW < 4) return [];
    const count = 1 + roll(3); // 1-3 cells
    const taken = new Set<string>(existing.map((p) => `${p.x},${p.y}`));
    const out: GridPos[] = [];
    for (let tries = 0; tries < 20 && out.length < count; tries++) {
      const x = 1 + roll(gridW - 2) - 1;
      const y = yMin + roll(yRange) - 1;
      const key = `${x},${y}`;
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ x, y });
    }
    return out;
  }

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
          packTactics: template.packTactics,
          bloodiedFrenzy: template.bloodiedFrenzy,
          bonusDamage: template.bonusDamage,
          bonusDamageType: template.bonusDamageType,
          undeadFortitude: template.undeadFortitude,
          lifeDrain: template.lifeDrain,
          parry: template.parry,
          parryBonus: template.parryBonus,
          rampage: template.rampage,
          aura: template.aura,
          legendary_actions: template.legendary_actions,
          legendary_pool: template.legendary_pool,
          legendary_action_points: template.legendary_actions
            ? (template.legendary_pool ?? 3)
            : undefined,
          lair_actions: template.lair_actions,
        },
      ];
    }
    if (Math.random() < 0.5) {
      loot[r.id] = weightedPick(context.lootTable);
    }
    // Static obstacles — only for rooms with enemies (combat rooms). Seeded
    // after enemy gen so we can target the same rooms. 60% chance per
    // combat room; 1-3 obstacles in the middle band.
    if (enemies[r.id] && Math.random() < 0.6) {
      const obs = seedObstacles();
      if (obs.length) r.obstacles = obs;
    }
    // Difficult terrain — 40% chance per combat room, 1-3 cells. Skips
    // cells already used by obstacles in this room.
    if (enemies[r.id] && Math.random() < 0.4) {
      const dt = seedDifficultTerrain(r.obstacles ?? []);
      if (dt.length) r.difficultTerrain = dt;
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
