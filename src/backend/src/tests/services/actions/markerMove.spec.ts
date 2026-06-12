// markerMove handler — the wilderness-encounter drop. A regional marker move
// that rolls an encounter materializes the rolled creature into the transient
// encounter room (seed.enemies) and drops the party into a local combat,
// bookmarking the return cell. (The pure stage/return + travel mechanics are
// covered in mapEngine.spec.ts; this guards the handler wiring.)

import type { CampaignData, EnemyTemplate, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../../services/actions/types.js';
import { ENCOUNTER_ROOM_ID } from '../../../services/mapEngine.js';
import { handleMarkerMove } from '../../../services/actions/markerMove.js';
import { makeChar } from '../../../test-fixtures.js';
import { pcActor } from '../../../services/actions/actor.js';

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
      // A full-grid Tier-1 zone that always triggers (encounters are zones-only).
      encounterZones: [
        {
          id: 'wilds',
          tier: 1,
          encounterChance: 1,
          encounterTable: ['Bandit Ruffian'],
          cells: Array.from({ length: 12 * 12 }, (_, i) => ({ x: i % 12, y: Math.floor(i / 12) })),
        },
      ],
    },
  ],
};

function ctxFor(
  camp: CampaignData = campaign,
  templates: EnemyTemplate[] = [bandit]
): ActionContext {
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
    context: { campaign: camp, enemyTemplates: templates, narratives: {} },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleMarkerMove — travelMove narrative pool', () => {
  // The same region without encounter zones — plain moves only.
  const calm: CampaignData = {
    ...campaign,
    regions: [{ ...campaign.regions![0], encounterZones: [] }],
  };

  it('uses the campaign pool with {distance} substituted (overland → miles)', () => {
    const ctx = ctxFor(calm);
    (ctx.context as unknown as { narratives: Record<string, unknown> }).narratives = {
      travelMove: ['The party slogs {distance} through the peat.'],
    };
    handleMarkerMove(ctx, { type: 'marker_move', to: { x: 2, y: 0 } });
    expect(ctx.narrative).toContain('The party slogs 2 miles through the peat.');
  });

  it('falls back to the stock line when no pool is authored', () => {
    const ctx = ctxFor(calm);
    handleMarkerMove(ctx, { type: 'marker_move', to: { x: 1, y: 0 } });
    expect(ctx.narrative).toContain('The party moves across the map.');
  });

  it('a line that spends {hours} owns the time report — no automatic suffix', () => {
    const ctx = ctxFor(calm);
    (ctx.context as unknown as { narratives: Record<string, unknown> }).narratives = {
      travelMove: ['{distance} and {hours} gone, the carr unbroken ahead.'],
    };
    // 3 squares × 1 mile at Normal pace (3 mph) = exactly the 1-hour turn.
    handleMarkerMove(ctx, { type: 'marker_move', to: { x: 3, y: 0 } });
    expect(ctx.narrative).toContain('3 miles and 1 hour gone, the carr unbroken ahead.');
    expect(ctx.narrative).not.toContain('hr of travel');
  });

  it('a line without {hours} keeps the engine suffix on hour-long marches', () => {
    const ctx = ctxFor(calm);
    (ctx.context as unknown as { narratives: Record<string, unknown> }).narratives = {
      travelMove: ['The party slogs {distance}.'],
    };
    handleMarkerMove(ctx, { type: 'marker_move', to: { x: 3, y: 0 } });
    expect(ctx.narrative).toContain('The party slogs 3 miles.');
    expect(ctx.narrative).toContain('(1 hr of travel.)');
  });
});

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

    // Combat auto-starts — no out-of-combat "Attack" step. Tokens are deployed
    // (the PC + the enemy) and initiative is rolled.
    expect(ctx.st.combat_active).toBe(true);
    expect(ctx.st.initiative_order.length).toBe(2);
    expect(ctx.st.entities?.some((e) => e.isEnemy && e.id === enemies[0].id)).toBe(true);
    expect(ctx.st.entities?.some((e) => !e.isEnemy && e.id === 'pc-1')).toBe(true);

    expect(ctx.narrative).toContain('Ambush');
    expect(ctx.narrative).toContain('Initiative');
  });

  it('spawns a whole mixed group and names it in the ambush line', () => {
    const goblin: EnemyTemplate = {
      name: 'Goblin Scout',
      cr: 0.25,
      hp: 7,
      ac: 13,
      damage: '1d6',
      toHit: 4,
      xp: 50,
    };
    // A zone whose only entry is a fixed group: 2 Bandit Ruffians + 1 Goblin Scout.
    const groupCampaign: CampaignData = {
      ...campaign,
      regions: [
        {
          ...campaign.regions![0],
          encounterZones: [
            {
              ...campaign.regions![0].encounterZones![0],
              encounterTable: [
                {
                  group: [
                    { name: 'Bandit Ruffian', count: 2 },
                    { name: 'Goblin Scout', count: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    vi.spyOn(Math, 'random').mockReturnValue(0); // trigger + pick the only entry
    const ctx = ctxFor(groupCampaign, [bandit, goblin]);

    handleMarkerMove(ctx, { type: 'marker_move', to: { x: 3, y: 0 } });

    // Party at recommended size (1 PC / default recommended 1) → authored counts.
    const enemies = ctx.seed.enemies[ENCOUNTER_ROOM_ID];
    expect(enemies.map((e) => e.name).sort()).toEqual([
      'Bandit Ruffian',
      'Bandit Ruffian',
      'Goblin Scout',
    ]);
    // Every group member gets a distinct id (so a repeat fight isn't pre-killed).
    expect(new Set(enemies.map((e) => e.id)).size).toBe(3);
    // The ambush line reads the whole group grammatically.
    expect(ctx.narrative).toContain('2 Bandit Ruffians and a Goblin Scout fall upon the party');
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
