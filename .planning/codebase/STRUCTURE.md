# Codebase Structure

**Analysis Date:** 2026-06-20

## Directory Layout

```
pansori/
├── docker-compose.yml          # Dev stack (frontend, backend, postgres)
├── docker-compose.prod.yml     # Production stack
├── docker-compose.e2e.yml      # E2E test ephemeral stack
├── .env.example                # Template for environment variables
├── package.json                # Root npm workspace (linting, testing, sync scripts)
├── package-lock.json           # Lockfile
├── .prettierrc                  # Code formatting rules (all workspaces use this)
├── lint-staged.config.mjs       # Pre-commit linting
├── playwright.config.ts         # E2E test configuration
├── CLAUDE.md                    # Project instructions (SRD-only, asset licensing)
├── LEGAL.md                     # Licensing & attribution (CC-BY-4.0 for SRD)
├── README.md                    # Project overview & quick start
├── FEATURES.md                  # Implemented mechanics & spells
├── TODO.md                      # Current work items & backlog
│
├── docs/                        # Static documentation
│   └── srd-5.2.1.txt            # SRD Reference (machine-extracted, used for grep-verify)
│
├── .planning/                   # GSD workflow state (created by gsd-* commands)
│   ├── milestones/              # Completed & active milestone archives
│   ├── phases/                  # Active phase planning & execution docs
│   ├── decisions/               # ADRs & recorded decisions
│   └── codebase/                # This mapping (ARCHITECTURE.md, STRUCTURE.md, etc.)
│
├── .github/workflows/           # CI/CD (GitHub Actions)
│   └── deploy.yml               # Build, test, push to Docker registry
│
├── infra/                       # Infrastructure-as-code (deferred, stubs only)
│
├── scripts/                     # Build & utility scripts
│   └── sync-shared-types.ts     # Syncs src/shared/types.ts → backend/frontend
│
├── tests/                       # E2E tests (Playwright)
│   └── e2e/                     # Login → creation → combat smoke tests
│
└── src/
    ├── shared/                  # Monorepo-level shared types
    │   └── types.ts             # Single source of truth for cross-workspace types
    │
    ├── backend/                 # Express + Node.js server (TypeScript)
    │   ├── package.json         # Backend deps (express, typescript, vitest, etc.)
    │   ├── tsconfig.json        # Backend TypeScript config
    │   ├── vitest.config.ts     # Unit test runner
    │   ├── migrations/          # SQL migration files (001_*.sql, etc.)
    │   │   ├── 001_init.sql     # Base tables (users, game_sessions, campaigns)
    │   │   ├── ...              # Schema evolution (OAuth, campaign platform, roles)
    │   │   └── 020_*.sql        # Latest migration
    │   │
    │   └── src/
    │       ├── index.ts         # Express app setup, server entry point
    │       │
    │       ├── types.ts         # Backend-specific types (Trap, Room, Enemy, etc.)
    │       ├── shared-types.ts   # AUTO-GENERATED (synced from src/shared/types.ts)
    │       │
    │       ├── auth/             # Google OAuth + session middleware
    │       │   ├── passport.ts   # Passport configuration
    │       │   ├── middleware.ts # requireAuth() gate
    │       │   └── session.ts    # Session store setup
    │       │
    │       ├── db/               # Database layer
    │       │   ├── pool.ts       # PostgreSQL connection pool singleton
    │       │   └── queries/      # (If added: stored procedures / prepared statements)
    │       │
    │       ├── routes/           # HTTP endpoint handlers
    │       │   ├── auth.ts       # POST /api/auth/login, /callback, /logout
    │       │   ├── game.ts       # POST /game/action, GET /game/session, POST /game/session/new
    │       │   ├── campaigns.ts  # POST /campaigns, GET /campaigns, PUT /campaigns/{id}, etc.
    │       │   ├── schemas.ts    # Zod validation schemas for all request bodies
    │       │   └── testSeed.ts   # POST /api/test/seed-campaign (gated, non-prod only)
    │       │
    │       ├── services/         # Core game logic (service layer)
    │       │   ├── gameEngine.ts              # Turn flow, state machine, choice generation
    │       │   ├── rulesEngine.ts            # Pure: d20 rolls, AC, proficiency, saves (680+ lines)
    │       │   ├── gridEngine.ts             # Pure: pathfinding, distance, line-of-sight, cover
    │       │   │
    │       │   ├── multiclass.ts             # Class feature checks (subclass gates, feature slots)
    │       │   ├── conditions/               # Condition registry + per-condition logic
    │       │   │   ├── registry.ts           # Duration lookups, expiry hooks
    │       │   │   └── [condition].ts        # (If added: per-condition behavior)
    │       │   │
    │       │   ├── actions/                  # Per-action handlers (50+ files)
    │       │   │   ├── index.ts              # Action dispatch router + cost validation
    │       │   │   ├── types.ts              # ActionContext interface
    │       │   │   ├── cost.ts               # Cost tables, deduction logic
    │       │   │   ├── actor.ts              # pcActor(), enemyActor() (AI heuristics)
    │       │   │   ├── attack/               # Attack action subfolder
    │       │   │   │   ├── index.ts          # handleAttack (PC attack coordinator)
    │       │   │   │   └── *.ts              # Attack variants (melee, ranged, throw, etc.)
    │       │   │   ├── castSpell/            # Spell casting subfolder
    │       │   │   │   ├── index.ts          # handleCastSpell (prep, slot, multi-target)
    │       │   │   │   └── *.ts              # Spell-specific handlers (aoe, save, etc.)
    │       │   │   ├── classFeature/         # Class feature actions subfolder
    │       │   │   │   ├── index.ts          # handleUseClassFeature router
    │       │   │   │   └── *.ts              # Per-feature handlers
    │       │   │   ├── gridMove.ts           # Movement + AoO, opportunity attack resolution
    │       │   │   ├── hide.ts               # Hide action, DC 15 Stealth check, find DC storage
    │       │   │   ├── reaction.ts           # Reaction window pause/resume (largest file)
    │       │   │   ├── meta.ts               # Character creation, leveling, feat selection
    │       │   │   ├── social.ts             # NPCs, dialogue, shop, influence
    │       │   │   ├── rest.ts               # Short/long rest, resource recovery
    │       │   │   └── [action].ts           # One file per action type (150+ handlers total)
    │       │   │
    │       │   ├── narrative/                # Narrative composition + text fragments
    │       │   │   ├── compose.ts            # composeFragments() main function
    │       │   │   ├── fragments.ts          # Attack hit/miss fragment types
    │       │   │   ├── enemyName.ts          # Fill {enemy} tokens, pluralization
    │       │   │   ├── narrativeFmt.ts       # fmt(), pronouns, text cleanup
    │       │   │   └── *.ts                  # Narrative builders per feature
    │       │   │
    │       │   ├── campaignEngine.ts         # Load/save campaign state from DB overlays
    │       │   ├── contextStore.ts           # CONTEXTS singleton, loader
    │       │   ├── contextLoader.ts          # Merge SRD base + campaign-specific data
    │       │   ├── campaignContent.ts        # Apply DB-sourced campaign overlays to context
    │       │   ├── campaignMembers.ts        # Campaign visibility, role checks
    │       │   │
    │       │   ├── procgen.ts                # Roguelike procedural generation (BFS, CR scaling)
    │       │   ├── mapEngine.ts              # Map state, room transitions, narratives
    │       │   ├── enemyFactory.ts           # Enemy spawning from templates
    │       │   ├── gridEngine.ts             # (see above, pure functions)
    │       │   │
    │       │   ├── damage.ts                 # applyDamage() with type resistances
    │       │   ├── equipment.ts              # Equip/unequip logic, armor/weapon binding
    │       │   ├── itemCatalog.ts            # SRD items sync / lookup
    │       │   ├── monsterCatalog.ts         # SRD monsters sync / lookup
    │       │   ├── feats.ts                  # Feat selection, origin feat logic
    │       │   ├── backgrounds.ts            # Background feature resolution
    │       │   │
    │       │   ├── dialogueGating.ts         # Condition eval for dialogue locks
    │       │   ├── stateSchema.ts            # GameState schema validation + migrations
    │       │   ├── broadcast.ts              # Socket.IO room emit coordination
    │       │   ├── migrationRunner.ts        # Execute SQL migrations on startup
    │       │   ├── gameClock.ts              # In-world time (minutes → hours → days)
    │       │   ├── llmProvider.ts            # (If using LLM: OpenAI client)
    │       │   └── [service].ts              # 60+ service modules total
    │       │
    │       ├── campaignData/                 # Campaign definitions (static data)
    │       │   ├── srd/                      # SRD 5.2.1 base (single source of truth)
    │       │   │   ├── index.ts              # Re-export all SRD modules
    │       │   │   ├── classes.ts            # 12 classes + 12 subclasses (SRD iconic only)
    │       │   │   ├── spells.ts             # ~340 SRD spells (combat-relevant fully mechanical)
    │       │   │   ├── monsters.ts           # 328 stat blocks (CR 0 Rat → CR 30 Tarrasque)
    │       │   │   ├── items.ts              # Weapons, armor, adventuring gear
    │       │   │   ├── species.ts            # 9 player species (Dwarf, Elf, Tiefling, etc.)
    │       │   │   ├── beast_forms.ts        # Wild Shape beast pool (CR ≤ 1)
    │       │   │   ├── backgrounds.ts        # Origin backgrounds + skills/tool
    │       │   │   ├── feats.ts              # Origin feats (4 + Magic Initiate + fighting styles)
    │       │   │   ├── baseCampaign.ts       # Base template (roguelike procgen config)
    │       │   │   └── *.ts                  # Additional SRD reference data
    │       │   │
    │       │   ├── skyIsFalling/             # Flagship starter campaign (full Act I)
    │       │   │   ├── acts.ts               # Act definitions + branching
    │       │   │   ├── regions.ts            # Regional map + encounters
    │       │   │   ├── towns.ts              # Town layouts + NPCs
    │       │   │   ├── rooms.ts              # Local room definitions + combat encounters
    │       │   │   ├── npcs.ts               # Named NPCs + dialogue trees
    │       │   │   ├── quests.ts             # Quest definitions + completion gates
    │       │   │   ├── factions.ts           # Faction alignments + reputation hooks
    │       │   │   ├── monsters.ts           # Sky Is Falling monster templates
    │       │   │   ├── items.ts              # Campaign-specific loot
    │       │   │   └── rules.ts              # Campaign-specific rule overlays
    │       │   │
    │       │   └── [campaign]/               # (If added: additional authored campaigns)
    │       │
    │       └── tests/                        # Unit tests (mirrors src structure)
    │           ├── *.spec.ts                 # Spec files co-located with services
    │           └── (Vitest discovers all **/*.spec.ts)
    │
    └── frontend/                # React + Vite app (TypeScript)
        ├── package.json         # Frontend deps (react, vite, three.js, etc.)
        ├── tsconfig.json        # Frontend TypeScript config
        ├── vite.config.ts       # Vite bundler config
        ├── vitest.config.ts     # Unit test runner
        ├── playwright.config.ts # E2E test config (in root too)
        │
        ├── public/              # Static assets (gitignored: art/tiles, art/sprites, etc.)
        │   ├── art/             # Game art (gated: painted-art overlay in pansori-assets)
        │   │   ├── tiles/       # Terrain tiles (procgen+campaign)
        │   │   ├── sprites/     # Character/enemy sprites
        │   │   ├── textures3d/  # 3D textures for combat diorama
        │   │   ├── markers/     # Map markers (gates, merchants, etc.)
        │   │   └── icons/       # Item / ability icons
        │   └── index.html       # Vite SPA entry (div#root)
        │
        └── src/
            ├── main.tsx         # React root mount
            ├── App.tsx          # Root component (route logic, 3-zone shell)
            ├── types.ts         # Frontend-specific types (FrontendContext, etc.)
            ├── shared-types.ts   # AUTO-GENERATED (synced from src/shared/types.ts)
            │
            ├── contexts/        # React context providers (static reference data)
            │   └── base.tsx     # Donor context (classes, backgrounds, skills, theme)
            │
            ├── data/            # Static reference mirrors (species, items for lookup)
            │   ├── species.ts
            │   └── *.ts
            │
            ├── lib/             # Utility modules (not React components)
            │   ├── api.ts       # Typed REST client + WebSocket subscription
            │   ├── activeGrid.ts # Grid state (selected cell, path preview)
            │   ├── characterFmt.ts # Format character name, level, HP display
            │   ├── itemIcons.tsx  # JSX icon renderer per item
            │   ├── art.ts       # paintedArt(), artUrl() gating for painted-art overlay
            │   ├── theme.ts     # applyTheme() per campaign
            │   ├── gameClock.ts # Format in-world time display
            │   ├── pointBuy.ts  # Ability score point-buy calculator
            │   ├── multiclass.ts # Frontend side of class feature display
            │   ├── combatPreview.ts # Predict next attack outcome (for UI hints)
            │   ├── roomPlacement.ts # Place party + enemies on a room grid
            │   ├── placedLoot.ts # Find loot in room
            │   ├── characters3d.ts # 3D character model loading (three.js)
            │   ├── terrainStyle.ts # CSS classes for terrain tiles
            │   ├── gridStep.ts  # Move-validation for each grid step
            │   ├── mapPanelVisible.ts # Show/hide map panel logic
            │   ├── narrativeFmt.ts # Format narrative text (capitalize names, etc.)
            │   └── [lib].ts     # Utility helpers (50+ files)
            │
            ├── hooks/           # React custom hooks
            │   ├── useGame.ts   # Main game state hook (session, gameState, choices, dispatch)
            │   └── [hook].ts    # Component-specific hooks (if added)
            │
            ├── components/      # React components (JSX + styling)
            │   ├── App.tsx      # (Root — moved to src/ for clarity)
            │   │
            │   ├── LoginScreen.tsx # Google OAuth login form
            │   ├── SessionScreen.tsx # Session list + join/create UI
            │   ├── AdminScreen.tsx # (If added: campaign admin panel)
            │   │
            │   ├── CharScreen.tsx # Character creation + party member cards
            │   ├── CharacterModal.tsx # Modal for single character creation
            │   │
            │   ├── GridCombatView.tsx # 2D tactical grid view (combat)
            │   ├── Crawler3DView.tsx # 3D first-person crawler (exploration)
            │   ├── Combat3DView.tsx # 3D diorama view (combat, lazy-loaded)
            │   ├── GridMapView.tsx # 2D regional/town map (exploration)
            │   ├── WorldMap.tsx # Large world map for fast travel
            │   │
            │   ├── PartyRail.tsx # Horizontal party member cards (left side)
            │   ├── ClassAbilityBar.tsx # Class feature action buttons (top-right)
            │   ├── SpellBar.tsx # Spell action buttons (spell list UI)
            │   ├── CombatActionBar.tsx # Attack/cast/move buttons (combat)
            │   ├── DefaultActionBar.tsx # Exploration action buttons
            │   ├── MoveDPad.tsx # D-pad for movement (mobile / crawler)
            │   │
            │   ├── ContextPanel.tsx # Context tabs (combat log, inventory, etc.)
            │   ├── CombatLogPanel.tsx # Combat event log
            │   ├── AdventureLogPanel.tsx # Full adventure log (action + narrative history)
            │   ├── InventoryModal.tsx # Detailed inventory + equip UI
            │   ├── LevelingPanel.tsx # Leveling UI + subclass selection
            │   ├── VendorPanel.tsx # Shop interface
            │   ├── ConversationPanel.tsx # NPC dialogue
            │   ├── NpcDialoguePanel.tsx # (If split from ConversationPanel)
            │   │
            │   ├── Dialog.tsx   # Generic modal dialog shell
            │   ├── CharacterModal.tsx # Character creation wizard
            │   ├── InventoryModal.tsx # Inventory + equip picker
            │   ├── NarrativeModal.tsx # Large narrative text display
            │   ├── QuestLogModal.tsx # Quest details
            │   ├── TargetPickerDialog.tsx # Select spell/attack targets
            │   ├── OptionPickerDialog.tsx # Generic multi-choice picker
            │   ├── EnemySelector.tsx # Select enemy opponent
            │   ├── RoomArtPanel.tsx # Room artwork display
            │   ├── AboutModal.tsx # Game credits + info
            │   │
            │   ├── InitiativeStrip.tsx # (If added: turn order display)
            │   ├── WaitingForPlayer.tsx # (Multiplayer: waiting indicator)
            │   ├── InviteDialog.tsx # Invite player to session
            │   ├── RegionEditorScreen.tsx # (Campaign admin: region editor)
            │   │
            │   ├── NarrativeText.tsx # Rich text rendering (narrative prose)
            │   ├── RaIcon.tsx # RPG Awesome icon component
            │   └── [component].tsx # 60+ components total
            │
            ├── styles/
            │   ├── styles.module.css # Component-scoped styles (CSS modules)
            │   └── global.css # Global theme colors, fonts
            │
            ├── vendor/          # Third-party assets (bundled)
            │   └── game-icons/  # Game Icons font (CC BY 3.0)
            │
            ├── test-setup.ts    # Vitest configuration
            └── tests/           # Unit tests (mirrors src structure)
                └── *.spec.tsx   # Spec files
```

