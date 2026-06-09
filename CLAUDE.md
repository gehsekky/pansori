# Notes for Claude (and other AI assistants)

## Project scope: strict SRD-only

Pansori is a strict SRD 5.2.1 build. **No PHB-only content** —
not subclasses, feats, species, or spells. If you find yourself
wanting to add Lucky / Sharpshooter / Sentinel / Polearm Master /
Battle Master / Aasimar / Absorb Elements / etc., the answer is
**no**. See [LEGAL.md](LEGAL.md) for the SRD attribution and the
strict-SRD scope statement.

When unsure whether a feature is SRD or PHB, grep the SRD txt
first (see below). If it's not there, it doesn't belong in pansori.

## RAW reference: SRD 5.2.1

The 2024 PHB-compatible SRD lives at [docs/srd-5.2.1.txt](docs/srd-5.2.1.txt)
(machine-extracted from the official PDF; licensed CC-BY-4.0; see
[LEGAL.md](LEGAL.md) for attribution).

**When to consult it:**
- Before adding a new spell, condition, feat, or species — `grep` the SRD
  for the canonical rules text. If it's not in the SRD, it doesn't go in.
- Before writing a `// SRD: <section>` comment — verify the wording.
- When a player or reviewer flags a RAW question — check the SRD as the
  source of truth before relying on memory.

**Useful grep patterns:**

```bash
# Spell — entries start with the spell name on its own line
grep -n "^Polymorph$" docs/srd-5.2.1.txt
sed -n '<line>,<line+40>p' docs/srd-5.2.1.txt

# Condition definitions
grep -n "^Blinded\|^Charmed\|^Frightened\|^Stunned" docs/srd-5.2.1.txt

# Class features and subclass features
grep -n "Channel Divinity\|Wild Shape\|Sneak Attack" docs/srd-5.2.1.txt

# Action / combat rules
grep -n "Difficult Terrain\|Cover\|Hide Action\|Long Rest" docs/srd-5.2.1.txt

# Movement modes
grep -n "Climb\|Swim\|Fly Speed\|Burrow" docs/srd-5.2.1.txt

# Feat names (SRD 5.2.1 has only 4 origin feats + Ability Score
# Improvement + Grappler + 4 fighting styles + 7 epic boons):
grep -n "^Alert$\|^Magic Initiate$\|^Savage Attacker$\|^Skilled$" docs/srd-5.2.1.txt
```

**What the SRD covers (and how much is in pansori):**

