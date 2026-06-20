<!-- refreshed: 2026-06-20 -->
# Architecture

**Analysis Date:** 2026-06-20

## System Overview

Pansori is a browser-based SRD 5.2.1 RPG engine with a three-tier architecture: a React frontend (SPA), an Express backend (TypeScript/Node), and a PostgreSQL database. It models complete TTRPG campaign mechanics (tactical combat, spellcasting, class features, multiclassing, conditions, dialogue gating) with procedural generation for roguelikes and fixed maps for authored campaigns.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                        │
├──────────────────┬──────────────────┬──────────────────┬────────────┤
│  Login/Sessions  │  Character Sheet │   Game UI Shell  │   Combat   │
│  `LoginScreen`   │  `CharScreen`    │   `App.tsx`      │ `3DView`   │
│  `SessionScreen` │  `PartyRail`     │  (Party Rail)    │ `GridView` │
└────────────────┬─┴──────────────────┴──────────────────┴────────────┘
                 │ Socket.IO + REST API (JSON)
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Backend (Express + TypeScript)                     │
├──────────────────┬──────────────────┬──────────────────┬─────────────┤
│ Authentication   │  REST API Layer  │   Game Engine    │  Campaign   │
│  `auth/`         │  `routes/`       │  `services/`     │  `data/`    │
│  (Google OAuth)  │  (game.ts)       │  (gameEngine.ts) │  (srd/)     │
└────────────────┬─┴──────────────────┴──────────────────┴─────────────┘
                 │ Session / WebSocket coordination
                 │ Rules engine dispatches actions
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│               PostgreSQL (Sessions, Campaign Metadata)               │
│  `game_sessions` (JSONB: gameState + seed)                          │
│  `campaigns` (campaign metadata, regions, towns, rooms, monsters)   │
│  `users` / `user_identities` (OAuth state)                          │
│  `campaign_roles` / `session_participants` (multiplayer access)     │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Layer | Component | Responsibility | File |
|-------|-----------|-----------------|------|
| **Frontend** | LoginScreen / SessionScreen | Authentication flow, session list | `src/frontend/src/components/LoginScreen.tsx` |
| **Frontend** | CharScreen | Character creation UI; synthesizes context donations | `src/frontend/src/components/CharScreen.tsx` |
| **Frontend** | App.tsx | Root shell; route logic, modal/panel state | `src/frontend/src/App.tsx` |
| **Frontend** | useGame hook | WebSocket subscription, action dispatch, state mirror | `src/frontend/src/hooks/useGame.ts` |
| **Frontend** | lib/api.ts | Typed REST + WebSocket client | `src/frontend/src/lib/api.ts` |
| **Backend** | routes/game.ts | REST endpoints (new session, join, take action, sync) | `src/backend/src/routes/game.ts` |
| **Backend** | routes/auth.ts | OAuth callback, login, logout | `src/backend/src/routes/auth.ts` |
| **Backend** | services/gameEngine.ts | Turn flow, state transitions, rules dispatch | `src/backend/src/services/gameEngine.ts` |
| **Backend** | services/rulesEngine.ts | Attack/save/skill rolls, AC, proficiency | `src/backend/src/services/rulesEngine.ts` |
| **Backend** | services/gridEngine.ts | Tactical grid math, pathfinding, vision | `src/backend/src/services/gridEngine.ts` |
| **Backend** | services/actions/ | 50+ action handlers (one file per action type) | `src/backend/src/services/actions/` |
| **Backend** | campaignData/srd/ | SRD base data (spells, monsters, items, classes) | `src/backend/src/campaignData/srd/` |
| **Backend** | db/pool.ts | PostgreSQL connection pool | `src/backend/src/db/pool.ts` |

## Pattern Overview

**Overall:** Service-oriented dispatch with pure-functional rules and mutable state in a JSONB column.

