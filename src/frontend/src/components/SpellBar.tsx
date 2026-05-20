import type { ChoiceKind, GameChoice } from '../types.ts';
import RaIcon from './RaIcon.tsx';
import styles from '../styles.module.css';

// Horizontal icon row showing one button per single-target offensive
// spell the active PC can cast right now. Pairs with the EnemySelector
// (which says who the spell hits) so each tile collapses N target
// variants into one click.
//
// Scope:
//   IN  — single-target offensive cast_spell choices that target the
//         currently-selected enemy. One button per unique `spellId`,
//         picking the lowest available slot (upcasts stay in the text
//         list below until a slot picker is added).
//   OUT — heal/utility spells (no targetEnemyId), AoE spells
//         (blastRadius — multiple origin variants would clutter), and
//         multi-target Magic Missile / Eldritch Blast variants
//         (different shape, kept in the text list as focus-fire /
//         spread choices).
//
// Per-spell icon map below; unknown spells fall back to a generic wand
// glyph so brand-new spells still render something useful.

interface Props {
  // Pre-filtered: only cast_spell choices that survived the enemy
  // selector filter AND don't carry targetEnemyIds (single-target).
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
}

// rpg-awesome icon names (without the `ra-` prefix). Add a new entry
// here when a spell wants its own glyph; anything not in the map uses
// `crystal-wand`.
const SPELL_ICON: Record<string, string> = {
  fire_bolt: 'fire-symbol',
  sacred_flame: 'sunbeams',
  eldritch_blast: 'burning-eye',
  vicious_mockery: 'thorny-vine',
  toll_the_dead: 'tombstone',
  ray_of_frost: 'frost-emblem',
  guiding_bolt: 'burning-meteor',
  magic_missile: 'arrow-cluster',
  inflict_wounds: 'bleeding-eye',
  hellish_rebuke: 'fire-ring',
  hold_person: 'padlock',
  hex: 'eyeball',
  charm_person: 'aura',
  sleep: 'crescent-moon',
  hunger_of_hadar: 'crystal-cluster',
  spirit_guardians: 'sparkles',
  divine_smite_spell: 'lightning-sword',
};

interface SpellGroup {
  spellId: string;
  spellName: string;
  choice: GameChoice;
}

// Dedupe by spellId, picking the choice with the lowest slotLevel so
// the icon row always defaults to the cheapest cast. Upcasting moves
// to the text list (which still gets the higher-slot variants).
function groupSpells(choices: GameChoice[]): SpellGroup[] {
  const groups = new Map<string, SpellGroup>();
  for (const c of choices) {
    const action = c.action as { type: 'cast_spell'; spellId: string; slotLevel: number };
    if (action.type !== 'cast_spell') continue;
    const spellId = action.spellId;
    const slotLevel = action.slotLevel;
    const existing = groups.get(spellId);
    if (!existing) {
      groups.set(spellId, { spellId, spellName: extractSpellName(c.label), choice: c });
      continue;
    }
    const existingSlot = (existing.choice.action as { slotLevel: number }).slotLevel;
    if (slotLevel < existingSlot) {
      existing.choice = c;
    }
  }
  return [...groups.values()];
}

// The backend label is "Cast <Spell Name> (cantrip)" or "Cast <Spell
// Name> (Lvl 1 — N slots left)" or "Cast <Spell Name> (Lvl 1) → Enemy".
// Pull the spell name out so the icon-button caption stays short.
function extractSpellName(label: string): string {
  // Strip leading "Cast " and everything from the first " (" or " →".
  const m = label.match(/^Cast\s+(.+?)\s+(\(|→)/);
  if (m) return m[1];
  return label.replace(/^Cast\s+/, '');
}

function SpellBar({ choices, onChoose, disabled }: Props) {
  const groups = groupSpells(choices);
  if (groups.length === 0) return null;
  return (
    <div
      data-testid="spell-bar"
      className={styles.actionBar}
      role="group"
      aria-label="Spells"
    >
      {groups.map((g) => {
        const icon = SPELL_ICON[g.spellId] ?? 'crystal-wand';
        return (
          <button
            key={g.spellId}
            type="button"
            className={styles.actionBtn}
            disabled={disabled}
            aria-label={g.choice.label}
            title={g.choice.label}
            data-spell-id={g.spellId}
            data-testid={`spell-${g.spellId}`}
            onClick={() => onChoose(g.choice)}
          >
            <RaIcon name={icon} />
            <span className={styles.actionBtnLabel}>{g.spellName}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SpellBar;
