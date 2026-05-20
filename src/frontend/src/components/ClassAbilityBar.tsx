import type { GameChoice } from '../types.ts';
import RaIcon from './RaIcon.tsx';
import styles from '../styles.module.css';

// Horizontal icon row showing one button per available class feature
// the active PC can use right now. Each `use_class_feature` choice from
// the engine becomes a tile; the bar surfaces these as glyphs instead
// of the prior verbose text list. Pairs sit alongside the SpellBar /
// CombatActionBar for the in-combat verb cluster, but ClassAbilityBar
// also surfaces out-of-combat features (Wild Shape dismiss, Arcane
// Recovery prompts in some flows, etc.).

interface Props {
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
}

// rpg-awesome icon names (without the `ra-` prefix). Each featureId
// gets a sensible glyph; unmapped ids fall back to `crystal-cluster`
// so new features show up immediately without an icon-map change. For
// featureIds with a variable suffix (wild_shape_X, tactical_master_X,
// metamagic_X) we match by prefix.
const FEATURE_ICON: Record<string, string> = {
  rage: 'muscle-up',
  frenzy_attack: 'muscle-up',
  reckless_attack: 'muscle-fat',
  second_wind: 'health-increase',
  action_surge: 'energise',
  adrenaline_rush: 'energise',
  divine_spark: 'flame-symbol',
  turn_undead: 'ankh',
  sear_undead: 'fire-symbol',
  sacred_weapon: 'fireball-sword',
  guided_strike: 'lightning-sword',
  preserve_life: 'health',
  bardic_inspiration: 'horn-call',
  cutting_words: 'horn-call',
  cunning_action_dash: 'boot-stomp',
  cunning_action_disengage: 'player-teleport',
  cunning_action_hide: 'hood',
  cunning_strike_trip: 'falling',
  cunning_strike_poison: 'poison-cloud',
  cunning_strike_disarm: 'broken-shield',
  cunning_strike_withdraw: 'player-teleport',
  flurry_of_blows: 'dervish-swords',
  patient_defense_free: 'eye-shield',
  patient_defense_dp: 'eye-shield',
  stunning_strike: 'player-thunder-struck',
  step_of_wind_dash: 'boot-stomp',
  step_of_wind_free_dash: 'boot-stomp',
  step_of_wind_free_disengage: 'player-teleport',
  moon_healing: 'moon-sun',
  dismiss_wild_shape: 'player',
  shadow_arts: 'hood',
  arcane_ward: 'bolt-shield',
  metamagic_quickened: 'stopwatch',
  metamagic_twinned: 'arrow-cluster',
  metamagic_empowered: 'fire-bomb',
  fey_presence: 'fairy',
  agonizing_blast: 'burning-eye',
  devils_sight: 'burning-eye',
  colossus_slayer: 'axe-swing',
  vow_of_enmity: 'target-arrows',
  abjure_enemy: 'interdiction',
  breath_weapon: 'fire-breath',
  large_form: 'player-lift',
  maneuver_trip: 'falling',
  maneuver_goading: 'horn-call',
  command_companion: 'wolf-head',
};

function iconForFeature(featureId: string): string {
  const exact = FEATURE_ICON[featureId];
  if (exact) return exact;
  // Prefix groups for ids with a variable suffix.
  if (featureId.startsWith('wild_shape_')) return 'wolf-head';
  if (featureId.startsWith('tactical_master_')) return 'crossed-swords';
  if (featureId.startsWith('metamagic_')) return 'crystal-wand';
  return 'crystal-cluster';
}

// Pull a short caption out of the engine's verbose feature label.
// Examples:
//   "Rage — bonus action (3 uses left)"          → "Rage"
//   "Cunning Action: Disengage — no OA..."       → "Cunning Action: Disengage"
//   "Wild Shape — Brown Bear (CR1)"              → "Wild Shape — Brown Bear"
function shortLabel(full: string): string {
  // Stop at the first " — " or " (" boundary that comes AFTER any
  // colons in the lead-in, so multi-clause names like "Cunning
  // Action: Disengage" survive.
  const idxParen = full.indexOf(' (');
  const idxDash = full.indexOf(' — ');
  const stops = [idxParen, idxDash].filter((i) => i >= 0);
  if (stops.length === 0) return full;
  const stopAt = Math.min(...stops);
  return full.slice(0, stopAt);
}

function ClassAbilityBar({ choices, onChoose, disabled }: Props) {
  if (choices.length === 0) return null;
  return (
    <div
      data-testid="class-ability-bar"
      className={styles.actionBar}
      role="group"
      aria-label="Class abilities"
    >
      {choices.map((c, i) => {
        const action = c.action as { type: 'use_class_feature'; featureId: string };
        const featureId = action.featureId;
        const icon = iconForFeature(featureId);
        return (
          <button
            key={`${featureId}-${i}`}
            type="button"
            className={styles.actionBtn}
            disabled={disabled}
            aria-label={c.label}
            title={c.label}
            data-feature-id={featureId}
            data-testid={`feature-${featureId}`}
            onClick={() => onChoose(c)}
          >
            <RaIcon name={icon} />
            <span className={styles.actionBtnLabel}>{shortLabel(c.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ClassAbilityBar;
