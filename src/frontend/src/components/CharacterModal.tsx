import type { Character, FrontendContext } from '../types';
import Dialog from './Dialog.tsx';
import { SPECIES } from '../data/species';
import { formatClassLabel } from '../lib/characterFmt';
import styles from '../styles.module.css';

// In-game character sheet. Opened from a party member's portrait (the ⓘ icon in
// PartyRail) — a read-only full sheet: abilities + modifiers, vitals, species,
// background, proficiencies/feats, spells, and equipped gear. Composes the
// shared Dialog modal primitive.

interface Props {
  char: Character;
  ctx: FrontendContext;
  onClose: () => void;
}

const ABILITIES: Array<{ key: keyof Character; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

const mod = (score: number): number => Math.floor((score - 10) / 2);
const fmtMod = (m: number): string => (m >= 0 ? `+${m}` : `${m}`);

// Prettify an engine id ('healing_potion', 'sleight_of_hand') for display when
// no human label is available.
function titleCase(id: string): string {
  return id
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// A labeled section that only renders when it has content.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <h3
        style={{
          fontSize: '0.7rem',
          letterSpacing: '0.12em',
          color: 'var(--t-dim)',
          margin: '0 0 0.4rem',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function CharacterModal({ char, ctx, onClose }: Props) {
  const species = SPECIES.find((s) => s.id === char.species);
  const background = ctx.backgrounds?.find((b) => b.id === char.background_id);

  const title = `${char.name} — ${formatClassLabel(char.character_class, char.subclass)} ${char.level}`;

  const profLine = (label: string, items: string[] | undefined, prettify = true) =>
    items && items.length > 0 ? (
      <p className={styles.charSheetLine}>
        <span style={{ color: 'var(--t-dim)' }}>{label}:</span>{' '}
        {items.map((s) => (prettify ? titleCase(s) : s)).join(', ')}
      </p>
    ) : null;

  return (
    <Dialog title={title} onClose={onClose} width="720px" testId="character-modal">
      {/* Abilities */}
      <div className={styles.charSheetAbilities} data-testid="char-abilities">
        {ABILITIES.map(({ key, label }) => {
          const score = char[key] as number;
          return (
            <div key={label} className={styles.charSheetAbility}>
              <div className={styles.charSheetAbilityLabel}>{label}</div>
              <div className={styles.charSheetAbilityScore}>{score}</div>
              <div className={styles.charSheetAbilityMod}>{fmtMod(mod(score))}</div>
            </div>
          );
        })}
      </div>

      {/* Vitals */}
      <Section title="VITALS">
        <div className={styles.charSheetVitals} data-testid="char-vitals">
          <span>
            HP <strong>{char.hp}</strong>/{char.max_hp}
            {(char.temp_hp ?? 0) > 0 && (
              <span style={{ color: 'var(--t-primary)' }}> (+{char.temp_hp})</span>
            )}
          </span>
          <span>
            AC <strong>{char.ac}</strong>
          </span>
          <span>
            Level <strong>{char.level}</strong>
          </span>
          <span>Speed {char.speed ?? 30} ft</span>
          {(char.darkvision_ft ?? 0) > 0 && <span>Darkvision {char.darkvision_ft} ft</span>}
          <span>XP {char.xp}</span>
          <span>{char.gold} gp</span>
          {char.exhaustion_level > 0 && (
            <span style={{ color: 'var(--t-hp-mid)' }}>Exhaustion {char.exhaustion_level}</span>
          )}
        </div>
        {char.conditions.length > 0 && (
          <p className={styles.charSheetLine}>
            <span style={{ color: 'var(--t-dim)' }}>Conditions:</span>{' '}
            {char.conditions.map(titleCase).join(', ')}
          </p>
        )}
        {char.gender && (
          <p className={styles.charSheetLine}>
            <span style={{ color: 'var(--t-dim)' }}>Gender:</span> {titleCase(char.gender)}
          </p>
        )}
      </Section>

      {/* Species */}
      {species && (
        <Section title={`SPECIES — ${species.name}`}>
          <p className={styles.charSheetLine}>{species.desc}</p>
          <ul className={styles.charSheetList}>
            {species.traits.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Background */}
      {background && (
        <Section title={`BACKGROUND — ${background.name}`}>
          <p className={styles.charSheetLine}>{background.desc}</p>
          <p className={styles.charSheetLine}>
            <span style={{ color: 'var(--t-dim)' }}>{background.feature}:</span>{' '}
            {background.featureDesc}
          </p>
        </Section>
      )}

      {/* Proficiencies & training */}
      <Section title="PROFICIENCIES">
        {profLine('Skills', char.skill_proficiencies)}
        {profLine('Expertise', char.expertise_skills)}
        {profLine('Tools', char.tool_proficiencies)}
        {profLine('Armor', char.armor_proficiencies)}
        {profLine('Weapons', char.weapon_proficiencies)}
        {profLine('Weapon Masteries', char.weapon_masteries)}
        {profLine('Feats', char.feats)}
      </Section>

      {/* Spells */}
      {(char.spells_known.length > 0 || (char.prepared_spells ?? []).length > 0) && (
        <Section title="SPELLS">
          {profLine('Known', char.spells_known)}
          {profLine('Prepared', char.prepared_spells)}
          {/* Remaining/max per slot level — the rest-planning view of the
              same budget the combat SpellBar shows as pips. */}
          {profLine(
            'Slots',
            Object.keys(char.spell_slots_max ?? {})
              .map(Number)
              .filter((lvl) => (char.spell_slots_max?.[lvl] ?? 0) > 0)
              .sort((a, b) => a - b)
              .map((lvl) => {
                const max = char.spell_slots_max[lvl];
                const left = Math.max(0, max - (char.spell_slots_used?.[lvl] ?? 0));
                return `L${lvl} ${left}/${max}`;
              }),
            false
          )}
        </Section>
      )}
    </Dialog>
  );
}

export default CharacterModal;
