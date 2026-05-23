# Notes for Claude (and other AI assistants)

## RAW reference: SRD 5.2.1

The 2024 PHB-compatible SRD lives at [docs/srd-5.2.1.txt](docs/srd-5.2.1.txt)
(machine-extracted from the official PDF; licensed CC-BY-4.0; see
[LEGAL.md](LEGAL.md) for attribution).

**When to consult it:**
- Before adding a new spell, condition, feat, or species — `grep` the SRD
  for the canonical rules text.
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
```

**What the SRD covers vs. doesn't:**

✅ In the SRD:
- All 2024 PHB core rules (combat, conditions, saves, action economy)
- Base classes + the "iconic" subclass for each (Champion / Battle Master /
  Life / War / etc.)
- ~150 of the most common spells
- Standard species (Human, Elf, Dwarf, etc.) and some others
- 2024-revised mechanics (Polymorph temp-HP rewrite, Influence action, etc.)

❌ Not in the SRD (need the full 2024 PHB):
- Most non-iconic subclasses (Stars Druid, Trickery Cleric, Clockwork Soul
  Sorcerer, Aberrant Mind, Soulknife, Glamour Bard, World Tree, etc.)
- 2024-specific feats not yet in the SRD (some Magic Initiate details,
  some general feats)
- ~half the PHB spell catalog
- Detailed monster stat blocks beyond the SRD sample

For SRD-covered content, the txt file is authoritative — use it before
relying on training-data recall. For PHB-only content, rely on:
1. User-provided RAW excerpts in conversation (paste-as-you-go from
   the user's D&D Beyond browser view — clean, targeted, fair-use)
2. Pansori's existing tests + documented decisions in `docs/TODO.md`
3. Cross-checks against published commentary (e.g. user pasting Gemini
   citations) — defer to those over memory.

## Free Basic Rules (D&D Beyond) — cross-check via WebFetch

Wizards hosts the 2024 Basic Rules for free on D&D Beyond. It covers
more than SRD 5.2.1 (some 2024 PHB revisions land in Basic Rules
before flowing to the SRD). The content is © Wizards / All Rights
Reserved, but free to read on the official site — so WebFetch with
short-bullet-summary prompts is fair-use cross-check.

**Use this as a SECONDARY reference (after SRD grep) for:**
- Core rules chapters (Playing the Game, Spells overview, Rules
  Glossary entries on Concentration, Cover, etc.)
- 2024-specific rule revisions not yet propagated to SRD
- Quick verification of mechanics before shipping

**Useful URL patterns:**

```
https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game
https://www.dndbeyond.com/sources/dnd/br-2024/spells
https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions
https://www.dndbeyond.com/sources/dnd/br-2024/character-classes
https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary
```

**Prompt template for WebFetch:**

> "For a development cross-check, give me terse mechanical bullets
> (no verbatim rules text, just the rule shape) on [topic]: [list
> the specific mechanics you want to confirm]. Bullet format. I'll
> write original code from understanding."

**Known WebFetch limitation:** long paginated pages (the
spell-descriptions alphabetical listing in particular) truncate at
the front of the alphabet. Individual spells starting with letters
past ~D are not reliably reachable. Fallback: ask the user to paste
the specific spell excerpt from their browser.

**Never:** bulk-extract Basic Rules content to a file in the repo.
Wizards lets you READ the Free Basic Rules on their site but hasn't
licensed it for redistribution — that's a difference from SRD 5.2.1
(CC-BY-4.0). On-demand WebFetch summaries are fine; persistent
text files are not.

## Citation convention

Replace `// PHB p.X` comments with `// SRD: <section name>` when
shipping new mechanics. Page numbers shift across PHB printings; SRD
section names are stable. For 2024 content covered by Basic Rules
but not the SRD, cite as `// 2024 Basic Rules: <section>`.
