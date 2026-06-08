import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import { SHILLELAGH_WEAPON_IDS, shillelaghDie } from '../../rulesEngine.js';
import { chebyshev, hasLineOfSight, inRange } from '../../gridEngine.js';
import { equippedShieldId, equippedWeaponId } from '../../equipment.js';
import { getItemData, pick } from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { BEAST_FORMS } from '../../../campaignData/srd/index.js';
import { updatePcActor } from '../actor.js';

/**
 * Pre-attack phase output. `done: true` means the handler should
 * return immediately (ctx.narrative and possibly ctx.usedInitiative
 * were set by the gate that fired); the rest of the attack pipeline
 * is skipped.
 *
 * `done: false` carries the resolved weapon/target context the
 * attack handler needs for the rest of the pipeline (combat-start,
 * to-hit computation, resolveOneAttack).
 */
export type PreattackResult =
  | { done: true }
  | {
      done: false;
      target: Enemy;
      targetId: string;
      weaponItem: (LootItem & InventoryItem) | null;
      weaponDamage: string | null;
      isVersatile: boolean;
      weaponLabel: string;
    };

/**
 * Pre-attack validation + weapon/target resolution. Combined into
 * one phase because each check below it depends on resolved state
 * above (range check needs target; weapon damage check needs the
 * weapon).
 *
 * Gates (each short-circuits with a narrative + return):
 *  - enemy / enemyAlive presence
 *  - grid range (when entities are on the grid)
 *  - charmed (can't attack the charmer)
 *  - paralyzed / stunned (consumes initiative — incapacitation)
 *  - ammo (ranged-non-thrown weapons: must have arrows / bolts /
 *    bullets matching the weapon kind; consumed on success)
 *
 * Weapon resolution:
 *  - getItemData lookup on equipped_weapon
 *  - SRD Beast Form override (Druid Wild Shape uses the form's
 *    natural attack damage)
 *  - Versatile: uses two-handed die when no shield equipped, OR
 *    when wielder has Flex mastery on the weapon (even with shield)
 */
