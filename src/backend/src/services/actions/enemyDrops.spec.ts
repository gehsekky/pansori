// Enemy loot drops — on death, a slain enemy's `drops` items + `goldDrop` are
// awarded to the PC who killed it. grantEnemyDrops is the shared helper the
// spell / weapon / AoE kill branches call.

import { describe, expect, it } from 'vitest';
import type { ActionContext } from './types.js';
import type { LootItem } from '../../types.js';
import { grantEnemyDrops } from './enemyDrops.js';
import { makeChar } from '../../test-fixtures.js';

const DAGGER: LootItem = {
  id: 'dagger',
  name: 'Dagger',
  weight: 1,
  desc: 'A simple blade.',
  type: 'weapon',
  slot: 'weapon',
  damage: '1d4',
  ac_bonus: null,
  heal: null,
  effect: null,
  aliases: ['knife'],
};

function ctxFor(char: ReturnType<typeof makeChar>): ActionContext {
  return {
    actor: { kind: 'pc', char },
    context: { lootTable: [DAGGER] },
    narrative: '',
  } as unknown as ActionContext;
}

describe('grantEnemyDrops', () => {
  it('adds dropped items + gold to the killer and narrates it', () => {
    const char = makeChar({ id: 'pc-1', gold: 5, inventory: [] });
    const ctx = ctxFor(char);
    grantEnemyDrops(ctx, { name: 'Bandit', drops: ['dagger'], goldDrop: 12 });
    expect(ctx.actor.kind === 'pc' && ctx.actor.char.gold).toBe(17);
    const inv = ctx.actor.kind === 'pc' ? ctx.actor.char.inventory : [];
    expect(inv).toHaveLength(1);
    expect(inv?.[0].id).toBe('dagger');
    expect(inv?.[0].instance_id).toBeTruthy();
    expect(ctx.narrative).toMatch(/Bandit drops: Dagger \+ 12 gp/);
  });

  it('is a no-op when the enemy has no drops or gold', () => {
    const char = makeChar({ id: 'pc-1', gold: 5, inventory: [] });
    const ctx = ctxFor(char);
    grantEnemyDrops(ctx, { name: 'Rat' });
    expect(ctx.actor.kind === 'pc' && ctx.actor.char.gold).toBe(5);
    expect(ctx.narrative).toBe('');
  });

  it('skips unknown item ids but still awards gold', () => {
    const char = makeChar({ id: 'pc-1', gold: 0, inventory: [] });
    const ctx = ctxFor(char);
    grantEnemyDrops(ctx, { name: 'Ghoul', drops: ['nonexistent'], goldDrop: 3 });
    const inv = ctx.actor.kind === 'pc' ? ctx.actor.char.inventory : [];
    expect(inv).toHaveLength(0);
    expect(ctx.actor.kind === 'pc' && ctx.actor.char.gold).toBe(3);
    expect(ctx.narrative).toMatch(/3 gp/);
  });

  it('does not drop loot for a non-PC killer (friendly fire)', () => {
    const ctx = {
      actor: { kind: 'enemy' },
      context: { lootTable: [DAGGER] },
      narrative: '',
    } as unknown as ActionContext;
    grantEnemyDrops(ctx, { name: 'Skeleton', drops: ['dagger'], goldDrop: 9 });
    expect(ctx.narrative).toBe('');
  });
});
