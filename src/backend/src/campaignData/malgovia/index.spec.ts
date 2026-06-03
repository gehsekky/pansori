// Scripted full-Malgovia-of-Shadows playthrough.
//
// Drives the game engine through every quest step in Malgovia and asserts
// state transitions at milestones. The point is *not* to test combat balance —
// PCs are bumped to 999 HP and Math.random is mocked to 0.99 so attacks always
// crit and PCs survive everything. The point is to catch engine bugs in the
// campaign path: broken quest conditions, soft-locked combats, missing NPC
// placements, etc.
//
// When this test breaks, it's almost always a bug in the engine or the campaign
// data (not the test fixtures themselves). Read the milestone label that fails
// and trace from there.

import type {
  CampaignFacts,
  CampaignState,
  Character,
  GameState,
  Seed,
  StructuredAction,
} from '../../types.js';
import { activeGrid, initMapState } from '../../services/mapEngine.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyQuestCompletions,
  evaluateQuestSteps,
  extractCampaignDelta,
} from '../../services/campaignEngine.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { context as ctx } from './index.js';
import { findPath } from '../../services/gridEngine.js';
import { generateSeed } from '../../services/procgen.js';
import { randomUUID } from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChar(
  name: string,
  cls: string,
  hp: number,
  overrides: Partial<Character> = {}
): Character {
  return {
    id: randomUUID(),
    name,
    character_class: cls,
    portrait_url: null,
    hp,
    max_hp: hp,
    ac: 18,
    str: 16,
    dex: 14,
    con: 16,
    int: 10,
    wis: 12,
    cha: 10,
    xp: 0,
    level: 1,
    gold: 5,
    inventory: [],
    equipment: {},
    conditions: [],
    condition_durations: {},
    death_saves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    turn_actions: {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
      free_interaction_used: false,
    },
    initiative_roll: null,
    hit_die: 10,
    hit_dice_remaining: 1,
    class_resource_uses: {},
    asi_pending: false,
    exhaustion_level: 0,
    background_id: null,
    skill_proficiencies: ctx.classSkills?.[cls] ?? [],
    tool_proficiencies: [],
    spell_slots_max: {},
    spell_slots_used: {},
    spells_known: [],
    armor_proficiencies: ctx.classArmorProficiencies?.[cls] ?? [],
    weapon_proficiencies: ctx.classWeaponProficiencies?.[cls] ?? [],
    attuned_items: [],
    concentrating_on: null,
    ...overrides,
  };
}

function makeInitialState(party: Character[]): GameState {
  return {
    characters: party,
    active_character_id: party[0].id,
    current_room: '',
    visited_rooms: [],
    enemies_killed: [],
    loot_taken: [],
    combat_active: false,
    initiative_order: [],
    initiative_idx: 0,
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
    quest_progress: [],
    faction_rep: {},
    world_day: 1,
  };
}

