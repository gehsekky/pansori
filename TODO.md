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

- [ ] Some comments still cite **`SRD p.NNN`** (page numbers) — e.g.
      `rulesEngine.ts` advantage/disadvantage + armor/weapon proficiency notes.
      The convention says use SRD **section names**, not page numbers. These
      pre-date this task and aren't PHB; relabel in a separate pass if desired.
- [ ] Box-drawing comment headers that shrank (e.g. `// ─── X (SRD) ───`) have
      slightly shorter trailing rules now — purely cosmetic.

### Verify after each batch
- BE: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
- FE: same; root `npm run sync-types:check` + `npx prettier --check`
  (the three `shared-types.ts` are generated — edit `src/shared/types.ts` then `npm run sync-types`)
