// Grid-combat tests: enemy tactical movement (close-to-melee AI) +
// grid-combat invariants (active-marker, movement budget, etc.).
// Extracted from gameEngine.spec.ts as part of the test-suite split
// (TODO architecture-audit follow-up #1).

import {
  CORRIDOR_ID,
  makeChar,
  makeState,
  baseSandboxSeed as seed,
  seedWithEnemy,
} from '../../test-fixtures.js';
import type { Character, Enemy, GameState, GridPos, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// ─── Grid-combat invariants ──────────────────────────────────────────────────
//
// `makeGridCombatState` sets up a real grid state — entities + a
// non-zero gridWidth/gridHeight from the context + tracked
// movement_used — and asserts the load-bearing invariants:
//
//   1. active_character_id stays on the acting PC after a non-turn-
//      ending action (grid_move, examine-in-combat).
//   2. active_character_id matches `initiative_order[initiative_idx].id`
//      whenever combat is live and the engine is waiting for input.
//   3. `end_turn` advances initiative monotonically and lands on the
//      next living PC's slot (skipping enemy slots that runEnemyTurns
//      processed inline).

function makeGridCombatState(opts: { partySize: number; pcAt?: GridPos[] }): {
  state: GameState;
  seed: Seed;
  enemyId: string;
} {
  const partySize = opts.partySize;
  const pcPositions = opts.pcAt ?? [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ];
  const characters: Character[] = [];
  for (let i = 0; i < partySize; i++) {
    characters.push(
      makeChar({
        id: `pc-${i + 1}`,
        name: `PC${i + 1}`,
        hp: 20,
        max_hp: 20,
        str: 16,
      })
    );
  }
  const enemyId = `${CORRIDOR_ID}#0`;
  const gridSeed: Seed = {
    ...seedWithEnemy,
    enemies: {
      [CORRIDOR_ID]: [
        { id: enemyId, name: 'Goblin', hp: 10, ac: 12, damage: '1d6', toHit: 3, xp: 20 },
      ],
    },
  };
  const initiativeOrder = [
    ...characters.map((c, i) => ({ id: c.id, roll: 20 - i, is_enemy: false })),
    { id: enemyId, roll: 5, is_enemy: true },
  ];
  const state: GameState = {
    characters,
    active_character_id: characters[0].id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    enemies_killed: [],
    loot_taken: [],
    combat_active: true,
    initiative_order: initiativeOrder,
    initiative_idx: 0,
    entities: [
      ...characters.map((c, i) => ({
        id: c.id,
        isEnemy: false as const,
        pos: pcPositions[i] ?? { x: 1 + i, y: 1 },
        hp: c.hp,
        maxHp: c.max_hp,
        conditions: [] as string[],
        condition_durations: {} as Record<string, number>,
      })),
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 7, y: 7 },
        hp: 50, // survive the grid_move test below
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
    run_log: [],
    room_log: [],
    last_choices: [],
    short_rested_rooms: [],
    long_rested: false,
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
    round: 1,
    movement_used: {},
  };
  return { state, seed: gridSeed, enemyId };
}

describe('Enemy tactical movement (must close distance to melee)', () => {
  // Standard 1v1 grid combat with adjustable enemy stats. The PC always sits
  // at (1, 1); the enemy at the supplied position. Initiative starts on the
  // PC so a single end_turn drives one full enemy turn cycle.
  function makeMoveState(
    enemyPos: { x: number; y: number },
    enemyOverrides: Partial<Enemy> = {}
  ): { state: GameState; mySeed: Seed; enemyId: string } {
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      str: 16,
      dex: 14,
      armor_proficiencies: ['light', 'medium', 'heavy', 'shield'],
      weapon_proficiencies: ['simple', 'martial'],
      equipment: { main_hand: 'longsword-inst' },
      inventory: [{ instance_id: 'longsword-inst', id: 'longsword', name: 'Longsword' }],
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const mySeed: Seed = {
      ...seed,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyId,
            name: 'Goblin',
            hp: 10,
            ac: 12,
            damage: '1d4', // Low damage so a hit doesn't drop a fresh PC
            toHit: 3,
            xp: 20,
            ...enemyOverrides,
          },
        ],
      },
    };
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: fighter.id, roll: 18, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighter.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: enemyPos,
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      round: 1,
      movement_used: {},
    };
    return { state, mySeed, enemyId };
  }

  it('Distant enemy with default speed walks into reach and attacks', async () => {
    // Enemy starts at (7, 7) — Chebyshev 6 from PC at (1, 1) = 30 ft. Speed
    // 30 ft = 6 squares; reach 5 ft = 1 square. The closest unoccupied in-reach
    // square is at distance 5 from the enemy, so the enemy makes it in one
    // turn and attacks.
    const { state, mySeed, enemyId } = makeMoveState({ x: 7, y: 7 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt).toBeDefined();
    // Enemy must have moved (no longer at (7, 7))
    expect(finalEnemyEnt!.pos).not.toEqual({ x: 7, y: 7 });
    // Final position must be within reach (5 ft = 1 square Chebyshev) of PC
    const pcPos = result.newState.entities!.find((e) => e.id === 'pc-1')!.pos;
    const finalDist = Math.max(
      Math.abs(finalEnemyEnt!.pos.x - pcPos.x),
      Math.abs(finalEnemyEnt!.pos.y - pcPos.y)
    );
    expect(finalDist).toBeLessThanOrEqual(1);
    expect(result.narrative).toMatch(/closes \d+ ft/i);
    // PC's HP may or may not have dropped (depends on the d20), but the
    // engine emitted an attack roll — the enemy didn't skip combat.
    expect(result.narrative).toMatch(/Goblin/i);
  });

  it('Enemy already in reach attacks without moving', async () => {
    // Enemy at (2, 1) — 5 ft from PC; already in reach.
    const { state, mySeed, enemyId } = makeMoveState({ x: 2, y: 1 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).toEqual({ x: 2, y: 1 });
    expect(result.narrative).not.toMatch(/closes \d+ ft/i);
  });

  it('Slow enemy that cannot close advances but does not attack', async () => {
    // Speed 10 ft = 2 squares. Enemy at (7, 7), PC at (1, 1) — 30 ft apart.
    // After moving 2 squares it's still > 5 ft away. No attack this turn.
    const { state, mySeed, enemyId } = makeMoveState({ x: 7, y: 7 }, { speedFt: 10 });
    const pcHpBefore = state.characters[0].hp;
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    // Enemy moved (no longer at start)
    expect(finalEnemyEnt!.pos).not.toEqual({ x: 7, y: 7 });
    const pcPos = result.newState.entities!.find((e) => e.id === 'pc-1')!.pos;
    const finalDist = Math.max(
      Math.abs(finalEnemyEnt!.pos.x - pcPos.x),
      Math.abs(finalEnemyEnt!.pos.y - pcPos.y)
    );
    // Still out of reach
    expect(finalDist).toBeGreaterThan(1);
    expect(result.narrative).toMatch(/still out of reach/i);
    // PC HP unchanged
    expect(result.newState.characters[0].hp).toBe(pcHpBefore);
  });

  it('Reach-weapon enemy (10 ft) hits at 10 ft without moving', async () => {
    // attackReachFt: 10 → Chebyshev ≤ 2 counts as in reach. Enemy at (3, 1) is
    // 10 ft from PC.
    const { state, mySeed, enemyId } = makeMoveState({ x: 3, y: 1 }, { attackReachFt: 10 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).toEqual({ x: 3, y: 1 });
    expect(result.narrative).not.toMatch(/closes \d+ ft/i);
  });

  it("PC opportunity attack fires when enemy leaves the PC's threat zone", async () => {
    // Two-PC layout. The enemy's nearest-target filter excludes companions,
    // so we flag PC1 as `isCompanion: true` on the grid entity only — PC1 is
    // still a regular character. That forces the enemy to target PC2 (far
    // away). The path past PC1's threat zone triggers PC1's reaction OA.
    // After: the enemy reaches PC2, PC1's reaction is consumed, and the OA
    // narrative is in the result string.
    const pc1 = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      str: 16,
      dex: 14,
      weapon_proficiencies: ['simple', 'martial'],
      equipment: { main_hand: 'longsword-inst' },
      inventory: [{ instance_id: 'longsword-inst', id: 'longsword', name: 'Longsword' }],
    });
    const pc2 = makeChar({ id: 'pc-2', character_class: 'Cleric' });
    const enemyId = `${CORRIDOR_ID}#0`;
    const mySeed: Seed = {
      ...seed,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyId,
            name: 'Bandit',
            hp: 20,
            ac: 12,
            damage: '1d4',
            toHit: 3,
            xp: 20,
          },
        ],
      },
    };
    const state: GameState = {
      characters: [pc1, pc2],
      active_character_id: pc1.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      // pc-2 is intentionally NOT in initiative_order — that way one end_turn
      // from pc-1 advances straight to the enemy slot. pc-2 is still present
      // as an entity, so the enemy can target it.
      initiative_order: [
        { id: pc1.id, roll: 20, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: pc1.id,
          isEnemy: false,
          // Hack: isCompanion: true excludes pc-1 from the enemy's target
          // filter while leaving it visible to the OA pass. The OA pass
          // looks up the character record (which is alive with full HP).
          isCompanion: true,
          pos: { x: 4, y: 4 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: pc2.id,
          isEnemy: false,
          pos: { x: 1, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      round: 1,
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    // The OA narrative names the PC by name — and *only* PC-1 should be the
    // one OA'ing, since PC-2 was never adjacent to the enemy's start square.
    expect(result.narrative).toMatch(/Test Hero opportunity attack/i);
    expect(result.narrative).not.toMatch(/pc-2 opportunity attack/i);
    // The enemy should have ended its turn adjacent to PC-2 (i.e. moved).
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).not.toEqual({ x: 5, y: 5 });
    const pc2Pos = result.newState.entities!.find((e) => e.id === 'pc-2')!.pos;
    const distToPc2 = Math.max(
      Math.abs(finalEnemyEnt!.pos.x - pc2Pos.x),
      Math.abs(finalEnemyEnt!.pos.y - pc2Pos.y)
    );
    expect(distToPc2).toBeLessThanOrEqual(1);
  });

  it('Grappled enemy cannot move and does not attack a distant PC', async () => {
    // Enemy at (7, 7), grappled. Speed effectively 0. PC at (1, 1) is out of
    // reach. The enemy can't move and can't attack.
    const { state, mySeed, enemyId } = makeMoveState({ x: 7, y: 7 });
    state.entities = state.entities!.map((e) =>
      e.id === enemyId ? { ...e, conditions: ['grappled'] } : e
    );
    const pcHpBefore = state.characters[0].hp;
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).toEqual({ x: 7, y: 7 });
    expect(result.narrative).toMatch(/held in place/i);
    expect(result.newState.characters[0].hp).toBe(pcHpBefore);
  });
});

