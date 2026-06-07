// SRD bestiary additions — verify the new shared monsters register with their
// SRD 5.2.1 core stat line + the effect fields the engine honors.

import { describe, expect, it } from 'vitest';
import { SRD_MONSTERS } from './monsters.js';
import { readFileSync } from 'fs';

// [id, cr, hp, ac, damage, toHit, xp, multiattack?]
const NEW_MONSTERS: Array<[string, number, number, number, string, number, number, number?]> = [
  ['kobold', 0.125, 7, 14, '1d4+2', 4, 25],
  ['guard', 0.125, 11, 16, '1d6+1', 3, 25],
  ['cultist', 0.125, 9, 12, '1d4+1', 3, 25],
  ['giant_rat', 0.125, 7, 13, '1d4+3', 5, 25],
  ['zombie', 0.25, 15, 8, '1d6+1', 3, 50],
  ['scout', 0.5, 16, 13, '1d6+2', 4, 100, 2],
  ['worg', 0.5, 26, 13, '1d8+3', 5, 100],
  ['gnoll', 0.5, 27, 15, '1d6+2', 4, 100],
  ['black_bear', 0.5, 19, 11, '1d6+2', 4, 100, 2],
  ['dire_wolf', 1, 22, 14, '1d8+3', 5, 200],
  ['specter', 1, 22, 12, '3d6', 4, 200],
  ['animated_armor', 1, 33, 18, '1d6+2', 4, 200, 2],
  ['bandit_captain', 2, 52, 15, '1d6+3', 5, 450, 2],
  ['berserker', 2, 67, 13, '1d12+3', 5, 450],
  ['ghast', 2, 36, 13, '2d6+3', 5, 450],
  ['griffon', 2, 59, 12, '1d8+4', 6, 450, 2],
  ['owlbear', 3, 59, 13, '2d8+5', 7, 700, 2],
  ['manticore', 3, 68, 14, '1d8+3', 5, 700, 3],
  ['wight', 3, 82, 14, '1d8+2', 4, 700, 2],
  ['hippogriff', 1, 26, 11, '1d8+3', 5, 200, 2],
  ['giant_eagle', 1, 26, 13, '1d4+3', 5, 200, 2],
  ['lion', 1, 22, 12, '1d8+3', 5, 200, 2],
  ['bugbear_warrior', 1, 33, 14, '2d6+2', 4, 200],
  ['saber_toothed_tiger', 2, 52, 13, '2d6+4', 6, 450, 2],
  ['giant_boar', 2, 42, 13, '2d6+3', 5, 450],
  ['mummy', 3, 58, 11, '1d10+3', 5, 700, 2],
  ['hill_giant', 5, 105, 13, '3d8+5', 8, 1800, 2],
  ['ettin', 4, 85, 12, '2d8+5', 7, 1100, 2],
  ['gladiator', 5, 112, 16, '2d6+4', 7, 1800, 3],
  ['wraith', 5, 67, 13, '4d8+3', 6, 1800],
  ['fire_elemental', 5, 93, 13, '2d6+3', 6, 1800, 2],
  ['wyvern', 6, 127, 14, '2d6+4', 7, 2300],
  ['stone_giant', 7, 126, 17, '3d10+6', 9, 2900, 2],
  ['giant_ape', 7, 168, 12, '3d10+6', 9, 2900, 2],
  ['frost_giant', 8, 149, 15, '2d12+6', 9, 3900, 2],
  ['fire_giant', 9, 162, 18, '4d6+7', 11, 5000, 2],
  ['cloud_giant', 9, 200, 14, '3d8+8', 12, 5000, 2],
  ['young_red_dragon', 10, 178, 18, '2d6+6', 10, 5900, 3],
  // Batch: martial/beast/monstrosity additions (CR 1/2 → 8).
  ['ape', 0.5, 19, 12, '1d4+3', 5, 100, 2],
  ['tiger', 1, 30, 13, '2d6+3', 5, 200],
  ['spy', 1, 27, 12, '1d6+2', 4, 200],
  ['pegasus', 2, 59, 12, '1d6+4', 6, 450],
  ['giant_constrictor_snake', 2, 60, 12, '2d6+4', 6, 450],
  ['knight', 3, 52, 18, '2d6+3', 5, 700, 2],
  ['doppelganger', 3, 52, 14, '2d6+4', 6, 700, 2],
  ['hell_hound', 3, 58, 15, '1d8+3', 5, 700, 2],
  ['bulette', 5, 94, 17, '2d12+4', 7, 1800, 2],
  ['mammoth', 6, 126, 13, '2d10+7', 10, 2300, 2],
  ['assassin', 8, 97, 16, '1d6+4', 7, 3900, 3],
  // SRD 5.2.1 caster monsters — their concrete attack action (Arcane Burst /
  // Radiant Flame), modeled as native multiattack.
  ['priest', 2, 38, 13, '2d10', 5, 450, 2],
  ['mage', 6, 81, 15, '3d8+3', 6, 2300, 3],
  ['archmage', 12, 170, 17, '4d10+5', 9, 8000, 4],
  // Batch 2026-06: beasts / humanoids / monstrosities / wyrmlings.
  ['hyena', 0, 5, 11, '1d6', 2, 10],
  ['giant_crab', 0.125, 13, 15, '1d6+1', 3, 25],
  ['noble', 0.125, 9, 15, '1d8+1', 3, 25],
  ['constrictor_snake', 0.25, 13, 13, '1d8+2', 4, 50],
  ['giant_wolf_spider', 0.25, 11, 13, '1d4+3', 5, 50],
  ['cockatrice', 0.5, 22, 11, '1d4+1', 3, 100],
  ['crocodile', 0.5, 13, 12, '1d8+2', 4, 100],
  ['tough', 0.5, 32, 12, '1d6+2', 4, 100],
  ['satyr', 0.5, 31, 13, '1d4+3', 5, 100],
  ['giant_hyena', 1, 45, 12, '2d6+3', 5, 200],
  ['merrow', 2, 45, 13, '2d6+4', 6, 450, 2],
  ['mimic', 2, 58, 12, '1d8+3', 5, 450],
  ['awakened_tree', 2, 59, 13, '3d6+4', 6, 450],
  ['white_dragon_wyrmling', 2, 32, 16, '1d8+2', 4, 450, 2],
  ['black_dragon_wyrmling', 2, 33, 17, '1d6+2', 4, 450, 2],
  ['ankheg', 2, 45, 14, '2d6+3', 5, 450],
  ['minotaur', 3, 85, 14, '1d12+4', 6, 700],
  ['giant_scorpion', 3, 52, 15, '1d8+3', 5, 700, 3],
  ['warrior_veteran', 3, 65, 17, '2d6+3', 5, 700, 2],
  // Animals appendix batch (2026-06-07) — the full SRD 5.2.1 animal roster.
  ['baboon', 0, 3, 12, '1', 1, 10],
  ['badger', 0, 5, 11, '1', 2, 10],
  ['bat', 0, 1, 12, '1', 4, 10],
  ['cat', 0, 2, 12, '1', 4, 10],
  ['crab', 0, 3, 11, '1', 2, 10],
  ['deer', 0, 4, 13, '1d4', 2, 10],
  ['eagle', 0, 4, 12, '1d4+2', 4, 10],
  ['frog', 0, 1, 11, '1', 3, 10],
  ['giant_fire_beetle', 0, 4, 13, '1', 1, 10],
  ['goat', 0, 4, 10, '1', 2, 10],
  ['hawk', 0, 1, 13, '1', 5, 10],
  ['jackal', 0, 3, 12, '1', 1, 10],
  ['lizard', 0, 2, 10, '1', 2, 10],
  ['octopus', 0, 3, 12, '1', 4, 10],
  ['owl', 0, 1, 11, '1', 3, 10],
  ['piranha', 0, 1, 13, '1', 5, 10],
  ['rat', 0, 1, 10, '1', 2, 10],
  ['raven', 0, 2, 12, '1', 4, 10],
  ['scorpion', 0, 1, 11, '1', 2, 10],
  ['spider', 0, 1, 12, '1', 4, 10],
  ['vulture', 0, 5, 10, '1d4', 2, 10],
  ['weasel', 0, 1, 13, '1', 5, 10],
  ['blood_hawk', 0.125, 7, 12, '1d4+2', 4, 25],
  ['camel', 0.125, 17, 10, '1d4+2', 4, 25],
  ['flying_snake', 0.125, 5, 14, '1', 4, 25],
  ['giant_weasel', 0.125, 9, 13, '1d4+3', 5, 25],
  ['mastiff', 0.125, 5, 12, '1d6+1', 3, 25],
  ['mule', 0.125, 11, 10, '1d4+2', 4, 25],
  ['pony', 0.125, 11, 10, '1d4+2', 4, 25],
  ['venomous_snake', 0.125, 5, 12, '1d4+2', 4, 25],
  ['boar', 0.25, 13, 11, '1d6+1', 3, 50],
  ['draft_horse', 0.25, 15, 10, '1d4+4', 6, 50],
  ['elk', 0.25, 11, 10, '1d6+3', 5, 50],
  ['giant_badger', 0.25, 15, 13, '2d4+1', 3, 50],
  ['giant_bat', 0.25, 22, 13, '1d6+3', 5, 50],
  ['giant_centipede', 0.25, 9, 14, '1d4+2', 4, 50],
  ['giant_frog', 0.25, 18, 11, '1d6+2', 3, 50],
  ['giant_lizard', 0.25, 19, 12, '1d8+2', 4, 50],
  ['giant_owl', 0.25, 19, 12, '1d10+2', 4, 50],
  ['giant_venomous_snake', 0.25, 11, 14, '1d4+4', 6, 50],
  ['panther', 0.25, 13, 13, '1d6+3', 5, 50],
  ['pteranodon', 0.25, 13, 13, '1d8+2', 4, 50],
  ['riding_horse', 0.25, 13, 11, '1d8+3', 5, 50],
  ['swarm_of_bats', 0.25, 11, 12, '2d4', 4, 50],
  ['swarm_of_rats', 0.25, 14, 10, '2d4', 2, 50],
  ['swarm_of_ravens', 0.25, 11, 12, '1d6+2', 4, 50],
  ['giant_goat', 0.5, 19, 11, '1d6+3', 5, 100],
  ['giant_seahorse', 0.5, 16, 14, '2d6+2', 4, 100],
  ['giant_wasp', 0.5, 22, 13, '1d6+2', 4, 100],
  ['reef_shark', 0.5, 22, 12, '2d4+2', 4, 100],
  ['swarm_of_insects', 0.5, 19, 11, '2d4+1', 3, 100],
  ['warhorse', 0.5, 19, 11, '2d4+4', 6, 100],
  ['giant_octopus', 1, 45, 11, '2d6+3', 5, 200],
  ['giant_toad', 1, 39, 11, '1d6+2', 4, 200],
  ['giant_vulture', 1, 25, 10, '2d6+2', 4, 200],
  ['swarm_of_piranhas', 1, 28, 13, '2d4+3', 5, 200],
  ['allosaurus', 2, 51, 13, '2d10+4', 6, 450],
  ['giant_elk', 2, 42, 14, '2d6+4', 6, 450],
  ['hunter_shark', 2, 45, 12, '3d6+4', 6, 450],
  ['plesiosaurus', 2, 68, 13, '2d6+4', 6, 450],
  ['rhinoceros', 2, 45, 13, '2d8+5', 7, 450],
  ['swarm_of_venomous_snakes', 2, 36, 14, '1d8+4', 6, 450],
  ['ankylosaurus', 3, 68, 15, '1d10+4', 6, 700, 2],
  ['killer_whale', 3, 90, 12, '5d6+4', 6, 700],
  ['archelon', 4, 90, 17, '3d6+4', 6, 1100, 2],
  ['elephant', 4, 76, 12, '2d8+6', 8, 1100, 2],
  ['hippopotamus', 4, 82, 14, '2d10+5', 7, 1100, 2],
  ['giant_crocodile', 5, 85, 14, '3d10+5', 8, 1800, 2],
  ['giant_shark', 5, 92, 13, '3d10+6', 9, 1800, 2],
  ['triceratops', 5, 114, 14, '2d12+6', 9, 1800, 2],
  ['tyrannosaurus_rex', 8, 136, 13, '4d12+7', 10, 3900, 2],
  // Humanoid foes + NPC blocks batch (2026-06-07).
  ['commoner', 0, 4, 10, '1d4', 2, 10],
  ['warrior_infantry', 0.125, 9, 13, '1d6+1', 3, 25],
  ['goblin_minion', 0.125, 7, 12, '1d4+2', 4, 25],
  ['merfolk_skirmisher', 0.125, 11, 11, '1d6', 2, 25],
  ['priest_acolyte', 0.25, 11, 13, '1d6+2', 4, 50],
  ['hobgoblin_warrior', 0.5, 11, 18, '2d10+1', 3, 100],
  ['sahuagin_warrior', 0.5, 22, 12, '1d6+1', 3, 100, 2],
  ['pirate', 1, 33, 14, '1d4+3', 5, 200, 2],
  ['goblin_boss', 1, 21, 17, '1d6+2', 4, 200, 2],
  ['azer_sentinel', 2, 39, 17, '1d10+3', 5, 450],
  ['centaur_trooper', 2, 45, 16, '1d10+4', 6, 450, 2],
  ['druid', 2, 44, 13, '1d8+3', 5, 450, 2],
  ['bugbear_stalker', 3, 65, 15, '2d8+3', 5, 700, 2],
  ['hobgoblin_captain', 3, 58, 17, '2d6+2', 4, 700, 2],
  ['guard_captain', 4, 75, 18, '2d10+4', 6, 1100, 2],
  ['tough_boss', 4, 82, 16, '2d8+3', 5, 1100, 2],
  ['pirate_captain', 6, 84, 17, '2d8+4', 7, 2300, 3],
  // Dungeon classics batch (2026-06-07).
  ['awakened_shrub', 0, 10, 9, '1', 1, 10],
  ['homunculus', 0, 4, 13, '1', 4, 10],
  ['stirge', 0.125, 5, 13, '1d6+3', 5, 25],
  ['blink_dog', 0.25, 22, 13, '1d4+3', 5, 50],
  ['grimlock', 0.25, 11, 11, '1d6+3', 5, 50],
  ['pseudodragon', 0.25, 10, 14, '1d4+2', 4, 50, 2],
  ['sprite', 0.25, 10, 15, '1d4+4', 6, 50],
  ['steam_mephit', 0.25, 17, 10, '1d4', 2, 50],
  ['violet_fungus', 0.25, 18, 5, '1d8', 2, 50, 2],
  ['darkmantle', 0.5, 22, 11, '1d6+3', 5, 100],
  ['dust_mephit', 0.5, 17, 12, '1d4+2', 4, 100],
  ['gray_ooze', 0.5, 22, 9, '2d8+1', 3, 100],
  ['magma_mephit', 0.5, 18, 11, '1d4+1', 3, 100],
  ['magmin', 0.5, 13, 14, '2d4+2', 4, 100],
  ['rust_monster', 0.5, 33, 14, '1d8+1', 3, 100],
  ['troll_limb', 0.5, 14, 13, '2d4+4', 6, 100],
  ['warhorse_skeleton', 0.5, 22, 13, '1d6+4', 6, 100],
  ['death_dog', 1, 39, 12, '1d4+2', 4, 200, 2],
  ['dryad', 1, 22, 16, '1d8+4', 6, 200],
  ['harpy', 1, 38, 11, '2d4+1', 3, 200],
  ['ettercap', 2, 44, 13, '1d6+2', 4, 450],
  ['gargoyle', 2, 67, 15, '2d4+2', 4, 450, 2],
  ['gelatinous_cube', 2, 63, 6, '3d6+2', 4, 450],
  ['gibbering_mouther', 2, 52, 9, '2d6', 2, 450],
  ['grick', 2, 54, 14, '2d6+2', 4, 450, 2],
  ['minotaur_skeleton', 2, 45, 12, '2d6+4', 6, 450],
  ['ochre_jelly', 2, 52, 8, '3d6+2', 4, 450],
  ['ogre_zombie', 2, 85, 8, '2d8+4', 6, 450],
  ['sea_hag', 2, 52, 14, '2d6+3', 5, 450],
  ['wererat', 2, 60, 13, '1d6+3', 5, 450, 2],
  ['will_o_wisp', 2, 27, 19, '2d8+2', 4, 450],
  ['basilisk', 3, 52, 15, '2d6+3', 5, 700],
  ['green_hag', 3, 82, 17, '1d8+4', 6, 700, 2],
  ['nightmare', 3, 68, 13, '2d8+4', 6, 700],
  ['phase_spider', 3, 45, 14, '1d10+3', 5, 700, 2],
  ['swarm_of_crawling_claws', 3, 49, 12, '4d8+2', 4, 700],
  ['vampire_familiar', 3, 65, 15, '1d4+3', 5, 700, 2],
  ['werewolf', 3, 71, 15, '2d6+3', 5, 700, 2],
  ['winter_wolf', 3, 75, 13, '2d6+4', 6, 700],
  ['black_pudding', 4, 68, 7, '4d6+3', 5, 1100],
  ['ghost', 4, 45, 11, '3d10+3', 5, 1100, 2],
  ['lamia', 4, 97, 13, '1d8+3', 5, 1100, 2],
  ['wereboar', 4, 97, 15, '2d8+3', 5, 1100, 2],
  ['weretiger', 4, 120, 12, '2d6+3', 5, 1100, 2],
  ['gorgon', 5, 114, 19, '2d12+5', 8, 1800],
  ['half_dragon', 5, 105, 18, '1d4+4', 7, 1800, 2],
  ['night_hag', 5, 112, 17, '2d8+4', 7, 1800, 2],
  ['otyugh', 5, 104, 14, '2d4+4', 6, 1800, 3],
  ['roper', 5, 93, 20, '3d8+4', 7, 1800, 2],
  ['shambling_mound', 5, 110, 15, '1d6+4', 7, 1800, 3],
  ['troll', 5, 94, 15, '2d6+4', 7, 1800, 3],
  ['vampire_spawn', 5, 90, 16, '2d4+3', 6, 1800, 2],
  ['werebear', 5, 135, 15, '2d12+4', 7, 1800, 2],
  ['xorn', 5, 84, 19, '1d10+3', 6, 1800, 4],
  ['chimera', 6, 114, 14, '2d6+4', 7, 2300, 3],
  ['invisible_stalker', 6, 97, 14, '2d6+4', 7, 2300, 3],
  ['medusa', 6, 127, 15, '2d6+3', 6, 2300, 3],
  ['cloaker', 8, 91, 14, '3d6+3', 6, 3900, 2],
  ['hydra', 8, 184, 15, '1d10+5', 8, 3900, 5],
  ['spirit_naga', 8, 135, 17, '1d6+4', 7, 3900, 3],
  ['treant', 9, 138, 16, '3d6+6', 10, 5000, 2],
  ['guardian_naga', 10, 136, 18, '2d12+4', 8, 5900, 2],
  // Dragon families batch (2026-06-07).
  ['brass_dragon_wyrmling', 1, 22, 15, '1d10+2', 4, 200, 3],
  ['copper_dragon_wyrmling', 1, 22, 16, '1d10+2', 4, 200, 3],
  ['bronze_dragon_wyrmling', 2, 39, 15, '1d10+3', 5, 450, 2],
  ['green_dragon_wyrmling', 2, 38, 17, '1d10+2', 4, 450, 2],
  ['blue_dragon_wyrmling', 3, 65, 17, '1d10+3', 5, 700, 2],
  ['red_dragon_wyrmling', 4, 75, 17, '1d10+4', 6, 1100, 2],
  ['young_brass_dragon', 6, 110, 17, '2d10+4', 7, 2300, 3],
  ['young_black_dragon', 7, 127, 18, '2d4+4', 7, 2900, 3],
  ['young_copper_dragon', 7, 119, 17, '2d10+4', 7, 2900, 3],
  ['young_bronze_dragon', 8, 142, 17, '2d10+5', 8, 3900, 3],
  ['young_green_dragon', 8, 136, 18, '2d6+4', 7, 3900, 3],
  ['silver_dragon_wyrmling', 2, 45, 17, '1d10+4', 6, 450, 2],
  ['young_blue_dragon', 9, 152, 18, '2d6+5', 9, 5000, 3],
  ['young_silver_dragon', 9, 168, 18, '2d8+6', 10, 5000, 3],
  ['gold_dragon_wyrmling', 3, 60, 17, '1d10+4', 6, 700, 2],
  ['young_gold_dragon', 10, 178, 18, '2d10+6', 10, 5900, 3],
  ['adult_brass_dragon', 13, 172, 18, '2d10+6', 11, 10000, 3],
  ['adult_white_dragon', 13, 200, 18, '2d6+6', 11, 10000, 3],
  ['young_white_dragon', 6, 123, 17, '2d4+4', 7, 2300, 3],
  ['adult_black_dragon', 14, 195, 19, '2d6+6', 11, 11500, 3],
  ['adult_copper_dragon', 14, 184, 18, '2d10+6', 11, 11500, 3],
  ['adult_bronze_dragon', 15, 212, 18, '2d8+7', 12, 13000, 3],
  ['adult_green_dragon', 15, 207, 19, '2d8+6', 11, 13000, 3],
  ['adult_blue_dragon', 16, 212, 19, '2d8+7', 12, 15000, 3],
  ['adult_silver_dragon', 16, 216, 19, '2d8+8', 13, 15000, 3],
  ['adult_gold_dragon', 17, 243, 19, '2d8+8', 14, 18000, 3],
  ['adult_red_dragon', 17, 256, 19, '1d10+8', 14, 18000, 3],
  ['ancient_brass_dragon', 20, 332, 20, '2d10+8', 14, 25000, 3],
  ['ancient_white_dragon', 20, 333, 20, '2d8+8', 14, 25000, 3],
  ['ancient_black_dragon', 21, 367, 22, '2d8+8', 15, 33000, 3],
  ['ancient_copper_dragon', 21, 367, 21, '2d10+8', 15, 33000, 3],
  ['ancient_bronze_dragon', 22, 444, 22, '2d8+9', 16, 41000, 3],
  ['ancient_green_dragon', 22, 402, 21, '2d8+8', 15, 41000, 3],
  ['ancient_blue_dragon', 23, 481, 22, '2d8+9', 16, 50000, 3],
  ['ancient_silver_dragon', 23, 468, 22, '2d8+10', 17, 50000, 3],
  ['ancient_gold_dragon', 24, 546, 22, '2d8+10', 17, 62000, 3],
  ['ancient_red_dragon', 24, 507, 22, '2d8+10', 17, 62000, 3],
  // Planar + top-end batch (2026-06-07) — the final batch.
  ['lemure', 0, 9, 9, '1d4', 2, 10],
  ['animated_flying_sword', 0.25, 14, 17, '1d8+2', 4, 50],
  ['axe_beak', 0.25, 19, 11, '1d8+2', 4, 50],
  ['dretch', 0.25, 18, 11, '1d6+1', 3, 50],
  ['imp', 1, 21, 13, '1d6+3', 5, 200],
  ['quasit', 1, 25, 13, '1d4+3', 5, 200],
  ['sphinx_of_wonder', 1, 24, 13, '1d4+3', 5, 200],
  ['animated_rug_of_smothering', 2, 27, 12, '2d6+3', 5, 450],
  ['bearded_devil', 3, 58, 13, '1d8+3', 5, 700, 2],
  ['chuul', 4, 76, 16, '1d10+4', 6, 1100, 2],
  ['couatl', 4, 60, 19, '1d12+5', 7, 1100],
  ['incubus', 4, 66, 15, '3d6+5', 7, 1100, 2],
  ['succubus', 4, 71, 15, '2d10+5', 7, 1100],
  ['barbed_devil', 5, 110, 15, '2d6+3', 6, 1800, 2],
  ['flesh_golem', 5, 127, 9, '2d8+4', 7, 1800, 2],
  ['unicorn', 5, 97, 12, '2d6+4', 7, 1800],
  ['drider', 6, 123, 19, '2d8+4', 7, 2300, 3],
  ['vrock', 6, 152, 15, '2d6+3', 6, 2300, 2],
  ['oni', 7, 119, 17, '1d12+4', 7, 2900, 2],
  ['shield_guardian', 7, 142, 17, '2d6+4', 7, 2900, 2],
  ['chain_devil', 8, 85, 15, '2d6+4', 7, 3900, 2],
  ['hezrou', 8, 157, 18, '1d4+4', 7, 3900, 3],
  ['bone_devil', 9, 161, 16, '2d8+4', 8, 5000, 2],
  ['clay_golem', 9, 123, 14, '1d10+5', 9, 5000, 2],
  ['glabrezu', 9, 189, 17, '2d10+5', 9, 5000, 2],
  ['aboleth', 10, 150, 17, '2d6+5', 9, 5900, 2],
  ['deva', 10, 229, 17, '1d6+4', 8, 5900, 2],
  ['stone_golem', 10, 220, 18, '2d8+6', 10, 5900, 2],
  ['behir', 11, 168, 17, '2d12+6', 10, 7200],
  ['djinni', 11, 218, 17, '2d6+5', 9, 7200, 3],
  ['efreeti', 11, 212, 17, '2d6+6', 10, 7200, 3],
  ['horned_devil', 11, 199, 18, '2d8+6', 10, 7200, 3],
  ['remorhaz', 11, 195, 17, '2d10+7', 11, 7200],
  ['roc', 11, 248, 15, '3d12+9', 13, 7200, 2],
  ['sphinx_of_lore', 11, 170, 17, '3d6+4', 8, 7200, 3],
  ['erinyes', 12, 178, 18, '2d8+4', 8, 8400, 3],
  ['nalfeshnee', 13, 184, 18, '2d10+5', 10, 10000, 3],
  ['rakshasa', 13, 221, 17, '2d6+5', 10, 10000, 3],
  ['storm_giant', 13, 230, 16, '4d6+9', 14, 10000, 2],
  ['vampire', 13, 195, 16, '1d8+4', 9, 10000, 2],
  ['ice_devil', 14, 228, 18, '3d6+5', 10, 11500, 3],
  ['mummy_lord', 15, 187, 17, '2d10+4', 9, 13000],
  ['purple_worm', 15, 247, 18, '3d8+9', 14, 13000],
  ['iron_golem', 16, 252, 20, '3d8+7', 12, 15000, 2],
  ['marilith', 16, 220, 16, '1d10+5', 10, 15000, 6],
  ['planetar', 16, 262, 19, '2d6+7', 12, 15000, 3],
  ['dragon_turtle', 17, 356, 20, '3d10+7', 13, 18000, 3],
  ['sphinx_of_valor', 17, 199, 17, '4d6+6', 12, 18000, 2],
  ['balor', 19, 287, 19, '3d8+8', 14, 22000, 2],
  ['pit_fiend', 20, 337, 21, '3d6+8', 14, 25000, 4],
  ['lich', 21, 315, 20, '3d6+5', 12, 33000, 3],
  ['solar', 21, 297, 21, '4d6+8', 15, 33000, 2],
  ['kraken', 23, 481, 18, '4d6+10', 17, 50000, 2],
  ['tarrasque', 30, 697, 25, '4d8+10', 19, 155000, 4],
];

