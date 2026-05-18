import { randomUUID } from 'crypto';
import {
  rollDice, abilityMod,
  FRESH_TURN,
  resolvePlayerAttack, resolveOffHandAttack, resolveEnemyAttack, unarmedDamage,
  skillCheck, rollDeathSave, profBonus, d,
  ADVANTAGE_CONDITIONS, DISADV_CONDITIONS, PLAYER_ADV_CONDITIONS, ENEMY_DISADV_CONDITIONS,
  rollConditionSave, rollCritical, resolveSaveWithAdvantage, resolveMysteryConsumable, passivePerceptionDC,
  sneakAttackDice, extraAttackCount, rageDamageBonus, rageUsesMax,
  spellSaveDC, resolveSpellAttack,
  passivePerception, disarmTrap,
  hasArmorProficiency, hasWeaponProficiency,
  applyDamageMultiplier,
  upcastDamage, cantripDamageDice, spellSlotsForClassLevel,
} from './rulesEngine.js';
import { Engine } from 'json-rules-engine';
import type { GameState, Character, Seed, Context, Enemy, LootItem, InventoryItem, OnHitEffect, StructuredAction, GameChoice, DeathSaves, TurnActions, GameConsequence, RuleFacts, PlacedNpc, NpcAttitude, AbilityKey, Trap, RoomObject, CombatEntity } from '../types.js';
import { inRange, findPath, pathCostFeet, opportunityAttackTriggers, DEFAULT_SPEED_FEET, coverBonus, isFlankingPosition, posEqual, SQUARE_SIZE } from './gridEngine.js';
import { llmProvider } from './llmProvider.js';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function hpTier(char: Character): 'healthy' | 'hurt' | 'critical' {
  const pct = (char.hp ?? 0) / (char.max_hp || 1);
  if (pct > 0.66) return 'healthy';
  if (pct > 0.33) return 'hurt';
  return 'critical';
}

// Exhaustion 4: effective max HP is halved (PHB p.291)
function clampHpForExhaustion(hp: number, maxHp: number, exhaustionLevel: number): number {
  if (exhaustionLevel >= 4) return Math.min(hp, Math.floor(maxHp / 2));
  return hp;
}

// ─── Concentration helpers ────────────────────────────────────────────────────

function breakConcentration(char: Character, st: GameState): { char: Character; st: GameState } {
  if (!char.concentrating_on) return { char, st };
  const condition = char.concentrating_on.condition;
  const newChar   = { ...char, concentrating_on: null };
  const newSt     = condition
    ? { ...st, enemy_conditions: (st.enemy_conditions ?? []).filter(c => c !== condition) }
    : st;
  return { char: newChar, st: newSt };
}

function checkConcentration(
  char: Character,
  st: GameState,
  dmgTaken: number,
): { char: Character; st: GameState; note: string } {
  if (!char.concentrating_on || dmgTaken <= 0) return { char, st, note: '' };
  const dc   = Math.max(10, Math.floor(dmgTaken / 2));
  const save = d(20) + abilityMod(char.con);
  if (save >= dc) return { char, st, note: ` [Concentration hold: ${save} vs DC ${dc}]` };
  const spellName = char.concentrating_on.spellId;
  const { char: nc, st: ns } = breakConcentration(char, st);
  return { char: nc, st: ns, note: ` [Concentration broken: ${save} vs DC ${dc} — ${spellName} ends!]` };
}

function pickTiered(template: string[] | Record<string, string[]> | undefined, tier: string): string {
  if (!template) return '';
  if (Array.isArray(template)) return pick(template);
  return pick(template[tier] || template['healthy'] || template[Object.keys(template)[0]] || ['']);
}

function buildCombatHitNarrative(
  enemy: Enemy,
  weaponItem: LootItem | null,
  damage: number,
  critical: boolean,
  char: Character,
  context: Context,
): string {
  const tier         = hpTier(char);
  const opening      = pickTiered(context.narratives.combatHit, tier).replace(/{enemy}/g, enemy.name);
  const verbPool     = context.narratives.weaponVerbs?.[weaponItem?.id ?? ''] ?? context.narratives.weaponVerbs?.['unarmed'] ?? ['connects with'];
  const verb         = pick(verbPool);
  const stylePool    = context.narratives.classStyle?.[char.character_class];
  const style        = stylePool ? `, ${pick(stylePool)},` : '';
  const reactionPool = context.narratives.enemyReactions?.[enemy.name];
  const reaction     = reactionPool ? ` — ${pick(reactionPool)}` : '';
  const critNote     = critical ? 'Critical hit! ' : '';
  const weaponLabel  = weaponItem ? `your ${weaponItem.name}` : 'your fists';
  return `${opening} ${critNote}${weaponLabel} ${verb}${style}${reaction}! ${damage} damage.`;
}

const MAX_CHOICES = 10;

function getItemData(item: InventoryItem | undefined, context: Context): LootItem & InventoryItem {
  if (!item) return {} as LootItem & InventoryItem;
  const tableEntry = context.lootTable.find(i => i.id === item.id) ?? {} as LootItem;
  return { ...tableEntry, ...item };
}

function getWorldName(seed: Seed): string {
  return seed.world_name || seed.ship_name || 'the world';
}

function getEnemyHp(state: GameState, roomId: string, seed: Seed): number {
  if (state.enemy_hp?.[roomId] !== undefined) return state.enemy_hp[roomId];
  return seed.enemies?.[roomId]?.hp ?? 0;
}

function setEnemyHp(state: GameState, roomId: string, hp: number): GameState {
  const updated = { ...state, enemy_hp: { ...state.enemy_hp, [roomId]: hp } };
  if (updated.entities) {
    updated.entities = updated.entities.map(e =>
      e.id === roomId && e.isEnemy ? { ...e, hp } : e,
    );
  }
  return updated;
}

// ─── Condition helpers ────────────────────────────────────────────────────────

function conditionSavingThrow(
  effect:  OnHitEffect,
  char:    Pick<Character, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'level' | 'character_class'>,
  context: Context,
): boolean {
  const proficient = context.classSavingThrows?.[char.character_class]?.includes(effect.ability) ?? false;
  return rollConditionSave(effect.ability, char[effect.ability] ?? 10, effect.dc, proficient, char.level);
}

// ─── Enemy attack helper ──────────────────────────────────────────────────────

function applyEnemyAttackNarrative(
  enemy: Enemy,
  char: Character,
  context: Context,
): { hpLost: number; narrative: string; newConditions: string[]; newDurations: Record<string, number> } {
  const isDodging       = char.turn_actions?.dodging ?? false;
  const hasAdvantage    = char.conditions.some(c => ADVANTAGE_CONDITIONS.has(c));
  const hasDisadvantage = char.conditions.some(c => ENEMY_DISADV_CONDITIONS.has(c)) || isDodging;
  const result          = resolveEnemyAttack(enemy, char.ac, hasAdvantage, hasDisadvantage);
  const armorItem    = char.equipped_armor ? char.inventory?.find(i => i.id === char.equipped_armor) : null;

  if (result.hit) {
    // Rage resistance: halve physical damage while raging (PHB p.48)
    const isRaging = char.conditions.includes('raging');
    let hpLost   = isRaging ? Math.ceil(result.damage / 2) : result.damage;
    const rageNote = isRaging ? ` (Rage resistance: ${result.damage}→${hpLost})` : '';
    // Exhaustion 4: effective max HP is halved — clamp current HP after taking damage
    const newHpAfterDmg = clampHpForExhaustion(Math.max(0, char.hp - hpLost), char.max_hp, char.exhaustion_level ?? 0);
    hpLost = char.hp - newHpAfterDmg; // recalculate actual HP lost after clamp

    let narrative = pick(context.narratives.enemyAttacks)
      .replace('{enemy}', enemy.name)
      .replace('{dmg}',   String(hpLost));
    narrative += rageNote;
    let updatedChar = { ...char };

    if (enemy.onHitEffect) {
      const conditionApplied = conditionSavingThrow(enemy.onHitEffect, char, context);
      if (conditionApplied) {
        updatedChar = inflictCondition(updatedChar, enemy.onHitEffect.condition);
        if (updatedChar.conditions.length > char.conditions.length) {
          narrative += ` You are ${enemy.onHitEffect.condition}!`;
        }
      }
    }
    return { hpLost, narrative, newConditions: updatedChar.conditions, newDurations: updatedChar.condition_durations };
  }
  if (armorItem) {
    return {
      hpLost:        0,
      narrative:     pick(context.narratives.enemyDeflected)
        .replace('{enemy}', enemy.name)
        .replace('{armor}', armorItem.name),
      newConditions: [...char.conditions],
      newDurations:  { ...(char.condition_durations ?? {}) },
    };
  }
  return {
    hpLost:        0,
    narrative:     `The ${enemy.name} lunges — but you dodge at the last second!`,
    newConditions: [...char.conditions],
    newDurations:  { ...(char.condition_durations ?? {}) },
  };
}

// ─── Death save handler ───────────────────────────────────────────────────────

function processDeathSave(
  char: Character,
  enemy: Enemy | null | undefined,
  context: Context,
  worldName: string,
): { narrative: string; newChar: Character; died: boolean; endedCombat: boolean } {
  const save    = rollDeathSave(char.death_saves);
  let newChar   = { ...char, death_saves: save.saves };
  let narrative = '';
  let endedCombat = false;

  switch (save.result) {
    case 'regain_hp':
      newChar.hp          = 1;
      newChar.death_saves = { successes: 0, failures: 0 };
      newChar.stable      = false;
      newChar.conditions  = [];
      endedCombat         = true;
      narrative = `Death Save — Natural 20! You surge back to 1 HP, gasping but alive.`;
      return { narrative, newChar, died: false, endedCombat };

    case 'stable':
      newChar.stable = true;
      narrative = `Death Save — ${save.roll} (${save.saves.successes}/3 successes). You stabilise. Unconscious but no longer dying. You need healing to act again.`;
      break;

    case 'success': {
      const pool   = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'Clinging to life...';
      narrative = `Death Save — ${save.roll} (${save.saves.successes}/3 successes, ${save.saves.failures}/3 failures). ${flavor}`;
      break;
    }

    case 'double_failure': {
      const pool   = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'The darkness presses in...';
      narrative = `Death Save — Natural 1! Two failures (${save.saves.failures}/3). ${flavor}`;
      break;
    }

    case 'failure': {
      const pool   = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'Fading...';
      narrative = `Death Save — ${save.roll} (${save.saves.successes}/3 successes, ${save.saves.failures}/3 failures). ${flavor}`;
      break;
    }

    case 'dead':
      newChar.dead = true;
      narrative = pick(context.narratives.deathLines)
        .replace('{enemy}', enemy?.name ?? 'your wounds')
        .replace(/{world}/g, worldName);
      return { narrative, newChar, died: true, endedCombat: false };
  }

  // While unconscious, a living enemy delivers automatic hits → 2 death save failures
  if (enemy && !newChar.dead) {
    const attackSaves = {
      successes: newChar.death_saves.successes,
      failures:  Math.min(3, newChar.death_saves.failures + 2),
    };
    newChar.death_saves = attackSaves;
    narrative += ` The ${enemy.name} attacks your prone form — 2 death save failures (${attackSaves.failures}/3)!`;
    if (attackSaves.failures >= 3) {
      newChar.dead = true;
      narrative += ' ' + pick(context.narratives.deathLines)
        .replace('{enemy}', enemy.name)
        .replace(/{world}/g, worldName);
      return { narrative, newChar, died: true, endedCombat: false };
    }
  }

  return { narrative, newChar, died: false, endedCombat };
}

// ─── Condition duration helpers ───────────────────────────────────────────────

// How many rounds each on-hit condition lasts (cleared at start of victim's next turn).
// Conditions with no entry (exhaustion) are permanent until explicitly cleared.
const CONDITION_DURATION: Record<string, number> = {
  stunned:       1,
  paralyzed:     1,
  poisoned:      2,
  prone:         1,
  frightened:    2,
  blinded:       1,
  restrained:    1,
  incapacitated: 1,
  grappled:      1,
  invisible:     2,
};

function inflictCondition(char: Character, condition: string): Character {
  if (char.conditions.includes(condition)) return char;
  const duration = CONDITION_DURATION[condition] ?? 1;
  return {
    ...char,
    conditions:          [...char.conditions, condition],
    condition_durations: { ...(char.condition_durations ?? {}), [condition]: duration },
  };
}

function tickConditions(char: Character): Character {
  const durations = char.condition_durations ?? {};
  if (!char.conditions.length) return char;

  const newDurations: Record<string, number> = {};
  const expired: string[] = [];

  for (const cond of char.conditions) {
    if (durations[cond] === undefined) {
      // No duration entry → permanent (only cleared by game logic)
      newDurations[cond] = durations[cond];
    } else {
      const remaining = durations[cond] - 1;
      if (remaining <= 0) {
        expired.push(cond);
      } else {
        newDurations[cond] = remaining;
      }
    }
  }

  const newConditions = char.conditions.filter(c => !expired.includes(c));
  return { ...char, conditions: newConditions, condition_durations: newDurations };
}

// ─── Initiative helpers ───────────────────────────────────────────────────────

type InitEntry = { id: string; roll: number; is_enemy: boolean };

function buildInitiativeOrder(
  chars: Character[],
  enemy: Enemy,
  enemyRoomId: string,
): InitEntry[] {
  const entries: InitEntry[] = [
    ...chars.filter(c => !c.dead).map(c => ({
      id:       c.id,
      roll:     rollDice('1d20') + abilityMod(c.dex),
      is_enemy: false,
    })),
    { id: enemyRoomId, roll: rollDice('1d20') + abilityMod(enemy.dex ?? 10), is_enemy: true },
  ];
  // Sort descending by roll; ties broken by dex (enemy.dex vs char.dex)
  entries.sort((a, b) => b.roll - a.roll);
  return entries;
}

function endCombatState(st: GameState): GameState {
  return {
    ...st,
    combat_active:    false,
    initiative_order: [],
    initiative_idx:   0,
    entities:         undefined,
    movement_used:    undefined,
    characters: st.characters.map(c => ({
      ...c,
      turn_actions: { ...FRESH_TURN },
      // Rage ends when combat ends (PHB p.48)
      conditions:          c.conditions.filter(cond => cond !== 'raging'),
      condition_durations: Object.fromEntries(
        Object.entries(c.condition_durations ?? {}).filter(([k]) => k !== 'raging'),
      ),
    })),
  };
}

// ─── Turn advancement ─────────────────────────────────────────────────────────

function advanceActiveCharacter(characters: Character[], currentId: string): string {
  const living = characters.filter(c => !c.dead);
  if (living.length === 0) return currentId;
  const idx  = living.findIndex(c => c.id === currentId);
  const next = living[(idx + 1) % living.length];
  return next.id;
}

// ─── Rest helper ──────────────────────────────────────────────────────────────

function canRestInRoom(state: GameState, seed: Seed): boolean {
  const room = seed.rooms.find(r => r.id === state.current_room);
  if (room?.canRest === false) return false;
  const enemy = seed.enemies?.[state.current_room];
  return !(enemy && !state.enemies_killed.includes(state.current_room));
}

// ─── Trap helpers ─────────────────────────────────────────────────────────────

function getRoomTrap(roomId: string, seed: Seed, context: Context): Trap | null {
  // Traps are defined on Room objects inside the campaign or room pool
  const campaignRoom = context.campaign?.rooms?.find(r => r.id === roomId);
  if (campaignRoom?.trap) return campaignRoom.trap;
  const seedRoom = seed.rooms?.find(r => r.id === roomId);
  if (seedRoom?.trap) return seedRoom.trap;
  return null;
}

function trapSpent(state: GameState, roomId: string): boolean {
  return (state.traps_triggered ?? []).includes(roomId) || (state.traps_disarmed ?? []).includes(roomId);
}

function partyDetectsTrap(characters: Character[], trap: Trap): boolean {
  return characters.some(c => {
    if (c.dead) return false;
    const proficient = c.skill_proficiencies?.includes('Perception') ?? false;
    return passivePerception(c.wis, c.level, proficient) >= trap.dc;
  });
}

// ─── Spell helpers ────────────────────────────────────────────────────────────

function getSpellSlotsForLevel(className: string, level: number, context: Context): Record<number, number> {
  return context.classSpellSlots?.[className]?.[level - 1] ?? {};
}

// ─── Backward-compatibility normalizer ───────────────────────────────────────

