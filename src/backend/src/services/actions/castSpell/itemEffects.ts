import type {
  AbilityKey,
  Character,
  Enemy,
  EnemyTemplate,
  GameState,
  InventoryItem,
  LootItem,
  Spell,
} from '../../../types.js';
import type { ActionContext, ActionHandler } from '../types.js';
import { allyFrom, joinAlly, spawnHostile } from '../../creatureSpawn.js';
import { classSpellListTag, hasExpertise, hasSkillProficiency } from '../../multiclass.js';
import {
  d,
  hasWeaponProficiency,
  profBonus,
  rollConditionSave,
  rollDice,
  skillCheck,
} from '../../rulesEngine.js';
import {
  endCombatState,
  hasSaveProficiency,
  isRoomCleared,
  pcDamageTaken,
  removeCombatant,
  splitEncounterXp,
} from '../../gameEngine.js';
import { legendaryResistInto, magicResistanceAdvantage } from '../../monsterSaves.js';
import { maxCastableLevel, onSpellList } from '../../chargedItems.js';
import { syncSetAbilities, wornSaveBonus } from '../../wornEffects.js';
import { ITEM_POWERS } from '../../../campaignData/srd/itemPowers.js';
import { SRD_ITEMS } from '../../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../../campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { applyDamage } from '../../damage.js';
import { characterAc } from '../../armorClass.js';
import { clearInstance } from '../../equipment.js';
import { grantTimed } from '../../potions.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from '../actor.js';

type CastAction = {
  type: 'cast_spell';
  spellId: string;
  slotLevel: number;
  targetEnemyId?: string;
  targetCharId?: string;
  hatSpellId?: string;
  itemInstanceId?: string;
};
type CastHandler = ActionHandler<{ type: 'cast_spell'; spellId: string; slotLevel: number }>;

// SRD Wand of Wonder — spells cast from the wand have a save DC of 15, and a
// spell whose range is shorter than 120 feet reaches 120 feet.
const WAND_DC = 15;
const WAND_RANGE = 120;

/**
 * SRD Wand of Wonder / Bag of Beans — an item power whose outcome comes from
 * its own table (`Spell.itemEffect`). Runs right after `runPrecast` has spent
 * the item's charge. Returns true when the effect is fully resolved here;
 * false lets the spell pipeline go on with the power as an ordinary spell (a
 * dumped bean's blast, after it has caught its user).
 */
export function runItemEffect(
  ctx: ActionContext,
  spell: Spell,
  action: CastAction,
  slotNote: string,
  cast: CastHandler
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  switch (spell.itemEffect) {
    case 'wand_of_wonder':
      runWandOfWonder(ctx, action, slotNote, cast);
      return true;
    case 'beans_dump':
      return dumpBeans(ctx, spell, slotNote);
    case 'beans_plant':
      plantBean(ctx, slotNote);
      return true;
    case 'robe_patch':
      robePatch(ctx, spell);
      return true;
    case 'illusion_card':
      drawIllusion(ctx, slotNote);
      return true;
    case 'hat_spell':
      runHat(ctx, action, cast);
      return true;
    case 'deck_draw':
      drawFromDeck(ctx, spell, action);
      return true;
    case 'efreeti_bottle':
      openEfreetiBottle(ctx, action);
      return true;
    case 'iron_flask_trap':
      trapInFlask(ctx, action);
      return true;
    case 'iron_flask_release':
      releaseFromFlask(ctx, action);
      return true;
    case 'pipes_of_the_sewers':
      playPipes(ctx);
      return true;
    default:
      return false;
  }
}

/** Damage the acting PC (its own resistances apply). Returns the HP lost. */
function hurtSelf(ctx: ActionContext, amount: number, damageType: string): number {
  if (ctx.actor.kind !== 'pc') return 0;
  const { char } = ctx.actor;
  const dmg = pcDamageTaken(char, ctx.st, amount, damageType);
  const hit = applyDamage(char, ctx.st, dmg, { damageType });
  updatePcActor(ctx, hit.char);
  ctx.st = hit.st;
  return hit.amountDealt;
}

/** Give the acting PC a timed condition (`rounds` of 6 seconds). */
function selfCondition(ctx: ActionContext, cond: string, rounds: number): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  updatePcActor(ctx, {
    conditions: [...new Set([...char.conditions, cond])],
    condition_durations: {
      ...(char.condition_durations ?? {}),
      [cond]: Math.max(char.condition_durations?.[cond] ?? 0, rounds),
    },
  });
}

type TableExtra = {
  targetCharId?: string;
  form?: { name: string; hp: number };
  // The item casting it; defaults to the Wand of Wonder (DC 15, 120-foot reach).
  item?: string;
};

/**
 * Run `spell` through the cast handler as a free cast from an item's table.
 * The Wand of Wonder's spells use DC 15 and reach 120 feet; any other item's
 * (Hat of Many Spells) use the caster's own DC and range.
 */
function tableCast(
  ctx: ActionContext,
  cast: CastHandler,
  spell: Spell,
  lead: string,
  action: CastAction,
  extra: TableExtra = {}
): void {
  const wand = !extra.item;
  const reach =
    wand && !spell.itemPower && spell.rangeKind === 'ranged' && (spell.rangeFt ?? 0) < WAND_RANGE
      ? { ...spell, rangeFt: WAND_RANGE }
      : spell;
  ctx.tableCast = {
    name: extra.item ?? 'Wand of Wonder',
    ...(wand ? { dc: WAND_DC } : {}),
    spell: reach,
    form: extra.form,
  };
  ctx.narrative = '';
  try {
    cast(ctx, {
      type: 'cast_spell',
      spellId: spell.id,
      slotLevel: spell.level,
      targetEnemyId: extra.targetCharId ? undefined : action.targetEnemyId,
      ...(extra.targetCharId ? { targetCharId: extra.targetCharId } : {}),
    } as CastAction);
  } finally {
    ctx.tableCast = undefined;
  }
  ctx.narrative = `${lead}${ctx.narrative ? ` ${ctx.narrative}` : ''}`;
}

