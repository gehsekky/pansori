import type { Character, InventoryItem, ItemSpell, LootItem, Spell } from '../types.js';
import { abilityMod, d, profBonus, rollDice } from './rulesEngine.js';
import { classSpellListTag, getAllClasses } from './multiclass.js';
import { ITEM_POWERS } from '../campaignData/srd/itemPowers.js';
import { clearInstance } from './equipment.js';

// SRD 5.2.1 activated magic items — wands and staffs that cast spells from
// their charges, and Spell Scrolls. "Spells Cast from Items": the spell is cast
// at its lowest level, spends no slot, and needs no components unless the item
// says otherwise (a scroll still needs Verbal and Somatic). Charges are tracked
// per inventory instance (`charges_used`), so a fresh item is always full.

// SRD Spell Scroll — the scroll's spell level sets its save DC and attack bonus.
export const SCROLL_STATS: Record<number, { dc: number; attack: number }> = {
  0: { dc: 13, attack: 5 },
  1: { dc: 13, attack: 5 },
  2: { dc: 13, attack: 5 },
  3: { dc: 15, attack: 7 },
  4: { dc: 15, attack: 7 },
  5: { dc: 17, attack: 9 },
  6: { dc: 17, attack: 9 },
  7: { dc: 18, attack: 10 },
  8: { dc: 18, attack: 10 },
  9: { dc: 19, attack: 11 },
};

const HAND_SLOTS = ['main_hand', 'off_hand'] as const;

/**
 * The spell an item casts — from the spell table, or one of the item powers
 * (spell-shaped effects that aren't spells: the Wand of Paralysis' ray).
 */
export function itemSpellFor(
  spellTable: Record<string, Spell> | undefined,
  spellId: string
): Spell | undefined {
  return spellTable?.[spellId] ?? ITEM_POWERS[spellId];
}

/** Charges left on an item instance (0 for an item without charges). */
export function chargesLeft(inv: InventoryItem, loot: LootItem): number {
  if (!loot.charges) return 0;
  return Math.max(0, loot.charges.max - (inv.charges_used ?? 0));
}

/** "While holding" — the item fills a hand slot. */
export function isHeld(char: Pick<Character, 'equipment'>, instanceId: string): boolean {
  return HAND_SLOTS.some((s) => char.equipment?.[s] === instanceId);
}

/**
 * Whether the character is in a position to use `loot`'s item spells: held (a
 * wand or staff), worn (Plate Armor of Etherealness), or merely carried
 * (`castWhileCarried`, Trident of Fish Command).
 */
export function canUseItem(char: Character, inv: InventoryItem, loot: LootItem): boolean {
  if (loot.castWhileCarried) return true;
  if (loot.slot === 'weapon' || loot.slot === 'off_hand' || !loot.slot) {
    return isHeld(char, inv.instance_id);
  }
  return Object.values(char.equipment ?? {}).includes(inv.instance_id);
}

const dailyKey = (spellId: string) => `spell:${spellId}`;

/** True when the instance's once-per-dawn property `key` is spent. */
export function dailyUsed(inv: InventoryItem, key: string): boolean {
  return (inv.powers_used ?? []).includes(key);
}

/** Long Rests until the spent property `key` recharges (1 = the next one). */
export function restsLeft(inv: InventoryItem, key: string): number {
  return inv.recharge_rests?.[key] ?? 1;
}

/** True when any of the character's classes casts spells. */
export function isSpellcaster(char: Character): boolean {
  return getAllClasses(char).some((c) => !!classSpellListTag(c));
}

/**
 * SRD "Requires Attunement by a …" — null when `char` may attune to `loot`,
 * else the reason it can't.
 */
export function attuneBlocker(char: Character, loot: LootItem): string | null {
  const by = loot.attuneBy;
  if (!by?.length) return null;
  const classes = getAllClasses(char);
  const ok = by.some((b) => (b === 'spellcaster' ? isSpellcaster(char) : classes.includes(b)));
  if (ok) return null;
  const who = by.map((b) => (b === 'spellcaster' ? 'a spellcaster' : b)).join(' or ');
  return `Only ${who} can attune to the ${loot.name}.`;
}

