import React from 'react';
import styles from '../styles.module.css';

// Reusable editor for a LootEffect — grant/revoke item ids to a REQUIRED party
// member (chosen from the campaign's required members). Used by the ACTS panel
// (act start/end) and the QUESTS panel (quest start/complete). The author picks
// the member by name; item ids are free-form (composed loot table).

export interface LootRow {
  itemId: string;
  member: string;
}
export interface LootEffectValue {
  grant?: LootRow[];
  revoke?: LootRow[];
}

const lbl: React.CSSProperties = {
  fontSize: '0.62rem',
  color: 'var(--t-dim)',
  letterSpacing: '0.08em',
};

function RowList({
  kind,
  rows,
  members,
  onChange,
}: {
  kind: 'grant' | 'revoke';
  rows: LootRow[];
  members: string[];
  onChange: (rows: LootRow[]) => void;
}) {
  const verb = kind === 'grant' ? 'GRANT' : 'REVOKE';
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{ ...lbl, marginBottom: 2 }}>
        {verb}
        <span style={{ textTransform: 'none' }}> · item → required member</span>
      </p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <input
            aria-label={`${kind} ${i + 1} item`}
            className={styles.formInp}
            style={{ flex: 1, minWidth: 90 }}
            placeholder="item id"
            value={r.itemId}
            onChange={(e) =>
              onChange(rows.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))
            }
          />
          <select
            aria-label={`${kind} ${i + 1} member`}
            className={styles.formInp}
            style={{ width: 130, cursor: 'pointer' }}
            value={r.member}
            onChange={(e) =>
              onChange(rows.map((x, j) => (j === i ? { ...x, member: e.target.value } : x)))
            }
          >
            <option value="">— member —</option>
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            className={styles.ghostBtn}
            aria-label={`Remove ${kind} ${i + 1}`}
            style={{ padding: '0.2rem 0.5rem' }}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className={styles.ghostBtn}
        style={{ fontSize: '0.65rem' }}
        onClick={() => onChange([...rows, { itemId: '', member: members[0] ?? '' }])}
      >
        + {verb.toLowerCase()}
      </button>
    </div>
  );
}

function LootEffectEditor({
  value,
  members,
  onChange,
}: {
  value: LootEffectValue;
  members: string[];
  onChange: (v: LootEffectValue) => void;
}) {
  return (
    <div data-testid="loot-effect-editor">
      <RowList
        kind="grant"
        rows={value.grant ?? []}
        members={members}
        onChange={(grant) => onChange({ ...value, grant })}
      />
      <RowList
        kind="revoke"
        rows={value.revoke ?? []}
        members={members}
        onChange={(revoke) => onChange({ ...value, revoke })}
      />
    </div>
  );
}

// Drop blank rows (no item or no member); return undefined when the effect is
// entirely empty so it's omitted from the saved payload.
export function cleanLootEffect(v: LootEffectValue | undefined): LootEffectValue | undefined {
  if (!v) return undefined;
  const clean = (rows: LootRow[] | undefined) =>
    (rows ?? []).filter((r) => r.itemId.trim() && r.member.trim());
  const grant = clean(v.grant);
  const revoke = clean(v.revoke);
  if (grant.length === 0 && revoke.length === 0) return undefined;
  return {
    ...(grant.length ? { grant } : {}),
    ...(revoke.length ? { revoke } : {}),
  };
}

export default LootEffectEditor;