**Key Characteristics:**
- **State cohesion:** Game state (`GameState`) is a single JSONB blob persisted in `game_sessions.state`; migrations / snapshots backed by `gameState` schema validation (`stateSchema.ts`)
- **Action dispatch:** Player actions (`StructuredAction`) flow REST → `takeAction()` → action-specific handler (one file per kind) → consequences written back to DB, broadcast via WebSocket
- **Rules immutability:** `rulesEngine` and `gridEngine` are pure functions (no side effects); tests use fixtures and manual validation
- **Context flexibility:** Campaigns are authored as database rows (creator-managed) or code (SRD baseline); both resolved at runtime via `contextLoader.ts`
- **Multiplayer-friendly:** Session state includes per-player turn sequences; concurrent writes detected and rejected (race-detection via `turn_seq`); broadcasts sync all participants idempotently

## Layers

**API Layer (Express):**
- Location: `src/backend/src/routes/` and `src/backend/src/index.ts`
- Handles: HTTP request parsing, session auth, error responses, WebSocket room broadcasts
- Depends on: Services (gameEngine, campaignEngine), database, broadcast
- Used by: Frontend REST + WebSocket client

**Game Engine:**
- Location: `src/backend/src/services/gameEngine.ts`
- Handles: Turn flow, reaction windows, combat event sequencing, choice generation, consequence application
- Depends on: rulesEngine, gridEngine, action handlers, multiclass, conditions
- Used by: takeAction route handler, turn-advance system

**Rules Engine:**
- Location: `src/backend/src/services/rulesEngine.ts` (pure functions)
- Handles: d20 rolls, attack/save resolution, proficiency, AC, conditions checks
- Depends on: Types only (no side effects)
- Used by: gameEngine, action handlers, combat UI preview

**Grid Engine:**
- Location: `src/backend/src/services/gridEngine.ts` (pure functions)
- Handles: Chebyshev distance, BFS pathfinding, line-of-sight, cover, terrain cost, light/darkness
- Depends on: rulesEngine (vision), types
- Used by: movement actions, enemy AI, targeting

**Action Handlers:**
- Location: `src/backend/src/services/actions/` (one TypeScript file per action type)
- Handles: Validation, cost deduction, mutation, narrative composition
- Depends on: Other handlers (for delegation), rulesEngine, multiclass, gameEngine, conditions
- Used by: `dispatchAction()` router in `actions/index.ts`

**Multiclass/Feature Layer:**
- Location: `src/backend/src/services/multiclass.ts` and `services/actions/meta.ts`
- Handles: Class-level feature checks (Sneak Attack, Wild Shape, Divine Smite), spell-slot tables, proficiency rules
- Depends on: rulesEngine, character sheets
- Used by: gameEngine, action handlers, character creation

**Data/Campaign Layer:**
- Location: `src/backend/src/campaignData/` (SRD baseline) + `src/backend/src/services/campaignEngine.ts` (DB overlays)
- Handles: Spell/monster/item/class definitions, campaign-specific region/room/NPC data
- Depends on: Nothing (static definitions)
- Used by: characterSheet synthesis, enemy spawning, loot tables

**Frontend Context Providers:**
- Location: `src/frontend/src/contexts/base.tsx`
- Handles: Reference data (classes, skills, backgrounds) for character creation UI
- Depends on: Nothing (static data)
- Used by: CharScreen, creation modal

**Frontend State Management:**
- Location: `src/frontend/src/hooks/useGame.ts`
- Handles: WebSocket subscription, session state mirroring, choice dispatch
- Depends on: api.ts (REST/WebSocket client)
- Used by: App.tsx root, all game UI panels

## Data Flow

### Primary Request Path (Player Action)

1. **Player initiates action in UI** (`App.tsx` choice button / component event)
   - `useGame.handleChoice(choice)` dispatches `StructuredAction` to REST endpoint

2. **REST endpoint receives action** (`routes/game.ts` POST `/game/action`)
   - `ActionSchema` parses and validates the action body
   - Session auth verified; race-detection check compares client `turn_seq` vs DB `turn_seq`

