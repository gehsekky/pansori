import { randomUUID } from 'crypto';
import {
  d, rollDice, abilityMod,
  FRESH_TURN, startCombat, endCombat,
  resolvePlayerAttack, resolveEnemyAttack, unarmedDamage,
  skillCheck, rollDeathSave, profBonus,
  ADVANTAGE_CONDITIONS, DISADV_CONDITIONS,
  rollConditionSave, resolveSaveWithAdvantage, resolveMysteryConsumable, passivePerceptionDC,
} from './rulesEngine.js';
import type { GameState, Seed, Context, Enemy, LootItem, InventoryItem, OnHitEffect, StructuredAction, GameChoice } from '../types.js';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function hpTier(state: GameState): 'healthy' | 'hurt' | 'critical' {
  const pct = (state.hp ?? 0) / (state.max_hp || 1);
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
  state: GameState,
  context: Context,
): string {
  const tier         = hpTier(state);
  const opening      = pickTiered(context.narratives.combatHit, tier).replace(/{enemy}/g, enemy.name);
  const verbPool     = context.narratives.weaponVerbs?.[weaponItem?.id ?? ''] ?? context.narratives.weaponVerbs?.['unarmed'] ?? ['connects with'];
  const verb         = pick(verbPool);
  const stylePool    = context.narratives.classStyle?.[state.character_class];
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
  player: Pick<GameState, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'level'>,
): boolean {
  return rollConditionSave(effect.ability, player[effect.ability] ?? 10, effect.dc);
}

// ─── Enemy attack helper ──────────────────────────────────────────────────────
// Resolves an enemy attack against the player. Returns { narrative, hpLost, newConditions }.
// Does NOT mutate state — caller applies hpLost and updates conditions.
function applyEnemyAttackNarrative(
  enemy: Enemy,
  player: Pick<GameState, 'ac' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'level' | 'inventory' | 'equipped_armor' | 'conditions'>,
  context: Context,
): { hpLost: number; narrative: string; newConditions: string[] } {
  const hasAdvantage = player.conditions.some(c => ADVANTAGE_CONDITIONS.has(c));
  const result       = resolveEnemyAttack(enemy, player.ac, hasAdvantage);
  const armorItem    = player.equipped_armor ? player.inventory?.find(i => i.id === player.equipped_armor) : null;

  if (result.hit) {
    let narrative = pick(context.narratives.enemyAttacks)
      .replace('{enemy}', enemy.name)
      .replace('{dmg}',   String(result.damage));
    let newConditions = [...player.conditions];

    if (enemy.onHitEffect) {
      const conditionApplied = conditionSavingThrow(enemy.onHitEffect, player);
      if (conditionApplied && !newConditions.includes(enemy.onHitEffect.condition)) {
        newConditions.push(enemy.onHitEffect.condition);
        narrative += ` You are ${enemy.onHitEffect.condition}!`;
      }
    }
    return { hpLost: result.damage, narrative, newConditions };
  }
  if (armorItem) {
    return {
      hpLost:        0,
      narrative:     pick(context.narratives.enemyDeflected)
        .replace('{enemy}', enemy.name)
        .replace('{armor}', armorItem.name),
      newConditions: [...player.conditions],
    };
  }
  return {
    hpLost:        0,
    narrative:     `The ${enemy.name} lunges — but you dodge at the last second!`,
    newConditions: [...player.conditions],
  };
}

// ─── Death save handler ───────────────────────────────────────────────────────
// Called when player HP is 0. Returns { narrative, newState, died }.
function processDeathSave(
  st: GameState,
  enemy: Enemy | null | undefined,
  context: Context,
  worldName: string,
): { narrative: string; newState: GameState; died: boolean } {
  const save     = rollDeathSave(st.death_saves);
  const newState = { ...st, death_saves: save.saves };
  let narrative  = '';

  switch (save.result) {
    case 'regain_hp':
      newState.hp          = 1;
      newState.death_saves = { successes: 0, failures: 0 };
      newState.stable      = false;
      newState.conditions  = [];
      Object.assign(newState, endCombat());
      narrative = `Death Save — Natural 20! You surge back to 1 HP, gasping but alive.`;
      return { narrative, newState, died: false };

    case 'stable':
      newState.stable = true;
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
      newState.dead = true;
      narrative = pick(context.narratives.deathLines)
        .replace('{enemy}', enemy?.name ?? 'your wounds')
        .replace(/{world}/g, worldName);
      return { narrative, newState, died: true };
  }

  // While unconscious, a living enemy delivers automatic hits → 2 death save failures
  if (enemy && !newState.dead) {
    const attackSaves = {
      successes: newState.death_saves.successes,
      failures:  Math.min(3, newState.death_saves.failures + 2),
    };
    newState.death_saves = attackSaves;
    narrative += ` The ${enemy.name} attacks your prone form — 2 death save failures (${attackSaves.failures}/3)!`;
    if (attackSaves.failures >= 3) {
      newState.dead = true;
      narrative += ' ' + pick(context.narratives.deathLines)
        .replace('{enemy}', enemy.name)
        .replace(/{world}/g, worldName);
      return { narrative, newState, died: true };
    }
  }

  return { narrative, newState, died: false };
}

