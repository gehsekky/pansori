import { randomUUID } from 'crypto';
import {
  rollDice, abilityMod,
  FRESH_TURN,
  resolvePlayerAttack, resolveEnemyAttack, unarmedDamage,
  skillCheck, rollDeathSave, profBonus,
  ADVANTAGE_CONDITIONS, DISADV_CONDITIONS,
  rollConditionSave, resolveSaveWithAdvantage, resolveMysteryConsumable, passivePerceptionDC,
} from './rulesEngine.js';
import type { GameState, Character, Seed, Context, Enemy, LootItem, InventoryItem, OnHitEffect, StructuredAction, GameChoice, DeathSaves, TurnActions } from '../types.js';

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
  effect: OnHitEffect,
  char: Pick<Character, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'level'>,
): boolean {
  return rollConditionSave(effect.ability, char[effect.ability] ?? 10, effect.dc);
}

// ─── Enemy attack helper ──────────────────────────────────────────────────────

function applyEnemyAttackNarrative(
  enemy: Enemy,
  char: Character,
  context: Context,
): { hpLost: number; narrative: string; newConditions: string[]; newDurations: Record<string, number> } {
  const hasAdvantage = char.conditions.some(c => ADVANTAGE_CONDITIONS.has(c));
  const result       = resolveEnemyAttack(enemy, char.ac, hasAdvantage);
  const armorItem    = char.equipped_armor ? char.inventory?.find(i => i.id === char.equipped_armor) : null;

  if (result.hit) {
    let narrative = pick(context.narratives.enemyAttacks)
      .replace('{enemy}', enemy.name)
      .replace('{dmg}',   String(result.damage));
    let updatedChar = { ...char };

    if (enemy.onHitEffect) {
      const conditionApplied = conditionSavingThrow(enemy.onHitEffect, char);
      if (conditionApplied) {
        updatedChar = inflictCondition(updatedChar, enemy.onHitEffect.condition);
        if (updatedChar.conditions.length > char.conditions.length) {
          narrative += ` You are ${enemy.onHitEffect.condition}!`;
        }
      }
    }
    return { hpLost: result.damage, narrative, newConditions: updatedChar.conditions, newDurations: updatedChar.condition_durations };
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

// How many rounds each on-hit condition lasts (cleared at start of victim's next turn)
const CONDITION_DURATION: Record<string, number> = {
  stunned:    1,
  paralyzed:  1,
  poisoned:   2,
  prone:      1,
  frightened: 2,
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
    characters: st.characters.map(c => ({ ...c, turn_actions: { ...FRESH_TURN } })),
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

// ─── Backward-compatibility normalizer ───────────────────────────────────────

export function normalizeState(
  raw: Record<string, unknown>,
  sessionMeta?: { character_name?: string; portrait_url?: string },
): GameState {
  // Already new format
  if (Array.isArray((raw as unknown as GameState).characters)) return raw as unknown as GameState;

  const charId = randomUUID();
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
    level:           Number(raw.level ?? 1),
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
    initiative_roll: null,
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

// ─── Choice generation ────────────────────────────────────────────────────────

export function generateChoices(state: GameState, seed: Seed, context: Context): GameChoice[] {
  const char = state.characters.find(c => c.id === state.active_character_id) ?? state.characters[0];
  if (!char) return [];

  if (char.dead) return [];

  const healItems = context.lootTable.filter(i => i.heal);
  const healItem  = char.inventory?.find(i => healItems.find(h => h.id === i.id));

  if (char.hp <= 0 && !char.stable) return [{ label: 'Roll death saving throw', action: { type: 'death_save' } }];
  if (char.hp <= 0 && char.stable)  return [{ label: 'Use healing item', action: { type: 'use', itemId: healItem?.id ?? '' } }];

  // Stunned / paralyzed: cannot take actions, bonus actions, reactions, or move
  const isIncapacitated = char.conditions.includes('stunned') || char.conditions.includes('paralyzed');
  if (isIncapacitated) {
    const cond = char.conditions.includes('stunned') ? 'STUNNED' : 'PARALYZED';
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
  if (char.hp < char.max_hp && healItem && (!MAX_CHOICES || choices.length < MAX_CHOICES)) {
    choices.push({ label: `Use ${healItem.name}`, action: { type: 'use', itemId: healItem.id } });
  }
  for (const adj of adjacent) {
    if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
    const label = enemyAlive ? `Dash past the ${enemy.name} → ${adj.name}` : `Move to ${adj.name}`;
    choices.push({ label, action: { type: 'move', roomId: adj.id } });
  }
  return MAX_CHOICES ? choices.slice(0, MAX_CHOICES) : choices;
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

  // Resolve and clone the active character
  const charIdx = state.characters.findIndex(c => c.id === state.active_character_id);
  const safeIdx = charIdx >= 0 ? charIdx : 0;
  let char: Character = { ...state.characters[safeIdx] };

  // Clone world state
  let st: GameState = {
    ...state,
    enemies_killed:   state.enemies_killed  || [],
    loot_taken:       state.loot_taken      || [],
    enemy_hp:         state.enemy_hp        || {},
    combat_active:    state.combat_active   ?? false,
    initiative_order: state.initiative_order ?? [],
    initiative_idx:   state.initiative_idx  ?? 0,
    room_log:         state.room_log        ?? [],
    flags:            state.flags           ?? {},
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

  // ── Reset character turn actions at the start of each combat round ─────────
  if (st.combat_active) {
    char.turn_actions = { ...FRESH_TURN };
  }

  switch (action.type) {

    case 'move': {
      const target = seed.rooms.find(r => r.id === action.roomId);
      if (!target || !adjacent.find(r => r.id === target.id)) {
        narrative = 'The path loops back on itself. You cannot get there from here.';
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
      const rangedInMelee   = (weaponItem?.range === 'ranged');
      const conditionDisadv = char.conditions.some(c => DISADV_CONDITIONS.has(c));
      const disadvantage    = rangedInMelee || conditionDisadv;
      const disadvReasons   = [
        rangedInMelee   ? 'ranged in melee' : '',
        conditionDisadv ? char.conditions.filter(c => DISADV_CONDITIONS.has(c)).join(', ') : '',
      ].filter(Boolean).join(', ');
      const disadvNote = disadvReasons ? ` (disadvantage — ${disadvReasons})` : '';

      const atk = resolvePlayerAttack(
        { str: char.str, dex: char.dex, level: char.level },
        weaponDamage,
        enemy.ac,
        weaponItem?.finesse ?? false,
        disadvantage,
      );
      const finalDamage = weaponDamage ? atk.damage : Math.max(1, unarmedDamage(char.str));

      if (atk.fumble) {
        narrative += `Natural 1 — a fumble! ${weaponLabel} goes completely wide. `;
        // Enemy counter-attack will auto-resolve via initiative advancement below
      } else if (atk.hit) {
        const newEnemyHp = currentEnemyHp - finalDamage;
        narrative += buildCombatHitNarrative(enemy, weaponItem, finalDamage, atk.critical, char, context);
        narrative += ` (d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac}${disadvNote})`;

        if (newEnemyHp <= 0) {
          // Enemy killed — end combat immediately
          const xpGain = enemy.xp ?? (10 + (enemy.hp || 8));
          char.xp           = (char.xp || 0) + xpGain;
          st.enemies_killed = [...st.enemies_killed, roomId];
          st.enemy_hp       = { ...st.enemy_hp, [roomId]: 0 };
          st = endCombatState(st);
          char.conditions   = [];
          narrative += ' ' + pick(context.narratives.killShot)
            .replace('{enemy}', enemy.name)
            .replace('{xp}',    String(xpGain));
          if (char.xp >= char.level * 100) {
            char.level  += 1;
            char.max_hp += 4;
            char.hp      = Math.min(char.hp + 4, char.max_hp);
            narrative += ' ' + context.narratives.levelUp;
          }
          // No enemy turns to resolve — combat is over
          usedInitiative = true;
          break;
        } else {
          st.enemy_hp = { ...st.enemy_hp, [roomId]: newEnemyHp };
          narrative += ` The ${enemy.name} has ${newEnemyHp} HP remaining.`;
          // Enemy counter-attack will auto-resolve via initiative advancement below
        }
      } else {
        // Miss
        narrative += pickTiered(context.narratives.combatMiss, hpTier(char)).replace(/{enemy}/g, enemy.name);
        narrative += ` (d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac}${disadvNote})`;
        // Enemy counter-attack will auto-resolve via initiative advancement below
      }

      usedInitiative = true;
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
          char.hp        = Math.min(char.max_hp, char.hp + healed);
          char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
          const bonusNote = healBonus > 0 ? ` (+${healBonus} medicine)` : '';
          narrative = `You use the ${held.name} and recover ${healed} HP${bonusNote} (now ${char.hp}/${char.max_hp}).`;
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
      usedInitiative = true;
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
    // tick their conditions now that their new turn is starting
    const currentEntry = st.initiative_order[advIdx];
    if (currentEntry && !currentEntry.is_enemy) {
      const nextCharIdx = st.characters.findIndex(c => c.id === currentEntry.id && !c.dead);
      if (nextCharIdx >= 0) {
        const ticked = tickConditions(st.characters[nextCharIdx]);
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

  const roomChanged = st.current_room !== state.current_room;
  st.run_log        = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
  st.room_log       = roomChanged ? [narrative] : [...(st.room_log ?? []), narrative];
  st.last_choices   = generateChoices(st, seed, context);

  const allDead = st.characters.every(c => c.dead);

  return {
    narrative,
    choices: st.last_choices,
    newState: st,
    escaped,
    dead: allDead,
  };
}
