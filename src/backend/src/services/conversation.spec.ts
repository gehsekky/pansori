// Conversation mode — the NPC-dialogue state machine. After "Talk to X" the
// engine enters a conversation: generateChoices surfaces ONLY the dialogue
// options (responses at the current node + Back when nested + End conversation)
// until the player ends it; responses can nest.

import type { PlacedNpc, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { context as ctx } from '../contexts/sandbox.js';
import { makeState } from '../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const ROOM = 'parley';

const npc: PlacedNpc = {
  roomId: ROOM,
  id: 'sage',
  name: 'The Sage',
  attitude: 'friendly',
  hp: 4,
  ac: 10,
  damage: '1d4',
  toHit: 0,
  xp: 0,
  greeting: 'Ask me anything.',
  responses: [
    {
      label: 'Tell me about the crypt',
      reply: 'It is old and cursed.',
      responses: [
        { label: 'Who built it?', reply: 'A forgotten king.' },
        {
          label: 'I have heard enough',
          reply: 'As you wish.',
          consequences: [{ type: 'set_flag', key: 'heard_crypt_lore', value: true }],
        },
      ],
    },
    { label: 'Farewell', reply: 'Safe travels.' },
  ],
};

const seed = {
  context_id: ctx.id,
  world_name: 'Conversation Test',
  ship_name: 'Conversation Test',
  intro: '',
  seed_id: 'convo',
  rooms: [{ id: ROOM, name: 'Parley Room', desc: '' }],
  enemies: {},
  loot: {},
  npcs: { [ROOM]: npc },
} as unknown as Seed;

const start = () => makeState({ id: 'pc-1', cha: 14 }, { current_room: ROOM, npc_talked: [ROOM] });

const act = (
  state: ReturnType<typeof makeState>,
  action: Parameters<typeof takeAction>[0]['action']
) => takeAction({ action, history: [], state, seed, context: ctx });

const convoLabels = (state: ReturnType<typeof makeState>) =>
  generateChoices(state, seed, ctx).map((c) => c.label);

describe('conversation mode', () => {
  it('Talk opens a conversation (prompt = greeting) and only dialogue choices show', async () => {
    const r = await act(start(), { type: 'talk' });
    expect(r.newState.active_conversation).toEqual({
      roomId: ROOM,
      path: [],
      prompt: 'Ask me anything.',
    });
    const choices = generateChoices(r.newState, seed, ctx);
    // Every surfaced choice is a conversation choice — nothing else leaks in.
    expect(choices.every((c) => c.kind === 'conversation')).toBe(true);
    const labels = choices.map((c) => c.label);
    expect(labels).toContain('<To The Sage> Tell me about the crypt');
    expect(labels).toContain('<To The Sage> Farewell');
    expect(labels).toContain('✕ End conversation');
    expect(labels).not.toContain('↩ Back'); // at the root, no Back
  });

  it('picking a branch descends a level (children shown + Back appears)', async () => {
    let r = await act(start(), { type: 'talk' });
    r = await act(r.newState, { type: 'talk_response', responseIdx: 0 }); // "Tell me about the crypt"
    expect(r.newState.active_conversation?.path).toEqual([0]);
    expect(r.newState.active_conversation?.prompt).toBe('It is old and cursed.');
    const labels = convoLabels(r.newState);
    expect(labels).toContain('<To The Sage> Who built it?');
    expect(labels).toContain('<To The Sage> I have heard enough');
    expect(labels).toContain('↩ Back');
    expect(labels).not.toContain('<To The Sage> Farewell'); // root option hidden while nested
  });

  it('a leaf reply stays at the current level; consequences still fire', async () => {
    let r = await act(start(), { type: 'talk' });
    r = await act(r.newState, { type: 'talk_response', responseIdx: 0 }); // descend
    r = await act(r.newState, { type: 'talk_response', responseIdx: 1 }); // leaf "I have heard enough"
    expect(r.newState.active_conversation?.path).toEqual([0]); // unchanged — leaf
    expect(r.newState.active_conversation?.prompt).toBe('As you wish.');
    expect(r.newState.flags?.heard_crypt_lore).toBe(true); // consequence fired
    expect(convoLabels(r.newState)).toContain('<To The Sage> Who built it?'); // siblings remain
  });

  it('Back steps up a level (prompt reverts to the parent / greeting)', async () => {
    let r = await act(start(), { type: 'talk' });
    r = await act(r.newState, { type: 'talk_response', responseIdx: 0 }); // path [0]
    r = await act(r.newState, { type: 'conversation_back' });
    expect(r.newState.active_conversation?.path).toEqual([]);
    expect(r.newState.active_conversation?.prompt).toBe('Ask me anything.');
    expect(convoLabels(r.newState)).toContain('<To The Sage> Farewell');
  });

  it('End conversation clears the state and restores normal choices', async () => {
    let r = await act(start(), { type: 'talk' });
    r = await act(r.newState, { type: 'end_conversation' });
    expect(r.newState.active_conversation).toBeUndefined();
    const choices = generateChoices(r.newState, seed, ctx);
    // Back to the normal choice set — the "Talk to" entry is offered again.
    expect(choices.some((c) => c.action.type === 'talk')).toBe(true);
    expect(choices.some((c) => c.kind === 'conversation')).toBe(false);
  });

  it('combat suppresses the conversation (reaction/combat takes precedence)', () => {
    const state = {
      ...start(),
      combat_active: true,
      active_conversation: { roomId: ROOM, path: [], prompt: 'Ask me anything.' },
    } as ReturnType<typeof makeState>;
    const choices = generateChoices(state, seed, ctx);
    expect(choices.some((c) => c.kind === 'conversation')).toBe(false);
  });
});
