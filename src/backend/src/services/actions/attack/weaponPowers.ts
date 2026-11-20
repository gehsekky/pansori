// SRD 5.2.1 activated magic weapons — the on-hit layer the attack pipeline
// calls into: passive riders (with saves, temp HP, sworn-enemy gating), armed
// one-shot powers (Dagger of Venom, Staff of Striking / Withering / Thunder and
// Lightning), natural-20 death effects (Vorpal Sword, Nine Lives Stealer,
// Hammer of Thunderbolts' Giant's Bane), the Hammer's charged throw, the
// Oathbow's sworn enemy and the Javelin of Lightning's damage type.

import type {
  Character,
  Enemy,
  InventoryItem,
  LootItem,
  MagicRider,
  RiderSave,
} from '../../../types.js';
import { abilityMod, applyDamageMultiplier, rollCritical, rollDice } from '../../rulesEngine.js';
import { chargesLeft, markDaily, spendCharges } from '../../chargedItems.js';
import { enemySaveD20, legendaryResist } from '../../monsterSaves.js';
import type { ActionContext } from '../types.js';
import { distanceFeet } from '../../gridEngine.js';
import { fmt } from '../../narrativeFmt.js';
import { updatePcActor } from '../actor.js';

type Weapon = (LootItem & InventoryItem) | null;

const liveInv = (char: Character, instanceId: string | undefined) =>
  instanceId ? char.inventory?.find((i) => i.instance_id === instanceId) : undefined;

/** `n` copies of a single-die expression ("1d6" × 3 → "3d6"). */
function timesDice(expr: string, n: number): string {
  const m = expr.match(/^(\d+)d(\d+)$/);
  return m && n > 1 ? `${Number(m[1]) * n}d${m[2]}` : expr;
}

function setEnemyCondition(
  ctx: ActionContext,
  targetId: string,
  cond: string,
  rounds: number,
  saveEnds?: { ability: string; dc: number }
): void {
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === targetId && e.isEnemy
        ? {
            ...e,
            conditions: [...e.conditions.filter((c) => c !== cond), cond],
            condition_durations: { ...e.condition_durations, [cond]: rounds },
            ...(saveEnds
              ? {
                  save_ends: { ...e.save_ends, [cond]: saveEnds },
                  save_ends_acted: (e.save_ends_acted ?? []).filter((c) => c !== cond),
                }
              : {}),
          }
        : e
    ),
  } as typeof ctx.st;
}

/**
 * An enemy's save against an item effect (Magic Resistance applies; Legendary
 * Resistance only when a condition or death is at stake). Applies the save's
 * condition on a failure. Returns whether it saved and a narration note.
 */
export function enemyItemSave(
  ctx: ActionContext,
  target: Enemy,
  targetId: string,
  save: RiderSave,
  label: string,
  opts: { lethal?: boolean } = {}
): { saved: boolean; note: string } {
  const stat = ((target as unknown as Record<string, number>)[save.ability] ?? 10) as number;
  const total = enemySaveD20(target, true) + abilityMod(stat);
  const atStake = !!save.condition || !!opts.lethal;
  const lr = legendaryResist(ctx.st, { ...target, id: targetId }, total < save.dc, {
    damageOnly: !atStake,
  });
  const saved = !lr.failed;
  const ab = save.ability.toUpperCase();
  let note = `${label}: ${ab} ${total} vs DC ${save.dc} — ${saved ? 'saved' : 'failed'}${lr.note}`;
  if (!saved && save.condition) {
    if (target.condition_immunities?.includes(save.condition)) {
      note += ` (immune to ${save.condition})`;
    } else {
      setEnemyCondition(
        ctx,
        targetId,
        save.condition,
        save.rounds ?? 10,
        save.saveEnds ? { ability: save.ability, dc: save.dc } : undefined
      );
      note += ` — ${target.name} is ${save.condition.replace(/_/g, ' ')}`;
    }
  }
  return { saved, note };
}

export interface ItemHitOutcome {
  dmg: number;
  labels: string[];
  // Narration appended after the hit line (saves, slays, conditions).
  after: string[];
  tempHp: number;
}

/**
 * Every item rider on this hit: the weapon's (and fired ammunition's) passive
 * riders, an armed power, and a natural-20 death effect. Rolls saves and
 * applies their conditions; spends armed powers and charges. Returns the extra
 * damage (already adjusted for the target's defenses) to add to the hit.
 */
