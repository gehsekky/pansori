// SRD 5.2.1 encounter scaling by COUNT (not stat block), relative to the
// campaign's recommendedPartySize. See enemyFactory.scaleRoomEnemiesByCount.

import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../types.js';
import { scaleRoomEnemiesByCount } from '../../services/enemyFactory.js';

const mob = (id: string, name: string, hp = 26, xp = 200): Enemy =>
  ({ id, name, hp, maxHp: hp, ac: 14, damage: '1d8+3', toHit: 5, xp }) as Enemy;

const names = (es: Enemy[]) => es.map((e) => e.name);
const ids = (es: Enemy[]) => es.map((e) => e.id);

describe('scaleRoomEnemiesByCount — count scaling, recommendedPartySize-relative', () => {
  const room = 'thornwood_maze';
  const spiders = [mob(`${room}#0`, 'Giant Spider'), mob(`${room}#1`, 'Giant Spider')];

  it('a party at the recommended size faces the authored count (1×)', () => {
    const out = scaleRoomEnemiesByCount(room, spiders, 4, 4);
    expect(out).toHaveLength(2); // the fair, authored fight — not 5
    expect(names(out)).toEqual(['Giant Spider', 'Giant Spider']);
  });

  it('a larger party gets more, with fresh non-colliding ids', () => {
    const out = scaleRoomEnemiesByCount(room, spiders, 8, 4); // 2 × (8/4) = 4
    expect(out).toHaveLength(4);
    // originals preserved, clones minted above the max existing index
    expect(ids(out)).toEqual([`${room}#0`, `${room}#1`, `${room}#2`, `${room}#3`]);
    expect(new Set(ids(out)).size).toBe(4); // no id collisions
    expect(out.every((e) => e.hp === 26)).toBe(true); // stat block untouched
  });

  it('an under-sized party gets fewer, but never zero (min 1 per group)', () => {
    expect(scaleRoomEnemiesByCount(room, spiders, 1, 4)).toHaveLength(1); // floor(0.5)→0, clamped to 1
    expect(scaleRoomEnemiesByCount(room, spiders, 2, 4)).toHaveLength(1); // floor(1.0)=1
  });

  it('a count-1 placement (boss / quest target) is never cloned or dropped', () => {
    const boss = mob('ancient_oak#0', 'Fey Trickster', 90, 700);
    const minion = [mob('ancient_oak#1', 'Thornbound Wolf', 11, 50)];
    // Even a huge party leaves both singletons singular.
    const out = scaleRoomEnemiesByCount('ancient_oak', [boss, ...minion], 12, 4);
    expect(names(out).filter((n) => n === 'Fey Trickster')).toHaveLength(1);
    expect(names(out).filter((n) => n === 'Thornbound Wolf')).toHaveLength(1);
    expect(ids(out)).toContain('ancient_oak#0'); // pinned id preserved
  });

  it('scales a multi-mob group while leaving a co-located boss singleton alone', () => {
    const mixed = [
      mob('crypt#0', 'Crypt Lord', 120, 1800),
      mob('crypt#1', 'Skeleton', 13, 50),
      mob('crypt#2', 'Skeleton', 13, 50),
    ];
    const out = scaleRoomEnemiesByCount('crypt', mixed, 8, 4); // 2× → boss×1, skeletons 2→4
    expect(names(out).filter((n) => n === 'Crypt Lord')).toHaveLength(1);
    expect(names(out).filter((n) => n === 'Skeleton')).toHaveLength(4);
    expect(new Set(ids(out)).size).toBe(out.length); // all ids unique
  });
});
