# Pansori — TODO

Open work only. For what's already built, see [FEATURES.md](FEATURES.md);
`git log` is the record of what landed. `[~]` = a shipped framework with
documented deferrals.

## Content breadth

- [~] **Magic items** — content; the body-slot + attunement + curse + worn-effect
      infra is shipped, so new wondrous items are largely data + an effect kind.
      Shipped: the first attuned wondrous items — **Cloak of Protection** &
      **Ring of Protection** (a new `ac_bonus` worn-effect kind folded into the
      stored AC at every recompute site, plus `save_bonus` extended to
      `ability: 'all'`) and the **Greater/Superior/Supreme Healing Potion** ladder
      (pure data). Remaining candidates: stat-set items (Amulet of Health,
      Gauntlets of Ogre Power — needs an ability-score-override kind), +N magic
      weapons/armor (attack/damage/AC riders), and broadening the worn save bonus
      beyond the condition-save path (the existing extension point — applies at
      `conditionSavingThrow` today, not at forced-march / direct breath saves).
- [ ] **Per-campaign spell curation** — `spellTable` loads the whole SRD catalog
      everywhere; no `srdSpells(…)` selector (cf. `srdItems`) for low-magic settings.
- [ ] **Mounts, vehicles, trade goods** — rest of the SRD equipment chapter; not modeled.
- [ ] **Caltrops / ball bearings** — area-denial consumables; need a
      movement-triggered ground-effect mechanic (thrown splash weapons exist; these don't).
- [ ] **Spellcasting foci** (holy symbol / component pouch / arcane focus) are
      still flavor — `effect: 'spellcasting_focus'` isn't read; no focus/component gate.

## Monster-ability infrastructure

> The full bestiary's stat lines are in and the common hooks shipped; the
> remaining per-monster specials need new engine support. Each is marked inline
> with a `// Simplification:` comment (grep for the worklist).

- [ ] Movement-conditional **charge riders** ("moved 20+ ft" → extra dice/Prone).
- [ ] **Swallow / Engulf**; **petrifying-gaze ladders** (Restrained → Petrified).
- [ ] Monster **utility spellcasting** (the Priest convention defers it);
      spell-based **legendary options + Legendary Resistance + lair actions**.
- [ ] Shape-shifters / lycanthropy infection; ooze **splits + death bursts**;
      ability-score drain (Shadow); no-damage utility breaths; target-state traits
      (Blood Frenzy, Bloodied-tier damage).

## Documented engine deferrals (depend on missing content / infra)

- [ ] **Greater Divine Intervention** (Cleric L20) — needs a Wish spell.
- [ ] **Dragon Companion** (Draconic L18) — needs a Summon Dragon spell.
- [ ] **Contact Patron** (Warlock L9) — needs a Contact Other Plane spell.
- [ ] **Holy Ward half** (Devotion L20) — save sites don't carry the attacker's
      creature type yet (the Radiant aura ships).
- [~] **Truesight / Dimensional Travel / Night Spirit boons** — the +1 ability +
      Truesight's see-through-magical-darkness half ship; remaining: see-Invisible /
      shapechanger halves, Dimensional Travel positioning, Night Spirit. Narrated.
- [ ] Minor markers: Devious Strikes' Daze restriction, Use Magic Device
      scroll/charge sub-features, Thief Jumper, Lay on Hands poison-cure, Deflect
      Energy (Monk L13).

## Combat / exploration subsystems (bounded)

- [ ] **Underwater combat** — non-piercing melee disadvantage, ranged rules, fire resist.
- [ ] **High Jump / verticality** — Long Jump ships; High Jump is helper-only.
      Verticality is the architectural gap (flat grid, no elevation/ledges).
- [ ] **Somatic spell components** — RAW needs a free hand → a hand-state model;
      no spell carries a `somatic` flag yet. Also unlocks focus-substitutes-for-material.
- [ ] **Forced-march death at Exhaustion 6** — fatigue ships (`applyForcedMarch`)
      but only raises `exhaustion_level`; the level-6 = death rule fires in a
      separate flow. Wire the death check into the march path (and/or centralize
      exhaustion-gain).
- [ ] **Out-of-combat systems** — Downtime, Bastions, Crafting (potions / scrolls
      / items), Vehicles. Lowest urgency.

## Condition + spellcasting fidelity (multiclass edge cases)

- [~] Per-class ASI spacing + multiclass-entry skill/tool grants done. Deferred
      (larger model changes):
  - [ ] **Warlock pact-slot pool separation** — slots are one merged pool;
        `actions/rest.ts` short-rest overwrites `spell_slots_max` to the pact value
        and resets all `spell_slots_used`, wiping a multiclass Warlock's other slots.
        Needs a separate pact pool + casting + recovery + FE.
  - [ ] **Second-class subclass features** — subclass auto-assign only fires for
        the primary class at its L3; a second class reaching its subclass level gets
        nothing. Needs a per-class subclass model.

## Subsystem follow-ups

- [ ] **Magic / Utilize action-category tags** — only needed for Action Surge's
      "extra action except the Magic action" once a martial multiclasses into a
      caster. Bundle with multiclass UX.
- [ ] **Magic-item attunement — remaining** — short-rest attune gating, Remove
      Curse ↔ `de_attune` interaction, cursed items in seed loot.
- [ ] **Long Rest → pure SRD 24-hour rule** — drop the per-session `long_rested`
      cap and let the 24h world-clock gate (`last_long_rest_minute`) govern alone
      (one-line change in `actions/rest.ts` + a `gameEngine.ts` label).

## Narrative pipeline — structured fragments

- [ ] `twoWeaponAttack` fragment — off-hand outcomes emit no `CombatEvent`.
- [ ] Cleave-hit fragment — secondary-target damage emits no event.
- [ ] `resolveTarget(ctx, action)` helper to dedupe target resolution (~5 sites).
- [ ] `cleric.ts` Divine Spark auto-hit → `spell_auto_hit` fragment.

## Encounter zones (follow-ups)

- [x] **Weighted creature entries** (`{name, weight}`) — a zone's encounter table
      now accepts bare names (weight 1) or `{name, weight}` pairs; selection is
      weight-proportional (`pickWeightedEncounter`). The creator's zone picker has
      a per-creature weight input (weight 1 stays a bare string on save).
- [x] **Mixed-group entries** — an encounter-table entry can be a `{group, weight?}`
      fixed mixed group (e.g. 2 Wolves + 1 Bandit) that spawns ALL its members at
      once; each member's count scales to party size like the single-creature path.
      Authored in the zone picker (+ NEW GROUP → add members + counts + group weight).
- [x] **Per-terrain creature tables within a zone** — a zone now carries
      `terrainTables?: Record<terrain, EncounterEntry[]>` (mirrors `arenaRooms`).
      When an encounter triggers, the triggering square's terrain table is used
      if non-empty, else the base `encounterTable` (`zoneTableFor` in mapEngine;
      `hasZonePool` counts terrain tables). Authored in the zone picker's
      PER-TERRAIN TABLES section (reuses the extracted `EncounterTableEditor`);
      empty terrain tables prune away on save.
- [x] **Arena-room size in the picker** — the zone's arena-room dropdown + chips
      now show each room's clamped combat-grid size (e.g. `clearing (8×6)`). The
      hosted ROOMS panel's `onMaps` carries `gridWidth`/`gridHeight` (derived from
      the painted grid, as the backend does), and the picker runs them through
      `clampCombatDim` so the label matches what combat will render.

