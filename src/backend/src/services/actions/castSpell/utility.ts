import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { concentrationRoundsFor } from './utils.js';

/**
 * Utility-spell branch — spells with no damage, no save, no attack
 * roll, no condition. Just narrative + any spell-specific side effect.
 * Bless is the only RAW utility-shaped spell with a side effect today
 * (3-target concentration buff that grants the `blessed` condition);
 * future ones should land alongside as additional id-keyed branches.
 *
 * Returns `true` when handled, `false` when the spell falls through
 * to the offensive pipeline.
 */
export function runUtilitySpell(ctx: ActionContext, spell: Spell, slotNote: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (spell.damage || spell.savingThrow || spell.attackRoll || spell.condition) {
    return false;
  }

  const utilityProse = spell.narrative
    ? spell.narrative.replace('{name}', char.name)
    : `${char.name} casts ${spell.name}${slotNote}.`;
  composeNow(ctx, { kind: 'spell_utility', prose: utilityProse });

  // Bless (PHB p.219) — caster picks up to 3 creatures (RAW). Pansori
  // simplifies: caster + first 2 living non-caster party members are
  // blessed. Each gets +1d4 to attack rolls (saves are a follow-up).
  // Concentration links the buff to the caster — `blessed` clears
  // from all linked PCs when the Cleric's concentration drops.
  if (spell.id === 'bless') {
    // Mark caster as concentrating on bless. The runtime-mutated
    // `char` reference is what gets written back to state.
    char.concentrating_on = {
      spellId: 'bless',
      rounds_left: concentrationRoundsFor(spell),
    };
    // Pick the targets: caster (always) + up to 2 living allies.
    const blessTargets: string[] = [char.id];
    for (const c of ctx.st.characters) {
      // Cap at 3 targets per RAW. (PR 15 sed regression: had `return`
      // here, which exited the whole handler before the bless effect
      // ever applied. Tests didn't catch it because no test hits the
      // exact 4+-party-member path. Restored to `break`.)
      if (blessTargets.length >= 3) break;
      if (c.id === char.id || c.dead) continue;
      blessTargets.push(c.id);
    }
    const targetSet = new Set(blessTargets);
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) => {
        // The caster is mutated in place — don't overwrite our `char`
        // ref with a spread (it'd silently drop the concentrating_on
        // we just set). Skip; the post-cast state writeback handles it.
        if (c.id === char.id) return c;
        if (!targetSet.has(c.id) || (c.conditions ?? []).includes('blessed')) {
          return c;
        }
        return {
          ...c,
          conditions: [...(c.conditions ?? []), 'blessed'],
          condition_sources: {
            ...(c.condition_sources ?? {}),
            blessed: char.id,
          },
        };
      }),
    };
    // Apply blessed to the caster's local ref too.
    if (!(char.conditions ?? []).includes('blessed')) {
      char.conditions = [...(char.conditions ?? []), 'blessed'];
      char.condition_sources = {
        ...(char.condition_sources ?? {}),
        blessed: char.id,
      };
    }
    // Look up names for the ctx.narrative addendum.
    const blessedNames = blessTargets
      .map((id) => ctx.st.characters.find((c) => c.id === id)?.name ?? id)
      .join(', ');
    ctx.narrative += ` Blessed: ${blessedNames}.`;
  }

  // SRD: Beacon of Hope — same up-to-3-target concentration buff
  // shape as Bless, but grants the `hopeful` condition instead of
  // `blessed`. rollConditionSave gives advantage on WIS saves;
  // the death-save handler gives advantage on death-save d20s.
  if (spell.id === 'beacon_of_hope') {
    char.concentrating_on = {
      spellId: 'beacon_of_hope',
      rounds_left: concentrationRoundsFor(spell),
    };
    const hopefulTargets: string[] = [char.id];
    for (const c of ctx.st.characters) {
      if (hopefulTargets.length >= 3) break;
      if (c.id === char.id || c.dead) continue;
      hopefulTargets.push(c.id);
    }
    const targetSet = new Set(hopefulTargets);
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) => {
        if (c.id === char.id) return c;
        if (!targetSet.has(c.id) || (c.conditions ?? []).includes('hopeful')) {
          return c;
        }
        return {
          ...c,
          conditions: [...(c.conditions ?? []), 'hopeful'],
          condition_sources: {
            ...(c.condition_sources ?? {}),
            hopeful: char.id,
          },
        };
      }),
    };
    if (!(char.conditions ?? []).includes('hopeful')) {
      char.conditions = [...(char.conditions ?? []), 'hopeful'];
      char.condition_sources = {
        ...(char.condition_sources ?? {}),
        hopeful: char.id,
      };
    }
    const hopefulNames = hopefulTargets
      .map((id) => ctx.st.characters.find((c) => c.id === id)?.name ?? id)
      .join(', ');
    ctx.narrative += ` Hopeful: ${hopefulNames}.`;
  }

  // 2024 PHB Dimension Door (L4) — real grid teleport. Pansori MVP
  // auto-picks the cell with maximum min-distance to any living enemy
  // (the "safest" cell). The caster's grid entity moves there; movement
  // budget for the turn isn't consumed (RAW: teleport doesn't use
  // movement). Willing-creature passenger deferred. No-op when the
  // grid isn't populated — narrative-only fallback.
  if (spell.id === 'dimension_door' && ctx.st.entities) {
    const locationGrid = ctx.context.campaign?.locations?.find((l) =>
      l.rooms?.some((r) => r.id === ctx.roomId)
    );
    const gridW = locationGrid?.gridWidth ?? ctx.context.gridWidth ?? 10;
    const gridH = locationGrid?.gridHeight ?? ctx.context.gridHeight ?? 10;
    const currentRoomForDD = ctx.seed.rooms.find((r) => r.id === ctx.roomId);
    const roomObstacles = currentRoomForDD?.obstacles ?? [];
    const occupied = new Set(
      [
        ...ctx.st.entities.filter((e) => e.id !== char.id && e.hp > 0).map((e) => e.pos),
        ...roomObstacles,
      ].map((p) => `${p.x},${p.y}`)
    );
    const livingEnemyPositions = ctx.livingEnemiesInRoom
      .map((e) => ctx.st.entities?.find((ent) => ent.id === e.id && ent.isEnemy)?.pos)
      .filter((p): p is { x: number; y: number } => !!p);
    let bestCell: { x: number; y: number } | null = null;
    let bestDist = -1;
    for (let x = 0; x < gridW; x++) {
      for (let y = 0; y < gridH; y++) {
        if (occupied.has(`${x},${y}`)) continue;
        // Skip the caster's own current cell — no-op teleport.
        const casterEnt = ctx.st.entities.find((e) => e.id === char.id);
        if (casterEnt && casterEnt.pos.x === x && casterEnt.pos.y === y) continue;
        const minDistFromEnemy =
          livingEnemyPositions.length === 0
            ? 0
            : Math.min(
                ...livingEnemyPositions.map((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)))
              );
        if (minDistFromEnemy > bestDist) {
          bestDist = minDistFromEnemy;
          bestCell = { x, y };
        }
      }
    }
    if (bestCell) {
      const safe = bestCell;
      ctx.st = {
        ...ctx.st,
        entities: ctx.st.entities.map((e) => (e.id === char.id ? { ...e, pos: safe } : e)),
      };
      ctx.narrative += ` Reappears at (${safe.x}, ${safe.y}).`;
    }
  }

  return true;
}
