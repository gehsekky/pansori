import type { Character, Context, GameState, InventoryItem, LootItem } from '../types.js';
import { abilityMod, rollConditionSave, rollDice } from './rulesEngine.js';
import { conditionImmunitiesFor, hasSaveProficiency, pcDamageTaken } from './gameEngine.js';
import { applyDamage } from './damage.js';
import { fmt } from './narrativeFmt.js';
import { randomUUID } from 'crypto';

// SRD Potions — drinking or administering a potion is a Bonus Action; it takes
// effect at once and is used up. Each potion's effect is data on the item
// (`LootItem.potion`); this module resolves it.
//
// Timed effects ride as conditions whose `condition_sources` entry is
// `POTION_SOURCE`. That gives them the round tick in combat for free, keeps
// another caster's Concentration ending (Haste, Bless, Enlarge/Reduce) from
// stripping them, and lets `elapsePotionTime` run them down as in-world
// minutes pass outside combat (rests, travel).

export const POTION_SOURCE = 'potion';

/** Rounds per unit of in-world time (SRD: a round is 6 seconds). */
const ROUNDS_PER_MINUTE = 10;
const ROUNDS_PER_HOUR = 600;

/** Conditions only potions grant (the shared ones — invisible, hasted, … — are sourced). */
export const POTION_CONDITIONS = {
  climbing: 'potion_climbing',
  flying: 'potion_flying',
  resistance: 'potion_resistance',
  invulnerable: 'potion_invulnerable',
  giantStrength: 'giant_strength',
  slippery: 'slippery',
  waterBreathing: 'water_breathing',
} as const;

/** SRD Potion of Resistance / Invulnerability — whether a potion makes `char` resist `type`. */
export function potionResists(
  char: Pick<Character, 'conditions' | 'potion_resistance'>,
  type: string | undefined
): boolean {
  if (!type) return false;
  if (char.conditions.includes(POTION_CONDITIONS.invulnerable)) return true;
  return char.conditions.includes(POTION_CONDITIONS.resistance) && char.potion_resistance === type;
}

/**
 * Item flight, timed like a potion: SRD Winged Boots (30 ft), Wings of Flying
 * (60 ft), Broom of Flying (50 ft) and the four Carpets of Flying.
 */
export const ITEM_FLIGHT: Record<string, number> = {
  winged_boots: 30,
  wings_of_flying: 60,
  broom_of_flying: 50,
  carpet_flying_80: 80,
  carpet_flying_60: 60,
  carpet_flying_40: 40,
  carpet_flying_30: 30,
};

/** SRD Potion of Flying — a Fly Speed equal to Speed (0 when not under it). */
export function potionFlyFt(char: Pick<Character, 'conditions' | 'speed'>): number {
  return Math.max(
    char.conditions.includes(POTION_CONDITIONS.flying) ? (char.speed ?? 30) : 0,
    ...char.conditions.map((c) => ITEM_FLIGHT[c] ?? 0)
  );
}

/** SRD Potion of Climbing — a Climb Speed equal to Speed. */
export function potionClimbs(char: Pick<Character, 'conditions'>): boolean {
  return char.conditions.includes(POTION_CONDITIONS.climbing);
}

/** SRD Oil of Slipperiness — the Freedom of Movement immunities. */
export const SLIPPERY_IMMUNITIES = ['paralyzed', 'restrained', 'grappled'] as const;

/** SRD Potion of Vitality — whether a spent Hit Point Die restores its maximum. */
export function vitalityActive(
  char: Pick<Character, 'vitality_until_minute'>,
  st: Pick<GameState, 'world_minute'>
): boolean {
  return (char.vitality_until_minute ?? 0) > (st.world_minute ?? 0);
}

/**
 * SRD Potion of Giant Strength wearing off — Strength returns to the score the
 * potion displaced (a worn Belt's score, or the true base). Registered as the
 * `giant_strength` on-expire hook; also run when time elapses it.
 */
export function endGiantStrength(char: Character): Character {
  const ps = char.potion_strength;
  if (!ps) return char;
  const base = { ...(char.ability_set_base ?? {}) };
  if (ps.prevBase === undefined) delete base.str;
  else base.str = ps.prevBase;
  return {
    ...char,
    str: ps.prev,
    ability_set_base: Object.keys(base).length > 0 ? base : undefined,
    potion_strength: undefined,
  };
}