export function normalizeState(
  raw: Record<string, unknown>,
  sessionMeta?: { character_name?: string; portrait_url?: string },
): GameState {
  // Already new format — patch any fields added after initial rollout
  if (Array.isArray((raw as unknown as GameState).characters)) {
    const gs = raw as unknown as GameState;
    return {
      ...gs,
      short_rested_rooms: gs.short_rested_rooms ?? [],
      long_rested:        gs.long_rested        ?? false,
      npc_attitudes:      gs.npc_attitudes      ?? {},
      npc_talked:         gs.npc_talked         ?? [],
      traps_triggered:    gs.traps_triggered    ?? [],
      traps_disarmed:     gs.traps_disarmed     ?? [],
      objects_searched:   gs.objects_searched   ?? [],
      enemy_conditions:   gs.enemy_conditions   ?? [],
      characters: gs.characters.map(c => ({
        ...c,
        hit_die:              c.hit_die              ?? 8,
        hit_dice_remaining:   c.hit_dice_remaining   ?? (c.level ?? 1),
        condition_durations:  c.condition_durations  ?? {},
        class_resource_uses:  c.class_resource_uses  ?? {},
        asi_pending:          c.asi_pending          ?? false,
        exhaustion_level:     c.exhaustion_level     ?? 0,
        spell_slots_max:      c.spell_slots_max      ?? {},
        spell_slots_used:     c.spell_slots_used     ?? {},
        spells_known:         c.spells_known         ?? [],
        background_id:        c.background_id        ?? null,
        skill_proficiencies:  c.skill_proficiencies  ?? [],
        tool_proficiencies:   c.tool_proficiencies   ?? [],
        armor_proficiencies:  c.armor_proficiencies  ?? [],
        weapon_proficiencies: c.weapon_proficiencies ?? [],
        attuned_items:        c.attuned_items        ?? [] as string[],
      })),
    };
  }

  const charId = randomUUID();
  const level  = Number(raw.level ?? 1);
  const char: Character = {
    id:              charId,
    name:            sessionMeta?.character_name ?? 'Hero',
    character_class: String(raw.character_class ?? 'Adventurer'),
    portrait_url:    sessionMeta?.portrait_url ?? null,
    hp:              Number(raw.hp ?? 20),
    max_hp:          Number(raw.max_hp ?? 20),
    ac:              Number(raw.ac ?? 10),
    str:             Number(raw.str ?? 10),
    dex:             Number(raw.dex ?? 10),
    con:             Number(raw.con ?? 10),
    int:             Number(raw.int ?? 10),
    wis:             Number(raw.wis ?? 10),
    cha:             Number(raw.cha ?? 10),
    xp:              Number(raw.xp ?? 0),
    level,
    gold:            Number(raw.gold ?? 5),
    inventory:       (raw.inventory as InventoryItem[]) ?? [],
    equipped_weapon: (raw.equipped_weapon as string | null) ?? null,
    equipped_armor:  (raw.equipped_armor  as string | null) ?? null,
    equipped_shield: (raw.equipped_shield as string | null) ?? null,
    conditions:          (raw.conditions as string[]) ?? [],
    condition_durations: (raw.condition_durations as Record<string, number>) ?? {},
    death_saves:         (raw.death_saves as DeathSaves) ?? { successes: 0, failures: 0 },
    stable:          Boolean(raw.stable),
    dead:            Boolean(raw.dead),
    turn_actions:    (raw.turn_actions as TurnActions) ?? { ...FRESH_TURN },
    initiative_roll:     null,
    hit_die:             8,
    hit_dice_remaining:  level,
    class_resource_uses: {},
    asi_pending:         false,
    exhaustion_level:    0,
    spell_slots_max:     {},
    spell_slots_used:    {},
    spells_known:        [],
    background_id:        null,
    skill_proficiencies:  [],
    tool_proficiencies:   [],
    armor_proficiencies:  [],
    weapon_proficiencies: [],
    attuned_items:        [] as string[],
  };
  const oldRunLog = (raw.run_log as Array<{ action: string; narrative: string }>) ?? [];
  return {
    characters:          [char],
    active_character_id: charId,
    current_room:        String(raw.current_room ?? ''),
    visited_rooms:       (raw.visited_rooms as string[]) ?? [],
    enemies_killed:      (raw.enemies_killed as string[]) ?? [],
    loot_taken:          (raw.loot_taken as string[]) ?? [],
    enemy_hp:            (raw.enemy_hp as Record<string, number>) ?? {},
    combat_active:       Boolean(raw.combat_active),
    initiative_order:    [],
    initiative_idx:      0,
    run_log:             oldRunLog.map(e => ({ character_id: charId, action: e.action, narrative: e.narrative })),
    room_log:            (raw.room_log as string[]) ?? [],
    last_choices:        undefined,
    short_rested_rooms:  [],
    long_rested:         false,
    npc_attitudes:       {},
    npc_talked:          [],
    traps_triggered:     [],
    traps_disarmed:      [],
    objects_searched:    [],
    flags:               (raw.flags as Record<string, boolean | string | number>) ?? {},
    enemy_conditions:    [],
  };
}

// ─── Arrival narrative ────────────────────────────────────────────────────────

export function buildArrivalNarrative(targetId: string, state: GameState, seed: Seed, context: Context): string {
  const templates  = context.narratives.roomArrival[targetId] || context.narratives.genericArrival;
  let text         = pick(templates).replace(/{world}/g, getWorldName(seed));

  const exitNames = (seed.connections[targetId] ?? [])
    .map(id => seed.rooms.find(r => r.id === id)?.name)
    .filter((n): n is string => Boolean(n))
    .join(', ');
  if (exitNames) text += ` Exits: ${exitNames}.`;

  const newEnemy   = seed.enemies?.[targetId];
  const newEnemyHp = getEnemyHp(state, targetId, seed);
  if (newEnemy && !state.enemies_killed.includes(targetId) && newEnemyHp > 0) {
    text += ` A ${newEnemy.name} is here — HP: ${newEnemyHp}, AC: ${newEnemy.ac}.`;
  } else if (newEnemy && state.enemies_killed.includes(targetId)) {
    text += ' ' + pick(context.narratives.alreadyDead);
  }
  const newLoot = seed.loot?.[targetId];
  if (newLoot && !state.loot_taken.includes(targetId)) {
    text += ` You spot a ${newLoot.name} on the ground.`;
  }

  // Passive trap detection (5e DMG ch.5)
  const trap = getRoomTrap(targetId, seed, context);
  if (trap && !trapSpent(state, targetId)) {
    if (partyDetectsTrap(state.characters, trap)) {
      text += ' ' + trap.detectNarrative;
    }
    // If not detected, trap fires silently on next action — handled in takeAction
  }

  return text;
}

// ─── NPC helpers ─────────────────────────────────────────────────────────────

function getNpcAttitude(state: GameState, npc: PlacedNpc): NpcAttitude {
  return state.npc_attitudes?.[npc.roomId] ?? npc.attitude;
}

function npcIsKilled(state: GameState, roomId: string): boolean {
  return !!(state.npc_attitudes?.[roomId] === 'hostile' && state.enemies_killed?.includes(`npc:${roomId}`));
}

// ─── Choice generation ────────────────────────────────────────────────────────

export function generateChoices(state: GameState, seed: Seed, context: Context): GameChoice[] {
  const char = state.characters.find(c => c.id === state.active_character_id) ?? state.characters[0];
  if (!char) return [];

  if (char.dead) return [];

  // Pending ASI: only show stat-boost choices until resolved
  if (char.asi_pending) {
    const statLabels: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
    return (Object.keys(statLabels) as AbilityKey[]).map(stat => ({
      label:  `Ability Score Improvement: +2 ${statLabels[stat]} (currently ${char[stat]})`,
      action: { type: 'apply_asi' as const, stat },
    }));
  }

  const healItems = context.lootTable.filter(i => i.heal);
  const healItem  = char.inventory?.find(i => healItems.find(h => h.id === i.id));

  if (char.hp <= 0 && !char.stable) return [{ label: 'Roll death saving throw', action: { type: 'death_save' } }];
  if (char.hp <= 0 && char.stable)  return [{ label: 'Use healing item', action: { type: 'use', itemId: healItem?.id ?? '' } }];

  // Stunned / paralyzed / incapacitated: cannot take actions, bonus actions, reactions, or move
  const isIncapacitated = char.conditions.some(c => ['stunned', 'paralyzed', 'incapacitated'].includes(c));
  if (isIncapacitated) {
    const cond = (char.conditions.find(c => ['stunned', 'paralyzed', 'incapacitated'].includes(c)) ?? 'stunned').toUpperCase();
    return [{ label: `${cond} — cannot act this turn (pass)`, action: { type: 'pass' } }];
  }

  const choices: GameChoice[] = [];
  const roomId     = state.current_room;
  const enemy      = seed.enemies?.[roomId];
  const loot       = seed.loot?.[roomId];
  const enemyAlive = enemy && !state.enemies_killed?.includes(roomId);
  const lootAvail  = loot  && !state.loot_taken?.includes(roomId);
  const adjacent   = (seed.connections[roomId] || [])
    .map(id => seed.rooms.find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  // Trap: offer disarm if trap is detected (party passive Perception beat the DC) but not yet spent
  const roomTrap = getRoomTrap(roomId, seed, context);
  if (roomTrap && !trapSpent(state, roomId) && partyDetectsTrap(state.characters, roomTrap)) {
    choices.push({ label: `Disarm Trap — DEX check (DC ${roomTrap.dc})`, action: { type: 'disarm_trap' } });
  }

  if (state.current_room === context.escapeRoomId && !enemyAlive) {
    choices.push({ label: context.escapeChoiceText, action: { type: 'escape' } });
  }
  if (enemyAlive) {
    const sneakDest = adjacent[0];
    choices.push({ label: `Attack the ${enemy.name}`, action: { type: 'attack' } });
    choices.push({ label: `Try to sneak past the ${enemy.name}${sneakDest ? ` → ${sneakDest.name}` : ''}`, action: { type: 'sneak' } });
  }
  if (lootAvail) {
    choices.push({ label: `Pick up the ${loot.name}`, action: { type: 'loot' } });
  }
  if (healItem && (!MAX_CHOICES || choices.length < MAX_CHOICES)) {
    const injured = state.characters.filter(c => !c.dead && c.hp < c.max_hp);
    if (injured.length > 0) {
      if (state.characters.filter(c => !c.dead).length === 1) {
        // Solo party: simple label, no target needed
        choices.push({ label: `Use ${healItem.name}`, action: { type: 'use', itemId: healItem.id } });
      } else {
        // Multi-character: one choice per injured party member
        for (const member of injured) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const selfNote = member.id === char.id ? ' (self)' : '';
          choices.push({
            label:  `Use ${healItem.name} on ${member.name}${selfNote} (HP ${member.hp}/${member.max_hp})`,
            action: { type: 'use', itemId: healItem.id, targetCharId: member.id },
          });
        }
      }
    }
  }
  // Rest choices — only when no alive enemy in room and room allows it
  if (!state.combat_active && canRestInRoom(state, seed)) {
    const alreadyShortRested = (state.short_rested_rooms ?? []).includes(roomId);
    if (!alreadyShortRested && char.hit_dice_remaining > 0 && char.hp < char.max_hp) {
      choices.push({
        label:  `Short Rest — spend a hit die (d${char.hit_die ?? 8}), ${char.hit_dice_remaining} remaining`,
        action: { type: 'short_rest' },
      });
    }
    if (!(state.long_rested ?? false)) {
      choices.push({ label: 'Long Rest — full recovery (once per session)', action: { type: 'long_rest' } });
    }
  }
  // Interactive object choices — once per object, collapsed into a single Interact action
  const currentRoom = seed.rooms.find(r => r.id === roomId);
  if (currentRoom?.objects?.length && !enemyAlive) {
    for (const obj of currentRoom.objects) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const searchKey = `${roomId}:${obj.id}`;
      const alreadySearched = (state.objects_searched ?? []).includes(searchKey);
      if (!alreadySearched) {
        choices.push({ label: `Interact with ${obj.name}`, action: { type: 'interact_object', objectId: obj.id } });
      }
    }
  }

  // NPC choices
  const npc = seed.npcs?.[roomId];
  if (npc && !npcIsKilled(state, roomId) && !enemyAlive) {
    const attitude = getNpcAttitude(state, npc);
    if (attitude === 'hostile') {
      choices.push({ label: `Attack the ${npc.name}`, action: { type: 'attack_npc' } });
    } else {
      const dcNote = attitude === 'indifferent' ? ` (CHA check DC ${npc.persuasionDC ?? 12})` : '';
      choices.push({ label: `Talk to ${npc.name}${dcNote}`, action: { type: 'talk' } });
      if (npc.shop?.length && attitude === 'friendly') {
        for (const entry of npc.shop) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const item = context.lootTable.find(l => l.id === entry.itemId);
          if (item) {
            choices.push({
              label:  `Buy ${item.name} — ${entry.price}cr`,
              action: { type: 'buy', itemId: entry.itemId, price: entry.price },
            });
          }
        }
      }
      // Always show attack option for non-hostile NPCs (makes them hostile)
      choices.push({ label: `Attack ${npc.name} (makes hostile)`, action: { type: 'attack_npc' } });
    }
  }
  // ── Combat action economy choices ─────────────────────────────────────────
  if (state.combat_active && !char.turn_actions.action_used) {
    // Dash
    choices.push({ label: `Dash — double movement this turn (${(char.speed ?? 30)} extra ft)`, action: { type: 'dash' } });
    // Help — only when party has multiple members and an ally is alive
    const aliveAllies = state.characters.filter(c => !c.dead && c.id !== char.id);
    for (const ally of aliveAllies) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      choices.push({ label: `Help ${ally.name} — give advantage on their next attack`, action: { type: 'help', targetId: ally.id } });
    }
    // Ready
    if (enemyAlive) {
      choices.push({ label: `Ready an action — set trigger and action to store`, action: { type: 'ready', trigger: 'enemy attacks', action: { type: 'attack' } } });
    }
  }

  // Use Reaction (trigger readied action) — shown when readied_action is set and reaction not yet used
  if (state.combat_active && !char.turn_actions.reaction_used && char.turn_actions.readied_action) {
    choices.push({ label: `Trigger readied action: "${char.turn_actions.readied_action.trigger}"`, action: { type: 'use_reaction' } });
  }

  // ── Subclass selection ─────────────────────────────────────────────────────
  if (!char.subclass) {
    const cls = char.character_class.toLowerCase();
    const subclassLevels: Record<string, number> = { fighter: 3, rogue: 3, wizard: 2, cleric: 1, ranger: 3, paladin: 3, bard: 3, druid: 2, sorcerer: 1, warlock: 1, monk: 3, barbarian: 3 };
    const subclassChoices: Record<string, string[]> = {
      fighter:   ['champion', 'battle_master'],
      rogue:     ['thief', 'assassin'],
      wizard:    ['evoker', 'abjurer'],
      cleric:    ['life', 'war'],
      ranger:    ['hunter', 'beastmaster'],
      paladin:   ['devotion', 'vengeance'],
      bard:      ['lore', 'valor'],
    };
    const reqLevel = subclassLevels[cls] ?? 3;
    if (char.level >= reqLevel && subclassChoices[cls]) {
      for (const sc of subclassChoices[cls]) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({ label: `Choose subclass: ${sc.replace(/_/g, ' ')}`, action: { type: 'select_subclass', subclass: sc } });
      }
    }
  }

  // ── Prepare spells (out of combat, prep-class only) ────────────────────────
  if (!state.combat_active) {
    const prepClasses = ['cleric', 'paladin', 'druid'];
    if (prepClasses.includes(char.character_class.toLowerCase()) && (char.spells_known ?? []).length > 0) {
      choices.push({ label: `Prepare spells — choose spells for today (${char.level + Math.max(0, Math.floor(((char.wis ?? 10) - 10) / 2))} max)`, action: { type: 'prepare_spells', spellIds: char.spells_known ?? [] } });
    }
  }

  // Class feature bonus actions — shown only during combat while bonus action is still available
  if (state.combat_active && !char.turn_actions.bonus_action_used) {
    const features = context.classFeatures?.[char.character_class] ?? [];
    if (features.includes('rage') && !char.conditions.includes('raging')) {
      const rageUses = char.class_resource_uses?.rage_uses ?? rageUsesMax(char.level);
      if (rageUses > 0) {
        choices.push({
          label:              `Rage — bonus action (${rageUses} use${rageUses === 1 ? '' : 's'} left)`,
          action:             { type: 'use_class_feature', featureId: 'rage' },
          requiresBonusAction: true,
        });
      }
    }

    // Fighter: Second Wind (bonus action)
    if (char.character_class.toLowerCase() === 'fighter' && !(char.class_resource_uses?.second_wind)) {
      choices.push({ label: `Second Wind — bonus action: heal 1d10+${char.level} HP`, action: { type: 'use_class_feature', featureId: 'second_wind' }, requiresBonusAction: true });
    }

    // Rogue L2+: Cunning Action (bonus action options)
    if (char.character_class.toLowerCase() === 'rogue' && char.level >= 2) {
      choices.push({ label: 'Cunning Action: Dash — extra movement as bonus action', action: { type: 'use_class_feature', featureId: 'cunning_action_dash' }, requiresBonusAction: true });
      choices.push({ label: 'Cunning Action: Disengage — no OA this turn as bonus action', action: { type: 'use_class_feature', featureId: 'cunning_action_disengage' }, requiresBonusAction: true });
      choices.push({ label: 'Cunning Action: Hide — stealth check as bonus action', action: { type: 'use_class_feature', featureId: 'cunning_action_hide' }, requiresBonusAction: true });
    }

    // Bard: Bardic Inspiration (bonus action)
    if (char.character_class.toLowerCase() === 'bard') {
      const biUses = char.class_resource_uses?.bardic_inspiration ?? Math.max(1, Math.floor(((char.cha ?? 10) - 10) / 2));
      const inspDie = char.level >= 15 ? 'd12' : char.level >= 10 ? 'd10' : char.level >= 5 ? 'd8' : 'd6';
      if (biUses > 0) {
        choices.push({ label: `Bardic Inspiration — give ally a ${inspDie} die (${biUses} left)`, action: { type: 'use_class_feature', featureId: 'bardic_inspiration' }, requiresBonusAction: true });
      }
    }
  }

  // Fighter: Action Surge — shown in combat when not yet used
  if (state.combat_active && char.character_class.toLowerCase() === 'fighter' && char.level >= 2 && !(char.class_resource_uses?.action_surge)) {
    choices.push({ label: `Action Surge — gain one extra action this turn`, action: { type: 'use_class_feature', featureId: 'action_surge' } });
  }

  // Spell choices
  if (context.spellTable && (char.spells_known ?? []).length > 0) {
    const slots     = char.spell_slots_max  ?? {};
    const slotsUsed = char.spell_slots_used ?? {};
    for (const spellId of char.spells_known) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const spell = context.spellTable[spellId];
      if (!spell) continue;

      const isBonusAction = spell.castTime === 'bonus_action';
      const actionBlocked = !isBonusAction && char.turn_actions.action_used;
      const bonusBlocked  = isBonusAction  && char.turn_actions.bonus_action_used;
      if (actionBlocked || bonusBlocked) continue;

      // Restrict offensive/condition spells to when an enemy is alive; heal spells when injured
      const isOffensive = !!(spell.damage || spell.condition);
      const isHeal      = !!spell.heal;
      if (isOffensive && !enemyAlive) continue;
      if (isHeal) {
        const injured = state.characters.filter(c => !c.dead && c.hp < c.max_hp);
        if (injured.length === 0) continue;
      }

      if (spell.level === 0) {
        // Cantrip: no slot needed
        const slotNote = isBonusAction ? ', bonus action' : '';
        choices.push({
          label:               `Cast ${spell.name} (cantrip${slotNote})`,
          action:              { type: 'cast_spell', spellId, slotLevel: 0 },
          requiresBonusAction: isBonusAction || undefined,
        });
      } else {
        // Leveled spell: need a slot at or above spell level
        const available = (slots[spell.level] ?? 0) - (slotsUsed[spell.level] ?? 0);
        if (available <= 0) continue;
        const slotNote = isBonusAction ? ', bonus action' : '';
        choices.push({
          label:               `Cast ${spell.name} (Lvl ${spell.level}${slotNote} — ${available} slot${available === 1 ? '' : 's'} left)`,
          action:              { type: 'cast_spell', spellId, slotLevel: spell.level },
          requiresBonusAction: isBonusAction || undefined,
        });
      }
    }
  }

  // Two-weapon fighting bonus action: both weapons must be light
  if (state.combat_active && char.turn_actions.action_used && !char.turn_actions.bonus_action_used) {
    const equippedWpnItem = char.equipped_weapon
      ? context.lootTable.find(l => l.id === (char.inventory.find(i => i.instance_id === char.equipped_weapon)?.id))
      : null;
    if (equippedWpnItem?.light) {
      const offhandItem = char.inventory
        .filter(i => i.instance_id !== char.equipped_weapon)
        .map(i => context.lootTable.find(l => l.id === i.id))
        .find(l => l?.light && l.slot === 'weapon');
      if (offhandItem) {
        choices.push({ label: `Two-weapon attack — off-hand ${offhandItem.name} (no ability mod to damage)`, action: { type: 'two_weapon_attack' }, requiresBonusAction: true });
      }
    }
  }

  // Grapple/Shove choices — in the enemyAlive block, alongside attack
  if (enemyAlive && !char.turn_actions.action_used) {
    choices.push({ label: `Grapple the ${enemy.name} — STR vs STR/DEX contest`, action: { type: 'grapple' } });
    choices.push({ label: `Shove the ${enemy.name} — STR vs STR/DEX contest (knocks prone)`, action: { type: 'shove' } });
  }

  // Dodge / Disengage — available in combat when action not yet used
  if (state.combat_active && !char.turn_actions.action_used) {
    choices.push({ label: 'Dodge — attacks against you have disadvantage until your next turn', action: { type: 'dodge' } });
    choices.push({ label: 'Disengage — move without triggering opportunity attacks', action: { type: 'disengage' } });
  }

  // Attune choices — out of combat, for unnattuned items that require attunement
  if (!state.combat_active) {
    const attuned = char.attuned_items ?? [];
    if (attuned.length < 3) {
      for (const invItem of char.inventory) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const lootItem = context.lootTable.find(l => l.id === invItem.id);
        if (lootItem?.requiresAttunement && !attuned.includes(invItem.instance_id)) {
          choices.push({ label: `Attune to ${invItem.name}`, action: { type: 'attune', instanceId: invItem.instance_id } });
        }
      }
    }
  }

  // End turn: available in combat after the character's action is used
  // (auto-advance fires when no bonus choices exist, but this allows explicit forfeiture)
  if (state.combat_active && char.turn_actions.action_used) {
    choices.push({ label: 'End turn', action: { type: 'end_turn' } });
  }
  const isImmobilized = char.conditions.some(c => ['grappled', 'restrained'].includes(c));

  // Grid movement choices — shown in combat when entities are tracked on the grid
  if (state.entities && state.combat_active && !isImmobilized) {
    const charEntity = state.entities.find(e => e.id === char.id);
    if (charEntity) {
      const speedFt    = char.speed ?? 30;
      const usedFt     = (state.movement_used ?? {})[char.id] ?? 0;
      const remaining  = speedFt - usedFt;
      const gw         = context.gridWidth  ?? 10;
      const gh         = context.gridHeight ?? 10;
      const occupied   = new Set(state.entities.filter(e => e.id !== char.id).map(e => `${e.pos.x},${e.pos.y}`));
      const DIRS: Array<{ label: string; dx: number; dy: number }> = [
        { label: 'N',  dx:  0, dy: -1 },
        { label: 'NE', dx:  1, dy: -1 },
        { label: 'E',  dx:  1, dy:  0 },
        { label: 'SE', dx:  1, dy:  1 },
        { label: 'S',  dx:  0, dy:  1 },
        { label: 'SW', dx: -1, dy:  1 },
        { label: 'W',  dx: -1, dy:  0 },
        { label: 'NW', dx: -1, dy: -1 },
      ];
      if (remaining > 0) {
        for (const dir of DIRS) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const nx = charEntity.pos.x + dir.dx;
          const ny = charEntity.pos.y + dir.dy;
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
          if (occupied.has(`${nx},${ny}`)) continue;
          choices.push({
            label:  `Move ${dir.label} → (${nx},${ny}) [${remaining - 5}ft left]`,
            action: { type: 'grid_move', entityId: char.id, to: { x: nx, y: ny } },
          });
        }
      }
    }
  } else if (!state.entities) {
    if (!isImmobilized) {
      for (const adj of adjacent) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const label = enemyAlive ? `Dash past the ${enemy.name} → ${adj.name}` : `Move to ${adj.name}`;
        choices.push({ label, action: { type: 'move', roomId: adj.id } });
      }
    } else {
      const blocker = char.conditions.find(c => ['grappled', 'restrained'].includes(c))!;
      choices.push({ label: `${blocker.toUpperCase()} — cannot move`, action: { type: 'pass' } });
    }
  }

  // Room exits are always available when not in active combat (grid or not)
  if (!state.combat_active && !isImmobilized && state.entities) {
    for (const adj of adjacent) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      choices.push({ label: `Move to ${adj.name}`, action: { type: 'move', roomId: adj.id } });
    }
  }
  return MAX_CHOICES ? choices.slice(0, MAX_CHOICES) : choices;
}