export function rollItemHit(
  ctx: ActionContext,
  args: {
    weaponItem: Weapon;
    target: Enemy;
    targetId: string;
    isCrit: boolean;
    natural20: boolean;
    curHp: number;
  }
): ItemHitOutcome {
  const out: ItemHitOutcome = { dmg: 0, labels: [], after: [], tempHp: 0 };
  const { weaponItem, target, targetId, isCrit } = args;
  if (ctx.actor.kind !== 'pc' || !weaponItem) return out;
  const pc = ctx.actor;
  const pcPos = ctx.st.entities?.find((e) => e.id === pc.char.id)?.pos;
  const tgtPos = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.pos;
  const ranged =
    weaponItem.range === 'ranged' ||
    (!!weaponItem.thrown && !!pcPos && !!tgtPos && distanceFeet(pcPos, tgtPos) > 5);
  const type = target.creatureType ?? '';
  const applies = (r: MagicRider) =>
    !(r.vsCreatureTypes && !r.vsCreatureTypes.includes(type)) &&
    !r.notVsCreatureTypes?.includes(type) &&
    !(r.onCrit && !isCrit) &&
    !(r.rangedOnly && !ranged) &&
    !(r.meleeOnly && ranged) &&
    !(r.vsSwornEnemy && pc.char.oath_sworn_id !== targetId);

  const fire = (r: MagicRider, dice: string) => {
    const dType = r.damageType ?? weaponItem.damageType ?? 'bludgeoning';
    const rolled = isCrit && !r.onCrit ? rollCritical(dice) : rollDice(dice);
    let dmg = applyDamageMultiplier(rolled, dType, target, { magical: true }).damage;
    if (r.save) {
      const res = enemyItemSave(ctx, target, targetId, r.save, r.label);
      out.after.push(res.note);
      if (res.saved && r.save.onSave === 'half') dmg = Math.floor(dmg / 2);
      if (res.saved && r.save.onSave === 'none') dmg = 0;
    }
    if (dmg > 0) {
      out.dmg += dmg;
      out.labels.push(`${r.label} ${dice}: +${dmg} ${dType}`);
      if (r.tempHpFromDamage) out.tempHp = Math.max(out.tempHp, dmg);
    }
  };

  for (const r of weaponItem.magicRiders ?? []) if (applies(r)) fire(r, r.dice);

  // An armed power fires on this hit with the weapon, then is spent.
  const inv = liveInv(pc.char, weaponItem.instance_id);
  const power = inv?.primed
    ? weaponItem.weaponPowers?.find((p) => p.id === inv.primed!.power)
    : undefined;
  if (inv?.primed && power && applies(power.rider)) {
    const n = Math.max(1, inv.primed.charges);
    if (power.rider.dice !== '0') fire(power.rider, timesDice(power.rider.dice, n));
    else if (power.rider.save) {
      out.after.push(
        enemyItemSave(ctx, target, targetId, power.rider.save, power.rider.label).note
      );
    }
    const char = { ...pc.char };
    char.inventory = char.inventory.map((i) =>
      i.instance_id === inv.instance_id ? { ...i, primed: undefined } : i
    );
    const spent = power.charges || power.maxCharges ? n * (power.charges ?? 1) : 0;
    const chargeNote = spent
      ? spendCharges(char, inv.instance_id, spent, ctx.context.lootTable)
      : '';
    updatePcActor(ctx, char);
    if (chargeNote) out.after.push(`${weaponItem.name}:${chargeNote}`);
  }

  // Natural-20 death effects.
  const cs = weaponItem.critSlay;
  if (args.natural20 && cs) {
    const wornOk =
      !cs.needsWorn ||
      Object.values(pc.char.equipment ?? {}).some((iid) => {
        const it = liveInv(pc.char, iid);
        return (
          !!it &&
          cs.needsWorn!.some((p) => it.id.startsWith(p)) &&
          (pc.char.attuned_items ?? []).includes(iid)
        );
      });
    const live = liveInv(pc.char, weaponItem.instance_id);
    const hasCharge = !cs.spendsCharge || (!!live && chargesLeft(live, weaponItem) > 0);
    const inScope =
      wornOk &&
      hasCharge &&
      !(cs.vsTypes && !cs.vsTypes.includes(type)) &&
      !(cs.maxHp !== undefined && args.curHp >= cs.maxHp);
    if (inScope) {
      const immune = !!cs.immuneTypes?.includes(type);
      let slain = false;
      if (cs.dc === undefined) {
        // Vorpal: no save; an immune creature (or a Legendary Resistance) takes the extra damage.
        const noHead = immune || !!target.immunities?.includes('slashing');
        const lr = noHead
          ? { failed: false, note: '' }
          : legendaryResist(ctx.st, { ...target, id: targetId }, true);
        slain = lr.failed;
        if (!slain && cs.elseDamage) {
          out.dmg += cs.elseDamage;
          out.labels.push(`${cs.label}: +${cs.elseDamage}`);
        }
        if (lr.note) out.after.push(lr.note.trim());
      } else if (!immune) {
        const res = enemyItemSave(ctx, target, targetId, { ability: 'con', dc: cs.dc }, cs.label, {
          lethal: true,
        });
        out.after.push(res.note);
        slain = !res.saved;
      }
      if (slain) {
        const tempHp = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.temp_hp ?? 0;
        out.dmg += args.curHp + tempHp;
        out.labels.push(`${cs.label}: slain outright!`);
        if (cs.spendsCharge) {
          const char = { ...pc.char };
          const note = spendCharges(char, weaponItem.instance_id, 1, ctx.context.lootTable);
          updatePcActor(ctx, char);
          out.after.push(`${weaponItem.name}:${note}`);
        }
      }
    }
  }
  return out;
}

