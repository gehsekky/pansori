import React from 'react';
import styles from '../styles.module.css';

// ─── Shared condition + effect row builders ──────────────────────────────────
//
// The structured rows behind the dialogue tree editor AND the quest editor:
// each row template compiles to the json-rules-engine condition JSON (or the
// GameConsequence JSON) the backend validates, and parses back for editing.
// A hand-authored shape the templates can't express parses to null — the
// caller preserves it verbatim behind a "custom" chip.

export interface DialogueConsequence {
  type: string;
  [key: string]: unknown;
}

// Picker option lists. A row kind is only offered when its options exist
// (e.g. no faction rows without factions); free-text kinds always show.
export interface RowPickers {
  items: Array<{ id: string; name: string }>;
  quests: Array<{ id: string; title: string }>;
  factions: Array<{ id: string; name: string }>;
  npcIds: string[];
  rooms?: Array<{ id: string; name: string }>;
  towns?: Array<{ id: string; name: string }>;
}

const TIERS = ['hostile', 'unfriendly', 'neutral', 'friendly', 'exalted'] as const;

export type CondRow =
  | { kind: 'quest'; questId: string; state: 'active' | 'completed' | 'not-started' }
  | { kind: 'flag'; key: string; value: string }
  | { kind: 'faction'; factionId: string; tier: (typeof TIERS)[number] }
  | { kind: 'item'; itemId: string }
  | { kind: 'visited-room'; roomId: string }
  | { kind: 'in-town'; townId: string }
  | { kind: 'kill'; enemyId: string };

// '' / 'true' / 'false' / numerics parse to their natural JSON type.
export function parseFlagValue(v: string): boolean | string | number {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  if (v.trim() !== '' && Number.isFinite(n)) return n;
  return v;
}

function compileRow(row: CondRow): object {
  switch (row.kind) {
    case 'quest':
      if (row.state === 'active')
        return { fact: 'quests_active', operator: 'contains', value: row.questId };
      if (row.state === 'completed')
        return { fact: 'quests_completed', operator: 'contains', value: row.questId };
      return {
        not: {
          any: [
            { fact: 'quests_active', operator: 'contains', value: row.questId },
            { fact: 'quests_completed', operator: 'contains', value: row.questId },
          ],
        },
      };
    case 'flag':
      return {
        fact: 'flags',
        path: `$.${row.key}`,
        operator: 'equal',
        value: parseFlagValue(row.value),
      };
    case 'faction':
      // "at least <tier>" — faction_tier is a name, so compile to membership
      // in the tier-and-up set.
      return {
        fact: 'faction_tier',
        path: `$.${row.factionId}`,
        operator: 'in',
        value: TIERS.slice(TIERS.indexOf(row.tier)),
      };
    case 'item':
      return { fact: 'party_items', operator: 'contains', value: row.itemId };
    case 'visited-room':
      return { fact: 'visited_rooms', operator: 'contains', value: row.roomId };
    case 'in-town':
      return { fact: 'current_town_id', operator: 'equal', value: row.townId };
    case 'kill':
      return { fact: 'enemies_killed', operator: 'contains', value: row.enemyId };
  }
}

/** Rows → the stored condition: one row stays a bare leaf, several AND up. */
export function compileCondition(rows: CondRow[]): object | undefined {
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return compileRow(rows[0]);
  return { all: rows.map(compileRow) };
}

