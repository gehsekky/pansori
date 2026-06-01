# Pansori — Campaign Authoring Guide

This is the reference for authoring a campaign module. A campaign is a
TypeScript file in `src/backend/src/contexts/` that exports a `Context`.
The engine auto-discovers it on backend startup.

Pansori ships with one authored campaign (Duskenvale) + one procgen sandbox:

- `vale_of_shadows.ts` — **Duskenvale** (internal id `vale_of_shadows`): a
  multi-area campaign with town hubs, faction reputation, and several boss
  fights. It started as a single town-and-crypt module and now folds in two
  more areas. Best reference for a campaign with quests + NPCs + factions, and
  for the fold pattern (`foldCampaign()` at the bottom of the file).
- `contexts/folded/whispering_pines.ts`, `contexts/folded/grove_of_thorns.ts` —
  the former standalone Whispering Pines (cold/cult) and Grove of Thorns
  (fey/forest) campaigns, now **data modules** folded into Duskenvale. They
  live in the `folded/` subdir so the context loader (top-level scan only)
  doesn't register them as separate selectable campaigns. Good references for
  a different thematic flavor on the same format.
- `sandbox.ts` — a roguelike-mode context that procedurally generates
  rooms. Best reference for the minimal field set; campaigns can
  ignore the procgen-specific fields.

Read them alongside this doc.

---

## Quick start: minimal campaign

```ts
import type { Context } from '../types.js';
import {
  SRD_CLASS_HIT_DIE,
  SRD_CLASS_ARMOR_PROFICIENCIES,
  SRD_CLASS_WEAPON_PROFICIENCIES,
  SRD_CLASS_SAVING_THROWS,
  SRD_CLASS_PRIMARY_STATS,
  SRD_SPELLCASTING_ABILITY,
  SRD_CLASS_FEATURES,
  SRD_CLASS_SKILLS,
  SRD_SPELLS,
} from './srd/index.js';

export const context: Context = {
  id: 'my_campaign',
  worldNoun: 'kingdom',
  mapType: 'campaign',
  startRoomId: 'town_square',
  escapeRoomId: 'castle_exit',
  escapeTriggers: ['escape', 'leave'],
  escapeChoiceText: 'Leave the kingdom — RETURN HOME',
  worldNames: ['The Iron Kingdom'],

  // SRD class metadata — see src/backend/src/contexts/srd/classes.ts
  classHitDie: { ...SRD_CLASS_HIT_DIE },
  classArmorProficiencies: { ...SRD_CLASS_ARMOR_PROFICIENCIES },
  classWeaponProficiencies: { ...SRD_CLASS_WEAPON_PROFICIENCIES },
  classSavingThrows: { ...SRD_CLASS_SAVING_THROWS },
  classPrimaryStats: { ...SRD_CLASS_PRIMARY_STATS },
  classSkills: { ...SRD_CLASS_SKILLS },
  classFeatures: { ...SRD_CLASS_FEATURES },
  spellcastingAbility: { ...SRD_SPELLCASTING_ABILITY },

  // Per-campaign decisions
  classStartingLoot: { Fighter: ['longsword', 'chain_mail', 'shield'] /* ... */ },
  classSpells: { Wizard: ['fire_bolt', 'magic_missile'] /* ... */ },
  classSpellSlots: { Wizard: [{ 1: 2 }] /* ... */ },
  spellTable: { ...SRD_SPELLS },
  enemyTemplates: [
    /* ... */
  ],
  introTexts: ['You arrive at the gates...'],
  roomPool: [], // unused in campaign mode but required by type
  lootTable: [
    /* ... */
  ],
  narratives: {
    /* required tables — see Vale for full set */
  },

  // Campaign-mode specifics
  campaign: {
    /* see below */
  },
};
```

---

## Top-level fields (Context)

### Identity