## Campaign platform — DB authoring-model gaps

- [ ] **Remaining consequence arms** — spawn_enemy, unlock_room, set_escape,
      travel_to, set_faction_rep stay code-side. set_faction_rep is the safest next
      promotion; spawn_enemy/unlock_room would let DB dialogue spring ambushes / open doors.
- [ ] **Engine-y creation config** — classSkills / hit dice / proficiencies /
      classFeatures / featTable / spellTable / spellcastingAbility stay
      base-template-only (SRD constants; port only if a real campaign needs it).
- [ ] **Campaign-meta knobs with no section** — `defaultStartingLoot`,
      `displayNoun`, default `gridWidth`/`gridHeight`.
- [ ] **Room tactical extras** — `coverPositions` (half/three-quarter cover) isn't
      paintable in the DB room schema.
- [ ] **Procgen** — the roguelike dungeon generator is code-only; DB campaigns are
      authored-only. Likely permanent.

## Creator backlog (smaller)

- [ ] **Venue-level narration hooks** — venues still carry only the per-landing
      site `onEnter`; no first/exit variants. Now cheap via `campaign_narratives`
      (add a `venue` owner_kind alongside the other scopes).
- [ ] **Narrative normalization — remaining scopes.** Entity hooks are now
      structured in `campaign_narratives` (level/site, object, trap, NPC
      greetings/goodbyes as variant pools). Still inline JSONB: **quest**
      title/desc/step.desc (would make the quests section hybrid — mechanics in
      JSONB, prose in rows) and **NPC dialogue replies** (index-addressed, no
      stable node ids — needs its own table + an id-keyed dispatcher first).