/**
 * Rounds a `condition` potion lasts: a number, `'NdMh'` hours of dice, or
 * `'NdMm'` minutes of dice (Dust of Disappearance: 2d4 minutes).
 */
export function potionRounds(rounds: number | string): number {
  if (typeof rounds === 'number') return rounds;
  if (rounds.endsWith('m')) return rollDice(rounds.slice(0, -1)) * ROUNDS_PER_MINUTE;
  const hours = rounds.endsWith('h') ? rollDice(rounds.slice(0, -1)) : rollDice(rounds);
  return hours * ROUNDS_PER_HOUR;
}

/** Add `conds` to the character for `rounds`, sourced to the potion. */
function grantTimed(char: Character, conds: string[], rounds: number): Character {
  const durations = { ...(char.condition_durations ?? {}) };
  const sources = { ...(char.condition_sources ?? {}) };
  for (const c of conds) {
    // A second dose refreshes rather than stacks.
    durations[c] = Math.max(durations[c] ?? 0, rounds);
    sources[c] = POTION_SOURCE;
  }
  return {
    ...char,
    conditions: [...new Set([...char.conditions, ...conds])],
    condition_durations: durations,
    condition_sources: sources,
  };
}

/** Drop potion-sourced `conds` (and run the Giant Strength teardown). */
function dropPotionConditions(char: Character, conds: string[]): Character {
  if (conds.length === 0) return char;
  const gone = new Set(conds);
  const durations = { ...(char.condition_durations ?? {}) };
  const sources = { ...(char.condition_sources ?? {}) };
  for (const c of conds) {
    delete durations[c];
    delete sources[c];
  }
  const next: Character = {
    ...char,
    conditions: char.conditions.filter((c) => !gone.has(c)),
    condition_durations: durations,
    condition_sources: sources,
  };
  return gone.has(POTION_CONDITIONS.giantStrength) ? endGiantStrength(next) : next;
}

/** One character's potion durations after `minutes` of in-world time. */
export function elapseCharPotionTime(c: Character, minutes: number): Character {
  if (minutes <= 0) return c;
  c = regenerateOverTime(c, minutes);
  const sources = c.condition_sources ?? {};
  const durations = { ...(c.condition_durations ?? {}) };
  const expired: string[] = [];
  let touched = false;
  for (const cond of c.conditions) {
    if (sources[cond] !== POTION_SOURCE || durations[cond] === undefined) continue;
    touched = true;
    durations[cond] -= minutes * ROUNDS_PER_MINUTE;
    if (durations[cond] <= 0) expired.push(cond);
  }
  if (!touched) return c;
  return dropPotionConditions({ ...c, condition_durations: durations }, expired);
}

/**
 * Out of combat, potion durations run down with the in-world clock (round
 * durations otherwise freeze between fights). Called wherever `world_minute`
 * advances — a Short Rest, overland travel. Only potion-sourced entries move;
 * spell buffs keep their existing lifecycle.
 */
/**
 * SRD Ring of Regeneration (1d6 every 10 minutes) / Ioun Stone of Regeneration
 * (15 every hour) — Hit Points regained as in-world time passes, while the
 * wearer has at least 1 HP. Whole intervals only.
 */
export function regenerateOverTime(c: Character, minutes: number): Character {
  const regen = c.worn_traits?.regeneration;
  if (!regen?.length || c.dead || c.hp <= 0 || c.hp >= c.max_hp) return c;
  let gained = 0;
  for (const r of regen) {
    for (let n = Math.floor(minutes / r.everyMinutes); n > 0; n--) gained += rollDice(r.dice);
  }
  return gained > 0 ? { ...c, hp: Math.min(c.max_hp, c.hp + gained) } : c;
}

