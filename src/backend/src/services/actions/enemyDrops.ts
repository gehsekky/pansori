import type { ActionContext } from './types.js';
import { fmt } from '../narrativeFmt.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from './actor.js';

// What grantEnemyDrops needs off a slain enemy — the stat block carries these.
interface Droppable {
  name: string;
  drops?: string[];
  goldDrop?: number;
}

/**
 * Award a slain enemy's loot to the PC who killed it: instantiate each `drops`
 * item id (resolved from the campaign lootTable) into the killer's inventory,
 * add `goldDrop` coins to their purse, and append a "[X drops: …]" note to the
 * narrative. No-op when the actor isn't a PC (e.g. friendly-fire kills) or the
 * enemy has no loot. Call from a kill branch after XP is awarded.
 */
export function grantEnemyDrops(ctx: ActionContext, enemy: Droppable): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const items = (enemy.drops ?? [])
    .map((id) => {
      const item = ctx.context.lootTable.find((l) => l.id === id);
      return item ? { ...item, instance_id: randomUUID() } : null;
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);
  const gold = enemy.goldDrop ?? 0;
  if (items.length === 0 && gold <= 0) return;

  updatePcActor(ctx, {
    inventory: [...(char.inventory ?? []), ...items],
    gold: (char.gold ?? 0) + gold,
  });

  const parts: string[] = [];
  if (items.length) parts.push(items.map((i) => i.name).join(', '));
  if (gold > 0) parts.push(`${gold} gp`);
  ctx.narrative += ` ${fmt.note(`[${enemy.name} drops: ${parts.join(' + ')}]`)}`;
}