/** SRD Wand of Wonder — roll 1d100 on the Wand of Wonder Effects table. */
function runWandOfWonder(
  ctx: ActionContext,
  action: CastAction,
  slotNote: string,
  cast: CastHandler
): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const roll = d(100);
  const lead = `${char.name} waves the Wand of Wonder${slotNote} (d100: ${roll}) —`;
  const spellTable = ctx.context.spellTable ?? {};
  const target = action.targetEnemyId
    ? ctx.livingEnemiesInRoom.find((e) => e.id === action.targetEnemyId)
    : ctx.livingEnemiesInRoom[0];
  const say = (text: string) => {
    ctx.narrative = `${lead} ${text}`;
  };
  const castSpell = (id: string, extra: TableExtra = {}) => {
    const s = spellTable[id] ?? ITEM_POWERS[id];
    if (!s) return say('the magic sputters out.');
    tableCast(ctx, cast, s, `${lead} it casts ${s.name}!`, action, extra);
  };
  ctx.usedInitiative = true;

  if (roll <= 20) {
    const spells = ['darkness', 'faerie_fire', 'fireball', 'slow', 'stinking_cloud'];
    return castSpell(spells[Math.ceil(d(10) / 2) - 1]);
  }
  if (roll <= 25) {
    // Stunned until the start of your next turn.
    selfCondition(ctx, 'stunned', 1);
    return say(
      `nothing happens where it points. ${char.name} stands Stunned until their next turn, sure that something awesome just happened.`
    );
  }
  if (roll <= 30) return castSpell('gust_of_wind');
  if (roll <= 35) {
    const lost = hurtSelf(ctx, d(6), 'psychic');
    return say(
      `nothing happens where it points — instead ${char.name} takes ${lost} Psychic damage.`
    );
  }
  // Simplification: the rain and the butterflies are scenery — the areas they
  // obscure aren't placed on the grid.
  if (roll <= 40) return say('heavy rain pours down around the chosen spot for a minute.');
  if (roll <= 45)
    return say(
      'a cloud of six hundred oversized butterflies fills the air around the chosen spot.'
    );
  if (roll <= 50) return castSpell('lightning_bolt');
  if (roll <= 55) {
    // The creature closest to the point is enlarged (Enlarge/Reduce, 1 minute).
    if (target) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === target.id && e.isEnemy
            ? {
                ...e,
                conditions: [...new Set([...e.conditions, 'enlarged'])],
                condition_durations: { ...e.condition_durations, enlarged: 10 },
              }
            : e
        ),
      };
      return say(
        `the ${target.name} swells to twice its size (Enlarged: its weapon attacks deal an extra 1d4 damage for 1 minute).`
      );
    }
    selfCondition(ctx, 'enlarged', 10);
    return say(`${char.name} swells to twice their size (Enlarged for 1 minute).`);
  }
  if (roll <= 60) {
    // Simplification: the creature isn't anyone's to command, so it isn't put
    // on the board; it wanders off before it can join the fight.
    const beast = ['Rhinoceros', 'Elephant', 'Rat', 'Rat'][d(4) - 1];
    return say(`a ${beast} pops into being nearby, looks around, and wanders off.`);
  }
  if (roll <= 64) return say('thick grass sprouts all around the chosen spot.');
  if (roll <= 68)
    return say('a loose object near the chosen spot blinks out into the Ethereal Plane.');
  if (roll <= 72) {
    selfCondition(ctx, 'reduced', 10);
    return say(
      `nothing happens where it points — instead ${char.name} shrinks (Reduced for 1 minute).`
    );
  }
  if (roll <= 77) {
    return say(
      `leaves sprout from ${target ? `the ${target.name}` : char.name}, to fall away in a day.`
    );
  }
  if (roll <= 82) return castSpell('wonder_flash');
  if (roll <= 87) return castSpell('invisibility', { targetCharId: char.id });
  if (roll <= 92) {
    // Simplification: the whole stream strikes the target (no splitting along
    // the Line), and the scattered gems can be gathered up afterwards.
    const gems = d(4) * 10;
    updatePcActor(ctx, { gold: (char.gold ?? 0) + gems });
    const gemSpell = { ...ITEM_POWERS.wonder_gems, damage: String(gems) };
    tableCast(
      ctx,
      cast,
      gemSpell,
      `${lead} a stream of ${gems} tiny gems sprays from the tip (${gems} GP gathered afterwards)!`,
      action
    );
    return;
  }
  if (roll <= 97) {
    const key = ['black_bear', 'giant_wasp', 'frog', 'frog'][d(4) - 1];
    const m = SRD_MONSTERS[key];
    return castSpell('polymorph', { form: { name: m.name, hp: m.hp } });
  }
  return castSpell('wonder_petrify');
}

/**
 * SRD Bag of Beans — dumping beans out sets them off in a 10-foot Sphere around
 * the user, who is caught too. The user's own Dex save is made here; the rest
 * of the blast (enemies and allies nearby) runs through the AoE pipeline.
 */
function dumpBeans(ctx: ActionContext, spell: Spell, slotNote: string): boolean {
  if (ctx.actor.kind !== 'pc') return true;
  const { char } = ctx.actor;
  const dc = 15 - wornSaveBonus(char, 'dex', ctx.context.lootTable);
  const failed = rollConditionSave(
    'dex',
    char.dex,
    dc,
    hasSaveProficiency(char, 'dex', ctx.context),
    char.level,
    0,
    char.conditions
  );
  const raw = rollDice(spell.damage ?? '5d4');
  const lost = hurtSelf(ctx, failed ? raw : Math.floor(raw / 2), 'force');
  ctx.narrative = `${char.name} tips beans out of the bag${slotNote} — they burst in a flash of force! ${char.name} ${failed ? 'is caught in it (fails' : 'dodges partly clear (makes'} the DC 15 Dexterity save) and takes ${lost} Force damage.`;
  const enemiesNear = (ctx.st.entities ?? []).some((e) => e.isEnemy && e.hp > 0);
  if (!ctx.st.combat_active || !enemiesNear || !ctx.enemy || !ctx.enemyAlive) {
    ctx.usedInitiative = ctx.st.combat_active ?? false;
    return true;
  }
  return false;
}

/**
 * SRD Bag of Beans — a planted bean springs up a minute later with an effect
 * off the 1d100 table. Simplification: the creatures it can raise (Treant,
 * Shrieker Fungi, Bulette, the toads' monsters, the pyramid's Undead) and the
 * odder results are described rather than placed; the fruit tree's potions go
 * straight into the planter's pack.
 */