export function runPreattack(
  ctx: ActionContext,
  action: { targetEnemyId?: string }
): PreattackResult {
  if (ctx.actor.kind !== 'pc') return { done: true };
  const pc = ctx.actor;
  if (!ctx.enemy) {
    ctx.narrative = pick(ctx.context.narratives.noEnemy);
    return { done: true };
  }
  if (!ctx.enemyAlive) {
    ctx.narrative = pick(ctx.context.narratives.alreadyDead);
    return { done: true };
  }

  // Resolve targeted enemy: explicit targetEnemyId wins; fallback to first living
  const targetEnemyId: string = action.targetEnemyId ?? ctx.enemy.id;
  const target: Enemy = ctx.livingEnemiesInRoom.find((e) => e.id === targetEnemyId) ?? ctx.enemy;
  const targetId = target.id;

  // Grid range check — only applies when combat entities are tracked on the grid
  if (ctx.st.entities) {
    const charEntity = ctx.st.entities.find((e) => e.id === pc.char.id);
    const enemyEntity = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEntity && enemyEntity) {
      const equippedWeaponItem = equippedWeaponId(pc.char)
        ? getItemData(
            pc.char.inventory?.find(
              (i) => i.instance_id === equippedWeaponId(pc.char)
            ) as InventoryItem,
            ctx.context
          )
        : null;
      if (!inRange(charEntity.pos, enemyEntity.pos, equippedWeaponItem)) {
        ctx.narrative = `Out of range. Move closer before attacking.`;
        return { done: true };
      }
      // SRD line of sight — a solid obstacle (wall / pillar) strictly between
      // attacker and target blocks the attack. Adjacent targets are exempt: a
      // melee reach can't be blocked by a corner, and the supercover diagonal
      // would otherwise clip the shared corner cell (matches coverBonus, which
      // also exempts adjacency).
      if (
        chebyshev(charEntity.pos, enemyEntity.pos) > 1 &&
        !hasLineOfSight(charEntity.pos, enemyEntity.pos, ctx.roomObstacleCells ?? [])
      ) {
        ctx.narrative = `No line of sight — something solid blocks the way to the ${target.name}.`;
        return { done: true };
      }
    }
  }

  // Charmed: cannot attack the charmer
  if (
    pc.char.conditions.includes('charmed') &&
    pc.char.charmer_id &&
    pc.char.charmer_id === targetId
  ) {
    ctx.narrative = `You are charmed by the ${target.name} and cannot bring yourself to attack them.`;
    return { done: true };
  }

  // Incapacitation is handled upstream in generateChoices (pass action);
  // guard here as a safety net.
  if (pc.char.conditions.includes('paralyzed') || pc.char.conditions.includes('stunned')) {
    ctx.narrative = `You cannot act while ${pc.char.conditions.find((c) => c === 'stunned' || c === 'paralyzed')}.`;
    ctx.usedInitiative = true;
    return { done: true };
  }

  const weaponItem = equippedWeaponId(pc.char)
    ? getItemData(
        pc.char.inventory?.find(
          (i) => i.instance_id === equippedWeaponId(pc.char)
        ) as InventoryItem,
        ctx.context
      )
    : null;
  let weaponDamage = weaponItem?.damage ?? null;
  // SRD Beast Forms — while shifted, the form's natural attack
  // damage replaces the equipped weapon's. The druid's own to-hit
  // (STR/DEX + prof) still applies — the form's RAW attack bonus is
  // similar in magnitude so the engine's calculated to-hit is a
  // reasonable proxy.
  if (pc.char.conditions.includes('wild_shaped') && pc.char.wild_shape_form) {
    const form = BEAST_FORMS[pc.char.wild_shape_form];
    if (form) weaponDamage = form.attackDamage;
  }
  // Versatile (SRD 5.2.1): use the larger two-handed damage die when no shield
  // is equipped (both hands free). (The Battleaxe now carries the RAW Topple
  // mastery; the old homebrew `flex` mastery — versatile die even with a shield
  // — has been retired.)
  const isVersatile = !!(weaponItem?.versatileDamage && !equippedShieldId(pc.char));
  if (isVersatile) {
    weaponDamage = weaponItem!.versatileDamage!;
  }
  // SRD Shillelagh — while the cantrip is active and a Club or Quarterstaff is
  // held, the weapon's damage die becomes the scaling Shillelagh die (overriding
  // its normal/versatile die). The ability swap (casting stat for STR) happens in
  // resolveOneAttack; this only sets the die.
  if (
    pc.char.shillelagh &&
    weaponItem &&
    (SHILLELAGH_WEAPON_IDS as readonly string[]).includes(weaponItem.id)
  ) {
    weaponDamage = shillelaghDie(pc.char.level);
  }
  const weaponLabel = weaponItem ? `Your ${weaponItem.name}` : 'Your fists';

  // ── Ammunition check (SRD) ──────────────────────────────────────
  if (weaponItem?.range === 'ranged' && !weaponItem.thrown) {
    // NOTE: order matters. 'hand_crossbow' includes both 'bow' and 'crossbow',
    // so 'crossbow' (and 'blowgun', which must beat 'bow') are checked first.
    // Firearms (musket/pistol) use their own bullets, distinct from a sling's.
    const ammoTypes: Record<string, string[]> = {
      crossbow: ['bolt', 'bolts'],
      blowgun: ['needle', 'needles'],
      bow: ['arrow', 'arrows'],
      sling: ['sling_bullet', 'sling_bullets'],
      musket: ['firearm_bullet', 'firearm_bullets'],
      pistol: ['firearm_bullet', 'firearm_bullets'],
    };
    const wepKey = Object.keys(ammoTypes).find((k) => weaponItem.id.includes(k)) ?? 'arrow';
    const ammoIds = ammoTypes[wepKey] ?? ['arrow', 'arrows'];
    const matches = (i: InventoryItem) => ammoIds.some((a) => i.id.includes(a));
    // Prefer the ammo equipped in the quiver slot; fall back to any matching
    // bundle loose in the pack (so unequipped ammo still fires).
    const quiverInst = pc.char.equipment?.quiver;
    let ammoIdx = quiverInst
      ? pc.char.inventory.findIndex((i) => i.instance_id === quiverInst && matches(i))
      : -1;
    if (ammoIdx === -1) ammoIdx = pc.char.inventory.findIndex(matches);
    if (ammoIdx === -1) {
      ctx.narrative = `You have no ammunition for your ${weaponItem.name}.`;
      return { done: true };
    }
    const ammoItem = pc.char.inventory[ammoIdx];
    const ammoCount = ammoItem.count ?? 1;
    if (ammoCount <= 1) {
      // Stack spent — drop the bundle, and clear the quiver slot if this was
      // the equipped one (so it doesn't dangle on a missing instance_id).
      const nextInventory = pc.char.inventory.filter((_, i) => i !== ammoIdx);
      if (pc.char.equipment?.quiver === ammoItem.instance_id) {
        const { quiver: _drop, ...restEquip } = pc.char.equipment ?? {};
        updatePcActor(ctx, { inventory: nextInventory, equipment: restEquip });
      } else {
        updatePcActor(ctx, { inventory: nextInventory });
      }
    } else {
      updatePcActor(ctx, {
        inventory: pc.char.inventory.map((item, i) =>
          i === ammoIdx ? { ...item, count: ammoCount - 1 } : item
        ),
      });
    }
  }

  return { done: false, target, targetId, weaponItem, weaponDamage, isVersatile, weaponLabel };
}