3. **Action dispatched to handler** (`services/actions/index.ts` → `dispatchAction()`)
   - Routes action type to specific handler (e.g., `handleAttack`, `handleGridMove`)
   - Handler validates preconditions, deducts costs, mutates `gameState`, composes narrative

4. **Game engine consequence loop** (`services/gameEngine.ts` → `applyConsequence()`)
   - Consequence (damage, healing, condition, terrain change) applied to state
   - New turn/round/combat phase logic triggered
   - Choice pool regenerated for next state

5. **State persisted + broadcast** (`routes/game.ts`)
   - New `gameState` written to `game_sessions.state` (JSONB)
   - `turn_seq` incremented (atomic, prevents races)
   - WebSocket broadcast emits new state to all session participants (room: `session-{id}`)
   - REST response returns new state + choices

6. **Frontend mirrors state** (`useGame.ts` Socket.IO listener)
   - Socket receives `state` event
   - Local React state updated idempotently (choices, gameState, seed, session)
   - UI re-renders reflecting the new game state

### Enemy Turn Flow

1. **Combat phase check** (`gameEngine.ts` → `generateChoices()`)
   - If combat is active and it's enemy turn, `enemyActor()` computes enemy action via simple heuristics
   - Action queued as `pending_action` on the enemy entity

2. **Auto-dispatch of enemy actions** (within same `takeAction` call)
   - Enemies execute immediately without waiting for REST round-trip
   - Enemy attack / move / spell-cast actions resolved in sequence
   - Reactions (Shield, Counterspell) are **not** handled in auto-dispatch; only generated for PCs

3. **Turn advancement** (at end of action sequence)
   - If no more pending actions, turn ends; next actor rotated in
   - Condition expiries checked, end-of-turn hooks fired

### Reaction Window (Interrupt Flow)

1. **Reaction-triggering action happens** (enemy attack, spell cast, movement)
   - Engine sets `pending_reaction` on eligible PC (e.g., Shield on being hit, Counterspell on enemy spell)
   - Action paused; REST returns to frontend with choices = `[{ kind: 'reaction', ... }]`

2. **Player responds** (or passes on reaction deadline)
   - Client dispatches reaction action or `pass` action
   - Backend applies reaction consequence (AC reduction, spell fizzle, etc.)
   - Original action resumes with modified outcome

### Spell Casting Path

1. **Cast spell action** (`services/actions/castSpell/index.ts`)
   - Spell slot / resource check (prep, known, pact slots)
   - Concentration validation (if new spell, break previous concentration)
   - Spell-specific rules applied (range, targets, saving throw, AoE shape)

2. **Multi-target allocation** (for spells like Magic Missile, Eldritch Blast)
   - Choice generation returns "focus fire" and "spread" allocation variants
   - Player selects allocation; handler distributes damage per choice

3. **Damage/effect application** (per target)
   - Roll damage (if attack spell) or target save (if save spell)
   - Apply on-hit effects (conditions, riders)
   - Broadcast outcome narrative

### Character Creation Path

1. **Begin creation** (`POST /game/session/new` with character list)
   - Backend resolves campaign context (SRD base + DB overlays)
   - Character sheets initialized: ability scores, skills, proficiencies, starting spells
   - Initial `gameState` + `seed` generated

2. **Feature selection** (leveling/feat UI)
   - Player selects subclass / feat / expertise / metamagic
   - Handler updates character sheet in-game
   - Choices regenerated (e.g., spell selection menus post-subclass)

3. **Session prepared + broadcast**
   - Game readied with initial map state (procgen or campaign fixed map)
   - All party members notified via broadcast
   - Frontend syncs campaign data (theme, context card) from `/game/contexts/{id}`

**State Management:**
- All mutable state lives in `GameState` JSONB. No distributed caches.
- Character objects contain computed fields (`derived_` prefix) that are recalculated on read, not stored.
- Conditions tracked with source attribution (`condition_sources` map) for UI and rule evaluation.
- Concentration tracked per-character; spell break on spell cast or concentration loss.