function plantBean(ctx: ActionContext, slotNote: string): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const roll = d(100);
  const lead = `${char.name} plants a bean${slotNote} and waters it. A minute later (d100: ${roll}) —`;
  let text: string;
  if (roll === 1)
    text = `${rollDice('5d4')} speckled toadstools pop up. Nobody is hungry enough to try one.`;
  else if (roll <= 10)
    text =
      'a geyser of something strange (tea? vinegar? mayonnaise?) shoots thirty feet into the air for a few minutes.';
  else if (roll <= 20)
    text =
      'a Treant heaves itself out of the soil, looks the party over, and strides off into the wilds.';
  else if (roll <= 30)
    text = `a stone statue of ${char.name} rises and starts loudly listing their crimes to anyone who will listen.`;
  else if (roll <= 40) text = 'a campfire of green flames springs up and burns merrily.';
  else if (roll <= 50) text = 'three Shrieker Fungi sprout and begin to wail.';
  else if (roll <= 60)
    text = `${d(4) + 4} bright-pink toads crawl out and hop away before anyone can touch them.`;
  else if (roll <= 70)
    text =
      'the ground heaves as a Bulette bursts up — the party scatters, and it burrows off after easier prey.';
  else if (roll <= 80) {
    const potions = ctx.context.lootTable.filter(
      (l) => l.type === 'consumable' && l.id.includes('potion')
    );
    const n = d(8);
    const picked = potions.length
      ? Array.from({ length: n }, () => potions[d(potions.length) - 1])
      : [];
    updatePcActor(ctx, {
      inventory: [
        ...(char.inventory ?? []),
        ...picked.map((p) => ({ ...p, instance_id: randomUUID() })),
      ],
    });
    text = `a fruit tree shoots up, heavy with fruit. ${n} of the fruits hold magic: ${picked.map((p) => p.name).join(', ') || 'none that last'}.`;
  } else if (roll <= 90)
    text = `a nest of ${d(4) + 3} rainbow-colored eggs appears. Nobody dares eat one.`;
  else if (roll <= 95)
    text = 'a stone pyramid bursts from the earth, its sealed tomb waiting below.';
  else text = 'a giant beanstalk erupts upward, climbing out of sight into the clouds.';
  ctx.narrative = `${lead} ${text}`;
}

/** A catalog item by id — the campaign's loot table first, else the SRD's. */
function itemById(ctx: ActionContext, id: string): LootItem | undefined {
  return ctx.context.lootTable.find((l) => l.id === id) ?? SRD_ITEMS[id];
}

/** Put `ids` (catalog item ids) into the acting PC's pack. Returns their names. */
function giveItems(ctx: ActionContext, ids: string[]): string[] {
  if (ctx.actor.kind !== 'pc') return [];
  const items = ids.map((id) => itemById(ctx, id)).filter((l): l is LootItem => !!l);
  updatePcActor(ctx, {
    inventory: [
      ...(ctx.actor.char.inventory ?? []),
      ...items.map((l) => ({ ...l, instance_id: randomUUID() })),
    ],
  });
  return items.map((l) => l.name);
}

/** Add creatures from the bestiary to the party for good (not item-bound). */
function joinParty(ctx: ActionContext, key: string, count: number, mount?: number): void {
  if (ctx.actor.kind !== 'pc') return;
  const m = SRD_MONSTERS[key];
  if (!m) return;
  const raised = Array.from({ length: count }, () => ({
    id: `summon-${randomUUID()}`,
    ownerId: ctx.actor.kind === 'pc' ? ctx.actor.char.id : '',
    name: m.name,
    ac: m.ac,
    maxHp: m.hp,
    toHit: m.toHit,
    damage: m.damage,
    ...(mount ? { isMount: true, speed: mount } : {}),
  }));
  ctx.st = { ...ctx.st, summoned_allies: [...(ctx.st.summoned_allies ?? []), ...raised] };
}

const ROBE_PATCHES: Record<string, string> = {
  lantern: 'bullseye_lantern',
  dagger: 'dagger',
  mirror: 'mirror',
  pole: 'pole',
  rope: 'rope_hempen',
  sack: 'sack',
};

/**
 * SRD Robe of Useful Items — the torn-off patch becomes its object. A mystery
 * patch rolls 1d100. Simplification: the coffer and gems come as their value
 * in gold; the door, pit, rowboat and window are described rather than placed;
 * the Spell Scroll (level 1–3) is picked at random from your class lists.
 */
function robePatch(ctx: ActionContext, spell: Spell): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const key = spell.id.replace('robe_patch_', '');
  const lead = `${char.name} tears a patch from the Robe of Useful Items —`;
  ctx.usedInitiative = ctx.st.combat_active ?? false;
  if (ROBE_PATCHES[key]) {
    const [name] = giveItems(ctx, [ROBE_PATCHES[key]]);
    ctx.narrative = `${lead} it becomes a ${name}${key === 'lantern' ? ', filled and lit' : ''}.`;
    return;
  }
  const roll = d(100);
  const say = (text: string) => {
    ctx.narrative = `${lead} (d100: ${roll}) ${text}`;
  };
  const addGold = (gp: number) => updatePcActor(ctx, { gold: (char.gold ?? 0) + gp });
  if (roll <= 8) {
    addGold(100);
    return say('it becomes a bag of 100 GP.');
  }
  if (roll <= 15) {
    addGold(500);
    return say('it becomes a silver coffer worth 500 GP.');
  }
  if (roll <= 22) return say('it becomes an iron door that fits itself to an opening nearby.');
  if (roll <= 30) {
    addGold(1000);
    return say('it becomes ten gems worth 100 GP each (1,000 GP).');
  }
  if (roll <= 44) {
    giveItems(ctx, ['ladder']);
    return say('it becomes a 24-foot wooden ladder.');
  }
  if (roll <= 51) {
    joinParty(ctx, 'riding_horse', 1, 60);
    return say('it becomes a saddled Riding Horse, ready to ride.');
  }
  if (roll <= 59) return say('it becomes a 10-foot-deep pit in the ground nearby.');
  if (roll <= 68) {
    giveItems(ctx, ['healing_potion', 'healing_potion', 'healing_potion', 'healing_potion']);
    return say('it becomes four Potions of Healing.');
  }
  if (roll <= 75) return say('it becomes a 12-foot rowboat.');
  if (roll <= 83) {
    const scrolls = [...ctx.context.lootTable, ...Object.values(SRD_ITEMS)].filter((l) => {
      const s = l.spellScroll ? (ctx.context.spellTable ?? SRD_SPELLS)[l.spellScroll] : undefined;
      return !!s && s.level >= 1 && s.level <= 3 && onSpellList(char, s);
    });
    const pool = scrolls.length
      ? scrolls
      : Object.values(SRD_ITEMS).filter((l) => {
          const s = l.spellScroll ? SRD_SPELLS[l.spellScroll] : undefined;
          return !!s && s.level >= 1 && s.level <= 3;
        });
    const scroll = pool[d(pool.length) - 1];
    giveItems(ctx, [scroll.id]);
    return say(`it becomes a ${scroll.name}.`);
  }
  if (roll <= 90) {
    joinParty(ctx, 'mastiff', 2);
    return say('it becomes two Mastiffs, who fall in beside the party.');
  }
  if (roll <= 96) return say('it becomes a window that sets itself into a nearby wall.');
  giveItems(ctx, ['portable_ram']);
  return say('it becomes a Portable Ram.');
}

