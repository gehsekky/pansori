# Notes for a Full 3D D&D 5e Engine

Written 2026-05-22, after the Pansori session that took the browser
engine from solo to multiplayer. These are observations from the
inside of _this_ codebase, not generic "how to build a game" advice.

The goal is to capture what transfers, what doesn't, and what I'd do
differently if we started a 3D project tomorrow.

---

## What from Pansori transfers cleanly

### The rulebook layer is engine-agnostic

Everything in `services/rulesEngine.ts`, `services/gridEngine.ts`, the
condition + concentration tracking, the spell catalog, the weapon
mastery system, the ASI math — none of this cares whether it's
rendered in HTML or Unreal. The 514 backend tests that codify 2024
PHB behavior could (and should) be lifted into a separate Rules
Engine package consumed by _either_ a 2D or 3D renderer.

**Treat the rulebook as a library, not part of the game.**

### The schema-evolution pattern

`normalizeState` + `backfillOwnership` saved this project at least
three times — old saves load against new engine code without crashing
because every new field has a default. A 3D game with save slots
needs this from day one, not day 90 when players start hitting load
failures after a content update.

**Build the migration scaffolding before you write the first save.**

### Reactions-as-pause

`state.pending_reaction` — combat pauses mid-enemy-turn, waits for
the right PC's Shield/Counterspell decision, then resumes — is the
cleanest reactions implementation I've worked with. The hard part is
_resumable interrupted execution_: it's almost impossible to retrofit
if your game loop doesn't treat it as a first-class concept.

**Get it right at the start.**

### Structured combat log alongside narrative prose

`state.combat_log` (`CombatEvent[]`) is separate from the human-
readable narrative for a reason — debugging, accessibility, replay,
post-fight stats. A 3D game can show this in a slide-out log panel
and people will love it.

**Don't conflate "what the game says" with "what mechanically happened."**

### Quest scripting via a rules engine

The `json-rules-engine` + step-condition pattern is content-authoring
gold. Designers can write
`{ all: [{ fact: 'enemies_killed', operator: 'contains', value: 'lich_id' }] }`
without touching code. Translates directly to a 3D project's quest
tool.

### Multiplayer ownership + turn enforcement

The `session_participants` + `Character.owner_user_id` model added
late in Pansori — adding it later to a single-player 3D game is
brutal because every system needs to know "who owns what."

**Build the ownership layer from the start even if MP isn't day-one.**

---

## What needs a fundamental rethink

### The biggest decision: turn-based vs real-time-with-pause vs action

This dominates _every_ combat code path. 5e is structurally turn-based
and Pansori implements it faithfully — six-second rounds, one action
per turn. Going to 3D means picking a model:

| Model                | Examples                                  | What you keep from Pansori          | What you throw out                       |
| -------------------- | ----------------------------------------- | ----------------------------------- | ---------------------------------------- |
| Pure turn-based      | Solasta, BG3-in-combat                    | All of the combat code              | Real-time exploration                    |
| Pause / tactical     | BG3, Pillars                              | Most of it; reaction timing changes | Real-time movement only outside fights   |
| Real-time-with-pause | Dragon Age: Origins, Pathfinder Kingmaker | Action economy roughly              | Discrete initiative; reactions get weird |
| Pure action          | Dark Alliance, Daggerdale                 | The rulebook constants              | The entire round structure, most of RAW  |

Pansori's discrete `takeAction` model maps cleanly to options 1-2,
painfully to 3, and not at all to 4.

**Make this call before any other engineering decision. It determines
the rest.**

### Grid vs continuous space

Pansori uses 5ft squares with Chebyshev distance, cover via cardinal-
neighbor counting, flanking via diametric opposition. 3D usually
wants continuous positioning, which means:

- Distance becomes Euclidean
- Threat ranges become circles, not 8 adjacent squares
- Opportunity attacks need continuous leave-threat-range detection
- Cover becomes raycasting + occluder geometry, not "is there an
  entity in this cardinal cell"
- Difficult terrain becomes patches, not cells

The math gets harder but more flexible. BG3 picks a hybrid — 1.5m
grid for combat positioning, continuous for movement animation. Worth
studying their approach.

### Renderer / model separation

Pansori is essentially a stateful API + a thin React view. A 3D
game's engine becomes an _event emitter_ that the renderer consumes
— "Fighter takes 7 damage" → trigger blood VFX, hit sound, camera
shake, damage number popup, HP bar tween, optional voice line. This
separation matters more than you'd think; the temptation in
Unity/Unreal is to glue logic into MonoBehaviours/Actors and lose
the ability to spec-test the rules.

### Networking

REST + Socket.IO broadcast is fine for turn-based MP. Real-time
multiplayer needs authoritative server + client-side prediction +
reconciliation, plus rollback for input lag. Pansori's "every action
goes through the server and broadcasts the new state" model doesn't
scale to action combat. If you stay turn-based, this stays cheap.

### Narrative model

Pansori's heavy text narration is doing rendering work; a 3D game
offloads that to voice acting, cutscenes, animation barks. The LLM-
enhancement layer becomes much narrower — it might generate
variations of dialogue lines for voice synthesis (ElevenLabs etc.),
but it's not the primary output channel anymore. The narrative-
attribution layer (the `[CharName]` prefix in multi-PC narratives)
becomes "which character has the camera + lip sync" — same problem,
much harder.

---

## Specific lessons to carry forward

1. **The action economy is the hardest part to get right.** Bonus
   actions, reactions, free interactions, opportunity attacks,
   multiattack, action surge, cunning action — the combinatorics
   produce hundreds of edge cases. Pansori has dozens of regression
   specs because each one was a real bug. Allocate way more time
   than you think.

