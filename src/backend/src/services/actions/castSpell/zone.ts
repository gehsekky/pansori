// RE-4 — persistent damage zones (Cloud of Daggers, Moonbeam, …).
//
// Mirrors the Wall of Fire pattern: on cast, place a `SpellZone` (footprint
// sized by blastRadius, centered on the target's cell) onto GameState, bind it
// to the caster's concentration, and tick it once immediately. Thereafter the
// round-wrap hook (`fireSpellZones` in gameEngine) ticks it each round, dealing
// `damage` (save-for-half if `savingThrow` is set) to hostiles standing in it.
// The zone is removed by `breakConcentration` when concentration ends.

import type { Spell, SpellZone } from '../../../types.js';
import { applyZoneTick, zoneCells } from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { concentrationRoundsFor } from './utils.js';
import { randomUUID } from 'crypto';
import { upcastDamage } from '../../rulesEngine.js';
import { updatePcActor } from '../actor.js';

export function runZoneSpell(
  ctx: ActionContext,
  spell: Spell,
  slotLevel: number,
  dc: number,
  targetId: string
): boolean {
  if (ctx.actor.kind !== 'pc' || !ctx.st.entities) return false;
  const pc = ctx.actor;
  // A `rangeKind: 'self'` zone (Spirit Guardians) is a caster-centered aura that
  // follows the caster; anything else is placed on the target enemy's cell.
  const follows = spell.rangeKind === 'self';
  const casterEnt = ctx.st.entities.find((e) => e.id === pc.char.id);
  let center;
  if (follows) {
    if (!casterEnt) return false;
    center = casterEnt.pos;
  } else {
    const targetEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (!targetEnt) return false;
    center = targetEnt.pos;
  }

  const gridW = ctx.context.gridWidth ?? 8;
  const gridH = ctx.context.gridHeight ?? 8;
  const radiusFt = spell.blastRadius ?? 5;
  const cells = zoneCells(center, radiusFt, gridW, gridH);
  const zone: SpellZone = {
    id: randomUUID(),
    casterId: pc.char.id,
    spellId: spell.id,
    name: spell.name,
    roomId: ctx.st.current_room,
    cells,
    // Bake the upcast-scaled dice once at cast; each tick rolls this expression.
    damage: upcastDamage(spell, slotLevel) || spell.damage || '1d4',
    damageType: spell.damageType ?? 'force',
    savingThrow: spell.savingThrow,
    saveEffect: spell.saveEffect,
    saveDC: dc,
    followsCaster: follows,
    radiusFt,
  };
  ctx.st = { ...ctx.st, spell_zones: [...(ctx.st.spell_zones ?? []), zone] };
  // Most zone spells are Concentration; the damage path doesn't stamp it, so
  // set it here to bind the zone's lifetime to the caster's concentration.
  if (spell.concentration) {
    updatePcActor(ctx, {
      concentrating_on: { spellId: spell.id, rounds_left: concentrationRoundsFor(spell) },
    });
  }
  ctx.narrative = `${pc.char.name} conjures ${spell.name}!`;
  // Tick once on cast against anything already standing in the area.
  const tick = applyZoneTick(ctx.st, zone, ctx.seed, ctx.context);
  ctx.st = tick.st;
  ctx.narrative += tick.narrative;
  ctx.usedInitiative = true;
  return true;
}
