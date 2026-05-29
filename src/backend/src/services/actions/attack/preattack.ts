import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import { chebyshev, hasLineOfSight, inRange } from '../../gridEngine.js';
import { getItemData, pick } from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { BEAST_FORMS } from '../../../contexts/srd/index.js';
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
 *  - 2024 PHB Beast Form override (Druid Wild Shape uses the form's
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
      const equippedWeaponItem = pc.char.equipped_weapon
        ? getItemData(
            pc.char.inventory?.find(
              (i) => i.instance_id === pc.char.equipped_weapon
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

  const weaponItem = pc.char.equipped_weapon
    ? getItemData(
        pc.char.inventory?.find((i) => i.instance_id === pc.char.equipped_weapon) as InventoryItem,
        ctx.context
      )
    : null;
  let weaponDamage = weaponItem?.damage ?? null;
  // 2024 PHB Beast Forms — while shifted, the form's natural attack
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
  const isVersatile = !!(weaponItem?.versatileDamage && !pc.char.equipped_shield);
  if (isVersatile) {
    weaponDamage = weaponItem!.versatileDamage!;
  }
  const weaponLabel = weaponItem ? `Your ${weaponItem.name}` : 'Your fists';

  // ── Ammunition check (PHB p.146) ──────────────────────────────────────
  if (weaponItem?.range === 'ranged' && !weaponItem.thrown) {
    // NOTE: order matters. 'hand_crossbow' includes both 'bow' and
    // 'crossbow' as substrings, so 'crossbow' must be checked first
    // or all crossbows would incorrectly look for arrows.
    const ammoTypes: Record<string, string[]> = {
      crossbow: ['bolt', 'bolts'],
      bow: ['arrow', 'arrows'],
      sling: ['bullet', 'bullets', 'sling_bullet'],
    };
    const wepKey = Object.keys(ammoTypes).find((k) => weaponItem.id.includes(k)) ?? 'arrow';
    const ammoIds = ammoTypes[wepKey] ?? ['arrow', 'arrows'];
    const ammoIdx = pc.char.inventory.findIndex((i) => ammoIds.some((a) => i.id.includes(a)));
    if (ammoIdx === -1) {
      ctx.narrative = `You have no ammunition for your ${weaponItem.name}.`;
      return { done: true };
    }
    const ammoItem = pc.char.inventory[ammoIdx];
    const ammoCount = (ammoItem.count as number | undefined) ?? 1;
    if (ammoCount <= 1) {
      updatePcActor(ctx, {
        inventory: pc.char.inventory.filter((_, i) => i !== ammoIdx),
      });
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
