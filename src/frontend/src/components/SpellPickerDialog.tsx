import { useMemo, useState } from 'react';
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
  // Display name of the feat being chosen for (e.g. "Magic Initiate (Arcane)").
  featName: string;
  // The spell list this feat draws from. The picker filters `spells` so only
  // tagged entries are visible.
  spellList: 'arcane' | 'divine' | 'primal';
  cantripCount: number;
  l1Count: number;
  spells: SpellOption[];
  // Prior picks — used to repopulate when the dialog is reopened after
  // initial selection. Empty arrays / null on first open.
  initialCantrips: string[];
  initialL1: string | null;
  onClose: () => void;
  onSave: (cantripChoices: string[], l1Choice: string | null) => void;
}

// Magic Initiate spell picker. Surfaced at character creation when the
// chosen background's origin feat is one of the three Magic Initiate
// variants (arcane / divine / primal). Player picks N cantrips + 1 L1
// spell from the matching spell list. Backend re-validates the shape +
// content (existence, level, spellList tag) on session creation so the
// dialog is defense-in-depth, not a security boundary.
//
// Save is gated on the exact counts (cantrips === cantripCount,
// l1Count === 1 → l1Choice set). The button label calls this out so
// players know what's missing.
function SpellPickerDialog({
  featName,
  spellList,
  cantripCount,
  l1Count,
  spells,
  initialCantrips,
  initialL1,
  onClose,
  onSave,
}: Props) {
  const [cantrips, setCantrips] = useState<string[]>(initialCantrips);
  const [l1, setL1] = useState<string | null>(initialL1);

  const cantripOptions = useMemo(
    () => spells.filter((s) => s.level === 0 && s.spellList.includes(spellList)),
    [spells, spellList]
  );
  const l1Options = useMemo(
    () => spells.filter((s) => s.level === 1 && s.spellList.includes(spellList)),
    [spells, spellList]
  );

  function toggleCantrip(id: string) {
    setCantrips((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= cantripCount) return prev;
      return [...prev, id];
    });
  }

  const cantripsComplete = cantrips.length === cantripCount;
  const l1Complete = l1Count === 0 || !!l1;
  const canSave = cantripsComplete && l1Complete;

  return (
    <Dialog
      title={`${featName.toUpperCase()} — CHOOSE SPELLS`}
      onClose={onClose}
      width="min(640px, calc(100vw - 1.5rem))"
      testId="spell-picker-dialog"
    >
      <p
        style={{
          color: 'var(--t-mid)',
          fontSize: '0.85rem',
          marginTop: 0,
          marginBottom: '0.5rem',
        }}
      >
        Pick {cantripCount} cantrip{cantripCount === 1 ? '' : 's'}
        {l1Count > 0 ? ` and ${l1Count} level-1 spell` : ''} from the{' '}
        <span style={{ color: 'var(--t-primary)' }}>{spellList}</span> spell list. The level-1 spell
        can be cast once per long rest without expending a slot.
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
                    onChange={() => toggleCantrip(s.id)}
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
            Level-1 spell ({l1 ? '1' : '0'}/{l1Count})
          </h3>
          <div className={styles.invBody}>
            {l1Options.length === 0 ? (
              <p className={styles.campaignEmpty}>
                No level-1 spells available on the {spellList} list.
              </p>
            ) : (
              l1Options.map((s) => (
                <div key={s.id} className={styles.invItem} data-testid={`spell-picker-l1-${s.id}`}>
                  <label
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
                    className={styles.invItemHeader}
                  >
                    <input
                      type="radio"
                      name="spell-picker-l1"
                      checked={l1 === s.id}
                      onChange={() => setL1(s.id)}
                      data-testid={`spell-picker-l1-input-${s.id}`}
                    />
                    <span style={{ flex: 1 }}>
                      <span className={styles.invItemName}>{s.name}</span>
                      <div className={styles.invItemDesc}>{s.desc}</div>
                    </span>
                  </label>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'flex-end',
          marginTop: '1rem',
        }}
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
          {canSave
            ? 'Save spell choices'
            : `Pick ${cantripCount - cantrips.length} more cantrip${cantripCount - cantrips.length === 1 ? '' : 's'}${l1Count > 0 && !l1 ? ' + 1 L1 spell' : ''}`}
        </button>
      </div>
    </Dialog>
  );
}

export default SpellPickerDialog;