## Directory Purposes

**Backend Services Layer** (`src/backend/src/services/`):
- Core game logic, split into single-responsibility modules
- `gameEngine.ts` orchestrates turn flow; `rulesEngine.ts` provides pure functions for rolls
- Action handlers in `actions/` implement each player decision type
- Narrative composition in `narrative/` generates text from game state
- Multiclass/feature checking in `multiclass.ts`
- All services are stateless; they mutate the passed `GameState` JSONB object

**Campaign Data** (`src/backend/src/campaignData/`):
- Static definitions (never mutate during gameplay)
- `srd/` is the single source of truth for mechanics (classes, spells, monsters, items)
- Campaign folders (`skyIsFalling/`, etc.) define rooms, NPCs, loot pools, quest chains
- All campaign data is authored in TypeScript; no runtime translation from external formats

**Frontend Components** (`src/frontend/src/components/`):
- Organized by responsibility (screens, panels, modals, dialogs)
- Each component is ~200–400 lines; larger components split into sub-components + shared lib utilities
- No component should directly mutate game state; all mutations flow through `useGame.handleChoice()`

**Frontend Lib** (`src/frontend/src/lib/`):
- Pure utility functions and typed API clients
- `api.ts` wraps REST + WebSocket for type safety
- No React hooks in lib; hooks live in `hooks/`
- Used by components via imports, not vice versa

