import type { Character, FrontendContext, GameState, Seed } from '../types';
import { useEffect, useState } from 'react';
import InitiativeStrip from './InitiativeStrip';
import styles from '../styles.module.css';

interface Props {
  state: GameState;
  activeCharId: string;
  ctx: FrontendContext;
  seed: Seed | null;
  inCombat: boolean;
  // Out-of-combat: clicking a non-active living tile dispatches a
  // `set_active_character` action via this callback so the player
  // can hand the spotlight off (matches tabletop "who's talking to
  // this NPC" pattern). Omit / no-op in combat — initiative drives
  // the active marker there.
  onSetActive?: (charId: string) => void;
}

// Vertical party stack — the left rail of the 3-zone layout. Every character
// gets a tile with HP bar / AC / level / conditions / active marker. The
// tile the user clicks expands to show the rest of their kit (equipped
// weapon/armor/shield, hit dice, gold, XP, inspiration). Inventory tags
// don't render here anymore — the modal is the place for that.
//
// Two ids in play:
//   - activeCharId  = whose turn it is (initiative). Game-state driven.
//   - selectedCharId = which tile is expanded for viewing. Local-only.
// They usually point at the same character but the user can browse a
// teammate's loadout without losing initiative on the active char.
//
// Out of combat, clicking a tile ALSO promotes that PC to active via
// `onSetActive` — RAW has no initiative outside combat (SRD 5.2.1
// p.189), so the player picks who's leading.

function PartyRail({ state, activeCharId, ctx, seed, inCombat, onSetActive }: Props) {
  const [selectedCharId, setSelectedCharId] = useState<string>('');

  useEffect(() => {
    const exists = state.characters.some((c) => c.id === selectedCharId);
    if (!exists) setSelectedCharId(state.characters[0]?.id ?? '');
  }, [state, selectedCharId]);

  const initiativeOrder = state.initiative_order ?? [];
  const initiativeIdx = state.initiative_idx ?? 0;

  function hasActedThisRound(charId: string): boolean {
    if (!inCombat || initiativeOrder.length === 0) return false;
    const idx = initiativeOrder.findIndex((e) => e.id === charId);
    return idx >= 0 && idx < initiativeIdx;
  }

  return (
    <aside className={styles.partyRail} aria-label="Party">
      {inCombat && <InitiativeStrip state={state} seed={seed} />}
      <h2 className={styles.partyRailHeading}>Party</h2>
      {state.characters.map((c) => {
        const isActive = c.id === activeCharId;
        const isSelected = c.id === selectedCharId;
        const hasActed = hasActedThisRound(c.id);
        const showDetail = isSelected;
        return (
          <PartyTile
            key={c.id}
            char={c}
            ctx={ctx}
            isActive={isActive}
            isSelected={isSelected}
            hasActed={hasActed}
            showDetail={showDetail}
            onSelect={() => {
              setSelectedCharId(c.id);
              // Out-of-combat lead handoff: dispatch only when (a) not
              // already active, (b) target alive, (c) not in combat.
              // Combat clicks keep their expand-detail behavior but
              // don't try to override initiative.
              if (!inCombat && !c.dead && c.id !== activeCharId && onSetActive) {
                onSetActive(c.id);
              }
            }}
          />
        );
      })}
    </aside>
  );
}

