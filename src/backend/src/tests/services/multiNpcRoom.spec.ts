// Multiple NPCs per room: `seed.npcs` is keyed by npc id, so a room can host
// several. Each is independently talkable, with its own attitude; talk / attack
// / vendor all target a specific npcId.

import type { GameState, PlacedNpc, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { makeState } from '../../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const ROOM = 'town_square';

const aria: PlacedNpc = {
  roomId: ROOM,
  id: 'npc_aria',
  pos: { x: 1, y: 1 },
  name: 'Aria',
  attitude: 'friendly',
  hp: 6,
  ac: 10,
  damage: '1d4',
  toHit: 0,
  xp: 5,
  greeting: 'Well met!',
  responses: [{ label: 'Hello', reply: 'Hello to you.' }],
  shop: [{ itemId: 'healing_potion', price: 50 }],
} as PlacedNpc;

const bram: PlacedNpc = {
  roomId: ROOM,
  id: 'npc_bram',
  pos: { x: 4, y: 4 },
  name: 'Bram',
  attitude: 'friendly',
  hp: 10,
  ac: 11,
  damage: '1d6',
  toHit: 2,
  xp: 10,
  greeting: 'Mind the woods.',
  responses: [{ label: 'I will', reply: 'Good.' }],
} as PlacedNpc;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Multi-NPC Test',
  ship_name: 'Multi-NPC Test',
  intro: '',
  seed_id: 'multi-npc',
  rooms: [{ id: ROOM, name: 'Square', desc: '' }],
  enemies: {},
  loot: {},
  npcs: { [aria.id]: aria, [bram.id]: bram },
};

function pcState(over: Partial<GameState> = {}): GameState {
  return makeState({ id: 'p1', gold: 100 }, { current_room: ROOM, ...over });
}

describe('multiple NPCs in one room', () => {
  it('surfaces a Talk + Attack choice for EACH npc, tagged with its id', () => {
    const choices = generateChoices(pcState(), seed, ctx);
    const talks = choices.filter((c) => c.action.type === 'talk');
    const talkIds = talks.map((c) => (c.action.type === 'talk' ? c.action.npcId : ''));
    expect(talkIds).toEqual(expect.arrayContaining(['npc_aria', 'npc_bram']));
    const attackIds = choices
      .filter((c) => c.action.type === 'attack_npc')
      .map((c) => (c.action.type === 'attack_npc' ? c.action.npcId : ''));
    expect(attackIds).toEqual(expect.arrayContaining(['npc_aria', 'npc_bram']));
  });

  it('talking to one npc opens a conversation for that npc only', async () => {
    const r = await takeAction({
      action: { type: 'talk', npcId: 'npc_bram' },
      history: [],
      state: pcState(),
      seed,
      context: ctx,
    });
    expect(r.newState.active_conversation?.npcId).toBe('npc_bram');
    expect(r.newState.active_conversation?.roomId).toBe(ROOM);
    expect(r.newState.npc_talked).toContain('npc_bram');
    expect(r.newState.npc_talked).not.toContain('npc_aria');
  });

  it('attacking one npc makes ONLY that npc hostile / an enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack_npc', npcId: 'npc_aria' },
      history: [],
      state: pcState(),
      seed,
      context: ctx,
    });
    expect(r.newState.npc_attitudes?.npc_aria).toBe('hostile');
    expect(r.newState.npc_attitudes?.npc_bram ?? 'friendly').toBe('friendly');
    // Aria is now the combat enemy `npc:npc_aria`; Bram is not in the fight.
    expect(r.newState.entities?.some((e) => e.id === 'npc:npc_aria')).toBe(true);
    expect(r.newState.entities?.some((e) => e.id === 'npc:npc_bram')).toBe(false);
  });

  it('a vendor opened on one npc shows that npc’s wares (and only theirs)', () => {
    // Aria has a shop; Bram does not. With the vendor open on Aria:
    const choices = generateChoices(
      pcState({
        active_conversation: { npcId: 'npc_aria', roomId: ROOM, path: [], prompt: aria.greeting },
        active_shop: { npcId: 'npc_aria', roomId: ROOM },
      }),
      seed,
      ctx
    );
    expect(choices.some((c) => c.action.type === 'buy')).toBe(true);
    expect(choices.every((c) => c.kind === 'vendor')).toBe(true);
  });

  it('the wares control only appears for the shop-owning npc in conversation', () => {
    const withAria = generateChoices(
      pcState({
        active_conversation: { npcId: 'npc_aria', roomId: ROOM, path: [], prompt: aria.greeting },
      }),
      seed,
      ctx
    );
    expect(withAria.some((c) => c.action.type === 'enter_shop')).toBe(true);
    const withBram = generateChoices(
      pcState({
        active_conversation: { npcId: 'npc_bram', roomId: ROOM, path: [], prompt: bram.greeting },
      }),
      seed,
      ctx
    );
    expect(withBram.some((c) => c.action.type === 'enter_shop')).toBe(false);
  });
});