## Key File Locations

**Entry Points:**
- Backend: `src/backend/src/index.ts` (Express server boot)
- Frontend: `src/frontend/src/main.tsx` (React root mount)
- Game action route: `src/backend/src/routes/game.ts` POST `/game/action`

**Configuration:**
- Backend env vars: `.env` (copy from `.env.example`)
- Database: `src/backend/migrations/` (SQL migrations, auto-run on boot)
- TypeScript: `src/backend/tsconfig.json` and `src/frontend/tsconfig.json`
- Frontend bundler: `src/frontend/vite.config.ts`

**Core Logic:**
- Game state machine: `src/backend/src/services/gameEngine.ts` (2000+ lines)
- Rules engine: `src/backend/src/services/rulesEngine.ts` (680+ lines, pure)
- Grid engine: `src/backend/src/services/gridEngine.ts` (1000+ lines, pure)
- Action dispatch: `src/backend/src/services/actions/index.ts` (router)

**Testing:**
- Backend unit tests: `src/backend/src/**/*.spec.ts` (mirrors src structure)
- Frontend unit tests: `src/frontend/src/**/*.spec.tsx`
- E2E tests: `tests/e2e/*.spec.ts` (Playwright smoke tests)
- Fixtures: `src/backend/src/test-fixtures.ts` (mock characters, enemies, state)