/** SRD Spell Scroll — the spell is on one of your class spell lists. */
export function onSpellList(char: Character, spell: Spell): boolean {
  const lists = getAllClasses(char)
    .map((c) => classSpellListTag(c))
    .filter(Boolean);
  return (spell.spellList ?? []).some((l) => lists.includes(l));
}

/** The highest spell level the character can normally cast (0 = cantrips only). */
export function maxCastableLevel(char: Character): number {
  const max = char.spell_slots_max ?? {};
  return Math.max(
    0,
    ...Object.keys(max)
      .map(Number)
      .filter((l) => (max[l] ?? 0) > 0)
  );
}

/** Charge cost of casting `is` at `level`, or null when that level isn't allowed. */
export function itemSpellCost(is: ItemSpell, spell: Spell, level: number): number | null {
  const base = is.level ?? spell.level;
  const top = is.maxLevel ?? base;
  if (level < base || level > top) return null;
  return is.charges + (level - base);
}

export interface ItemCastPlan {
  inv: InventoryItem;
  loot: LootItem;
  is?: ItemSpell;
  scroll: boolean;
  cost: number;
  dc?: number;
  attackBonus?: number;
  // SRD Ring of Spell Storing / Ioun Stone of Reserve — the held spell cast.
  stored?: NonNullable<InventoryItem['stored_spells']>[number];
}

/** Slot levels the instance's stored spells take up. */
export function storedLevels(inv: InventoryItem): number {
  return (inv.stored_spells ?? []).reduce((n, s) => n + s.level, 0);
}

/** Why the character can't use an `ItemSpell.requires` item, or null. */
function requiresBlocker(char: Character, is: ItemSpell, loot: LootItem): string | null {
  const r = is.requires;
  if (!r) return null;
  if ((char.spell_slots_max?.[r.slotLevel] ?? 0) < r.slots) {
    return `Only a spellcaster with ${r.slots} level ${r.slotLevel} spell slots can use the ${loot.name}.`;
  }
  if ((char.gold ?? 0) < r.gold) return `The ${loot.name}'s work needs ${r.gold} GP of supplies.`;
  return null;
}

/**
 * Validate casting `spell` at `level` from the item instance `instanceId`.
 * Returns the plan, or `{ error }` with the reason it can't be cast.
 */
export function planItemCast(
  char: Character,
  instanceId: string,
  spell: Spell,
  level: number,
  lootTable: LootItem[]
): ItemCastPlan | { error: string } {
  const inv = char.inventory?.find((i) => i.instance_id === instanceId);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  if (!inv || !loot) return { error: "You don't have that item." };
  if (loot.requiresAttunement && !(char.attuned_items ?? []).includes(instanceId)) {
    return { error: `You must be attuned to the ${loot.name} to use it.` };
  }
  if (loot.spellScroll) {
    if (loot.spellScroll !== spell.id) return { error: `The ${loot.name} holds another spell.` };
    if (!onSpellList(char, spell)) {
      return {
        error: `The ${loot.name} is unintelligible to you — ${spell.name} isn't on your spell list.`,
      };
    }
    if (level !== spell.level) return { error: `A scroll casts its spell at its own level.` };
    const s = SCROLL_STATS[spell.level] ?? SCROLL_STATS[9];
    return { inv, loot, scroll: true, cost: 0, dc: s.dc, attackBonus: s.attack };
  }
  if (loot.spellStore) {
    if (!canUseItem(char, inv, loot)) return { error: `You must be wearing the ${loot.name}.` };
    const held = (inv.stored_spells ?? []).find((x) => x.spellId === spell.id && x.level === level);
    if (!held) return { error: `The ${loot.name} holds no level ${level} ${spell.name}.` };
    return {
      inv,
      loot,
      scroll: false,
      cost: 0,
      dc: held.dc,
      attackBonus: held.attack,
      stored: held,
    };
  }
  const is = loot.itemSpells?.find((x) => x.spellId === spell.id);
  if (!is) return { error: `The ${loot.name} can't cast ${spell.name}.` };
  const blocked = requiresBlocker(char, is, loot);
  if (blocked) return { error: blocked };
  if (is.uses && (inv.spell_uses?.[is.spellId] ?? 0) >= is.uses) {
    return { error: `The ${loot.name} has nothing left to cast ${spell.name} with.` };
  }
  if (!canUseItem(char, inv, loot)) {
    const how = loot.slot === 'weapon' || loot.slot === 'off_hand' ? 'holding' : 'wearing';
    return { error: `You must be ${how} the ${loot.name}.` };
  }
  if ((is.daily || is.rechargeDays) && dailyUsed(inv, dailyKey(is.spellId))) {
    return {
      error: is.rechargeDays
        ? `The ${loot.name} is still recovering — ${restsLeft(inv, dailyKey(is.spellId))} more Long Rest${restsLeft(inv, dailyKey(is.spellId)) === 1 ? '' : 's'} before it can be used again.`
        : `The ${loot.name}'s ${spell.name} can't be used again until dawn.`,
    };
  }
  const cost = itemSpellCost(is, spell, level);
  if (cost === null)
    return { error: `The ${loot.name} can't cast ${spell.name} at level ${level}.` };
  const left = chargesLeft(inv, loot);
  if (cost > left) {
    return {
      error: `The ${loot.name} has ${left} charge${left === 1 ? '' : 's'} — ${spell.name} needs ${cost}.`,
    };
  }
  return {
    inv,
    loot,
    is,
    scroll: false,
    cost,
    dc: is.dc ?? loot.itemSpellDc,
    // SRD Iron Bands — Dexterity modifier + Proficiency Bonus.
    attackBonus: is.attack === 'dex' ? abilityMod(char.dex) + profBonus(char.level) : is.attack,
  };
}

