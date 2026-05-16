# Pansori

A dynamic browser RPG experience with switchable themes. Pansori is a traditional Korean musical storytelling art 
performed by a single vocalist and one drummer. Using only a fan, a drum, and their voice, the singer embodies 
multiple characters, blending dramatic song, rhythmic speech, and physical gestures to convey epic stories. This is 
what we want to do with this project. With just a couple text strings and roll of the virtual dice, the narrative 
engine weaves an epic adventure that you star in.

## Quick start

```bash
# 1. Copy env and add your Anthropic API key
cp .env.example .env
# Edit .env → set ANTHROPIC_API_KEY

# 2. Start everything
docker compose up --build

# 3. Open the game
open http://localhost:5173

# Optional: open pgAdmin DB browser
docker compose --profile tools up -d
open http://localhost:5050
```

## Services
| Service  | URL                    | Notes              |
|----------|------------------------|--------------------|
| Frontend | http://localhost:5173  | React + Vite       |
| Backend  | http://localhost:3001  | Express + Socket.io|
| Postgres | localhost:5432         | rpguser / rpgpass  |
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

## Next steps
- [ ] Add world map visualization
- [ ] Sound effects
- [ ] Save/load named slots
- [ ] Multiplayer lobby (Socket.io rooms ready)