// ─── Arrival narrative ────────────────────────────────────────────────────────
export function buildArrivalNarrative(targetId: string, newState: GameState, seed: Seed, context: Context): string {
  const templates  = context.narratives.roomArrival[targetId] || context.narratives.genericArrival;
  let text         = pick(templates).replace(/{world}/g, getWorldName(seed));

  const exitNames = (seed.connections[targetId] ?? [])
    .map(id => seed.rooms.find(r => r.id === id)?.name)
    .filter((n): n is string => Boolean(n))
    .join(', ');
  if (exitNames) text += ` Exits: ${exitNames}.`;

  const newEnemy   = seed.enemies?.[targetId];
  const newEnemyHp = getEnemyHp(newState, targetId, seed);
  if (newEnemy && !newState.enemies_killed.includes(targetId) && newEnemyHp > 0) {
    text += ` A ${newEnemy.name} is here — HP: ${newEnemyHp}, AC: ${newEnemy.ac}.`;
  } else if (newEnemy && newState.enemies_killed.includes(targetId)) {
    text += ' ' + pick(context.narratives.alreadyDead);
  }
  const newLoot = seed.loot?.[targetId];
  if (newLoot && !newState.loot_taken.includes(targetId)) {
    text += ` You spot a ${newLoot.name} on the ground.`;
  }
  return text;
}