2. **Test-driven RAW.** The 500+ engine tests are the only reason
   the rulebook fidelity holds up. In a 3D engine, isolate the rules
   layer so you can spec-test it _offline_ — without rendering,
   without Unity, just `npm test` on pure-data input → pure-data
   output. The view layer can break and the rulebook will still be
   correct.

3. **MVP discipline.** The 4-PR multiplayer slice (data → auth →
   push → UI) is replicable for any feature in a 3D game. The
   temptation in 3D is to build the whole world before any of it
   works. Vertical slice instead: one encounter, one room, one NPC
   dialogue, one save slot. Then expand.

4. **CRPG enemy AI is harder than rules.** Pansori's
   `planEnemyApproach` (move-to-reach + attack) is borderline
   trivial. A 3D RPG needs spatial pathfinding, threat assessment,
   target selection (focus weakest? hit the cleric? flank?), group
   coordination, ability-use timing. This is its own engineering
   project. Plan for it.

5. **RAW is a moving target.** 2024 PHB rewrote a lot of 2014.
   Pansori migrated mid-development and it was painful. Build
   edition-aware code paths from day one (`if (edition === '2024')`),
   plan for supplements (Xanathar's, Tasha's), plan for homebrew
   override layers (e.g. "this campaign uses gritty realism rest
   variant").

6. **Accessibility from day one.** Pansori's audit found real WCAG
   failures even with deliberate care (the `.choiceBtnSeen` contrast
   was 1.86:1, hard fail). A 3D game has more vectors: color-blind
   modes, hearing impaired (closed captions on every line), motor
   accessibility, photosensitive epilepsy (no strobe VFX). These
   are _cheap_ if built in, expensive if retrofitted.

---

## What I'd do differently knowing what I know

- **Split the action handler from PR 1.** The mega-`takeAction`
  function in Pansori is approaching 4000 lines. Refactoring later
  carries regression risk. Structure as `services/actions/castSpell.ts`,
  `services/actions/attack.ts`, etc. from the start. The dispatch
  glue is trivial; the discipline is everything.

- **LLM enhancement off by default until late.** Pansori's LLM layer
  made debugging harder for months — was the bug in the engine or
  the model dropping a number? Run the engine raw until you trust
  it, then layer enhancement on top with the `preservesCriticalFacts`
  fallback already proven elsewhere.

- **Combat log structured events from day one.** Retrofitting them
  into existing narrative paths meant touching every attack / save /
  condition site. Build the event log as the _primary_ output;
  narrative prose is a renderer over the events.

- **Single source of truth for shared types.** Pansori syncs 3
  copies of `shared-types.ts` via script. A monorepo with TS project
  references would have avoided every type-drift bug. Set up the
  toolchain first.

- **Replay-driven debugging.** Pansori's adventure log paste-and-
  diagnose workflow worked because every action is deterministic
  from state + seed. Build a `replay(seed, actions[])` function
  from PR 1 that takes a save + an action list and runs
  deterministically. You'll thank yourself when players paste
  200-turn bug reports.

---

## Engine choice considerations

- **Unity** — huge asset store, mature RPG community (Solasta,
  Pathfinder Wrath), but the 2023 runtime-fee fiasco damaged trust
  permanently for some teams. C# is friendly. Good middle ground.

- **Unreal** — better visuals out of the box, harder for rules-heavy
  logic. Blueprint can become spaghetti at RPG scale. BG3 used a
  custom engine partly because Unreal didn't fit their data-driven
  content model.

- **Godot** — free, open-source, growing fast. Lighter on AAA
  visuals, great for tile/grid games. Probably the smartest choice
  if combat is grid-based and you want to keep a Pansori-shaped
  engine.

- **Custom** — BG3 / Larian, Owlcat. Massive investment, total
  control. Pansori's "small TS engine" worked because the renderer
  is also small. Custom doesn't translate to 3D unless you have a
  team and a 5-year runway.

If pressed for one recommendation: **Godot for grid-tactical
turn-based** (closest to Pansori's DNA), **Unity for pause-tactical**
(BG3-like). Skip Unreal unless visual fidelity is the central pitch.

---

## The thing nobody talks about

The hardest part of building an RPG isn't combat or rules or
rendering. It's **content authoring throughput** — how fast can a
designer add a new quest, NPC, room, encounter without touching code?

Pansori's `Context` objects + json-rules-engine + procgen seeded a
lot of content quickly. A 3D game's authoring story has to be 10x
better because each piece of content now also needs 3D assets, voice
lines, animations, scripted events.

**The editor you build for designers matters more than the engine
you ship.** BG3's tooling is half the reason it exists; Solasta's is
half the reason it doesn't have more content. Plan the editor early;
assume designers will live in it.

---

## Open questions worth answering before you start

These are calls you need to make on day one because they determine
everything that follows:

- **Combat tempo**: turn-based, pause/tactical, real-time-with-pause,
  or action? (See the table above.)
- **Edition**: 2024 PHB / SRD 5.2.1 only? Edition-flexible?
- **Multiplayer**: solo + opt-in co-op (Pansori's path), or always
  multiplayer (Diablo path), or pure single-player (Solasta)?
- **Authoring audience**: in-house designers only, or moddable?
  Modding tooling is a huge investment but pays back in long-tail
  content.
- **Camera**: isometric (BG3, Solasta), free-3D (Skyrim), top-down
  (Diablo)? Affects level design + asset density.
- **Renderer engine**: Godot, Unity, Unreal, custom? (See above.)
- **Voice**: AI-generated (ElevenLabs etc.) or recorded? Recorded is
  expensive but higher quality; AI lets you regenerate dialogue at
  near-zero marginal cost.
- **Save model**: cloud-saved (server-authoritative), local + sync,
  or local-only? Multiplayer pushes you to server-authoritative.

Resolve these and the engineering plan writes itself.