// SRD Deck of Illusions table — 32 creatures, three numbers each, then the
// card drawer (97–00).
const ILLUSIONS = [
  'Adult Red Dragon',
  'Archmage',
  'Assassin',
  'Bandit Captain',
  'Basilisk',
  'Berserker',
  'Bugbear Warrior',
  'Cloud Giant',
  'Druid',
  'Erinyes',
  'Ettin',
  'Fire Giant',
  'Frost Giant',
  'Gnoll Warrior',
  'Goblin Warrior',
  'Guardian Naga',
  'Hill Giant',
  'Hobgoblin Warrior',
  'Incubus',
  'Iron Golem',
  'Knight',
  'Kobold Warrior',
  'Lich',
  'Medusa',
  'Night Hag',
  'Ogre',
  'Oni',
  'Priest',
  'Succubus',
  'Troll',
  'Veteran Warrior',
  'Wyvern',
];

/** SRD Deck of Illusions — the thrown card shows a harmless illusory creature. */
function drawIllusion(ctx: ActionContext, slotNote: string): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const roll = d(100);
  const who =
    roll >= 97 ? `${char.name} — a perfect double` : `a ${ILLUSIONS[Math.floor((roll - 1) / 3)]}`;
  ctx.usedInitiative = ctx.st.combat_active ?? false;
  ctx.narrative = `${char.name} draws a card from the Deck of Illusions${slotNote} and flicks it to the ground (d100: ${roll}) — an illusion of ${who} rises over it. It looks real, but it can do no harm, and anything that touches it passes right through.`;
}

const HAT_USED = 'hat_of_many_spells_used';

/**
 * SRD Hat of Many Spells — why the wearer can't try `action.hatSpellId` right
 * now, or null. Checked before the cast spends the action.
 */
/**
 * Why an item power can't be used right now (checked before the action or a
 * charge is spent), or null. Covers the Hat of Many Spells' chosen spell and the
 * uncontrolled-creature items' preconditions.
 */
export function itemEffectBlocker(
  ctx: ActionContext,
  spell: Spell,
  action: CastAction
): string | null {
  if (ctx.actor.kind !== 'pc') return 'Only a character can use that.';
  switch (spell.itemEffect) {
    case 'hat_spell':
      return hatBlocker(ctx, action);
    case 'pipes_of_the_sewers':
      return ctx.st.combat_active
        ? null
        : 'The rats only answer the pipes in the thick of a fight.';
    case 'iron_flask_trap': {
      const held = flaskContents(usedItem(ctx, action));
      if (held) return `The flask already holds a ${held.name}.`;
      const target = ctx.livingEnemiesInRoom.find((e) => e.id === action.targetEnemyId);
      if (!target) return 'Choose a creature to trap.';
      if (!flaskCanTrap(target))
        return `The ${target.name} belongs to this plane — the flask can't hold it.`;
      return null;
    }
    case 'iron_flask_release':
      return flaskContents(usedItem(ctx, action)) ? null : 'The flask is empty.';
    default:
      return null;
  }
}

/** Whether to leave an item power out of the choices (it would be refused). */
export function itemEffectHidden(
  char: Character,
  inv: InventoryItem,
  spell: Spell,
  combat: boolean,
  spellTable: Record<string, Spell>
): boolean {
  switch (spell.itemEffect) {
    case 'hat_spell':
      return (
        (char.class_resource_uses?.[HAT_USED] ?? 0) > 0 ||
        hatSpellOptions(char, spellTable).length === 0
      );
    case 'pipes_of_the_sewers':
      return !combat;
    case 'iron_flask_trap':
      return !!flaskContents(inv);
    case 'iron_flask_release':
      return !flaskContents(inv);
    default:
      return false;
  }
}

function hatBlocker(ctx: ActionContext, action: CastAction): string | null {
  if (ctx.actor.kind !== 'pc') return 'Only a character can use the hat.';
  const { char } = ctx.actor;
  if ((char.class_resource_uses?.[HAT_USED] ?? 0) > 0) {
    return 'The hat has given all it will for now — it works again after a Short or Long Rest.';
  }
  const s = action.hatSpellId ? ctx.context.spellTable?.[action.hatSpellId] : undefined;
  if (!s) return 'Choose a Wizard spell to pull from the hat.';
  if (!(s.spellList ?? []).includes(classSpellListTag('wizard')!)) {
    return `${s.name} isn't a Wizard spell.`;
  }
  if (s.level < 1 || s.level > maxCastableLevel(char)) {
    return `You can't cast a level ${s.level} spell.`;
  }
  if ((char.spells_known ?? []).includes(s.id) || (char.prepared_spells ?? []).includes(s.id)) {
    return `You already know ${s.name}.`;
  }
  if ((s.materialCost ?? 0) > 1000) return `${s.name}'s Material component costs too much.`;
  const left = (char.spell_slots_max?.[s.level] ?? 0) - (char.spell_slots_used?.[s.level] ?? 0);
  if (left <= 0) return `You have no level ${s.level} spell slot left.`;
  return null;
}

