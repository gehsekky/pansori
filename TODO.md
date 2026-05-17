# TODO

## Script Engine (core goal)
- [ ] Fixed map support — when mapType is campaign, skip procgen and use explicit room/connection/enemy/loot definitions from the script
- [ ] Event/trigger system — scripts register hooks (`onEnterRoom`, `onKillEnemy`, `onPickupItem`, etc.) to fire narrative, mutate state, or set flags
- [ ] Multiple win conditions — scripts define custom victory conditions beyond "reach escape room"
- [ ] NPC system — non-enemy characters with scripted dialogue trees
- [ ] Campaign persistence — world state that survives across multiple sessions (separate from per-session GameState)
- [ ] Dynamic script discovery — scan a scripts/ directory at startup instead of hardcoded imports

## Features
- [ ] Sound effects
- [ ] Checkpoint saves — store multiple state snapshots per session so players can rewind to before a bad decision
- [x] Persistent saves with resume — all sessions auto-saved after every action; session list screen lets users resume any active run
- [ ] Multiplayer lobby (Socket.io rooms ready)
- [ ] LLM narrative provider abstraction — pluggable `LLMProvider` interface (`generate(prompt, systemPrompt): Promise<string>`) with two implementations: `AnthropicProvider` (Anthropic SDK) and `LocalProvider` (Ollama, OpenAI-compatible REST). Selected via `LLM_PROVIDER=anthropic|local|none` env var. `none` falls back to existing deterministic templates. LLM enhances (rewrites) the template output string rather than generating from raw game state — keeps game logic deterministic, limits prompt complexity. `history` param in `takeAction` already stubbed for this. Deployment note: local mode needs Ollama running alongside the backend (same EC2 or sidecar); minimum practical instance is t3.large (8 GB RAM) for a 3B Q4 model — CPU inference will be 15–60s per call.
- [x] Add world map visualization
- [x] Add keybindings for the options so a user can use a keyboard to navigate the game
- [x] Non-combat class abilities — medicine healing bonus, arcana/investigation item identification
- [x] User login system — Google SSO with session persistence and user ownership of game sessions
- [x] Portrait / avatar selection — Google SSO avatar as default + SVG silhouette options
- [x] Session list screen — all user runs with resume capability (Option A)
- [x] High school zombie context — backend + frontend + registration
- [x] Fix ballistic shield equip bug — derive equippability from item.slot/item.damage instead of lookup maps
- [x] Remove redundant weaponNames/armorNames frontend lookup maps

## Rules Engine (D&D 5e gaps)
- [ ] Spell system
- [x] Rules engine separation audit — moved ADVANTAGE_CONDITIONS, DISADV_CONDITIONS, rollConditionSave, resolveSaveWithAdvantage, resolveMysteryConsumable, passivePerceptionDC to rulesEngine.ts
- [x] Conditions system (poisoned, stunned, prone, paralyzed, frightened) — on-hit saving throws, attack blocking, advantage/disadvantage, cleared on combat end
- [x] Full enemy stat blocks — dungeon-crawler: Mummy, Banshee, Vampire Spawn, Lich; scifi-terror: Face-Hugger, Space Pirate, Mutant Horror, Security Mech
