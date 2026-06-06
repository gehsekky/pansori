import { describe, expect, it } from 'vitest';
import { generateSeed } from './procgen.js';
import { context as valeCtx } from '../campaignData/malgovia/index.js';

// ─── Campaign seed validation ────────────────────────────────────────────────
// Campaign contexts are authored content, not procedurally generated. The seed
// should mirror the campaign rooms/connections verbatim and populate NPCs from
// campaign.npcs (no longer always empty).

describe('generateSeed — Vale of Shadows campaign', () => {
  const seed = generateSeed(valeCtx, 1);

  it('uses campaign rooms verbatim', () => {
    expect(seed.rooms.map((r) => r.id)).toEqual(valeCtx.campaign!.rooms.map((r) => r.id));
  });

  it('places authored NPCs at their campaign-declared rooms', () => {
    // Vale binds Aldric (market), Sister Maren (temple), Dusk (slums).
    expect(seed.npcs?.npc_aldric?.id).toBe('npc_aldric');
    expect(seed.npcs?.npc_sister_maren?.id).toBe('npc_sister_maren');
    expect(seed.npcs?.npc_dusk?.id).toBe('npc_dusk');
  });

  it('rooms with placed NPCs are not enemy rooms', () => {
    for (const npc of Object.values(seed.npcs ?? {})) {
      expect(seed.enemies?.[npc.roomId] ?? []).toEqual([]);
    }
  });

  it('snapshots the campaign terrain-art overrides into the seed', () => {
    // Vale defines none — absent, not an empty object.
    expect(seed.terrain_art).toBeUndefined();
    const skinned = generateSeed(
      { ...valeCtx, terrainArt: { plains: 'plains-ash', water: 'water-murk' } },
      1
    );
    expect(skinned.terrain_art).toEqual({ plains: 'plains-ash', water: 'water-murk' });
  });
});

describe('generateSeed — Vale carries the folded Whispering Pines content', () => {
  // Whispering Pines is no longer a standalone campaign — its rooms, NPCs,
  // boss, loot, town, and region sites are folded into the Vale seed.
  const seed = generateSeed(valeCtx, 1);

  it('includes the folded Pines rooms + NPCs', () => {
    const roomIds = seed.rooms.map((r) => r.id);
    expect(roomIds).toContain('spire_ritual_apex');
    expect(roomIds).toContain('pines_tavern');
    expect(seed.npcs?.npc_brann?.id).toBe('npc_brann');
    expect(seed.npcs?.npc_riese?.id).toBe('npc_riese');
  });

  it('keeps the Pines boss (fire-vulnerable) + quest loot', () => {
    const boss = seed.enemies?.spire_ritual_apex?.[0];
    expect(boss?.name).toBe('Frost Acolyte');
    expect(boss?.vulnerabilities).toContain('fire');
    expect(seed.loot?.spire_ritual_apex?.[0]?.id).toBe('cult_idol');
  });

  it('drops new sites + the Pines town onto the Vale regional map', () => {
    const region = seed.regions?.[0];
    expect(region?.id).toBe('vale_region');
    expect(region?.sites.find((s) => s.townId === 'pines_village')).toBeTruthy();
    expect(region?.sites.find((s) => s.entryRoomId === 'spire_entrance')).toBeTruthy();
    expect(region?.encounterTable).toContain('Frost Wolf'); // Pines encounters appended
    expect(seed.towns?.find((t) => t.id === 'pines_village')).toBeTruthy();
  });
});

// ─── Campaign feature-coverage parity ────────────────────────────────────────
// Both campaigns should expose the full 12-class roster, 4 backgrounds, and
// the spell catalog (no longer a sandbox-only privilege).

describe('campaign feature parity', () => {
  const EXPECTED_CLASSES = [
    'Fighter',
    'Rogue',
    'Wizard',
    'Cleric',
    'Ranger',
    'Paladin',
    'Bard',
    'Druid',
    'Sorcerer',
    'Warlock',
    'Monk',
    'Barbarian',
  ];
  const EXPECTED_BACKGROUNDS = ['soldier', 'criminal', 'sage', 'acolyte'];
  const EXPECTED_SPELLS_SUBSET = [
    'fire_bolt',
    'misty_step',
    'fireball',
    'eldritch_blast',
    'healing_word',
    'shillelagh',
    'entangle',
    'charm_person',
    'sleep',
    'hold_person',
    'spiritual_weapon',
    'hex',
  ];

  for (const [label, ctx] of [['Vale of Shadows', valeCtx]] as const) {
    describe(label, () => {
      it('exposes all 12 classes in classPrimaryStats', () => {
        for (const cls of EXPECTED_CLASSES) {
          expect(ctx.classPrimaryStats[cls]).toBeDefined();
        }
      });

      it('every class has a starting loot entry', () => {
        for (const cls of EXPECTED_CLASSES) {
          expect(ctx.classStartingLoot?.[cls]?.length).toBeGreaterThan(0);
        }
      });

      it('starting loot items all resolve in the loot table', () => {
        const lootIds = new Set(ctx.lootTable.map((l) => l.id));
        for (const cls of EXPECTED_CLASSES) {
          for (const itemId of ctx.classStartingLoot?.[cls] ?? []) {
            expect(lootIds.has(itemId)).toBe(true);
          }
        }
      });

      it('Druid / Sorcerer / Warlock have spell lists and a casting ability', () => {
        for (const caster of ['Druid', 'Sorcerer', 'Warlock'] as const) {
          expect(ctx.classSpells?.[caster]?.length).toBeGreaterThan(0);
          expect(ctx.spellcastingAbility?.[caster]).toBeDefined();
        }
      });

      it('exposes 4 character backgrounds', () => {
        const ids = (ctx.backgrounds ?? []).map((b) => b.id);
        for (const bg of EXPECTED_BACKGROUNDS) {
          expect(ids).toContain(bg);
        }
      });

      it('spell table includes the previously-missing sandbox spells', () => {
        for (const sid of EXPECTED_SPELLS_SUBSET) {
          expect(ctx.spellTable?.[sid]).toBeDefined();
        }
      });
    });
  }

  it('Vale has a trap and a searchable object in the dungeon', () => {
    const charnel = valeCtx.campaign!.rooms.find((r) => r.id === 'dungeon_charnel_hall');
    expect(charnel?.trap?.id).toBe('charnel_hall_blade');
    const antechamber = valeCtx.campaign!.rooms.find((r) => r.id === 'dungeon_antechamber');
    expect(antechamber?.objects?.[0]?.id).toBe('funeral_urns');
    const garrison = valeCtx.campaign!.rooms.find((r) => r.id === 'millhaven_garrison');
    expect(garrison?.objects?.[0]?.id).toBe('captain_strongbox');
  });

  it('the folded Pines content keeps its trap and searchable object', () => {
    const frozenHall = valeCtx.campaign!.rooms.find((r) => r.id === 'spire_frozen_hall');
    expect(frozenHall?.trap?.id).toBe('frozen_hall_icicle');
    const lodge = valeCtx.campaign!.rooms.find((r) => r.id === 'pines_lodge');
    expect(lodge?.objects?.[0]?.id).toBe('trapper_locker');
  });
});