describe('SRD bestiary additions — core stat lines', () => {
  for (const [id, cr, hp, ac, damage, toHit, xp, multiattack] of NEW_MONSTERS) {
    it(`${id} registers with its SRD 5.2.1 stats`, () => {
      const m = SRD_MONSTERS[id];
      expect(m, id).toBeDefined();
      expect(m.cr, `${id} cr`).toBe(cr);
      expect(m.hp, `${id} hp`).toBe(hp);
      expect(m.ac, `${id} ac`).toBe(ac);
      expect(m.damage, `${id} damage`).toBe(damage);
      expect(m.toHit, `${id} toHit`).toBe(toHit);
      expect(m.xp, `${id} xp`).toBe(xp);
      if (multiattack) expect(m.multiattack, `${id} multiattack`).toBe(multiattack);
    });
  }
});

describe('SRD bestiary additions — effect fields', () => {
  it('Ghast applies Paralyzed on a CON save and resists necrotic', () => {
    expect(SRD_MONSTERS.ghast.onHitEffect).toEqual({
      condition: 'paralyzed',
      ability: 'con',
      dc: 10,
    });
    expect(SRD_MONSTERS.ghast.resistances).toContain('necrotic');
  });

  it('Specter is necrotic/poison-immune with the incorporeal resistance suite', () => {
    expect(SRD_MONSTERS.specter.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.specter.resistances).toContain('slashing');
    expect(SRD_MONSTERS.specter.condition_immunities).toContain('paralyzed');
  });

  it('Animated Armor is poison/psychic-immune and construct-condition-immune', () => {
    expect(SRD_MONSTERS.animated_armor.immunities).toEqual(['poison', 'psychic']);
    expect(SRD_MONSTERS.animated_armor.condition_immunities).toContain('frightened');
  });

  it('Zombie carries Undead Fortitude and CON 16 for the DC-5+damage save', () => {
    expect(SRD_MONSTERS.zombie.undeadFortitude).toBe(true);
    expect(SRD_MONSTERS.zombie.con).toBe(16);
  });

  it('Ghast carries the Stench aura (CON save → Poisoned within 5 ft)', () => {
    expect(SRD_MONSTERS.ghast.aura).toMatchObject({
      radiusFt: 5,
      save: { ability: 'con', dc: 10 },
      condition: 'poisoned',
    });
  });

  it('Specter and Wight carry Life Drain (necrotic max-HP reduction)', () => {
    // Specter: all-necrotic attack drains the full damage.
    expect(SRD_MONSTERS.specter.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.specter.damageType).toBe('necrotic');
    // Wight: only the necrotic bonus rider drains; the primary is slashing.
    expect(SRD_MONSTERS.wight.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.wight.bonusDamageType).toBe('necrotic');
  });

  it('flyers carry their flight speed', () => {
    expect(SRD_MONSTERS.griffon.speedFt).toBe(80);
    expect(SRD_MONSTERS.worg.speedFt).toBe(50);
    expect(SRD_MONSTERS.giant_eagle.speedFt).toBe(80);
    expect(SRD_MONSTERS.hippogriff.speedFt).toBe(60);
  });

  it('Bugbear Warrior grapples on a hit (escape DC 12) at 10 ft reach', () => {
    expect(SRD_MONSTERS.bugbear_warrior.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 12,
    });
    expect(SRD_MONSTERS.bugbear_warrior.attackReachFt).toBe(10);
  });

  it('Giant Eagle deals bonus radiant and resists necrotic/radiant', () => {
    expect(SRD_MONSTERS.giant_eagle.bonusDamage).toBe('1d6');
    expect(SRD_MONSTERS.giant_eagle.bonusDamageType).toBe('radiant');
    expect(SRD_MONSTERS.giant_eagle.resistances).toEqual(['necrotic', 'radiant']);
  });

  it('Lion has Pack Tactics; Giant Boar has Bloodied Fury', () => {
    expect(SRD_MONSTERS.lion.packTactics).toBe(true);
    expect(SRD_MONSTERS.giant_boar.bloodiedFrenzy).toBe(true);
  });

  it('Mummy: fire-vulnerable, necrotic/poison-immune, condition-immune, frightens on hit', () => {
    expect(SRD_MONSTERS.mummy.vulnerabilities).toEqual(['fire']);
    expect(SRD_MONSTERS.mummy.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.mummy.condition_immunities).toContain('frightened');
    expect(SRD_MONSTERS.mummy.bonusDamageType).toBe('necrotic');
    expect(SRD_MONSTERS.mummy.onHitEffect).toEqual({
      condition: 'frightened',
      ability: 'wis',
      dc: 11,
    });
  });

  it('Hill Giant is the first CR 5, with 10 ft reach', () => {
    expect(SRD_MONSTERS.hill_giant.cr).toBe(5);
    expect(SRD_MONSTERS.hill_giant.attackReachFt).toBe(10);
  });

  it('Gladiator parries with a +3 AC bonus (its proficiency bonus)', () => {
    expect(SRD_MONSTERS.gladiator.parry).toBe(true);
    expect(SRD_MONSTERS.gladiator.parryBonus).toBe(3);
  });

  it('Wraith carries Life Drain with the full incorporeal resistance suite', () => {
    expect(SRD_MONSTERS.wraith.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.wraith.resistances).toContain('slashing');
    expect(SRD_MONSTERS.wraith.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.wraith.condition_immunities).toContain('grappled');
  });

  it('Fire Elemental is fire/poison-immune with a 10-ft fire aura', () => {
    expect(SRD_MONSTERS.fire_elemental.immunities).toEqual(['fire', 'poison']);
    expect(SRD_MONSTERS.fire_elemental.resistances).toEqual([
      'bludgeoning',
      'piercing',
      'slashing',
    ]);
    expect(SRD_MONSTERS.fire_elemental.aura).toMatchObject({
      radiusFt: 10,
      damage: '1d10',
      damageType: 'fire',
    });
  });

  it('Wyvern stings for bonus poison and a CON save vs Poisoned at 10 ft', () => {
    expect(SRD_MONSTERS.wyvern.cr).toBe(6);
    expect(SRD_MONSTERS.wyvern.bonusDamage).toBe('7d6');
    expect(SRD_MONSTERS.wyvern.bonusDamageType).toBe('poison');
    expect(SRD_MONSTERS.wyvern.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.wyvern.onHitEffect).toEqual({
      condition: 'poisoned',
      ability: 'con',
      dc: 14,
    });
  });

  it('Ettin is immune to a suite of sense/turn-loss conditions', () => {
    expect(SRD_MONSTERS.ettin.condition_immunities).toEqual([
      'blinded',
      'charmed',
      'deafened',
      'frightened',
      'stunned',
      'unconscious',
    ]);
  });

  it('Stone Giant has 15-ft reach; the other giants reach 10 ft', () => {
    expect(SRD_MONSTERS.stone_giant.attackReachFt).toBe(15);
    expect(SRD_MONSTERS.frost_giant.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.fire_giant.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.cloud_giant.attackReachFt).toBe(10);
  });

  it('the elemental giants carry their damage rider + matching immunity', () => {
    expect(SRD_MONSTERS.frost_giant.bonusDamageType).toBe('cold');
    expect(SRD_MONSTERS.frost_giant.immunities).toEqual(['cold']);
    expect(SRD_MONSTERS.fire_giant.bonusDamageType).toBe('fire');
    expect(SRD_MONSTERS.fire_giant.immunities).toEqual(['fire']);
    expect(SRD_MONSTERS.cloud_giant.bonusDamageType).toBe('thunder');
  });

  it('Young Red Dragon is the first CR 10: 3-attack, fire-immune, fast flyer with Darkvision 120', () => {
    const d = SRD_MONSTERS.young_red_dragon;
    expect(d.cr).toBe(10);
    expect(d.multiattack).toBe(3);
    expect(d.immunities).toEqual(['fire']);
    expect(d.bonusDamageType).toBe('fire');
    expect(d.speedFt).toBe(80);
    expect(d.darkvision_ft).toBe(120);
  });

  it('the no-darkvision giants/ape are explicitly sightless in the dark', () => {
    expect(SRD_MONSTERS.giant_ape.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.frost_giant.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.fire_giant.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.cloud_giant.darkvision_ft).toBe(0);
    // Stone Giant keeps its Darkvision 60.
    expect(SRD_MONSTERS.stone_giant.darkvision_ft).toBe(60);
  });

  it('the elemental quartet is complete (Air/Earth/Water join Fire, all CR 5, two attacks)', () => {
    for (const k of ['air_elemental', 'earth_elemental', 'water_elemental'] as const) {
      expect(SRD_MONSTERS[k].cr).toBe(5);
      expect(SRD_MONSTERS[k].multiattack).toBe(2);
      expect(SRD_MONSTERS[k].immunities).toContain('poison');
    }
  });

  it('Air Elemental resists physical + lightning and is thunder-immune at 10-ft reach', () => {
    const a = SRD_MONSTERS.air_elemental;
    expect(a.resistances).toEqual(['bludgeoning', 'lightning', 'piercing', 'slashing']);
    expect(a.immunities).toEqual(['poison', 'thunder']);
    expect(a.damageType).toBe('thunder');
    expect(a.attackReachFt).toBe(10);
    expect(a.speedFt).toBe(90);
  });

  it('Earth Elemental is the bruiser: thunder-vulnerable, 147 HP, 10-ft reach', () => {
    const e = SRD_MONSTERS.earth_elemental;
    expect(e.vulnerabilities).toEqual(['thunder']);
    expect(e.hp).toBe(147);
    expect(e.attackReachFt).toBe(10);
    expect(e.damageType).toBe('bludgeoning');
  });

  it('Water Elemental resists acid + fire', () => {
    expect(SRD_MONSTERS.water_elemental.resistances).toEqual(['acid', 'fire']);
  });

  it('Salamander: cold-vulnerable, fire-immune, bonus fire damage + a 5-ft fire aura', () => {
    const s = SRD_MONSTERS.salamander;
    expect(s.cr).toBe(5);
    expect(s.vulnerabilities).toEqual(['cold']);
    expect(s.immunities).toEqual(['fire']);
    expect(s.bonusDamage).toBe('2d6');
    expect(s.bonusDamageType).toBe('fire');
    expect(s.aura).toMatchObject({ radiusFt: 5, damage: '2d6', damageType: 'fire' });
  });

  it('Polar Bear is a CR 2 two-attack beast that resists cold', () => {
    const p = SRD_MONSTERS.polar_bear;
    expect(p.cr).toBe(2);
    expect(p.multiattack).toBe(2);
    expect(p.resistances).toEqual(['cold']);
    expect(p.damageType).toBe('slashing');
  });

  it('Tiger knocks Prone on a hit (auto, no save)', () => {
    expect(SRD_MONSTERS.tiger.onHitEffect).toEqual({ condition: 'prone' });
    expect(SRD_MONSTERS.tiger.darkvision_ft).toBe(60);
  });

  it('Spy carries a poison damage rider', () => {
    expect(SRD_MONSTERS.spy.bonusDamage).toBe('2d6');
    expect(SRD_MONSTERS.spy.bonusDamageType).toBe('poison');
  });

  it('Pegasus is a fast radiant-hooved flyer', () => {
    expect(SRD_MONSTERS.pegasus.speedFt).toBe(90);
    expect(SRD_MONSTERS.pegasus.bonusDamageType).toBe('radiant');
  });

  it('Giant Constrictor Snake grapples on a hit (escape DC 14) at 10-ft reach', () => {
    expect(SRD_MONSTERS.giant_constrictor_snake.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 14,
    });
    expect(SRD_MONSTERS.giant_constrictor_snake.attackReachFt).toBe(10);
  });

  it('Knight parries (+2), is frighten-immune, and smites for bonus radiant', () => {
    expect(SRD_MONSTERS.knight.parry).toBe(true);
    expect(SRD_MONSTERS.knight.parryBonus).toBe(2);
    expect(SRD_MONSTERS.knight.condition_immunities).toContain('frightened');
    expect(SRD_MONSTERS.knight.bonusDamageType).toBe('radiant');
  });

  it('Doppelganger is charm-immune with two slam attacks', () => {
    expect(SRD_MONSTERS.doppelganger.condition_immunities).toContain('charmed');
    expect(SRD_MONSTERS.doppelganger.multiattack).toBe(2);
  });

  it('Hell Hound: Pack Tactics, fire-immune, fire rider + a Fire Breath cone', () => {
    expect(SRD_MONSTERS.hell_hound.packTactics).toBe(true);
    expect(SRD_MONSTERS.hell_hound.immunities).toEqual(['fire']);
    expect(SRD_MONSTERS.hell_hound.bonusDamageType).toBe('fire');
    expect(SRD_MONSTERS.hell_hound.breathWeapon).toMatchObject({
      dice: '5d6',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 12,
    });
  });

  it('Assassin: 3 attacks, poison rider + Poisoned on hit, poison-resistant', () => {
    expect(SRD_MONSTERS.assassin.multiattack).toBe(3);
    expect(SRD_MONSTERS.assassin.bonusDamage).toBe('5d6');
    expect(SRD_MONSTERS.assassin.onHitEffect).toEqual({ condition: 'poisoned' });
    expect(SRD_MONSTERS.assassin.resistances).toEqual(['poison']);
  });

  it('caster monsters fight at range with their concrete attack', () => {
    // Priest — ranged Radiant Flame.
    expect(SRD_MONSTERS.priest.damageType).toBe('radiant');
    expect(SRD_MONSTERS.priest.attackReachFt).toBe(60);
    // Mage — ranged Force Arcane Burst, three per turn.
    expect(SRD_MONSTERS.mage.damageType).toBe('force');
    expect(SRD_MONSTERS.mage.multiattack).toBe(3);
    expect(SRD_MONSTERS.mage.attackReachFt).toBe(120);
    // Archmage — four bursts, psychic/charm immune.
    expect(SRD_MONSTERS.archmage.multiattack).toBe(4);
    expect(SRD_MONSTERS.archmage.immunities).toEqual(['psychic']);
    expect(SRD_MONSTERS.archmage.condition_immunities).toContain('charmed');
  });

  it('Mage and Archmage carry AoE spells (Fireball / Cone of Cold) for enemy casting', () => {
    for (const k of ['mage', 'archmage'] as const) {
      expect(SRD_MONSTERS[k].spells).toEqual(['fireball', 'cone_of_cold']);
      expect(SRD_MONSTERS[k].castChance).toBeGreaterThan(0);
      expect(SRD_MONSTERS[k].spellSaveDC).toBeGreaterThan(0);
    }
    expect(SRD_MONSTERS.archmage.spellSaveDC).toBe(17);
  });

  it('the shared pool grew well past the original 12', () => {
    expect(Object.keys(SRD_MONSTERS).length).toBeGreaterThanOrEqual(50);
  });

  // ── Batch 2026-06 effect fields ────────────────────────────────────────────

  it('grapplers carry their RAW escape DCs', () => {
    expect(SRD_MONSTERS.giant_crab.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 11 });
    expect(SRD_MONSTERS.crocodile.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 12 });
    expect(SRD_MONSTERS.constrictor_snake.onHitEffect).toEqual({
      condition: 'grappled',
      escapeDc: 12,
    });
    expect(SRD_MONSTERS.mimic.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 13 });
    expect(SRD_MONSTERS.ankheg.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 13 });
  });

  it('pack hunters and the rampager carry their traits', () => {
    expect(SRD_MONSTERS.hyena.packTactics).toBe(true);
    expect(SRD_MONSTERS.tough.packTactics).toBe(true);
    expect(SRD_MONSTERS.giant_hyena.rampage).toBe(true);
  });

  it('Noble and Warrior Veteran carry the Parry reaction', () => {
    expect(SRD_MONSTERS.noble.parry).toBe(true);
    expect(SRD_MONSTERS.warrior_veteran.parry).toBe(true);
  });

  it('Cockatrice models the first petrification stage (CON 11 → Restrained)', () => {
    expect(SRD_MONSTERS.cockatrice.onHitEffect).toEqual({
      condition: 'restrained',
      ability: 'con',
      dc: 11,
    });
    expect(SRD_MONSTERS.cockatrice.condition_immunities).toContain('petrified');
  });

  it('wyrmlings breathe per RAW (cold CON 12 / acid DEX 11) with elemental riders', () => {
    expect(SRD_MONSTERS.white_dragon_wyrmling.breathWeapon).toMatchObject({
      dice: '5d8',
      damageType: 'cold',
      savingThrow: 'con',
      saveDC: 12,
    });
    expect(SRD_MONSTERS.black_dragon_wyrmling.breathWeapon).toMatchObject({
      dice: '5d8',
      damageType: 'acid',
      savingThrow: 'dex',
      saveDC: 11,
    });
    expect(SRD_MONSTERS.white_dragon_wyrmling.bonusDamageType).toBe('cold');
    expect(SRD_MONSTERS.black_dragon_wyrmling.creatureType).toBe('dragon');
  });

  it('Ankheg sprays acid on a Recharge 6', () => {
    expect(SRD_MONSTERS.ankheg.breathWeapon).toMatchObject({
      dice: '4d6',
      damageType: 'acid',
      savingThrow: 'dex',
      saveDC: 12,
      rechargeMin: 6,
    });
  });

  it('reach attackers carry 10 ft (Awakened Tree slam, Minotaur glaive)', () => {
    expect(SRD_MONSTERS.awakened_tree.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.minotaur.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.minotaur.bonusDamageType).toBe('necrotic');
  });
});