/** The Wizard spells the hat could give `char` now (for its option picker). */
export function hatSpellOptions(char: Character, spellTable: Record<string, Spell>): Spell[] {
  const tag = classSpellListTag('wizard');
  const top = maxCastableLevel(char);
  return Object.values(spellTable)
    .filter(
      (s) =>
        !s.itemPower &&
        (s.spellList ?? []).includes(tag!) &&
        s.level >= 1 &&
        s.level <= top &&
        (s.materialCost ?? 0) <= 1000 &&
        !(char.spells_known ?? []).includes(s.id) &&
        !(char.prepared_spells ?? []).includes(s.id)
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** SRD Hat of Many Spells — spend the slot, make the Arcana check, see what comes out. */
function runHat(ctx: ActionContext, action: CastAction, cast: CastHandler): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const s = ctx.context.spellTable![action.hatSpellId!];
  updatePcActor(ctx, {
    spell_slots_used: {
      ...(char.spell_slots_used ?? {}),
      [s.level]: (char.spell_slots_used?.[s.level] ?? 0) + 1,
    },
  });
  const dc = 10 + s.level;
  const check = skillCheck(
    ctx.actor.char.int,
    dc,
    hasSkillProficiency(char, 'Arcana'),
    char.level,
    false,
    hasExpertise(char, 'Arcana')
  );
  const tried = `${char.name} reaches into the Hat of Many Spells for ${s.name} (level ${s.level} slot; Arcana ${check.total} vs DC ${dc})`;
  ctx.usedInitiative = true;
  if (check.success) {
    updatePcActor(ctx, {
      class_resource_uses: { ...(ctx.actor.char.class_resource_uses ?? {}), [HAT_USED]: 1 },
    });
    tableCast(ctx, cast, s, `${tried} — and pulls it out!`, action, {
      item: 'Hat of Many Spells',
      ...(s.targetType === 'self' ? { targetCharId: char.id } : {}),
    });
    return;
  }
  hatMishap(ctx, action, cast, `${tried} — but something else comes out`);
}

/** SRD Hat of Many Spells — the table rolled when the Arcana check fails. */
function hatMishap(ctx: ActionContext, action: CastAction, cast: CastHandler, tried: string): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const roll = d(100);
  const lead = `${tried} (d100: ${roll}):`;
  const say = (text: string) => {
    ctx.narrative = `${lead} ${text}`;
  };
  const spellTable = ctx.context.spellTable ?? {};
  const hatCast = (id: string, extra: TableExtra = {}) => {
    const sp = spellTable[id];
    if (!sp) return say('a puff of smoke.');
    tableCast(ctx, cast, sp, `${lead} ${sp.name}!`, action, {
      item: 'Hat of Many Spells',
      ...extra,
    });
  };
  if (roll <= 50) {
    switch (d(10)) {
      case 1:
        return hatCast('enlarge_reduce', { targetCharId: char.id });
      case 2:
        return hatCast('enlarge_reduce');
      case 3:
        return hatCast('faerie_fire');
      case 4:
        return hatCast('fireball');
      case 5:
        return hatCast('gust_of_wind');
      case 6:
        return hatCast('invisibility', { targetCharId: char.id });
      case 7:
        return hatCast('lightning_bolt');
      case 8:
        return hatCast('phantasmal_force');
      case 9:
        return hatCast('polymorph');
      default:
        return hatCast('stinking_cloud');
    }
  }
  if (roll <= 55) {
    // Until the end of their next turn.
    selfCondition(ctx, 'stunned', 2);
    return say(
      `${char.name} is Stunned until the end of their next turn, sure something awesome just happened.`
    );
  }
  if (roll <= 60) return say('a harmless swarm of butterflies bursts out and flutters about.');
  if (roll <= 65) {
    const [got] = giveItems(ctx, [['acid', 'alchemists_fire', 'crowbar', 'torch'][d(4) - 1]]);
    return say(`${char.name} pulls out ${got}.`);
  }
  if (roll <= 70) {
    selfCondition(ctx, 'poisoned', 600);
    return say(`a bout of magic sickness — ${char.name} is Poisoned for 1 hour.`);
  }
  if (roll <= 75) {
    selfCondition(ctx, 'petrified', 2);
    return say(`${char.name} turns to stone (Petrified) until the end of their next turn.`);
  }
  if (roll <= 80) {
    const pick = d(4);
    if (pick === 4) {
      updatePcActor(ctx, { gold: (char.gold ?? 0) + 50 });
      return say(`${char.name} pulls out a gem worth 50 GP.`);
    }
    const got = giveItems(
      ctx,
      [['dagger'], ['rope_hempen', 'grappling_hook'], ['caltrops']][pick - 1]
    );
    return say(`${char.name} pulls out ${got.join(' tied to a ')}.`);
  }
  if (roll <= 85) {
    // Simplification: the creature isn't anyone's to command; it wanders off.
    const beast = ['Camel', 'Constrictor Snake', 'Elephant', 'Mule'][d(4) - 1];
    return say(`a ${beast} tumbles out of the hat, looks around, and wanders off.`);
  }
  if (roll <= 90) {
    // Simplification: the hostile Swarm of Bats makes one attack and scatters.
    const bats = SRD_MONSTERS.swarm_of_bats;
    const atk = d(20) + bats.toHit;
    if (atk >= (char.ac ?? 10)) {
      const lost = hurtSelf(ctx, rollDice(bats.damage), 'piercing');
      return say(
        `a Swarm of Bats boils out and bites ${char.name} for ${lost} Piercing damage before scattering.`
      );
    }
    return say(`a Swarm of Bats boils out and swirls around ${char.name}, then scatters.`);
  }
  if (roll <= 95) return say('a shimmering portal to another plane opens nearby, then closes.');
  // A magic item: 1–3 Common, 4–5 Uncommon, 6 Rare.
  const r = d(6);
  const value = r <= 3 ? 100 : r <= 5 ? 400 : 4000;
  const pool = Object.values(SRD_ITEMS).filter(
    (l) => l.value === value && l.type === 'consumable' && !l.cursed
  );
  if (!pool.length) return say('an empty hatful of glitter.');
  const [got] = giveItems(ctx, [pool[d(pool.length) - 1].id]);
  return say(`${char.name} pulls out a ${got}!`);
}

// ─── SRD Mysterious Deck ─────────────────────────────────────────────────────

// The deck tables: each card's top d100 roll, in order.
const DECK_13: Array<[number, string]> = [
  [8, 'Euryale'],
  [16, 'Flames'],
  [24, 'Jester'],
  [32, 'Key'],
  [40, 'Knight'],
  [48, 'Moon'],
  [56, 'Rogue'],
  [64, 'Ruin'],
  [72, 'Skull'],
  [80, 'Star'],
  [88, 'Sun'],
  [96, 'Throne'],
  [100, 'Void'],
];
const DECK_22: Array<[number, string]> = [
  [5, 'Balance'],
  [10, 'Comet'],
  [14, 'Donjon'],
  [18, 'Euryale'],
  [23, 'Fates'],
  [27, 'Flames'],
  [31, 'Fool'],
  [36, 'Gem'],
  [41, 'Jester'],
  [46, 'Key'],
  [51, 'Knight'],
  [56, 'Moon'],
  [60, 'Puzzle'],
  [64, 'Rogue'],
  [68, 'Ruin'],
  [73, 'Sage'],
  [77, 'Skull'],
  [82, 'Star'],
  [87, 'Sun'],
  [91, 'Talons'],
  [96, 'Throne'],
  [100, 'Void'],
];
// Cards that leave the deck once drawn (a re-draw is rerolled).
const ONE_TIME_CARDS = ['Fool', 'Jester'];
const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** A magic item, by its catalog description's rarity tag (or a +N / scroll). */
export function isMagicItem(l: LootItem | undefined): boolean {
  if (!l) return false;
  return (
    !!l.magicBonus ||
    !!l.spellScroll ||
    /\((Common|Uncommon|Rare|Very Rare|Legendary|Artifact)[;.,)]/.test(l.desc ?? '')
  );
}

