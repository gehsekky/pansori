// SRD 5.2.1 wondrous items, round 3 (batch 8) — items that cast spells
// (necklaces, rings, helms, crystal balls, the Rod of Resurrection, the Robe of
// Stars, …) plus the Pearl of Power, the Robe of Eyes' Truesight and the
// Necklace of Adaptation.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attuneBlocker, itemCastOptions, spendCharges } from '../../services/chargedItems.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { syncSetAbilities, wornSaveBonus } from '../../services/wornEffects.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { truesightFt } from '../../services/multiclass.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const spellTable = { ...baseCtx.spellTable, ...SRD_SPELLS };
const ctx = { ...baseCtx, lootTable, spellTable };
const FOE = `${CORRIDOR_ID}#0`;

const foe = (): Enemy =>
  ({ id: FOE, name: 'Ogre', hp: 200, ac: 10, damage: '1d4', toHit: 3, xp: 10 }) as Enemy;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'W3',
  ship_name: 'W3',
  intro: '',
  seed_id: 'w3',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: [foe()] },
  loot: {},
  npcs: {},
};

/** A level-5 caster carrying `items` (id → equip slot or null), all attuned. */
function bearer(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const inventory = Object.keys(items).map((id, i) => ({
    instance_id: `i${i}`,
    id,
    name: SRD_ITEMS[id].name,
  }));
  const equipment: Record<string, string> = {};
  Object.values(items).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k}`;
  });
  const c = makeChar({
    id: 'pc-1',
    name: 'Mira',
    character_class: 'Wizard',
    level: 5,
    int: 16,
    hp: 30,
    max_hp: 30,
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    ...over,
  });
  syncSetAbilities(c, lootTable);
  return c;
}

function fight(c: Character, combat = true): GameState {
  return {
    ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: combat }),
    characters: [c],
    active_character_id: c.id,
    initiative_order: [
      { id: c.id, roll: 18, is_enemy: false },
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: c.id,
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: c.hp,
        maxHp: c.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: FOE,
        isEnemy: true,
        pos: { x: 4, y: 2 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

const run = (st: GameState, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state: st, seed, context: ctx });
const cast = (st: GameState, spellId: string, slotLevel: number, more = {}) =>
  run(st, { type: 'cast_spell', spellId, slotLevel, itemInstanceId: 'i0', ...more });
const foeHp = (st: GameState) => st.entities?.find((e) => e.id === FOE)?.hp;
const options = (c: Character) =>
  itemCastOptions(c, lootTable, spellTable).map((o) => `${o.spell.id}@${o.level}:${o.cost}`);

describe('catalog', () => {
  it('lists the round-3 wondrous items and validates', () => {
    for (const id of [
      'necklace_of_fireballs',
      'necklace_of_prayer_beads',
      'ring_of_shooting_stars',
      'circlet_of_blasting',
      'helm_of_teleportation',
      'eyes_of_charming',
      'rod_of_resurrection',
      'crystal_ball_of_true_seeing',
      'robe_of_stars',
      'pearl_of_power',
      'robe_of_eyes',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('every item spell names a spell in the catalog', () => {
    for (const item of Object.values(SRD_ITEMS)) {
      for (const is of item.itemSpells ?? [])
        expect(SRD_SPELLS[is.spellId], is.spellId).toBeDefined();
    }
  });
});

describe('Necklace of Fireballs', () => {
  it('a bead is a DC 15 Fireball; extra beads upcast it', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ necklace_of_fireballs: null });
    // Five beads reach the 12d6 cap (level 7).
    expect(options(c)).toEqual([
      'fireball@3:1',
      'fireball@4:2',
      'fireball@5:3',
      'fireball@6:4',
      'fireball@7:5',
    ]);
    const r = await cast(fight(c), 'fireball', 5, { targetEnemyId: FOE });
    expect(r.narrative).toMatch(/DC 15/);
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(3);
    expect(r.newState.characters[0].spell_slots_used?.[3] ?? 0).toBe(0);
    expect(foeHp(r.newState)).toBeLessThan(200);
  });

  it('the last bead uses the necklace up', () => {
    const c = bearer({ necklace_of_fireballs: null });
    c.inventory[0].charges_used = 4;
    const note = spendCharges(c, 'i0', 2, lootTable);
    expect(note).toMatch(/last of the Necklace of Fireballs/);
    expect(c.inventory).toHaveLength(0);
  });
});

describe('fixed attack bonus and once per dawn', () => {
  it('Circlet of Blasting: Scorching Ray at +5, then not again until dawn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ circlet_of_blasting: 'head' }, { int: 20 });
    const r = await cast(fight(c), 'scorching_ray', 2, { targetEnemyId: FOE });
    expect(r.narrative).toMatch(/\+5/);
    expect(r.narrative).not.toMatch(/\+8/);
    const c2 = r.newState.characters[0];
    expect(c2.inventory[0].powers_used).toContain('spell:scorching_ray');
    expect(options(c2)).toEqual([]);
  });
});

describe('self-only item spells', () => {
  it('Ring of Jumping casts Jump on its wearer, not an ally', async () => {
    const c = bearer({ ring_of_jumping: 'ring_1' });
    const ally = makeChar({ id: 'pc-2', name: 'Bo' });
    const st = { ...fight(c, false), characters: [c, ally] };
    const refused = await cast(st, 'jump', 1, { targetCharId: 'pc-2' });
    expect(refused.narrative).toMatch(/on its wearer only/);
    const ok = await cast(st, 'jump', 1);
    expect(ok.narrative).not.toMatch(/wearer only/);
    expect(ok.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
  });
});

describe('charge costs', () => {
  it('Eyes of Charming: 1 charge per Charm Person level, up to 3', () => {
    const c = bearer({ eyes_of_charming: 'head' });
    expect(options(c)).toEqual(['charm_person@1:1', 'charm_person@2:2', 'charm_person@3:3']);
  });

  it('Rod of Resurrection: Heal for 1 charge, Resurrection for all 5', () => {
    const c = bearer({ rod_of_resurrection: 'off_hand' });
    expect(options(c)).toEqual(['heal@6:1', 'resurrection@7:5']);
    c.inventory[0].charges_used = 1;
    expect(options(c)).toEqual(['heal@6:1']);
  });

  it('Robe of Stars: +1 to saves and a level-5 Magic Missile per star', () => {
    const c = bearer({ robe_of_stars: 'cloak' });
    expect(options(c)).toEqual(['magic_missile@5:1']);
    expect(wornSaveBonus(c, 'dex', lootTable)).toBe(1);
  });

  it('worn items cast only while worn', () => {
    const c = bearer({ helm_of_teleportation: null });
    expect(options(c)).toEqual([]);
  });
});

describe('Necklace of Prayer Beads', () => {
  it('needs a Cleric, Druid or Paladin to attune', () => {
    const wiz = bearer({});
    expect(attuneBlocker(wiz, SRD_ITEMS.necklace_of_prayer_beads)).toMatch(/Only cleric/);
    const cleric = bearer({}, { character_class: 'Cleric' });
    expect(attuneBlocker(cleric, SRD_ITEMS.necklace_of_prayer_beads)).toBeNull();
  });

  it('each bead once per dawn; Curing is the level-2 Cure Wounds', () => {
    const c = bearer({ necklace_of_prayer_beads: 'neck' }, { character_class: 'Cleric' });
    const opts = options(c);
    expect(opts).toContain('cure_wounds@2:0');
    expect(opts).toContain('bless@1:0');
    expect(opts).toHaveLength(6);
  });
});

describe('Pearl of Power', () => {
  it('works from the pack: restores the highest expended slot of level 3 or lower', async () => {
    const c = bearer({ pearl_of_power: null }, { spell_slots_used: { 1: 2, 3: 1 } });
    const st = fight(c, false);
    expect(
      generateChoices(st, seed, ctx).some((ch) => /Pearl of Power — Regain/.test(ch.label))
    ).toBe(true);
    const r = await run(st, { type: 'use', itemId: 'pearl_of_power' });
    const after = r.newState.characters[0];
    expect(r.narrative).toMatch(/regains a level 3 spell slot/);
    expect(after.spell_slots_used).toEqual({ 1: 2, 3: 0 });
    const again = await run(r.newState, { type: 'use', itemId: 'pearl_of_power' });
    expect(again.narrative).toMatch(/until dawn/);
  });

  it('does nothing without an expended slot', async () => {
    const c = bearer({ pearl_of_power: null });
    const r = await run(fight(c, false), { type: 'use', itemId: 'pearl_of_power' });
    expect(r.narrative).toMatch(/no expended spell slot/);
    expect(r.newState.characters[0].inventory[0].powers_used).toBeUndefined();
  });

  it('only a spellcaster can attune', () => {
    const fighter = bearer({}, { character_class: 'Fighter' });
    expect(attuneBlocker(fighter, SRD_ITEMS.pearl_of_power)).toMatch(/spellcaster/);
  });
});

describe('worn senses', () => {
  it('Robe of Eyes: Truesight and Darkvision 120 ft, Perception Advantage', () => {
    const c = bearer({ robe_of_eyes: 'cloak' });
    expect(truesightFt(c)).toBe(120);
    expect(c.darkvision_ft).toBe(120);
    expect(c.worn_traits?.skillAdvantage).toContain('perception');
  });

  it('Necklace of Adaptation: Advantage against Poisoned', () => {
    const c = bearer({ necklace_of_adaptation: 'neck' });
    expect(c.worn_traits?.poisonSaveAdvantage).toBe(true);
  });

  it('Cloak of Arachnida: Poison Resistance and a Climb Speed', () => {
    const c = bearer({ cloak_of_arachnida: 'cloak' });
    expect(c.worn_traits?.resistances).toContain('poison');
    expect(c.worn_traits?.climbFt).toBe('walk');
  });
});