// ─── Script engine: rule evaluation ──────────────────────────────────────────

export async function runRules(
  state:       GameState,
  context:     Context,
  action:      StructuredAction,
  prevRoomId:  string,
  seed:        Seed,
): Promise<{ state: GameState; extraNarrative: string }> {
  const rules = context.rules;
  if (!rules?.length) return { state, extraNarrative: '' };

  const activeChar = state.characters.find(c => c.id === state.active_character_id) ?? state.characters[0];
  if (!activeChar) return { state, extraNarrative: '' };

  // Filter out once-rules that have already fired
  const eligibleRules = rules.filter(r =>
    !r.once || !state.flags[`rule_fired_${r.name}`]
  );
  if (!eligibleRules.length) return { state, extraNarrative: '' };

  // Flags are spread as top-level facts so rules can reference them directly
  // (e.g. { fact: 'boss_defeated', operator: 'equal', value: true }).
  // Named facts below take precedence over any same-named flag.
  const facts: Record<string, unknown> = {
    ...state.flags,
    action:            action.type,
    room_id:           state.current_room,
    prev_room_id:      prevRoomId,
    visited_rooms:     state.visited_rooms,
    enemies_killed:    state.enemies_killed,
    loot_taken:        state.loot_taken,
    combat_active:     state.combat_active,
    flags:             state.flags,
    active_hp:         activeChar.hp,
    active_max_hp:     activeChar.max_hp,
    active_level:      activeChar.level,
    active_class:      activeChar.character_class,
    active_conditions: activeChar.conditions,
  };

  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const rule of eligibleRules) {
    engine.addRule({
      name:       rule.name,
      priority:   rule.priority ?? 1,
      conditions: rule.conditions as Parameters<typeof engine.addRule>[0]['conditions'],
      event:      { type: rule.name },
    });
  }

  const { events } = await engine.run(facts as Parameters<typeof engine.run>[0]);
  const firedNames = new Set(events.map(e => e.type));

  if (!firedNames.size) return { state, extraNarrative: '' };

  // Apply consequences for each fired rule in declaration order
  let st = state;
  const narrativeParts: string[] = [];

  for (const rule of eligibleRules) {
    if (!firedNames.has(rule.name)) continue;

    for (const c of rule.consequences) {
      st = applyConsequence(c, st, seed, activeChar.id, narrativeParts);
    }

    if (rule.once) {
      st = { ...st, flags: { ...st.flags, [`rule_fired_${rule.name}`]: true } };
    }
  }

  return { state: st, extraNarrative: narrativeParts.join(' ') };
}

function applyConsequence(
  c:           GameConsequence,
  st:          GameState,
  seed:        Seed,
  activeCharId: string,
  narrativeParts: string[],
): GameState {
  switch (c.type) {
    case 'add_narrative':
      narrativeParts.push(c.text);
      return st;

    case 'set_flag':
      return { ...st, flags: { ...st.flags, [c.key]: c.value } };

    case 'give_item': {
      const targetId   = c.characterId ?? activeCharId;
      const lootEntry  = seed.loot?.[c.itemId] ?? null;
      if (!lootEntry) return st;
      const newItem    = { ...lootEntry, instance_id: randomUUID() };
      const characters = st.characters.map(ch =>
        ch.id === targetId
          ? { ...ch, inventory: [...ch.inventory, newItem] }
          : ch
      );
      return { ...st, characters };
    }

    case 'modify_hp': {
      const targetId   = c.characterId ?? activeCharId;
      const characters = st.characters.map(ch => {
        if (ch.id !== targetId) return ch;
        const newHp = Math.max(0, Math.min(ch.max_hp, ch.hp + c.amount));
        return { ...ch, hp: newHp };
      });
      return { ...st, characters };
    }

    case 'unlock_room': {
      // Mark the room as already visited so it appears on the map without being locked
      if (st.visited_rooms.includes(c.roomId)) return st;
      return { ...st, visited_rooms: [...st.visited_rooms, c.roomId] };
    }

    case 'spawn_enemy': {
      // Only spawn if room has no living enemy already
      const alreadyKilled = st.enemies_killed.includes(c.roomId);
      const alreadyPresent = seed.enemies?.[c.roomId];
      if (alreadyKilled || alreadyPresent) return st;
      // Spawning modifies the seed-side data; we record it in enemy_hp instead
      // so the engine recognises a live enemy in that room next evaluation.
      const template = seed.enemies?.[c.enemyId];
      if (!template) return st;
      return { ...st, enemy_hp: { ...st.enemy_hp, [c.roomId]: template.hp } };
    }

    case 'set_escape':
      // Handled by takeAction's escaped flag; we signal via a flag that
      // the route can check after runRules returns.
      return { ...st, flags: { ...st.flags, _rule_escape: true } };

    default:
      return st;
  }
}

// ─── Main action handler ──────────────────────────────────────────────────────