/**
 * Spend the plan's charges (or the scroll itself). Mutates `char`. Expending a
 * destroy-on-last item's final charge rolls a d20 — on a 1 it's destroyed.
 * Returns a narration suffix.
 */
export function spendItemCast(char: Character, plan: ItemCastPlan, lootTable: LootItem[]): string {
  const drop = () => {
    char.inventory = char.inventory.filter((i) => i.instance_id !== plan.inv.instance_id);
    char.equipment = clearInstance(char.equipment ?? {}, plan.inv.instance_id);
    char.attuned_items = (char.attuned_items ?? []).filter((id) => id !== plan.inv.instance_id);
  };
  if (plan.scroll) {
    drop();
    return ' The scroll crumbles to dust.';
  }
  if (plan.stored) {
    const gone = plan.stored;
    char.inventory = char.inventory.map((i) => {
      if (i.instance_id !== plan.inv.instance_id) return i;
      const left = [...(i.stored_spells ?? [])];
      const k = left.findIndex((x) => x.spellId === gone.spellId && x.level === gone.level);
      if (k >= 0) left.splice(k, 1);
      return { ...i, stored_spells: left.length ? left : undefined };
    });
    return ` The spell leaves the ${plan.loot.name}.`;
  }
  if (plan.is?.daily || plan.is?.rechargeDays) {
    markDaily(char, plan.inv.instance_id, dailyKey(plan.is.spellId), plan.is.rechargeDays);
  }
  let note = '';
  if (plan.is?.uses) {
    const id = plan.is.spellId;
    char.inventory = char.inventory.map((i) =>
      i.instance_id === plan.inv.instance_id
        ? { ...i, spell_uses: { ...(i.spell_uses ?? {}), [id]: (i.spell_uses?.[id] ?? 0) + 1 } }
        : i
    );
    const left = plan.is.uses - ((plan.inv.spell_uses?.[id] ?? 0) + 1);
    note = ` (${left} left for it)`;
  }
  if (plan.is?.requires) {
    char.gold = (char.gold ?? 0) - plan.is.requires.gold;
    note += ` ${plan.is.requires.gold} GP of supplies are spent.`;
  }
  return note + spendCharges(char, plan.inv.instance_id, plan.cost, lootTable);
}

/** Mark the instance's once-per-dawn property `key` as spent. Mutates `char`. */
export function markDaily(
  char: Character,
  instanceId: string,
  key: string,
  rechargeDays = 1
): void {
  char.inventory = char.inventory.map((i) =>
    i.instance_id === instanceId
      ? {
          ...i,
          powers_used: [...(i.powers_used ?? []), key],
          ...(rechargeDays > 1
            ? { recharge_rests: { ...(i.recharge_rests ?? {}), [key]: rechargeDays } }
            : {}),
        }
      : i
  );
}