function parseLeaf(c: Record<string, unknown>): CondRow | null {
  // The exact shapes compileRow emits — anything else is a custom condition.
  if (c.fact === 'quests_active' && c.operator === 'contains' && typeof c.value === 'string') {
    return { kind: 'quest', questId: c.value, state: 'active' };
  }
  if (c.fact === 'quests_completed' && c.operator === 'contains' && typeof c.value === 'string') {
    return { kind: 'quest', questId: c.value, state: 'completed' };
  }
  if ('not' in c) {
    const inner = c.not as Record<string, unknown>;
    if (inner && Array.isArray(inner.any) && inner.any.length === 2) {
      const [a, b] = inner.any as Array<Record<string, unknown>>;
      if (
        a?.fact === 'quests_active' &&
        b?.fact === 'quests_completed' &&
        a.value === b.value &&
        typeof a.value === 'string'
      ) {
        return { kind: 'quest', questId: a.value, state: 'not-started' };
      }
    }
    return null;
  }
  if (
    c.fact === 'flags' &&
    c.operator === 'equal' &&
    typeof c.path === 'string' &&
    c.path.startsWith('$.')
  ) {
    return { kind: 'flag', key: c.path.slice(2), value: String(c.value) };
  }
  if (
    c.fact === 'faction_tier' &&
    c.operator === 'in' &&
    typeof c.path === 'string' &&
    c.path.startsWith('$.') &&
    Array.isArray(c.value)
  ) {
    const tier = (c.value as string[])[0] as (typeof TIERS)[number];
    const expected = TIERS.slice(TIERS.indexOf(tier));
    if (TIERS.includes(tier) && JSON.stringify(expected) === JSON.stringify(c.value)) {
      return { kind: 'faction', factionId: c.path.slice(2), tier };
    }
    return null;
  }
  if (c.fact === 'party_items' && c.operator === 'contains' && typeof c.value === 'string') {
    return { kind: 'item', itemId: c.value };
  }
  if (c.fact === 'visited_rooms' && c.operator === 'contains' && typeof c.value === 'string') {
    return { kind: 'visited-room', roomId: c.value };
  }
  if (c.fact === 'current_town_id' && c.operator === 'equal' && typeof c.value === 'string') {
    return { kind: 'in-town', townId: c.value };
  }
  if (c.fact === 'enemies_killed' && c.operator === 'contains' && typeof c.value === 'string') {
    return { kind: 'kill', enemyId: c.value };
  }
  return null;
}

