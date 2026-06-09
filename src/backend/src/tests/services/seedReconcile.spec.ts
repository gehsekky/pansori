// reconcileSeedWithContext — re-resolving a running session's seed against the
// live campaign so creator edits show up on refresh, WITHOUT resetting live
// combat / cleared state in rooms the party has already entered.

import type { Context, GameState } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { generateSeed, reconcileSeedWithContext } from '../../services/procgen.js';
import { ENCOUNTER_ROOM_ID } from '../../services/mapEngine.js';
import { context as baseCtx } from '../fixtures/testContext.js';

// The test fixture's campaign places one enemy each in guard_post / bone_crypt /
// great_hall / cultist_chamber. We treat guard_post as the room the party has
// already cleared and bone_crypt as one they haven't reached.
const VISITED = 'guard_post';
const UNVISITED = 'bone_crypt';

// A live game state: party of 2, has entered (and cleared) guard_post only.
const state = {
  characters: [{}, {}],
  visited_rooms: [VISITED],
  enemies_killed: [`${VISITED}#0`],
  current_room: VISITED,
} as unknown as GameState;

// An "edited campaign": the creator renamed the world, rewrote both rooms'
// descriptions, and buffed the (un-reached) bone_crypt enemy to 999 HP.
function editedContext(): Context {
  const c = baseCtx.campaign!;
  return {
    ...baseCtx,
    theme: { ...baseCtx.theme, primary: '#abcdef' },
    campaign: {
      ...c,
      world_name: 'Rewritten World',
      rooms: c.rooms.map((r) => ({ ...r, desc: `EDITED ${r.id}` })),
      enemies: {
        ...c.enemies,
        [UNVISITED]: (c.enemies?.[UNVISITED] ?? []).map((e) => ({ ...e, hp: 999 })),
      },
    },
  } as Context;
}

describe('reconcileSeedWithContext', () => {
  it('refreshes presentation everywhere but locks engaged rooms’ placements', () => {
    // The running seed, with guard_post's enemy mid-combat (HP whittled to 1).
    const existing = generateSeed(baseCtx, state.characters.length);
    existing.enemies[VISITED] = existing.enemies[VISITED].map((e) => ({ ...e, hp: 1 }));
    const beforeWorld = existing.world_name;

    const merged = reconcileSeedWithContext(existing, editedContext(), state);

    // Presentation + structure are taken fresh — even for the room the party
    // is standing in.
    expect(merged.world_name).toBe('Rewritten World');
    expect(merged.world_name).not.toBe(beforeWorld);
    expect(merged.theme?.primary).toBe('#abcdef');
    expect(merged.rooms.find((r) => r.id === VISITED)?.desc).toBe(`EDITED ${VISITED}`);
    expect(merged.rooms.find((r) => r.id === UNVISITED)?.desc).toBe(`EDITED ${UNVISITED}`);

    // A VISITED room keeps its live placement (the whittled-down HP), NOT the
    // fresh full-HP enemy — combat is preserved, nothing resurrects.
    expect(merged.enemies[VISITED][0].hp).toBe(1);

    // An UNREACHED room takes the edited placement (the 999-HP buff shows up).
    expect(merged.enemies[UNVISITED][0].hp).toBe(999);

    // Identity is carried over from the running seed.
    expect(merged.seed_id).toBe(existing.seed_id);
    expect(merged.context_id).toBe(existing.context_id);
  });

  it('does not spawn enemies into a visited room that had none', () => {
    const existing = generateSeed(baseCtx, 1);
    // Party has entered storage_room (no enemies in the fixture there).
    const visitedEmpty = {
      characters: [{}],
      visited_rooms: ['storage_room'],
      enemies_killed: [],
    } as unknown as GameState;
    // Edited campaign adds an enemy to storage_room.
    const c = baseCtx.campaign!;
    const edited = {
      ...baseCtx,
      campaign: {
        ...c,
        enemies: { ...c.enemies, storage_room: c.enemies![UNVISITED] },
      },
    } as Context;

    const merged = reconcileSeedWithContext(existing, edited, visitedEmpty);
    // The visited-but-empty room stays empty — no surprise spawn behind the party.
    expect(merged.enemies.storage_room).toBeUndefined();
  });

  it('preserves an in-progress wilderness encounter (room + enemies) across a refresh', () => {
    const existing = generateSeed(baseCtx, 1);
    // Simulate a staged wilderness encounter: a transient room + its rolled
    // enemies live only on the run seed (never in the authored campaign).
    existing.rooms = [
      ...existing.rooms,
      { id: ENCOUNTER_ROOM_ID, name: 'Ambush', desc: '', floor: 'grass' } as never,
    ];
    existing.enemies = {
      ...existing.enemies,
      [ENCOUNTER_ROOM_ID]: [
        { id: `${ENCOUNTER_ROOM_ID}#0`, name: 'Goblin Warrior', hp: 3 } as never,
      ],
    };
    // The encounter room is NOT in visited_rooms — preservation is by its id.
    const fighting = { characters: [{}], visited_rooms: [] } as unknown as GameState;

    const merged = reconcileSeedWithContext(existing, baseCtx, fighting);
    expect(merged.rooms.find((r) => r.id === ENCOUNTER_ROOM_ID)?.floor).toBe('grass');
    expect(merged.enemies[ENCOUNTER_ROOM_ID]?.[0]?.hp).toBe(3);
  });

  it('returns the seed untouched when the context has no campaign data', () => {
    const existing = generateSeed(baseCtx, 1);
    const noCampaign = { ...baseCtx, campaign: undefined } as Context;
    expect(reconcileSeedWithContext(existing, noCampaign, state)).toBe(existing);
  });
});
