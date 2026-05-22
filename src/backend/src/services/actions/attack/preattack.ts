import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import { getItemData, pick } from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { BEAST_FORMS } from '../../../contexts/srd/index.js';
import { inRange } from '../../gridEngine.js';

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
    const charEntity = ctx.st.entities.find((e) => e.id === ctx.char.id);
    const enemyEntity = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEntity && enemyEntity) {
      const equippedWeaponItem = ctx.char.equipped_weapon
        ? getItemData(
            ctx.char.inventory?.find(
              (i) => i.instance_id === ctx.char.equipped_weapon
            ) as InventoryItem,
            ctx.context
          )
        : null;
      if (!inRange(charEntity.pos, enemyEntity.pos, equippedWeaponItem)) {
        ctx.narrative = `Out of range. Move closer before attacking.`;
        return { done: true };
      }
    }
  }

  // Charmed: cannot attack the charmer
  if (
    ctx.char.conditions.includes('charmed') &&
    ctx.char.charmer_id &&
    ctx.char.charmer_id === targetId
  ) {
    ctx.narrative = `You are charmed by the ${target.name} and cannot bring yourself to attack them.`;
    return { done: true };
  }

  // Incapacitation is handled upstream in generateChoices (pass action);
  // guard here as a safety net.
  if (ctx.char.conditions.includes('paralyzed') || ctx.char.conditions.includes('stunned')) {
    ctx.narrative = `You cannot act while ${ctx.char.conditions.find((c) => c === 'stunned' || c === 'paralyzed')}.`;
    ctx.usedInitiative = true;
    return { done: true };
  }

  const weaponItem = ctx.char.equipped_weapon
    ? getItemData(
        ctx.char.inventory?.find(
          (i) => i.instance_id === ctx.char.equipped_weapon
        ) as InventoryItem,
        ctx.context
      )
    : null;
  let weaponDamage = weaponItem?.damage ?? null;
  // 2024 PHB Beast Forms — while shifted, the form's natural attack
  // damage replaces the equipped weapon's. The druid's own to-hit
  // (STR/DEX + prof) still applies — the form's RAW attack bonus is
  // similar in magnitude so the engine's calculated to-hit is a
  // reasonable proxy.
  if (ctx.char.conditions.includes('wild_shaped') && ctx.char.wild_shape_form) {
    const form = BEAST_FORMS[ctx.char.wild_shape_form];
    if (form) weaponDamage = form.attackDamage;
  }
  // Versatile: use two-handed damage when no shield is equipped. 2024
  // PHB Flex mastery (longsword, battleaxe, warhammer) lets a trained
  // wielder use the versatile die EVEN with a shield equipped.
  const hasFlexMastery =
    weaponItem?.mastery === 'flex' && (ctx.char.weapon_masteries ?? []).includes(weaponItem.id);
  const isVersatile = !!(
    weaponItem?.versatileDamage &&
    (!ctx.char.equipped_shield || hasFlexMastery)
  );
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
    const ammoIdx = ctx.char.inventory.findIndex((i) => ammoIds.some((a) => i.id.includes(a)));
    if (ammoIdx === -1) {
      ctx.narrative = `You have no ammunition for your ${weaponItem.name}.`;
      return { done: true };
    }
    const ammoItem = ctx.char.inventory[ammoIdx];
    const ammoCount = (ammoItem.count as number | undefined) ?? 1;
    if (ammoCount <= 1) {
      ctx.char = {
        ...ctx.char,
        inventory: ctx.char.inventory.filter((_, i) => i !== ammoIdx),
      };
    } else {
      ctx.char = {
        ...ctx.char,
        inventory: ctx.char.inventory.map((item, i) =>
          i === ammoIdx ? { ...item, count: ammoCount - 1 } : item
        ),
      };
    }
  }

  return { done: false, target, targetId, weaponItem, weaponDamage, isVersatile, weaponLabel };
}