/** Condition JSON → template rows; null = not template-expressible (custom). */
export function parseCondition(cond: unknown): CondRow[] | null {
  if (cond === undefined || cond === null) return [];
  if (typeof cond !== 'object') return null;
  const c = cond as Record<string, unknown>;
  const leaves = Array.isArray(c.all) ? (c.all as Array<Record<string, unknown>>) : [c];
  const rows: CondRow[] = [];
  for (const leaf of leaves) {
    if (leaf === null || typeof leaf !== 'object') return null;
    const row = parseLeaf(leaf);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

// ─── Small shared bits ────────────────────────────────────────────────────────

const lbl: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--t-dim)' };
const tiny: React.CSSProperties = { padding: '0.2rem 0.45rem', fontSize: '0.7rem' };
const inp: React.CSSProperties = { fontSize: '0.75rem', padding: '0.25rem 0.4rem' };

function TinySelect(props: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      className={styles.formInp}
      style={{ ...inp, width: 'auto', cursor: 'pointer' }}
      aria-label={props.ariaLabel}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.placeholder !== undefined && <option value="">{props.placeholder}</option>}
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Effect (consequence) rows ────────────────────────────────────────────────

const EFFECT_TYPES = [
  { value: 'set_flag', label: 'SET FLAG' },
  { value: 'adjust_flag', label: 'ADJUST FLAG' },
  { value: 'give_gold', label: 'GIVE GOLD' },
  { value: 'give_item', label: 'GIVE ITEM' },
  { value: 'give_xp', label: 'GIVE XP' },
  { value: 'start_quest', label: 'START QUEST' },
  { value: 'advance_quest', label: 'COMPLETE STEP' },
  { value: 'set_npc_attitude', label: 'SET ATTITUDE' },
  { value: 'add_narrative', label: 'NARRATE' },
  { value: 'modify_hp', label: 'MODIFY HP' },
  { value: 'consume_item', label: 'TAKE ITEM' },
];

function defaultEffect(type: string, pickers: RowPickers): DialogueConsequence {
  switch (type) {
    case 'set_flag':
      return { type, key: '', value: true };
    case 'adjust_flag':
      return { type, key: '', delta: -1 };
    case 'give_gold':
    case 'give_xp':
      return { type, amount: 10 };
    case 'give_item':
      return { type, itemId: pickers.items[0]?.id ?? '' };
    case 'start_quest':
      return { type, questId: pickers.quests[0]?.id ?? '' };
    case 'advance_quest':
      return { type, questId: pickers.quests[0]?.id ?? '', stepId: '' };
    case 'add_narrative':
      return { type, text: '' };
    case 'modify_hp':
      return { type, amount: 5 };
    case 'consume_item':
      return { type, itemId: pickers.items[0]?.id ?? '' };
    default:
      return { type, npcId: pickers.npcIds[0] ?? '', attitude: 'indifferent' };
  }
}

function EffectRow(props: {
  effect: DialogueConsequence;
  where: string;
  pickers: RowPickers;
  onChange: (e: DialogueConsequence) => void;
  onRemove: () => void;
}) {
  const { effect: e, where, pickers, onChange } = props;
  const typeLabel = EFFECT_TYPES.find((t) => t.value === e.type)?.label ?? e.type;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ ...lbl, minWidth: 80 }}>{typeLabel}</span>
      {e.type === 'set_flag' && (
        <>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 110 }}
            aria-label={`${where} flag key`}
            placeholder="flag_key"
            value={String(e.key ?? '')}
            onChange={(ev) => onChange({ ...e, key: ev.target.value })}
          />
          <span style={lbl}>=</span>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 70 }}
            aria-label={`${where} flag value`}
            value={String(e.value ?? '')}
            onChange={(ev) => onChange({ ...e, value: parseFlagValue(ev.target.value) })}
          />
        </>
      )}
      {e.type === 'adjust_flag' && (
        <>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 110 }}
            aria-label={`${where} flag key`}
            placeholder="flag_key"
            value={String(e.key ?? '')}
            onChange={(ev) => onChange({ ...e, key: ev.target.value })}
          />
          <span style={lbl}>+=</span>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 70 }}
            type="number"
            aria-label={`${where} delta`}
            value={Number(e.delta ?? 0)}
            onChange={(ev) => onChange({ ...e, delta: Number(ev.target.value) })}
          />
        </>
      )}
      {(e.type === 'give_gold' || e.type === 'give_xp') && (
        <input
          className={styles.formInp}
          style={{ ...inp, width: 70 }}
          type="number"
          min={1}
          aria-label={`${where} amount`}
          value={Number(e.amount ?? 0)}
          onChange={(ev) => onChange({ ...e, amount: Number(ev.target.value) })}
        />
      )}
      {e.type === 'give_item' && (
        <TinySelect
          ariaLabel={`${where} item`}
          value={String(e.itemId ?? '')}
          options={pickers.items.map((i) => ({ value: i.id, label: i.name }))}
          onChange={(itemId) => onChange({ ...e, itemId })}
        />
      )}
      {(e.type === 'start_quest' || e.type === 'advance_quest') && (
        <TinySelect
          ariaLabel={`${where} quest`}
          value={String(e.questId ?? '')}
          options={pickers.quests.map((q) => ({ value: q.id, label: q.title }))}
          onChange={(questId) => onChange({ ...e, questId })}
        />
      )}
      {e.type === 'advance_quest' && (
        <input
          className={styles.formInp}
          style={{ ...inp, width: 130 }}
          aria-label={`${where} step id`}
          placeholder="step_id"
          value={String(e.stepId ?? '')}
          onChange={(ev) => onChange({ ...e, stepId: ev.target.value })}
        />
      )}
      {e.type === 'add_narrative' && (
        <input
          className={styles.formInp}
          style={{ ...inp, width: 260 }}
          aria-label={`${where} narrative text`}
          placeholder="flavor narrative shown when this fires"
          value={String(e.text ?? '')}
          onChange={(ev) => onChange({ ...e, text: ev.target.value })}
        />
      )}
      {e.type === 'modify_hp' && (
        <input
          className={styles.formInp}
          style={{ ...inp, width: 70 }}
          type="number"
          min={-100}
          max={100}
          aria-label={`${where} hp amount`}
          value={Number(e.amount ?? 0)}
          onChange={(ev) => onChange({ ...e, amount: Number(ev.target.value) })}
        />
      )}
      {e.type === 'consume_item' && (
        <TinySelect
          ariaLabel={`${where} consumed item`}
          value={String(e.itemId ?? '')}
          options={pickers.items.map((i) => ({ value: i.id, label: i.name }))}
          onChange={(itemId) => onChange({ ...e, itemId })}
        />
      )}
      {e.type === 'set_npc_attitude' && (
        <>
          <TinySelect
            ariaLabel={`${where} npc`}
            value={String(e.npcId ?? '')}
            options={pickers.npcIds.map((id) => ({ value: id, label: id }))}
            onChange={(npcId) => onChange({ ...e, npcId })}
          />
          <TinySelect
            ariaLabel={`${where} attitude`}
            value={String(e.attitude ?? 'indifferent')}
            options={['friendly', 'indifferent', 'hostile'].map((a) => ({
              value: a,
              label: a.toUpperCase(),
            }))}
            onChange={(attitude) => onChange({ ...e, attitude })}
          />
        </>
      )}
      <button
        className={styles.ghostBtn}
        style={tiny}
        aria-label={`Remove ${where}`}
        onClick={props.onRemove}
      >
        ✕
      </button>
    </div>
  );
}

