// Conversation mode — the NPC-dialogue state machine. After "Talk to X" the
// engine enters a conversation: generateChoices surfaces ONLY the dialogue
// options (responses at the current node + Back when nested + End conversation)
// until the player ends it; responses can nest.

import type { PlacedNpc, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { makeState } from '../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

const ROOM = 'parley';
const NPC = 'sage';

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
  npcs: { [NPC]: npc },
} as unknown as Seed;

const start = () => makeState({ id: 'pc-1', cha: 14 }, { current_room: ROOM, npc_talked: [NPC] });

const act = (
  state: ReturnType<typeof makeState>,
  action: Parameters<typeof takeAction>[0]['action']
) => takeAction({ action, history: [], state, seed, context: ctx });

const convoLabels = (state: ReturnType<typeof makeState>) =>
  generateChoices(state, seed, ctx).map((c) => c.label);

describe('conversation mode', () => {
  it('Talk opens a conversation (prompt = greeting) and only dialogue choices show', async () => {
    const r = await act(start(), { type: 'talk', npcId: NPC });
    expect(r.newState.active_conversation).toEqual({
      npcId: NPC,
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
    let r = await act(start(), { type: 'talk', npcId: NPC });
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
    let r = await act(start(), { type: 'talk', npcId: NPC });
    r = await act(r.newState, { type: 'talk_response', responseIdx: 0 }); // descend
    r = await act(r.newState, { type: 'talk_response', responseIdx: 1 }); // leaf "I have heard enough"
    expect(r.newState.active_conversation?.path).toEqual([0]); // unchanged — leaf
    expect(r.newState.active_conversation?.prompt).toBe('As you wish.');
    expect(r.newState.flags?.heard_crypt_lore).toBe(true); // consequence fired
    expect(convoLabels(r.newState)).toContain('<To The Sage> Who built it?'); // siblings remain
  });

  it('Back steps up a level (prompt reverts to the parent / greeting)', async () => {
    let r = await act(start(), { type: 'talk', npcId: NPC });
    r = await act(r.newState, { type: 'talk_response', responseIdx: 0 }); // path [0]
    r = await act(r.newState, { type: 'conversation_back' });
    expect(r.newState.active_conversation?.path).toEqual([]);
    expect(r.newState.active_conversation?.prompt).toBe('Ask me anything.');
    expect(convoLabels(r.newState)).toContain('<To The Sage> Farewell');
  });

  it('End conversation clears the state and restores normal choices', async () => {
    let r = await act(start(), { type: 'talk', npcId: NPC });
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
      active_conversation: { npcId: NPC, roomId: ROOM, path: [], prompt: 'Ask me anything.' },
    } as ReturnType<typeof makeState>;
    const choices = generateChoices(state, seed, ctx);
    expect(choices.some((c) => c.kind === 'conversation')).toBe(false);
  });
});

describe('gated dialogue (condition + once)', () => {
  // A smuggler whose root node mixes an open option, a flag-gated option and
  // a one-shot — the flag-gated one is UNLOCKED BY the one-shot's consequence,
  // exercising mid-conversation visibility shifts on stable indices.
  const gatedNpc: PlacedNpc = {
    roomId: ROOM,
    id: 'smuggler',
    name: 'The Smuggler',
    attitude: 'friendly',
    hp: 4,
    ac: 10,
    damage: '1d4',
    toHit: 0,
    xp: 0,
    greeting: 'Looking for something?',
    responses: [
      { label: 'Just browsing', reply: 'Suit yourself.' },
      {
        label: 'About that job…',
        reply: 'Keep your voice down. The ledger. Bring it.',
        condition: { fact: 'flags', path: '$.knows_password', operator: 'equal', value: true },
      },
      {
        label: 'A little bird told me a password',
        reply: 'Hah. So you know Hob after all.',
        once: true,
        consequences: [{ type: 'set_flag', key: 'knows_password', value: true }],
      },
    ],
  };
  const gatedSeed = { ...seed, npcs: { smuggler: gatedNpc } } as unknown as Seed;
  const gatedStart = () =>
    makeState({ id: 'pc-1', cha: 14 }, { current_room: ROOM, npc_talked: ['smuggler'] });
  const gatedAct = (
    state: ReturnType<typeof makeState>,
    action: Parameters<typeof takeAction>[0]['action']
  ) => takeAction({ action, history: [], state, seed: gatedSeed, context: ctx });
  const labels = (state: ReturnType<typeof makeState>) =>
    generateChoices(state, gatedSeed, ctx).map((c) => c.label);

  it('a locked option is hidden — and refused server-side if submitted anyway', async () => {
    const r = await gatedAct(gatedStart(), { type: 'talk', npcId: 'smuggler' });
    expect(labels(r.newState)).not.toContain('<To The Smuggler> About that job…');
    // A stale client submits the hidden index directly: rejected, no reply,
    // no descent.
    const forced = await gatedAct(r.newState, { type: 'talk_response', responseIdx: 1 });
    expect(forced.narrative).toContain('Invalid response.');
    expect(forced.newState.active_conversation?.prompt).toBe('Looking for something?');
  });

  it('a consequence mid-conversation unlocks a sibling at its original index', async () => {
    let r = await gatedAct(gatedStart(), { type: 'talk', npcId: 'smuggler' });
    // Spend the one-shot (index 2): flag set, option gone, gated sibling appears.
    r = await gatedAct(r.newState, { type: 'talk_response', responseIdx: 2 });
    expect(r.newState.flags?.knows_password).toBe(true);
    const after = labels(r.newState);
    expect(after).toContain('<To The Smuggler> About that job…');
    expect(after).not.toContain('<To The Smuggler> A little bird told me a password');
    // The unlocked option answers at its ORIGINAL index (1) — stable identity.
    r = await gatedAct(r.newState, { type: 'talk_response', responseIdx: 1 });
    expect(r.newState.active_conversation?.prompt).toBe(
      'Keep your voice down. The ledger. Bring it.'
    );
  });

  it('character rewards (give_gold / give_item) survive the action epilogue', async () => {
    // Regression: applyConsequence writes gold/items into ctx.st, but the
    // epilogue's commitChar used to write the PRE-consequence actor char back
    // over them — the narrative said "+10 gold" while the gold vanished.
    // give_item here exercises the composed-loot-table fallback too: 'dagger'
    // is in the sandbox lootTable but NOT placed in this seed's rooms.
    const rewardNpc: PlacedNpc = {
      ...gatedNpc,
      id: 'patron',
      name: 'The Patron',
      responses: [
        {
          label: 'I did the job',
          reply: 'So you did. Payment, as agreed.',
          consequences: [
            { type: 'give_gold', amount: 10 },
            { type: 'give_item', itemId: 'dagger' },
          ],
        },
      ],
    };
    const rewardSeed = { ...seed, npcs: { patron: rewardNpc } } as unknown as Seed;
    const st = makeState({ id: 'pc-1', cha: 14 }, { current_room: ROOM, npc_talked: ['patron'] });
    const goldBefore = st.characters[0].gold;
    let r = await takeAction({
      action: { type: 'talk', npcId: 'patron' },
      history: [],
      state: st,
      seed: rewardSeed,
      context: ctx,
    });
    r = await takeAction({
      action: { type: 'talk_response', responseIdx: 0 },
      history: [],
      state: r.newState,
      seed: rewardSeed,
      context: ctx,
    });
    expect(r.narrative).toContain('+10 gold');
    const pc = r.newState.characters[0];
    expect(pc.gold).toBe(goldBefore + 10);
    expect(pc.inventory.some((i) => i.id === 'dagger')).toBe(true);
  });

  it('once persists for the playthrough: re-opening the talk keeps it spent', async () => {
    let r = await gatedAct(gatedStart(), { type: 'talk', npcId: 'smuggler' });
    r = await gatedAct(r.newState, { type: 'talk_response', responseIdx: 2 });
    r = await gatedAct(r.newState, { type: 'end_conversation' });
    expect(r.newState.dialogue_chosen).toEqual(['smuggler:2']);
    // Fresh conversation, same playthrough — the one-shot stays gone and a
    // direct re-submit of its index is refused.
    r = await gatedAct(r.newState, { type: 'talk', npcId: 'smuggler' });
    expect(labels(r.newState)).not.toContain('<To The Smuggler> A little bird told me a password');
    const again = await gatedAct(r.newState, { type: 'talk_response', responseIdx: 2 });
    expect(again.narrative).toContain('Invalid response.');
    expect(again.newState.flags?.knows_password).toBe(true); // not double-fired (still just set)
  });
});
