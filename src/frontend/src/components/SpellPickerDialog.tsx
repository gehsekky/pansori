import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import Dialog from './Dialog.tsx';
import styles from '../styles.module.css';

interface SpellOption {
  id: string;
  name: string;
  level: number;
  desc: string;
  spellList: Array<'arcane' | 'divine' | 'primal'>;
}

interface Props {
  // Title noun for the dialog (e.g. "Magic Initiate (Arcane)" or "Wizard").
  featName: string;
  // The spell list this picker draws from. Filters `spells` to tagged entries.
  spellList: 'arcane' | 'divine' | 'primal';
  cantripCount: number;
  l1Count: number;
  spells: SpellOption[];
  // Prior picks — repopulated when the dialog is reopened. Empty on first open.
  initialCantrips: string[];
  initialL1: string[];
  // Optional extra line under the intro (Magic Initiate's free-cast caveat).
  note?: string;
  // Spell ids already chosen in ANOTHER picker (e.g. Magic Initiate vs the
  // caster picker on the same character) — hidden here so you can't pick the
  // same spell twice.
  excludeIds?: string[];
  onClose: () => void;
  onSave: (cantripChoices: string[], l1Choices: string[]) => void;
}

// Shared spell picker — chooses N cantrips + M level-1 spells from a single
// spell list. Used by both Magic Initiate (origin feat, M = 1) and the caster
// creation spell picker (M > 1). Both cantrips and L1 are capped multi-selects.
// The backend re-validates picks (existence, level, spellList tag, counts) on
// session creation, so this dialog is defense-in-depth, not a security boundary.
function SpellPickerDialog({
  featName,
  spellList,
  cantripCount,
  l1Count,
  spells,
  initialCantrips,
  initialL1,
  note,
  excludeIds,
  onClose,
  onSave,
}: Props) {
  const exclude = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
  const [cantrips, setCantrips] = useState<string[]>(initialCantrips);
  const [l1, setL1] = useState<string[]>(initialL1);

  const cantripOptions = useMemo(
    () =>
      spells.filter((s) => s.level === 0 && s.spellList.includes(spellList) && !exclude.has(s.id)),
    [spells, spellList, exclude]
  );
  const l1Options = useMemo(
    () =>
      spells.filter((s) => s.level === 1 && s.spellList.includes(spellList) && !exclude.has(s.id)),
    [spells, spellList, exclude]
  );

  const cappedToggle = (setter: Dispatch<SetStateAction<string[]>>, cap: number, id: string) =>
    setter((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= cap) return prev;
      return [...prev, id];
    });

  const cantripsComplete = cantrips.length === cantripCount;
  const l1Complete = l1.length === l1Count;
  const canSave = cantripsComplete && l1Complete;

  const remaining = [
    cantripCount - cantrips.length > 0
      ? `${cantripCount - cantrips.length} more cantrip${cantripCount - cantrips.length === 1 ? '' : 's'}`
      : null,
    l1Count - l1.length > 0
      ? `${l1Count - l1.length} more L1 spell${l1Count - l1.length === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);

  return (
    <Dialog
      title={`${featName.toUpperCase()} — CHOOSE SPELLS`}
      onClose={onClose}
      width="min(640px, calc(100vw - 1.5rem))"
      testId="spell-picker-dialog"
    >
      <div className={styles.spellPickerScroll}>
        <p
          style={{
            color: 'var(--t-mid)',
            fontSize: '0.85rem',
            marginTop: 0,
            marginBottom: '0.5rem',
          }}
        >
          Pick {cantripCount} cantrip{cantripCount === 1 ? '' : 's'}
          {l1Count > 0 ? ` and ${l1Count} level-1 spell${l1Count === 1 ? '' : 's'}` : ''} from the{' '}
          <span style={{ color: 'var(--t-primary)' }}>{spellList}</span> spell list.
          {note ? ` ${note}` : ''}
        </p>

        <h3
          style={{
            margin: '1rem 0 0.5rem',
            fontSize: '0.78rem',
            color: 'var(--t-primary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Cantrips ({cantrips.length}/{cantripCount})
        </h3>
        <div className={styles.invBody}>
          {cantripOptions.length === 0 ? (
            <p className={styles.campaignEmpty}>No cantrips available on the {spellList} list.</p>
          ) : (
            cantripOptions.map((s) => {
              const picked = cantrips.includes(s.id);
              const limitHit = !picked && cantrips.length >= cantripCount;
              return (
                <div
                  key={s.id}
                  className={styles.invItem}
                  data-testid={`spell-picker-cantrip-${s.id}`}
                  style={limitHit ? { opacity: 0.55 } : undefined}
                >
                  <label
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
                    className={styles.invItemHeader}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={limitHit}
                      onChange={() => cappedToggle(setCantrips, cantripCount, s.id)}
                      data-testid={`spell-picker-cantrip-input-${s.id}`}
                    />
                    <span style={{ flex: 1 }}>
                      <span className={styles.invItemName}>{s.name}</span>
                      <div className={styles.invItemDesc}>{s.desc}</div>
                    </span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        {l1Count > 0 && (
          <>
            <h3
              style={{
                margin: '1rem 0 0.5rem',
                fontSize: '0.78rem',
                color: 'var(--t-primary)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Level-1 spell{l1Count === 1 ? '' : 's'} ({l1.length}/{l1Count})
            </h3>
            <div className={styles.invBody}>
              {l1Options.length === 0 ? (
                <p className={styles.campaignEmpty}>
                  No level-1 spells available on the {spellList} list.
                </p>
              ) : (
                l1Options.map((s) => {
                  const picked = l1.includes(s.id);
                  const limitHit = !picked && l1.length >= l1Count;
                  return (
                    <div
                      key={s.id}
                      className={styles.invItem}
                      data-testid={`spell-picker-l1-${s.id}`}
                      style={limitHit ? { opacity: 0.55 } : undefined}
                    >
                      <label
                        style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
                        className={styles.invItemHeader}
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          disabled={limitHit}
                          onChange={() => cappedToggle(setL1, l1Count, s.id)}
                          data-testid={`spell-picker-l1-input-${s.id}`}
                        />
                        <span style={{ flex: 1 }}>
                          <span className={styles.invItemName}>{s.name}</span>
                          <div className={styles.invItemDesc}>{s.desc}</div>
                        </span>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      <div
        style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}
      >
        <button className={styles.invBtn} onClick={onClose} data-testid="spell-picker-cancel">
          Cancel
        </button>
        <button
          className={styles.invBtn}
          disabled={!canSave}
          onClick={() => {
            onSave(cantrips, l1);
            onClose();
          }}
          data-testid="spell-picker-save"
        >
          {canSave ? 'Save spell choices' : `Pick ${remaining.join(' + ')}`}
        </button>
      </div>
    </Dialog>
  );
}

export default SpellPickerDialog;
