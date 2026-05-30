// markerMove handler — the wilderness-encounter drop. A regional marker move
// that rolls an encounter materializes the rolled creature into the transient
// encounter room (seed.enemies) and drops the party into a local combat,
// bookmarking the return cell. (The pure stage/return + travel mechanics are
// covered in mapEngine.spec.ts; this guards the handler wiring.)

import type { CampaignData, EnemyTemplate, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from './types.js';
import { ENCOUNTER_ROOM_ID } from '../mapEngine.js';
import { handleMarkerMove } from './markerMove.js';
import { makeChar } from '../../test-fixtures.js';
import { pcActor } from './actor.js';

afterEach(() => vi.restoreAllMocks());

const bandit: EnemyTemplate = {
  name: 'Bandit Ruffian',
  cr: 1,
  hp: 11,
  ac: 12,
  damage: '1d6+1',
  toHit: 3,
  xp: 25,
};

const campaign: CampaignData = {
  world_name: 'Enc',
  intro: '',
  rooms: [],
  regions: [
    {
      id: 'reg1',
      name: 'Wilds',
      feetPerSquare: 5280,
      gridWidth: 12,
      gridHeight: 12,
      startPos: { x: 0, y: 0 },
      sites: [],
      encounterTable: ['Bandit Ruffian'],
      encounterChance: 1, // always triggers
    },
  ],
};

function ctxFor(): ActionContext {
  const char = makeChar({ id: 'pc-1' });
  const st = {
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x: 0, y: 0 },
    characters: [char],
    combat_active: false,
    visited_rooms: [],
  } as unknown as GameState;
  const seed = { rooms: [], enemies: {} } as unknown as Seed;
  return {
    actor: pcActor(char, 0),
    st,
    seed,
    context: { campaign, enemyTemplates: [bandit] },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleMarkerMove — wilderness encounter drop', () => {
  it('drops the party into a local combat against the rolled creature', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // < chance → encounter; index 0 → Bandit Ruffian
    const ctx = ctxFor();

    handleMarkerMove(ctx, { type: 'marker_move', to: { x: 3, y: 0 } });

    // Party dropped off the map into the transient encounter room.
    expect(ctx.st.map_level).toBe('local');
    expect(ctx.st.current_room).toBe(ENCOUNTER_ROOM_ID);
    expect(ctx.st.encounter_return).toMatchObject({ level: 'regional', region_id: 'reg1' });

    // The rolled creature is seeded into the encounter room as a live enemy.
    const enemies = ctx.seed.enemies[ENCOUNTER_ROOM_ID];
    expect(enemies).toHaveLength(1);
    expect(enemies[0].name).toBe('Bandit Ruffian');
    expect(enemies[0].hp).toBeGreaterThan(0);

    expect(ctx.narrative).toContain('Ambush');
  });

  it('rejects a non-PC actor', () => {
    const ctx = ctxFor();
    const enemyish = { kind: 'enemy' } as unknown as ActionContext['actor'];
    const res = handleMarkerMove(
      { ...ctx, actor: enemyish },
      { type: 'marker_move', to: { x: 1, y: 0 } }
    );
    expect(res).toMatchObject({ rejected: expect.stringContaining('party') });
  });
});
