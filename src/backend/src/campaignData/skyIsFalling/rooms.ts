// Act I rooms. Two kinds:
//   - Town interiors (reached from silverford venues): the five spine NPCs +
//     Halda's rat-infested store. Bright/indoor, small grids, an `ascends` exit
//     back to the town.
//   - Marsh locals (reached from sunder_carr sites): the forensic trail. Dim,
//     with `difficult`/`swim` cells so Cassian's melee and Julian's ranged
//     spells play differently, and the living-marsh attrition matters against
//     the clock. The Thicket chains thicket_approach → thicket_ashpit →
//     tomb_mound; the causeway and Vane's camp are their own one-room legs.
//
// Forensic clues are room OBJECTS with onFound consequences (set the evidence
// flag on a successful Investigation/Perception search) — no placeholder loot
// items. Enemies reference the reskin bestiary (monsters.ts) by flavor name.

import { DOCKHAND, HALDA, LOGGER_WIFE, LORIEN, MARTHA, VANE, VARGIS } from './npcs.js';
import type { CampaignRoom } from '../../services/campaignContent.js';

// A w×h grid of empty cells; callers overwrite specific cells for terrain.
const grid = (w: number, h: number) =>
  Array.from({ length: h }, () =>
    Array.from(
      { length: w },
      () => ({}) as { t?: string; m?: 'obstacle' | 'difficult' | 'climb' | 'swim' | 'cover' }
    )
  );

// A marsh grid: empty, with a scatter of peat (difficult) and a water channel
// (swim) so the terrain mechanics actually bite. Deterministic (no RNG).
function marshGrid(w: number, h: number) {
  const g = grid(w, h);
  for (let x = 0; x < w; x++) g[Math.floor(h / 2)][x] = { t: 'water', m: 'swim' }; // a channel across the middle
  for (let y = 0; y < h; y++) {
    if (y !== Math.floor(h / 2)) {
      g[y][1] = { t: 'mud', m: 'difficult' };
      g[y][w - 2] = { t: 'mud', m: 'difficult' };
    }
  }
  return g;
}