export function EffectList(props: {
  effects: DialogueConsequence[];
  where: string;
  pickers: RowPickers;
  max?: number;
  onChange: (next: DialogueConsequence[]) => void;
}) {
  const { effects, where, pickers, onChange } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {effects.map((e, i) => (
        <EffectRow
          key={i}
          effect={e}
          where={`${where} effect ${i + 1}`}
          pickers={pickers}
          onChange={(next) => onChange(effects.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(effects.filter((_, j) => j !== i))}
        />
      ))}
      {effects.length < (props.max ?? 5) && (
        <TinySelect
          ariaLabel={`Add ${where} effect`}
          value=""
          placeholder="+ ADD EFFECT…"
          options={EFFECT_TYPES}
          onChange={(t) => t && onChange([...effects, defaultEffect(t, pickers)])}
        />
      )}
    </div>
  );
}

// ─── Condition rows UI ────────────────────────────────────────────────────────

function CondRowEditor(props: {
  row: CondRow;
  where: string;
  pickers: RowPickers;
  onChange: (r: CondRow) => void;
  onRemove: () => void;
}) {
  const { row, where, pickers, onChange } = props;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {row.kind === 'quest' && (
        <>
          <span style={lbl}>QUEST</span>
          <TinySelect
            ariaLabel={`${where} quest`}
            value={row.questId}
            options={pickers.quests.map((q) => ({ value: q.id, label: q.title }))}
            onChange={(questId) => onChange({ ...row, questId })}
          />
          <span style={lbl}>IS</span>
          <TinySelect
            ariaLabel={`${where} quest state`}
            value={row.state}
            options={[
              { value: 'not-started', label: 'NOT STARTED' },
              { value: 'active', label: 'ACTIVE' },
              { value: 'completed', label: 'COMPLETED' },
            ]}
            onChange={(state) => onChange({ ...row, state: state as CondRow & never })}
          />
        </>
      )}
      {row.kind === 'flag' && (
        <>
          <span style={lbl}>FLAG</span>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 110 }}
            aria-label={`${where} flag key`}
            placeholder="flag_key"
            value={row.key}
            onChange={(ev) => onChange({ ...row, key: ev.target.value })}
          />
          <span style={lbl}>=</span>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 70 }}
            aria-label={`${where} flag value`}
            value={row.value}
            onChange={(ev) => onChange({ ...row, value: ev.target.value })}
          />
        </>
      )}
      {row.kind === 'faction' && (
        <>
          <span style={lbl}>FACTION</span>
          <TinySelect
            ariaLabel={`${where} faction`}
            value={row.factionId}
            options={pickers.factions.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(factionId) => onChange({ ...row, factionId })}
          />
          <span style={lbl}>AT LEAST</span>
          <TinySelect
            ariaLabel={`${where} tier`}
            value={row.tier}
            options={TIERS.map((t) => ({ value: t, label: t.toUpperCase() }))}
            onChange={(tier) => onChange({ ...row, tier: tier as (typeof TIERS)[number] })}
          />
        </>
      )}
      {row.kind === 'item' && (
        <>
          <span style={lbl}>PARTY HAS</span>
          <TinySelect
            ariaLabel={`${where} item`}
            value={row.itemId}
            options={pickers.items.map((i) => ({ value: i.id, label: i.name }))}
            onChange={(itemId) => onChange({ ...row, itemId })}
          />
        </>
      )}
      {row.kind === 'visited-room' && (
        <>
          <span style={lbl}>REACHED ROOM</span>
          <TinySelect
            ariaLabel={`${where} room`}
            value={row.roomId}
            options={(pickers.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))}
            onChange={(roomId) => onChange({ ...row, roomId })}
          />
        </>
      )}
      {row.kind === 'in-town' && (
        <>
          <span style={lbl}>IN TOWN</span>
          <TinySelect
            ariaLabel={`${where} town`}
            value={row.townId}
            options={(pickers.towns ?? []).map((t) => ({ value: t.id, label: t.name }))}
            onChange={(townId) => onChange({ ...row, townId })}
          />
        </>
      )}
      {row.kind === 'kill' && (
        <>
          <span style={lbl}>KILLED</span>
          <input
            className={styles.formInp}
            style={{ ...inp, width: 140 }}
            aria-label={`${where} enemy id`}
            placeholder="roomId#0 / npc:id"
            value={row.enemyId}
            onChange={(ev) => onChange({ ...row, enemyId: ev.target.value })}
          />
        </>
      )}
      <button
        className={styles.ghostBtn}
        style={tiny}
        aria-label={`Remove ${where}`}
        onClick={props.onRemove}
      >
        ✕
      </button>
    </div>
  );
}