- [ ] **Dialogue follow-ups** — `say` field (menu label vs spoken line),
      `goto`/node-ids for hub-and-spoke trees (the node-id work also unblocks
      moving dialogue replies into `campaign_narratives`), mid-combat surrender,
      NPC ICON sprite picker (`/art/sprites` stems; schema already stores `icon`).
- [ ] Continue the **auto-pick → player-driven** creation migration (Divine Order
      + caster spells done) for any remaining auto-assigned choices.

## Content & playtest

- [~] **Boss legendary + lair actions** — legendary `extra_attack` live on 26
      bosses; remaining: lair actions unwired, more legendary effect KINDS
      (teleport, gaze, debuff aura, spell-cast).
- [ ] **A shipped/starter campaign** — the project now ships NO built-in campaign
      (the malgovia/sandbox seeds were dropped 2026-06-09; the e2e self-seeds a
      throwaway one). A fresh deploy shows the "No campaigns found" empty state
      until someone authors one through the creator. Decide whether to ship a
      starter campaign (and how to seed it) vs. leave it author-only. Candidates
      if we do: coastal pirate town, desert ruin, planar city — authored on the
      3-level grid. Ties into onboarding (deferred until launch).
- [x] **Re-enable the skipped combat-loop e2e** (`smoke.spec.ts` — "enter a fight
      and resolve an attack") — done 2026-06-09. The 2026-05-22 click-intercept
      flake no longer reproduces; verified passing across many consecutive runs on
      the fresh ephemeral stack. (See the auth-under-load note below for the one
      remaining flake, which only bites a persisted/hammered stack — not CI.)
- [ ] **Backend auth race under sustained e2e load** (low; investigation only) —
      running the e2e suite repeatedly against a single PERSISTED stack makes the
      *next* run's `/api/auth/me` 401 for a whole run (login screen on every test),
      then recover — alternating with heavy passing runs. Smells like connection-
      pool / session-store exhaustion carried across runs. Doesn't affect CI (fresh
      stack per run) and is masked by `retries:2`, so it's deferred — but worth a
      look before any real concurrency load.
- [ ] **Difficulty tuning from playtest data** — capture damage/HP/encounter
      telemetry to inform tuning (the Giant Spider near-TPK was the latest signal).

## Art / assets (optional polish)

- [ ] Untapped Vivid Motion kit categories — **Currency** (gold display), **Core
      UI** buttons, **Shops** (blacksmith/bank/alchemist), and the **animated
      8-frame strips** (loot-drop / level-up flourishes via CSS steps).
- [ ] Warmer **light/lantern** art + a clearer **sling** item icon (catalog swaps).
- [ ] Box-drawing comment header rules shrank slightly after the SRD relabel —
      purely cosmetic.

## Type-share infrastructure