describe('Animals appendix batch — effect fields', () => {
  it('every appendix animal carries the beast creature type (Celestials/Monstrosities excepted)', () => {
    // The four appendix entries that are NOT Beasts in SRD 5.2.1 (the
    // creatureType union has no celestial/monstrosity — left unspecified).
    const notBeasts = ['giant_owl', 'giant_elk', 'flying_snake', 'giant_vulture'];
    for (const id of notBeasts) expect(SRD_MONSTERS[id].creatureType, id).toBeUndefined();
    for (const id of ['rat', 'panther', 'elephant', 'tyrannosaurus_rex', 'swarm_of_rats'])
      expect(SRD_MONSTERS[id].creatureType, id).toBe('beast');
  });

  it('swarms share the swarm kit: weapon resistance + the crowd-control immunity suite', () => {
    const swarms = [
      'swarm_of_bats',
      'swarm_of_rats',
      'swarm_of_ravens',
      'swarm_of_insects',
      'swarm_of_piranhas',
      'swarm_of_venomous_snakes',
    ];
    for (const id of swarms) {
      expect(SRD_MONSTERS[id].resistances, id).toEqual(['bludgeoning', 'piercing', 'slashing']);
      expect(SRD_MONSTERS[id].condition_immunities, id).toEqual([
        'charmed',
        'frightened',
        'grappled',
        'paralyzed',
        'petrified',
        'prone',
        'restrained',
        'stunned',
      ]);
    }
    // The snake swarm's bites carry the 3d6 poison rider.
    expect(SRD_MONSTERS.swarm_of_venomous_snakes.bonusDamage).toBe('3d6');
    expect(SRD_MONSTERS.swarm_of_venomous_snakes.bonusDamageType).toBe('poison');
  });

  it('venomous fauna carry their poison riders', () => {
    const riders: Array<[string, string]> = [
      ['scorpion', '1d6'],
      ['spider', '1d4'],
      ['flying_snake', '2d4'],
      ['venomous_snake', '1d6'],
      ['giant_venomous_snake', '1d8'],
      ['giant_wasp', '2d4'],
      ['giant_toad', '2d4'],
    ];
    for (const [id, dice] of riders) {
      expect(SRD_MONSTERS[id].bonusDamage, id).toBe(dice);
      expect(SRD_MONSTERS[id].bonusDamageType, id).toBe('poison');
    }
  });

  it('the big grapplers pin on a hit at their SRD escape DCs', () => {
    const grapplers: Array<[string, number]> = [
      ['giant_frog', 11],
      ['giant_toad', 12],
      ['giant_octopus', 13],
      ['giant_crocodile', 15],
      ['tyrannosaurus_rex', 17],
    ];
    for (const [id, escapeDc] of grapplers)
      expect(SRD_MONSTERS[id].onHitEffect, id).toMatchObject({ condition: 'grappled', escapeDc });
  });

  it('auto-condition riders: knockdown bites and lingering poison', () => {
    expect(SRD_MONSTERS.mastiff.onHitEffect).toEqual({ condition: 'prone' });
    expect(SRD_MONSTERS.ankylosaurus.onHitEffect).toEqual({ condition: 'prone' });
    expect(SRD_MONSTERS.giant_centipede.onHitEffect).toEqual({ condition: 'poisoned' });
    expect(SRD_MONSTERS.giant_vulture.onHitEffect).toEqual({ condition: 'poisoned' });
  });

  it('pack hunters have Pack Tactics (the SRD 5.2.1 carriers, not folk memory)', () => {
    for (const id of ['baboon', 'blood_hawk', 'giant_vulture', 'reef_shark', 'vulture'])
      expect(SRD_MONSTERS[id].packTactics, id).toBe(true);
    // Jackal and Mastiff do NOT carry it in 5.2.1.
    expect(SRD_MONSTERS.jackal.packTactics).toBeUndefined();
    expect(SRD_MONSTERS.mastiff.packTactics).toBeUndefined();
  });

  it('the Celestial fauna carry their radiant kit', () => {
    expect(SRD_MONSTERS.giant_elk.bonusDamage).toBe('2d4');
    expect(SRD_MONSTERS.giant_elk.bonusDamageType).toBe('radiant');
    expect(SRD_MONSTERS.giant_elk.resistances).toEqual(['necrotic', 'radiant']);
    expect(SRD_MONSTERS.giant_owl.resistances).toEqual(['necrotic', 'radiant']);
    expect(SRD_MONSTERS.giant_owl.darkvision_ft).toBe(120);
  });

  it('flyers and swimmers carry their dominant movement speed', () => {
    expect(SRD_MONSTERS.giant_owl.speedFt).toBe(60); // fly
    expect(SRD_MONSTERS.pteranodon.speedFt).toBe(60); // fly
    expect(SRD_MONSTERS.killer_whale.speedFt).toBe(60); // swim
    expect(SRD_MONSTERS.giant_shark.speedFt).toBe(60); // swim
    expect(SRD_MONSTERS.allosaurus.speedFt).toBe(60); // ground sprinter
  });
});