/** The Mysterious Deck's draw: roll its table (rerolling a card that has left). */
function drawFromDeck(ctx: ActionContext, spell: Spell, action: CastAction): void {
  if (ctx.actor.kind !== 'pc') return;
  const table = spell.id === 'deck_draw_22' ? DECK_22 : DECK_13;
  const instanceId = (action as { itemInstanceId?: string }).itemInstanceId;
  const notes: string[] = [];
  let avatar = false;
  let draws = 1;
  while (draws-- > 0 && !ctx.actor.char.dead) {
    const inv = ctx.actor.char.inventory.find((i) => i.instance_id === instanceId);
    const gone = (inv?.powers_used ?? []).filter((k) => k.startsWith('deck:'));
    let card = '';
    for (let tries = 0; tries < 50; tries++) {
      const roll = d(100);
      card = table.find(([top]) => roll <= top)![1];
      if (!gone.includes(`deck:${card}`)) break;
    }
    if (ONE_TIME_CARDS.includes(card) && instanceId) {
      updatePcActor(ctx, {
        inventory: ctx.actor.char.inventory.map((i) =>
          i.instance_id === instanceId
            ? { ...i, powers_used: [...(i.powers_used ?? []), `deck:${card}`] }
            : i
        ),
      });
    }
    const { text, extraDraw } = applyCard(ctx, card);
    notes.push(`${card} — ${text}`);
    if (card === 'Skull') avatar = true;
    // SRD Fool — draw another card (not one of your declared draws).
    if (extraDraw) draws++;
  }
  ctx.narrative = `${ctx.actor.char.name} draws from the Mysterious Deck. ${notes.join(' Then: ')}`;
  // SRD Skull — the Avatar of Death appears beside the drawer and attacks only
  // them. Simplification: allies who hurt it don't call avatars of their own,
  // it doesn't vanish if the drawer dies, and its victims can still be revived.
  if (avatar && !ctx.actor.char.dead) {
    spawnHostile(ctx, avatarOfDeath(ctx.actor.char), {
      tag: 'avatar',
      hunts: ctx.actor.char.id,
    });
  }
}

/** Raise (or lower) one ability score, within [floor, cap]. Returns the change. */
function shiftAbility(ctx: ActionContext, ab: AbilityKey, by: number, cap: number): number {
  if (ctx.actor.kind !== 'pc') return 0;
  const cur = ctx.actor.char[ab] as number;
  const next = Math.max(1, by > 0 ? Math.min(cap, cur + by) : cur + by);
  updatePcActor(ctx, { [ab]: next } as Partial<Character>);
  return next - cur;
}

/** The card's effect on the drawer. `extraDraw`: draw one more card. */
function applyCard(ctx: ActionContext, card: string): { text: string; extraDraw?: boolean } {
  if (ctx.actor.kind !== 'pc') return { text: '' };
  const char = ctx.actor.char;
  const primary = (ctx.context.classPrimaryStats?.[char.character_class] ?? 'str') as AbilityKey;
  const casting = ctx.context.spellcastingAbility?.[char.character_class];
  const named = (ab: AbilityKey) => ab.toUpperCase();
  switch (card) {
    case 'Balance': {
      // Simplification: the trade is made for you — +2 to the class's primary
      // ability, -2 to the lowest other score above 5.
      const lower = ABILITIES.filter((a) => a !== primary && (char[a] as number) > 5).sort(
        (a, b) => (char[a] as number) - (char[b] as number)
      )[0];
      if (!lower || (char[primary] as number) >= 22)
        return { text: 'the scales hold still; nothing changes.' };
      shiftAbility(ctx, primary, 2, 22);
      shiftAbility(ctx, lower, -2, 30);
      return { text: `the scales tip: ${named(primary)} +2, ${named(lower)} -2.` };
    }
    case 'Comet':
      // Simplification: the chosen foe and the year of Advantage on Death
      // Saving Throws aren't tracked.
      return {
        text: 'a streak of fire across the card — glory awaits whoever fells the next great foe alone.',
      };
    case 'Donjon':
    case 'Void': {
      // Simplification: the drawer is lost to the party as if dead; the rescue
      // (or the search for the trapped soul) is left to the table.
      updatePcActor(ctx, { hp: 0, dead: true });
      return {
        text:
          card === 'Donjon'
            ? `${char.name} vanishes, entombed in a sphere beyond the world. They draw no more cards.`
            : `${char.name}'s soul is torn away and locked in a far-off prison; their body falls still. They draw no more cards.`,
      };
    }
    case 'Euryale':
      updatePcActor(ctx, { euryale_curse: true });
      return {
        text: `a medusa's gaze curses ${char.name}: -2 to saving throws until the curse is lifted.`,
      };
    case 'Fates':
      if (char.euryale_curse) {
        updatePcActor(ctx, { euryale_curse: false });
        return { text: "reality unspools and respins — Euryale's curse never happened." };
      }
      // Simplification: erasing an event is left to the table.
      return {
        text: 'reality unspools around one moment of your choosing — an event the GM will let you undo.',
      };
    case 'Flames':
      return {
        text: 'a powerful devil turns its hateful gaze on you, and will hunt you until one of you dies.',
      };
    case 'Fool': {
      const conds = grantTimed(char, ['deck_fool'], 72 * 600);
      updatePcActor(ctx, conds);
      return {
        text: 'Disadvantage on attack rolls and saving throws for 72 hours — and draw again.',
        extraDraw: true,
      };
    }
    case 'Gem':
      updatePcActor(ctx, { gold: (char.gold ?? 0) + 50000 });
      return { text: 'fifty gems worth 1,000 GP each spill at your feet (50,000 GP).' };
    case 'Jester': {
      updatePcActor(ctx, grantTimed(char, ['deck_jester'], 72 * 600));
      return { text: 'Advantage on attack rolls and saving throws for 72 hours.' };
    }
    case 'Key': {
      const pool = Object.values(SRD_ITEMS).filter(
        (l) =>
          l.type === 'weapon' &&
          (l.value ?? 0) >= 4000 &&
          !l.cursed &&
          isMagicItem(l) &&
          hasWeaponProficiency(char.weapon_proficiencies ?? [], l.weaponType, l)
      );
      if (!pool.length) return { text: 'a key turns in the air, but finds no lock.' };
      const [got] = giveItems(ctx, [pool[d(pool.length) - 1].id]);
      return { text: `a ${got} appears in your hands.` };
    }
    case 'Knight':
      joinParty(ctx, 'knight', 1);
      return { text: 'a Knight steps out of the light, sworn to serve you until death.' };
    case 'Moon': {
      const n = d(3);
      updatePcActor(ctx, { deck_wishes: (char.deck_wishes ?? 0) + n });
      return { text: `you may cast Wish ${n === 1 ? 'once' : `${n} times`}.` };
    }
    case 'Puzzle': {
      // Simplification: the score lost is Intelligence unless that's your main or
      // spellcasting ability (then Wisdom); no extra card is drawn.
      const ab: AbilityKey = primary === 'int' || casting === 'int' ? 'wis' : 'int';
      const lost = -shiftAbility(ctx, ab, -(d(4) + 1), 30);
      return { text: `your mind knots: ${named(ab)} -${lost}, for good.` };
    }
    case 'Rogue':
      return {
        text: 'somewhere, someone you know has turned against you — and you don’t know who.',
      };
    case 'Ruin':
      updatePcActor(ctx, { gold: 0 });
      return { text: 'every coin and scrap of wealth you own is gone.' };
    case 'Sage':
      return {
        text: 'once within the year, you may ask a question in meditation and receive a true answer.',
      };
    case 'Skull':
      return { text: 'a ghostly reaper in a tattered robe appears, hunting you alone.' };
    case 'Star': {
      const gained = shiftAbility(ctx, primary, 2, 24);
      return {
        text: gained
          ? `${named(primary)} +${gained}.`
          : `your ${named(primary)} is already as high as it can go.`,
      };
    }
    case 'Sun': {
      const pool = Object.values(SRD_ITEMS).filter(
        (l) =>
          l.type === 'misc' && (l.value === 400 || l.value === 4000) && !l.cursed && isMagicItem(l)
      );
      const [got] = pool.length ? giveItems(ctx, [pool[d(pool.length) - 1].id]) : [];
      updatePcActor(ctx, { sun_card: true });
      return {
        text: `${got ? `a ${got} appears on your person, and ` : ''}you'll gain 10 Temporary Hit Points every dawn for the rest of your life.`,
      };
    }
    case 'Talons': {
      const doomed = new Set(
        char.inventory.filter((i) => isMagicItem(itemById(ctx, i.id))).map((i) => i.instance_id)
      );
      let equipment = char.equipment ?? {};
      for (const id of doomed) equipment = clearInstance(equipment, id);
      const next = {
        ...char,
        inventory: char.inventory.filter((i) => !doomed.has(i.instance_id)),
        equipment,
        attuned_items: (char.attuned_items ?? []).filter((id) => !doomed.has(id)),
      };
      syncSetAbilities(next, ctx.context.lootTable);
      next.ac = characterAc(next, ctx.context.lootTable);
      updatePcActor(ctx, next);
      return {
        text: `every magic item ${char.name} carries crumbles to dust (${doomed.size} lost).`,
      };
    }
    case 'Throne': {
      // Simplification: the skill is the first of Persuasion, Intimidation,
      // Insight and History you lack Expertise in.
      const skill =
        ['Persuasion', 'Intimidation', 'Insight', 'History'].find(
          (sk) => !hasExpertise(char, sk)
        ) ?? 'Persuasion';
      updatePcActor(ctx, {
        skill_proficiencies: hasSkillProficiency(char, skill)
          ? char.skill_proficiencies
          : [...char.skill_proficiencies, skill],
        expertise_skills: [...new Set([...(char.expertise_skills ?? []), skill.toLowerCase()])],
      });
      return {
        text: `proficiency and Expertise in ${skill}, and the deed to a small keep — once you clear out the monsters living there.`,
      };
    }
    default:
      return { text: 'the card is blank.' };
  }
}