## Naming Conventions

**Files:**
- Backend services: camelCase.ts (e.g., `gameEngine.ts`, `rulesEngine.ts`)
- React components: PascalCase.tsx (e.g., `CharScreen.tsx`, `PartyRail.tsx`)
- Utilities: camelCase.ts (e.g., `activeGrid.ts`, `characterFmt.ts`)
- Specs: `*.spec.ts` or `*.spec.tsx` (Vitest auto-discovery)

**Directories:**
- Services: lowercase plural (e.g., `services/`, `routes/`, `components/`)
- Campaign folders: kebab-case matching campaign ID (e.g., `skyIsFalling/`)
- Feature subfolders: lowercase plural (e.g., `actions/`, `conditions/`, `narrative/`)

**Exports:**
- Type exports: `export type X = ...` (no const T)
- Function exports: `export function foo() { ... }`
- Default exports: avoided (use named exports for clarity)
- Barrel files: `index.ts` re-exports submodule (e.g., `actions/index.ts` dispatches to handlers)

## Where to Add New Code

**New Action Type (e.g., "disarm trap"):**
- Create: `src/backend/src/services/actions/disarmTrap.ts`
- Export handler: `export async function handleDisarmTrap(context: ActionContext): Promise<Consequence[]>`
- Register in: `src/backend/src/services/actions/index.ts` (add to `handlers` map)
- Test: `src/backend/src/services/actions/disarmTrap.spec.ts`