describe('Humanoid foes batch — effect fields', () => {
  it('the goblinoid tier leaves creatureType unspecified (5.2.1 Fey, no union entry)', () => {
    for (const id of ['goblin_minion', 'goblin_boss', 'hobgoblin_warrior', 'hobgoblin_captain'])
      expect(SRD_MONSTERS[id].creatureType, id).toBeUndefined();
    expect(SRD_MONSTERS.sahuagin_warrior.creatureType).toBe('fiend'); // 5.2.1 reclassification
  });

  it('the formation fighters carry Pack Tactics', () => {
    for (const id of ['warrior_infantry', 'hobgoblin_warrior', 'tough_boss'])
      expect(SRD_MONSTERS[id].packTactics, id).toBe(true);
  });

  it('Azer Sentinel: fire kit — hammer rider, immunities, and the 5-ft Fire Aura', () => {
    const azer = SRD_MONSTERS.azer_sentinel;
    expect(azer.bonusDamage).toBe('1d6');
    expect(azer.bonusDamageType).toBe('fire');
    expect(azer.immunities).toEqual(['fire', 'poison']);
    expect(azer.condition_immunities).toEqual(['poisoned']);
    expect(azer.aura).toEqual({
      radiusFt: 5,
      damage: '1d10',
      damageType: 'fire',
      name: 'Fire Aura',
    });
  });

  it('damage riders: radiant mace, poison greatsword/staff, cold spear', () => {
    expect(SRD_MONSTERS.priest_acolyte.bonusDamageType).toBe('radiant');
    expect(SRD_MONSTERS.hobgoblin_captain.bonusDamageType).toBe('poison');
    expect(SRD_MONSTERS.druid.bonusDamageType).toBe('poison');
    expect(SRD_MONSTERS.merfolk_skirmisher.bonusDamageType).toBe('cold');
  });

  it('reach + speed: the long-limbed stalker and the galloping trooper', () => {
    expect(SRD_MONSTERS.bugbear_stalker.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.centaur_trooper.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.centaur_trooper.speedFt).toBe(50);
    expect(SRD_MONSTERS.sahuagin_warrior.speedFt).toBe(40); // swim
    expect(SRD_MONSTERS.sahuagin_warrior.darkvision_ft).toBe(120);
  });
});