| Category | SRD count | In pansori |
|---|---|---|
| Subclasses | 1 iconic per class | 12 (all SRD-iconic) |
| Origin feats | 4 (+ Magic Initiate's 3 list variants) | 6 |
| General feats | 2 (ASI + Grappler) | 0 (neither fits the choose-a-feat surface today) |
| Species | 9 standalone + Drow as Elf-lineage | 9 |
| Spells | ~340 | all (full SRD coverage; ~108 un-modelable utility/meta spells are narrative-only — see note below) |
| Monsters | 330 stat blocks | 328 (every attack-capable block, CR 0 Rat → CR 30 Tarrasque; only Seahorse + Shrieker Fungus skipped — no attack actions). Names + cr/hp/ac/xp are spec-audited against the SRD txt; complex traits deferred per entry with `// Simplification:` notes |

All SRD 5.2.1 spells are now in the catalog. The combat-relevant ones
are fully mechanical; spells whose RAW effect needs systems pansori
doesn't have (possession, planar gating, reality alteration) are
registered as
**narrative spells** — their effect is described and adjudicated at the
table, the same pattern as Augury / Commune / Divination. Mechanizing
those waits on the underlying systems.

As those systems get built, the narrative spells graduate to
mechanical: e.g. the **anti-magic suppression** system
(`isSpellSuppressed` + a `suppressesMagic` SpellZone) now drives
Antimagic Field and Globe of Invulnerability for real — a spell
crossing the zone fizzles per its level/geometry rules. Likewise the
**extra-turns** system (`Character.time_stop_turns` + the turn-advance
hook) now drives Time Stop — the caster takes 1d4+1 turns in a row
while others stay frozen, ending the instant a turn strikes an enemy.
And the **shapeshift** system (reusing the `wild_shaped` BeastForm
machinery, concentration-bound via `Character.shapeshift_spell`) drives
Shapechange (self) and Animal Shapes (the party) — narrowed to the
beast-form catalog (CR ≤ 1). And **Wish** (basic use) duplicates any
spell of level 1-8 for free (no slot / prep / material / prerequisite),
via a `wishDuplicate` free-cast flag + a `replaceWith` re-dispatch; its
open-ended "alter reality" use stays narrative.

The SRD's General Feats section is intentionally small — most
iconic combat-optimization feats (Lucky / Sharpshooter / Sentinel
/ GWM / Polearm Master / War Caster / Heavy Armor Master /
Resilient / Tough / Mobile / Observant / Athlete / Dual Wielder /
Healer / Tavern Brawler / Crossbow Expert) are PHB-only.

## Citation convention

Use `// SRD: <section name>` for SRD-derived comments. Page
numbers shift across PHB printings; SRD section names are stable.
Never cite PHB pages — pansori doesn't carry PHB content.

## Bestiary naming

`SRD_MONSTERS` names follow SRD 5.2.1 **exactly** (the
`SRD-exact naming` test in monsters.spec enforces it against the
SRD txt). Campaign flavor names are campaign-level clones —
`{ ...SRD_MONSTERS.skeleton, name: 'Skeleton Warrior' }` — never
bestiary renames. Creatures the SRD dropped (e.g. the 2014 Orc
stat block) live inline in the campaigns that use them.

## Assets & licensing (public repo vs private overlay)

pansori is **open-source / public**. The public repo must contain **only
redistributable assets**. Anything with a licensing restriction goes in the
**private overlay repo** `pansori-assets` (a sibling checkout, `../pansori-assets`),
NOT in pansori — and must never be committed to pansori or reappear in its git
history (the history was scrubbed once already; don't undo that).

**Decision rule for any new art / audio / font / data file:**

- **OK to commit to pansori** (redistributable): CC0, CC-BY / CC-BY-SA (with
  attribution in [LEGAL.md](LEGAL.md)), MIT / SIL OFL (fonts), and **original
  art we made** (incl. our own procgen / AI-generated-by-us). Examples already
  in-repo: the game-icons.net font (CC BY 3.0), the CC0 floor tiles + procgen
  dirt/sand, RPG Awesome, Phosphor.
- **Goes in `pansori-assets` instead** (restricted): anything **purchased**, or
  whose license says **non-commercial only**, **no redistribution / no
  repackaging** (even if modified), or is **unclear**. When in doubt, treat it as
  restricted → overlay. Current overlay contents: Baumgart terrain tiles +
  location markers, Baumgart "Medieval Arms & Armor" + Vivid Motion item icons,
  Tiny Swords sprites.

**How the overlay works:**

- The overlay mirrors the target path: `pansori-assets/art/<dir>` overlays into
  `src/frontend/public/art/<dir>`. Those gated dirs (`tiles`, `markers`, `icons`,
  `sprites`) are **gitignored in pansori** — extend `.gitignore` if you add a new
  gated dir. `floors/` + per-campaign room art stay public.
- `npm run sync-assets` copies the overlay in (no-ops to the free tier if it's
  absent). Per-file provenance lives in each overlay folder's `CREDITS.txt`.
- **The free tier must always work without the overlay.** Gate painted assets
  behind `paintedArt()` and route every `/art/...` URL through `artUrl()` — both
  in `src/frontend/src/lib/art.ts` — with a glyph (game-icons) / color-tint
  fallback. A clone with no overlay must render and pass tests/e2e.
- LEGAL.md credits only what the public repo ships; the restricted packs are
  credited there under "Painted-art overlay" (pointing at `pansori-assets`), with
  the real per-file terms in the overlay's `CREDITS.txt`. Keep `pansori-assets`
  **private** — a private repo feeding your deploy isn't "redistribution"; making
  it public would be.

## Workflow for new content

1. **Confirm SRD coverage first.** `grep` the relevant header in
   `docs/srd-5.2.1.txt`. If the feature isn't there, do not add
   it — propose a redesign that uses SRD-covered mechanics, or
   defer the work.
2. **Original code only.** Implement the mechanics in pansori's
   data + dispatcher shape; descriptions in the `desc` field are
   written in our own words (not pasted from SRD prose). The SRD
   txt is a reference for verification, not a source to paste from.
3. **Test before commit.** Each new mechanical addition gets a
   matching `.spec.ts`; lint, tsc, and the full test suite must
   pass.

## CI / agent behavior

- **Don't block on CI.** After pushing, do NOT poll or `gh run
  watch` the GitHub Actions CI/Deploy job. Push, tell me it's
  pushed, and let me watch it — I'll flag any failure. (The local
  gate is what you're responsible for; CI is mine to monitor.)
- **The local pre-push gate** is lint + tsc + the full unit suites
  + **the e2e smoke**: run `npx playwright test` against the
  running dev stack (`npm run dev`; the backend needs
  `E2E_TEST_LOGIN_ENABLED=true`, already set in dev) before
  pushing. It's ~10s and it's the only local check that exercises
  login → creation → BEGIN ADVENTURE → combat for real — unit
  suites alone have let CI-only breakage through (the auto-fill /
  Divine Order incident, 2026-06-06). Check exit codes explicitly;
  don't pipe test output through grep/tail in a way that can mask
  a failure.
- **Migration changes add `npm run check-migrations`** to that
  gate: it double-applies every migration file to a scratch DB,
  catching fresh-environment breakage (CI initdb + runner re-run)
  that an incrementally evolved dev database hides — e.g. a later
  migration dropping a column an earlier file references (the
  015/020 incident, 2026-06-06).