function makeCampaignState(): CampaignState {
  return {
    campaign_id: ctx.id,
    user_id: 'test-user',
    world_day: 1,
    current_location: '',
    flags: {},
    quests: [],
    faction_rep: {},
    npc_attitudes: {},
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Malgovia — scripted playthrough', () => {
  let seed: Seed;
  let state: GameState;
  let campaignState: CampaignState;

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    seed = generateSeed(ctx, 3);
    state = makeInitialState([
      makeChar('Aurelia', 'Fighter', 999),
      makeChar('Brennan', 'Cleric', 999),
      makeChar('Wren', 'Rogue', 999),
    ]);
    // 3-level map: start the party on the regional grid (single marker), as the
    // session-new route does. Clears current_room and sets map_level/region.
    state = { ...state, ...initMapState(ctx.campaign, state) };
    campaignState = makeCampaignState();
  });

  afterEach(() => vi.restoreAllMocks());

  // Run takeAction and mirror the route's quest evaluation. Returns the
  // narrative of the action.
  async function dispatch(action: StructuredAction): Promise<string> {
    const result = await takeAction({ action, history: [], state, seed, context: ctx });
    state = result.newState;
    const activeChar =
      state.characters.find((c) => c.id === state.active_character_id) ?? state.characters[0];
    const facts: CampaignFacts = {
      action: action.type,
      room_id: state.current_room,
      current_town_id: state.current_town_id ?? '',
      location_id: state.current_location_id ?? '',
      enemies_killed: state.enemies_killed,
      loot_taken: state.loot_taken,
      visited_rooms: state.visited_rooms,
      flags: state.flags,
      campaign_flags: state.campaign_flags ?? {},
      quest_progress: state.quest_progress ?? [],
      faction_rep: state.faction_rep ?? {},
      world_day: state.world_day ?? 1,
      active_level: activeChar?.level ?? 1,
      active_class: activeChar?.character_class ?? '',
    };
    const completions = await evaluateQuestSteps(campaignState, ctx.campaign?.quests ?? [], facts);
    if (completions.length) {
      const { cs } = applyQuestCompletions(campaignState, ctx.campaign?.quests ?? [], completions);
      campaignState = cs;
      state = { ...state, quest_progress: cs.quests, faction_rep: cs.faction_rep };
    }
    // Mirror the route: after each request, sync state → campaignState so that
    // the next dispatch's evaluateQuestSteps sees up-to-date quest_progress
    // (including newly-accepted quests).
    campaignState = extractCampaignDelta(campaignState, state);
    return result.narrative;
  }

  // Simple melee combat AI: if not adjacent to an enemy, step toward the
  // nearest one; if adjacent and action available, attack; otherwise end turn.
  async function clearCombat() {
    let safety = 300;
    while (state.combat_active && safety-- > 0) {
      const activeChar = state.characters.find((c) => c.id === state.active_character_id);
      if (!activeChar || activeChar.dead || activeChar.hp <= 0) {
        await dispatch({ type: 'end_turn' });
        continue;
      }
      const myEnt = state.entities?.find((e) => e.id === activeChar.id);
      const enemyEnt = state.entities
        ?.filter((e) => e.isEnemy && e.hp > 0)
        .sort((a, b) => {
          if (!myEnt) return 0;
          const da = Math.max(Math.abs(a.pos.x - myEnt.pos.x), Math.abs(a.pos.y - myEnt.pos.y));
          const db = Math.max(Math.abs(b.pos.x - myEnt.pos.x), Math.abs(b.pos.y - myEnt.pos.y));
          return da - db;
        })[0];
      if (!enemyEnt || !myEnt) {
        await dispatch({ type: 'end_turn' });
        continue;
      }
      const dx = enemyEnt.pos.x - myEnt.pos.x;
      const dy = enemyEnt.pos.y - myEnt.pos.y;
      const cheb = Math.max(Math.abs(dx), Math.abs(dy));
      if (cheb > 1) {
        const usedFt = state.movement_used?.[activeChar.id] ?? 0;
        const speedFt = activeChar.speed ?? 30;
        if (speedFt - usedFt < 5) {
          await dispatch({ type: 'end_turn' });
          continue;
        }
        const beforePos = { x: myEnt.pos.x, y: myEnt.pos.y };
        await dispatch({
          type: 'grid_move',
          entityId: activeChar.id,
          to: { x: myEnt.pos.x + Math.sign(dx), y: myEnt.pos.y + Math.sign(dy) },
        });
        // If the move was blocked (target square occupied by another PC,
        // out of bounds, etc.) the engine silently no-ops. Detect that and
        // end the turn so we don't infinite-loop on the same blocked
        // step. (The pre-fix engine round-robin'd the active marker each
        // tick and masked this; the AI now needs to recognise stuck
        // turns itself.)
        const afterEnt = state.entities?.find((e) => e.id === activeChar.id);
        if (afterEnt && afterEnt.pos.x === beforePos.x && afterEnt.pos.y === beforePos.y) {
          await dispatch({ type: 'end_turn' });
        }
      } else {
        if (activeChar.turn_actions.action_used) {
          await dispatch({ type: 'end_turn' });
          continue;
        }
        await dispatch({ type: 'attack', targetEnemyId: enemyEnt.id });
      }
    }
    if (state.combat_active) {
      throw new Error(`Combat soft-locked after 300 actions in room ${state.current_room}`);
    }
  }

  // Move the party marker to a cell (the 3-level map navigation primitive).
  const markerMove = (x: number, y: number) => dispatch({ type: 'marker_move', to: { x, y } });

  it('walks the full Malgovia playthrough — region → town → crypt → 3 quests turned in', async () => {
    // ── Stage 0: regional grid start ───────────────────────────────────────
    expect(state.map_level).toBe('regional');
    expect(state.current_region_id).toBe('vale_region');
    expect(state.marker_pos).toEqual({ x: 0, y: 7 }); // region.startPos — the south-west road end
    expect(state.current_room).toBe('');
    expect(state.characters.every((c) => c.hp > 0)).toBe(true);

    // ── Stage 1: enter Millhaven, accept the three quests ──────────────────
    await markerMove(10, 7); // Millhaven site (far east) → town grid
    expect(state.map_level).toBe('town');
    expect(state.current_town_id).toBe('millhaven_town');

    // Merchant District venue → Aldric → quest_shipment
    await markerMove(6, 2);
    expect(state.current_room).toBe('millhaven_market');
    await dispatch({ type: 'talk' });
    await dispatch({ type: 'talk_response', responseIdx: 0 });
    await dispatch({ type: 'accept_quest', questId: 'quest_shipment' });
    expect(state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.status).toBe(
      'active'
    );
    await markerMove(3, 0); // ascend exit → back to the town grid
    expect(state.map_level).toBe('town');

    // Temple venue → Sister Maren → quest_crypt
    await markerMove(1, 2);
    expect(state.current_room).toBe('millhaven_temple');
    await dispatch({ type: 'talk' });
    await dispatch({ type: 'talk_response', responseIdx: 0 });
    await dispatch({ type: 'accept_quest', questId: 'quest_crypt' });
    expect(state.quest_progress?.find((q) => q.questId === 'quest_crypt')?.status).toBe('active');
    await markerMove(3, 0);

    // Lantern District venue → Dusk → quest_shadow
    await markerMove(1, 5);
    expect(state.current_room).toBe('millhaven_lantern');
    await dispatch({ type: 'talk' });
    await dispatch({ type: 'talk_response', responseIdx: 0 });
    await dispatch({ type: 'accept_quest', questId: 'quest_shadow' });
    expect(state.quest_progress?.find((q) => q.questId === 'quest_shadow')?.status).toBe('active');
    await markerMove(3, 0);

    // ── Stage 2: garrison strongbox → shadow_evidence, deliver to Dusk ─────
    await markerMove(6, 5); // Garrison venue
    expect(state.current_room).toBe('millhaven_garrison');
    await dispatch({ type: 'interact_object', objectId: 'captain_strongbox' });
    expect(state.loot_taken).toContain('shadow_evidence');
    await markerMove(3, 0);

    // Back to the Lantern District to deliver the letter
    await markerMove(1, 5);
    expect(state.current_room).toBe('millhaven_lantern');
    await dispatch({ type: 'talk' });
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shadow')?.completedSteps
    ).toContain('step_find_letter');
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shadow')?.completedSteps
    ).toContain('step_deliver_letter');
    await markerMove(3, 0);

    // Leave town through the gate → back to the regional grid
    await markerMove(4, 7);
    expect(state.map_level).toBe('regional');

    // ── Stage 3: the Old Road skirmish (a regional local site) ─────────────
    await markerMove(10, 5); // The Old Road site (on the eastern road)
    expect(state.map_level).toBe('local');
    expect(state.current_room).toBe('old_road');
    await dispatch({ type: 'attack', targetEnemyId: 'old_road#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('old_road#0');
    expect(state.enemies_killed).toContain('old_road#1');
    await markerMove(9, 4); // ascend → back to the region
    expect(state.map_level).toBe('regional');

    // ── Stage 4: the Shattered Crypt ───────────────────────────────────────
    await markerMove(9, 3); // Shattered Crypt site → entrance
    expect(state.current_room).toBe('dungeon_crypt_entrance');

    await markerMove(9, 0); // exit → antechamber
    expect(state.current_room).toBe('dungeon_antechamber');
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_antechamber#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_antechamber#0');

    await markerMove(9, 0); // exit → charnel hall
    expect(state.current_room).toBe('dungeon_charnel_hall');
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_charnel_hall#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_charnel_hall#0');
    expect(state.enemies_killed).toContain('dungeon_charnel_hall#1');

    // Back to the antechamber, then down the offering-chamber branch for the ledger
    await markerMove(0, 9); // charnel back-exit → antechamber (at {9,0})
    expect(state.current_room).toBe('dungeon_antechamber');
    await markerMove(9, 9); // antechamber → offering chamber
    expect(state.current_room).toBe('dungeon_offering_chamber');
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_offering_chamber#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_offering_chamber#0');
    await dispatch({ type: 'loot' });
    expect(state.loot_taken).toContain('dungeon_offering_chamber');
    const allInv = state.characters.flatMap((c) => c.inventory);
    expect(allInv.some((i) => i.id === 'guild_ledger')).toBe(true);

    // Push through ossuary → throne
    await markerMove(9, 9); // offering → ossuary
    expect(state.current_room).toBe('dungeon_ossuary');
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_ossuary#0' });
    await clearCombat();

    await markerMove(9, 9); // ossuary → throne (arrives at {1,1})
    expect(state.current_room).toBe('dungeon_crypt_throne');
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_crypt_throne#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_crypt_throne#0'); // Crypt Lord
    await dispatch({ type: 'loot' });
    expect(state.loot_taken).toContain('dungeon_crypt_throne');
    const allInv2 = state.characters.flatMap((c) => c.inventory);
    expect(allInv2.some((i) => i.id === 'moonstone_amulet')).toBe(true);

    // ── Stage 5: climb out and return to town to turn in the quests ────────
    await markerMove(9, 9); // throne → hidden passage (crypt exit)
    expect(state.current_room).toBe('dungeon_crypt_exit');
    await markerMove(7, 7); // ascend → back to the regional grid (at the crypt site)
    expect(state.map_level).toBe('regional');

    await markerMove(10, 7); // travel back to Millhaven
    expect(state.map_level).toBe('town');
    await markerMove(6, 2); // Merchant District → Aldric
    expect(state.current_room).toBe('millhaven_market');
    await dispatch({ type: 'talk' }); // fires the room_id + loot quest checks

    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.completedSteps
    ).toContain('step_find_ledger');
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.completedSteps
    ).toContain('step_return_ledger');
    expect(state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.status).toBe(
      'completed'
    );

    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_crypt')?.completedSteps
    ).toContain('step_recover_amulet');
    expect(state.quest_progress?.find((q) => q.questId === 'quest_crypt')?.status).toBe(
      'completed'
    );

    // ── Stage 6: choice generation sanity ─────────────────────────────────
    const finalChoices = generateChoices(state, seed, ctx);
    expect(finalChoices.length).toBeGreaterThan(0);
  }, 30_000);
});