describe('Dungeon classics batch — effect fields', () => {
  it('the regenerators carry their SRD rates and blockers', () => {
    expect(SRD_MONSTERS.troll.regeneration).toBe(15);
    expect(SRD_MONSTERS.troll.regenBlockedBy).toBeUndefined(); // acid/fire default
    expect(SRD_MONSTERS.troll_limb.regeneration).toBe(5);
    expect(SRD_MONSTERS.vampire_spawn.regeneration).toBe(10);
    expect(SRD_MONSTERS.vampire_spawn.regenBlockedBy).toEqual(['radiant']);
    expect(SRD_MONSTERS.hydra.regeneration).toBe(10);
    expect(SRD_MONSTERS.hydra.regenBlockedBy).toEqual(['fire']);
  });

  it('breath weapons: Winter Wolf, the fiery mephits, Half-Dragon, Chimera', () => {
    expect(SRD_MONSTERS.winter_wolf.breathWeapon).toMatchObject({
      dice: '4d8',
      damageType: 'cold',
      savingThrow: 'con',
      saveDC: 12,
      rechargeMin: 5,
    });
    expect(SRD_MONSTERS.magma_mephit.breathWeapon).toMatchObject({
      dice: '2d6',
      damageType: 'fire',
      saveDC: 11,
      rechargeMin: 6,
    });
    expect(SRD_MONSTERS.steam_mephit.breathWeapon).toMatchObject({
      dice: '2d4',
      savingThrow: 'con',
      saveDC: 10,
    });
    expect(SRD_MONSTERS.half_dragon.breathWeapon).toMatchObject({ dice: '8d6', saveDC: 14 });
    expect(SRD_MONSTERS.chimera.breathWeapon).toMatchObject({
      dice: '7d8',
      damageType: 'fire',
      saveDC: 15,
    });
  });

  it('the oozes share blind ferocity: acid attacks, sense immunities, no darkvision', () => {
    for (const id of ['gray_ooze', 'gelatinous_cube', 'ochre_jelly', 'black_pudding']) {
      expect(SRD_MONSTERS[id].damageType, id).toBe('acid');
      expect(SRD_MONSTERS[id].darkvision_ft, id).toBe(0);
      expect(SRD_MONSTERS[id].condition_immunities, id).toContain('exhaustion');
    }
    expect(SRD_MONSTERS.black_pudding.immunities).toEqual([
      'acid',
      'cold',
      'lightning',
      'slashing',
    ]);
    expect(SRD_MONSTERS.ochre_jelly.resistances).toEqual(['acid']);
  });

  it('the Harpy lures: a 30-ft charm aura (clamped from the RAW 300-ft song)', () => {
    expect(SRD_MONSTERS.harpy.aura).toEqual({
      radiusFt: 30,
      save: { ability: 'wis', dc: 11 },
      condition: 'charmed',
      name: 'Luring Song',
    });
  });

  it('grapplers and pinners: darkmantle, roper, otyugh, vampire spawn claws', () => {
    expect(SRD_MONSTERS.darkmantle.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 13,
    });
    expect(SRD_MONSTERS.roper.onHitEffect).toMatchObject({ condition: 'grappled', escapeDc: 14 });
    expect(SRD_MONSTERS.otyugh.onHitEffect).toMatchObject({ condition: 'grappled', escapeDc: 13 });
    expect(SRD_MONSTERS.vampire_spawn.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 13,
    });
  });

  it('the undead kit: ghost incorporeality, skeleton vulnerability, Ogre Zombie fortitude', () => {
    expect(SRD_MONSTERS.ghost.creatureType).toBe('undead');
    expect(SRD_MONSTERS.ghost.resistances).toContain('bludgeoning');
    expect(SRD_MONSTERS.ghost.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.warhorse_skeleton.vulnerabilities).toEqual(['bludgeoning']);
    expect(SRD_MONSTERS.minotaur_skeleton.vulnerabilities).toEqual(['bludgeoning']);
    expect(SRD_MONSTERS.ogre_zombie.undeadFortitude).toBe(true);
    expect(SRD_MONSTERS.will_o_wisp.name).toBe('Will-o’-Wisp'); // the exact SRD name
  });

  it('poison riders: basilisk bite, phase spider, the nagas, nightmare fire', () => {
    expect(SRD_MONSTERS.basilisk.bonusDamage).toBe('2d6');
    expect(SRD_MONSTERS.phase_spider.bonusDamage).toBe('2d8');
    expect(SRD_MONSTERS.spirit_naga.bonusDamage).toBe('4d6');
    expect(SRD_MONSTERS.guardian_naga.bonusDamage).toBe('4d10');
    expect(SRD_MONSTERS.nightmare.bonusDamageType).toBe('fire');
    expect(SRD_MONSTERS.nightmare.creatureType).toBe('fiend');
  });

  it('the lycanthrope family fights in beast form at CR 2-5', () => {
    const weres: Array<[string, number]> = [
      ['wererat', 2],
      ['werewolf', 3],
      ['wereboar', 4],
      ['weretiger', 4],
      ['werebear', 5],
    ];
    for (const [id, cr] of weres) {
      expect(SRD_MONSTERS[id].cr, id).toBe(cr);
      expect(SRD_MONSTERS[id].multiattack, id).toBe(2);
    }
  });
});

