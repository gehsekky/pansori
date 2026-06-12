import type { GameChoice } from '../types.ts';
import RaIcon from './RaIcon.tsx';
import styles from '../styles.module.css';

// Horizontal icon row showing one button per spell the active PC can
// cast right now — offensive, buff, heal, and utility all surface.
// Pairs with the EnemySelector (which controls which enemy a single-
// target offensive spell hits) — buff/heal/utility spells ignore the
// selector and auto-target allies or self per the engine's cast handler.
//
// Scope:
//   IN  — every cast_spell choice except multi-target variants. One
//         button per unique `spellId` at the lowest available slot.
//   OUT — multi-target Magic Missile / Eldritch Blast focus-fire /
//         spread variants (each has a distinct shape — multiple dart/
//         beam targets — that doesn't collapse to one click); upcast
//         slots above the lowest available (player picks via text list
//         if they want to burn a higher slot).
//
// Per-spell icon map below; unknown spells fall back to a generic
// wand glyph so brand-new spells still render something useful.

interface Props {
  // Pre-filtered: only cast_spell choices that survived the enemy
  // selector filter AND don't carry targetEnemyIds (single-target).
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
  // The active caster's slot budget (Character.spell_slots_max / _used) —
  // rendered as per-level pips at the bar's edge so the spend decision is
  // made against a visible budget, not a hover tooltip.
  slots?: { max: Record<number, number>; used: Record<number, number> };
}

// rpg-awesome icon names (without the `ra-` prefix). Add a new entry
// here when a spell wants its own glyph; anything not in the map uses
// `crystal-wand`.
const SPELL_ICON: Record<string, string> = {
  // Offensive single-target / damage
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
  divine_smite_spell: 'lightning-sword',
  // Conditions / debuffs
  hold_person: 'padlock',
  hex: 'eyeball',
  charm_person: 'aura',
  sleep: 'crescent-moon',
  hunger_of_hadar: 'crystal-cluster',
  // AoE
  thunderwave: 'crossed-axes',
  fireball: 'fire-bomb',
  shatter: 'shockwave',
  burning_hands: 'fire-symbol',
  // Buffs (concentration / party)
  bless: 'aura',
  bane: 'death-skull',
  spirit_guardians: 'sparkles',
  shield_of_faith: 'shield',
  // Heals
  cure_wounds: 'health',
  healing_word: 'health',
  mass_healing_word: 'health',
  // Utility / movement
  misty_step: 'player-teleport',
  shield: 'shield',
  counterspell: 'crystal-wand',
  detect_magic: 'aura',
  identify: 'crystal-ball',
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

// Per-level slot pips: ● = a slot still available, ○ = spent. Levels with no
// slots at all (max 0) don't render. SRD slot tables top out at 4 per level,
// so the row stays short.
function SlotPips({ slots }: { slots: NonNullable<Props['slots']> }) {
  const levels = Object.keys(slots.max)
    .map(Number)
    .filter((lvl) => (slots.max[lvl] ?? 0) > 0)
    .sort((a, b) => a - b);
  if (levels.length === 0) return null;
  return (
    <span
      data-testid="spell-slot-pips"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.62rem',
        color: 'var(--t-dim)',
        whiteSpace: 'nowrap',
        padding: '0 4px',
      }}
    >
      {levels.map((lvl) => {
        const max = slots.max[lvl] ?? 0;
        const left = Math.max(0, max - (slots.used[lvl] ?? 0));
        return (
          <span key={lvl} aria-label={`Level ${lvl} slots: ${left} of ${max} remaining`}>
            L{lvl}{' '}
            <span style={{ color: 'var(--t-primary)', letterSpacing: 1 }}>{'●'.repeat(left)}</span>
            <span style={{ letterSpacing: 1 }}>{'○'.repeat(max - left)}</span>
          </span>
        );
      })}
    </span>
  );
}

function SpellBar({ choices, onChoose, disabled, slots }: Props) {
  const groups = groupSpells(choices);
  if (groups.length === 0) return null;
  return (
    <div
      data-testid="spell-bar"
      className={styles.inlineActionBar}
      role="group"
      aria-label="Spells"
    >
      {groups.map((g) => {
        const icon = SPELL_ICON[g.spellId] ?? 'crystal-wand';
        return (
          <button
            key={g.spellId}
            type="button"
            className={styles.inlineActionBtn}
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
      {slots && <SlotPips slots={slots} />}
    </div>
  );
}

export default SpellBar;