// ─── Choice generation ────────────────────────────────────────────────────────
export function generateChoices(state: GameState, seed: Seed, context: Context): GameChoice[] {
  if (state.dead) return [];
  const healItems = context.lootTable.filter(i => i.heal);
  const healItem  = state.inventory?.find(i => healItems.find(h => h.id === i.id));
  if (state.hp <= 0 && !state.stable) return [{ label: 'Roll death saving throw', action: { type: 'death_save' } }];
  if (state.hp <= 0 && state.stable)  return [{ label: 'Use healing item', action: { type: 'use', itemId: healItem?.id ?? '' } }];

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
  if (state.hp < state.max_hp && healItem && (!MAX_CHOICES || choices.length < MAX_CHOICES)) {
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
  // Normalise state — handles saves created before new fields were added
  const st: GameState = {
    ...state,
    enemies_killed:  state.enemies_killed  || [],
    loot_taken:      state.loot_taken      || [],
    enemy_hp:        state.enemy_hp        || {},
    equipped_weapon: state.equipped_weapon ?? null,
    equipped_armor:  state.equipped_armor  ?? null,
    equipped_shield: state.equipped_shield ?? null,
    conditions:      state.conditions      ?? [],
    room_log:        state.room_log        ?? [],
    combat_active:   state.combat_active   ?? false,
    initiative:      state.initiative      ?? null,
    player_first:    state.player_first    ?? true,
    turn_actions:    state.turn_actions    ?? { ...FRESH_TURN },
    death_saves:     state.death_saves     ?? { successes: 0, failures: 0 },
    stable:          state.stable          ?? false,
    dead:            state.dead            ?? false,
  };

  void history;

  const worldName  = getWorldName(seed);
  const roomId     = st.current_room;
  const room       = seed.rooms.find(r => r.id === roomId);
  const enemy      = seed.enemies?.[roomId];
  const loot       = seed.loot?.[roomId];
  const enemyAlive = enemy && !st.enemies_killed.includes(roomId);
  const lootAvail  = loot  && !st.loot_taken.includes(roomId);
  const adjacent   = (seed.connections[roomId] || [])
    .map(id => seed.rooms.find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  let narrative = '';
  let newState  = { ...st };
  let escaped   = false;

  // ── Death saves override all actions when HP = 0 ───────────────────────────
  if (st.hp <= 0 && !st.dead) {
    if (st.stable) {
      if (action.type === 'use') {
        const held = st.inventory?.find(i => i.id === action.itemId);
        if (held) {
          const itemData = getItemData(held, context);
          if (itemData.heal) {
            const healed   = rollDice(itemData.heal);
            const firstIdx = st.inventory.findIndex(i => i.id === held.id);
            newState.hp        = Math.min(st.max_hp, 1 + healed);
            newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
            newState.stable    = false;
            narrative = `Barely conscious, you manage to use the ${held.name} — you recover ${healed} HP and pull yourself up (now ${newState.hp}/${newState.max_hp}).`;
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
      const { narrative: dsNarr, newState: dsState, died } = processDeathSave(
        st, enemyAlive ? enemy : null, context, worldName
      );
      narrative = dsNarr;
      newState  = dsState;
      if (died) {
        newState.run_log = [...(st.run_log || []), { action: action.type, narrative }];
        return { narrative, choices: [], newState, escaped: false, dead: true };
      }
    }
    newState.run_log = [...(st.run_log || []), { action: action.type, narrative }];
    return { narrative, choices: generateChoices(newState, seed, context), newState, escaped: false, dead: false };
  }

  // ── Reset turn actions at the start of each new round ─────────────────────
  if (st.combat_active) {
    newState.turn_actions = { ...FRESH_TURN };
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
        const opp = applyEnemyAttackNarrative(enemy, newState, context);
        newState.hp         = Math.max(0, st.hp - opp.hpLost);
        newState.conditions = opp.newConditions;
        narrative = opp.hpLost > 0
          ? `You try to flee — the ${enemy.name} strikes as you go! ${opp.narrative} `
          : `You dodge past the ${enemy.name} in a desperate sprint! `;
        if (newState.hp <= 0) {
          const { narrative: dsNarr, newState: dsState, died } = processDeathSave(
            { ...newState, death_saves: { successes: 0, failures: 0 } }, enemy, context, worldName
          );
          Object.assign(newState, dsState);
          narrative += dsNarr;
          if (died) break;
        }
      }
      if (st.combat_active) { Object.assign(newState, endCombat()); newState.conditions = []; }
      newState.current_room = target.id;
      if (!newState.visited_rooms.includes(target.id)) {
        newState.visited_rooms = [...newState.visited_rooms, target.id];
      }
      narrative += buildArrivalNarrative(target.id, newState, seed, context);
      break;
    }

    case 'attack': {
      if (!enemy)      { narrative = pick(context.narratives.noEnemy);     break; }
      if (!enemyAlive) { narrative = pick(context.narratives.alreadyDead); break; }

      // Conditions that prevent acting
      if (newState.conditions.includes('paralyzed')) { narrative = `You are paralyzed and cannot act!`; break; }
      if (newState.conditions.includes('stunned'))   { narrative = `You are stunned and cannot attack!`; break; }

      const currentEnemyHp = getEnemyHp(st, roomId, seed);
      const weaponItem     = st.equipped_weapon
        ? getItemData(st.inventory?.find(i => i.instance_id === st.equipped_weapon) as InventoryItem, context)
        : null;
      const weaponDamage = weaponItem?.damage ?? null;
      const weaponLabel  = weaponItem ? `Your ${weaponItem.name}` : 'Your fists';

      // Start combat on first attack — roll initiative
      if (!st.combat_active) {
        const combatStart = startCombat(st.dex, enemy.dex);
        Object.assign(newState, combatStart);
        const initLine = `Initiative: you roll ${combatStart.initiative.player}, ${enemy.name} rolls ${combatStart.initiative.enemy}. `;

        if (!combatStart.player_first) {
          // Enemy wins initiative and strikes first
          const firstStrike = applyEnemyAttackNarrative(enemy, newState, context);
          newState.hp         = Math.max(0, st.hp - firstStrike.hpLost);
          newState.conditions = firstStrike.newConditions;
          narrative += initLine + `The ${enemy.name} moves first! ${firstStrike.narrative} `;
          if (newState.hp <= 0) {
            const { narrative: dsNarr, newState: dsState, died } = processDeathSave(
              { ...newState, death_saves: { successes: 0, failures: 0 } }, enemy, context, worldName
            );
            Object.assign(newState, dsState);
            narrative += dsNarr;
            if (died) break;
          }
          narrative += `Now it's your turn — `;
        } else {
          narrative += initLine + `You have the initiative! `;
        }
      }

      // Player's attack roll — disadvantage from ranged-in-melee or conditions
      const rangedInMelee  = (weaponItem?.range === 'ranged');
      const conditionDisadv = newState.conditions.some(c => DISADV_CONDITIONS.has(c));
      const disadvantage    = rangedInMelee || conditionDisadv;
      const disadvReasons   = [
        rangedInMelee    ? 'ranged in melee' : '',
        conditionDisadv  ? newState.conditions.filter(c => DISADV_CONDITIONS.has(c)).join(', ') : '',
      ].filter(Boolean).join(', ');
      const disadvNote = disadvReasons ? ` (disadvantage — ${disadvReasons})` : '';

      const atk = resolvePlayerAttack(
        { str: newState.str, dex: newState.dex, level: newState.level },
        weaponDamage,
        enemy.ac,
        weaponItem?.finesse ?? false,
        disadvantage,
      );
      const finalDamage = weaponDamage ? atk.damage : Math.max(1, unarmedDamage(newState.str));

      if (atk.fumble) {
        narrative += `Natural 1 — a fumble! ${weaponLabel} goes completely wide. `;
        const counter = applyEnemyAttackNarrative(enemy, newState, context);
        newState.hp         = Math.max(0, newState.hp - counter.hpLost);
        newState.conditions = counter.newConditions;
        narrative += counter.narrative;
      } else if (atk.hit) {
        const newEnemyHp = currentEnemyHp - finalDamage;
        narrative += buildCombatHitNarrative(enemy, weaponItem, finalDamage, atk.critical, newState, context);
        narrative += ` (d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac}${disadvNote})`;

        if (newEnemyHp <= 0) {
          const xpGain = enemy.xp ?? (10 + (enemy.hp || 8));
          newState.xp             = (newState.xp || 0) + xpGain;
          newState.enemies_killed = [...newState.enemies_killed, roomId];
          newState.enemy_hp       = { ...newState.enemy_hp, [roomId]: 0 };
          Object.assign(newState, endCombat());
          newState.conditions = [];
          narrative += ' ' + pick(context.narratives.killShot)
            .replace('{enemy}', enemy.name)
            .replace('{xp}',    String(xpGain));
          if (newState.xp >= newState.level * 100) {
            newState.level  += 1;
            newState.max_hp += 4;
            newState.hp      = Math.min(newState.hp + 4, newState.max_hp);
            narrative += ' ' + context.narratives.levelUp;
          }
        } else {
          newState.enemy_hp = { ...newState.enemy_hp, [roomId]: newEnemyHp };
          narrative += ` The ${enemy.name} has ${newEnemyHp} HP remaining.`;
          const counter = applyEnemyAttackNarrative(enemy, newState, context);
          newState.hp         = Math.max(0, newState.hp - counter.hpLost);
          newState.conditions = counter.newConditions;
          narrative += ' ' + counter.narrative;
        }
      } else {
        narrative += pickTiered(context.narratives.combatMiss, hpTier(newState)).replace(/{enemy}/g, enemy.name);
        narrative += ` (d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac}${disadvNote})`;
        const counter = applyEnemyAttackNarrative(enemy, newState, context);
        newState.hp         = Math.max(0, newState.hp - counter.hpLost);
        newState.conditions = counter.newConditions;
        narrative += ' ' + counter.narrative;
      }

      if (newState.hp <= 0 && !newState.dead) {
        const stillAlive = !newState.enemies_killed.includes(roomId);
        const { narrative: dsNarr, newState: dsState, died } = processDeathSave(
          { ...newState, death_saves: newState.death_saves ?? { successes: 0, failures: 0 } },
          stillAlive ? enemy : null, context, worldName
        );
        Object.assign(newState, dsState);
        narrative += ' ' + dsNarr;
      }
      break;
    }

    case 'loot': {
      if (!loot)      { narrative = pick(context.narratives.noLoot);        break; }
      if (!lootAvail) { narrative = pick(context.narratives.alreadyLooted); break; }
      newState.inventory  = [...(st.inventory || []), { ...loot, instance_id: randomUUID() }];
      newState.loot_taken = [...newState.loot_taken, roomId];
      narrative = pick(context.narratives.lootPickedUp).replace(/{item}/g, loot.name);
      const hasIdentify = context.classSkills[st.character_class]?.some(s => ['arcana', 'investigation'].includes(s)) ?? false;
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
      const held = st.inventory?.find(i => i.id === action.itemId);
      if (!held) { narrative = "You search your pack — you don't have that."; break; }
      const itemData = getItemData(held, context);
      const firstIdx = st.inventory.findIndex(i => i.id === held.id);

      if (itemData.slot === 'weapon') {
        narrative = `The ${held.name} is ready. Use "attack" to strike, or "equip" to make it your active weapon.`;
      } else if (itemData.slot === 'armor') {
        narrative = `The ${held.name} offers protection. Use "equip" to don it for a +${itemData.ac_bonus || 0} AC bonus.`;
      } else if (itemData.type === 'consumable') {
        if (itemData.heal) {
          const hasMedicine = context.classSkills[st.character_class]?.includes('medicine') ?? false;
          const healBonus   = hasMedicine ? profBonus(st.level) : 0;
          const healed      = rollDice(itemData.heal) + healBonus;
          newState.hp        = Math.min(st.max_hp, st.hp + healed);
          newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
          const bonusNote    = healBonus > 0 ? ` (+${healBonus} medicine)` : '';
          narrative = `You use the ${held.name} and recover ${healed} HP${bonusNote} (now ${newState.hp}/${newState.max_hp}).`;
        } else if (itemData.effect === 'con_advantage') {
          newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
          const { roll1, roll2, best } = resolveSaveWithAdvantage(st.con);
          narrative = `You use the ${held.name}. CON save with advantage: rolled ${roll1} and ${roll2} — keeping the ${best}. You feel steadier.`;
        } else if (itemData.effect === 'mystery') {
          newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
          const { result, value } = resolveMysteryConsumable();
          if (result === 'heal') {
            newState.hp = Math.min(st.max_hp, st.hp + value);
            narrative = `You use the ${held.name}. It tastes of regret and eucalyptus — but you feel better? +${value} HP.`;
          } else if (result === 'hurt') {
            newState.hp = Math.max(1, st.hp - value);
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
      // HP <= 0 guard above handles this when HP is actually 0; treat as examine otherwise
      narrative = buildArrivalNarrative(roomId, newState, seed, context);
      break;
    }

    case 'sneak': {
      if (!enemyAlive) { narrative = 'Nothing to sneak past. You move freely.'; break; }
      // Dexterity (Stealth) vs enemy passive Perception (10 + WIS modifier)
      const sneakDC    = passivePerceptionDC(enemy.wis ?? 10);
      const proficient = context.classSkills[st.character_class]?.includes('stealth') ?? false;
      const check      = skillCheck(st.dex, sneakDC, proficient, st.level);
      if (check.success) {
        narrative = pick(context.narratives.sneakSuccess).replace('{enemy}', enemy.name);
        narrative += ` (Stealth: ${check.roll}+${abilityMod(st.dex)}=${check.total} vs DC ${sneakDC})`;
        if (adjacent.length > 0) {
          const target = adjacent[0];
          if (st.combat_active) { Object.assign(newState, endCombat()); newState.conditions = []; }
          newState.current_room = target.id;
          if (!newState.visited_rooms.includes(target.id)) {
            newState.visited_rooms = [...newState.visited_rooms, target.id];
          }
          narrative += ' ' + buildArrivalNarrative(target.id, newState, seed, context);
        }
      } else {
        const counter = applyEnemyAttackNarrative(enemy, newState, context);
        newState.hp         = Math.max(0, st.hp - counter.hpLost);
        newState.conditions = counter.newConditions;
        narrative = pick(context.narratives.sneakFail)
          .replace('{enemy}', enemy.name)
          .replace('{dmg}',   String(counter.hpLost));
        narrative += ` (Stealth: ${check.roll}+${abilityMod(st.dex)}=${check.total} vs DC ${sneakDC})`;
        if (newState.hp <= 0) {
          const { narrative: dsNarr, newState: dsState, died } = processDeathSave(
            { ...newState, death_saves: { successes: 0, failures: 0 } }, enemy, context, worldName
          );
          Object.assign(newState, dsState);
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

    case 'examine':
    default: {
      narrative = buildArrivalNarrative(roomId, newState, seed, context);
      if (st.combat_active) narrative += ` You are in combat!`;
      if (newState.conditions.length > 0) narrative += ` [Conditions: ${newState.conditions.join(', ')}]`;
      break;
    }
  }

  const roomChanged     = newState.current_room !== st.current_room;
  newState.run_log      = [...(st.run_log || []), { action: action.type, narrative }];
  newState.room_log     = roomChanged ? [narrative] : [...(st.room_log ?? []), narrative];
  newState.last_choices = generateChoices(newState, seed, context);

  return {
    narrative,
    choices: newState.last_choices,
    newState,
    escaped,
    dead: newState.dead || false,
  };
}