describe('SRD-exact naming', () => {
  it('every bestiary entry carries an exact SRD 5.2.1 stat-block name', () => {
    // The bestiary follows the SRD exactly — campaign flavor names are
    // campaign-level clones, never bestiary renames. Stat-block names are
    // extracted from docs/srd-5.2.1.txt (a name line directly above a
    // size/type line); the test fails on any entry whose name is not one.
    const srdText = readFileSync(
      new URL('../../../../../docs/srd-5.2.1.txt', import.meta.url),
      'utf-8'
    );
    const lines = srdText.split('\n');
    const sizeType =
      /^(Tiny|Small|Medium|Large|Huge|Gargantuan)( or [\w-]+)? (Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead|Swarm[\w ()]*?)( ?\([\w /]+\))?,/;
    const srdNames = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      if (sizeType.test(lines[i].trim())) srdNames.add(lines[i - 1].trim());
    }
    expect(srdNames.size).toBeGreaterThan(300); // the extraction itself works
    const offenders = Object.values(SRD_MONSTERS)
      .map((m) => m.name)
      .filter((n) => !srdNames.has(n));
    expect(offenders).toEqual([]);
  });

  it('the 5.2.1 renames landed (and the Orc left for sandbox)', () => {
    expect(SRD_MONSTERS.goblin.name).toBe('Goblin Warrior');
    expect(SRD_MONSTERS.kobold.name).toBe('Kobold Warrior');
    expect(SRD_MONSTERS.gnoll.name).toBe('Gnoll Warrior');
    expect(SRD_MONSTERS.cult_fanatic.name).toBe('Cultist Fanatic');
    expect(SRD_MONSTERS.orc).toBeUndefined();
  });
});

