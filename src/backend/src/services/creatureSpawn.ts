import type { CombatEntity, Enemy, EnemyTemplate, GridPos, SummonedAlly } from '../types.js';
import { ENCOUNTER_ROOM_ID, stageEncounter } from './mapEngine.js';
import { abilityMod, d } from './rulesEngine.js';
import { combatGridDims, seedSummonedAllies } from './gameEngine.js';
import type { ActionContext } from './actions/types.js';
import { adjacentPositions } from './gridEngine.js';
import { materializeEnemy } from './enemyFactory.js';
import { randomUUID } from 'crypto';
import { runCombatStart } from './actions/attack/combatStart.js';

/**
 * Creatures a magic item lets loose that the party doesn't command: an Efreeti
 * that attacks whoever opened its bottle, a Swarm of Rats that resists the
 * Pipes of the Sewers, the Mysterious Deck's Avatar of Death.
 *
 * The creature is added to the room's enemies on the run seed (where every
 * enemy lives). In a fight it joins the initiative order straight after the
 * acting PC, on a free square beside them; out of combat it starts a fight
 * (on the map, as a wilderness encounter). `hunts` names the one creature it
 * attacks while that creature stands (Avatar of Death).
 */
export function spawnHostile(
  ctx: ActionContext,
  template: EnemyTemplate,
  opts: { tag: string; hp?: number; hunts?: string; extra?: Partial<Enemy> } = { tag: 'item' }
): Enemy | undefined {
  if (ctx.actor.kind !== 'pc') return undefined;
  const { char } = ctx.actor;
  const staged = !ctx.st.current_room;
  const roomKey = staged ? ENCOUNTER_ROOM_ID : ctx.st.current_room;
  const hp = opts.hp ?? template.hp;
  const enemy: Enemy = {
    ...materializeEnemy(template, `${roomKey}#${opts.tag}-${randomUUID()}`, hp),
    ...(opts.extra ?? {}),
  };
  const roomList = staged ? [] : (ctx.seed.enemies?.[roomKey] ?? []);
  ctx.seed.enemies = { ...(ctx.seed.enemies ?? {}), [roomKey]: [...roomList, enemy] };

  if (ctx.st.combat_active) {
    const pos = freeCellNear(ctx, char.id);
    const ent: CombatEntity = {
      id: enemy.id,
      isEnemy: true,
      pos,
      hp,
      maxHp: hp,
      conditions: [],
      condition_durations: {},
      ...(opts.hunts ? { commanded_target_id: opts.hunts } : {}),
    };
    // It acts straight after the PC whose item let it out.
    const order = ctx.st.initiative_order ?? [];
    const at = order.findIndex((e) => e.id === char.id);
    const entry = { id: enemy.id, roll: d(20) + abilityMod(enemy.dex), is_enemy: true };
    ctx.st = {
      ...ctx.st,
      entities: [...(ctx.st.entities ?? []), ent],
      initiative_order:
        at >= 0 ? [...order.slice(0, at + 1), entry, ...order.slice(at + 1)] : [...order, entry],
    };
    return enemy;
  }

  // Out of combat — the creature starts a fight. On the map the party is dropped
  // into a transient encounter, as for a wandering monster.
  if (staged) ctx.st = stageEncounter(ctx.st);
  const lead = ctx.narrative ?? '';
  const combatCtx: ActionContext = {
    ...ctx,
    roomId: roomKey,
    livingEnemiesInRoom: staged ? [enemy] : [...ctx.livingEnemiesInRoom, enemy],
    narrative: '',
  };
  runCombatStart(combatCtx, enemy);
  ctx.st = combatCtx.st;
  if (opts.hunts) {
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === enemy.id ? { ...e, commanded_target_id: opts.hunts } : e
      ),
    };
  }
  ctx.narrative = `${lead} ${combatCtx.narrative}`;
  return enemy;
}

/**
 * A creature an item puts at the party's command (a released Efreeti, a swayed
 * Swarm of Rats). It is kept with the party's other summons; in a fight it joins
 * at once, acting right after its owner, else it joins the next battle.
 */
export function joinAlly(ctx: ActionContext, ally: Omit<SummonedAlly, 'id' | 'ownerId'>): void {
  if (ctx.actor.kind !== 'pc') return;
  const summon: SummonedAlly = {
    id: `summon-${randomUUID()}`,
    ownerId: ctx.actor.char.id,
    ...ally,
  };
  ctx.st = { ...ctx.st, summoned_allies: [...(ctx.st.summoned_allies ?? []), summon] };
  if (ctx.st.combat_active && ctx.st.entities) ctx.st = seedSummonedAllies(ctx.st);
}

/** A stat block as an ally (one attack line, like every summon). */
export function allyFrom(
  template: EnemyTemplate
): Pick<SummonedAlly, 'name' | 'ac' | 'maxHp' | 'toHit' | 'damage'> {
  return {
    name: template.name,
    ac: template.ac,
    maxHp: template.hp,
    toHit: template.toHit,
    damage: template.damage,
  };
}

/** An unoccupied in-bounds square next to `id`'s token (else any free square). */
function freeCellNear(ctx: ActionContext, id: string): GridPos {
  const { w, h } = combatGridDims(ctx.st.current_room, ctx.seed, ctx.context);
  const ents = ctx.st.entities ?? [];
  const blocked = new Set([
    ...ents.filter((e) => e.hp > 0).map((e) => `${e.pos.x},${e.pos.y}`),
    ...ctx.roomObstacleCells.map((p) => `${p.x},${p.y}`),
  ]);
  const ok = (p: GridPos) =>
    p.x >= 0 && p.y >= 0 && p.x < w && p.y < h && !blocked.has(`${p.x},${p.y}`);
  const origin = ents.find((e) => e.id === id)?.pos;
  const near = origin ? adjacentPositions(origin).find(ok) : undefined;
  if (near) return near;
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) if (ok({ x, y })) return { x, y };
  return { x: Math.max(0, w - 2), y: Math.max(0, h - 2) };
}