/**
 * One Long Rest (a day) passes for the instance's spent properties: each
 * comes back unless its `recharge_rests` countdown still has days to run.
 */
function restPowers(inv: InventoryItem): InventoryItem {
  if (!inv.powers_used && !inv.primed) return inv;
  const waits: Record<string, number> = {};
  for (const [k, n] of Object.entries(inv.recharge_rests ?? {})) if (n > 1) waits[k] = n - 1;
  const still = (inv.powers_used ?? []).filter((k) => waits[k] !== undefined);
  return {
    ...inv,
    powers_used: still.length ? still : undefined,
    recharge_rests: Object.keys(waits).length ? waits : undefined,
    primed: undefined,
  };
}

/**
 * Spend `cost` charges from the instance. Mutates `char`. Expending a
 * destroy-on-last item's final charge rolls a d20 — on a 1 it's destroyed, or
 * becomes its `charges.becomes` item (Staff of Power → a +2 Quarterstaff).
 * Returns a narration suffix.
 */
export function spendCharges(
  char: Character,
  instanceId: string,
  cost: number,
  lootTable: LootItem[]
): string {
  const inv = char.inventory.find((i) => i.instance_id === instanceId);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  if (!inv || !loot?.charges || cost <= 0) return '';
  const used = Math.min(loot.charges.max, (inv.charges_used ?? 0) + cost);
  char.inventory = char.inventory.map((i) =>
    i.instance_id === instanceId ? { ...i, charges_used: used } : i
  );
  const left = loot.charges.max - used;
  if (left === 0 && loot.charges.consumable) {
    char.inventory = char.inventory.filter((i) => i.instance_id !== instanceId);
    char.equipment = clearInstance(char.equipment ?? {}, instanceId);
    char.attuned_items = (char.attuned_items ?? []).filter((id) => id !== instanceId);
    return ` That was the last of the ${loot.name}.`;
  }
  if (left === 0 && loot.charges.destroyOnLast) {
    const roll = d(20);
    if (roll === 1) {
      const into = loot.charges.becomes
        ? lootTable.find((l) => l.id === loot.charges!.becomes)
        : undefined;
      if (!into) {
        char.inventory = char.inventory.filter((i) => i.instance_id !== instanceId);
        char.equipment = clearInstance(char.equipment ?? {}, instanceId);
        char.attuned_items = (char.attuned_items ?? []).filter((id) => id !== instanceId);
        return ` The ${loot.name}'s last charge is spent — it rolls a 1 and is destroyed!`;
      }
      // The same instance (still wielded) loses its magic and becomes `into`.
      char.inventory = char.inventory.map((i) =>
        i.instance_id === instanceId
          ? { instance_id: i.instance_id, id: into.id, name: into.name }
          : i
      );
      if (!into.requiresAttunement) {
        char.attuned_items = (char.attuned_items ?? []).filter((id) => id !== instanceId);
      }
      return ` The ${loot.name}'s last charge is spent — it rolls a 1 and is now just a ${into.name}.`;
    }
    return ` The ${loot.name} is out of charges (d20: ${roll} — it survives).`;
  }
  return ` (${left} charge${left === 1 ? '' : 's'} left)`;
}

/**
 * SRD "regains … expended charges daily at dawn" — pansori's dawn is the Long
 * Rest. Also restores once-per-dawn properties and drops any armed weapon
 * power. Mutates `char`; returns one note per item that regained charges.
 */
export function regainItemCharges(char: Character, lootTable: LootItem[]): string[] {
  const notes: string[] = [];
  char.inventory = (char.inventory ?? []).map((raw) => {
    const inv = restPowers(raw);
    const used = inv.charges_used ?? 0;
    const loot = used > 0 ? lootTable.find((l) => l.id === inv.id) : undefined;
    if (!loot?.charges) return inv;
    const back = Math.min(used, Math.max(0, rollDice(loot.charges.regain)));
    if (back <= 0) return inv;
    notes.push(`${inv.name} regains ${back} charge${back === 1 ? '' : 's'}`);
    return { ...inv, charges_used: used - back || undefined };
  });
  return notes;
}