// ── Uncontrolled creatures ──────────────────────────────────────────────────

/** The acting PC's copy of the item being used. */
function usedItem(ctx: ActionContext, action: CastAction): InventoryItem | undefined {
  if (ctx.actor.kind !== 'pc' || !action.itemInstanceId) return undefined;
  return ctx.actor.char.inventory.find((i) => i.instance_id === action.itemInstanceId);
}

/** Merge `patch` into one of the acting PC's items. */
function patchItem(ctx: ActionContext, instanceId: string, patch: Partial<InventoryItem>): void {
  if (ctx.actor.kind !== 'pc') return;
  updatePcActor(ctx, {
    inventory: ctx.actor.char.inventory.map((i) =>
      i.instance_id === instanceId ? { ...i, ...patch } : i
    ),
  });
}

/** The item is spent: it leaves the pack (and any slot or attunement). */
function loseItem(ctx: ActionContext, instanceId: string): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  updatePcActor(ctx, {
    inventory: char.inventory.filter((i) => i.instance_id !== instanceId),
    equipment: clearInstance(char.equipment ?? {}, instanceId),
    attuned_items: (char.attuned_items ?? []).filter((id) => id !== instanceId),
  });
}

/**
 * SRD Efreeti Bottle — the first opening rolls 1d10: 1, the Efreeti attacks its
 * releaser and the bottle loses its magic; 10, it grants one Wish and the bottle
 * is spent; 2–9, it serves, and does again the next two openings — the fourth
 * time it escapes for good.
 */
function openEfreetiBottle(ctx: ActionContext, action: CastAction): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const inv = usedItem(ctx, action);
  if (!inv) return;
  const efreeti = SRD_MONSTERS.efreeti;
  const opens = typeof inv.bottle_opens === 'number' ? inv.bottle_opens : 0;
  const lead = `${char.name} pulls the stopper from the Efreeti Bottle. Smoke billows out and burns away in a flash of fire, leaving an Efreeti`;
  const tag = `${inv.instance_id}:efreeti_bottle`;
  if (opens >= 3) {
    loseItem(ctx, inv.instance_id);
    ctx.narrative = `${lead} — which laughs, bursts free of its service, and is gone. The bottle is only brass now.`;
    return;
  }
  const roll = opens === 0 ? d(10) : undefined;
  const rolled = roll !== undefined ? ` (d10: ${roll})` : '';
  if (roll === 1) {
    loseItem(ctx, inv.instance_id);
    ctx.narrative = `${lead}${rolled} — enraged at its long imprisonment, it turns on ${char.name}! The bottle's magic is spent.`;
    spawnHostile(ctx, efreeti, { tag: 'efreeti', hunts: char.id });
    return;
  }
  if (roll === 10) {
    loseItem(ctx, inv.instance_id);
    updatePcActor(ctx, { deck_wishes: (ctx.actor.char.deck_wishes ?? 0) + 1 });
    ctx.narrative = `${lead}${rolled} — grateful for its freedom, it offers ${char.name} a single Wish, then waits to grant it. The bottle's magic is spent.`;
    return;
  }
  patchItem(ctx, inv.instance_id, { bottle_opens: opens + 1 });
  ctx.st = {
    ...ctx.st,
    summoned_allies: (ctx.st.summoned_allies ?? []).filter((a) => a.fromItem !== tag),
  };
  joinAlly(ctx, { ...allyFrom(efreeti), fromItem: tag });
  const left = 2 - opens;
  ctx.narrative = `${lead}${rolled} — it bows, bound to obey ${char.name} until the next Long Rest, when it returns to the bottle.${left > 0 ? '' : ' It warns that it will not answer the stopper again.'}`;
}

