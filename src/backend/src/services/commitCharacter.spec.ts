import { describe, expect, it } from 'vitest';
import { commitCharacter } from './gameEngine.js';
import { makeState } from '../test-fixtures.js';

describe('commitCharacter', () => {
  it('writes char back into characters[] by id', () => {
    const st = makeState({ id: 'pc-1', hp: 10 });
    const next = commitCharacter(st, { ...st.characters[0], hp: 5 });
    expect(next.characters[0].hp).toBe(5);
  });

  it('syncs entity.hp for PC entities (the mirror)', () => {
    const st = {
      ...makeState({ id: 'pc-1', hp: 10 }),
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 0, y: 0 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const next = commitCharacter(st, { ...st.characters[0], hp: 3 });
    expect(next.characters[0].hp).toBe(3);
    expect(next.entities?.[0].hp).toBe(3);
  });

  it('syncs entity.conditions for PC entities', () => {
    const st = {
      ...makeState({ id: 'pc-1', conditions: [] }),
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 0, y: 0 },
          hp: 10,
          maxHp: 10,
          conditions: [] as string[],
          condition_durations: {},
        },
      ],
    };
    const next = commitCharacter(st, { ...st.characters[0], conditions: ['poisoned'] });
    expect(next.characters[0].conditions).toEqual(['poisoned']);
    expect(next.entities?.[0].conditions).toEqual(['poisoned']);
  });

  it('does NOT touch enemy entities when a PC commits', () => {
    const st = {
      ...makeState({ id: 'pc-1', hp: 10 }),
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 0, y: 0 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'enemy-1',
          isEnemy: true as const,
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const next = commitCharacter(st, { ...st.characters[0], hp: 5 });
    // PC entity synced
    expect(next.entities?.[0].hp).toBe(5);
    // Enemy entity unchanged — its hp would be a separate write
    expect(next.entities?.[1].hp).toBe(20);
  });

  it('is a no-op when char.id is not in characters[]', () => {
    const st = makeState({ id: 'pc-1' });
    const next = commitCharacter(st, { ...st.characters[0], id: 'unknown', hp: 5 });
    expect(next).toBe(st); // returns the original state untouched
  });

  it('works when entities array is undefined (out-of-combat state)', () => {
    const st = makeState({ id: 'pc-1', hp: 10 });
    expect(st.entities).toBeUndefined();
    const next = commitCharacter(st, { ...st.characters[0], hp: 5 });
    expect(next.characters[0].hp).toBe(5);
    // No entities array on input means nothing to sync — output stays consistent
    expect(next.entities).toBeUndefined();
  });
});