| Field        | Required | Notes                                                               |
| ------------ | -------- | ------------------------------------------------------------------- |
| `id`         | yes      | URL-safe identifier (`'my_campaign'`); becomes `seed.context_id`    |
| `worldNoun`  | yes      | Short flavor noun: 'kingdom', 'pass', 'dungeon'                     |
| `worldNames` | yes      | Possible display names; engine picks one at session start           |
| `mapType`    | yes      | `'campaign'` for authored worlds, `'roguelike'` for procgen sandbox |

### Entry / exit

| Field              | Required | Notes                                                    |
| ------------------ | -------- | -------------------------------------------------------- |
| `startRoomId`      | yes      | Must match a room ID in `campaign.rooms` (campaign mode) |
| `escapeRoomId`     | yes      | Match a room ID — the "win condition" room               |
| `escapeTriggers`   | yes      | Verbs the player can type or click to trigger escape     |
| `escapeChoiceText` | yes      | The label rendered for the escape choice                 |

### Combat

| Field         | Required | Notes                                                     |
| ------------- | -------- | --------------------------------------------------------- |
| `gridEnabled` | optional | Default off. Set to `true` to enable tactical grid combat |
| `gridWidth`   | optional | Default 10 squares                                        |
| `gridHeight`  | optional | Default 10 squares                                        |

### Classes

All class tables share the same shape: `Record<string, T>` keyed by PHB
titlecase class names (`'Fighter'`, `'Rogue'`, etc.). Spread the SRD
defaults and override only what your campaign changes.

| Field                      | Spreadable SRD constant          |
| -------------------------- | -------------------------------- |
| `classHitDie`              | `SRD_CLASS_HIT_DIE`              |
| `classArmorProficiencies`  | `SRD_CLASS_ARMOR_PROFICIENCIES`  |
| `classWeaponProficiencies` | `SRD_CLASS_WEAPON_PROFICIENCIES` |
| `classSavingThrows`        | `SRD_CLASS_SAVING_THROWS`        |
| `classPrimaryStats`        | `SRD_CLASS_PRIMARY_STATS`        |
| `classSkills`              | `SRD_CLASS_SKILLS`               |
| `classFeatures`            | `SRD_CLASS_FEATURES`             |
| `spellcastingAbility`      | `SRD_SPELLCASTING_ABILITY`       |

#### Campaign-specific class fields

These vary per campaign — write them inline:

- **`classStartingLoot`**: each class's starting items by ID. Items must
  exist in `lootTable`. The engine auto-equips weapons and armor on
  session start.
- **`classSpells`**: spells available to each spellcasting class for
  this campaign. Spell IDs must exist in `spellTable`.
- **`classSpellSlots`**: per-level slot grants. Outer array is indexed
  by character level - 1; each entry is `{ slotLevel: count }`. Example
  for a Wizard L3:
  ```ts
  Wizard: [
    { 1: 2 }, // L1
    { 1: 3 }, // L2
    { 1: 4, 2: 2 }, // L3
  ];
  ```

### Spells

- `spellTable: { ...SRD_SPELLS, my_custom_spell: { ... } }`
- Spread `SRD_SPELLS` from `./srd/index.js` for the 24 standard spells.
- Add campaign-specific spells inline.
- See `Spell` type in `types.ts` for the full field list. Common fields:
  - `id`, `name`, `desc`, `level`, `castTime` ('action' | 'bonus_action' | 'reaction')
  - `damage` + `damageType` for damage spells
  - `savingThrow` + `saveEffect` ('negates' | 'half') for save-based spells
  - `attackRoll: true` for spell-attack-roll spells
  - `concentration`, `upcastBonus`, `condition`, `conditionDuration`
  - `aoeShape` ('sphere' | 'cone' | 'cube' | 'line') + `blastRadius`
  - `rangeKind` ('self' | 'touch' | 'ranged') + `rangeFt`

### Enemies

`enemyTemplates: EnemyTemplate[]`. Each template has:

