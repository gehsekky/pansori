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
├── .env
└── src/
    ├── db/migrations/        ← SQL run on first postgres boot
    ├── backend/              ← TypeScript, runs via tsx (no build step)
    │   └── src/
    │       ├── types.ts      ← shared interfaces (GameState, Seed, Context, …)
    │       ├── contexts/     ← scifi-terror.ts, dungeon-crawler.ts
    │       ├── routes/       ← game.ts (REST API)
    │       ├── services/     ← procgen.ts, gameEngine.ts, rulesEngine.ts
    │       └── db/           ← pool.ts
    └── frontend/             ← React + Vite (TypeScript)
        └── src/
            ├── types.ts      ← shared frontend interfaces
            ├── contexts/     ← scifi-terror.tsx, dungeon-crawler.tsx
            ├── lib/api.ts    ← typed API client
            └── App.tsx       ← game UI shell
```

## Database

Single `game_sessions` table stores both session metadata and the full game state JSONB blob. Migrations live in `src/db/migrations/` and run automatically on first boot.

## Adventure scripts (contexts)

Each context file defines a complete game setting:

| Field | Purpose |
|---|---|
| `mapType` | `'roguelike'` (procgen) or `'campaign'` (fixed map) |
| `classSkills` | Per-class skill proficiencies (e.g. Rogue gets stealth) |
| `enemyTemplates` | Real stat blocks with CR, HP, AC, toHit, XP, DEX, WIS |
| `lootTable` | Items with slot, finesse, range, and effect fields |
| `narratives` | All flavour text pools used by the game engine |

Procgen uses BFS from the start room to scale enemy CR by distance — early rooms draw from CR ≤ 1 templates, mid rooms from CR ≤ 5, far rooms from the full pool.

## Rules engine (5e)

`rulesEngine.ts` implements D&D 5e mechanics as pure functions:

- Attack rolls with STR modifier (or DEX for finesse weapons)
- Ranged weapons in melee apply disadvantage (roll 2d20, keep lower)
- Shields occupy a dedicated slot (+2 AC, blocked in combat)
- Stealth checks use enemy passive Perception (10 + WIS mod) and class proficiency
- Death saves (nat 20 = 1 HP, nat 1 = 2 failures, 3 failures = dead)
- Proficiency bonus scales with player level

## License

GPL v3 — see [LICENSE](LICENSE).
