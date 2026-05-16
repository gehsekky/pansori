# TODO

## Script Engine (core goal)
- [ ] Fixed map support — when mapType is campaign, skip procgen and use explicit room/connection/enemy/loot definitions from the script
- [ ] Event/trigger system — scripts register hooks (`onEnterRoom`, `onKillEnemy`, `onPickupItem`, etc.) to fire narrative, mutate state, or set flags
- [ ] Multiple win conditions — scripts define custom victory conditions beyond "reach escape room"
- [ ] NPC system — non-enemy characters with scripted dialogue trees
- [ ] Campaign persistence — world state that survives across multiple sessions (separate from per-session GameState)
- [ ] Dynamic script discovery — scan a scripts/ directory at startup instead of hardcoded imports

## Features
- [ ] Add world map visualization
- [ ] Sound effects
- [ ] Save/load named slots
- [ ] Multiplayer lobby (Socket.io rooms ready)
- [ ] New game / character creation flow
- [ ] Non-combat classes feel useless — find ways to incorporate class abilities into narrative and game mechanics (e.g. Rogue stealth bonuses, Bard persuasion, Cleric healing, etc.)
- [ ] User login system. Just Google SSO at first. Then expand to support more providers and in-house email/password.

## Rules Engine (D&D 5e gaps)
- [ ] Conditions system (poisoned, stunned, prone, etc.)
- [ ] Spell system
- [ ] Full enemy stat blocks for remaining creatures not yet in either context