## Key Abstractions

**ActionContext:**
- Purpose: Unified parameter object for action handlers. Passed to every `handleX()` function, includes gameState, session, character, choices, narrative pools.
- Examples: `src/backend/src/services/actions/types.ts`
- Pattern: Handlers are async functions that mutate `context.gameState` in place and return consequences

**Consequence (& ConsequenceKind):**
- Purpose: Structured output from actions; fed to `applyConsequence()` to mutate state and generate narrative
- Examples: `damage`, `heal`, `break_concentration`, `set_condition`, `remove_condition`, `gain_xp`, `change_room`
- Pattern: Consequences are immutable; each has a `kind` discriminant and a payload; engine applies them sequentially

**Choice (& ChoiceKind):**
- Purpose: Player-facing decision points regenerated after each action. Discriminated by `kind` (attack target, spell target, grid move, dialogue option, etc.)
- Examples: `grid_move`, `spell_cast`, `talk_response`, `reaction`
- Pattern: Choices are ephemeral; regenerated each turn. UI renders them as buttons, D-pad, or contextual UI per kind.

**Combat Entity (Character + Enemy):**
- Purpose: Unified type for both PCs and enemies on the tactical grid
- Examples: Both `Character` and `Enemy` extend `CombatEntity`; shared properties (position, AC, HP, conditions, concentration)
- Pattern: gridEngine treats them identically; gameEngine differentiates on `entity.side` (pc / enemy)

**EnemyTemplate & Enemy:**
- Purpose: `EnemyTemplate` is the stat-block definition (CR, AC, HP, attacks, spells). `Enemy` is a live instance on the grid.
- Examples: `EnemyTemplate` defines Frost Acolyte CR 3 attacks; `Enemy` is a specific Frost Acolyte in room A, positioned at (5,7)
- Pattern: Enemies spawned from templates by procgen; each instance gets unique ID, position, HP, conditions; shared immutable template data

**Context vs Seed:**
- Purpose: `Context` is static campaign definition (monster pool, loot table, narrative pools, spell list). `Seed` is the runtime map state (rooms, positioned enemies, loot spawns).
- Examples: Context defines CR thresholds; Seed holds this instance's room 7 with 3 specific goblin placements
- Pattern: Seed regenerates on map transitions; context is loaded once per campaign and reused

## Entry Points

**Backend HTTP Server:**
- Location: `src/backend/src/index.ts`
- Triggers: npm run dev (Docker entrypoint)
- Responsibilities: 
  - Express app setup (CORS, helmet, rate limiting, session store)
  - Passport OAuth configuration
  - WebSocket server (Socket.IO) setup + room subscriptions
  - Route registration (auth, campaigns, game, test)
  - Migration runner on startup

**Frontend Root:**
- Location: `src/frontend/src/main.tsx`
- Triggers: Browser load, Vite dev server
- Responsibilities: React root mount, theme application, font loading

**Frontend App Component:**
- Location: `src/frontend/src/App.tsx`
- Triggers: Always-mounted root component
- Responsibilities:
  - Main route logic (login → sessions → in-game)
  - Modal/panel lifecycle (character creation, inventory, etc.)
  - Theme application per campaign
  - 3D vs 2D view toggle per preference

**Game Action Endpoint:**
- Location: `src/backend/src/routes/game.ts` POST `/game/action`
- Triggers: Player action dispatch from frontend
- Responsibilities: Validate action, dispatch handler, apply consequences, broadcast state

## Architectural Constraints

- **Threading:** Node.js event loop (single-threaded); no worker threads. Async I/O via promises.
- **Global state:** 
  - `CONTEXTS` map (campaign definitions) cached in `contextStore.ts`; reloaded on application startup
  - `pool` (PostgreSQL connection pool) in `db/pool.ts` — singleton, shared across all requests
  - Socket.IO namespace rooms scoped per session ID; broadcast emits to all subscribers in that room
  - No module-level mutable state in action handlers (all state flows through ActionContext)