describe('Dragon families batch — effect fields', () => {
  const DRAGONS = Object.entries(SRD_MONSTERS).filter(
    ([, m]) => m.creatureType === 'dragon' && / Dragon/.test(m.name) && m.name !== 'Half-Dragon'
  );

  it('all 40 true dragons: breath weapon + matching elemental immunity + flight', () => {
    expect(DRAGONS.length).toBe(40); // 37 new + the 3 shipped earlier
    for (const [id, m] of DRAGONS) {
      expect(m.breathWeapon, id).toBeDefined();
      expect(m.immunities, id).toContain(m.breathWeapon!.damageType);
      expect(m.speedFt ?? 0, id).toBeGreaterThanOrEqual(60); // every dragon flies
    }
  });

  it('adults and ancients carry the Pounce legendary action (3-point pool)', () => {
    const elders = DRAGONS.filter(([, m]) => /^(Adult|Ancient)/.test(m.name));
    expect(elders.length).toBe(20);
    for (const [id, m] of elders) {
      expect(m.legendary_actions, id).toEqual([
        { id: 'pounce', name: 'Pounce', cost: 1, kind: 'extra_attack' },
      ]);
      expect(m.legendary_pool, id).toBe(3);
    }
    // Younger dragons have none.
    for (const [id, m] of DRAGONS.filter(([, mm]) => !/^(Adult|Ancient)/.test(mm.name)))
      expect(m.legendary_actions, id).toBeUndefined();
  });

  it('the apex blocks: Ancient Red leads the catalog; greens are poison-proofed', () => {
    expect(SRD_MONSTERS.ancient_red_dragon.cr).toBe(24);
    expect(SRD_MONSTERS.ancient_red_dragon.breathWeapon).toMatchObject({
      dice: '26d6',
      saveDC: 24,
    });
    expect(SRD_MONSTERS.ancient_red_dragon.attackReachFt).toBe(15);
    for (const id of ['green_dragon_wyrmling', 'adult_green_dragon', 'ancient_green_dragon'])
      expect(SRD_MONSTERS[id].condition_immunities, id).toEqual(['poisoned']);
  });
});

