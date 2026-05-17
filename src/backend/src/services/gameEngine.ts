import { randomUUID } from 'crypto';
import {
  rollDice, abilityMod,
  FRESH_TURN,
  resolvePlayerAttack, resolveEnemyAttack, unarmedDamage,
  skillCheck, rollDeathSave, profBonus,
  ADVANTAGE_CONDITIONS, DISADV_CONDITIONS, PLAYER_ADV_CONDITIONS, ENEMY_DISADV_CONDITIONS,
  rollConditionSave, rollCritical, resolveSaveWithAdvantage, resolveMysteryConsumable, passivePerceptionDC,
  sneakAttackDice, extraAttackCount, rageDamageBonus, rageUsesMax,
  spellSaveDC, resolveSpellAttack,
} from './rulesEngine.js';
import { Engine } from 'json-rules-engine';
import type { GameState, Character, Seed, Context, Enemy, LootItem, InventoryItem, OnHitEffect, StructuredAction, GameChoice, DeathSaves, TurnActions, GameConsequence, RuleFacts, PlacedNpc, NpcAttitude, AbilityKey } from '../types.js';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function hpTier(char: Character): 'healthy' | 'hurt' | 'critical' {
  const pct = (char.hp ?? 0) / (char.max_hp || 1);
  if (pct > 0.66) return 'healthy';
  if (pct > 0.33) return 'hurt';
  return 'critical';
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
  const hasAdvantage    = char.conditions.some(c => ADVANTAGE_CONDITIONS.has(c));
  const hasDisadvantage = char.conditions.some(c => ENEMY_DISADV_CONDITIONS.has(c));
  const result          = resolveEnemyAttack(enemy, char.ac, hasAdvantage, hasDisadvantage);
  const armorItem    = char.equipped_armor ? char.inventory?.find(i => i.id === char.equipped_armor) : null;

  if (result.hit) {
    // Rage resistance: halve physical damage while raging (PHB p.48)
    const isRaging = char.conditions.includes('raging');
    const hpLost   = isRaging ? Math.ceil(result.damage / 2) : result.damage;
    const rageNote = isRaging ? ` (Rage resistance: ${result.damage}→${hpLost})` : '';

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
      characters: gs.characters.map(c => ({
        ...c,
        hit_die:             c.hit_die             ?? 8,
        hit_dice_remaining:  c.hit_dice_remaining  ?? (c.level ?? 1),
        condition_durations: c.condition_durations ?? {},
        class_resource_uses: c.class_resource_uses ?? {},
        asi_pending:         c.asi_pending         ?? false,
        exhaustion_level:    c.exhaustion_level    ?? 0,
        spell_slots_max:     c.spell_slots_max     ?? {},
        spell_slots_used:    c.spell_slots_used    ?? {},
        spells_known:        c.spells_known        ?? [],
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
    flags:               (raw.flags as Record<string, boolean | string | number>) ?? {},
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
      if (attitude !== 'hostile') {
        choices.push({ label: `Attack ${npc.name} (makes hostile)`, action: { type: 'attack_npc' } });
      }
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

  // End turn: available in combat after the character's action is used
  // (auto-advance fires when no bonus choices exist, but this allows explicit forfeiture)
  if (state.combat_active && char.turn_actions.action_used) {
    choices.push({ label: 'End turn', action: { type: 'end_turn' } });
  }
  const isImmobilized = char.conditions.some(c => ['grappled', 'restrained'].includes(c));
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

export async function takeAction({ action, history = [], state, seed, context }: {
  action:  StructuredAction;
  history: unknown[];
  state:   GameState;
  seed:    Seed;
  context: Context;
}) {
  void history;

  const prevRoomId = state.current_room;

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
    flags:              state.flags              ?? {},
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
    spell_slots_max:     char.spell_slots_max     ?? {},
    spell_slots_used:    char.spell_slots_used    ?? {},
    spells_known:        char.spells_known        ?? [],
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

  // Helper: write char back to st (does NOT advance active_character_id)
  function commitChar() {
    st = { ...st, characters: st.characters.map((c, i) => i === safeIdx ? char : c) };
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
      if (enemyAlive) {
        const opp = applyEnemyAttackNarrative(enemy, char, context);
        char.hp                  = Math.max(0, char.hp - opp.hpLost);
        char.conditions          = opp.newConditions;
        char.condition_durations = opp.newDurations;
        narrative = opp.hpLost > 0
          ? `You try to flee — the ${enemy.name} strikes as you go! ${opp.narrative} `
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
      const weaponDamage = weaponItem?.damage ?? null;
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

        const orderText = order
          .map(e => {
            const name = e.is_enemy ? enemy.name : (st.characters.find(c => c.id === e.id)?.name ?? 'Hero');
            return `${name}(${e.roll})`;
          })
          .join(' → ');
        narrative = `Combat begins! Initiative: ${orderText}. `;

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
          narrative += `The ${enemy.name} strikes first (${enemyEntry.roll})! ${preStrike.narrative} `;
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
      const rangedInMelee    = (weaponItem?.range === 'ranged');
      const conditionDisadv  = char.conditions.some(c => DISADV_CONDITIONS.has(c));
      const exhaustionDisadv = (char.exhaustion_level ?? 0) >= 3; // exhaustion 3+: disadv on attack rolls
      const conditionAdv     = char.conditions.some(c => PLAYER_ADV_CONDITIONS.has(c));
      const disadvantage     = rangedInMelee || conditionDisadv || exhaustionDisadv;
      const advantage        = conditionAdv;
      const disadvReasons    = [
        rangedInMelee    ? 'ranged in melee' : '',
        conditionDisadv  ? char.conditions.filter(c => DISADV_CONDITIONS.has(c)).join(', ') : '',
        exhaustionDisadv ? 'exhaustion' : '',
      ].filter(Boolean).join(', ');
      const disadvNote = disadvReasons ? ` (disadvantage — ${disadvReasons})` : (advantage && !disadvantage) ? ' (advantage)' : '';

      const features  = context.classFeatures?.[char.character_class] ?? [];
      const isRaging  = char.conditions.includes('raging');

      // Helper that resolves one attack roll and applies it to enemy HP / narrative.
      // Returns true if the enemy was killed (so the caller can break early).
      const resolveOneAttack = (label: string): boolean => {
        const atk = resolvePlayerAttack(
          { str: char.str, dex: char.dex, level: char.level },
          weaponDamage,
          enemy.ac,
          weaponItem?.finesse ?? false,
          disadvantage,
          advantage,
        );
        const baseHit  = weaponDamage ? atk.damage : Math.max(1, unarmedDamage(char.str));
        const atkNote  = ` (${label}d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac}${disadvNote})`;

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

        const finalDmg  = baseHit + sneakDmg + rageBonus;
        const curEnemyHp = getEnemyHp(st, roomId, seed);
        const newEnemyHp = curEnemyHp - finalDmg;

        narrative += buildCombatHitNarrative(enemy, weaponItem, finalDmg, atk.critical, char, context);
        narrative += atkNote;
        if (sneakDmg > 0) narrative += ` [Sneak Attack ${sneakAttackDice(char.level)}: +${sneakDmg}]`;
        if (rageBonus > 0) narrative += ` [Rage: +${rageBonus}]`;

        if (newEnemyHp <= 0) {
          const xpGain = enemy.xp ?? (10 + (enemy.hp || 8));
          char.xp           = (char.xp || 0) + xpGain;
          st.enemies_killed = [...st.enemies_killed, roomId];
          st.enemy_hp       = { ...st.enemy_hp, [roomId]: 0 };
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
            narrative += ' ' + context.narratives.levelUp;
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
        const extraCount = features.includes('extra_attack') ? extraAttackCount(char.level) : 0;
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
      const check      = skillCheck(char.dex, sneakDC, proficient, char.level);
      if (check.success) {
        narrative = pick(context.narratives.sneakSuccess).replace('{enemy}', enemy.name);
        narrative += ` (Stealth: ${check.roll}+${abilityMod(char.dex)}=${check.total} vs DC ${sneakDC})`;
        if (adjacent.length > 0) {
          const target = adjacent[0];
          if (st.combat_active) {
            st = endCombatState(st);
            char.conditions = [];
          }
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
        narrative = pick(context.narratives.sneakFail)
          .replace('{enemy}', enemy.name)
          .replace('{dmg}',   String(counter.hpLost));
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
      if (roomId !== context.escapeRoomId) { narrative = context.narratives.noEscapeNearby; break; }
      if (enemyAlive) { narrative = `The ${enemy.name} ${context.narratives.escapeBlocked}`; break; }
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
      const hdRemain = char.hit_dice_remaining;
      narrative = `${char.name} takes a short rest, spending a d${char.hit_die ?? 8} — ${hdHealed} HP recovered (${hdRemain} hit ${hdRemain === 1 ? 'die' : 'dice'} remaining, now ${char.hp}/${char.max_hp}).`;
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
      narrative = `The party takes a long rest. ${restLines.join('; ')}.`;
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
      const spell = context.spellTable?.[spellId];
      if (!spell) { narrative = `Unknown spell: ${spellId}.`; break; }

      // Expend a slot for non-cantrips
      if (spell.level > 0) {
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
        spellDmg  = atk.critical ? rollCritical(spell.damage ?? null) : rollDice(spell.damage ?? '1d4');
        narrative = `${char.name} casts ${spell.name}${slotNote}!${atkNote} `;
        if (atk.critical) narrative += 'Critical spell hit! ';
        narrative += `${spellDmg} ${spell.damageType ?? ''} damage!`;
      } else if (spell.savingThrow) {
        // ── Saving throw spell ─────────────────────────────────────────────
        const saveAbility    = spell.savingThrow;
        const enemyScore     = (enemy as Record<string, number>)[saveAbility] ?? 10;
        const saveFailed     = rollConditionSave(saveAbility, enemyScore, dc);
        const saveLabel      = saveAbility.toUpperCase();

        if (spell.damage) {
          const fullDmg = rollDice(spell.damage);
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
          const dur = spell.conditionDuration ?? CONDITION_DURATION[spell.condition] ?? 1;
          const newEnemyHp = getEnemyHp(st, roomId, seed) - spellDmg;
          st.enemy_hp = { ...st.enemy_hp, [roomId]: Math.max(0, newEnemyHp) };
          narrative += ` The ${enemy.name} is ${spell.condition}!`;
          // Conditions on enemies are tracked via flags (no character object for enemies)
          st = { ...st, flags: { ...st.flags, [`enemy_condition_${roomId}`]: spell.condition, [`enemy_condition_${roomId}_dur`]: dur } };
          if (newEnemyHp <= 0) {
            const xpGain = enemy.xp ?? 10;
            char.xp = (char.xp || 0) + xpGain;
            st.enemies_killed = [...st.enemies_killed, roomId];
            st.enemy_hp = { ...st.enemy_hp, [roomId]: 0 };
            st = endCombatState(st);
            narrative += ' ' + pick(context.narratives.killShot).replace('{enemy}', enemy.name).replace('{xp}', String(xpGain));
          }
          usedInitiative = true;
          break;
        }
      } else if (spell.damage && !spell.savingThrow && !spell.attackRoll) {
        // ── Auto-hit (Magic Missile style) ─────────────────────────────────
        spellDmg  = rollDice(spell.damage);
        narrative = `${char.name} casts ${spell.name}${slotNote}! Auto-hit — ${spellDmg} ${spell.damageType ?? ''} damage!`;
      }

      // Apply damage to enemy
      if (spellDmg > 0 || spellHit) {
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
            narrative += ' ' + context.narratives.levelUp;
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
      if (action.featureId === 'rage') {
        if (!features.includes('rage'))             { narrative = `${char.character_class} does not have Rage.`; break; }
        if (char.conditions.includes('raging'))     { narrative = 'You are already raging!'; break; }
        const rageUses = char.class_resource_uses?.rage_uses ?? rageUsesMax(char.level);
        if (rageUses <= 0)                          { narrative = 'No rage uses remaining. They recover on a long rest.'; break; }
        char.conditions          = [...char.conditions, 'raging'];
        char.class_resource_uses = { ...(char.class_resource_uses ?? {}), rage_uses: rageUses - 1 };
        char.turn_actions        = { ...char.turn_actions, bonus_action_used: true };
        narrative = `${char.name} RAGES! +${rageDamageBonus(char.level)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)`;
      } else {
        narrative = `Unknown class feature: ${action.featureId}.`;
      }
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
            const atkResult = applyEnemyAttackNarrative(rm, target, context);
            target = { ...target, hp: Math.max(0, target.hp - atkResult.hpLost), conditions: atkResult.newConditions, condition_durations: atkResult.newDurations };
            narrative += ` [${rm.name}'s turn] ${atkResult.narrative}`;

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
      // New round: reset all characters' turn_actions
      st = { ...st, characters: st.characters.map(c => ({ ...c, turn_actions: { ...FRESH_TURN } })) };
    }

    st.initiative_idx = advIdx;

    // Set active character to whoever's turn it is in the order;
    // reset their turn_actions and tick conditions as their new turn begins.
    const currentEntry = st.initiative_order[advIdx];
    if (currentEntry && !currentEntry.is_enemy) {
      const nextCharIdx = st.characters.findIndex(c => c.id === currentEntry.id && !c.dead);
      if (nextCharIdx >= 0) {
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

  const finalNarrative = extraNarrative ? `${narrative}\n\n${extraNarrative}` : narrative;

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