function defaultCondRow(kind: string, pickers: RowPickers): CondRow {
  switch (kind) {
    case 'quest':
      return { kind: 'quest', questId: pickers.quests[0]?.id ?? '', state: 'active' };
    case 'flag':
      return { kind: 'flag', key: '', value: 'true' };
    case 'faction':
      return { kind: 'faction', factionId: pickers.factions[0]?.id ?? '', tier: 'friendly' };
    case 'visited-room':
      return { kind: 'visited-room', roomId: pickers.rooms?.[0]?.id ?? '' };
    case 'in-town':
      return { kind: 'in-town', townId: pickers.towns?.[0]?.id ?? '' };
    case 'kill':
      return { kind: 'kill', enemyId: '' };
    default:
      return { kind: 'item', itemId: pickers.items[0]?.id ?? '' };
  }
}

/**
 * The condition editor for ONE stored condition value. `value` is the raw
 * condition JSON (or undefined); edits compile back through onChange.
 * Renders the locked "custom condition" chip when the JSON isn't
 * template-expressible.
 */
export function ConditionRowsEditor(props: {
  value: unknown;
  where: string;
  pickers: RowPickers;
  onChange: (condition: unknown) => void;
}) {
  const { value, where, pickers, onChange } = props;
  const rows = parseCondition(value);
  if (rows === null) {
    return (
      <p style={{ ...lbl, fontStyle: 'italic' }}>
        custom condition (edit via the section JSON){' '}
        <button
          className={styles.ghostBtn}
          style={tiny}
          aria-label={`Clear ${where} condition`}
          onClick={() => onChange(undefined)}
        >
          CLEAR
        </button>
      </p>
    );
  }
  const condKinds = [
    ...(pickers.quests.length > 0 ? [{ value: 'quest', label: 'QUEST STATE' }] : []),
    { value: 'flag', label: 'FLAG' },
    ...(pickers.factions.length > 0 ? [{ value: 'faction', label: 'FACTION TIER' }] : []),
    { value: 'item', label: 'PARTY HAS ITEM' },
    ...(pickers.rooms?.length ? [{ value: 'visited-room', label: 'REACHED ROOM' }] : []),
    ...(pickers.towns?.length ? [{ value: 'in-town', label: 'IN TOWN' }] : []),
    ...(pickers.rooms ? [{ value: 'kill', label: 'KILLED ENEMY' }] : []),
  ];
  const update = (next: CondRow[]) => onChange(compileCondition(next));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((row, i) => (
        <CondRowEditor
          key={i}
          row={row}
          where={`${where} condition ${i + 1}`}
          pickers={pickers}
          onChange={(next) => update(rows.map((x, j) => (j === i ? next : x)))}
          onRemove={() => update(rows.filter((_, j) => j !== i))}
        />
      ))}
      {rows.length < 8 && (
        <TinySelect
          ariaLabel={`Add ${where} condition`}
          value=""
          placeholder="+ ADD CONDITION…"
          options={condKinds}
          onChange={(k) => k && update([...rows, defaultCondRow(k, pickers)])}
        />
      )}
    </div>
  );
}