- Stats: `name`, `cr`, `hp`, `ac`, `damage` (dice expr), `toHit`, `xp`
- Optional ability scores: `str` … `cha`
- Combat behavior: `multiattack` (number of attacks per turn), `onHitEffect`
  (apply a condition on hit, with save ability + DC)
- Damage types: `resistances`, `vulnerabilities`, `immunities`
- Condition immunities: `condition_immunities`
- Spell-casting: `spells`, `castChance`, `spellSaveDC`, `spellAttackBonus`
  (see Vale's Frost Acolyte or any caster boss for an example)

The procgen sandbox picks templates randomly per room. Campaigns
typically don't use `enemyTemplates` directly — they place specific
enemy instances via `campaign.enemies[roomId]`.

### Loot

`lootTable: LootItem[]`. Every item used in `classStartingLoot`,
`campaign.loot`, or by NPC shops must be defined here.

Key fields:

- Identity: `id`, `name`, `desc`, `aliases` (alternate parser names)
- Type: `'weapon' | 'armor' | 'consumable' | 'misc'`
- Slot: `'weapon' | 'armor' | 'shield' | null`
- Weapons: `damage`, `damageType`, `range` ('melee' | 'ranged'),
  `weaponType` ('simple' | 'martial'), `finesse`, `versatileDamage`,
  `thrown`, `loading`, `reach`, `heavy`, **`mastery`** (2024)
- Armor: `armorCategory` ('light' | 'medium' | 'heavy' | 'shield'),
  `armorAcBase`, `dexCapToAc`
- Consumables: `heal` (dice expr), `effect`
- Magic items: `requiresAttunement`

### Narratives

The `narratives` field is a required bundle of flavor-text tables used
by the engine to vary combat/exploration prose. Vale has the
authoritative example — copy it wholesale and rewrite the strings for
your setting. Required keys (see the type for full list):

`roomArrival`, `genericArrival`, `weaponVerbs`, `classStyle`,
`enemyReactions`, `deathSaveStatus`, `combatHit`, `combatMiss`,
`enemyAttacks`, `killShot`, `lootPickedUp`, `noLoot`, `alreadyLooted`,
`noEnemy`, `alreadyDead`, `sneakSuccess`, `sneakFail`, `deathLines`,
`escapeLines`, `enemyDeflected`, `levelUp`, `noEscapeNearby`,
`escapeBlocked`.

Optional override keys: `combatStart`, `shortRest`, `longRest`.

Common substitution tokens: `{enemy}`, `{target}`, `{dmg}`, `{xp}`,
`{world}`, `{name}`, `{level}`, `{hpGained}`, `{hpNow}`, `{hpMax}`.

### NPCs

Two ways to put NPCs in the world:

- **Procedural** (roguelike contexts): `npcTemplates` + `npcSpawnChance`.
  The procgen scatters templates into rooms with probability per
  middle room.
- **Authored** (campaign contexts): `campaign.npcs[roomId]` places a
  specific `PlacedNpc` in a specific room.

NPC fields:

- Identity: `id`, `name`
- Stat block for when they become hostile: `hp`, `ac`, `damage`, `toHit`, `xp`
- Social: `attitude` ('friendly' | 'indifferent' | 'hostile'),
  `greeting`, `responses` (dialog choices with consequences),
  `persuasionDC` (CHA check DC when indifferent)
- Trade: `shop?: NpcShopEntry[]` — list of `{ itemId, price }`
- **`factionId`** (2024 update): links shop pricing to faction rep —
  see Vale's Aldric the Merchant for an example

---

## Campaign-mode fields (Context.campaign: CampaignData)

Only required for `mapType: 'campaign'`.

### Rooms + connections

```ts
campaign.rooms: Room[]
campaign.connections: Record<string, string[]>
```

`rooms` defines every location: `id`, `name`, `desc`, plus optional
`trap` (with `dc`, save type, damage), `objects` (interactive items),
`difficultTerrain` (grid positions where movement costs 2×),
`canRest: false` (some rooms forbid resting).

`connections` is an adjacency map: `connections[roomId]` is the list
of room IDs reachable from `roomId`. Bidirectional links require
both directions explicitly.

### Enemy placement

```ts
campaign.enemies: Record<string, Enemy[]>
```

Maps `roomId → enemy instances`. Each enemy needs a globally unique
`id` (convention: `${roomId}#${index}` — e.g. `'crypt_lord_throne#0'`).
Quest conditions match against these IDs.

### Loot placement

```ts
campaign.loot: Record<string, LootItem>
```

One loot pile per room. The item is auto-given on first room visit
when conditions allow.

### Locations (for faction-style hubs)

```ts
campaign.locations: Location[]
```

Optional grouping of rooms into named regions. Each Location has its
own grid dimensions and a list of contained rooms. Useful when a
campaign has multiple distinct grid-combat zones (e.g. Vale's town
vs. crypt have different grid sizes).

### Quests

```ts
campaign.quests: Quest[]
```

Each Quest has:

- `id`, `title`, `desc`
- `giverNpcId` — which NPC offers it (for the "Accept quest" choice
  to surface on that NPC's dialog)
- `steps: QuestStep[]` — each with an `id`, `desc`, and a `condition`
  written in json-rules-engine syntax against `CampaignFacts`
- `rewards: GameConsequence[]` — fired when the quest completes
- `factionId`, `repGain` — optional rep boost on completion

#### Quest condition shape (json-rules-engine)

Each step has a `condition` evaluated against a `CampaignFacts` object
containing `enemies_killed`, `loot_taken`, `flags`, `quest_progress`,
`faction_rep`, `current_room`, etc. The engine evaluates after every
action.

Example — "talk to Aldric and accept the quest":

```ts
{
  id: 'step_talk_aldric',
  desc: 'Speak with Aldric the Merchant in the market.',
  condition: {
    all: [
      { fact: 'flags', path: '$.rule_fired_step_talk_aldric', operator: 'equal', value: true },
    ],
  },
}
```

Example — "kill the Crypt Lord and recover the ledger":

```ts
{
  id: 'step_kill_lord',
  desc: 'Defeat the Crypt Lord and recover the Guild Ledger.',
  condition: {
    all: [
      { fact: 'enemies_killed', operator: 'contains', value: 'dungeon_crypt_throne#0' },
      { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
    ],
  },
}
```

**Gotcha**: `loot_taken` is keyed by both `roomId` AND `itemId` — the
engine pushes both when loot is grabbed. Author conditions against the
itemId (it survives item-pile reshuffling).

**Gotcha**: enemy IDs are `${roomId}#${index}`, NOT just `${roomId}`.
Check existing modules for the right form.

#### Available consequence types

(See `GameConsequence` union in `types.ts`)

- `add_narrative` — append flavor text
- `set_flag` — set a campaign flag
- `give_item` — grant a loot item
- `modify_hp` — heal/damage a character
- `unlock_room` — make a previously-blocked room reachable
- `spawn_enemy` — add an enemy mid-game
- `set_escape` — flip the escape gate
- `advance_quest` — bump a quest forward
- `set_faction_rep` — adjust rep
- `travel_to` — move party to a named location
- `give_gold` — add coins to leader
- `set_npc_attitude` — flip a specific NPC's attitude

### Factions

```ts
campaign.factions: Faction[]
```

Each faction has:

- `id`, `name`
- `thresholds`: `{ hostile, unfriendly, neutral, friendly, exalted }`
  — rep cutoffs (e.g. friendly: 20 means rep ≥ 20 → friendly)
- `shopPriceModifiers`: multiplier per attitude tier
  (e.g. friendly: 0.9 → 10% discount)

Faction rep is gained via `set_faction_rep` consequences in quest
rewards. NPCs tagged with `factionId` get rep-modified shop prices
automatically.

### Recommended party

```ts
campaign.recommendedPartySize: number
campaign.recommendedComposition: string[]
```

Surfaced on the character creation screen as the "auto-fill party"
suggestion. Pansori scales enemy HP linearly with party size, so a
campaign authored for 3 PCs facing the boss is balanced when 3 PCs
actually show up. Document the expectation here.

---

## Game rules (Context.rules)

Free-form rules that fire when their conditions match. Use these
sparingly — quests cover most narrative-progression needs. Rules are
better for cross-cutting effects (e.g. "the third time the party
fails a stealth check, the alarm rings").

```ts
rules: GameRule[]
```

Each rule has `name`, `priority`, `conditions` (json-rules-engine
syntax), `consequences`, and optional `once: true` (fires only once).

`once: true` automatically sets `flags.rule_fired_<name>` so the rule
self-disables. Combine with conditions checking `rule_fired_*` to
chain or gate rules.

---

## Common gotchas

1. **Empty `narratives` keys cause crashes**. If you don't have flavor
   for `enemyDeflected`, supply at least one generic fallback string.
2. **Item IDs must be lowercase snake_case** to match the parser's
   alias matching. `'chain_mail'`, not `'Chain Mail'`.
3. **Room IDs in `connections` must exist in `rooms`**. The engine
   doesn't pre-validate; bad IDs surface as "you can't get there from
   here" or silent failures.
4. **Class IDs use PHB titlecase**. `'Fighter'` not `'fighter'`. The
   SRD constants follow this convention.
5. **Quest condition `value` arrays don't work with `contains`** —
   use one condition per value with `all` to AND them.
6. **NPC `attitude` defaults aren't read** if the seed is loaded from
   a save — the engine looks at `state.npc_attitudes[roomId]` first.
   To force a hostile NPC at session start, write `set_npc_attitude`
   in an `intro_rules` rule that fires on first room arrival.
7. **The `escapeRoomId` room must be reachable**. Players hit
   "no path" otherwise, with no clear recovery.

---

## Testing your campaign

Run the existing scripted playthrough as your model:

- `src/backend/src/contexts/vale_of_shadows.spec.ts` drives `takeAction`
  through every Vale quest step. Copy the structure for your campaign.
- Each step calls `dispatch({...})` with the appropriate action and
  asserts on `state.quest_progress`, `state.enemies_killed`, etc.
- The test catches broken quest conditions, soft-locked combats, and
  missing NPC dialog branches in CI before deploy.

The Playwright E2E suite (`tests/e2e/`) covers the UI integration but
isn't quest-aware — your campaign's smoke test should be the backend
scripted playthrough.

---

## What this doc doesn't cover

- **Frontend context registration**: campaign UI (theme, art, intro
  pane) lives in `src/frontend/src/contexts/<id>.tsx`. Mirror the
  backend Context.id. See `vale_of_shadows.tsx` for the shape.
- **Art**: room art and portraits go in `src/frontend/public/` and
  are referenced from the frontend context's art manifest.
- **LLM narrative augmentation**: when `ANTHROPIC_API_KEY` is set, the
  engine asks Claude to rewrite combat narrations. Author your
  campaign's deterministic prose first; the LLM is layered on top.

---

## Quick checklist before merging a new campaign

- [ ] `id` is unique across all contexts
- [ ] All `roomId` references resolve
- [ ] `startRoomId` and `escapeRoomId` are in `rooms`
- [ ] Every `classStartingLoot` item is in `lootTable`
- [ ] Every quest's `giverNpcId` exists in some `campaign.npcs[roomId]`
- [ ] `recommendedPartySize` matches your boss-fight encounter design
- [ ] `narratives` table is complete (no missing keys)
- [ ] Backend scripted playthrough test passes
- [ ] Frontend `src/frontend/src/contexts/<id>.tsx` exists with theme
- [ ] CI lint + typecheck + unit tests pass locally
