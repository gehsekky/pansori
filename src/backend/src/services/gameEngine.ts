import {
  d, rollDice, abilityMod,
  FRESH_TURN, startCombat, endCombat,
  resolvePlayerAttack, resolveEnemyAttack, unarmedDamage,
  canEquipWeapon, canDonArmor, computeAcAfterArmorChange,
  skillCheck, rollDeathSave,
} from './rulesEngine.js';
import type { GameState, Seed, Context, Enemy, LootItem, InventoryItem } from '../types.js';

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

// ─── Enemy attack helper ──────────────────────────────────────────────────────
// Resolves an enemy attack against the player. Returns { narrative, hpLost }.
// Does NOT mutate state — caller applies hpLost.
function applyEnemyAttackNarrative(
  enemy: Enemy,
  playerAC: number,
  inventory: InventoryItem[] | undefined,
  equippedArmorId: string | null,
  context: Context,
): { hpLost: number; narrative: string } {
  const result    = resolveEnemyAttack(enemy, playerAC);
  const armorItem = equippedArmorId ? inventory?.find(i => i.id === equippedArmorId) : null;

  if (result.hit) {
    return {
      hpLost:    result.damage,
      narrative: pick(context.narratives.enemyAttacks)
        .replace('{enemy}', enemy.name)
        .replace('{dmg}',   String(result.damage)),
    };
  }
  if (armorItem) {
    return {
      hpLost:    0,
      narrative: pick(context.narratives.enemyDeflected)
        .replace('{enemy}', enemy.name)
        .replace('{armor}', armorItem.name),
    };
  }
  return { hpLost: 0, narrative: `The ${enemy.name} lunges — but you dodge at the last second!` };
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
function buildArrivalNarrative(targetId: string, newState: GameState, seed: Seed, context: Context): string {
  const templates  = context.narratives.roomArrival[targetId] || context.narratives.genericArrival;
  let text         = pick(templates).replace(/{world}/g, getWorldName(seed));
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
export function generateChoices(state: GameState, seed: Seed, context: Context): string[] {
  if (state.dead) return [];
  if (state.hp <= 0 && !state.stable) return ['Roll death saving throw'];
  if (state.hp <= 0 && state.stable)  return ['Use healing item'];
  const choices: string[] = [];
  const roomId     = state.current_room;
  const enemy      = seed.enemies?.[roomId];
  const loot       = seed.loot?.[roomId];
  const enemyAlive = enemy && !state.enemies_killed?.includes(roomId);
  const lootAvail  = loot  && !state.loot_taken?.includes(roomId);
  const adjacent   = (seed.connections[roomId] || [])
    .map(id => seed.rooms.find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  choices.push('Examine surroundings');

  if (state.current_room === context.escapeRoomId && !enemyAlive) {
    choices.push(context.escapeChoiceText);
  }
  if (enemyAlive) {
    choices.push(`Attack the ${enemy.name}`);
    const sneakDest = adjacent[0];
    choices.push(`Try to sneak past the ${enemy.name}${sneakDest ? ` → ${sneakDest.name}` : ''}`);
  }
  if (lootAvail) {
    choices.push(`Pick up the ${loot.name}`);
  }
  if (state.hp < state.max_hp) {
    const healItems = context.lootTable.filter(i => i.heal);
    const healItem  = state.inventory?.find(i => healItems.find(h => h.id === i.id));
    if (healItem && (!MAX_CHOICES || choices.length < MAX_CHOICES)) {
      choices.push(`Use ${healItem.name}`);
    }
  }
  for (const adj of adjacent) {
    if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
    choices.push(enemyAlive ? `Dash past the ${enemy.name} → ${adj.name}` : `Move to ${adj.name}`);
  }
  return MAX_CHOICES ? choices.slice(0, MAX_CHOICES) : choices;
}

// ─── Intent parser ────────────────────────────────────────────────────────────
type Intent =
  | { type: 'move';   roomId: string }
  | { type: 'attack' }
  | { type: 'loot' }
  | { type: 'use';    item: string }
  | { type: 'equip';  item: string | null }
  | { type: 'sneak' }
  | { type: 'escape' }
  | { type: 'examine' };

function parseIntent(action: string, state: GameState, seed: Seed, context: Context): Intent {
  const a        = action.toLowerCase();
  const adjacent = (seed.connections[state.current_room] || [])
    .map(id => seed.rooms.find(r => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  for (const room of adjacent) {
    if (a.includes(room.name.toLowerCase()) || a.includes(room.id.replace(/_/g, ' '))) {
      return { type: 'move', roomId: room.id };
    }
  }
  if (a.match(/\b(move|go|head|enter|proceed)\b/) && adjacent.length > 0) {
    return { type: 'move', roomId: adjacent[0].id };
  }
  if (context.escapeTriggers.some(t => a.includes(t))) return { type: 'escape' };
  if (a.match(/\b(attack|fight|shoot|hit|strike|kill|blast|stab|zap|slash|swing|smite)\b/)) {
    return { type: 'attack' };
  }
  if (a.match(/\b(pick up|take|grab|loot|collect|snatch|retrieve)\b/)) {
    return { type: 'loot' };
  }
  if (a.match(/\b(equip|wield|draw|ready|wear|don)\b/)) {
    for (const entry of context.lootTable) {
      if (!entry.slot) continue;
      if (entry.aliases.some(alias => a.includes(alias))) {
        return { type: 'equip', item: entry.id };
      }
    }
    return { type: 'equip', item: null };
  }
  for (const entry of context.lootTable) {
    if (entry.aliases.some(alias => a.includes(alias))) {
      if (a.match(/\b(use|drink|eat|read|open|apply|consume)\b/) || entry.type === 'consumable') {
        return { type: 'use', item: entry.id };
      }
    }
  }
  if (a.match(/\b(sneak|stealth|hide|slip|creep|past)\b/)) return { type: 'sneak' };
  return { type: 'examine' };
}

// ─── Main action handler ──────────────────────────────────────────────────────
export async function takeAction({ action, history = [], state, seed, context }: {
  action:  string;
  history: string[];
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
    combat_active:   state.combat_active   ?? false,
    initiative:      state.initiative      ?? null,
    player_first:    state.player_first    ?? true,
    turn_actions:    state.turn_actions    ?? { ...FRESH_TURN },
    death_saves:     state.death_saves     ?? { successes: 0, failures: 0 },
    stable:          state.stable          ?? false,
    dead:            state.dead            ?? false,
  };

  void history; // reserved for future LLM narrative use

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
      const intent = parseIntent(action, st, seed, context);
      if (intent.type === 'use') {
        const held = st.inventory?.find(i => i.id === intent.item);
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
        newState.run_log = [...(st.run_log || []).slice(-50), { action, narrative }];
        return { narrative, choices: [], newState, escaped: false, dead: true };
      }
    }
    newState.run_log = [...(st.run_log || []).slice(-50), { action, narrative }];
    return { narrative, choices: generateChoices(newState, seed, context), newState, escaped: false, dead: false };
  }

  // ── Reset turn actions at the start of each new round ─────────────────────
  if (st.combat_active) {
    newState.turn_actions = { ...FRESH_TURN };
  }

  const intent = parseIntent(action, st, seed, context);

  switch (intent.type) {

    case 'move': {
      const target = seed.rooms.find(r => r.id === intent.roomId);
      if (!target || !adjacent.find(r => r.id === target.id)) {
        narrative = 'The path loops back on itself. You cannot get there from here.';
        break;
      }
      // Opportunity attack when leaving a room with a living enemy (5e PHB p.195)
      if (enemyAlive) {
        const opp = applyEnemyAttackNarrative(enemy, st.ac, st.inventory, st.equipped_armor, context);
        newState.hp = Math.max(0, st.hp - opp.hpLost);
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
      if (st.combat_active) Object.assign(newState, endCombat());
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

      const currentEnemyHp = getEnemyHp(st, roomId, seed);
      const weaponItem     = st.equipped_weapon
        ? getItemData(st.inventory?.find(i => i.id === st.equipped_weapon) as InventoryItem, context)
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
          const firstStrike = applyEnemyAttackNarrative(enemy, st.ac, st.inventory, st.equipped_armor, context);
          newState.hp = Math.max(0, st.hp - firstStrike.hpLost);
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

      // Player's attack roll
      const atk = resolvePlayerAttack(
        { str: newState.str, dex: newState.dex, level: newState.level },
        weaponDamage,
        enemy.ac
      );
      const finalDamage = weaponDamage ? atk.damage : Math.max(1, unarmedDamage(newState.str));

      if (atk.fumble) {
        narrative += `Natural 1 — a fumble! ${weaponLabel} goes completely wide. `;
        const counter = applyEnemyAttackNarrative(enemy, newState.ac, newState.inventory, newState.equipped_armor, context);
        newState.hp = Math.max(0, newState.hp - counter.hpLost);
        narrative += counter.narrative;
      } else if (atk.hit) {
        const newEnemyHp = currentEnemyHp - finalDamage;
        narrative += buildCombatHitNarrative(enemy, weaponItem, finalDamage, atk.critical, newState, context);
        narrative += ` (d20 ${atk.roll}+${atk.strMod} STR+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac})`;

        if (newEnemyHp <= 0) {
          const xpGain = 10 + (enemy.hp || 8);
          newState.xp             = (newState.xp || 0) + xpGain;
          newState.enemies_killed = [...newState.enemies_killed, roomId];
          newState.enemy_hp       = { ...newState.enemy_hp, [roomId]: 0 };
          Object.assign(newState, endCombat());
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
          const counter = applyEnemyAttackNarrative(enemy, newState.ac, newState.inventory, newState.equipped_armor, context);
          newState.hp = Math.max(0, newState.hp - counter.hpLost);
          narrative += ' ' + counter.narrative;
        }
      } else {
        narrative += pickTiered(context.narratives.combatMiss, hpTier(newState)).replace(/{enemy}/g, enemy.name);
        narrative += ` (d20 ${atk.roll}+${atk.strMod} STR+${atk.prof} prof = ${atk.total} vs AC ${enemy.ac})`;
        const counter = applyEnemyAttackNarrative(enemy, newState.ac, newState.inventory, newState.equipped_armor, context);
        newState.hp = Math.max(0, newState.hp - counter.hpLost);
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
      newState.inventory  = [...(st.inventory || []), { ...loot }];
      newState.loot_taken = [...newState.loot_taken, roomId];
      narrative = pick(context.narratives.lootPickedUp).replace(/{item}/g, loot.name);
      narrative += ` [${loot.name}: ${loot.desc}]`;
      break;
    }

    case 'use': {
      const held = st.inventory?.find(i => i.id === intent.item);
      if (!held) { narrative = "You search your pack — you don't have that."; break; }
      const itemData = getItemData(held, context);
      const firstIdx = st.inventory.findIndex(i => i.id === held.id);

      if (itemData.slot === 'weapon') {
        narrative = `The ${held.name} is ready. Use "attack" to strike, or "equip" to make it your active weapon.`;
      } else if (itemData.slot === 'armor') {
        narrative = `The ${held.name} offers protection. Use "equip" to don it for a +${itemData.ac_bonus || 0} AC bonus.`;
      } else if (itemData.type === 'consumable') {
        if (itemData.heal) {
          const healed = rollDice(itemData.heal);
          newState.hp        = Math.min(st.max_hp, st.hp + healed);
          newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
          narrative = `You use the ${held.name} and recover ${healed} HP (now ${newState.hp}/${newState.max_hp}).`;
        } else if (itemData.effect === 'con_advantage') {
          newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
          const roll1 = d(20) + abilityMod(st.con);
          const roll2 = d(20) + abilityMod(st.con);
          const best  = Math.max(roll1, roll2);
          narrative = `You use the ${held.name}. CON save with advantage: rolled ${roll1} and ${roll2} — keeping the ${best}. You feel steadier.`;
        } else if (itemData.effect === 'mystery') {
          newState.inventory = st.inventory.filter((_, i) => i !== firstIdx);
          const eff = d(3);
          if (eff === 1) {
            const gained = rollDice('1d4');
            newState.hp = Math.min(st.max_hp, st.hp + gained);
            narrative = `You use the ${held.name}. It tastes of regret and eucalyptus — but you feel better? +${gained} HP.`;
          } else if (eff === 2) {
            const lost = rollDice('1d4');
            newState.hp = Math.max(1, st.hp - lost);
            narrative = `You use the ${held.name}. Immediate. Searing. Regret. -${lost} HP.`;
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

    case 'equip': {
      const itemId = intent.item;
      if (!itemId) { narrative = 'Equip what? Specify a weapon or piece of armour.'; break; }
      const inInventory = st.inventory?.find(i => i.id === itemId);
      if (!inInventory) { narrative = `You don't have that.`; break; }
      const itemData = getItemData(inInventory, context);
      if (!itemData.slot) { narrative = `The ${inInventory.name} can't be equipped.`; break; }

      if (itemData.slot === 'armor') {
        const check = canDonArmor(st.combat_active, itemId);
        if (!check.allowed) { narrative = check.reason; break; }
        newState.ac             = computeAcAfterArmorChange(st.ac, st.equipped_armor, itemId, context.lootTable);
        newState.equipped_armor = itemId;
        narrative = `You don the ${inInventory.name}. AC is now ${newState.ac}.`;
      } else {
        const check = canEquipWeapon(st.combat_active, st.turn_actions);
        if (!check.allowed) { narrative = check.reason; break; }
        newState.equipped_weapon = itemId;
        if ('cost' in check && check.cost === 'free_interaction') {
          newState.turn_actions = { ...newState.turn_actions, free_interaction_used: true };
        }
        narrative = `You ready the ${inInventory.name} (${itemData.damage || '1d4'} damage).`;
      }
      break;
    }

    case 'sneak': {
      if (!enemyAlive) { narrative = 'Nothing to sneak past. You move freely.'; break; }
      // Dexterity (Stealth) vs DC 12 (approximates enemy passive Perception of 10+1)
      const check = skillCheck(st.dex, 12, false, st.level);
      if (check.success) {
        narrative = pick(context.narratives.sneakSuccess).replace('{enemy}', enemy.name);
        narrative += ` (Stealth: ${check.roll}+${abilityMod(st.dex)}=${check.total} vs DC 12)`;
        if (adjacent.length > 0) {
          const target = adjacent[0];
          if (st.combat_active) Object.assign(newState, endCombat());
          newState.current_room = target.id;
          if (!newState.visited_rooms.includes(target.id)) {
            newState.visited_rooms = [...newState.visited_rooms, target.id];
          }
          narrative += ' ' + buildArrivalNarrative(target.id, newState, seed, context);
        }
      } else {
        const counter = applyEnemyAttackNarrative(enemy, st.ac, st.inventory, st.equipped_armor, context);
        newState.hp = Math.max(0, st.hp - counter.hpLost);
        narrative = pick(context.narratives.sneakFail)
          .replace('{enemy}', enemy.name)
          .replace('{dmg}',   String(counter.hpLost));
        narrative += ` (Stealth: ${check.roll}+${abilityMod(st.dex)}=${check.total} vs DC 12)`;
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
      const exitNames = adjacent.map(r => r.name).join(', ') || 'none visible';
      narrative = pick(context.narratives.examineTemplates)
        .replace('{room}',  room?.name || 'chamber')
        .replace('{desc}',  room?.desc || '')
        .replace('{exits}', exitNames);
      if (enemyAlive) {
        const ehp = getEnemyHp(st, roomId, seed);
        narrative += ` A ${enemy.name} is here (HP: ${ehp}, AC: ${enemy.ac}).`;
        if (st.combat_active) narrative += ` You are in combat!`;
      }
      if (lootAvail) narrative += ` You notice a ${loot.name} on the ground.`;
      break;
    }
  }

  newState.run_log      = [...(st.run_log || []).slice(-50), { action, narrative }];
  newState.last_choices = generateChoices(newState, seed, context);

  return {
    narrative,
    choices: newState.last_choices,
    newState,
    escaped,
    dead: newState.dead || false,
  };
}