/**
 * SRD Hammer of Thunderbolts — throwing it costs a charge. Called per attack:
 * `blocked` when a throw has no charge to spend; `thrown` when one was spent.
 */
export function spendThrowCharge(
  ctx: ActionContext,
  weaponItem: Weapon,
  targetId: string
): { blocked?: string; thrown: boolean } {
  if (ctx.actor.kind !== 'pc' || !weaponItem?.throwCharge) return { thrown: false };
  const pc = ctx.actor;
  const pcPos = ctx.st.entities?.find((e) => e.id === pc.char.id)?.pos;
  const tgtPos = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.pos;
  if (!pcPos || !tgtPos || distanceFeet(pcPos, tgtPos) <= 5) return { thrown: false };
  const inv = liveInv(pc.char, weaponItem.instance_id);
  if (!inv || chargesLeft(inv, weaponItem) <= 0) {
    return { blocked: `The ${weaponItem.name} has no charges left to hurl it.`, thrown: false };
  }
  const char = { ...pc.char };
  spendCharges(char, inv.instance_id, 1, ctx.context.lootTable);
  updatePcActor(ctx, char);
  return { thrown: true };
}

/**
 * The Hammer's thunderclap on a thrown hit: the target and every enemy within
 * `radiusFt` of it save or are Stunned until the end of the wielder's next turn.
 * Simplification: the wielder's allies in the area aren't caught.
 */
export function thunderclap(ctx: ActionContext, weaponItem: Weapon, targetId: string): string {
  const tc = weaponItem?.throwCharge;
  const center = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.pos;
  if (!tc || !center) return '';
  const notes: string[] = [];
  for (const e of ctx.st.entities ?? []) {
    if (!e.isEnemy || e.hp <= 0 || distanceFeet(center, e.pos) > tc.radiusFt) continue;
    const enemy = ctx.livingEnemiesInRoom.find((x) => x.id === e.id);
    if (!enemy) continue;
    const save: RiderSave = { ability: 'con', dc: tc.dc, condition: 'stunned', rounds: 1 };
    notes.push(enemyItemSave(ctx, enemy, e.id, save, `Thunderclap (${enemy.name})`).note);
  }
  return notes.length ? ` ${fmt.note(`[${notes.join('; ')}]`)}` : '';
}

/**
 * SRD Oathbow. A ranged attack with it swears the target as the wielder's
 * sworn enemy when none lives (and no fulfilled oath waits for dawn). Against
 * the sworn enemy: Advantage and no Half / Three-Quarters Cover. While the
 * sworn enemy lives, attacks with any other weapon have Disadvantage. The oath
 * lasts the encounter here.
 */
export function oathbowEdges(
  ctx: ActionContext,
  weaponItem: Weapon,
  targetId: string
): { advantage: boolean; disadvantage: boolean; ignoreCover: boolean; note: string } {
  const none = { advantage: false, disadvantage: false, ignoreCover: false, note: '' };
  if (ctx.actor.kind !== 'pc') return none;
  const pc = ctx.actor;
  let sworn = pc.char.oath_sworn_id;
  if (sworn) {
    const ent = ctx.st.entities?.find((e) => e.id === sworn && e.isEnemy);
    if (!ent || ent.hp <= 0) {
      // The oath is fulfilled — a new one waits for dawn.
      updatePcActor(ctx, { oath_sworn_id: undefined, oath_fulfilled: !!ent });
      sworn = undefined;
    }
  }
  if (weaponItem?.swornEnemy) {
    if (!sworn && !pc.char.oath_fulfilled) {
      updatePcActor(ctx, { oath_sworn_id: targetId });
      sworn = targetId;
      ctx.narrative += ` ${fmt.note('[Oathbow: "Swift death to you who have wronged me" — a sworn enemy]')}`;
    }
    if (sworn === targetId) {
      return { advantage: true, disadvantage: false, ignoreCover: true, note: 'sworn enemy' };
    }
    return none;
  }
  if (sworn) return { ...none, disadvantage: true, note: 'your sworn enemy lives' };
  return none;
}