export function elapsePotionTime(st: GameState, minutes: number): GameState {
  if (minutes <= 0 || !st.characters?.length) return st;
  const characters = st.characters.map((c) => elapseCharPotionTime(c, minutes));
  if (characters.every((c, i) => c === st.characters[i])) return st;
  const byId = new Map(characters.map((c) => [c.id, c]));
  return {
    ...st,
    characters,
    entities: st.entities?.map((e) => {
      const c = !e.isEnemy ? byId.get(e.id) : undefined;
      return c ? { ...e, conditions: e.conditions.filter((x) => c.conditions.includes(x)) } : e;
    }),
  };
}

/** Mirror a PC's conditions + HP onto their grid entity (for the FE and attack checks). */
function syncEntity(st: GameState, char: Character): GameState {
  if (!st.entities) return st;
  return {
    ...st,
    entities: st.entities.map((e) =>
      e.id === char.id && !e.isEnemy
        ? {
            ...e,
            hp: char.hp,
            conditions: [...char.conditions],
            condition_durations: { ...(char.condition_durations ?? {}) },
          }
        : e
    ),
  };
}

export interface PotionResult {
  /** The drinker after the effect (the inventory is the caller's job). */
  target: Character;
  st: GameState;
  /** The effect sentence, e.g. "gains a Fly Speed of 30 ft for 1 hour". */
  note: string;
  /** False when the potion can't be used this way (nothing is spent). */
  used: boolean;
}

const hoursLabel = (rounds: number) =>
  rounds >= ROUNDS_PER_HOUR
    ? `${Math.round(rounds / ROUNDS_PER_HOUR)} hour${rounds >= 2 * ROUNDS_PER_HOUR ? 's' : ''}`
    : `${Math.round(rounds / ROUNDS_PER_MINUTE)} minute${rounds >= 2 * ROUNDS_PER_MINUTE ? 's' : ''}`;

const CONDITION_NOTES: Record<string, string> = {
  invisible: 'turns Invisible (ends early on an attack, damage, or a spell)',
  hasted: 'is Hasted (+2 AC, doubled Speed, an extra action; no lethargy after)',
  blessed: 'is Blessed (+1d4 to attack rolls)',
  enlarged: 'grows Large (+1d4 weapon damage)',
  reduced: 'shrinks (−1d4 weapon damage, Disadvantage on Strength saves)',
  [POTION_CONDITIONS.climbing]: 'gains a Climb Speed equal to their Speed',
  [POTION_CONDITIONS.flying]: 'gains a Fly Speed equal to their Speed and can hover',
  [POTION_CONDITIONS.invulnerable]: 'has Resistance to all damage',
  [POTION_CONDITIONS.slippery]: "can't be Paralyzed, Restrained, or Grappled (Freedom of Movement)",
  [POTION_CONDITIONS.waterBreathing]: 'can breathe underwater',
  // SRD Ring / Cloak of Invisibility — granted with `invisible`; attacking doesn't end it.
  item_invisibility: "turns Invisible (attacking doesn't end it)",
  boots_of_speed: 'doubles their Speed (Opportunity Attacks against them have Disadvantage)',
  broom_of_flying: 'rides the broom through the air (Fly Speed 50 feet)',
  ...Object.fromEntries(
    [80, 60, 40, 30].map((ft) => [
      `carpet_flying_${ft}`,
      `rides the carpet through the air (Fly Speed ${ft} feet)`,
    ])
  ),
  gem_of_seeing: 'peers through the gem (Truesight 120 feet)',
};

/**
 * Resolve a potion's effect on `target` (the drinker — self or an ally it's
 * administered to). Oil of Sharpness changes gear instead: see
 * `applyOilOfSharpness`.
 */
