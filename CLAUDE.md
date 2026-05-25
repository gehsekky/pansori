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
| Spells | ~332 | 111 |

The SRD's General Feats section is intentionally small — most
iconic combat-optimization feats (Lucky / Sharpshooter / Sentinel
/ GWM / Polearm Master / War Caster / Heavy Armor Master /
Resilient / Tough / Mobile / Observant / Athlete / Dual Wielder /
Healer / Tavern Brawler / Crossbow Expert) are PHB-only.

## Citation convention

Use `// SRD: <section name>` for SRD-derived comments. Page
numbers shift across PHB printings; SRD section names are stable.
Never cite PHB pages — pansori doesn't carry PHB content.

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