describe('Malgovia region layout — the linear arc', () => {
  it('finds a path from the start to every site (the sea forces an arc, but nothing is walled off)', () => {
    const seed = generateSeed(ctx, 3);
    const st = initMapState(ctx.campaign, {
      visited_rooms: [],
    } as unknown as GameState) as GameState;
    const grid = activeGrid(ctx.campaign, seed.rooms, st)!;
    expect(grid.level).toBe('regional');
    // The sea actually blocks cells (so the arc is real, not cosmetic)…
    expect(grid.obstacles.length).toBeGreaterThan(0);
    // …yet every site (including the frozen NW behind the sea) is reachable.
    for (const t of grid.transitions) {
      const path = findPath(grid.startPos, t.pos, grid.obstacles, grid.width, grid.height);
      expect(path, `no path from start to ${t.label} (${t.pos.x},${t.pos.y})`).toBeTruthy();
    }
  });

  it('blocks the direct northern shortcut up the west side (must arc east)', () => {
    const seed = generateSeed(ctx, 3);
    const st = initMapState(ctx.campaign, {
      visited_rooms: [],
    } as unknown as GameState) as GameState;
    const grid = activeGrid(ctx.campaign, seed.rooms, st)!;
    // The Spire is top-left, the start bottom-left — a straight path up the west
    // edge is impossible (the sea is in the way), so the route must detour east.
    const spire = grid.transitions.find((t) => t.label === 'Iceshard Spire')!;
    const path = findPath(grid.startPos, spire.pos, grid.obstacles, grid.width, grid.height)!;
    const maxX = Math.max(...path.map((p) => p.x));
    expect(maxX).toBeGreaterThan(6); // the path swings east of the sea before heading north
  });
});