// ─── Narrative tokenization (UI rendering contract) ──────────────────────────
//
// Mechanical bits — damage, rolls, HP, AC, DC, saves, mechanical asides —
// flow inline as `{{kind|display}}` tokens so the frontend can render
// them with distinct styling without breaking immersion. These tests lock
// in the format at the highest-traffic emission sites; if a future
// change drops the wrapper at one of these sites the structured rendering
// silently degrades, so we want a regression gate.

// ─── LLM fact-preservation guard ─────────────────────────────────────────────
//
// Post-LLM safety net: if the model drops a damage number or an outcome
// word from the input, the engine falls back to the raw tokenised
// narrative so the player isn't shown prose that misrepresents state.

// ─── grid-combat invariants ──────────────────────────────────────────────

describe('grid-combat invariants', () => {
  it('grid_move does not advance the active marker off the moving PC', async () => {
    const { state, seed } = makeGridCombatState({ partySize: 3 });
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 3, y: 3 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.combat_active).toBe(true);
    // PC1 still acts — they haven't used their action, just spent some
    // movement. PartyRail's aria-current keeps pointing at PC1.
    expect(result.newState.active_character_id).toBe('pc-1');
    // Initiative slot matches: the strip ▶ should be on PC1 too.
    const activeIdx = result.newState.initiative_idx ?? -1;
    expect(result.newState.initiative_order[activeIdx]?.id).toBe('pc-1');
  });

  it('initiative_idx and active_character_id stay aligned through end_turn', async () => {
    // Force the enemy to miss so combat persists past PC1's exit and
    // we can observe whose turn the engine landed on after the enemy's
    // interleaved turn.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 (miss)
    const { state, seed } = makeGridCombatState({ partySize: 3 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.combat_active).toBe(true);
    const activeIdx = result.newState.initiative_idx ?? -1;
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    // Whoever the engine landed on, the two indicators agree.
    const activeEntry = result.newState.initiative_order[activeIdx];
    expect(activeEntry?.id).toBe(result.newState.active_character_id);
    expect(activeEntry?.is_enemy).toBe(false);
  });

  it('multiple grid_moves in a row keep active locked to the same PC', async () => {
    // Walk PC1 from (2,2) to (3,3) to (4,4) — two grid moves. Each
    // advance must NOT shift the active marker to PC2 (the historical
    // bug). Only end_turn should hand the turn over.
    const { state: s0, seed } = makeGridCombatState({ partySize: 3 });
    const step1 = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 3, y: 3 } },
      history: [],
      state: s0,
      seed,
      context: ctx,
    });
    expect(step1.newState.active_character_id).toBe('pc-1');
    const step2 = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 4, y: 4 } },
      history: [],
      state: step1.newState,
      seed,
      context: ctx,
    });
    expect(step2.newState.active_character_id).toBe('pc-1');
    // Both moves resolved (entity position advanced both times).
    const pc1Ent = step2.newState.entities?.find((e) => e.id === 'pc-1');
    expect(pc1Ent?.pos).toEqual({ x: 4, y: 4 });
    // Movement_used reflects 10 ft burned (two diagonal grid moves).
    expect((step2.newState.movement_used ?? {})['pc-1']).toBe(10);
  });

  // ── Follow-ups (full coverage) ─────────────────────────────────────────────
  // (a) `initiative_idx` advances monotonically across a full round and
  //     wraps cleanly at the end (round counter increments on wrap).
  // (b) The strip↔PartyRail sync invariant is preserved through reactive-
  //     spell pauses (Shield / Counterspell / Hellish Rebuke). The pause
  //     path mutates `active_character_id` to the reactor while the strip
  //     stays on the original initiative slot; the invariant we pin is
  //     that the pending reactor is always a living PC the strip knows
  //     about.

  it('(follow-up) initiative_idx advances monotonically and wraps with round++', async () => {
    // Force enemy d20 → 1 so its attack misses and combat persists for
    // the whole round. The enemy still walks toward a PC (BFS pathing
    // is deterministic on a fresh grid).
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1
    const { state, seed } = makeGridCombatState({ partySize: 3 });
    // 4-slot initiative: PC1 (idx 0), PC2 (idx 1), PC3 (idx 2), enemy (idx 3)
    expect(state.initiative_order).toHaveLength(4);
    expect(state.initiative_idx).toBe(0);
    expect(state.round).toBe(1);

    // PC1 → PC2
    let r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.newState.initiative_idx).toBe(1);
    expect(r.newState.active_character_id).toBe('pc-2');
    expect(r.newState.round).toBe(1);

    // PC2 → PC3
    r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: r.newState,
      seed,
      context: ctx,
    });
    expect(r.newState.initiative_idx).toBe(2);
    expect(r.newState.active_character_id).toBe('pc-3');
    expect(r.newState.round).toBe(1);

    // PC3 end_turn → enemy auto-acts (miss) → wraps to PC1, round=2.
    r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: r.newState,
      seed,
      context: ctx,
    });
    expect(r.newState.initiative_idx).toBe(0);
    expect(r.newState.active_character_id).toBe('pc-1');
    expect(r.newState.round).toBe(2);
  });

  it('(follow-up) reactive-spell pause: active_character_id moves to the reactor; strip stays aligned', async () => {
    // Enemy d20 = 15 + toHit 3 = 18 vs Wizard AC 16 → hit in [AC, AC+4]
    // window. Wizard has Shield prepared → pending_reaction fires.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.74) // enemy d20 → 15
      .mockReturnValue(0.5);
    const wizId = 'wiz-react';
    const fighterId = 'fighter-1';
    const enemyId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 3,
      ac: 16,
      max_hp: 18,
      hp: 18,
      spells_known: ['shield'],
      prepared_spells: ['shield'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      ac: 16,
      hp: 28,
      max_hp: 28,
    });
    const state: GameState = {
      ...makeState(),
      characters: [fighter, wiz],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      combat_active: true,
      // Fighter goes first; enemy next will target the Wizard (adjacent).
      initiative_order: [
        { id: fighterId, roll: 18, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
        { id: wizId, roll: 5, is_enemy: false },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 28,
          maxHp: 28,
          conditions: [],
          condition_durations: {},
        },
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 18,
          maxHp: 18,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // pending_reaction is set, active_character_id moves to the reactor.
    expect(result.newState.pending_reaction).toBeDefined();
    expect(result.newState.pending_reaction?.kind).toBe('shield');
    const reactor =
      result.newState.pending_reaction?.kind === 'shield'
        ? result.newState.pending_reaction.targetCharId
        : undefined;
    expect(reactor).toBe(wizId);
    expect(result.newState.active_character_id).toBe(reactor);
    // Strip↔PartyRail sync invariant: the reactor is still a known PC
    // in the initiative order, and they're alive. The strip's ▶ marker
    // and PartyRail's aria-current both read off `active_character_id`
    // during the pause, and the resume idx points at a real slot.
    const reactorEntry = result.newState.initiative_order.find(
      (e) => e.id === reactor && !e.is_enemy
    );
    expect(reactorEntry).toBeDefined();
    const reactorChar = result.newState.characters.find((c) => c.id === reactor);
    expect(reactorChar?.dead).toBe(false);
    // resumeFromInitiativeIdx points at a valid slot.
    const resumeIdx = result.newState.pending_reaction?.resumeFromInitiativeIdx ?? -1;
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(resumeIdx).toBeLessThan(result.newState.initiative_order.length);
  });
});

// ─── applyConsequence — give_xp ───────────────────────────────────────────────
// Quest XP rewards: split `amount` evenly across living party members,
// floor the share, and trigger level-ups inline when context is provided.