/** SRD Javelin of Lightning — the damage type that hurts the target more. */
export function bestDamageType(weaponItem: Weapon, target: Enemy): string | undefined {
  const base = weaponItem?.damageType;
  const alt = weaponItem?.altDamageType;
  if (!alt || !base) return base;
  const hurt = (t: string) => applyDamageMultiplier(10, t, target, { magical: true }).damage;
  return hurt(alt) > hurt(base) ? alt : base;
}

/** Arm a power of the wielded weapon (validated); returns an error or the narration. */
export function primeWeaponPower(
  char: Character,
  instanceId: string,
  powerId: string,
  charges: number | undefined,
  lootTable: LootItem[]
): { error: string } | { note: string; bonusAction: boolean } {
  const inv = liveInv(char, instanceId);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  const power = loot?.weaponPowers?.find((p) => p.id === powerId);
  if (!inv || !loot || !power) return { error: 'That weapon has no such power.' };
  if (char.equipment?.main_hand !== instanceId)
    return { error: `You must wield the ${loot.name}.` };
  if (loot.requiresAttunement && !(char.attuned_items ?? []).includes(instanceId)) {
    return { error: `You must be attuned to the ${loot.name}.` };
  }
  if (inv.primed)
    return { error: `The ${loot.name}'s ${inv.primed.power} power is already armed.` };
  if (power.daily && (inv.powers_used ?? []).includes(power.id)) {
    return { error: `${power.label} can't be used again until dawn.` };
  }
  const n = power.maxCharges ? Math.min(power.maxCharges, Math.max(1, charges ?? 1)) : 1;
  const cost = power.charges || power.maxCharges ? n * (power.charges ?? 1) : 0;
  if (cost > chargesLeft(inv, loot)) {
    return { error: `The ${loot.name} doesn't have ${cost} charge${cost === 1 ? '' : 's'}.` };
  }
  char.inventory = char.inventory.map((i) =>
    i.instance_id === instanceId ? { ...i, primed: { power: power.id, charges: n } } : i
  );
  if (power.daily) markDaily(char, instanceId, power.id);
  const what = power.maxCharges ? ` (${n} charge${n === 1 ? '' : 's'})` : '';
  return {
    note: `${char.name} readies the ${loot.name}: ${power.label}${what} — it takes effect on the next hit.`,
    bonusAction: power.cost === 'bonus_action',
  };
}

/** Choices for arming the wielded weapon's powers. */
export function weaponPowerOptions(
  char: Character,
  lootTable: LootItem[]
): Array<{
  instanceId: string;
  power: string;
  charges?: number;
  label: string;
  bonusAction: boolean;
}> {
  const iid = char.equipment?.main_hand;
  const inv = liveInv(char, iid);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  if (!inv || !loot?.weaponPowers?.length || inv.primed) return [];
  if (loot.requiresAttunement && !(char.attuned_items ?? []).includes(inv.instance_id)) return [];
  const out: ReturnType<typeof weaponPowerOptions> = [];
  const left = chargesLeft(inv, loot);
  for (const p of loot.weaponPowers) {
    if (p.daily && (inv.powers_used ?? []).includes(p.id)) continue;
    const bonusAction = p.cost === 'bonus_action';
    if (bonusAction && char.turn_actions?.bonus_action_used) continue;
    const tag = bonusAction ? ' (bonus action)' : '';
    if (p.maxCharges) {
      for (let n = 1; n <= Math.min(p.maxCharges, left); n++) {
        out.push({
          instanceId: inv.instance_id,
          power: p.id,
          charges: n,
          label: `${loot.name} — ${p.label}: ${n} charge${n === 1 ? '' : 's'} on your next hit (+${timesDice(p.rider.dice, n)})${tag}`,
          bonusAction,
        });
      }
      continue;
    }
    if ((p.charges ?? 0) > left) continue;
    out.push({
      instanceId: inv.instance_id,
      power: p.id,
      label: `${loot.name} — ${p.label}${tag}`,
      bonusAction,
    });
  }
  return out;
}

/** SRD Quarterstaff of the Acrobat — Attack Deflection is ready. */
export function canDeflect(char: Character, lootTable: LootItem[]): boolean {
  const inv = liveInv(char, char.equipment?.main_hand);
  const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
  return (
    !!loot?.deflect &&
    (char.attuned_items ?? []).includes(inv!.instance_id) &&
    !char.class_resource_uses?.acrobat_deflect_used &&
    !char.turn_actions?.reaction_used &&
    !char.dead &&
    char.hp > 0
  );
}
