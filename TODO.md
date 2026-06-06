# Strict-SRD cleanup — "PHB" audit

Audited all **477** mentions of `phb` across the codebase. Findings below.

## ✅ Not a problem — leave as-is

- **No PHB-only _content_ is present.** Every "PHB-only" mention is a comment
  _documenting_ that the content is correctly **excluded** (Lucky, Sharpshooter,
  Sentinel, Polearm Master, Great Weapon Master, War Caster, Beast Master,
  Assassin, Protection/Blind Fighting styles, Aasimar, etc.). These notes are
  the record of the strict-SRD scope — **keep them.**
- **Doc scope statements** intentionally discuss the PHB boundary:
  `CLAUDE.md`, `LEGAL.md`, `README.md`, `docs/AUTHORING.md`, `docs/TODO.md`. **Keep.**
- **No `PHB` in code/identifiers/strings** that logic depends on — only comments
  + a few test `it(...)` descriptions.

## ⚠️ To fix — citation convention (CLAUDE.md: "Never cite PHB pages — use SRD section names")

~421 comments cite **`2024 PHB <Feature>`** or **`(PHB p.NNN)`** for content that
**is in the SRD 5.2.1**. Relabel `2024 PHB` / `PHB p.N` → `SRD` in comments.
Do **not** touch the "PHB-only" exclusion notes or the doc scope statements.

### Checklist (by area, descending by count) — ✅ DONE

Relabeled `2024 PHB` / `PHB 2024` / `2014 PHB` / `5e PHB` / `PHB p.N` / `PHB/SRD`
/ bare `PHB` → `SRD` across **96 source files** (guarded sed, skipping the
keep-list), then re-synced the generated `shared-types.ts`. Comment-only — no
behavior change. Gate green (BE tsc/eslint, FE tsc/eslint, sync-types, prettier,
BE 2520 + FE 221 tests).

- [x] `services/gameEngine.ts`
- [x] `services/rulesEngine.ts`
- [x] `services/actions/**`
- [x] `services/*.ts`
- [x] `campaignData/srd/**`
- [x] `types.ts` + `src/shared/types.ts` (→ synced `shared-types.ts`)
- [x] `frontend/src/**`
- [x] `**/*.spec.ts` test descriptions
- [x] Manual fixes: 4 "Beast Form" citations wrongly skipped by the
      `PHB Beast`(-Master) guard; the multi-page list in `classes.ts`
      (orphan page numbers removed)
- [x] Final sweep — the only remaining `phb` mentions are the intentional
      keep-list (PHB-only exclusion notes + doc scope statements)

### Follow-up (related, but NOT PHB — out of this task's scope)

- [x] **`SRD p.NNN` page citations dropped** — relabeled to SRD section names
      across the citations (rulesEngine, etc.); no `SRD p.` / `PHB p.` page
      references remain in source.
- [ ] Box-drawing comment headers that shrank (e.g. `// ─── X (SRD) ───`) have
      slightly shorter trailing rules now — purely cosmetic.

---

# SRD equipment + creation/combat (this session)

## ✅ Done

**Equipment catalog (`campaignData/srd/items.ts`) — now the full SRD 5.2.1 tables:**
- [x] All 38 weapons (simple + martial, incl. firearms) with RAW damage /
      properties / mastery; fixed Dart's missing Vex mastery.
- [x] All 13 armor entries (padded → plate + shield) with base AC / DEX cap.
- [x] Tools + adventuring gear (backpack, rope, tinderbox, …); Healer's Kit
      wired to a `stabilize` use; Antitoxin (`con_advantage`).
- [x] Light sources — Torch / Hooded Lantern / Bullseye Lantern as a `light`
      worn effect + a **quiver** equip slot; combat seeding emits `light_radius_ft`.
- [x] Thrown splash weapons (`throw_item`): Acid, Alchemist's Fire (save-ends
      burn), Holy Water (gated on a new `Enemy.creatureType`).
- [x] Ammunition (arrows/bolts/bullets/needles) + the quiver slot; ranged
      attacks spend a matching round; ranged starters bundle arrows.

**Rules / creation / combat:**
- [x] Rogue weapon proficiency = Simple + Finesse/Light martial
      (`martial_finesse_light`) — fixes the mastery picker + attack proficiency.
- [x] Cleric **Divine Order** moved to character creation (required to start).
- [x] **Caster spell picker** at creation (cantrips + L1 from the class list);
      Magic Initiate vs caster pickers lock duplicate *cantrips* but allow the
      beneficial L1 overlap; locked spells shown (not hidden).
- [x] Magic Initiate free L1 cast surfaced as a distinct, slot-independent
      combat choice (`✦ … free, Magic Initiate`); cantrips tagged by source.

## ⏳ Deferred / open

- [ ] **Mounts, vehicles, trade goods** — the rest of the SRD equipment chapter;
      not modeled (no systems for them yet).
- [ ] **Caltrops / ball bearings** — area-denial consumables; need a
      movement-triggered ground-effect mechanic (the thrown splash weapons exist;
      these don't).
- [ ] **Spellcasting foci** (holy symbol / component pouch / arcane focus) are
      still flavor — `effect: 'spellcasting_focus'` isn't read anywhere; casting
      has no focus/component gate.
- [ ] **Per-campaign spell curation** — `spellTable` loads the whole SRD catalog
      everywhere; no `srdSpells(…)` selector (cf. `srdItems`) for low-magic settings.
- [ ] Continue the **auto-pick → player-driven** migration (Divine Order + caster
      spells done) for any remaining auto-assigned creation choices.

### Verify after each batch
- BE: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
- FE: same; root `npm run sync-types:check` + `npx prettier --check`
  (the three `shared-types.ts` are generated — edit `src/shared/types.ts` then `npm run sync-types`)