describe('Full-bestiary SRD audit — cr / hp / ac / xp match the printed blocks', () => {
  it('every entry whose name is an SRD stat block carries its exact core numbers', () => {
    const srdText = readFileSync(
      new URL('../../../../../docs/srd-5.2.1.txt', import.meta.url),
      'utf-8'
    );
    const lines = srdText.split('\n');
    const sizeType =
      /^(Tiny|Small|Medium|Large|Huge|Gargantuan)( or [\w-]+)? (Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead|Swarm[\w ()]*?)( ?\([\w /]+\))?,/;
    // The extraction sometimes spaces the thousands ('XP 7 ,200').
    const crLine = /CR ([\d/]+) \((?:XP ([\d, ]+?)|([\d, ]+?) XP)[;)]/;
    // name → { cr, hp, ac, xp } parsed from the first matching block.
    const blocks = new Map<string, { cr: number; hp: number; ac: number; xp: number }>();
    for (let i = 1; i < lines.length; i++) {
      if (!sizeType.test(lines[i].trim())) continue;
      const name = lines[i - 1].trim();
      if (blocks.has(name)) continue;
      // Join wrapped thousands ('XP 7,\n200') before matching the CR line.
      const chunk = lines
        .slice(i, i + 40)
        .join('\n')
        .replace(/,\s*\n\s*/g, ',');
      const hp = chunk.match(/^HP (\d+)/m);
      const ac = chunk.match(/^AC (\d+)/m);
      const cr = chunk.match(crLine);
      if (!hp || !ac || !cr) continue;
      const crNum = cr[1].includes('/')
        ? Number(cr[1].split('/')[0]) / Number(cr[1].split('/')[1])
        : Number(cr[1]);
      blocks.set(name, {
        cr: crNum,
        hp: Number(hp[1]),
        ac: Number(ac[1]),
        xp: Number((cr[2] ?? cr[3]).replace(/[ ,]/g, '')),
      });
    }
    expect(blocks.size).toBeGreaterThan(300);
    const drift: string[] = [];
    for (const m of Object.values(SRD_MONSTERS)) {
      const raw = blocks.get(m.name);
      if (!raw) continue; // names are separately guarded by the SRD-exact test
      if (m.cr !== raw.cr || m.hp !== raw.hp || m.ac !== raw.ac || m.xp !== raw.xp)
        drift.push(
          `${m.name}: ours cr/hp/ac/xp ${m.cr}/${m.hp}/${m.ac}/${m.xp} vs SRD ${raw.cr}/${raw.hp}/${raw.ac}/${raw.xp}`
        );
    }
    expect(drift).toEqual([]);
  });
});

describe('Planar + top-end batch — effect fields', () => {
  it('the bestiary is complete: every SRD attack-capable stat block is in', () => {
    // 330 SRD blocks − Seahorse − Shrieker Fungus (no attack actions)
    // − the 2014-only names = every name maps. The SRD-exact + full-audit
    // tests cover correctness; this one covers COMPLETENESS.
    expect(Object.keys(SRD_MONSTERS).length).toBe(328);
  });

  it('the demon and devil ladders carry the fiendish kits', () => {
    for (const id of ['dretch', 'vrock', 'hezrou', 'glabrezu', 'nalfeshnee', 'marilith', 'balor'])
      expect(SRD_MONSTERS[id].creatureType, id).toBe('fiend');
    // Demons resist the elemental trio; devils burn-proof and resist cold.
    expect(SRD_MONSTERS.marilith.resistances).toEqual(['cold', 'fire', 'lightning']);
    expect(SRD_MONSTERS.pit_fiend.immunities).toEqual(['fire', 'poison']);
    expect(SRD_MONSTERS.pit_fiend.resistances).toEqual(['cold']);
    expect(SRD_MONSTERS.marilith.multiattack).toBe(6); // six pact blades
    expect(SRD_MONSTERS.hezrou.aura).toMatchObject({ radiusFt: 10, condition: 'poisoned' });
    expect(SRD_MONSTERS.balor.bonusDamage).toBe('4d10');
  });

  it('the apex undead regenerate, paralyze, and drain', () => {
    expect(SRD_MONSTERS.vampire.regeneration).toBe(20);
    expect(SRD_MONSTERS.vampire.regenBlockedBy).toEqual(['radiant']);
    expect(SRD_MONSTERS.vampire.sunlightSensitivity).toBe(true);
    expect(SRD_MONSTERS.lich.onHitEffect).toEqual({ condition: 'paralyzed' });
    expect(SRD_MONSTERS.mummy_lord.vulnerabilities).toEqual(['fire']);
    expect(SRD_MONSTERS.oni.regenBlockedBy).toEqual([]); // nothing shuts it off
  });

  it('legendary attack options ride the extra_attack system', () => {
    const legends: Array<[string, string]> = [
      ['aboleth', 'Lash'],
      ['kraken', 'Storm Bolt'],
      ['sphinx_of_lore', 'Arcane Prowl'],
      ['sphinx_of_valor', 'Arcane Prowl'],
      ['tarrasque', 'Onslaught'],
      ['unicorn', 'Charging Horn'],
    ];
    for (const [id, name] of legends) {
      expect(SRD_MONSTERS[id].legendary_actions?.[0], id).toMatchObject({
        name,
        kind: 'extra_attack',
      });
      expect(SRD_MONSTERS[id].legendary_pool, id).toBe(3);
    }
  });

  it('the recharge AoEs: golem breath, sphinx roar, turtle steam, the Bellow', () => {
    expect(SRD_MONSTERS.iron_golem.breathWeapon).toMatchObject({
      dice: '10d10',
      damageType: 'poison',
      rechargeMin: 6,
    });
    expect(SRD_MONSTERS.sphinx_of_lore.breathWeapon).toMatchObject({
      dice: '10d6',
      damageType: 'psychic',
      savingThrow: 'wis',
    });
    expect(SRD_MONSTERS.dragon_turtle.breathWeapon).toMatchObject({ dice: '16d6', saveDC: 19 });
    expect(SRD_MONSTERS.tarrasque.breathWeapon).toMatchObject({
      dice: '12d12',
      damageType: 'thunder',
      saveDC: 27,
    });
  });

  it('the Tarrasque is the catalog apex: CR 30, grapple bite, weapon resistance', () => {
    const t = SRD_MONSTERS.tarrasque;
    expect(t.cr).toBe(30);
    expect(t.hp).toBe(697);
    expect(t.ac).toBe(25);
    expect(t.multiattack).toBe(4);
    expect(t.resistances).toEqual(['bludgeoning', 'piercing', 'slashing']);
    expect(t.onHitEffect).toMatchObject({ condition: 'grappled', escapeDc: 20 });
  });

  it('the big grapplers pin at their SRD escape DCs', () => {
    const g: Array<[string, number]> = [
      ['aboleth', 14],
      ['chuul', 14],
      ['chain_devil', 14],
      ['glabrezu', 15],
      ['remorhaz', 17],
      ['purple_worm', 19],
      ['kraken', 20],
    ];
    for (const [id, dc] of g)
      expect(SRD_MONSTERS[id].onHitEffect, id).toMatchObject({
        condition: 'grappled',
        escapeDc: dc,
      });
  });

  it('Clay Golem fists drain the HP maximum via the Life Drain hook', () => {
    expect(SRD_MONSTERS.clay_golem.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.clay_golem.bonusDamageType).toBe('acid');
  });
});