export async function takeAction({ action, history = [], state, seed: seedArg, context }: {
  action:  StructuredAction;
  history: unknown[];
  state:   GameState;
  seed:    Seed;
  context: Context;
}) {
  void history;

  const prevRoomId = state.current_room;
  // Allow mutation in travel case (rebinding local variable only)
  let seed = seedArg;

  // Resolve and clone the active character
  const charIdx = state.characters.findIndex(c => c.id === state.active_character_id);
  const safeIdx = charIdx >= 0 ? charIdx : 0;
  let char: Character = { ...state.characters[safeIdx] };

  // Clone world state
  let st: GameState = {
    ...state,
    enemies_killed:     state.enemies_killed     || [],
    loot_taken:         state.loot_taken         || [],
    enemy_hp:           state.enemy_hp           || {},
    combat_active:      state.combat_active      ?? false,
    initiative_order:   state.initiative_order   ?? [],
    initiative_idx:     state.initiative_idx     ?? 0,
    room_log:           state.room_log           ?? [],
    short_rested_rooms: state.short_rested_rooms ?? [],
    long_rested:        state.long_rested        ?? false,
    npc_attitudes:      state.npc_attitudes      ?? {},
    npc_talked:         state.npc_talked         ?? [],
    objects_searched:   state.objects_searched   ?? [],
    flags:              state.flags              ?? {},
    enemy_conditions:   state.enemy_conditions   ?? [],
  };

  // Ensure character fields have safe defaults
  char = {
    ...char,
    conditions:          char.conditions          ?? [],
    condition_durations: char.condition_durations ?? {},
    death_saves:         char.death_saves         ?? { successes: 0, failures: 0 },
    stable:              char.stable              ?? false,
    dead:                char.dead                ?? false,
    turn_actions:        char.turn_actions        ?? { ...FRESH_TURN },
    inventory:           char.inventory           ?? [],
    hit_die:             char.hit_die             ?? 8,
    hit_dice_remaining:  char.hit_dice_remaining  ?? (char.level ?? 1),
    class_resource_uses: char.class_resource_uses ?? {},
    asi_pending:         char.asi_pending         ?? false,
    exhaustion_level:    char.exhaustion_level    ?? 0,
    spell_slots_max:      char.spell_slots_max      ?? {},
    spell_slots_used:     char.spell_slots_used     ?? {},
    spells_known:         char.spells_known         ?? [],
    background_id:        char.background_id        ?? null,
    skill_proficiencies:  char.skill_proficiencies  ?? [],
    tool_proficiencies:   char.tool_proficiencies   ?? [],
    armor_proficiencies:  char.armor_proficiencies  ?? [],
    weapon_proficiencies: char.weapon_proficiencies ?? [],
    attuned_items:        char.attuned_items        ?? [],
  };

  const worldName  = getWorldName(seed);
  const roomId     = st.current_room;
  const enemy      = seed.enemies?.[roomId];
  const loot       = seed.loot?.[roomId];
  const enemyAlive = enemy && !st.enemies_killed.includes(roomId);
  const lootAvail  = loot  && !st.loot_taken.includes(roomId);
  const adjacent   = (seed.connections[roomId] || [])
    .map(id => seed.rooms.find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  let narrative = '';
  let escaped   = false;
  // Track whether initiative was used this action (determines active_character advancement)
  let usedInitiative = false;

  // ── Undetected trap fires on first action in room ─────────────────────────
  // (Detected traps offer a 'disarm_trap' choice instead; this handles the case
  //  where no character's passive Perception beat the trap DC.)
  if (action.type !== 'disarm_trap' && action.type !== 'move') {
    const hiddenTrap = getRoomTrap(roomId, seed, context);
    if (hiddenTrap && !trapSpent(st, roomId) && !partyDetectsTrap(st.characters, hiddenTrap)) {
      st.traps_triggered = [...(st.traps_triggered ?? []), roomId];
      const trapDmg = rollDice(hiddenTrap.damage);
      char.hp = Math.max(0, char.hp - trapDmg);
      narrative += hiddenTrap.triggerNarrative.replace(/{name}/g, char.name).replace(/{dmg}/g, String(trapDmg)) + ' ';
      if (hiddenTrap.condition && char.hp > 0) {
        char.conditions = [...new Set([...char.conditions, hiddenTrap.condition])];
        if (hiddenTrap.conditionDuration) char.condition_durations = { ...char.condition_durations, [hiddenTrap.condition]: hiddenTrap.conditionDuration };
      }
      commitChar();
    }
  }

  // Helper: write char back to st, and sync HP into grid entity if present
  function commitChar() {
    const updatedChars = st.characters.map((c, i) => i === safeIdx ? char : c);
    let updatedEntities = st.entities;
    if (updatedEntities) {
      updatedEntities = updatedEntities.map(e =>
        e.id === char.id && !e.isEnemy ? { ...e, hp: char.hp, conditions: char.conditions } : e,
      );
    }
    st = { ...st, characters: updatedChars, entities: updatedEntities };
  }

  // ── Death saves override all actions when HP = 0 ───────────────────────────
  if (char.hp <= 0 && !char.dead) {
    if (char.stable) {
      if (action.type === 'use') {
        const held = char.inventory?.find(i => i.id === action.itemId);
        if (held) {
          const itemData = getItemData(held, context);
          if (itemData.heal) {
            const healed   = rollDice(itemData.heal);
            const firstIdx = char.inventory.findIndex(i => i.id === held.id);
            char.hp        = Math.min(char.max_hp, 1 + healed);
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            char.stable    = false;
            narrative = `Barely conscious, you manage to use the ${held.name} — you recover ${healed} HP and pull yourself up (now ${char.hp}/${char.max_hp}).`;
          } else {
            narrative = `You are stable but unconscious. Only a healing item can restore you.`;
          }
        } else {
          narrative = `You are stable but unconscious. Only a healing item can restore you.`;
        }
      } else {
        narrative = `You are stable but unconscious. You need a healing item to regain consciousness.`;
      }
    } else {
      const { narrative: dsNarr, newChar, died, endedCombat } = processDeathSave(
        char, enemyAlive ? enemy : null, context, worldName
      );
      narrative = dsNarr;
      char      = newChar;
      if (endedCombat) st = endCombatState(st);
      if (died) {
        commitChar();
        const allDead = st.characters.every(c => c.dead);
        st.run_log = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
        return { narrative, choices: [], newState: st, escaped: false, dead: allDead };
      }
    }
    commitChar();
    // Advance to next living character round-robin (death save = passive, not a true turn)
    const living = st.characters.filter(c => !c.dead);
    if (living.length > 0) {
      const idx = living.findIndex(c => c.id === char.id);
      st.active_character_id = living[(idx + 1) % living.length].id;
    }
    st.run_log      = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
    st.last_choices = generateChoices(st, seed, context);
    return { narrative, choices: st.last_choices, newState: st, escaped: false, dead: false };
  }

  // Exhaustion level 6 = death (PHB p.291)
  if ((char.exhaustion_level ?? 0) >= 6 && !char.dead) {
    char.dead = true;
    narrative = `${char.name} succumbs to exhaustion (level 6) and dies.`;
    commitChar();
    st.run_log = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
    const allDeadExhaustion = st.characters.every(c => c.dead);
    st.last_choices = generateChoices(st, seed, context);
    return { narrative, choices: st.last_choices, newState: st, escaped: false, dead: allDeadExhaustion };
  }

  switch (action.type) {

    case 'move': {
      const target = seed.rooms.find(r => r.id === action.roomId);
      if (!target || !adjacent.find(r => r.id === target.id)) {
        narrative = 'The path loops back on itself. You cannot get there from here.';
        break;
      }
      // Grappled / restrained: speed reduced to 0 — cannot move
      const immobilizer = char.conditions.find(c => ['grappled', 'restrained'].includes(c));
      if (immobilizer) {
        narrative = `You are ${immobilizer} and cannot move.`;
        break;
      }
      // Opportunity attack when leaving a room with a living enemy (5e PHB p.195)
      if (enemyAlive && !(char.turn_actions?.disengaged ?? false)) {
        const opp = applyEnemyAttackNarrative(enemy, char, context);
        char.hp                  = Math.max(0, char.hp - opp.hpLost);
        char.conditions          = opp.newConditions;
        char.condition_durations = opp.newDurations;
        const concOpp = checkConcentration(char, st, opp.hpLost);
        char = concOpp.char; st = concOpp.st;
        narrative = opp.hpLost > 0
          ? `You try to flee — the ${enemy.name} strikes as you go! ${opp.narrative}${concOpp.note} `
          : `You dodge past the ${enemy.name} in a desperate sprint! `;
        if (char.hp <= 0) {
          const { narrative: dsNarr, newChar, died, endedCombat } = processDeathSave(
            { ...char, death_saves: { successes: 0, failures: 0 } }, enemy, context, worldName
          );
          char = newChar;
          if (endedCombat) st = endCombatState(st);
          narrative += dsNarr;
          if (died) break;
        }
      }
      if (st.combat_active) {
        st = endCombatState(st);
        char.conditions = [];
      }
      st.enemy_conditions = [];
      st.current_room = target.id;
      if (!st.visited_rooms.includes(target.id)) {
        st.visited_rooms = [...st.visited_rooms, target.id];
      }
      narrative += buildArrivalNarrative(target.id, { ...st, characters: st.characters.map((c, i) => i === safeIdx ? char : c) }, seed, context);
      break;
    }

    case 'attack': {
      if (!enemy)      { narrative = pick(context.narratives.noEnemy);     break; }
      if (!enemyAlive) { narrative = pick(context.narratives.alreadyDead); break; }

      // Grid range check — only applies when combat entities are tracked on the grid
      if (st.entities) {
        const charEntity  = st.entities.find(e => e.id === char.id);
        const enemyEntity = st.entities.find(e => e.id === roomId && e.isEnemy);
        if (charEntity && enemyEntity) {
          const equippedWeaponItem = char.equipped_weapon
            ? getItemData(char.inventory?.find(i => i.instance_id === char.equipped_weapon) as InventoryItem, context)
            : null;
          if (!inRange(charEntity.pos, enemyEntity.pos, equippedWeaponItem)) {
            narrative = `Out of range. Move closer before attacking.`;
            break;
          }
        }
      }

      // Charmed: cannot attack the charmer
      if (char.conditions.includes('charmed') && char.charmer_id && char.charmer_id === roomId) {
        narrative = `You are charmed by the ${enemy.name} and cannot bring yourself to attack them.`;
        break;
      }

      // Incapacitation is handled upstream in generateChoices (pass action); guard here as a safety net
      if (char.conditions.includes('paralyzed') || char.conditions.includes('stunned')) {
        narrative = `You cannot act while ${char.conditions.find(c => c === 'stunned' || c === 'paralyzed')}.`;
        usedInitiative = true;
        break;
      }

      const currentEnemyHp = getEnemyHp(st, roomId, seed);
      const weaponItem     = char.equipped_weapon
        ? getItemData(char.inventory?.find(i => i.instance_id === char.equipped_weapon) as InventoryItem, context)
        : null;
      let weaponDamage = weaponItem?.damage ?? null;
      // Versatile: use two-handed damage when no shield is equipped
      const isVersatile = !!(weaponItem?.versatileDamage && !char.equipped_shield);
      if (isVersatile) {
        weaponDamage = weaponItem!.versatileDamage!;
      }
      const weaponLabel  = weaponItem ? `Your ${weaponItem.name}` : 'Your fists';

      // ── Start combat on first attack — roll initiative for all ─────────────
      if (!st.combat_active) {
        const order = buildInitiativeOrder(st.characters, enemy, roomId);
        st.combat_active = true;

        // Assign initiative_roll to each character in the order
        const updatedCharsForInit = st.characters.map(c => {
          const entry = order.find(e => e.id === c.id);
          return entry ? { ...c, initiative_roll: entry.roll } : c;
        });
        st = { ...st, characters: updatedCharsForInit, initiative_order: order };

        // Refresh char from updated characters array
        const freshChar = updatedCharsForInit.find(c => c.id === char.id);
        if (freshChar) char = { ...freshChar };
        char.turn_actions = { ...FRESH_TURN };

        // ── Initialize grid entities if this context uses a grid ────────────
        if (context.gridEnabled && !st.entities) {
          const gw = context.gridWidth  ?? 8;
          const gh = context.gridHeight ?? 8;
          const pcEntities: CombatEntity[] = st.characters.map((c, ci) => ({
            id:                  c.id,
            isEnemy:             false,
            pos:                 { x: 1 + ci, y: 1 },
            hp:                  c.hp,
            maxHp:               c.max_hp,
            conditions:          c.conditions,
            condition_durations: c.condition_durations,
          }));
          const enemyEntity: CombatEntity = {
            id:                  roomId,
            isEnemy:             true,
            pos:                 { x: gw - 2, y: gh - 2 },
            hp:                  enemy.hp,
            maxHp:               enemy.hp,
            conditions:          [],
            condition_durations: {},
          };
          st = { ...st, entities: [...pcEntities, enemyEntity], movement_used: {} };
        }

        const orderText = order
          .map(e => {
            const name = e.is_enemy ? enemy.name : (st.characters.find(c => c.id === e.id)?.name ?? 'Hero');
            return `${name}(${e.roll})`;
          })
          .join(' → ');
        const combatPrefix = context.narratives.combatStart
          ? pick(context.narratives.combatStart).replace(/{enemy}/g, enemy.name) + ' '
          : 'Combat begins! ';
        narrative = `${combatPrefix}Initiative: ${orderText}. `;

        // Find this character's position in the initiative order
        const myInitIdx = order.findIndex(e => e.id === char.id);
        st.initiative_idx = myInitIdx >= 0 ? myInitIdx : 0;

        // If enemy wins initiative (enemy appears before this character in the order),
        // auto-resolve the enemy's pre-emptive attack before the player acts
        const enemyEntry = order.find(e => e.is_enemy);
        const enemyInitIdx = order.indexOf(enemyEntry!);
        if (enemyEntry && enemyInitIdx < (myInitIdx >= 0 ? myInitIdx : 0)) {
          const preStrike = applyEnemyAttackNarrative(enemy, char, context);
          char.hp                  = Math.max(0, char.hp - preStrike.hpLost);
          char.conditions          = preStrike.newConditions;
          char.condition_durations = preStrike.newDurations;
          const concPre = checkConcentration(char, st, preStrike.hpLost);
          char = concPre.char; st = concPre.st;
          narrative += `The ${enemy.name} strikes first (${enemyEntry.roll})! ${preStrike.narrative}${concPre.note} `;
          if (char.hp <= 0) {
            const { narrative: dsNarr, newChar, died, endedCombat } = processDeathSave(
              { ...char, death_saves: { successes: 0, failures: 0 } }, enemy, context, worldName
            );
            char = newChar;
            if (endedCombat) st = endCombatState(st);
            narrative += dsNarr;
            if (died) {
              usedInitiative = true;
              break;
            }
          }
          narrative += `Now ${char.name} attacks — `;
        } else {
          const myRoll = order.find(e => e.id === char.id)?.roll ?? 0;
          narrative += `${char.name} has initiative (${myRoll})! `;
        }
      }

      // ── Resolve the player's attack ────────────────────────────────────────
      // Armor proficiency check (PHB p.144): non-proficient armor → disadv on STR/DEX attack rolls
      const equippedArmorLootItem = char.equipped_armor
        ? context.lootTable.find(l => l.id === (char.inventory?.find(i => i.instance_id === char.equipped_armor)?.id))
        : null;
      const armorProficient   = hasArmorProficiency(char.armor_proficiencies ?? [], equippedArmorLootItem?.armorCategory);
      // Weapon proficiency check (PHB p.147): non-proficient weapon → no profBonus (passed to resolvePlayerAttack)
      const weaponProficient  = hasWeaponProficiency(char.weapon_proficiencies ?? [], weaponItem?.weaponType);

      const rangedInMelee    = (weaponItem?.range === 'ranged');
      const conditionDisadv  = char.conditions.some(c => DISADV_CONDITIONS.has(c));
      const exhaustionDisadv = (char.exhaustion_level ?? 0) >= 3; // exhaustion 3+: disadv on attack rolls
      const conditionAdv     = char.conditions.some(c => PLAYER_ADV_CONDITIONS.has(c));
      const enemyGrappled   = (st.enemy_conditions ?? []).includes('grappled');
      const enemyProne      = (st.enemy_conditions ?? []).includes('prone');
      const enemyParalyzed  = (st.enemy_conditions ?? []).includes('paralyzed');
      // Unconscious: auto-crit when attacker is within 5ft
      const enemyUnconscious = (st.enemy_conditions ?? []).includes('unconscious');
      // Prone: melee attacks have advantage, ranged attacks have disadvantage
      const proneAdv        = enemyProne && weaponItem?.range !== 'ranged';
      const proneDisadv     = enemyProne && weaponItem?.range === 'ranged';

      // Cover bonus: raise enemy's effective AC from obstacles between attacker and target
      let coverAcBonus = 0;
      let flankingAdv  = false;
      if (st.entities) {
        const charEntity  = st.entities.find(e => e.id === char.id);
        const enemyEntity = st.entities.find(e => e.id === roomId && e.isEnemy);
        if (charEntity && enemyEntity) {
          const obstacles = st.entities
            .filter(e => e.id !== char.id && e.id !== roomId)
            .map(e => e.pos);
          coverAcBonus = coverBonus(charEntity.pos, enemyEntity.pos, obstacles);
          // Flanking (PHB optional): ally on opposite side of enemy grants advantage
          const flankingAlly = st.entities.find(e =>
            !e.isEnemy && e.id !== char.id && isFlankingPosition(charEntity.pos, e.pos, enemyEntity.pos),
          );
          if (flankingAlly) flankingAdv = true;
        }
      }

      // Help action advantage: another character used Help targeting this one
      const helpAdv = st.help_target_id === char.id;
      if (helpAdv) st = { ...st, help_target_id: undefined };

      const disadvantage     = rangedInMelee || conditionDisadv || exhaustionDisadv || !armorProficient || proneDisadv;
      const advantage        = conditionAdv || enemyGrappled || proneAdv || enemyParalyzed || flankingAdv || helpAdv;
      const disadvReasons    = [
        rangedInMelee    ? 'ranged in melee' : '',
        conditionDisadv  ? char.conditions.filter(c => DISADV_CONDITIONS.has(c)).join(', ') : '',
        exhaustionDisadv ? 'exhaustion' : '',
        !armorProficient ? `not proficient with ${equippedArmorLootItem?.name ?? 'armor'}` : '',
        proneDisadv      ? 'prone (ranged)' : '',
      ].filter(Boolean).join(', ');
      const disadvNote = disadvReasons ? ` (disadvantage — ${disadvReasons})` : (advantage && !disadvantage) ? ' (advantage)' : '';
      const noProfNote = !weaponProficient ? ` [no weapon proficiency — prof bonus omitted]` : '';

      const features  = context.classFeatures?.[char.character_class] ?? [];
      const isRaging  = char.conditions.includes('raging');

      // Helper that resolves one attack roll and applies it to enemy HP / narrative.
      // Returns true if the enemy was killed (so the caller can break early).
      const resolveOneAttack = (label: string): boolean => {
        const effectiveEnemyAc = enemy.ac + coverAcBonus;
        const atk = resolvePlayerAttack(
          { str: char.str, dex: char.dex, level: char.level },
          weaponDamage,
          effectiveEnemyAc,
          weaponItem?.finesse ?? false,
          disadvantage,
          advantage,
          weaponProficient,
          weaponItem?.range === 'ranged',
        );
        // Unconscious enemy within melee range: auto-crit
        const autoCritCheck = enemyUnconscious && (!st.entities || (() => {
          const charEnt = st.entities?.find(e => e.id === char.id);
          const enmEnt  = st.entities?.find(e => e.id === roomId);
          return charEnt && enmEnt ? posEqual({ x: charEnt.pos.x, y: charEnt.pos.y }, { x: enmEnt.pos.x, y: enmEnt.pos.y }) || Math.max(Math.abs(charEnt.pos.x - enmEnt.pos.x), Math.abs(charEnt.pos.y - enmEnt.pos.y)) <= 1 : true;
        })());
        if (autoCritCheck && atk.hit && !atk.critical) {
          // Force critical on hit
        }
        const baseHit  = weaponDamage ? atk.damage : Math.max(1, unarmedDamage(char.str));
        const versatileNote = isVersatile ? ' (versatile)' : '';
        const coverNote = coverAcBonus > 0 ? ` +${coverAcBonus} cover` : '';
        const atkNote  = ` (${label}d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof = ${atk.total} vs AC ${effectiveEnemyAc}${coverNote}${disadvNote}${versatileNote})${noProfNote}`;

        if (atk.fumble) {
          narrative += `Natural 1 — a fumble! ${weaponLabel} goes completely wide.${atkNote} `;
          return false;
        }
        if (!atk.hit) {
          narrative += pickTiered(context.narratives.combatMiss, hpTier(char)).replace(/{enemy}/g, enemy.name);
          narrative += atkNote + ' ';
          return false;
        }

        // ── Hit ──────────────────────────────────────────────────────────────
        // Sneak Attack: once per turn, on hit, with advantage or an ally in combat
        let sneakDmg = 0;
        if (features.includes('sneak_attack')) {
          const hasAdv  = char.conditions.some(c => ADVANTAGE_CONDITIONS.has(c));
          const allies  = st.characters.filter(c => !c.dead && c.id !== char.id).length;
          if (hasAdv || allies > 0) {
            const saExpr = sneakAttackDice(char.level);
            sneakDmg     = atk.critical ? rollCritical(saExpr) : rollDice(saExpr);
          }
        }

        // Rage damage bonus: STR-based attacks only (PHB p.48)
        const rageBonus = (features.includes('rage') && isRaging && atk.atkStat === 'STR')
          ? rageDamageBonus(char.level) : 0;

        const rawDmg     = baseHit + sneakDmg + rageBonus;
        const { damage: finalDmg, note: dmgNote } = applyDamageMultiplier(rawDmg, weaponItem?.damageType, enemy);
        const curEnemyHp = getEnemyHp(st, roomId, seed);
        const newEnemyHp = curEnemyHp - finalDmg;

        narrative += buildCombatHitNarrative(enemy, weaponItem, finalDmg, atk.critical, char, context);
        narrative += atkNote;
        if (sneakDmg > 0) narrative += ` [Sneak Attack ${sneakAttackDice(char.level)}: +${sneakDmg}]`;
        if (rageBonus > 0) narrative += ` [Rage: +${rageBonus}]`;
        if (dmgNote) narrative += dmgNote;

        if (newEnemyHp <= 0) {
          const xpGain = enemy.xp ?? (10 + (enemy.hp || 8));
          char.xp           = (char.xp || 0) + xpGain;
          st.enemies_killed = [...st.enemies_killed, roomId];
          st.enemy_hp       = { ...st.enemy_hp, [roomId]: 0 };
          st.enemy_conditions = [];
          st = endCombatState(st);
          char.conditions   = char.conditions.filter(c => c !== 'raging');
          narrative += ' ' + pick(context.narratives.killShot)
            .replace('{enemy}', enemy.name)
            .replace('{xp}',    String(xpGain));
          if (char.xp >= char.level * 100) {
            char.level  += 1;
            char.max_hp += 4;
            char.hp      = Math.min(char.hp + 4, char.max_hp);
            char.spell_slots_max = getSpellSlotsForLevel(char.character_class, char.level, context);
            narrative += ' ' + pick(context.narratives.levelUp);
            if ([4, 8, 12, 16, 19].includes(char.level)) {
              char.asi_pending = true;
              narrative += ` Level ${char.level}: choose an Ability Score Improvement!`;
            }
          }
          usedInitiative = true;
          return true;
        }
        st.enemy_hp = { ...st.enemy_hp, [roomId]: newEnemyHp };
        narrative += ` The ${enemy.name} has ${newEnemyHp} HP remaining. `;
        return false;
      };

      // ── First attack ─────────────────────────────────────────────────────
      const killed = resolveOneAttack('');
      if (!killed) {
        // ── Extra Attack (Fighter/Warrior level 5+) ───────────────────────
        const extraCount = features.includes('extra_attack') ? extraAttackCount(char.character_class, char.level) : 0;
        for (let ei = 0; ei < extraCount; ei++) {
          if (getEnemyHp(st, roomId, seed) <= 0) break;
          const killedExtra = resolveOneAttack(`Attack ${ei + 2} — `);
          if (killedExtra) break;
        }
      }

      // Action consumed. Initiative advances unless a bonus-action choice is available
      // (checked after commitChar — see auto-advance block below the switch).
      char.turn_actions = { ...char.turn_actions, action_used: true };
      break;
    }

    case 'loot': {
      if (!loot)      { narrative = pick(context.narratives.noLoot);        break; }
      if (!lootAvail) { narrative = pick(context.narratives.alreadyLooted); break; }
      char.inventory  = [...(char.inventory || []), { ...loot, instance_id: randomUUID() }];
      st.loot_taken   = [...st.loot_taken, roomId];
      narrative = pick(context.narratives.lootPickedUp).replace(/{item}/g, loot.name);
      const hasIdentify = context.classSkills[char.character_class]?.some(s => ['arcana', 'investigation'].includes(s)) ?? false;
      if (loot.type === 'misc' && !hasIdentify) {
        narrative += ` [${loot.name}: unidentified]`;
      } else {
        narrative += ` [${loot.name}: ${loot.desc}]`;
        if (hasIdentify && loot.type === 'misc') {
          narrative += ' Your expertise lets you identify it immediately.';
        }
      }
      break;
    }

    case 'use': {
      const held = char.inventory?.find(i => i.id === action.itemId);
      if (!held) { narrative = "You search your pack — you don't have that."; break; }
      const itemData = getItemData(held, context);
      const firstIdx = char.inventory.findIndex(i => i.id === held.id);

      if (itemData.slot === 'weapon') {
        narrative = `The ${held.name} is ready. Use "attack" to strike, or "equip" to make it your active weapon.`;
      } else if (itemData.slot === 'armor') {
        narrative = `The ${held.name} offers protection. Use "equip" to don it for a +${itemData.ac_bonus || 0} AC bonus.`;
      } else if (itemData.type === 'consumable') {
        if (itemData.heal) {
          const hasMedicine = context.classSkills[char.character_class]?.includes('medicine') ?? false;
          const healBonus   = hasMedicine ? profBonus(char.level) : 0;
          const healed      = rollDice(itemData.heal) + healBonus;
          const bonusNote   = healBonus > 0 ? ` (+${healBonus} medicine)` : '';

          // Resolve heal target — may be a different party member
          const targetId    = 'targetCharId' in action ? action.targetCharId : undefined;
          const targetIdx   = targetId ? st.characters.findIndex(c => c.id === targetId) : safeIdx;
          const isSelf      = !targetId || targetIdx === safeIdx;

          if (!isSelf && targetIdx >= 0) {
            const target   = st.characters[targetIdx];
            const newHp    = Math.min(target.max_hp, target.hp + healed);
            st = { ...st, characters: st.characters.map((c, i) => i === targetIdx ? { ...c, hp: newHp } : c) };
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            narrative = `${char.name} uses the ${held.name} on ${target.name} — ${healed} HP restored${bonusNote} (now ${newHp}/${target.max_hp}).`;
          } else {
            char.hp        = Math.min(char.max_hp, char.hp + healed);
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            narrative = `You use the ${held.name} and recover ${healed} HP${bonusNote} (now ${char.hp}/${char.max_hp}).`;
          }
        } else if (itemData.effect === 'con_advantage') {
          char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
          const { roll1, roll2, best } = resolveSaveWithAdvantage(char.con);
          narrative = `You use the ${held.name}. CON save with advantage: rolled ${roll1} and ${roll2} — keeping the ${best}. You feel steadier.`;
        } else if (itemData.effect === 'mystery') {
          char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
          const { result, value } = resolveMysteryConsumable();
          if (result === 'heal') {
            char.hp = Math.min(char.max_hp, char.hp + value);
            narrative = `You use the ${held.name}. It tastes of regret and eucalyptus — but you feel better? +${value} HP.`;
          } else if (result === 'hurt') {
            char.hp = Math.max(1, char.hp - value);
            narrative = `You use the ${held.name}. Immediate. Searing. Regret. -${value} HP.`;
          } else {
            narrative = `You use the ${held.name}. Nothing happens. You stand there feeling foolish.`;
          }
        } else {
          narrative = `You use the ${held.name}. Something may have happened.`;
        }
      } else {
        narrative = itemData.useNarrative || `You examine the ${held.name}. Might come in handy.`;
      }
      // Using a consumable or activating an item is an action in combat
      if (st.combat_active) char.turn_actions = { ...char.turn_actions, action_used: true };
      break;
    }

    case 'death_save': {
      narrative = buildArrivalNarrative(roomId, st, seed, context);
      break;
    }

    case 'sneak': {
      if (!enemyAlive) { narrative = 'Nothing to sneak past. You move freely.'; break; }
      const sneakDC    = passivePerceptionDC(enemy.wis ?? 10);
      const proficient = context.classSkills[char.character_class]?.includes('stealth') ?? false;
      const exhaustionDisadv1 = (char.exhaustion_level ?? 0) >= 1;
      const check      = skillCheck(char.dex, sneakDC, proficient, char.level, exhaustionDisadv1);
      if (check.success) {
        narrative = pick(context.narratives.sneakSuccess).replace('{enemy}', enemy.name);
        narrative += ` (Stealth: ${check.roll}+${abilityMod(char.dex)}=${check.total} vs DC ${sneakDC})`;
        if (adjacent.length > 0) {
          const target = adjacent[0];
          if (st.combat_active) {
            st = endCombatState(st);
            char.conditions = [];
          }
          st.enemy_conditions = [];
          st.current_room = target.id;
          if (!st.visited_rooms.includes(target.id)) {
            st.visited_rooms = [...st.visited_rooms, target.id];
          }
          narrative += ' ' + buildArrivalNarrative(target.id, { ...st, characters: st.characters.map((c, i) => i === safeIdx ? char : c) }, seed, context);
        }
      } else {
        const counter = applyEnemyAttackNarrative(enemy, char, context);
        char.hp                  = Math.max(0, char.hp - counter.hpLost);
        char.conditions          = counter.newConditions;
        char.condition_durations = counter.newDurations;
        const concSnk = checkConcentration(char, st, counter.hpLost);
        char = concSnk.char; st = concSnk.st;
        narrative = pick(context.narratives.sneakFail)
          .replace('{enemy}', enemy.name)
          .replace('{dmg}',   String(counter.hpLost));
        narrative += concSnk.note;
        narrative += ` (Stealth: ${check.roll}+${abilityMod(char.dex)}=${check.total} vs DC ${sneakDC})`;
        if (char.hp <= 0) {
          const { narrative: dsNarr, newChar, died, endedCombat } = processDeathSave(
            { ...char, death_saves: { successes: 0, failures: 0 } }, enemy, context, worldName
          );
          char = newChar;
          if (endedCombat) st = endCombatState(st);
          narrative += ' ' + dsNarr;
        }
      }
      // Sneak always consumes the action and ends the combat turn
      char.turn_actions = { ...char.turn_actions, action_used: true };
      if (st.combat_active) usedInitiative = true;
      break;
    }

    case 'escape': {
      if (roomId !== context.escapeRoomId) { narrative = pick(context.narratives.noEscapeNearby); break; }
      if (enemyAlive) { narrative = `The ${enemy.name} ${pick(context.narratives.escapeBlocked)}`; break; }
      escaped  = true;
      narrative = pick(context.narratives.escapeLines).replace(/{world}/g, worldName);
      break;
    }

    case 'pass': {
      const cond = char.conditions.find(c => c === 'stunned' || c === 'paralyzed') ?? char.conditions[0];
      narrative = cond
        ? `${char.name} is ${cond} and cannot act. Turn passed.`
        : `${char.name} passes their turn.`;
      char.turn_actions = { ...char.turn_actions, action_used: true, bonus_action_used: true };
      usedInitiative = true;
      break;
    }

    case 'end_turn': {
      narrative = `${char.name} ends their turn.`;
      usedInitiative = true;
      break;
    }

    case 'short_rest': {
      if (st.combat_active)                                    { narrative = 'You cannot rest while in combat.'; break; }
      if (!canRestInRoom(st, seed))                            { narrative = 'You cannot rest here — an enemy is present.'; break; }
      if ((st.short_rested_rooms ?? []).includes(roomId))     { narrative = 'You have already rested in this room.'; break; }
      if ((char.hit_dice_remaining ?? 0) <= 0)                { narrative = 'You have no hit dice remaining.'; break; }
      if (char.hp >= char.max_hp)                             { narrative = 'You are already at full health.'; break; }

      const hdRoll    = rollDice(`1d${char.hit_die ?? 8}`) + abilityMod(char.con);
      const hdHealed  = Math.max(1, hdRoll);
      char.hp                 = Math.min(char.max_hp, char.hp + hdHealed);
      char.hit_dice_remaining = Math.max(0, (char.hit_dice_remaining ?? 1) - 1);
      st.short_rested_rooms   = [...(st.short_rested_rooms ?? []), roomId];

      // Short-rest class resource recharge
      const srUses = { ...(char.class_resource_uses ?? {}) };
      const cls = char.character_class.toLowerCase();
      // Fighter: Second Wind + Action Surge recover on short rest
      if (cls === 'fighter') {
        delete srUses.second_wind;
        delete srUses.action_surge;
      }
      // Bard L5+: Bardic Inspiration recharges on short rest; before L5 only on long rest
      if (cls === 'bard' && char.level >= 5) delete srUses.bardic_inspiration;
      // Monk: Ki points recharge on short rest
      if (cls === 'monk') delete srUses.ki_points;
      // Battle Master: Superiority Dice recharge on short rest
      if (char.subclass === 'battle_master') delete srUses.superiority_dice;
      // Warlock: Pact Magic slots recharge on short rest
      if (cls === 'warlock') {
        const warlockSlots = spellSlotsForClassLevel('warlock', char.level);
        char.spell_slots_max  = warlockSlots;
        char.spell_slots_used = {};
      }
      char.class_resource_uses = srUses;

      const hdRemain = char.hit_dice_remaining;
      const shortRestFlavor = context.narratives.shortRest
        ? pick(context.narratives.shortRest)
            .replace(/{name}/g, char.name)
            .replace(/{hpGained}/g, String(hdHealed))
            .replace(/{hpNow}/g,   String(char.hp))
            .replace(/{hpMax}/g,   String(char.max_hp)) + ' '
        : '';
      narrative = `${shortRestFlavor}${char.name} takes a short rest, spending a d${char.hit_die ?? 8} — ${hdHealed} HP recovered (${hdRemain} hit ${hdRemain === 1 ? 'die' : 'dice'} remaining, now ${char.hp}/${char.max_hp}).`;
      break;
    }

    case 'long_rest': {
      if (st.combat_active)     { narrative = 'You cannot rest while in combat.'; break; }
      if (!canRestInRoom(st, seed)) { narrative = 'You cannot rest here — an enemy is present.'; break; }
      if (st.long_rested ?? false) { narrative = 'You have already taken a long rest this session.'; break; }

      const restLines: string[] = [];
      const restedChars = st.characters.map(c => {
        if (c.dead) return c;
        const recovered   = Math.max(1, Math.floor(c.level / 2));
        const newHd       = Math.min(c.level, (c.hit_dice_remaining ?? 0) + recovered);
        restLines.push(`${c.name}: HP ${c.hp}→${c.max_hp}, HD ${c.hit_dice_remaining ?? 0}→${newHd}`);
        const charFeatures    = context.classFeatures?.[c.character_class] ?? [];
        const restoredUses: Record<string, number> = { ...(c.class_resource_uses ?? {}) };
        if (charFeatures.includes('rage')) restoredUses.rage_uses = rageUsesMax(c.level);
        // Long rest reduces exhaustion by 1 level (PHB p.291); full rest clears all other conditions
        const newExhaustion = Math.max(0, (c.exhaustion_level ?? 0) - 1);
        return { ...c, hp: c.max_hp, hit_dice_remaining: newHd, conditions: [], condition_durations: {}, class_resource_uses: restoredUses, exhaustion_level: newExhaustion, spell_slots_used: {} };
      });
      st   = { ...st, characters: restedChars, long_rested: true };
      char = { ...restedChars[safeIdx] };
      const longRestFlavor = context.narratives.longRest
        ? pick(context.narratives.longRest).replace(/{party}/g, restLines.join('; ')) + ' '
        : '';
      narrative = `${longRestFlavor}The party takes a long rest. ${restLines.join('; ')}.`;
      break;
    }

    // ── NPC: talk ────────────────────────────────────────────────────────────
    case 'talk': {
      const npc = seed.npcs?.[roomId];
      if (!npc) { narrative = 'There is no one to talk to here.'; break; }
      if (npcIsKilled(st, roomId)) { narrative = 'They are dead.'; break; }

      const attitude = getNpcAttitude(st, npc);
      if (attitude === 'hostile') { narrative = `${npc.name} snarls at you and attacks!`; break; }

      // Indifferent: require CHA (Persuasion) check
      if (attitude === 'indifferent') {
        const dc      = npc.persuasionDC ?? 12;
        const chaMod  = abilityMod(char.cha);
        const roll    = rollDice('1d20') + chaMod + profBonus(char.level);
        const success = roll >= dc;
        if (success) {
          st = { ...st, npc_attitudes: { ...st.npc_attitudes, [roomId]: 'friendly' } };
          narrative = `You approach ${npc.name} with care (CHA check ${roll} vs DC ${dc} — success). ${npc.greeting}`;
        } else {
          narrative = `${npc.name} eyes you warily (CHA check ${roll} vs DC ${dc} — fail). They're not ready to talk yet.`;
          break;
        }
      } else {
        narrative = npc.greeting;
      }

      // Mark room as talked — responses become choices
      if (!st.npc_talked.includes(roomId)) {
        st = { ...st, npc_talked: [...st.npc_talked, roomId] };
      }

      // Append responses as inline choice hints in narrative
      if (npc.responses.length > 0) {
        narrative += ' [' + npc.responses.map((r, i) => `${i + 1}. ${r.label}`).join(' | ') + ']';
      }
      if (st.combat_active) char.turn_actions = { ...char.turn_actions, action_used: true };
      break;
    }

    // ── NPC: talk_response ───────────────────────────────────────────────────
    case 'talk_response': {
      const npc = seed.npcs?.[roomId];
      if (!npc) { narrative = 'There is no one here.'; break; }

      const idx = action.responseIdx;
      const response = npc.responses[idx];
      if (!response) { narrative = 'Invalid response.'; break; }

      narrative = response.reply ? `${npc.name}: "${response.reply}"` : `${npc.name} nods.`;

      // Apply any consequences attached to this response
      if (response.consequences?.length) {
        const narrativeParts: string[] = [];
        for (const c of response.consequences) {
          st = applyConsequence(c, st, seed, char.id, narrativeParts);
        }
        if (narrativeParts.length) narrative += ' ' + narrativeParts.join(' ');
      }
      break;
    }

    // ── NPC: buy ─────────────────────────────────────────────────────────────
    case 'buy': {
      const npc = seed.npcs?.[roomId];
      if (!npc) { narrative = 'There is no one to buy from.'; break; }
      if (getNpcAttitude(st, npc) !== 'friendly') { narrative = `${npc.name} won't trade with you right now.`; break; }

      if (char.gold < action.price) {
        narrative = `You can't afford that — you only have ${char.gold}cr.`;
        break;
      }
      const lootEntry = context.lootTable.find(l => l.id === action.itemId);
      if (!lootEntry) { narrative = 'That item is not available.'; break; }

      char = { ...char, gold: char.gold - action.price, inventory: [...char.inventory, { ...lootEntry, instance_id: randomUUID() }] };
      narrative = `You hand over ${action.price}cr and receive ${lootEntry.name}. ${npc.name} pockets the credits with a nod.`;
      break;
    }

    // ── NPC: attack_npc ──────────────────────────────────────────────────────
    case 'attack_npc': {
      const npc = seed.npcs?.[roomId];
      if (!npc) { narrative = 'There is no one to attack here.'; break; }
      if (npcIsKilled(st, roomId)) { narrative = 'Already dead.'; break; }

      // Flip to hostile if not already
      st = { ...st, npc_attitudes: { ...st.npc_attitudes, [roomId]: 'hostile' } };

      // Resolve attack using NPC stat block as an enemy proxy
      const npcAsEnemy: Enemy = { name: npc.name, hp: npc.hp, ac: npc.ac, damage: npc.damage, toHit: npc.toHit, xp: npc.xp, dex: npc.dex };
      const currentNpcHp = st.enemy_hp?.[`npc:${roomId}`] ?? npc.hp;
      const equippedWeaponItem = char.equipped_weapon
        ? context.lootTable.find(l => l.id === char.equipped_weapon) ?? null
        : null;
      const weaponDamageNpc  = equippedWeaponItem?.damage ?? null;
      const hasDisadvantage  = char.conditions.some(c => DISADV_CONDITIONS.has(c));
      const attackResult = resolvePlayerAttack(
        { str: char.str, dex: char.dex, level: char.level },
        weaponDamageNpc,
        npcAsEnemy.ac,
        equippedWeaponItem?.finesse ?? false,
        hasDisadvantage,
      );

      if (attackResult.hit) {
        const newHp = Math.max(0, currentNpcHp - attackResult.damage);
        st = { ...st, enemy_hp: { ...st.enemy_hp, [`npc:${roomId}`]: newHp } };
        if (newHp <= 0) {
          st = { ...st, enemies_killed: [...st.enemies_killed, `npc:${roomId}`] };
          char = { ...char, xp: char.xp + npcAsEnemy.xp };
          narrative = `${npcAsEnemy.name} falls. You earned ${npcAsEnemy.xp} XP — but at what cost?`;
        } else {
          narrative = `You strike ${npcAsEnemy.name} for ${attackResult.damage} damage (${newHp} HP remaining).`;
        }
      } else {
        narrative = `Your attack misses ${npcAsEnemy.name}.`;
      }

      // NPC retaliates
      if (!npcIsKilled(st, roomId)) {
        const retaliation = applyEnemyAttackNarrative(npcAsEnemy, char, context);
        char = { ...char, hp: Math.max(0, char.hp - retaliation.hpLost), conditions: retaliation.newConditions, condition_durations: retaliation.newDurations };
        narrative += ' ' + retaliation.narrative;
      }
      char.turn_actions = { ...char.turn_actions, action_used: true };
      break;
    }

    case 'disarm_trap': {
      const trap = getRoomTrap(roomId, seed, context);
      if (!trap || trapSpent(st, roomId)) { narrative = 'There is no trap here to disarm.'; break; }
      // Must have detected it (passive Perception) to attempt disarm
      if (!partyDetectsTrap(st.characters, trap)) { narrative = 'You have not located the trap.'; break; }
      const hasToolProf = char.tool_proficiencies?.some(t =>
        t.toLowerCase().includes('thieves') || t.toLowerCase().includes('hacking')
      ) ?? false;
      // Exhaustion 1+: disadvantage on ability checks (disarmTrap uses DEX)
      // disarmTrap does not support disadvantage natively; apply by calling twice and taking lower
      const exhaustionDisadv1Trap = (char.exhaustion_level ?? 0) >= 1;
      const trapAttempt1 = disarmTrap(char.dex, char.level, hasToolProf);
      const trapAttempt2 = exhaustionDisadv1Trap ? disarmTrap(char.dex, char.level, hasToolProf) : trapAttempt1;
      const { roll, total } = trapAttempt1.total <= trapAttempt2.total ? trapAttempt1 : trapAttempt2;
      const profNote = hasToolProf ? ` (tool proficiency)` : '';
      if (total >= trap.dc) {
        st.traps_disarmed = [...(st.traps_disarmed ?? []), roomId];
        narrative = `${trap.disarmSuccess} (DEX ${roll} + ${total - roll}${profNote} = ${total} vs DC ${trap.dc})`;
      } else {
        // Disarm failure — trap triggers
        st.traps_triggered = [...(st.traps_triggered ?? []), roomId];
        const trapDmg = rollDice(trap.damage);
        char.hp = Math.max(0, char.hp - trapDmg);
        let failNarr = `${trap.disarmFail} (DEX ${roll} + ${total - roll}${profNote} = ${total} vs DC ${trap.dc}). `;
        failNarr += trap.triggerNarrative.replace(/{name}/g, char.name).replace(/{dmg}/g, String(trapDmg));
        narrative = failNarr;
        if (trap.condition && char.hp > 0) {
          char.conditions = [...new Set([...char.conditions, trap.condition])];
          if (trap.conditionDuration) char.condition_durations = { ...char.condition_durations, [trap.condition]: trap.conditionDuration };
        }
      }
      char.turn_actions = { ...char.turn_actions, action_used: true };
      break;
    }

    case 'apply_asi': {
      if (!char.asi_pending) { narrative = 'No Ability Score Improvement pending.'; break; }
      const stat = action.stat as AbilityKey;
      char[stat]       = (char[stat] ?? 10) + 2;
      char.asi_pending = false;
      const statName   = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[stat];
      narrative = `${char.name} increases ${statName} by 2 (now ${char[stat]})!`;
      // CON increase retroactively raises max HP (per 5e PHB: apply to all existing levels)
      if (stat === 'con') {
        const bonus = Math.floor((char.con - 10) / 2) - Math.floor((char.con - 2 - 10) / 2);
        char.max_hp = Math.max(1, char.max_hp + bonus * char.level);
        char.hp     = Math.min(char.max_hp, char.hp + bonus * char.level);
        if (bonus > 0) narrative += ` Max HP increased by ${bonus * char.level} (${bonus}/level × ${char.level} levels).`;
      }
      break;
    }

    case 'cast_spell': {
      const { spellId, slotLevel } = action;
      const isRitualCast = (action as { type: 'cast_spell'; spellId: string; slotLevel: number; ritual?: boolean }).ritual ?? false;
      const spell = context.spellTable?.[spellId];
      if (!spell) { narrative = `Unknown spell: ${spellId}.`; break; }

      // PHB p.144: cannot cast spells while wearing armor you are not proficient with
      const spellArmorItem = char.equipped_armor
        ? context.lootTable.find(l => l.id === (char.inventory?.find(i => i.instance_id === char.equipped_armor)?.id))
        : null;
      if (spellArmorItem && !hasArmorProficiency(char.armor_proficiencies ?? [], spellArmorItem.armorCategory)) {
        narrative = `You cannot cast spells while wearing ${spellArmorItem.name} — you are not proficient with ${spellArmorItem.armorCategory ?? 'this'} armor.`;
        break;
      }

      // Deafened: cannot cast spells with verbal components
      if (char.conditions.includes('deafened') && (spell as { verbal?: boolean }).verbal) {
        narrative = `You cannot cast ${spell.name} while deafened — it requires a verbal component.`;
        break;
      }

      // Ritual casting: no slot cost, only out of combat
      if (isRitualCast) {
        if (!(spell as { ritualCasting?: boolean }).ritualCasting) {
          narrative = `${spell.name} cannot be cast as a ritual.`;
          break;
        }
        if (st.combat_active) {
          narrative = `Ritual casting takes 10 minutes — not usable in combat.`;
          break;
        }
        // No slot consumed for ritual casting
      }

      // Spell preparation check (Cleric, Paladin, Druid)
      const prepClasses = ['cleric', 'paladin', 'druid'];
      if (prepClasses.includes(char.character_class.toLowerCase()) && spell.level > 0 && !isRitualCast) {
        const prepared = char.prepared_spells ?? [];
        if (prepared.length > 0 && !prepared.includes(spellId)) {
          narrative = `${spell.name} is not prepared. Use 'Prepare Spells' to change your prepared spell list.`;
          break;
        }
      }

      // Break existing concentration if this spell also requires concentration (PHB p.203)
      if (spell.concentration && char.concentrating_on) {
        const { char: nc, st: ns } = breakConcentration(char, st);
        char = nc; st = ns;
      }

      // Expend a slot for non-cantrips (unless ritual)
      if (spell.level > 0 && !isRitualCast) {
        if (slotLevel < spell.level) {
          narrative = `${spell.name} requires at least a level-${spell.level} slot.`;
          break;
        }
        const slotsMax  = (char.spell_slots_max  ?? {})[slotLevel] ?? 0;
        const slotsUsed = (char.spell_slots_used ?? {})[slotLevel] ?? 0;
        if (slotsUsed >= slotsMax) {
          narrative = `No level-${slotLevel} spell slots remaining (recovered on long rest).`;
          break;
        }
        char.spell_slots_used = { ...(char.spell_slots_used ?? {}), [slotLevel]: slotsUsed + 1 };
      }

      // Mark action economy
      if (spell.castTime === 'bonus_action') {
        char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
      } else {
        char.turn_actions = { ...char.turn_actions, action_used: true };
      }

      const castingAbility      = (context.spellcastingAbility?.[char.character_class] ?? context.classPrimaryStats[char.character_class] ?? 'int') as AbilityKey;
      const castingScore        = char[castingAbility] ?? 10;
      const slotNote            = spell.level > 0 ? ` (level-${slotLevel} slot)` : ' (cantrip)';

      // ── Heal spells ────────────────────────────────────────────────────────
      if (spell.heal) {
        const healMod     = Math.max(0, Math.floor((castingScore - 10) / 2));
        const healed      = rollDice(spell.heal) + healMod;
        // Target the most injured party member (excluding the caster, unless only one)
        const injured     = st.characters.filter(c => !c.dead && c.hp < c.max_hp && c.id !== char.id);
        const target      = injured.length > 0 ? injured.reduce((a, b) => (a.hp < b.hp ? a : b)) : char;
        const isSelf      = target.id === char.id;
        if (isSelf) {
          char.hp = Math.min(char.max_hp, char.hp + healed);
          narrative = `${char.name} casts ${spell.name}${slotNote} — restores ${healed} HP to self (now ${char.hp}/${char.max_hp}).`;
        } else {
          const newHp = Math.min(target.max_hp, target.hp + healed);
          st = { ...st, characters: st.characters.map(c => c.id === target.id ? { ...c, hp: newHp } : c) };
          narrative = `${char.name} casts ${spell.name}${slotNote} — restores ${healed} HP to ${target.name} (now ${newHp}/${target.max_hp}).`;
        }
        break;
      }

      // ── Utility spells (no damage, no save, no heal) ───────────────────────
      if (!spell.damage && !spell.savingThrow && !spell.attackRoll && !spell.condition) {
        narrative = spell.narrative
          ? spell.narrative.replace('{name}', char.name)
          : `${char.name} casts ${spell.name}${slotNote}.`;
        break;
      }

      // ── Offensive spells — need a living enemy ─────────────────────────────
      if (!enemy || !enemyAlive) { narrative = pick(context.narratives.noEnemy); break; }

      const dc       = spellSaveDC(char.level, castingScore);
      let   spellDmg = 0;
      let   spellHit = true;

      if (spell.attackRoll) {
        // ── Spell attack roll ──────────────────────────────────────────────
        const atk  = resolveSpellAttack(char.level, castingScore, enemy.ac);
        spellHit   = atk.hit;
        const atkNote = ` (spell attack ${atk.roll}+${atk.bonus}=${atk.total} vs AC ${enemy.ac})`;
        if (!spellHit) {
          narrative = `${char.name} casts ${spell.name}${slotNote} — MISS!${atkNote}`;
          break;
        }
        const atkDmgExpr = spell.level === 0 ? cantripDamageDice(spell, char.level) : upcastDamage(spell, slotLevel);
        spellDmg  = atk.critical ? rollCritical(atkDmgExpr || null) : rollDice(atkDmgExpr || '1d4');
        narrative = `${char.name} casts ${spell.name}${slotNote}!${atkNote} `;
        if (atk.critical) narrative += 'Critical spell hit! ';
        narrative += `${spellDmg} ${spell.damageType ?? ''} damage!`;
      } else if (spell.savingThrow) {
        // ── Saving throw spell ─────────────────────────────────────────────
        const saveAbility    = spell.savingThrow;
        const enemyScore     = (enemy as unknown as Record<string, number>)[saveAbility] ?? 10;
        const saveFailed     = rollConditionSave(saveAbility, enemyScore, dc);
        const saveLabel      = saveAbility.toUpperCase();

        if (spell.damage) {
          const saveDmgExpr = spell.level === 0 ? cantripDamageDice(spell, char.level) : upcastDamage(spell, slotLevel);
          const fullDmg = rollDice(saveDmgExpr || spell.damage);
          spellDmg = saveFailed ? fullDmg
            : spell.saveEffect === 'half' ? Math.floor(fullDmg / 2) : 0;
          const saveVerb = saveFailed ? 'fails' : 'succeeds';
          narrative = `${char.name} casts ${spell.name}${slotNote}! (DC ${dc} ${saveLabel} save — ${enemy.name} ${saveVerb}.) `;
          narrative += spellDmg > 0 ? `${spellDmg} ${spell.damageType ?? ''} damage!` : 'No damage.';
          if (!saveFailed && spell.saveEffect === 'half') narrative += ' (half damage)';
        } else {
          narrative = `${char.name} casts ${spell.name}${slotNote}! (DC ${dc} ${saveLabel} save — `;
          narrative += saveFailed ? `${enemy.name} fails.)` : `${enemy.name} succeeds.)`;
        }

        if (spell.condition && saveFailed) {
          if (enemy.condition_immunities?.includes(spell.condition)) {
            narrative += ` [${enemy.name} is immune to ${spell.condition}]`;
          } else {
            st = { ...st, enemy_conditions: [...(st.enemy_conditions ?? []).filter(c => c !== spell.condition), spell.condition] };
            narrative += ` The ${enemy.name} is ${spell.condition}!`;
            if (spell.concentration) {
              char.concentrating_on = { spellId, condition: spell.condition };
            }
          }
          const { damage: effCondDmg, note: condDmgNote } = applyDamageMultiplier(spellDmg, spell.damageType, enemy);
          if (condDmgNote) narrative += condDmgNote;
          const newEnemyHp = getEnemyHp(st, roomId, seed) - effCondDmg;
          st.enemy_hp = { ...st.enemy_hp, [roomId]: Math.max(0, newEnemyHp) };
          if (newEnemyHp <= 0) {
            const xpGain = enemy.xp ?? 10;
            char.xp = (char.xp || 0) + xpGain;
            st.enemies_killed = [...st.enemies_killed, roomId];
            st.enemy_hp = { ...st.enemy_hp, [roomId]: 0 };
            st.enemy_conditions = [];
            char.concentrating_on = null;
            st = endCombatState(st);
            narrative += ' ' + pick(context.narratives.killShot).replace('{enemy}', enemy.name).replace('{xp}', String(xpGain));
          }
          usedInitiative = true;
          break;
        }
      } else if (spell.damage && !spell.savingThrow && !spell.attackRoll) {
        // ── Auto-hit (Magic Missile style) ─────────────────────────────────
        const autoHitExpr = spell.level === 0 ? cantripDamageDice(spell, char.level) : upcastDamage(spell, slotLevel);
        spellDmg  = rollDice(autoHitExpr || spell.damage);
        narrative = `${char.name} casts ${spell.name}${slotNote}! Auto-hit — ${spellDmg} ${spell.damageType ?? ''} damage!`;
      }

      // Apply damage to enemy
      if (spellDmg > 0 || spellHit) {
        const { damage: effSpellDmg, note: spellDmgNote } = applyDamageMultiplier(spellDmg, spell.damageType, enemy);
        if (spellDmgNote) narrative += spellDmgNote;
        spellDmg = effSpellDmg;
        const currentHp = getEnemyHp(st, roomId, seed);
        const newHp     = currentHp - spellDmg;
        if (newHp <= 0) {
          const xpGain = enemy.xp ?? 10;
          char.xp           = (char.xp || 0) + xpGain;
          st.enemies_killed = [...st.enemies_killed, roomId];
          st.enemy_hp       = { ...st.enemy_hp, [roomId]: 0 };
          st = endCombatState(st);
          narrative += ' ' + pick(context.narratives.killShot).replace('{enemy}', enemy.name).replace('{xp}', String(xpGain));
          if (char.xp >= char.level * 100) {
            char.level  += 1;
            char.max_hp += 4;
            char.hp      = Math.min(char.hp + 4, char.max_hp);
            char.spell_slots_max = getSpellSlotsForLevel(char.character_class, char.level, context);
            narrative += ' ' + pick(context.narratives.levelUp);
            if ([4, 8, 12, 16, 19].includes(char.level)) {
              char.asi_pending = true;
              narrative += ` Level ${char.level}: choose an Ability Score Improvement!`;
            }
          }
        } else {
          st.enemy_hp = { ...st.enemy_hp, [roomId]: newHp };
          narrative += ` The ${enemy.name} has ${newHp} HP remaining.`;
        }
      }

      usedInitiative = true;
      break;
    }

    case 'use_class_feature': {
      const features = context.classFeatures?.[char.character_class] ?? [];
      const fid = action.featureId;
      const dispatchKey = [char.character_class, char.subclass, fid].filter(Boolean).join('_');

      // ── Rage (Barbarian bonus action) ──────────────────────────────────────
      if (fid === 'rage') {
        if (!features.includes('rage'))             { narrative = `${char.character_class} does not have Rage.`; break; }
        if (char.conditions.includes('raging'))     { narrative = 'You are already raging!'; break; }
        const rageUses = char.class_resource_uses?.rage_uses ?? rageUsesMax(char.level);
        if (rageUses <= 0)                          { narrative = 'No rage uses remaining. They recover on a long rest.'; break; }
        char.conditions          = [...char.conditions, 'raging'];
        char.class_resource_uses = { ...(char.class_resource_uses ?? {}), rage_uses: rageUses - 1 };
        char.turn_actions        = { ...char.turn_actions, bonus_action_used: true };
        narrative = `${char.name} RAGES! +${rageDamageBonus(char.level)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)`;
      }

      // ── Action Surge (Fighter) ─────────────────────────────────────────────
      else if (fid === 'action_surge') {
        if (char.character_class.toLowerCase() !== 'fighter') { narrative = 'Only Fighters have Action Surge.'; break; }
        if (char.level < 2) { narrative = 'Action Surge requires Fighter level 2.'; break; }
        if ((char.class_resource_uses?.action_surge ?? 0) >= 1) { narrative = 'Action Surge already used this rest.'; break; }
        char.class_resource_uses = { ...(char.class_resource_uses ?? {}), action_surge: 1 };
        char.turn_actions        = { ...char.turn_actions, action_used: false };
        narrative = `${char.name} uses Action Surge — one additional action this turn!`;
      }

      // ── Second Wind (Fighter bonus action) ────────────────────────────────
      else if (fid === 'second_wind') {
        if (char.character_class.toLowerCase() !== 'fighter') { narrative = 'Only Fighters have Second Wind.'; break; }
        if ((char.class_resource_uses?.second_wind ?? 0) >= 1) { narrative = 'Second Wind already used. Recovers on a short or long rest.'; break; }
        if (char.turn_actions.bonus_action_used) { narrative = 'Bonus action already used this turn.'; break; }
        const swHeal = rollDice('1d10') + char.level;
        char.hp = Math.min(char.max_hp, char.hp + swHeal);
        char.class_resource_uses = { ...(char.class_resource_uses ?? {}), second_wind: 1 };
        char.turn_actions        = { ...char.turn_actions, bonus_action_used: true };
        narrative = `${char.name} uses Second Wind — healed ${swHeal} HP (now ${char.hp}/${char.max_hp}).`;
      }

      // ── Bardic Inspiration (Bard bonus action) ────────────────────────────
      else if (fid === 'bardic_inspiration') {
        if (char.character_class.toLowerCase() !== 'bard') { narrative = 'Only Bards have Bardic Inspiration.'; break; }
        const biUses = char.class_resource_uses?.bardic_inspiration ?? Math.max(1, Math.floor((char.cha - 10) / 2));
        if (biUses <= 0) { narrative = 'No Bardic Inspiration uses remaining.'; break; }
        if (char.turn_actions.bonus_action_used) { narrative = 'Bonus action already used this turn.'; break; }
        char.class_resource_uses = { ...(char.class_resource_uses ?? {}), bardic_inspiration: biUses - 1 };
        char.turn_actions        = { ...char.turn_actions, bonus_action_used: true };
        const inspDie = char.level >= 15 ? 'd12' : char.level >= 10 ? 'd10' : char.level >= 5 ? 'd8' : 'd6';
        narrative = `${char.name} grants Bardic Inspiration (d${inspDie}) to an ally! (${biUses - 1} use${biUses - 1 === 1 ? '' : 's'} remaining)`;
      }

      // ── Cunning Action: Dash (Rogue L2+ bonus action) ─────────────────────
      else if (fid === 'cunning_action_dash') {
        if (char.character_class.toLowerCase() !== 'rogue') { narrative = 'Only Rogues have Cunning Action.'; break; }
        if (char.level < 2) { narrative = 'Cunning Action requires Rogue level 2.'; break; }
        if (char.turn_actions.bonus_action_used) { narrative = 'Bonus action already used this turn.'; break; }
        const caSpeed = char.speed ?? DEFAULT_SPEED_FEET;
        char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
        st = { ...st, movement_used: { ...(st.movement_used ?? {}), [char.id]: Math.max(0, (st.movement_used?.[char.id] ?? 0) - caSpeed) } };
        narrative = `${char.name} uses Cunning Action: Dash — +${caSpeed} ft movement this turn.`;
      }

      // ── Cunning Action: Disengage (Rogue L2+ bonus action) ────────────────
      else if (fid === 'cunning_action_disengage') {
        if (char.character_class.toLowerCase() !== 'rogue') { narrative = 'Only Rogues have Cunning Action.'; break; }
        if (char.level < 2) { narrative = 'Cunning Action requires Rogue level 2.'; break; }
        if (char.turn_actions.bonus_action_used) { narrative = 'Bonus action already used this turn.'; break; }
        char.turn_actions = { ...char.turn_actions, bonus_action_used: true, disengaged: true };
        narrative = `${char.name} uses Cunning Action: Disengage — no opportunity attacks when moving this turn.`;
      }

      // ── Cunning Action: Hide (Rogue L2+ bonus action) ─────────────────────
      else if (fid === 'cunning_action_hide') {
        if (char.character_class.toLowerCase() !== 'rogue') { narrative = 'Only Rogues have Cunning Action.'; break; }
        if (char.level < 2) { narrative = 'Cunning Action requires Rogue level 2.'; break; }
        if (char.turn_actions.bonus_action_used) { narrative = 'Bonus action already used this turn.'; break; }
        const sneakHideDC = enemyAlive ? passivePerceptionDC(enemy!.wis ?? 10) : 10;
        const hideProf = char.skill_proficiencies?.includes('Stealth') ?? false;
        const hideCheck = skillCheck(char.dex, sneakHideDC, hideProf, char.level, false);
        char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
        if (hideCheck.success) {
          char = inflictCondition(char, 'invisible');
          narrative = `${char.name} hides! (Stealth ${hideCheck.total} vs DC ${sneakHideDC} — success.) Next attack has advantage.`;
        } else {
          narrative = `${char.name} tries to hide but fails. (Stealth ${hideCheck.total} vs DC ${sneakHideDC})`;
        }
      }

      // ── Battle Master: Maneuver (Fighter L3+ subclass) ────────────────────
      else if (dispatchKey.includes('battle_master') && fid.startsWith('maneuver_')) {
        const sdPool = char.class_resource_uses?.superiority_dice ?? 4;
        if (sdPool <= 0) { narrative = 'No superiority dice remaining (recover on short rest).'; break; }
        char.class_resource_uses = { ...(char.class_resource_uses ?? {}), superiority_dice: sdPool - 1 };
        const sdRoll = rollDice('1d8');
        if (fid === 'maneuver_trip') {
          const tripSave = rollDice('1d20') + abilityMod((enemy as unknown as Record<string, number>)['str'] ?? 10);
          const tripDC   = 8 + profBonus(char.level) + abilityMod(char.str);
          if (tripSave < tripDC) {
            st.enemy_conditions = [...(st.enemy_conditions ?? []).filter(c => c !== 'prone'), 'prone'];
            narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${enemy!.name} knocked prone! (STR save ${tripSave} vs DC ${tripDC})`;
          } else {
            narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${enemy!.name} resists the trip. (STR save ${tripSave} vs DC ${tripDC})`;
          }
        } else if (fid === 'maneuver_goading') {
          const goadSave = rollDice('1d20') + abilityMod((enemy as unknown as Record<string, number>)['wis'] ?? 10);
          const goadDC   = 8 + profBonus(char.level) + abilityMod(char.cha);
          if (goadSave < goadDC) {
            st.enemy_conditions = [...(st.enemy_conditions ?? []).filter(c => c !== 'goaded'), 'goaded'];
            narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${enemy!.name} goaded (disadvantage vs others)! (WIS save ${goadSave} vs DC ${goadDC})`;
          } else {
            narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${enemy!.name} resists. (WIS save ${goadSave} vs DC ${goadDC})`;
          }
        } else {
          // Generic maneuver: deal extra die damage
          narrative = `Maneuver — +${sdRoll} superiority die damage! (${sdPool - 1} dice remaining)`;
        }
      }

      // ── Unknown feature fallthrough ────────────────────────────────────────
      else {
        narrative = `Unknown class feature: ${fid}.`;
      }
      break;
    }

    case 'interact_object': {
      const currentSeedRoom = seed.rooms.find(r => r.id === roomId);
      const obj: RoomObject | undefined = currentSeedRoom?.objects?.find(o => o.id === action.objectId);
      if (!obj) { narrative = 'There is nothing like that here.'; break; }

      const searchKey = `${roomId}:${obj.id}`;
      if ((st.objects_searched ?? []).includes(searchKey)) {
        narrative = `You have already searched the ${obj.name}.`;
        break;
      }

      st = { ...st, objects_searched: [...(st.objects_searched ?? []), searchKey] };

      if (!obj.searchable || !obj.lootIds?.length) {
        narrative = obj.interactText;
        break;
      }

      const proficient = char.skill_proficiencies?.some(s =>
        s.toLowerCase() === 'investigation' || s.toLowerCase() === 'perception'
      ) ?? false;
      const exhaustionDisadv1 = (char.exhaustion_level ?? 0) >= 1;
      const check = skillCheck(char.int, obj.searchDC ?? 12, proficient, char.level, exhaustionDisadv1);

      if (check.success) {
        const gained: string[] = [];
        for (const lootId of obj.lootIds) {
          const item = context.lootTable.find(l => l.id === lootId);
          if (item) {
            char.inventory = [...(char.inventory ?? []), { ...item, instance_id: randomUUID() }];
            gained.push(item.name);
          }
        }
        const foundDesc = obj.foundText ?? `You find: ${gained.join(', ')}.`;
        narrative = `${obj.interactText} (Investigation: ${check.roll}+${abilityMod(char.int)}=${check.total} vs DC ${obj.searchDC ?? 12} — success!) ${foundDesc}`;
      } else {
        narrative = `${obj.interactText} (Investigation: ${check.roll}+${abilityMod(char.int)}=${check.total} vs DC ${obj.searchDC ?? 12} — fail.) ${obj.emptyText ?? 'You find nothing useful.'}`;
      }
      break;
    }

    case 'two_weapon_attack': {
      if (!st.combat_active) { narrative = 'No enemy to attack.'; break; }
      if (char.turn_actions.bonus_action_used) { narrative = 'Bonus action already used this turn.'; break; }
      // Find the off-hand light weapon in inventory
      const mainWpnInstanceId = char.equipped_weapon;
      const offhandInvItem = char.inventory
        .filter(i => i.instance_id !== mainWpnInstanceId)
        .find(i => {
          const l = context.lootTable.find(ll => ll.id === i.id);
          return l?.light && l.slot === 'weapon';
        });
      if (!offhandInvItem) { narrative = 'No light off-hand weapon found.'; break; }
      const offhandLoot = context.lootTable.find(l => l.id === offhandInvItem.id)!;
      const offhandProficient = hasWeaponProficiency(char.weapon_proficiencies ?? [], offhandLoot.weaponType);
      const enemyInRoom = seed.enemies?.[roomId];
      if (!enemyInRoom || state.enemies_killed?.includes(roomId)) { narrative = 'No enemy here.'; break; }
      const condDisadvTwf = char.conditions.some(c => DISADV_CONDITIONS.has(c));
      const armorLootItemTwf = char.equipped_armor
        ? context.lootTable.find(l => l.id === (char.inventory.find(i => i.instance_id === char.equipped_armor)?.id))
        : null;
      const armorProfTwf = hasArmorProficiency(char.armor_proficiencies ?? [], armorLootItemTwf?.armorCategory);
      const disadvTwf = condDisadvTwf || !armorProfTwf;
      const atk = resolveOffHandAttack(
        { str: char.str, dex: char.dex, level: char.level },
        offhandLoot.damage, enemyInRoom.ac,
        offhandLoot.finesse ?? false, disadvTwf, false, offhandProficient,
        offhandLoot.range === 'ranged',
      );
      char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
      usedInitiative = true;
      if (atk.fumble) {
        narrative = `Off-hand fumble! The ${offhandLoot.name} slips from your grip. (d20: 1)`;
        break;
      }
      if (!atk.hit) {
        narrative = `Off-hand attack with ${offhandLoot.name} misses. (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac})`;
        break;
      }
      const curHpTwf = getEnemyHp(st, roomId, seed);
      const newHpTwf = curHpTwf - atk.damage;
      st = setEnemyHp(st, roomId, newHpTwf);
      narrative = `Off-hand strike with ${offhandLoot.name}! ${atk.damage} damage${atk.critical ? ' (CRITICAL!)' : ''} (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac}, no ability mod to damage).`;
      if (newHpTwf <= 0) {
        const xpGainTwf = enemyInRoom.xp ?? 10;
        char.xp = (char.xp || 0) + xpGainTwf;
        narrative += ` The ${enemyInRoom.name} falls!`;
        st.enemies_killed = [...(st.enemies_killed || []), roomId];
        st.enemy_conditions = [];
        if (st.combat_active) st = endCombatState(st);
      }
      break;
    }

    case 'grapple': {
      if (!enemyAlive) { narrative = 'No enemy to grapple.'; break; }
      if (enemy.condition_immunities?.includes('grappled')) {
        narrative = `The ${enemy.name} cannot be grappled (condition immunity).`;
        char.turn_actions = { ...char.turn_actions, action_used: true };
        usedInitiative = true;
        break;
      }
      // Contested Athletics: player STR check vs enemy STR or DEX (whichever higher)
      const athProfGrapple = (context.classSkills[char.character_class] ?? []).includes('athletics');
      const playerRollGrapple = d(20) + abilityMod(char.str) + (athProfGrapple ? profBonus(char.level) : 0);
      const enemyStrGrapple   = abilityMod(enemy.toHit); // toHit is a rough proxy for STR/DEX mod
      const enemyDexGrapple   = abilityMod(enemy.dex ?? 10);
      const enemyRollGrapple  = d(20) + Math.max(enemyStrGrapple, enemyDexGrapple);
      char.turn_actions = { ...char.turn_actions, action_used: true };
      usedInitiative = true;
      if (playerRollGrapple > enemyRollGrapple) {
        st.enemy_conditions = [...(st.enemy_conditions ?? []).filter(c => c !== 'grappled'), 'grappled'];
        narrative = `You grapple the ${enemy.name}! (${playerRollGrapple} vs ${enemyRollGrapple}) They are GRAPPLED — speed 0, your attacks have advantage.`;
      } else {
        narrative = `The ${enemy.name} breaks free of your grapple attempt. (${playerRollGrapple} vs ${enemyRollGrapple})`;
      }
      break;
    }

    case 'shove': {
      if (!enemyAlive) { narrative = 'No enemy to shove.'; break; }
      if (enemy.condition_immunities?.includes('prone')) {
        narrative = `The ${enemy.name} cannot be knocked prone (condition immunity).`;
        char.turn_actions = { ...char.turn_actions, action_used: true };
        usedInitiative = true;
        break;
      }
      const athProfShove = (context.classSkills[char.character_class] ?? []).includes('athletics');
      const playerRollShove = d(20) + abilityMod(char.str) + (athProfShove ? profBonus(char.level) : 0);
      const enemyStrShove   = abilityMod(enemy.toHit);
      const enemyDexShove   = abilityMod(enemy.dex ?? 10);
      const enemyRollShove  = d(20) + Math.max(enemyStrShove, enemyDexShove);
      char.turn_actions = { ...char.turn_actions, action_used: true };
      usedInitiative = true;
      if (playerRollShove > enemyRollShove) {
        st.enemy_conditions = [...(st.enemy_conditions ?? []).filter(c => c !== 'prone'), 'prone'];
        narrative = `You shove the ${enemy.name} to the ground! (${playerRollShove} vs ${enemyRollShove}) They are PRONE — melee attacks against them have advantage, ranged attacks have disadvantage.`;
      } else {
        narrative = `The ${enemy.name} resists your shove. (${playerRollShove} vs ${enemyRollShove})`;
      }
      break;
    }

    case 'dodge': {
      if (!st.combat_active) { narrative = 'You can only dodge in combat.'; break; }
      if (char.turn_actions.action_used) { narrative = 'You have already used your action this turn.'; break; }
      char.turn_actions = { ...char.turn_actions, action_used: true, dodging: true };
      usedInitiative = true;
      narrative = `${char.name} takes the Dodge action — until your next turn, attacks against you have disadvantage.`;
      break;
    }

    case 'disengage': {
      if (!st.combat_active) { narrative = 'You can only disengage in combat.'; break; }
      if (char.turn_actions.action_used) { narrative = 'You have already used your action this turn.'; break; }
      char.turn_actions = { ...char.turn_actions, action_used: true, disengaged: true };
      usedInitiative = true;
      narrative = `${char.name} takes the Disengage action — your next movement this turn won't trigger opportunity attacks.`;
      break;
    }

    case 'attune': {
      if (st.combat_active) { narrative = 'You cannot attune to items during combat.'; break; }
      const attuneInstanceId = 'instanceId' in action ? (action as { type: 'attune'; instanceId: string }).instanceId : '';
      const attuneInvItem = char.inventory.find(i => i.instance_id === attuneInstanceId);
      if (!attuneInvItem) { narrative = "You don't have that item."; break; }
      const attuneLootItem = context.lootTable.find(l => l.id === attuneInvItem.id);
      if (!attuneLootItem?.requiresAttunement) { narrative = `The ${attuneInvItem.name} doesn't require attunement.`; break; }
      const attunedList = char.attuned_items ?? [];
      if (attunedList.includes(attuneInstanceId)) { narrative = `You are already attuned to the ${attuneInvItem.name}.`; break; }
      if (attunedList.length >= 3) { narrative = 'You can only be attuned to 3 items at a time (PHB p.138). De-attune one first.'; break; }
      char.attuned_items = [...attunedList, attuneInstanceId];
      narrative = `You spend a moment focusing on the ${attuneInvItem.name}, attuning yourself to its magic. (${attunedList.length + 1}/3 attuned items)`;
      break;
    }

    // ── Grid movement ────────────────────────────────────────────────────────
    case 'grid_move': {
      if (!st.entities) { narrative = 'Grid combat is not active.'; break; }
      const gridAction = action as { type: 'grid_move'; entityId: string; to: { x: number; y: number } };
      if (gridAction.entityId !== char.id) { narrative = 'You can only move your own character.'; break; }

      const charEntity = st.entities.find(e => e.id === char.id);
      if (!charEntity) { narrative = 'Your character is not on the grid.'; break; }

      const locationGrid = context.campaign?.locations?.find(l => l.rooms?.some(r => r.id === roomId));
      const gridW = locationGrid?.gridWidth  ?? context.gridWidth  ?? 10;
      const gridH = locationGrid?.gridHeight ?? context.gridHeight ?? 10;
      const blocked = st.entities.filter(e => e.id !== char.id).map(e => e.pos);

      const path = findPath(charEntity.pos, gridAction.to, blocked, gridW, gridH);
      if (!path) { narrative = 'No path to that square.'; break; }

      // Terrain-aware movement cost: difficult terrain squares cost 2× movement
      const currentSeedRoomGrid = seed.rooms.find(r => r.id === roomId);
      const difficultTerrain = currentSeedRoomGrid?.difficultTerrain ?? [];
      const costFeet = path.reduce((acc, pos) => {
        const isDifficult = difficultTerrain.some(dt => posEqual(dt, pos));
        return acc + (isDifficult ? SQUARE_SIZE * 2 : SQUARE_SIZE);
      }, 0);

      const speedFt  = char.speed ?? DEFAULT_SPEED_FEET;
      const usedFt   = st.movement_used?.[char.id] ?? 0;
      if (usedFt + costFeet > speedFt) {
        narrative = `Not enough movement. (${speedFt - usedFt} ft remaining, ${costFeet} ft needed${difficultTerrain.length ? ' — difficult terrain' : ''})`;
        break;
      }

      // Check for opportunity attacks from enemies being left behind
      const oaTargets = opportunityAttackTriggers(charEntity.pos, gridAction.to, st.entities, false);
      let oaNarrative = '';
      for (const oaEntity of oaTargets) {
        const oaEnemy = seed.enemies?.[oaEntity.id];
        if (oaEnemy && !st.enemies_killed.includes(oaEntity.id) && !(char.turn_actions?.disengaged)) {
          const oaResult = resolveEnemyAttack(oaEnemy, char.ac);
          if (oaResult.hit) {
            const dmg = oaResult.damage;
            char.hp = Math.max(0, char.hp - dmg);
            const concResult = checkConcentration(char, st, dmg);
            char = concResult.char; st = concResult.st;
            oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: ${dmg} damage!${concResult.note}]`;
          } else {
            oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: missed!]`;
          }
        }
      }

      // Apply movement
      const updatedEntities: CombatEntity[] = st.entities!.map(e =>
        e.id === char.id ? { ...e, pos: gridAction.to } : e,
      );
      st = {
        ...st,
        entities:      updatedEntities,
        movement_used: { ...st.movement_used, [char.id]: usedFt + costFeet },
      };

      narrative = `${char.name} moves to (${gridAction.to.x}, ${gridAction.to.y}).${oaNarrative}`;
      break;
    }

    // ── Travel between locations ──────────────────────────────────────────────
    case 'travel': {
      const travelAction = action as { type: 'travel'; locationId: string };
      const destLocation = context.campaign?.locations?.find(l => l.id === travelAction.locationId);
      if (!destLocation) { narrative = 'Unknown destination.'; break; }

      // Wilderness encounter check
      let encounterNote = '';
      if (destLocation.encounterTable?.length && destLocation.encounterChance && Math.random() < destLocation.encounterChance) {
        const pick2 = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
        const templateKey = pick2(destLocation.encounterTable);
        const tpl = context.enemyTemplates.find(t => t.name === templateKey);
        if (tpl) {
          seed = { ...seed, enemies: { ...seed.enemies, [roomId]: { name: tpl.name, hp: tpl.hp, ac: tpl.ac, damage: tpl.damage, toHit: tpl.toHit, xp: tpl.xp } } };
          encounterNote = ` A ${tpl.name} bars your path!`;
        }
      }

      // Advance world day on travel
      st = {
        ...st,
        current_location_id: travelAction.locationId,
        current_district_id: undefined,
        world_day:           (st.world_day ?? 1) + 1,
        // Place entities at entrance of new location if it's a dungeon
        entities:            undefined,
        movement_used:       undefined,
      };

      narrative = `You travel to ${destLocation.name}.${encounterNote}`;
      usedInitiative = false;
      break;
    }

    // ── Enter a town district ─────────────────────────────────────────────────
    case 'enter_district': {
      const districtAction = action as { type: 'enter_district'; districtId: string };
      const currentLoc = context.campaign?.locations?.find(l => l.id === st.current_location_id);
      const district   = currentLoc?.districts?.find(d => d.id === districtAction.districtId);
      if (!district) { narrative = 'Unknown district.'; break; }

      st = { ...st, current_district_id: districtAction.districtId };
      narrative = `You enter the ${district.name}. ${district.desc}`;
      usedInitiative = false;
      break;
    }

    // ── Accept quest ──────────────────────────────────────────────────────────
    case 'accept_quest': {
      const aqAction = action as { type: 'accept_quest'; questId: string };
      const questDef = context.campaign?.quests?.find(q => q.id === aqAction.questId);
      if (!questDef) { narrative = 'Unknown quest.'; break; }

      const existingProgress = (st.quest_progress ?? []).find(qp => qp.questId === aqAction.questId);
      if (existingProgress) {
        narrative = `You have already accepted "${questDef.title}".`;
        break;
      }

      st = {
        ...st,
        quest_progress: [
          ...(st.quest_progress ?? []),
          { questId: aqAction.questId, status: 'active', completedSteps: [] },
        ],
      };
      narrative = `Quest accepted: "${questDef.title}" — ${questDef.desc}`;
      usedInitiative = false;
      break;
    }

    // ── Complete quest (manual trigger) ──────────────────────────────────────
    case 'complete_quest': {
      const cqAction = action as { type: 'complete_quest'; questId: string };
      const cqDef    = context.campaign?.quests?.find(q => q.id === cqAction.questId);
      if (!cqDef) { narrative = 'Unknown quest.'; break; }

      const cqProgress = (st.quest_progress ?? []).find(qp => qp.questId === cqAction.questId);
      if (!cqProgress || cqProgress.status !== 'active') {
        narrative = `Quest "${cqDef.title}" is not active.`;
        break;
      }

      // Check all steps are done
      const allStepsDone = cqDef.steps.every(s => cqProgress.completedSteps.includes(s.id));
      if (!allStepsDone) {
        const remaining = cqDef.steps.filter(s => !cqProgress.completedSteps.includes(s.id));
        narrative = `Quest "${cqDef.title}" is not yet complete. Remaining: ${remaining.map(s => s.desc).join('; ')}`;
        break;
      }

      // Apply rewards
      const rewardLines: string[] = [];
      for (const reward of cqDef.rewards) {
        if (reward.type === 'give_item') {
          const item = context.lootTable.find(l => l.id === reward.itemId);
          if (item) {
            char.inventory = [...char.inventory, { instance_id: randomUUID(), ...item }];
            rewardLines.push(`received ${item.name}`);
          }
        } else if (reward.type === 'give_gold') {
          char.gold = (char.gold ?? 0) + reward.amount;
          rewardLines.push(`${reward.amount} gold`);
        } else if (reward.type === 'modify_hp') {
          char.hp = Math.min(char.max_hp, char.hp + reward.amount);
        } else if (reward.type === 'set_faction_rep') {
          st = {
            ...st,
            faction_rep: {
              ...(st.faction_rep ?? {}),
              [reward.factionId]: ((st.faction_rep ?? {})[reward.factionId] ?? 0) + reward.delta,
            },
          };
          rewardLines.push(`+${reward.delta} rep with faction`);
        }
      }

      st = {
        ...st,
        quest_progress: (st.quest_progress ?? []).map(qp =>
          qp.questId === cqAction.questId ? { ...qp, status: 'completed' } : qp,
        ),
        faction_rep: st.faction_rep,
      };

      const rewardStr = rewardLines.length ? ` Rewards: ${rewardLines.join(', ')}.` : '';
      narrative = `Quest complete: "${cqDef.title}".${rewardStr}`;
      usedInitiative = false;
      break;
    }

    // ── Dash ──────────────────────────────────────────────────────────────────
    case 'dash': {
      if (!st.combat_active)            { narrative = 'Dash is a combat action.'; break; }
      if (char.turn_actions.action_used) { narrative = 'You have already used your action this turn.'; break; }
      const dashSpeed = char.speed ?? DEFAULT_SPEED_FEET;
      char.turn_actions = { ...char.turn_actions, action_used: true };
      // movement_used tracking: reduce remaining movement cap by speed (adds a full extra speed worth)
      st = { ...st, movement_used: { ...(st.movement_used ?? {}), [char.id]: Math.max(0, (st.movement_used?.[char.id] ?? 0) - dashSpeed) } };
      narrative = `${char.name} Dashes — gaining an extra ${dashSpeed} ft of movement this turn.`;
      break;
    }

    // ── Help ──────────────────────────────────────────────────────────────────
    case 'help': {
      if (!st.combat_active)            { narrative = 'Help is a combat action.'; break; }
      if (char.turn_actions.action_used) { narrative = 'You have already used your action this turn.'; break; }
      const helpAction = action as { type: 'help'; targetId: string };
      const helpTarget = st.characters.find(c => c.id === helpAction.targetId && !c.dead);
      if (!helpTarget) { narrative = 'Target not found.'; break; }
      char.turn_actions = { ...char.turn_actions, action_used: true };
      st = { ...st, help_target_id: helpAction.targetId };
      narrative = `${char.name} helps ${helpTarget.name} — they have advantage on their next attack roll this turn.`;
      usedInitiative = true;
      break;
    }

    // ── Ready ─────────────────────────────────────────────────────────────────
    case 'ready': {
      if (!st.combat_active)            { narrative = 'Ready is a combat action.'; break; }
      if (char.turn_actions.action_used) { narrative = 'You have already used your action this turn.'; break; }
      const readyAction = action as { type: 'ready'; trigger: string; action: StructuredAction };
      char.turn_actions = { ...char.turn_actions, action_used: true, readied_action: { trigger: readyAction.trigger, action: readyAction.action } };
      narrative = `${char.name} readies an action: "${readyAction.trigger}". Use 'Trigger readied action' when the trigger occurs.`;
      usedInitiative = true;
      break;
    }

    // ── Use Reaction (trigger readied action) ─────────────────────────────────
    case 'use_reaction': {
      if (char.turn_actions.reaction_used) { narrative = 'You have already used your reaction this turn.'; break; }
      const readied = char.turn_actions.readied_action;
      if (!readied) { narrative = 'You have no readied action.'; break; }
      char.turn_actions = { ...char.turn_actions, reaction_used: true, readied_action: undefined };
      narrative = `${char.name} triggers their readied action! `;
      // Recursively resolve the stored action
      const reactionResult = await takeAction({ action: readied.action, history: [], state: { ...st, characters: st.characters.map((c, i) => i === safeIdx ? char : c) }, seed, context });
      narrative += reactionResult.narrative;
      st = reactionResult.newState;
      char = st.characters.find(c => c.id === char.id) ?? char;
      break;
    }

    // ── Select subclass ───────────────────────────────────────────────────────
    case 'select_subclass': {
      const scAction = action as { type: 'select_subclass'; subclass: string };
      if (char.subclass) { narrative = `You have already chosen the ${char.subclass} subclass.`; break; }
      char.subclass = scAction.subclass;
      narrative = `${char.name} follows the path of the ${scAction.subclass}!`;
      break;
    }

    // ── Prepare spells ────────────────────────────────────────────────────────
    case 'prepare_spells': {
      if (st.combat_active) { narrative = 'You cannot prepare spells during combat.'; break; }
      const prepAction = action as { type: 'prepare_spells'; spellIds: string[] };
      const castingAbilityPrep = (context.spellcastingAbility?.[char.character_class] ?? context.classPrimaryStats[char.character_class] ?? 'int') as AbilityKey;
      const castingScorePrep   = char[castingAbilityPrep] ?? 10;
      const maxPrepared = char.level + Math.max(0, Math.floor((castingScorePrep - 10) / 2));
      if (prepAction.spellIds.length > maxPrepared) {
        narrative = `You can prepare at most ${maxPrepared} spells (your level + spellcasting modifier). You tried to prepare ${prepAction.spellIds.length}.`;
        break;
      }
      char.prepared_spells = prepAction.spellIds;
      const spellNames = prepAction.spellIds.map(id => context.spellTable?.[id]?.name ?? id).join(', ');
      narrative = `${char.name} prepares their spells for the day: ${spellNames || '(none)'}.`;
      break;
    }

    case 'examine':
    default: {
      narrative = buildArrivalNarrative(roomId, st, seed, context);
      if (st.combat_active) narrative += ` You are in combat!`;
      if (char.conditions.length > 0) narrative += ` [Conditions: ${char.conditions.join(', ')}]`;
      break;
    }
  }

  // ── Write char back into state ─────────────────────────────────────────────
  commitChar();

  // ── Auto-advance initiative when action is used and no bonus choices remain ─
  // When class features add bonus-action choices (requiresBonusAction: true),
  // this block will stay false and the player gets another pick before advancing.
  if (st.combat_active && !usedInitiative && st.characters[safeIdx].turn_actions.action_used) {
    const hasBonusChoices = generateChoices(st, seed, context).some(c => c.requiresBonusAction);
    if (!hasBonusChoices) usedInitiative = true;
  }

  // ── Advance initiative / active character ──────────────────────────────────
  if (usedInitiative && st.combat_active && st.initiative_order.length > 0) {
    // Advance from current player's initiative position
    const orderLen   = st.initiative_order.length;
    const currentIdx = st.initiative_idx ?? 0;
    let   advIdx     = (currentIdx + 1) % orderLen;
    let   roundWrapped = advIdx === 0;

    // Auto-resolve consecutive enemy turns
    while (st.combat_active && st.initiative_order[advIdx]?.is_enemy) {
      const eEntry = st.initiative_order[advIdx];
      const rm     = seed.enemies?.[eEntry.id];
      if (rm && !st.enemies_killed.includes(eEntry.id)) {
        // Target: the character who just acted
        const targetCharIdx = st.characters.findIndex(c => c.id === char.id);
        if (targetCharIdx >= 0) {
          let target = st.characters[targetCharIdx];
          if (!target.dead && target.hp > 0) {
            const attackCount = rm.multiattack ?? 1;
            narrative += ` [${rm.name}'s turn]`;
            for (let mi = 0; mi < attackCount && target.hp > 0; mi++) {
              const atkResult = applyEnemyAttackNarrative(rm, target, context);
              target = { ...target, hp: Math.max(0, target.hp - atkResult.hpLost), conditions: atkResult.newConditions, condition_durations: atkResult.newDurations };
              const concAtk = checkConcentration(target, st, atkResult.hpLost);
              target = concAtk.char; st = concAtk.st;
              narrative += ` ${atkResult.narrative}${concAtk.note}`;
            }

            if (target.hp <= 0 && !target.dead) {
              const { narrative: dsNarr, newChar: newTarget, died, endedCombat } = processDeathSave(
                { ...target, death_saves: target.death_saves ?? { successes: 0, failures: 0 } },
                rm, context, worldName
              );
              target = newTarget;
              narrative += ' ' + dsNarr;
              if (endedCombat) st = endCombatState(st);
            }
            st = { ...st, characters: st.characters.map((c, i) => i === targetCharIdx ? target : c) };
          }
        }
      }

      const prevAdvIdx = advIdx;
      advIdx = (advIdx + 1) % orderLen;
      if (advIdx === 0 && prevAdvIdx !== 0) roundWrapped = true;
      // Safety: if we've looped all the way back to the start and it's still enemy, break
      if (advIdx === currentIdx) break;
    }

    if (roundWrapped) {
      // New round: reset all characters' turn_actions and movement budgets
      st = {
        ...st,
        movement_used: {},
        characters: st.characters.map(c => ({ ...c, turn_actions: { ...FRESH_TURN } })),
      };
    }

    st.initiative_idx = advIdx;

    // Set active character to whoever's turn it is in the order;
    // reset their turn_actions and tick conditions as their new turn begins.
    const currentEntry = st.initiative_order[advIdx];
    if (currentEntry && !currentEntry.is_enemy) {
      const nextCharIdx = st.characters.findIndex(c => c.id === currentEntry.id && !c.dead);
      if (nextCharIdx >= 0) {
        // Reset movement for this character's new turn
        st = { ...st, movement_used: { ...(st.movement_used ?? {}), [currentEntry.id]: 0 } };
        const withFreshTurn = { ...st.characters[nextCharIdx], turn_actions: { ...FRESH_TURN } };
        const ticked = tickConditions(withFreshTurn);
        if (ticked.conditions.length !== st.characters[nextCharIdx].conditions.length) {
          const expired = st.characters[nextCharIdx].conditions.filter(c => !ticked.conditions.includes(c));
          narrative += ` [${ticked.name}] Condition${expired.length > 1 ? 's' : ''} cleared: ${expired.join(', ')}.`;
        }
        st = { ...st, characters: st.characters.map((c, i) => i === nextCharIdx ? ticked : c) };
        st.active_character_id = ticked.id;
      }
    }

  } else if (!usedInitiative || !st.combat_active) {
    // Non-combat or non-initiative action: round-robin over living characters
    const living = st.characters.filter(c => !c.dead);
    if (living.length > 0) {
      const idx = living.findIndex(c => c.id === char.id);
      st.active_character_id = living[(idx + 1) % living.length].id;
    }
  }

  // Run script-engine rules against the post-action state
  const { state: afterRules, extraNarrative } = await runRules(st, context, action, prevRoomId, seed);
  st = afterRules;

  // set_escape consequence signals via flag
  if (st.flags._rule_escape) {
    escaped = true;
    const { _rule_escape: _, ...restFlags } = st.flags;
    st = { ...st, flags: restFlags };
  }

  const rawNarrative = extraNarrative ? `${narrative}\n\n${extraNarrative}` : narrative;

  const activeRoom = seed.rooms.find(r => r.id === st.current_room);
  const finalNarrative = await llmProvider.enhance(rawNarrative, {
    worldName:  seed.world_name,
    charName:   char.name,
    charClass:  char.character_class,
    roomName:   activeRoom?.name ?? st.current_room,
  });

  const roomChanged = st.current_room !== state.current_room;
  st.run_log        = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative: finalNarrative }];
  st.room_log       = roomChanged ? [finalNarrative] : [...(st.room_log ?? []), finalNarrative];
  st.last_choices   = generateChoices(st, seed, context);

  const allDead = st.characters.every(c => c.dead);

  return {
    narrative: finalNarrative,
    choices: st.last_choices,
    newState: st,
    escaped,
    dead: allDead,
  };
}
