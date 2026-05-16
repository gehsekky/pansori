# Pansori

A dynamic browser RPG experience with switchable themes. Pansori is a traditional Korean musical storytelling art 
performed by a single vocalist and one drummer. Using only a fan, a drum, and their voice, the singer embodies 
multiple characters, blending dramatic song, rhythmic speech, and physical gestures to convey epic stories. This is 
what we want to do with this project. With just a couple text strings and roll of the virtual dice, the narrative 
engine weaves an epic adventure that you star in.

## Quick start

```bash
# 1. Copy env
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
| Service  | URL                    | Notes              |
|----------|------------------------|--------------------|
| Frontend | http://localhost:5173  | React + Vite       |
| Backend  | http://localhost:3001  | Express + Socket.io|
| Postgres | localhost:5432         | pansori / pansori  |
| pgAdmin  | http://localhost:5050  | --profile tools    |

## Project structure
```
├── docker-compose.yml
├── .env
└── src/
    ├── db/migrations/       ← SQL run on first postgres boot
    ├── backend/
    │   └── src/
    │       ├── routes/      ← game.js
    │       ├── services/    ← procgen.js, gameEngine.js, rulesEngine.js
    │       └── db/          ← pool.js
    └── frontend/
        └── src/
            ├── contexts/    ← scifi-terror.jsx, dungeon-crawler.jsx
            ├── lib/api.js   ← typed API client
            └── App.jsx      ← game UI shell
```
