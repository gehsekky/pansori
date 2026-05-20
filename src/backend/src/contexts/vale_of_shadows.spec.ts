// Scripted full-Vale-of-Shadows playthrough.
//
// Drives the game engine through every quest step in Vale of Shadows and asserts
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
} from '../types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyQuestCompletions,
  evaluateQuestSteps,
  extractCampaignDelta,
} from '../services/campaignEngine.js';
import { generateChoices, takeAction } from '../services/gameEngine.js';
import { context as ctx } from './vale_of_shadows.js';
import { generateSeed } from '../services/procgen.js';
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
    equipped_weapon: null,
    equipped_armor: null,
    equipped_shield: null,
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
    current_room: ctx.startRoomId,
    visited_rooms: [ctx.startRoomId],
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
    current_location_id: 'town_millhaven',
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
    current_location: 'town_millhaven',
    flags: {},
    quests: [],
    faction_rep: {},
    npc_attitudes: {},
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Vale of Shadows — scripted playthrough', () => {
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
      location_id: state.current_location_id ?? '',
      enemies_killed: state.enemies_killed,
      loot_taken: state.loot_taken,
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

  it('walks the full Vale playthrough — town → crypt → 3 quests turned in', async () => {
    // ── Stage 1: town setup ────────────────────────────────────────────────
    // Starting position
    expect(state.current_room).toBe('millhaven_square');
    expect(state.characters.every((c) => c.hp > 0)).toBe(true);

    // Talk to Aldric in the market
    await dispatch({ type: 'move', roomId: 'millhaven_market' });
    expect(state.current_room).toBe('millhaven_market');
    await dispatch({ type: 'talk' });
    // Pick "I'll look into the missing shipment" — advance_quest consequence
    await dispatch({ type: 'talk_response', responseIdx: 0 });
    // Explicitly accept the quest
    await dispatch({ type: 'accept_quest', questId: 'quest_shipment' });
    expect(state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.status).toBe(
      'active'
    );

    // Talk to Sister Maren in the temple
    await dispatch({ type: 'move', roomId: 'millhaven_square' });
    await dispatch({ type: 'move', roomId: 'millhaven_temple' });
    await dispatch({ type: 'talk' });
    await dispatch({ type: 'talk_response', responseIdx: 0 });
    await dispatch({ type: 'accept_quest', questId: 'quest_crypt' });
    expect(state.quest_progress?.find((q) => q.questId === 'quest_crypt')?.status).toBe('active');

    // Talk to Dusk in the slums
    await dispatch({ type: 'move', roomId: 'millhaven_square' });
    await dispatch({ type: 'move', roomId: 'millhaven_slums' });
    await dispatch({ type: 'talk' });
    await dispatch({ type: 'talk_response', responseIdx: 0 });
    await dispatch({ type: 'accept_quest', questId: 'quest_shadow' });
    expect(state.quest_progress?.find((q) => q.questId === 'quest_shadow')?.status).toBe('active');

    // ── Stage 2: garrison — strongbox for shadow_evidence ─────────────────
    await dispatch({ type: 'move', roomId: 'millhaven_garrison' });
    // Interact with strongbox (object id is `captain_strongbox`)
    await dispatch({ type: 'interact_object', objectId: 'captain_strongbox' });
    expect(state.loot_taken).toContain('shadow_evidence');

    // Return to Dusk to deliver the letter
    await dispatch({ type: 'move', roomId: 'millhaven_slums' });
    // quest_shadow.step_deliver_letter checks loot_taken + room_id == millhaven_slums
    // The arrival here should fire the step on the next action's evaluation.
    await dispatch({ type: 'talk' });
    // After arriving in slums with the letter, the quest should auto-complete
    // via evaluateQuestSteps.
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shadow')?.completedSteps
    ).toContain('step_find_letter');
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shadow')?.completedSteps
    ).toContain('step_deliver_letter');

    // ── Stage 3: travel to crypt ──────────────────────────────────────────
    await dispatch({ type: 'move', roomId: 'millhaven_square' });
    await dispatch({ type: 'move', roomId: 'road_north' });
    expect(state.current_room).toBe('road_north');
    // Two bandits on the Old Road — initiate combat
    await dispatch({ type: 'attack', targetEnemyId: 'road_north#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('road_north#0');
    expect(state.enemies_killed).toContain('road_north#1');

    // ── Stage 4: dungeon clear ────────────────────────────────────────────
    await dispatch({ type: 'move', roomId: 'dungeon_crypt_entrance' });

    await dispatch({ type: 'move', roomId: 'dungeon_antechamber' });
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_antechamber#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_antechamber#0');

    await dispatch({ type: 'move', roomId: 'dungeon_charnel_hall' });
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_charnel_hall#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_charnel_hall#0');
    expect(state.enemies_killed).toContain('dungeon_charnel_hall#1');

    // Detour to ossuary path for guild_ledger (it's in offering_chamber)
    await dispatch({ type: 'move', roomId: 'dungeon_antechamber' });
    await dispatch({ type: 'move', roomId: 'dungeon_offering_chamber' });
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_offering_chamber#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_offering_chamber#0');
    // Pick up the guild ledger
    await dispatch({ type: 'loot' });
    expect(state.loot_taken).toContain('dungeon_offering_chamber');
    // The ledger should be in inventory
    const allInv = state.characters.flatMap((c) => c.inventory);
    expect(allInv.some((i) => i.id === 'guild_ledger')).toBe(true);

    // Push through to throne room
    await dispatch({ type: 'move', roomId: 'dungeon_ossuary' });
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_ossuary#0' });
    await clearCombat();

    await dispatch({ type: 'move', roomId: 'dungeon_crypt_throne' });
    await dispatch({ type: 'attack', targetEnemyId: 'dungeon_crypt_throne#0' });
    await clearCombat();
    expect(state.enemies_killed).toContain('dungeon_crypt_throne#0'); // Crypt Lord
    // Recover the moonstone amulet
    await dispatch({ type: 'loot' });
    expect(state.loot_taken).toContain('dungeon_crypt_throne');
    const allInv2 = state.characters.flatMap((c) => c.inventory);
    expect(allInv2.some((i) => i.id === 'moonstone_amulet')).toBe(true);

    // ── Stage 5: return to town & turn in quests ──────────────────────────
    // The escape room is the exit from the crypt
    await dispatch({ type: 'move', roomId: 'dungeon_crypt_exit' });

    // Travel back through the world to Millhaven. The escapeRoomId connects
    // back to throne room; from there we walk back the way we came.
    // (escape action would exit the dungeon entirely)
    state.current_room = 'millhaven_market'; // teleport for the test — simpler
    state.current_location_id = 'town_millhaven';

    await dispatch({ type: 'talk' });
    // Quest shipment requires loot_taken contains guild_ledger AND location_id
    // == town_millhaven. Once both are true, evaluateQuestSteps fires.
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.completedSteps
    ).toContain('step_find_ledger');
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.completedSteps
    ).toContain('step_return_ledger');
    expect(state.quest_progress?.find((q) => q.questId === 'quest_shipment')?.status).toBe(
      'completed'
    );

    // quest_crypt expects enemies_killed contains 'dungeon_crypt_throne' (the
    // current condition value). The actual enemy id is `dungeon_crypt_throne#0`.
    // This may surface a bug — if so, the assertion below will fail.
    expect(
      state.quest_progress?.find((q) => q.questId === 'quest_crypt')?.completedSteps
    ).toContain('step_recover_amulet');
    expect(state.quest_progress?.find((q) => q.questId === 'quest_crypt')?.status).toBe(
      'completed'
    );

    // ── Stage 6: choice generation sanity ─────────────────────────────────
    const finalChoices = generateChoices(state, seed, ctx);
    // We should have at least one action available (talk, short rest, etc.)
    expect(finalChoices.length).toBeGreaterThan(0);
  }, 30_000);
});
