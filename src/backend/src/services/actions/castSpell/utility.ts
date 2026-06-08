import type { Spell, SpellZone } from '../../../types.js';
import { effectiveSpeed, zoneCells } from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { concentrationRoundsFor } from './utils.js';
import { lightReaches } from '../../gridEngine.js';
import { randomUUID } from 'crypto';
import { relocateToTown } from '../../mapEngine.js';
import { rollDice } from '../../rulesEngine.js';

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
  // (castSpell/index.ts interception): Hunter's Mark + Hex (mark/curse a target)
  // and Power Word Stun (HP-threshold Stun). Let them fall through.
  if (
    spell.damage ||
    spell.savingThrow ||
    spell.attackRoll ||
    spell.condition ||
    spell.wall || // barrier-only walls (Force / Stone) resolve in the wall path
    spell.id === 'hunters_mark' ||
    spell.id === 'hex' ||
    spell.id === 'power_word_stun' ||
    spell.id === 'true_strike' // resolves as a weapon attack in the offensive path
  ) {
    return false;
  }

  const utilityProse = spell.narrative
    ? spell.narrative.replace('{name}', char.name)
    : `${char.name} casts ${spell.name}${slotNote}.`;
  composeNow(ctx, { kind: 'spell_utility', prose: utilityProse });

  // SRD Expeditious Retreat — a bonus-action cast that grants the Dash action
  // this turn: extra movement equal to the caster's Speed. The grid budget is
  // `speed − movement_used`, so subtracting Speed (allowed to go negative — a
  // surplus) grants the full extra Speed regardless of whether the caster has
  // already moved. Concentration is set so the RAW "Dash as a Bonus Action on
  // later turns" can graduate later; pansori grants the immediate Dash now.
  if (spell.id === 'expeditious_retreat' && ctx.st.combat_active && ctx.st.entities) {
    const dashSpeed = effectiveSpeed(char, ctx.context.lootTable);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [char.id]: (ctx.st.movement_used?.[char.id] ?? 0) - dashSpeed,
      },
    };
    char.concentrating_on = {
      spellId: 'expeditious_retreat',
      rounds_left: concentrationRoundsFor(spell) * (ctx.metamagic?.includes('extended') ? 2 : 1),
    };
    ctx.narrative += ` ${char.name} surges ahead — an extra ${dashSpeed} ft of movement this turn.`;
  }

  // SRD Teleport / Teleportation Circle — open the destination interstitial:
  // generateChoices lists the VISITED towns until teleport_to / cancel
  // resolves it. (Precast guarantees at least one destination exists.)
  if (spell.townTeleport) {
    ctx.st = { ...ctx.st, pending_teleport: spell.id };
    ctx.narrative += ' Destinations shimmer at the edge of thought — choose where to arrive.';
  }

  // SRD Word of Recall — cast IN a town: designate it the sanctuary; cast
  // anywhere else: instant return to the designated sanctuary.
  if (spell.recall) {
    const hereTown = ctx.st.map_level === 'town' ? ctx.st.current_town_id : undefined;
    if (hereTown) {
      ctx.st = { ...ctx.st, recall_town_id: hereTown };
      const town = ctx.context.campaign?.towns?.find((t) => t.id === hereTown);
      ctx.narrative += ` ${town?.name ?? 'This town'} is consecrated as the party's sanctuary — Word of Recall will return here.`;
    } else if (ctx.st.recall_town_id) {
      const moved = relocateToTown(ctx.context.campaign, ctx.st, ctx.st.recall_town_id);
      if (moved) {
        ctx.st = moved.st;
        ctx.narrative += moved.narrative;
      } else {
        ctx.narrative += ' The sanctuary no longer answers the call.';
      }
    }
  }

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

  // SRD Fog Cloud (L1) / Silence (L2) — non-damage control zones centered on a
  // point in range (the targeted enemy if any, else the caster), bound to the
  // caster's concentration (`breakConcentration` / combat-end clear it).
  //   Fog Cloud  → a `blocksSight` zone (Heavily Obscured): Darkvision can't
  //     pierce it — the same combat-blinding machinery as Darkness, minus the
  //     light-dispel interaction. (RAW heavy obscurement; Devil's Sight piercing
  //     it is a rare MVP inaccuracy shared with Darkness.)
  //   Silence    → a `blocksVerbal` zone: a creature inside can't cast a spell
  //     with a Verbal component (enforced in precast).
  if ((spell.id === 'fog_cloud' || spell.id === 'silence') && ctx.st.entities) {
    const casterEnt = ctx.st.entities.find((e) => e.id === char.id);
    const targetEnt = ctx.enemy
      ? ctx.st.entities.find((e) => e.id === ctx.enemy!.id && e.isEnemy && e.hp > 0)
      : undefined;
    const center = (targetEnt ?? casterEnt)?.pos;
    if (center) {
      const gridW = ctx.context.gridWidth ?? 8;
      const gridH = ctx.context.gridHeight ?? 8;
      const radiusFt = spell.blastRadius ?? 20;
      const zone: SpellZone = {
        id: randomUUID(),
        casterId: char.id,
        spellId: spell.id,
        name: spell.name,
        roomId: ctx.st.current_room,
        cells: zoneCells(center, radiusFt, gridW, gridH),
        damage: '0',
        damageType: 'none',
        ...(spell.id === 'fog_cloud' ? { blocksSight: true } : { blocksVerbal: true }),
        radiusFt,
        center,
      };
      ctx.st = { ...ctx.st, spell_zones: [...(ctx.st.spell_zones ?? []), zone] };
      char.concentrating_on = {
        spellId: spell.id,
        rounds_left: concentrationRoundsFor(spell) * (ctx.metamagic?.includes('extended') ? 2 : 1),
      };
      ctx.narrative +=
        spell.id === 'fog_cloud'
          ? ` Fog swallows the area — sight can't reach through it.`
          : ` Utter quiet smothers the area — no verbal spell can be cast within.`;
    }
  }

  // SRD anti-magic suppression (Antimagic Field, Globe of Invulnerability) — a
  // caster-following, non-damage SpellZone (10-ft radius). `isSpellSuppressed`
  // reads it to fizzle spells that cross it. Bound to the caster's concentration;
  // `breakConcentration` / combat-end tear the zone down with every spell zone.
  if (spell.magicSuppression && ctx.st.entities) {
    const casterEnt = ctx.st.entities.find((e) => e.id === char.id);
    if (casterEnt) {
      const gridW = ctx.context.gridWidth ?? 8;
      const gridH = ctx.context.gridHeight ?? 8;
      const radiusFt = 10;
      const zone: SpellZone = {
        id: randomUUID(),
        casterId: char.id,
        spellId: spell.id,
        name: spell.name,
        roomId: ctx.st.current_room,
        cells: zoneCells(casterEnt.pos, radiusFt, gridW, gridH),
        damage: '0',
        damageType: 'none',
        suppressesMagic: true,
        suppressMaxLevel: spell.magicSuppression.maxLevel,
        suppressFromOutsideOnly: spell.magicSuppression.fromOutsideOnly,
        followsCaster: true,
        radiusFt,
        center: casterEnt.pos,
      };
      ctx.st = { ...ctx.st, spell_zones: [...(ctx.st.spell_zones ?? []), zone] };
      char.concentrating_on = {
        spellId: spell.id,
        rounds_left: concentrationRoundsFor(spell) * (ctx.metamagic?.includes('extended') ? 2 : 1),
      };
      ctx.narrative += spell.magicSuppression.fromOutsideOnly
        ? ` A shimmering globe forms — lesser magic from outside cannot reach within.`
        : ` An aura of dead magic spreads out — spells simply fail near ${char.name}.`;
    }
  }

  // SRD Time Stop — bank 1d4+1 extra turns. The turn-advance hook in takeAction
  // refreshes the caster's turn instead of passing to others while the bank is
  // > 0, and ends it the instant one of those turns affects an enemy.
  if (spell.grantsExtraTurns) {
    const turns = Math.max(1, rollDice(spell.grantsExtraTurns));
    char.time_stop_turns = turns;
    ctx.narrative += ` Time freezes — ${char.name} will act ${turns} more time${turns === 1 ? '' : 's'} before the world moves again.`;
  }

  // Bless (SRD) — caster picks up to 3 creatures (RAW). Pansori
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

  // SRD Dimension Door (L4) / Misty Step (L2) — real grid teleport.
  // Pansori MVP auto-picks the cell with maximum min-distance to any living
  // enemy (the "safest" cell). The caster's grid entity moves there; movement
  // budget for the turn isn't consumed (RAW: teleport doesn't use movement).
  // Misty Step is a bonus-action 30-ft (6-square) hop — the candidate cells are
  // capped to that radius; Dimension Door has no range cap. Willing-creature
  // passenger deferred. No-op when the grid isn't populated.
  if ((spell.id === 'dimension_door' || spell.id === 'misty_step') && ctx.st.entities) {
    const gridW = ctx.context.gridWidth ?? 10;
    const gridH = ctx.context.gridHeight ?? 10;
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
    const casterEnt = ctx.st.entities.find((e) => e.id === char.id);
    // Misty Step: 30 ft = 6 squares (5 ft/square). Dimension Door: anywhere.
    const rangeSquares = spell.id === 'misty_step' ? 6 : Infinity;
    let bestCell: { x: number; y: number } | null = null;
    let bestDist = -1;
    for (let x = 0; x < gridW; x++) {
      for (let y = 0; y < gridH; y++) {
        if (occupied.has(`${x},${y}`)) continue;
        // Skip the caster's own current cell — no-op teleport.
        if (casterEnt && casterEnt.pos.x === x && casterEnt.pos.y === y) continue;
        // Respect the spell's teleport range from the caster's current cell.
        if (
          casterEnt &&
          Math.max(Math.abs(casterEnt.pos.x - x), Math.abs(casterEnt.pos.y - y)) > rangeSquares
        ) {
          continue;
        }
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