- [ ] **Phase 3** (remaining workspace-local types: Character, GameState, Seed,
      Trap, Room, OnHitEffect, BossPhase, EnemyTemplate, Enemy, Spell, BeastForm,
      InventoryItem, TurnActions, DeathSaves, Context/FrontendContext, GameRule,
      RuleFacts, CampaignFacts, and the map types). Defer until there's a concrete
      reason to share each.

## UX & polish

- [ ] **Tutorial / onboarding** (deferred-to-launch) — 2-room intro; held until
      the engine surface stabilizes near launch.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind an
      `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat cues.
- [ ] **LLM enhancement cost guards** (deferred-to-launch) — per-session token
      budget, short-event skip threshold, `LLM_ENHANCEMENT=off` kill switch.

## Engine & infrastructure

- [ ] **Save/state persistence across redeploys (manual verify)** — specs assert
      a field-missing state loads + survives a `takeAction`; still need the end-to-end
      exercise (start → redeploy → resume → confirm parity). ~30 min.
- [ ] **Multiplayer delta protocol** (lower urgency) — full-state replace is fine
      at current scale; revisit when broadcast size hurts. Don't prebuild.
- [ ] **Server-side invariants** (lower urgency) — `castSpell` checks slots only as
      a permission gate; with `turn_seq` on the wire, assert slot/hp/action budgets
      and reject stale-state actions with 409.
- [ ] **Observability** (needs-input) — only `console.log`; Sentry / structured
      logging would surface prod issues. Requires choosing a service.
- [ ] **CHANGELOG.md** (needs-input) — keep a user-visible change log? Which format?
- [ ] **Post-deploy health check + rollback** (needs-input) — CI deploys via SSM
      but doesn't poll `/api/health` or roll back on failure. ~2-3h.

## Accessibility audit (WCAG 2.1 AA)

> Already strong: focus-visible outlines, aria-labels on icon buttons, tablist
> semantics + arrow-key nav, focus-trap + Esc-close dialogs, aria-live combat
> narrative, real `<button>` party tiles.

- [ ] **fieldset/legend on grouped form controls** — CharScreen's PORTRAIT /
      ABILITY SCORES groups use plain `<label>`; want `<fieldset><legend>` (or
      `role="group"` + `aria-labelledby`).
- [ ] **HP / condition live-region updates** — they update silently; an off-screen
      `aria-live` delta summary would help SR users. Needs UX tuning.
- [ ] **Manual SR + keyboard-only validation** — VoiceOver / NVDA / JAWS + Tab-only.

## Security audit

> Solid foundation (helmet, pinned CORS, Postgres sessions, parameterized queries,
> auth rate-limit, OAuth, session-fixation protection). Single-tenant today masks
> issues that bite when `session_participants` lands.

- [ ] **CSRF on state-changing endpoints** — prod cookies use `sameSite: 'none'`,
      so the session cookie rides cross-origin POSTs. Tighten to `lax`, or
      double-submit token, or `X-Requested-With`. **Needs a design call first.**
- [ ] **Multiplayer: session ownership + turn enforcement** — `game_sessions.user_id`
      is single-tenant; `takeAction` doesn't verify the active character's owner.
- [ ] **CSP for any future HTML-serving paths** — helmet CSP is off (API returns no
      HTML); re-enable with tight `script-src 'self'` if we ever serve files directly.

## Local gate (run before pushing)

- Lint + both `tsc` + `test:be` + `test:fe` + the Playwright e2e smoke via the
  ephemeral stack (`npm run test:e2e:stack` — brings up `docker-compose.e2e.yml`,
  self-seeds a throwaway campaign, runs Playwright, tears down with `down -v`).
  (`npx playwright test` still works against an already-up stack via
  `E2E_BASE_URL` / `E2E_BACKEND_URL`.)
- `npm run check-migrations` when migrations change.
- The three `shared-types.ts` are generated — edit `src/shared/types.ts`, then
  `npm run sync-types` (CI runs `sync-types:check`).
