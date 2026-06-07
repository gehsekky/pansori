import React from 'react';
import styles from '../styles.module.css';

// ─── Dialogue tree editor ─────────────────────────────────────────────────────
//
// Structured editor for one NPC's `responses` tree (the campaign rooms
// dialogue shape): nested options with per-node reply, ONCE flag, visibility
// CONDITIONS, EFFECTS (the safe consequence subset) and an optional skill
// CHECK. Conditions and effects edit through template rows that compile to
// the json-rules-engine / GameConsequence JSON the backend validates — a
// hand-authored condition the templates can't express is preserved verbatim
// and shown as a locked chip (edit it via the ROOMS JSON).

export interface DialogueConsequence {
  type: string;
  [key: string]: unknown;
}

export interface DialogueCheck {
  skill: string;
  dc: number;
  successReply: string;
  failReply: string;
  onSuccess?: DialogueConsequence[];
  onFail?: DialogueConsequence[];
  [key: string]: unknown;
}

export interface DialogueNode {
  label: string;
  reply?: string;
  condition?: unknown;
  once?: boolean;
  check?: DialogueCheck;
  consequences?: DialogueConsequence[];
  responses?: DialogueNode[];
  [key: string]: unknown;
}

export interface DialogueEditorProps {
  value: DialogueNode[];
  onChange: (next: DialogueNode[]) => void;
  items: Array<{ id: string; name: string }>;
  quests: Array<{ id: string; title: string }>;
  factions: Array<{ id: string; name: string }>;
  npcIds: string[];
}

// ─── Condition rows ↔ condition JSON ─────────────────────────────────────────

const TIERS = ['hostile', 'unfriendly', 'neutral', 'friendly', 'exalted'] as const;

export type CondRow =
  | { kind: 'quest'; questId: string; state: 'active' | 'completed' | 'not-started' }
  | { kind: 'flag'; key: string; value: string }
  | { kind: 'faction'; factionId: string; tier: (typeof TIERS)[number] }
  | { kind: 'item'; itemId: string };

// '' / 'true' / 'false' / numerics parse to their natural JSON type.
function parseFlagValue(v: string): boolean | string | number {
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
  { value: 'give_gold', label: 'GIVE GOLD' },
  { value: 'give_item', label: 'GIVE ITEM' },
  { value: 'give_xp', label: 'GIVE XP' },
  { value: 'start_quest', label: 'START QUEST' },
  { value: 'set_npc_attitude', label: 'SET ATTITUDE' },
];

function defaultEffect(type: string, props: DialogueEditorProps): DialogueConsequence {
  switch (type) {
    case 'set_flag':
      return { type, key: '', value: true };
    case 'give_gold':
    case 'give_xp':
      return { type, amount: 10 };
    case 'give_item':
      return { type, itemId: props.items[0]?.id ?? '' };
    case 'start_quest':
      return { type, questId: props.quests[0]?.id ?? '' };
    default:
      return { type, npcId: props.npcIds[0] ?? '', attitude: 'indifferent' };
  }
}

