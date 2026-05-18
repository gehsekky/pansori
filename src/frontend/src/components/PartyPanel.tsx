import type { FrontendContext, GameState, Seed } from '../types';
import { useEffect, useState } from 'react';
import CharStatsCard from './CharStatsCard';
import InitiativeStrip from './InitiativeStrip';
import styles from '../styles.module.css';

function PartyPanel({
  state,
  activeCharId,
  ctx,
  seed,
  onEquip,
  inCombat,
  onOpenMap,
}: {
  state: GameState | null;
  activeCharId: string;
  ctx: FrontendContext;
  seed: Seed | null;
  onEquip: (instanceId: string, characterId: string) => void;
  inCombat: boolean;
  onOpenMap: () => void;
}) {
  const [selectedCharId, setSelectedCharId] = useState<string>('');

  useEffect(() => {
    if (!state) return;
    const exists = state.characters.some((c) => c.id === selectedCharId);
    if (!exists) setSelectedCharId(state.characters[0]?.id ?? '');
  }, [state]);

  if (!state) return null;

  const selectedChar = state.characters.find((c) => c.id === selectedCharId) ?? state.characters[0];
  if (!selectedChar) return null;

  const initiativeOrder = state.initiative_order ?? [];
  const initiativeIdx = state.initiative_idx ?? 0;

  function hasActedThisRound(charId: string): boolean {
    if (!inCombat || !initiativeOrder.length) return false;
    const charInitIdx = initiativeOrder.findIndex((e) => e.id === charId);
    return charInitIdx >= 0 && charInitIdx < initiativeIdx;
  }

  return (
    <div className={styles.card} style={{ marginBottom: '0.75rem' }}>
      {inCombat && <InitiativeStrip state={state} seed={seed} />}

      {state.characters.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {state.characters.map((c) => {
            const isActive = c.id === activeCharId;
            const isSelected = c.id === selectedCharId;
            const hasActed = hasActedThisRound(c.id);
            const hpPct = c.max_hp > 0 ? c.hp / c.max_hp : 0;
            const hpColor = c.dead
              ? 'var(--t-hp-low)'
              : hpPct > 0.5
                ? 'var(--t-hp-high)'
                : hpPct > 0.25
                  ? 'var(--t-hp-mid)'
                  : 'var(--t-hp-low)';
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCharId(c.id)}
                style={{
                  background: isSelected ? 'var(--t-separator)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--t-primary)' : 'var(--t-border)'}`,
                  color: isActive ? 'var(--t-primary)' : 'var(--t-mid)',
                  fontFamily: 'inherit',
                  fontSize: '0.75rem',
                  letterSpacing: '0.08em',
                  padding: '0.3rem 0.75rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: isActive ? '0 0 4px var(--t-border)' : 'none',
                  opacity: hasActed ? 0.55 : 1,
                }}
              >
                {c.portrait_url && (
                  <img
                    src={c.portrait_url}
                    alt=""
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      verticalAlign: 'middle',
                      marginRight: 4,
                    }}
                  />
                )}
                {hasActed && <span style={{ color: 'var(--t-dim)', marginRight: 3 }}>✓</span>}
                {c.name} [{c.character_class}]{' · '}
                <span style={{ color: hpColor }}>
                  {c.dead ? 'DEAD' : c.stable ? 'zzz' : `HP ${c.hp}/${c.max_hp}`}
                </span>
                {c.conditions?.length > 0 && (
                  <span style={{ marginLeft: 4 }}>
                    {c.conditions.map((cond) => (
                      <span
                        key={cond}
                        className={styles.condTag}
                        style={{ marginLeft: 2, fontSize: '0.65rem', padding: '1px 4px' }}
                      >
                        {cond.toUpperCase()}
                      </span>
                    ))}
                  </span>
                )}
                {isActive && (
                  <span style={{ color: 'var(--t-primary)', marginLeft: 4 }}>◀ ACTIVE</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {state.characters.length === 1 && selectedChar.conditions?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          {selectedChar.conditions.map((cond) => (
            <span key={cond} className={styles.condTag}>
              {cond.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <CharStatsCard
        char={selectedChar}
        state={state}
        ctx={ctx}
        seed={seed}
        onEquip={(iid) => onEquip(iid, selectedChar.id)}
        inCombat={inCombat}
        onOpenMap={onOpenMap}
      />
    </div>
  );
}

export default PartyPanel;