export function resolvePotion(
  potion: NonNullable<LootItem['potion']>,
  target: Character,
  st: GameState,
  context: Context
): PotionResult {
  let t = target;
  let note: string;
  switch (potion.kind) {
    case 'condition': {
      const rounds = potionRounds(potion.rounds);
      t = grantTimed(t, potion.conditions, rounds);
      const parts = potion.conditions
        .filter((c) => !(c === 'invisible' && potion.conditions.includes('item_invisibility')))
        .map((c) => CONDITION_NOTES[c] ?? c);
      if (potion.tempHp) {
        // SRD: Temporary Hit Points don't stack — keep the larger pool.
        const had = t.temp_hp ?? 0;
        t = { ...t, temp_hp: Math.max(had, potion.tempHp) };
        parts.unshift(`gains ${potion.tempHp} Temporary Hit Points`);
      }
      note = `${parts.join(' and ')} for ${hoursLabel(rounds)}`;
      break;
    }
    case 'resistance': {
      t = grantTimed(t, [POTION_CONDITIONS.resistance], ROUNDS_PER_HOUR);
      t = { ...t, potion_resistance: potion.damageType };
      note = `has Resistance to ${potion.damageType} damage for 1 hour`;
      break;
    }
    case 'giant_strength': {
      // SRD: no effect if Strength is already at or above the potion's score.
      if (t.str >= potion.score) {
        note = `feels a surge of strength — but is already as strong as the potion makes anyone (Str ${t.str})`;
        break;
      }
      // A second dose: drop the first one's override before stashing the base.
      if (t.potion_strength) t = endGiantStrength(t);
      const stash = {
        score: potion.score,
        prev: t.str,
        ...(t.ability_set_base?.str !== undefined ? { prevBase: t.ability_set_base.str } : {}),
      };
      t = grantTimed(t, [POTION_CONDITIONS.giantStrength], ROUNDS_PER_HOUR);
      t = {
        ...t,
        str: potion.score,
        potion_strength: stash,
        // Keep the true base where syncSetAbilities expects it.
        ability_set_base: { ...(t.ability_set_base ?? {}), str: t.ability_set_base?.str ?? t.str },
      };
      note = `swells with a giant's might — Strength ${potion.score} for 1 hour`;
      break;
    }
    case 'cure': {
      const ended = t.conditions.filter((c) => potion.conditions.includes(c));
      t = {
        ...t,
        conditions: t.conditions.filter((c) => !potion.conditions.includes(c)),
        condition_durations: Object.fromEntries(
          Object.entries(t.condition_durations ?? {}).filter(([k]) => !ended.includes(k))
        ),
      };
      const parts: string[] = [];
      if (ended.length) parts.push(`is no longer ${ended.join(', ')}`);
      if (potion.exhaustion && t.exhaustion_level > 0) {
        parts.push(`sheds ${t.exhaustion_level} level(s) of Exhaustion`);
        t = { ...t, exhaustion_level: 0 };
      }
      if (potion.vitality) {
        t = { ...t, vitality_until_minute: (st.world_minute ?? 0) + 24 * 60 };
        parts.push('will regain the most from every Hit Point Die for 24 hours');
      }
      note = parts.length ? parts.join('; ') : 'feels refreshed, though nothing ailed them';
      break;
    }
    case 'poison': {
      const rolled = rollDice(potion.damage);
      const dmg = pcDamageTaken(t, st, rolled, 'poison');
      const dealt = applyDamage(t, st, dmg);
      t = dealt.char;
      st = dealt.st;
      const immune = conditionImmunitiesFor(t, st).has('poisoned');
      const failed =
        !immune &&
        rollConditionSave(
          'con',
          t.con,
          potion.dc,
          hasSaveProficiency(t, 'con', context),
          t.level,
          0,
          t.conditions
        );
      if (failed && t.hp > 0) t = grantTimed(t, ['poisoned'], ROUNDS_PER_HOUR);
      note =
        `retches — it was poison! ${fmt.dmg(dmg)} poison damage` +
        (immune
          ? '; immune to being Poisoned'
          : failed
            ? `, and fails the DC ${potion.dc} Constitution save — Poisoned for 1 hour`
            : `, but makes the DC ${potion.dc} Constitution save`) +
        dealt.concentrationNote;
      break;
    }
    case 'sharpness':
      // Handled by applyOilOfSharpness (it changes the user's gear, not a body).
      return { target, st, note: '', used: false };
    case 'narrative':
      note = potion.text;
      break;
    case 'regain_slot': {
      const lvl = expendedSlotLevel(t, potion.maxLevel);
      if (!lvl) {
        note = 'has no expended spell slot to restore';
        break;
      }
      const used = t.spell_slots_used ?? {};
      t = { ...t, spell_slots_used: { ...used, [lvl]: Math.max(0, (used[lvl] ?? 0) - 1) } };
      note = `regains a level ${lvl} spell slot`;
      break;
    }
    case 'heal': {
      const before = t.hp;
      t = { ...t, hp: Math.min(t.max_hp, t.hp + Math.max(0, rollDice(potion.dice))) };
      note = `regains ${t.hp - before} Hit Points (${t.hp}/${t.max_hp})`;
      break;
    }
  }
  return { target: t, st: syncEntity(st, t), note, used: true };
}

