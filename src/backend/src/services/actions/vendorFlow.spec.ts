// Vendor pane (buy-only): the shop is a sub-state nested under a conversation.
// Talk → "🛒 Check out my wares" (enter_shop) → buy list + Back (exit_shop).

import type { GameState, PlacedNpc, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeState } from '../../test-fixtures.js';
import { context as vale } from '../../campaignData/malgovia/index.js';

afterEach(() => vi.restoreAllMocks());

const ROOM = 'millhaven_market';

const aldric: PlacedNpc = {
  roomId: ROOM,
  id: 'npc_aldric',
  name: 'Aldric the Merchant',
  attitude: 'friendly',
  factionId: 'faction_guild',
  hp: 4,
  ac: 10,
  damage: '1d4',
  toHit: 0,
  xp: 0,
  greeting: 'Welcome, traveller.',
  responses: [{ label: 'Ask about the road', reply: 'Bandits, mostly.' }],
  shop: [{ itemId: 'healing_potion', price: 50 }],
} as PlacedNpc;

const seed: Seed = {
  context_id: vale.id,
  world_name: 'Vale',
  ship_name: 'Vale',
  intro: '',
  seed_id: 'vendor-test',
  rooms: [{ id: ROOM, name: 'Market', desc: '' }],
  enemies: {},
  loot: {},
  npcs: { [ROOM]: aldric },
};

// A party member standing in Aldric's room. `over` patches state-level fields.
function state(over: Partial<GameState> = {}, gold = 100): GameState {
  return makeState({ id: 'p1', gold }, { current_room: ROOM, ...over });
}
const talking = (over: Partial<GameState> = {}, gold = 100): GameState =>
  state(
    { active_conversation: { roomId: ROOM, path: [], prompt: aldric.greeting }, ...over },
    gold
  );

describe('vendor pane — conversation wares control', () => {
  it('a friendly shop NPC offers the "Check out my wares" control in conversation', () => {
    const choices = generateChoices(talking(), seed, vale);
    expect(choices.some((c) => c.action.type === 'enter_shop')).toBe(true);
    expect(choices.some((c) => c.action.type === 'talk_response')).toBe(true);
    expect(choices.some((c) => c.action.type === 'buy')).toBe(false);
  });

  it('an indifferent NPC offers no wares control (cannot trade)', () => {
    const choices = generateChoices(
      talking({ npc_attitudes: { [ROOM]: 'indifferent' } }),
      seed,
      vale
    );
    expect(choices.some((c) => c.action.type === 'enter_shop')).toBe(false);
  });
});

describe('vendor pane — open / browse / close', () => {
  it('enter_shop sets active_shop', async () => {
    const r = await takeAction({
      action: { type: 'enter_shop' },
      history: [],
      state: talking(),
      seed,
      context: vale,
    });
    expect(r.newState.active_shop).toEqual({ roomId: ROOM });
  });

  it('while shopping, generateChoices returns ONLY vendor choices (wares + Back)', () => {
    const choices = generateChoices(talking({ active_shop: { roomId: ROOM } }), seed, vale);
    expect(choices.every((c) => c.kind === 'vendor')).toBe(true);
    const buy = choices.find((c) => c.action.type === 'buy');
    expect(buy).toBeDefined();
    expect((buy?.action as { price: number }).price).toBe(50); // neutral rep → base
    expect(choices.some((c) => c.action.type === 'exit_shop')).toBe(true);
    expect(choices.some((c) => c.action.type === 'talk_response')).toBe(false);
  });

  it('buy works from inside the shop (gold deducted, item added)', async () => {
    const r = await takeAction({
      action: { type: 'buy', itemId: 'healing_potion', price: 50 },
      history: [],
      state: talking({ active_shop: { roomId: ROOM } }, 100),
      seed,
      context: vale,
    });
    expect(r.newState.characters[0].gold).toBe(50);
    expect(r.newState.characters[0].inventory.some((i) => i.id === 'healing_potion')).toBe(true);
  });

  it('exit_shop clears active_shop and the conversation choices return', async () => {
    const r = await takeAction({
      action: { type: 'exit_shop' },
      history: [],
      state: talking({ active_shop: { roomId: ROOM } }),
      seed,
      context: vale,
    });
    expect(r.newState.active_shop).toBeUndefined();
    expect(r.newState.active_conversation).toBeDefined();
    const choices = generateChoices(r.newState, seed, vale);
    expect(choices.some((c) => c.action.type === 'talk_response')).toBe(true);
  });

  it('end_conversation closes the shop too', async () => {
    const r = await takeAction({
      action: { type: 'end_conversation' },
      history: [],
      state: talking({ active_shop: { roomId: ROOM } }),
      seed,
      context: vale,
    });
    expect(r.newState.active_conversation).toBeUndefined();
    expect(r.newState.active_shop).toBeUndefined();
  });

  it('combat suppresses the vendor pane (falls through to combat choices)', () => {
    const choices = generateChoices(
      talking({ active_shop: { roomId: ROOM }, combat_active: true }),
      seed,
      vale
    );
    expect(choices.every((c) => c.kind === 'vendor')).toBe(false);
  });

  it('enter_shop is rejected for an unfriendly NPC', async () => {
    const r = await takeAction({
      action: { type: 'enter_shop' },
      history: [],
      state: talking({ npc_attitudes: { [ROOM]: 'indifferent' } }),
      seed,
      context: vale,
    });
    expect(r.newState.active_shop).toBeUndefined();
    expect(r.narrative).toMatch(/nothing to sell/i);
  });
});