function PartyTile({
  char,
  ctx,
  isActive,
  isSelected,
  hasActed,
  showDetail,
  onSelect,
}: {
  char: Character;
  ctx: FrontendContext;
  isActive: boolean;
  isSelected: boolean;
  hasActed: boolean;
  showDetail: boolean;
  onSelect: () => void;
}) {
  const hpPct = char.max_hp > 0 ? Math.max(0, Math.min(1, char.hp / char.max_hp)) : 0;
  const hpColor = char.dead
    ? 'var(--t-hp-low)'
    : hpPct > 0.5
      ? 'var(--t-hp-high)'
      : hpPct > 0.25
        ? 'var(--t-hp-mid)'
        : 'var(--t-hp-low)';

  const equipped = (instId: string | null) =>
    instId ? (char.inventory?.find((i) => i.instance_id === instId) ?? null) : null;
  const weapon = equipped(char.equipped_weapon);
  const armor = equipped(char.equipped_armor);
  const shield = equipped(char.equipped_shield);

  const className = [
    styles.partyTile,
    isActive ? styles.partyTileActive : '',
    isSelected ? styles.partyTileSelected : '',
    hasActed ? styles.partyTileActed : '',
    char.dead ? styles.partyTileDead : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={onSelect}
      aria-current={isActive ? 'true' : undefined}
      aria-expanded={showDetail}
      disabled={char.dead}
      data-testid="party-tile"
      data-character-id={char.id}
    >
      <div className={styles.partyTileHead}>
        {char.portrait_url && (
          <img src={char.portrait_url} alt="" className={styles.partyTilePortrait} />
        )}
        <span className={styles.partyTileName}>
          {char.name} <span style={{ color: 'var(--t-dim)' }}>[{char.character_class}]</span>
        </span>
        {isActive && (
          <span className={styles.partyTileActiveBadge} aria-label="Active turn">
            ◀
          </span>
        )}
        {char.inspiration && (
          <span
            aria-label="Has Heroic Inspiration"
            title="Heroic Inspiration"
            style={{ color: 'var(--t-primary)', fontSize: '0.8rem' }}
          >
            ✦
          </span>
        )}
      </div>

      <div className={styles.partyTileBars}>
        <div className={styles.partyTileHpBar} aria-hidden="true">
          <div
            className={styles.partyTileHpFill}
            style={{ background: hpColor, transform: `scaleX(${hpPct})` }}
          />
        </div>
        <span className={styles.partyTileHpText}>
          {char.dead ? 'DEAD' : char.stable ? 'zzz' : `${char.hp}/${char.max_hp}`}
          {(char.temp_hp ?? 0) > 0 && (
            <span style={{ color: 'var(--t-primary)' }}> +{char.temp_hp}</span>
          )}
        </span>
      </div>

      <div className={styles.partyTileMeta}>
        <span>AC {char.ac}</span>
        <span>LVL {char.level}</span>
      </div>

      {char.conditions && char.conditions.length > 0 && (
        <div className={styles.partyTileConditions}>
          {char.conditions.map((cond) => (
            <span key={cond} className={styles.condTag}>
              {cond.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {showDetail && (
        <div className={styles.partyTileDetail}>
          {char.species && (
            <>
              <span className={styles.partyTileDetailKey}>SPECIES</span>
              <span className={styles.partyTileDetailVal} style={{ textTransform: 'capitalize' }}>
                {char.species}
              </span>
            </>
          )}
          <span className={styles.partyTileDetailKey}>HIT DICE</span>
          <span className={styles.partyTileDetailVal}>
            {char.hit_dice_remaining ?? 0}/{char.level} (d{char.hit_die ?? 8})
          </span>
          <span className={styles.partyTileDetailKey}>XP</span>
          <span className={styles.partyTileDetailVal}>{char.xp}</span>
          <span className={styles.partyTileDetailKey}>GOLD</span>
          <span className={styles.partyTileDetailVal}>{char.gold}cr</span>
          <span className={styles.partyTileDetailKey}>WEAPON</span>
          <span className={styles.partyTileDetailVal}>
            {weapon ? (
              <>
                <span aria-hidden="true">{ctx.itemIcons[weapon.id] ?? null}</span> {weapon.name}
              </>
            ) : (
              <span style={{ color: 'var(--t-dim)' }}>unarmed</span>
            )}
          </span>
          <span className={styles.partyTileDetailKey}>ARMOR</span>
          <span className={styles.partyTileDetailVal}>
            {armor ? (
              <>
                <span aria-hidden="true">{ctx.itemIcons[armor.id] ?? null}</span> {armor.name}
              </>
            ) : (
              <span style={{ color: 'var(--t-dim)' }}>none</span>
            )}
          </span>
          {shield && (
            <>
              <span className={styles.partyTileDetailKey}>SHIELD</span>
              <span className={styles.partyTileDetailVal}>
                <span aria-hidden="true">{ctx.itemIcons[shield.id] ?? null}</span> {shield.name}
              </span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

export default PartyRail;