/**
 * SRD Pearl of Power — the highest expended spell slot of `maxLevel` or lower
 * (the most valuable one to get back), or 0 when none is expended.
 */
export function expendedSlotLevel(
  char: Pick<Character, 'spell_slots_used'>,
  maxLevel: number
): number {
  const used = char.spell_slots_used ?? {};
  for (let l = maxLevel; l >= 1; l--) if ((used[l] ?? 0) > 0) return l;
  return 0;
}

/** SRD Oil of Sharpness — ammunition types that deal Piercing (sling bullets don't). */
const SHARPENABLE_AMMO = ['arrows', 'crossbow_bolts', 'blowgun_needles', 'firearm_bullets'];
const OIL_AMMO_COUNT = 20;

/**
 * SRD Oil of Sharpness — coat a nonmagical Slashing/Piercing melee weapon (the
 * main-hand weapon) or twenty pieces of such ammunition, turning it into the
 * +3 version. Prefers the wielded weapon; otherwise the quivered ammunition.
 * Returns null (nothing spent) when there's nothing it can coat.
 */
export function applyOilOfSharpness(
  char: Character,
  lootTable: LootItem[]
): { char: Character; note: string } | null {
  const find = (id: string) => lootTable.find((l) => l.id === id);
  const mainId = char.equipment?.main_hand;
  const main = char.inventory.find((i) => i.instance_id === mainId);
  const mainData = main ? find(main.id) : undefined;
  const plus3 = main ? find(`${main.id}_plus_3`) : undefined;
  if (
    main &&
    mainData &&
    plus3 &&
    !mainData.magicBonus &&
    mainData.range !== 'ranged' &&
    (mainData.damageType === 'slashing' || mainData.damageType === 'piercing')
  ) {
    const inventory = char.inventory.map((i) =>
      i.instance_id === main.instance_id ? { ...i, id: plus3.id, name: plus3.name } : i
    );
    return {
      char: { ...char, inventory },
      note: `The oil seeps into the ${main.name} — it is now a ${plus3.name}.`,
    };
  }
  const quiverId = char.equipment?.quiver;
  const ammo =
    char.inventory.find((i) => i.instance_id === quiverId && SHARPENABLE_AMMO.includes(i.id)) ??
    char.inventory.find((i) => SHARPENABLE_AMMO.includes(i.id) && (i.count ?? 1) > 0);
  const ammo3 = ammo ? find(`${ammo.id}_plus_3`) : undefined;
  if (!ammo || !ammo3) return null;
  const n = Math.min(OIL_AMMO_COUNT, ammo.count ?? 1);
  const left = (ammo.count ?? 1) - n;
  let inventory: InventoryItem[] = char.inventory
    .map((i) => (i.instance_id === ammo.instance_id ? { ...i, count: left } : i))
    .filter((i) => i.instance_id !== ammo.instance_id || left > 0);
  const stack = inventory.find((i) => i.id === ammo3.id);
  inventory = stack
    ? inventory.map((i) => (i === stack ? { ...i, count: (i.count ?? 0) + n } : i))
    : [...inventory, { instance_id: randomUUID(), id: ammo3.id, name: ammo3.name, count: n }];
  return {
    char: { ...char, inventory },
    note: `The oil seeps into ${n} ${ammo.name.toLowerCase()} — they are now ${ammo3.name}.`,
  };
}

/** SRD Potion of Vitality — a spent Hit Point Die heals its maximum. */
export function hitDieHealing(char: Character, st: GameState): number {
  const die = char.hit_die ?? 8;
  const healed = vitalityActive(char, st)
    ? die + abilityMod(char.con)
    : rollDice(`1d${die}`) + abilityMod(char.con);
  // SRD Periapt of Wound Closure — a Hit Point Die restores double.
  return char.worn_traits?.woundClosure ? healed * 2 : healed;
}