/** SRD Iron Flask — creatures native to another plane. */
const OUTSIDER_TYPES = new Set(['celestial', 'elemental', 'fey', 'fiend']);

export function flaskCanTrap(enemy: Enemy | undefined): boolean {
  return !!enemy && OUTSIDER_TYPES.has(enemy.creatureType ?? '');
}

/** What an Iron Flask holds (absent ⇒ empty). */
export type FlaskCreature = {
  name: string;
  ac: number;
  maxHp: number;
  toHit: number;
  damage: string;
};

export function flaskContents(inv: InventoryItem | undefined): FlaskCreature | undefined {
  return (inv?.flask_creature as FlaskCreature | undefined) ?? undefined;
}

/**
 * SRD Iron Flask — the target makes a DC 17 Wisdom saving throw (Advantage if
 * the flask has held its kind before) or is trapped inside. Simplification: a
 * trapped creature counts as defeated (its XP is shared as for a kill).
 */
function trapInFlask(ctx: ActionContext, action: CastAction): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const inv = usedItem(ctx, action);
  const target = ctx.livingEnemiesInRoom.find((e) => e.id === action.targetEnemyId);
  if (!inv || !target) return;
  const ent = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy);
  const before = Array.isArray(inv.flask_trapped) ? (inv.flask_trapped as string[]) : [];
  const failedRoll = rollConditionSave(
    'wis',
    target.wis ?? 10,
    17,
    false,
    char.level,
    0,
    ent?.conditions ?? [],
    before.includes(target.name) || magicResistanceAdvantage(target)
  );
  const failed = legendaryResistInto(ctx, target, failedRoll);
  const lead = `${char.name} unstoppers the Iron Flask and levels it at the ${target.name}`;
  if (!failed) {
    ctx.narrative = `${lead}. It resists the pull (DC 17 Wisdom save succeeded).${ctx.narrative ?? ''}`;
    return;
  }
  patchItem(ctx, inv.instance_id, {
    flask_creature: {
      name: target.name,
      ac: target.ac,
      maxHp: target.maxHp ?? target.hp,
      toHit: target.toHit,
      damage: target.damage,
    } satisfies FlaskCreature,
    flask_trapped: [...new Set([...before, target.name])],
  });
  const split = splitEncounterXp(ctx.st, char.id, target.xp ?? 0);
  ctx.st = removeCombatant(split.st, target.id);
  ctx.st.enemies_killed = [...ctx.st.enemies_killed, target.id];
  updatePcActor(ctx, { xp: (ctx.actor.char.xp ?? 0) + split.share });
  ctx.narrative = `${lead} — it fails its DC 17 Wisdom save and is dragged, howling, into the flask (+${split.share} XP).`;
  if (ctx.st.combat_active && isRoomCleared(ctx.st, ctx.seed, ctx.st.current_room)) {
    ctx.st = endCombatState(ctx.st);
  }
}

/** SRD Iron Flask — the creature inside comes out and obeys its releaser. */
function releaseFromFlask(ctx: ActionContext, action: CastAction): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const inv = usedItem(ctx, action);
  const held = flaskContents(inv);
  if (!inv || !held) return;
  patchItem(ctx, inv.instance_id, { flask_creature: undefined });
  joinAlly(ctx, { ...held, fromItem: `${inv.instance_id}:iron_flask_release` });
  ctx.narrative = `${char.name} pulls the Iron Flask's stopper. The ${held.name} pours out and bends to ${char.name}'s commands — until the next Long Rest, when it goes its own way.`;
}

/**
 * SRD Pipes of the Sewers — the called Swarm of Rats makes a DC 15 Wisdom save:
 * on a failure it's swayed and fights for the piper until the battle ends; on a
 * success it behaves as rats do and attacks the party.
 */
function playPipes(ctx: ActionContext): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const swarm = SRD_MONSTERS.swarm_of_rats;
  const swayed = rollConditionSave('wis', swarm.wis ?? 10, 15);
  const lead = `${char.name} plays a shrill tune on the Pipes of the Sewers, and a Swarm of Rats pours out of the cracks`;
  if (swayed) {
    joinAlly(ctx, { ...allyFrom(swarm), untilCombatEnds: true });
    ctx.narrative = `${lead} — swayed by the music (DC 15 Wisdom save failed), it swarms to ${char.name}'s side for the rest of the fight.`;
    return;
  }
  ctx.narrative = `${lead} — but it shrugs off the music (DC 15 Wisdom save succeeded) and attacks the party!`;
  spawnHostile(ctx, swarm, { tag: 'rats' });
}

/**
 * SRD Pipes of the Sewers — rats and Giant Rats leave the bearer of attuned
 * pipes alone. Simplification: a rat that has been hurt no longer does.
 */
export function ratsIgnore(st: GameState, enemy: Enemy, enemyId: string): string[] {
  if (enemy.name !== 'Rat' && enemy.name !== 'Giant Rat') return [];
  const ent = st.entities?.find((e) => e.id === enemyId);
  if (ent && ent.hp < ent.maxHp) return [];
  return st.characters
    .filter((c) =>
      c.inventory.some(
        (i) => i.id === 'pipes_of_the_sewers' && (c.attuned_items ?? []).includes(i.instance_id)
      )
    )
    .map((c) => c.id);
}

/** SRD Mysterious Deck's Skull — the Avatar of Death that hunts the drawer. */
export function avatarOfDeath(char: Character): EnemyTemplate {
  return {
    name: 'Avatar of Death',
    creatureType: 'undead',
    cr: 0,
    xp: 0,
    hp: Math.max(1, Math.floor(char.max_hp / 2)),
    ac: 20,
    // Simplification: its Reaping Scythe "automatically hits"; it's given a
    // to-hit high enough that only a natural 1 misses.
    toHit: 30,
    damage: '1d8+3',
    damageType: 'slashing',
    bonusDamage: '1d8',
    bonusDamageType: 'necrotic',
    multiattack: Math.ceil(profBonus(char.level) / 2),
    str: 16,
    dex: 16,
    con: 16,
    int: 16,
    wis: 16,
    cha: 16,
    speedFt: 60,
    immunities: ['necrotic', 'poison'],
    condition_immunities: [
      'charmed',
      'exhaustion',
      'frightened',
      'paralyzed',
      'petrified',
      'poisoned',
      'unconscious',
    ],
  };
}