export interface ItemCastOption {
  inv: InventoryItem;
  loot: LootItem;
  spell: Spell;
  level: number;
  cost: number;
}

/**
 * Every spell the character can cast from an item right now — held wands and
 * staffs with enough charges, and readable scrolls — for the choice menu.
 */
export function itemCastOptions(
  char: Character,
  lootTable: LootItem[],
  spellTable: Record<string, Spell>
): ItemCastOption[] {
  const out: ItemCastOption[] = [];
  const seenScroll = new Set<string>();
  for (const inv of char.inventory ?? []) {
    const loot = lootTable.find((l) => l.id === inv.id);
    if (!loot) continue;
    if (loot.requiresAttunement && !(char.attuned_items ?? []).includes(inv.instance_id)) continue;
    if (loot.spellScroll) {
      const spell = spellTable[loot.spellScroll];
      if (!spell || seenScroll.has(loot.id) || !onSpellList(char, spell)) continue;
      seenScroll.add(loot.id);
      out.push({ inv, loot, spell, level: spell.level, cost: 0 });
      continue;
    }
    if (loot.spellStore && canUseItem(char, inv, loot)) {
      for (const held of inv.stored_spells ?? []) {
        const spell = spellTable[held.spellId];
        if (spell) out.push({ inv, loot, spell, level: held.level, cost: 0 });
      }
      continue;
    }
    if (!loot.itemSpells?.length || !canUseItem(char, inv, loot)) continue;
    const left = chargesLeft(inv, loot);
    for (const is of loot.itemSpells) {
      const spell = itemSpellFor(spellTable, is.spellId);
      if (!spell || ((is.daily || is.rechargeDays) && dailyUsed(inv, dailyKey(is.spellId))))
        continue;
      if (requiresBlocker(char, is, loot)) continue;
      if (is.uses && (inv.spell_uses?.[is.spellId] ?? 0) >= is.uses) continue;
      const base = is.level ?? spell.level;
      for (let lvl = base; lvl <= (is.maxLevel ?? base); lvl++) {
        const cost = itemSpellCost(is, spell, lvl)!;
        if (cost <= left) out.push({ inv, loot, spell, level: lvl, cost });
      }
    }
  }
  return out;
}

/**
 * The spell as cast from the item `instanceId`: an `ItemSpell` with its own
 * `damage` dice or `noConcentration` reshapes the spell (no upcast dice).
 * Any other cast returns `spell` unchanged.
 */
export function itemSpellVersion(
  char: Character,
  instanceId: string | undefined,
  spell: Spell,
  lootTable: LootItem[]
): Spell {
  if (!instanceId) return spell;
  const inv = char.inventory?.find((i) => i.instance_id === instanceId);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  const is = loot?.itemSpells?.find((x) => x.spellId === spell.id);
  if (!is?.damage && !is?.noConcentration) return spell;
  return {
    ...spell,
    ...(is.damage ? { damage: is.damage, upcastBonus: undefined } : {}),
    ...(is.noConcentration ? { concentration: false } : {}),
  };
}

/**
 * SRD Ring of Evasion — after a failed Dexterity save, the wearer (with their
 * Reaction free) spends a charge to succeed instead. Auto-resolved
 * (player-favorable). Returns the updated character and a note, or null when
 * no worn, attuned ring has a charge left.
 */
export function useEvasionRing(
  char: Character,
  lootTable: LootItem[]
): { char: Character; note: string } | null {
  if (char.turn_actions?.reaction_used) return null;
  const worn = new Set(Object.values(char.equipment ?? {}));
  const attuned = new Set(char.attuned_items ?? []);
  for (const inv of char.inventory ?? []) {
    const loot = lootTable.find((l) => l.id === inv.id);
    if (!loot?.evasionRing || !worn.has(inv.instance_id) || !attuned.has(inv.instance_id)) {
      continue;
    }
    if (chargesLeft(inv, loot) < 1) continue;
    const next: Character = {
      ...char,
      turn_actions: { ...char.turn_actions, reaction_used: true },
    };
    const left = spendCharges(next, inv.instance_id, 1, lootTable);
    return { char: next, note: `${loot.name} turns the failure into a success${left}` };
  }
  return null;
}