export const ROOMS: CampaignRoom[] = [
  // ── Town interiors ────────────────────────────────────────────────────────
  {
    id: 'garrison_hall_room',
    name: 'The Malgovian Garrison Hall',
    desc:
      'A long timber hall under crossed banners of crimson and bone-white. Maps ' +
      'and muster-rolls cover a central table; the air is all lamp-oil and dread.',
    floor: 'cobblestone',
    entryPos: { x: 3, y: 5 },
    grid: grid(7, 6),
    npcs: [{ ...VARGIS, pos: { x: 3, y: 1 } }],
    exits: [{ pos: { x: 3, y: 5 }, ascends: true, label: 'Out to Silverford' }],
  },
  {
    id: 'docks_room',
    name: 'Silverford Docks',
    desc:
      'A creaking boardwalk on giant-bone pilings. Fishers mend nets, smugglers ' +
      'pretend not to watch, and the marsh breathes its rot up between the planks.',
    floor: 'cobblestone',
    entryPos: { x: 4, y: 6 },
    grid: grid(8, 7),
    npcs: [
      { ...DOCKHAND, pos: { x: 2, y: 2 } },
      { ...LOGGER_WIFE, pos: { x: 6, y: 2 } },
    ],
    exits: [{ pos: { x: 4, y: 6 }, ascends: true, label: 'Into Silverford' }],
  },
  {
    id: 'lorien_den_room',
    name: "Lorien's Den",
    desc:
      'The back room of a smuggler’s stilt-shack: crates of brine and gun-oil, a ' +
      'single shuttered lamp, and an elf who has outlived three empires’ worth of law.',
    floor: 'cobblestone',
    lighting: 'dim',
    entryPos: { x: 3, y: 5 },
    grid: grid(7, 6),
    npcs: [{ ...LORIEN, pos: { x: 3, y: 1 } }],
    objects: [
      {
        id: 'stashed_crate',
        name: 'Brine Barrels',
        desc: 'A row of brine barrels against the back wall, one set slightly askew.',
        interactText: 'You shoulder the barrels aside, looking for what shouldn’t be there.',
        searchSkill: 'investigation',
        searchDC: 12,
        foundText:
          'Behind the barrels: a flat crate stamped with a rival’s mark. Lorien’s ' +
          '"misplaced" goods. You tuck it where he’ll find it.',
        onFound: [{ type: 'set_flag', key: 'found_crate', value: true }],
      },
    ],
    exits: [{ pos: { x: 3, y: 5 }, ascends: true, label: 'Out to Silverford' }],
  },
  {
    id: 'store_room',
    name: 'Bremmer’s General Store',
    desc:
      'Shelves of frontier sundries — what the rats haven’t chewed. Squealing and ' +
      'scrabbling come from the dark stockroom; Halda is wedged behind an ' +
      'overturned counter with a broom.',
    floor: 'cobblestone',
    entryPos: { x: 4, y: 6 },
    grid: grid(8, 7),
    // The venue starts as a combat room: a pack of giant rats (Pack Tactics).
    // Clearing them flips Halda to merchant (see rules.ts).
    enemies: [{ name: 'Giant Rat', count: 5 }],
    npcs: [{ ...HALDA, pos: { x: 1, y: 1 } }],
    exits: [{ pos: { x: 4, y: 6 }, ascends: true, label: 'Out to Silverford' }],
  },
  {
    id: 'vault_room',
    name: 'The Gavel Relic Vault',
    desc:
      'A cramped neutral vault of the Iron Gavel, lined with reliquaries behind ' +
      'iron lattice. A blind diviner sits among them, listening to things no one ' +
      'else can hear.',
    floor: 'cobblestone',
    lighting: 'dim',
    entryPos: { x: 3, y: 5 },
    grid: grid(7, 6),
    npcs: [{ ...MARTHA, pos: { x: 3, y: 1 } }],
    exits: [{ pos: { x: 3, y: 5 }, ascends: true, label: 'Out to Silverford' }],
  },

  // ── Marsh locals: the forensic trail ────────────────────────────────────────
  {
    id: 'thicket_approach',
    name: 'Scorched Treeline',
    desc:
      'The ironwoods thin into a black scar of stumps. Ash drifts on the standing ' +
      'water. Something the size of a wagon-tarp of flies lifts off the carrion ahead.',
    floor: 'dirt',
    lighting: 'dim',
    entryPos: { x: 4, y: 7 },
    grid: marshGrid(8, 8),
    enemies: [{ name: 'Carrion Swarm', count: 1 }],
    objects: [
      {
        id: 'thicket_tracks',
        name: 'Boot Tracks in the Ash',
        desc: 'Pressed into the cooling ash: bootprints, marching in step. Too orderly for refugees.',
        interactText: 'You crouch over the prints, reading their spacing and depth.',
        searchSkill: 'perception',
        searchDC: 12,
        foundText:
          'Soldiers’ boots, not loggers’ — and they left *after* the fire, walking ' +
          'a tidy column. Nobody fled this place. They inspected it.',
        onFound: [{ type: 'set_flag', key: 'clue_tracks', value: true }],
      },
    ],
    exits: [
      { pos: { x: 4, y: 0 }, toRoomId: 'thicket_ashpit', label: 'Deeper into the ruin' },
      { pos: { x: 4, y: 7 }, ascends: true, label: 'Back to the Sunder-Carr' },
    ],
  },
  {
    id: 'thicket_ashpit',
    name: 'The Central Ash-Pit',
    desc:
      'The heart of Miller’s Thicket, fused to black glass. Whatever burned here ' +
      'burned without smoke-stain or spread — a clean, contained, *deliberate* heat.',
    floor: 'dirt',
    lighting: 'dim',
    entryPos: { x: 4, y: 7 },
    grid: marshGrid(8, 8),
    enemies: [{ name: 'Peat Ghoul', count: 2 }],
    objects: [
      {
        id: 'scorch_pattern',
        name: 'The Scorch Pattern',
        desc:
          'The burn radiates from a single point in geometric rings — not the ' +
          'ragged sprawl of an oil fire.',
        interactText: 'Julian kneels at the glassed earth, measuring the rings against his charts.',
        searchSkill: 'investigation',
        searchDC: 13,
        foundText:
          'The heat bloomed from one point, perfectly symmetrical, and *stopped* at ' +
          'a clean edge. No raider’s torch does this. Something focused did — and ' +
          'whoever walked the ash afterward wanted it found a certain way.',
        onFound: [{ type: 'set_flag', key: 'clue_burn', value: true }],
      },
    ],
    exits: [
      { pos: { x: 4, y: 0 }, toRoomId: 'tomb_mound', label: 'Up the tomb-mound' },
      { pos: { x: 4, y: 7 }, toRoomId: 'thicket_approach', label: 'Back toward the treeline' },
    ],
  },
  {
    id: 'tomb_mound',
    name: 'Desecrated Giant Tomb-Mound',
    desc:
      'A barrow built on a giant’s ribcage, its capstone levered aside. The air ' +
      'hums at the edge of hearing, and the dark inside drinks the light.',
    floor: 'cobblestone',
    lighting: 'dark',
    entryPos: { x: 4, y: 7 },
    grid: marshGrid(8, 8),
    enemies: [{ name: 'Bog Lurker', count: 1 }],
    objects: [
      {
        id: 'tomb_cache',
        name: 'The Cracked Reliquary',
        desc: 'A vault-niche in the barrow wall, its seal broken, something cold still inside.',
        interactText: 'Julian reaches into the niche, tools first.',
        searchSkill: 'investigation',
        searchDC: 14,
        lootIds: ['chrono_shard'],
        foundText:
          'His fingers close on a jagged shard of cold grey metal. Wiped clean, it ' +
          'throws a flickering wireframe map of the whole Sunder-Carr into the air — ' +
          'then drinks the light back. Not a relic. A *sensor*.',
        onFound: [{ type: 'set_flag', key: 'found_shard', value: true }],
      },
      {
        id: 'drone_husk',
        name: 'Half-Buried Husk',
        desc: 'Something metal and many-jointed lies half-sunk in the peat, dormant, wrong.',
        interactText: 'You brush the peat from the half-buried shape.',
        searchSkill: 'perception',
        searchDC: 13,
        foundText:
          'A carapace of stamped grey metal, jointed like an insect, its single lens ' +
          'dark. It is not dead — it is *off*. You leave it. (You will remember it.)',
        onFound: [{ type: 'set_flag', key: 'found_husk', value: true }],
      },
    ],
    exits: [{ pos: { x: 4, y: 7 }, ascends: true, label: 'Back down the mound' }],
  },
  {
    id: 'causeway',
    name: 'The Drowned Causeway',
    desc:
      'A sunken stone road, ankle-deep and crumbling, threading the open bog. ' +
      'Reeds hiss. A lone trooper stands too still in the water ahead.',
    floor: 'cobblestone',
    lighting: 'dim',
    entryPos: { x: 4, y: 7 },
    grid: marshGrid(8, 8),
    enemies: [
      { name: 'Mire Constrictor', count: 1 },
      { name: 'Subverted Trooper', count: 1, id: 'causeway#trooper' },
    ],
    objects: [
      {
        id: 'trooper_gear',
        name: 'The Trooper’s Gear',
        desc: 'The still trooper’s kit — standard issue, except for a tarnished sigil at the collar.',
        interactText: 'You search the trooper’s gear, turning the strange sigil to the light.',
        searchSkill: 'investigation',
        searchDC: 13,
        foundText:
          'Beneath the imperial tabard: a second insignia — a woven knot around a ' +
          'blank face. Not Malgovian. Not Valerion. And the man’s eyes, even now, ' +
          'are cold as a switched-off lamp. A third hand moves these soldiers.',
        onFound: [{ type: 'set_flag', key: 'clue_thirdparty', value: true }],
      },
      {
        id: 'sunken_locket',
        name: 'Glint in the Muck',
        desc: 'Something silver catches the grey light where the planks gave way.',
        interactText: 'You probe the muck where the causeway collapsed.',
        searchSkill: 'perception',
        searchDC: 12,
        foundText:
          'A silver locket, a heron worked on its face — Old Pell’s mother’s, lost ' +
          'when the planks gave. You wipe the mud from it and pocket it for him.',
        onFound: [{ type: 'set_flag', key: 'found_locket', value: true }],
      },
    ],
    exits: [{ pos: { x: 4, y: 7 }, ascends: true, label: 'Back to the Sunder-Carr' }],
  },
  {
    id: 'vane_command',
    name: 'Vanguard Command Tent',
    desc:
      'A pavilion of Valerion silver-and-white pitched on the only dry rise for a ' +
      'mile. Inside, every map is squared to the table’s edge, and Lucian Vane ' +
      'waits with a patience that is itself a threat.',
    floor: 'dirt',
    entryPos: { x: 3, y: 5 },
    grid: grid(7, 6),
    npcs: [{ ...VANE, pos: { x: 3, y: 1 } }],
    exits: [{ pos: { x: 3, y: 5 }, ascends: true, label: 'Back to the Sunder-Carr' }],
  },
];