function EffectRow(props: {
  effect: DialogueConsequence;
  where: string;
  ed: DialogueEditorProps;
  onChange: (e: DialogueConsequence) => void;
  onRemove: () => void;
}) {
  const { effect: e, where, ed, onChange } = props;
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
          options={ed.items.map((i) => ({ value: i.id, label: i.name }))}
          onChange={(itemId) => onChange({ ...e, itemId })}
        />
      )}
      {e.type === 'start_quest' && (
        <TinySelect
          ariaLabel={`${where} quest`}
          value={String(e.questId ?? '')}
          options={ed.quests.map((q) => ({ value: q.id, label: q.title }))}
          onChange={(questId) => onChange({ ...e, questId })}
        />
      )}
      {e.type === 'set_npc_attitude' && (
        <>
          <TinySelect
            ariaLabel={`${where} npc`}
            value={String(e.npcId ?? '')}
            options={ed.npcIds.map((id) => ({ value: id, label: id }))}
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

function EffectList(props: {
  effects: DialogueConsequence[];
  where: string;
  ed: DialogueEditorProps;
  onChange: (next: DialogueConsequence[]) => void;
}) {
  const { effects, where, ed, onChange } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {effects.map((e, i) => (
        <EffectRow
          key={i}
          effect={e}
          where={`${where} effect ${i + 1}`}
          ed={ed}
          onChange={(next) => onChange(effects.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(effects.filter((_, j) => j !== i))}
        />
      ))}
      {effects.length < 5 && (
        <TinySelect
          ariaLabel={`Add ${where} effect`}
          value=""
          placeholder="+ ADD EFFECT…"
          options={EFFECT_TYPES}
          onChange={(t) => t && onChange([...effects, defaultEffect(t, ed)])}
        />
      )}
    </div>
  );
}

// ─── Condition rows UI ────────────────────────────────────────────────────────

function CondRowEditor(props: {
  row: CondRow;
  where: string;
  ed: DialogueEditorProps;
  onChange: (r: CondRow) => void;
  onRemove: () => void;
}) {
  const { row, where, ed, onChange } = props;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {row.kind === 'quest' && (
        <>
          <span style={lbl}>QUEST</span>
          <TinySelect
            ariaLabel={`${where} quest`}
            value={row.questId}
            options={ed.quests.map((q) => ({ value: q.id, label: q.title }))}
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
            options={ed.factions.map((f) => ({ value: f.id, label: f.name }))}
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
            options={ed.items.map((i) => ({ value: i.id, label: i.name }))}
            onChange={(itemId) => onChange({ ...row, itemId })}
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

function defaultCondRow(kind: string, ed: DialogueEditorProps): CondRow {
  switch (kind) {
    case 'quest':
      return { kind: 'quest', questId: ed.quests[0]?.id ?? '', state: 'active' };
    case 'flag':
      return { kind: 'flag', key: '', value: 'true' };
    case 'faction':
      return { kind: 'faction', factionId: ed.factions[0]?.id ?? '', tier: 'friendly' };
    default:
      return { kind: 'item', itemId: ed.items[0]?.id ?? '' };
  }
}

function ConditionBlock(props: {
  node: DialogueNode;
  where: string;
  ed: DialogueEditorProps;
  onChange: (condition: unknown) => void;
}) {
  const { node, where, ed, onChange } = props;
  const rows = parseCondition(node.condition);
  if (rows === null) {
    // Hand-authored shape the templates can't express — preserved verbatim.
    return (
      <p style={{ ...lbl, fontStyle: 'italic' }}>
        custom condition (edit via the ROOMS JSON){' '}
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
    { value: 'quest', label: 'QUEST STATE' },
    { value: 'flag', label: 'FLAG' },
    ...(ed.factions.length > 0 ? [{ value: 'faction', label: 'FACTION TIER' }] : []),
    { value: 'item', label: 'PARTY HAS ITEM' },
  ];
  const update = (next: CondRow[]) => onChange(compileCondition(next));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((row, i) => (
        <CondRowEditor
          key={i}
          row={row}
          where={`${where} condition ${i + 1}`}
          ed={ed}
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
          onChange={(k) => k && update([...rows, defaultCondRow(k, ed)])}
        />
      )}
    </div>
  );
}

// ─── Node editor (recursive) ──────────────────────────────────────────────────

const SKILLS = ['persuasion', 'deception', 'intimidation'];

function NodeEditor(props: {
  node: DialogueNode;
  where: string;
  depth: number;
  ed: DialogueEditorProps;
  onChange: (n: DialogueNode) => void;
  onRemove: () => void;
}) {
  const { node, where, depth, ed, onChange } = props;
  const set = (patch: Partial<DialogueNode>) => {
    const next = { ...node, ...patch };
    // undefined-valued keys are pruned so the saved JSON stays minimal.
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    onChange(next);
  };
  return (
    <div
      style={{
        borderLeft: '2px solid var(--t-separator)',
        paddingLeft: 10,
        marginLeft: depth > 0 ? 12 : 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingTop: 6,
        paddingBottom: 6,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 160px' }}>
          <label className={styles.formLbl} htmlFor={`${where}-label`}>
            PLAYER LINE
          </label>
          <input
            id={`${where}-label`}
            className={styles.formInp}
            style={inp}
            value={node.label}
            onChange={(ev) => set({ label: ev.target.value })}
          />
        </div>
        {!node.check && (
          <div style={{ flex: '3 1 200px' }}>
            <label className={styles.formLbl} htmlFor={`${where}-reply`}>
              NPC REPLY
            </label>
            <input
              id={`${where}-reply`}
              className={styles.formInp}
              style={inp}
              placeholder="(nods)"
              value={node.reply ?? ''}
              onChange={(ev) => set({ reply: ev.target.value || undefined })}
            />
          </div>
        )}
        <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 8 }}>
          <input
            type="checkbox"
            aria-label={`${where} once`}
            checked={!!node.once}
            onChange={(ev) => set({ once: ev.target.checked || undefined })}
          />
          ONCE
        </label>
        <div style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
          <button
            className={styles.ghostBtn}
            style={tiny}
            aria-label={`${where} toggle check`}
            onClick={() =>
              set({
                check: node.check
                  ? undefined
                  : { skill: 'persuasion', dc: 12, successReply: '', failReply: '' },
                // A check replaces the plain reply/effects (schema rule).
                ...(node.check ? {} : { reply: undefined, consequences: undefined }),
              })
            }
          >
            {node.check ? '− CHECK' : '+ CHECK'}
          </button>
          {(node.responses?.length ?? 0) < 8 && depth < 4 && (
            <button
              className={styles.ghostBtn}
              style={tiny}
              aria-label={`${where} add nested option`}
              onClick={() => set({ responses: [...(node.responses ?? []), { label: '' }] })}
            >
              + NESTED
            </button>
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
      </div>

      {node.check && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            paddingLeft: 6,
          }}
        >
          <div>
            <label className={styles.formLbl} htmlFor={`${where}-check-skill`}>
              SKILL
            </label>
            <select
              id={`${where}-check-skill`}
              className={styles.formInp}
              style={{ ...inp, cursor: 'pointer' }}
              value={node.check.skill}
              onChange={(ev) => set({ check: { ...node.check!, skill: ev.target.value } })}
            >
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 64 }}>
            <label className={styles.formLbl} htmlFor={`${where}-check-dc`}>
              DC
            </label>
            <input
              id={`${where}-check-dc`}
              className={styles.formInp}
              style={inp}
              type="number"
              min={1}
              max={30}
              value={node.check.dc}
              onChange={(ev) =>
                set({ check: { ...node.check!, dc: Number(ev.target.value) || 1 } })
              }
            />
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <label className={styles.formLbl} htmlFor={`${where}-check-success`}>
              ON SUCCESS, NPC SAYS
            </label>
            <input
              id={`${where}-check-success`}
              className={styles.formInp}
              style={inp}
              value={node.check.successReply}
              onChange={(ev) => set({ check: { ...node.check!, successReply: ev.target.value } })}
            />
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <label className={styles.formLbl} htmlFor={`${where}-check-fail`}>
              ON FAIL, NPC SAYS
            </label>
            <input
              id={`${where}-check-fail`}
              className={styles.formInp}
              style={inp}
              value={node.check.failReply}
              onChange={(ev) => set({ check: { ...node.check!, failReply: ev.target.value } })}
            />
          </div>
          <div style={{ flexBasis: '100%', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <p style={lbl}>SUCCESS EFFECTS</p>
              <EffectList
                effects={node.check.onSuccess ?? []}
                where={`${where} success`}
                ed={ed}
                onChange={(onSuccess) =>
                  set({
                    check: {
                      ...node.check!,
                      onSuccess: onSuccess.length ? onSuccess : undefined,
                    },
                  })
                }
              />
            </div>
            <div>
              <p style={lbl}>FAIL EFFECTS</p>
              <EffectList
                effects={node.check.onFail ?? []}
                where={`${where} fail`}
                ed={ed}
                onChange={(onFail) =>
                  set({ check: { ...node.check!, onFail: onFail.length ? onFail : undefined } })
                }
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingLeft: 6 }}>
        <div>
          <p style={lbl}>SHOW ONLY IF (all must hold)</p>
          <ConditionBlock
            node={node}
            where={where}
            ed={ed}
            onChange={(condition) => set({ condition })}
          />
        </div>
        {!node.check && (
          <div>
            <p style={lbl}>EFFECTS</p>
            <EffectList
              effects={node.consequences ?? []}
              where={where}
              ed={ed}
              onChange={(consequences) =>
                set({ consequences: consequences.length ? consequences : undefined })
              }
            />
          </div>
        )}
      </div>

      {(node.responses ?? []).map((child, i) => (
        <NodeEditor
          key={i}
          node={child}
          where={`${where}.${i + 1}`}
          depth={depth + 1}
          ed={ed}
          onChange={(next) =>
            set({ responses: node.responses!.map((x, j) => (j === i ? next : x)) })
          }
          onRemove={() => {
            const rest = node.responses!.filter((_, j) => j !== i);
            set({ responses: rest.length ? rest : undefined });
          }}
        />
      ))}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function DialogueEditor(props: DialogueEditorProps) {
  const { value, onChange } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {value.length === 0 && (
        <p style={{ ...lbl, fontStyle: 'italic' }}>
          No dialogue yet — the NPC only speaks its greeting.
        </p>
      )}
      {value.map((node, i) => (
        <NodeEditor
          key={i}
          node={node}
          where={`option ${i + 1}`}
          depth={0}
          ed={props}
          onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      {value.length < 8 && (
        <button
          className={styles.ghostBtn}
          style={{ ...tiny, alignSelf: 'flex-start' }}
          data-testid="add-dialogue-option"
          onClick={() => onChange([...value, { label: '' }])}
        >
          + ADD OPTION
        </button>
      )}
    </div>
  );
}
