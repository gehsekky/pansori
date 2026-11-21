import type { ActionContext, ActionHandler } from '../types.js';
import type { Character, LootItem, Spell } from '../../../types.js';
import { classSpellListTag, hasExpertise, hasSkillProficiency } from '../../multiclass.js';
import { d, rollConditionSave, rollDice, skillCheck } from '../../rulesEngine.js';
import { hasSaveProficiency, pcDamageTaken } from '../../gameEngine.js';
import { maxCastableLevel, onSpellList } from '../../chargedItems.js';
import { ITEM_POWERS } from '../../../campaignData/srd/itemPowers.js';
import { SRD_ITEMS } from '../../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../../campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { applyDamage } from '../../damage.js';
import { randomUUID } from 'crypto';
import { updatePcActor } from '../actor.js';
import { wornSaveBonus } from '../../wornEffects.js';

type CastAction = {
  type: 'cast_spell';
  spellId: string;
  slotLevel: number;
  targetEnemyId?: string;
  targetCharId?: string;
  hatSpellId?: string;
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
export function hatBlocker(ctx: ActionContext, action: CastAction): string | null {
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