- **Circular imports:** 
  - `gameEngine.ts` imports from `actions/index.ts`; `actions/` handlers import from `gameEngine.ts` (consequence application) → resolved by lazy require of action dispatcher inside gameEngine
  - Frontend imports are acyclic; lib exports are imported by components, not vice versa
- **Concurrency control:** 
  - Database transactions used for campaign role changes only (multi-user campaign ownership)
  - Game state writes use optimistic concurrency via `turn_seq` version column; race-detected on REST, rejected with 409 Conflict
  - No locking; concurrent action dispatches from same session are queued at the HTTP layer

## Anti-Patterns

### Mutable Passed Objects

**What happens:** Some action handlers mutate the passed character/entity directly instead of the `context.gameState` copy

**Why it's wrong:** Makes change tracing harder; if an action fails mid-handler, the partial mutation is already committed. Breaks time-travel debugging (reverting to an old state requires replaying all mutations).

**Do this instead:** Mutate only `context.gameState` and its nested objects. Derive character references on-read with accessor functions like `getCharacter(gameState, charId)` so mutations are isolated in gameState.

### Narrative Composition Outside Consequence

**What happens:** Some actions compose narrative text directly in the handler instead of deferring to consequence-level narrative composition

**Why it's wrong:** Narrative text duplication across similar actions (e.g., attack hit/miss narrative composed in `handleAttack` AND `handleEnemyAttack`); makes campaign-wide narrative customization harder

**Do this instead:** Action handlers return raw consequence data; let `composeFragments()` in `services/narrative/compose.ts` produce the final narrative text. Campaigns override narrative pools, not action handlers.

### Direct Condition Application Without Duration

**What happens:** Some code applies conditions without checking `getConditionDuration()` or without stamping the source in `condition_sources`

**Why it's wrong:** Conditions persist forever (or with stale sources); makes "save ends" impossible; breaks UI that needs to show "charmed by Frost Acolyte" vs "charmed by Player"

**Do this instead:** Always use `applyCondition()` helper which stamps the source and looks up duration. Conditions without explicit duration get engine defaults (e.g., Charmed is "concentration" or 1 day).

## Error Handling

**Strategy:** REST endpoints return JSON errors with 4xx / 5xx status codes; frontend displays user-facing messages in modals.

**Patterns:**
- `ActionSchema` validation errors → 400 Bad Request + validation detail
- Auth failures → 401 Unauthorized (no session) or 403 Forbidden (wrong campaign role)
- Race conditions (stale turn_seq) → 409 Conflict; frontend prompts to reload
- Server errors → 500 Internal Server Error + opaque error ID for logs (no stack traces leak to client)
- Database migration failures on startup → process exits with error; Docker restarts container

## Cross-Cutting Concerns

**Logging:** Stdout via `console.log` / `console.error` in services; backend logs all state mutations (action type, character, consequence) for debugging. Structured logging TBD (defer to post-launch observability).

**Validation:** 
- Zod schemas in `routes/schemas.ts` for all REST request bodies (ActionSchema, NewSessionSchema, etc.)
- TypeScript type narrowing for safe field access (discriminated unions for Action, Consequence, Choice)
- Runtime checks in action handlers (e.g., `hasSpellSlot()`, `canReact()`) before mutation

**Authentication:** 
- Passport.js with Google OAuth callback
- Session stored in PostgreSQL (connect-pg-simple middleware)
- Cookie-based (secure: https in prod, httpOnly, sameSite)
- `requireAuth()` middleware gates all game routes; `/auth/*` routes are public

**Authorization:**
- Campaign roles: admin (creator) ⊇ editor ⊇ player (see `listVisibleCampaignIds()`)
- Session membership: join via invite, fork by copying campaign
- Admin-only promotion of campaign to global visibility

---

*Architecture analysis: 2026-06-20*
