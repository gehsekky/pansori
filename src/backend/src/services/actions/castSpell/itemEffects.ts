import type { ActionContext, ActionHandler } from '../types.js';
import { d, rollConditionSave, rollDice } from '../../rulesEngine.js';
import { hasSaveProficiency, pcDamageTaken } from '../../gameEngine.js';
import { ITEM_POWERS } from '../../../campaignData/srd/itemPowers.js';
import { SRD_MONSTERS } from '../../../campaignData/srd/monsters.js';
import type { Spell } from '../../../types.js';
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

/** Run `spell` through the cast handler as a free cast from the item's table. */
function tableCast(
  ctx: ActionContext,
  cast: CastHandler,
  spell: Spell,
  lead: string,
  action: CastAction,
  extra: { targetCharId?: string; form?: { name: string; hp: number } } = {}
): void {
  const reach =
    !spell.itemPower && spell.rangeKind === 'ranged' && (spell.rangeFt ?? 0) < WAND_RANGE
      ? { ...spell, rangeFt: WAND_RANGE }
      : spell;
  ctx.tableCast = { name: 'Wand of Wonder', dc: WAND_DC, spell: reach, form: extra.form };
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
  const castSpell = (id: string, extra: Parameters<typeof tableCast>[5] = {}) => {
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