/**
 * SRD Rod of Absorption / Ioun Stones of Absorption and Greater Absorption — a
 * Reaction cancels an enemy's spell. The rod (held and attuned) only takes a
 * spell aimed at its bearer alone (no area) and stores its levels as energy;
 * a stone (carried and attuned) cancels any spell its bearer can see, up to its
 * level cap, and burns out after canceling 20 levels. Auto-resolved for the
 * party (player-favorable): the target's own items first, then anyone's stone.
 * Returns the updated party and a note, or null when nothing cancels it.
 */
export function absorbEnemySpell(
  characters: Character[],
  targetId: string,
  spell: Spell,
  lootTable: LootItem[]
): { characters: Character[]; note: string } | null {
  const order = [
    ...characters.filter((c) => c.id === targetId),
    ...characters.filter((c) => c.id !== targetId),
  ];
  for (const c of order) {
    if (c.dead || c.hp <= 0 || c.turn_actions?.reaction_used) continue;
    for (const inv of c.inventory ?? []) {
      const loot = lootTable.find((l) => l.id === inv.id);
      const ab = loot?.absorbSpells;
      if (!loot || !ab || !(c.attuned_items ?? []).includes(inv.instance_id)) continue;
      if (spell.level > ab.maxLevel) continue;
      const used = inv.absorbed_levels ?? 0;
      if (ab.targetedOnly) {
        // The rod: held, aimed at its bearer alone, and room left to store it.
        if (c.id !== targetId || spell.blastRadius || !isHeld(c, inv.instance_id)) continue;
        if (used + spell.level > ab.lifetime) continue;
      } else if (used >= ab.lifetime) continue;
      const total = used + spell.level;
      const burnsOut = !ab.targetedOnly && total >= ab.lifetime;
      const next: Character = {
        ...c,
        turn_actions: { ...c.turn_actions, reaction_used: true },
        inventory: burnsOut
          ? c.inventory.filter((i) => i.instance_id !== inv.instance_id)
          : c.inventory.map((i) =>
              i.instance_id === inv.instance_id
                ? {
                    ...i,
                    absorbed_levels: total,
                    ...(ab.targetedOnly
                      ? { energy: (i.energy ?? ab.startEnergy ?? 0) + spell.level }
                      : {}),
                  }
                : i
            ),
        attuned_items: burnsOut
          ? (c.attuned_items ?? []).filter((id) => id !== inv.instance_id)
          : c.attuned_items,
      };
      const what = ab.targetedOnly
        ? `drinks it in (${spell.level} level${spell.level === 1 ? '' : 's'} of energy stored)`
        : burnsOut
          ? 'cancels it — then burns out, dull and gray'
          : 'cancels it';
      return {
        characters: characters.map((x) => (x.id === c.id ? next : x)),
        note: ` ✦ ${c.name}'s ${loot.name} ${what} — ${spell.name} has no effect.`,
      };
    }
  }
  return null;
}

/**
 * SRD Ring of Spell Storing / Ioun Stone of Reserve — whether `spell` cast at
 * `level` can be stored in the instance: a level 1..`maxLevel` spell with room
 * left. (Any creature may cast into it; the bearer's own casting is what
 * pansori offers.)
 */
export function storeTarget(
  char: Character,
  instanceId: string,
  spell: Spell,
  level: number,
  lootTable: LootItem[]
): { inv: InventoryItem; loot: LootItem } | { error: string } {
  const inv = char.inventory?.find((i) => i.instance_id === instanceId);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  const cap = loot?.spellStore;
  if (!inv || !loot || !cap) return { error: 'That item can’t hold a spell.' };
  if (spell.level < 1 || level > cap.maxLevel) {
    return { error: `The ${loot.name} holds spells of level 1 to ${cap.maxLevel} only.` };
  }
  const free = cap.levels - storedLevels(inv);
  if (level > free) {
    return {
      error: `The ${loot.name} has room for only ${free} more level${free === 1 ? '' : 's'} of spells.`,
    };
  }
  return { inv, loot };
}