**New Service (e.g., "treasure generation"):**
- Create: `src/backend/src/services/treasureGen.ts`
- Export pure functions: `export function rollTreasure(cr: number, seed: Random): Item[]`
- Use in: Actions or campaignEngine as needed
- Test: `src/backend/src/services/treasureGen.spec.ts`

**New Campaign:**
- Create folder: `src/backend/src/campaignData/yourCampaign/`
- Files: `acts.ts`, `regions.ts`, `towns.ts`, `rooms.ts`, `npcs.ts`, `quests.ts`, `rules.ts`, `index.ts` (re-export)
- Define context in `rules.ts`: `export const YOUR_CAMPAIGN_CONTEXT: Context = { ... }`
- Register in backend: Load via `contextLoader.ts` or add to CONTEXTS map
- Register in frontend: Synthesize card in CharScreen from backend `/game/contexts/{id}` response

**New React Component:**
- Create: `src/frontend/src/components/YourComponent.tsx`
- Extract utilities to `src/frontend/src/lib/` if reusable
- Use `useGame()` hook for game state access
- Test: `src/frontend/src/components/YourComponent.spec.tsx`

**New Condition (e.g., "exhausted"):**
- Add type: `src/shared/types.ts` (ConditionName union)
- Define duration: `src/backend/src/services/conditions/registry.ts` (getConditionDuration case)
- Implement effect: `src/backend/src/services/conditions/[condition].ts` (if complex logic)
- Update UI: `src/frontend/src/components/conditionEffectRows.tsx` (render effect description)

