import type { Spell, SpellZone } from '../../../types.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { concentrationRoundsFor } from './utils.js';
import { lightReaches } from '../../gridEngine.js';
import { randomUUID } from 'crypto';
import { zoneCells } from '../../gameEngine.js';

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
export function runUtilitySpell(
  ctx: ActionContext,
  spell: Spell,
  slotNote: string,
  // SRD Bless — the party members the caster chose (via the FE target picker).
  // When provided, Bless affects this validated subset instead of the auto-pick;
  // `slotLevel` sets the cap (3 + slots above 1st).
  targetCharIds?: string[],
  slotLevel?: number
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  // A few spells have no damage/save/attack/condition but are NOT utility —
  // they need a living enemy target and resolve in the offensive pipeline
  // (castSpell/index.ts interception): Hunter's Mark (marks a target) and Power
  // Word Stun (HP-threshold Stun). Let them fall through.
  if (
    spell.damage ||
    spell.savingThrow ||
    spell.attackRoll ||
    spell.condition ||
    spell.id === 'hunters_mark' ||
    spell.id === 'power_word_stun'
  ) {
    return false;
  }

  const utilityProse = spell.narrative
    ? spell.narrative.replace('{name}', char.name)
    : `${char.name} casts ${spell.name}${slotNote}.`;
  composeNow(ctx, { kind: 'spell_utility', prose: utilityProse });

  // SRD Vision & Light — Light (20 ft bright) / Daylight (60 ft bright) make the
  // caster a light source: their grid entity sheds bright light to that radius
  // (dim for the same again), so allies/enemies within it can be SEEN in a dark
  // room — counterplay to the darkness blind-combat penalties. Stamped on the
  // caster's entity (read via `isIlluminated`); narrative-only off the grid.
  if ((spell.id === 'light' || spell.id === 'daylight') && ctx.st.entities) {
    const brightRadiusFt = spell.id === 'daylight' ? 60 : 20;
    const lightLevel = spell.level ?? 0;
    ctx.st = {
      ...ctx.st,
      entities: ctx.st.entities.map((e) =>
        e.id === char.id
          ? { ...e, light_radius_ft: brightRadiusFt, light_spell_level: lightLevel }
          : e
      ),
    };
    ctx.narrative += ` ${char.name} now sheds light (${brightRadiusFt} ft bright).`;

    // SRD Daylight (L3) — "If any of this spell's area overlaps with an area of
    // Darkness created by a spell of level 3 or lower, that other spell is
    // dispelled." Every magical-darkness zone in pansori is the L2 Darkness
    // spell (≤ 3), so any darkness zone the new sunlight reaches is banished;
    // its caster's concentration drops with it.
    if (spell.id === 'daylight') {
      const casterEnt = ctx.st.entities?.find((e) => e.id === char.id);
      const zones = ctx.st.spell_zones ?? [];
      const banished = casterEnt
        ? zones.filter((z) => z.blocksSight && lightReaches(casterEnt, z.cells))
        : [];
      if (banished.length > 0) {
        const banishedIds = new Set(banished.map((z) => z.id));
        const banishedCasterIds = new Set(banished.map((z) => z.casterId));
        ctx.st = {
          ...ctx.st,
          spell_zones: zones.filter((z) => !banishedIds.has(z.id)),
          characters: ctx.st.characters.map((c) =>
            c.id !== char.id &&
            banishedCasterIds.has(c.id) &&
            c.concentrating_on?.spellId === 'darkness'
              ? { ...c, concentrating_on: undefined }
              : c
          ),
        };
        // If the Daylight caster was itself holding the dispelled Darkness, clear
        // the in-place `char` ref too (the writeback prefers char's own fields).
        if (banishedCasterIds.has(char.id) && char.concentrating_on?.spellId === 'darkness') {
          char.concentrating_on = undefined;
        }
        ctx.narrative += ` Daylight banishes the magical darkness.`;
      }
    }
  }

  // SRD Darkness (L2) — a 15-ft-radius sphere of magical darkness. Its cells are
  // Heavily Obscured: Darkvision can't see through them and nonmagical light
  // can't illuminate them, so a creature inside (or peering in) is effectively
  // Blinded for combat unless it has Blindsight / Devil's Sight. Placed as a
  // `blocksSight` SpellZone centered on the targeted enemy (offensive) or the
  // caster (defensive), bound to concentration; `breakConcentration` removes it.
  if (spell.id === 'darkness' && ctx.st.entities) {
    const casterEnt = ctx.st.entities.find((e) => e.id === char.id);
    const targetEnt = ctx.enemy
      ? ctx.st.entities.find((e) => e.id === ctx.enemy!.id && e.isEnemy && e.hp > 0)
      : undefined;
    const center = (targetEnt ?? casterEnt)?.pos;
    if (center) {
      const gridW = ctx.context.gridWidth ?? 8;
      const gridH = ctx.context.gridHeight ?? 8;
      const radiusFt = spell.blastRadius ?? 15;
      const zone: SpellZone = {
        id: randomUUID(),
        casterId: char.id,
        spellId: 'darkness',
        name: 'Darkness',
        roomId: ctx.st.current_room,
        cells: zoneCells(center, radiusFt, gridW, gridH),
        damage: '0',
        damageType: 'none',
        blocksSight: true,
        radiusFt,
        center,
      };
      ctx.st = { ...ctx.st, spell_zones: [...(ctx.st.spell_zones ?? []), zone] };
      char.concentrating_on = {
        spellId: 'darkness',
        rounds_left: concentrationRoundsFor(spell) * (ctx.metamagic?.includes('extended') ? 2 : 1),
      };
      ctx.narrative += ` Magical darkness floods the area — Darkvision can't pierce it.`;

      // SRD Darkness (L2) — "If any of this spell's area overlaps with an area of
      // Bright Light or Dim Light created by a spell of level 2 or lower, that
      // other spell is dispelled." Snuff any light source whose lit area touches
      // the new darkness AND whose source spell is level ≤ 2 (the Light cantrip),
      // leaving higher-level light (Daylight, L3) untouched.
      let snuffed = false;
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) => {
          if ((e.light_spell_level ?? Infinity) <= 2 && lightReaches(e, zone.cells)) {
            snuffed = true;
            return { ...e, light_radius_ft: undefined, light_spell_level: undefined };
          }
          return e;
        }),
      };
      if (snuffed) ctx.narrative += ` The darkness snuffs out overlapping magical light.`;
    }
  }

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
      rounds_left: concentrationRoundsFor(spell) * (ctx.metamagic?.includes('extended') ? 2 : 1),
    };
    // SRD Bless — up to 3 creatures (+1 per slot above 1st). When the player
    // chose targets via the picker, honor that validated subset (living party
    // members, capped at the slot's max); otherwise auto-pick caster + the
    // first living allies.
    const blessMax = 3 + Math.max(0, (slotLevel ?? spell.level ?? 1) - (spell.level ?? 1));
    let blessTargets: string[];
    const livingIds = new Set(ctx.st.characters.filter((c) => !c.dead).map((c) => c.id));
    const chosen = (targetCharIds ?? []).filter((id) => livingIds.has(id));
    if (chosen.length > 0) {
      blessTargets = [...new Set(chosen)].slice(0, blessMax);
    } else {
      blessTargets = [char.id];
      for (const c of ctx.st.characters) {
        if (blessTargets.length >= blessMax) break;
        if (c.id === char.id || c.dead) continue;
        blessTargets.push(c.id);
      }
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
    // Apply blessed to the caster's local ref too — only when the caster is one
    // of the chosen targets (the player may have picked allies but not self).
    if (targetSet.has(char.id) && !(char.conditions ?? []).includes('blessed')) {
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
      rounds_left: concentrationRoundsFor(spell) * (ctx.metamagic?.includes('extended') ? 2 : 1),
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
