# Pansori

A browser RPG engine that runs adventure scripts — from small roguelikes to full campaigns. Pansori is a traditional Korean musical storytelling art performed by a single vocalist and one drummer. Using only a fan, a drum, and their voice, the singer embodies multiple characters, blending dramatic song, rhythmic speech, and physical gestures to convey epic stories. This is what we want to do with this project: with a script, some dice rolls, and a rules engine, the narrative weaves an adventure you star in.

## Quick start

```bash
# 1. Copy env and fill in credentials
cp .env.example .env

# 2. Start everything
npm run dev

# 3. Open the game
open http://localhost:5173
```

## NPM scripts

| Command | Description |
|---|---|
| `npm run dev` | Build and start all containers (detached) |
| `npm run stop` | Stop all containers |
| `npm run restart` | Restart all containers |
| `npm run logs` | Tail logs for all containers |
| `npm run logs:be` | Tail backend logs only |
| `npm run logs:fe` | Tail frontend logs only |
| `npm run db` | Start pgAdmin (http://localhost:5050) |
| `npm run fresh` | Destroy volumes and rebuild from scratch |
| `npm run lint` | Lint frontend and backend |
| `npm run format` | Format frontend and backend |

## Services

| Service  | URL                   | Notes                        |
|----------|-----------------------|------------------------------|
| Frontend | http://localhost:5173 | React + Vite (TypeScript)    |
| Backend  | http://localhost:3001 | Express + Node (tsx runtime) |
| Postgres | localhost:5432        | pansori / pansori / pansori_db |
| pgAdmin  | http://localhost:5050 | `npm run db` to enable       |

## Project structure

```
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env
├── docs/                       ← TODO, AUTHORING, DEPLOY, srd-only-audit, srd-5.2.1.txt
├── tests/e2e/                  ← Playwright smoke tests
└── src/
    ├── backend/                ← TypeScript; tsx in dev, tsc → dist in prod
    │   ├── migrations/         ← SQL run on first postgres boot
    │   └── src/
    │       ├── types.ts        ← shared interfaces (GameState, Seed, Context, …)
    │       ├── auth/           ← Google OAuth + session middleware
    │       ├── contexts/       ← sandbox.ts, vale_of_shadows.ts, whispering_pines.ts, grove_of_thorns.ts
    │       │   └── srd/        ← classes, spells, monsters, species, beast_forms
    │       ├── db/             ← pool.ts
    │       ├── routes/         ← game.ts (REST API) + schemas.ts (Zod)
    │       └── services/       ← gameEngine, rulesEngine, gridEngine, damage, multiclass, conditions/, narrative/, procgen, campaignEngine, migrationRunner, llmProvider, and actions/ (one handler per player action, dispatched via actions/index.ts)
    └── frontend/               ← React + Vite (TypeScript)
        └── src/
            ├── App.tsx         ← 3-zone game UI shell
            ├── components/     ← PartyRail, ContextPanel, InitiativeStrip, Dialog, …
            ├── contexts/       ← sandbox.tsx, vale_of_shadows.tsx, whispering_pines.tsx, grove_of_thorns.tsx
            ├── data/           ← species, items mirror
            ├── hooks/          ← reusable hooks
            ├── lib/            ← typed API client
            └── types.ts        ← shared frontend interfaces
```

## Database

Single `game_sessions` table stores session metadata and the full game state JSONB blob; companion `users` / `user_identities` tables back Google OAuth. Migrations live in `src/backend/migrations/` and are applied transactionally on backend startup by `migrationRunner`.

## Adventure scripts (contexts)

Each context file defines a complete game setting:

| Field | Purpose |
|---|---|
| `mapType` | `'roguelike'` (procgen) or `'campaign'` (fixed map) |
| `classSkills` | Per-class skill proficiencies (e.g. Rogue gets stealth) |
| `enemyTemplates` | Stat blocks with CR, HP, AC, toHit, XP, ability scores, multi-attack, boss phases, and `attackReachFt` / `speedFt` for tactical grid combat |
| `lootTable` | Items with slot, finesse, range, weapon mastery, armor category, and effect fields |
| `narratives` | All flavour text pools used by the game engine |
| `campaign` | Fixed locations + rooms for campaign maps (Vale of Shadows, Whispering Pines, Grove of Thorns) |

Procgen uses BFS from the start room to scale enemy CR by distance — early rooms draw from CR ≤ 1 templates, mid rooms from CR ≤ 5, far rooms from the full pool.

The SRD pack under `src/backend/src/contexts/srd/` (classes, spells, monsters, species, beast forms) is shared by every context.

## Rules engine (SRD 5.2.1, strict)

Pansori is a **strict SRD 5.2.1 build** — the 2024-compatible System Reference Document only, with **no PHB- or DMG-exclusive content** (subclasses, feats, species, or spells). See [docs/srd-only-audit.md](docs/srd-only-audit.md) for the scope and migration record, and [CLAUDE.md](CLAUDE.md) for the contribution rule. The engine is a mix of pure functions in `rulesEngine.ts` (attack/save/skill resolution), turn flow + reaction windows in `gameEngine.ts`, per-action handlers under `services/actions/` (each dispatched against an `ActionContext`), and grid math in `gridEngine.ts`.

Highlights of what's implemented:

- **Tactical grid combat** — BFS pathfinding, opportunity attacks (with reach-weapon override), cover (`coverBonus`), flanking (optional rule), difficult terrain, and Chebyshev distance / diagonal-cost-1 rule. Enemies must close to their `attackReachFt` before they can melee.
- **Action economy** — action, bonus action, reaction, free interaction; reaction windows pause the engine and route prompts to the eligible PC.
- **Reactions / interrupts** — Shield, Counterspell, Hellish Rebuke, Uncanny Dodge, readied actions, opportunity attacks, and a post-roll Heroic Inspiration reroll window. `pending_reaction` discriminated union; enemy spell-casting (Frost Acolyte fire_bolt) exercises Counterspell.
- **Weapon Masteries** — the 8 SRD masteries (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) plus pansori's `flex` variant; per-class slot table (`SRD_WEAPON_MASTERY_SLOTS`).
- **Multi-target spell allocation** — Magic Missile per-dart, Eldritch Blast per-beam (L5+). Choice gen emits focus-fire + spread variants.
- **Class features (12 classes, ≥1 subclass each)** — Cleric Divine Spark/Turn Undead/Sear Undead; Fighter Second Wind (multi-use), Tactical Master, Studied Attacks; Monk Discipline Points / Patient Defense / Stunning Strike cap; Rogue Cunning Strike; Druid Wild Shape (2024 Beast Forms); Barbarian Rage (2024 progression); plus full feature kits for Paladin, Ranger, Wizard, Sorcerer, Warlock, Bard.
- **Multiclassing** — per-class levels (`class_levels`), the multiclass spell-slot table, ability prerequisites, proficiency grants on class entry, and feature gating by per-class level.
- **Species** — the 9 SRD species in `contexts/srd/species.ts` (Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling) with mechanical traits (Halfling Lucky, Dwarven Toughness, Dragonborn Breath Weapon, Tiefling Infernal Legacy, Orc Relentless Endurance / Adrenaline Rush, Goliath Powerful Build / Large Form, etc.).
- **Inspiration** — Heroic Inspiration auto-granted on Nat 1; Heroic + Bardic Inspiration spendable on any d20 (attack / save / ability check).
- **Hide DC tracking** — successful Hide stores the stealth total; enemies roll passive Perception first, then an active Search action that costs their turn.
- **Conditions with source attribution** — `condition_sources` map tracks who Frightened or Charmed a PC, so movement restrictions and "can't attack your charmer" guards have a target.
- **Encumbrance** — heavy load (> 10× STR, doubled for Powerful Build) applies disadvantage to STR/DEX/CON checks, saves, and attacks.
- **Boss phases** — HP-threshold phase transitions (`EnemyTemplate.phases`) with set_multiattack / set_damage / set_to_hit / set_ac / set_on_hit_effect / add_resistance / heal effects.

## Tests

- **Backend**: `npm run test:be` — Vitest, ~1000 tests across the engine specs (`gameEngine.*`, `rulesEngine`, `gridEngine`, `damage`, `multiclass`, `procgen`, `conditions/`, …) and per-action handler specs under `services/actions/`.
- **Frontend**: `npm run test:fe` — Vitest in jsdom (~110 tests across component + integration specs).
- **Shared types**: `npm run sync-types:check` — verifies `src/backend/src/shared-types.ts` and `src/frontend/src/shared-types.ts` are in sync with the source of truth at `src/shared/types.ts`. CI gate; `npm run sync-types` regenerates locally.
- **E2E**: `npm run test:e2e` — Playwright (`tests/e2e/`) covers login → BEGIN ADVENTURE, session resume, and a sandbox combat loop. Gates production deploys in CI.

## Credits

Iconography:

- [Phosphor Icons](https://phosphoricons.com/) (MIT) — UI chrome (navigation arrows, generic glyphs).
- [RPG Awesome](https://nagoshiashumari.github.io/Rpg-Awesome/) by Daniela Howe and Ivan Montiel — fantasy-domain glyphs (weapons, spells, damage types, conditions). Font licensed under [SIL OFL 1.1](https://scripts.sil.org/OFL); CSS under MIT.

## License

MIT — see [LICENSE](LICENSE).

This project uses material from the System Reference Document 5.2.1 by Wizards of the Coast LLC, licensed under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/). See [LEGAL.md](LEGAL.md) for the full attribution.
