// On-map loot & containers: rooms hold multiple positioned items (PlacedLoot[]),
// each a clickable token. The "Pick up" / "Interact" choice is gated on the
// party marker being adjacent; the `approach` action walks the marker up. Items
// are gated per-placement key, so picking one leaves the others.

import type { GameState, PlacedLoot, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableLootIn, isLootTaken, placedLootIn } from './placedLoot.js';
import { buildArrivalNarrative, generateChoices, takeAction } from './gameEngine.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { makeState } from '../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const ROOM = 'vault';

const potion = (): PlacedLoot => ({
  id: 'potion',
  name: 'Potion',
  desc: '',
  weight: 1,
  type: 'consumable',
  slot: null,
  damage: null,
  ac_bonus: null,
  heal: '1d4',
  effect: null,
  aliases: [],
  pos: { x: 2, y: 2 },
});
const dagger = (): PlacedLoot => ({
  id: 'dagger',
  name: 'Dagger',
  desc: '',
  weight: 1,
  type: 'weapon',
  slot: 'weapon',
  damage: '1d4',
  ac_bonus: null,
  heal: null,
  effect: null,
  aliases: [],
  pos: { x: 5, y: 5 },
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Loot Map Test',
  ship_name: 'Loot Map Test',
  intro: '',
  seed_id: 'loot-map',
  rooms: [
    {
      id: ROOM,
      name: 'Vault',
      desc: '',
      gridWidth: 8,
      gridHeight: 8,
      entryPos: { x: 0, y: 0 },
      objects: [
        {
          id: 'chest',
          name: 'Iron Chest',
          desc: '',
          interactText: 'You work the lock.',
          searchable: true,
          searchDC: 5,
          lootIds: ['gem'],
          foundText: 'A gem!',
          emptyText: 'Locked.',
          pos: { x: 6, y: 6 },
        },
      ],
    },
  ],
  enemies: {},
  loot: { [ROOM]: [potion(), dagger()] },
  npcs: {},
};

function vaultState(marker: { x: number; y: number }, over: Partial<GameState> = {}): GameState {
  return makeState(
    { id: 'p1' },
    { current_room: ROOM, map_level: 'local', marker_pos: marker, ...over }
  );
}

const pickupLabels = (s: GameState) =>
  generateChoices(s, seed, ctx)
    .filter((c) => c.action.type === 'loot')
    .map((c) => c.label);

describe('placedLoot helpers', () => {
  it('normalizes a legacy single LootItem to a keyed one-element list', () => {
    const legacy = { loot: { [ROOM]: potion() } } as unknown as Seed;
    const list = placedLootIn(legacy, ROOM);
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe(`${ROOM}#0`);
  });

  it('derives stable keys per placement and gates taken items', () => {
    const list = placedLootIn(seed, ROOM);
    expect(list.map((l) => l.key)).toEqual([`${ROOM}#0`, `${ROOM}#1`]);
    const st = makeState({ id: 'p1' }, { loot_taken: [`${ROOM}#0`] });
    expect(isLootTaken(st, ROOM, list[0])).toBe(true);
    expect(isLootTaken(st, ROOM, list[1])).toBe(false);
    expect(availableLootIn(st, seed, ROOM).map((l) => l.id)).toEqual(['dagger']);
  });

  it('honors the legacy room-level gate for the first slot (old saves)', () => {
    const list = placedLootIn(seed, ROOM);
    const st = makeState({ id: 'p1' }, { loot_taken: [ROOM] });
    expect(isLootTaken(st, ROOM, list[0])).toBe(true); // ROOM#0 covered by bare roomId
    expect(isLootTaken(st, ROOM, list[1])).toBe(false);
  });
});

describe('Pick-up choices are adjacency-gated, one per item', () => {
  it('offers only the item the party is adjacent to', () => {
    expect(pickupLabels(vaultState({ x: 2, y: 2 }))).toEqual(['Pick up the Potion']);
    expect(pickupLabels(vaultState({ x: 5, y: 5 }))).toEqual(['Pick up the Dagger']);
  });

  it('offers nothing when the marker is far from every item', () => {
    expect(pickupLabels(vaultState({ x: 0, y: 0 }))).toEqual([]);
  });
});

describe('picking up by lootKey takes only that item', () => {
  it('removes the chosen placement, leaves the rest, records key + id', async () => {
    const result = await takeAction({
      action: { type: 'loot', lootKey: `${ROOM}#0` },
      history: [],
      state: vaultState({ x: 2, y: 2 }),
      seed,
      context: ctx,
    });
    const inv = result.newState.characters[0].inventory;
    expect(inv.map((i) => i.id)).toEqual(['potion']);
    expect(result.newState.loot_taken).toEqual(expect.arrayContaining([`${ROOM}#0`, 'potion']));
    // The dagger is still on the map (its key is untaken).
    expect(availableLootIn(result.newState, seed, ROOM).map((l) => l.id)).toEqual(['dagger']);
  });
});

describe('approach walks the marker adjacent, then the choice surfaces', () => {
  it('approaches a far item and the Pick-up choice appears', async () => {
    const result = await takeAction({
      action: { type: 'approach', pos: { x: 5, y: 5 } },
      history: [],
      state: vaultState({ x: 0, y: 0 }),
      seed,
      context: ctx,
    });
    const m = result.newState.marker_pos!;
    expect(Math.max(Math.abs(m.x - 5), Math.abs(m.y - 5))).toBeLessThanOrEqual(1);
    expect(pickupLabels(result.newState)).toEqual(['Pick up the Dagger']);
  });

  it('is rejected in combat', async () => {
    const result = await takeAction({
      action: { type: 'approach', pos: { x: 5, y: 5 } },
      history: [],
      state: vaultState({ x: 0, y: 0 }, { combat_active: true }),
      seed,
      context: ctx,
    });
    expect(result.newState.marker_pos).toEqual({ x: 0, y: 0 }); // unchanged
  });
});

describe('container Interact is adjacency-gated too', () => {
  const interactLabels = (s: GameState) =>
    generateChoices(s, seed, ctx)
      .filter((c) => c.action.type === 'interact_object')
      .map((c) => c.label);

  it('hides Interact when far, shows it once adjacent', () => {
    expect(interactLabels(vaultState({ x: 0, y: 0 }))).toEqual([]);
    expect(interactLabels(vaultState({ x: 6, y: 6 }))).toEqual(['Interact with Iron Chest']);
  });
});

describe('arrival narrative lists every spotted item', () => {
  it('names multiple ground items', () => {
    const text = buildArrivalNarrative(ROOM, vaultState({ x: 0, y: 0 }), seed, ctx);
    expect(text).toContain('Potion');
    expect(text).toContain('Dagger');
  });
});