**New REST Endpoint:**
- Add route: `src/backend/src/routes/[router].ts` (e.g., game.ts)
- Add schema: `src/backend/src/routes/schemas.ts` (Zod validation)
- Add handler: Reuse existing services or call gameEngine
- Test: `src/backend/src/routes/*.spec.ts` (integration tests for route flow)

**New Database Column:**
- Create migration: `src/backend/migrations/NNN_description.sql` (NNN = next sequence number)
- Update GameState type: `src/backend/src/types.ts` (if game state field)
- Update shared types: `src/shared/types.ts` (if shared across FE/BE)
- Sync types: `npm run sync-types` (regenerate FE shared-types.ts)
- Migration runner auto-runs on startup; CI checks idempotency via `npm run check-migrations`

## Special Directories

**`.planning/`:**
- Purpose: GSD workflow metadata (phases, milestones, decisions, this codebase map)
- Generated: By `/gsd-*` commands
- Committed: Yes (tracked in git; phases archived on completion)

**`migrations/`:**
- Purpose: Database schema evolution (SQL, one file per change)
- Generated: By developers (manually created per-phase)
- Committed: Yes (required for CI/CD; auto-executed on startup)

**`campaignData/srd/`:**
- Purpose: Single source of truth for SRD 5.2.1 mechanics
- Generated: No (hand-authored per CLAUDE.md rules)
- Committed: Yes (shared by all campaigns; immutable reference)

**`node_modules/` (both root + workspaces):**
- Purpose: npm package cache
- Generated: Yes (npm install / CI builds)
- Committed: No (gitignored; package-lock.json is committed)

**`public/art/` (gated subdirectories):**
- Purpose: Game assets (terrain, sprites, icons, markers)
- Generated: No (sourced + committed, or overlay-gated)
- Committed: Partially (free-tier OSS art is committed; painted-art overlay is gitignored + fetched from pansori-assets)

---

*Structure analysis: 2026-06-20*
