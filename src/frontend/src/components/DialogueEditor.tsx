import {
  ConditionRowsEditor,
  type DialogueConsequence,
  EffectList,
  type RowPickers,
} from './conditionEffectRows.tsx';
import React from 'react';
import styles from '../styles.module.css';

// ─── Dialogue tree editor ─────────────────────────────────────────────────────
//
// Structured editor for one NPC's `responses` tree (the campaign rooms
// dialogue shape): nested options with per-node reply, ONCE flag, visibility
// CONDITIONS, EFFECTS (the safe consequence subset) and an optional skill
// CHECK. Conditions and effects edit through the shared template rows
// (conditionEffectRows) that compile to the json-rules-engine /
// GameConsequence JSON the backend validates — a hand-authored condition the
// templates can't express is preserved verbatim and shown as a locked chip
// (edit it via the ROOMS JSON).

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
  id?: string;
  label: string;
  say?: string;
  goto?: string;
  reply?: string;
  condition?: unknown;
  once?: boolean;
  check?: DialogueCheck;
  consequences?: DialogueConsequence[];
  responses?: DialogueNode[];
  [key: string]: unknown;
}

// Every node id in a tree (goto targets) — minted server-side, so only nodes
// that have been saved once are addressable.
function collectNodeIds(nodes: DialogueNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.id) into.push(n.id);
    if (n.responses) collectNodeIds(n.responses, into);
  }
  return into;
}

export interface DialogueEditorProps {
  value: DialogueNode[];
  onChange: (next: DialogueNode[]) => void;
  items: Array<{ id: string; name: string }>;
  quests: Array<{ id: string; title: string }>;
  factions: Array<{ id: string; name: string }>;
  npcIds: string[];
}

const lbl: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--t-dim)' };
const tiny: React.CSSProperties = { padding: '0.2rem 0.45rem', fontSize: '0.7rem' };
const inp: React.CSSProperties = { fontSize: '0.75rem', padding: '0.25rem 0.4rem' };

const SKILLS = ['persuasion', 'deception', 'intimidation'];

function NodeEditor(props: {
  node: DialogueNode;
  where: string;
  depth: number;
  pickers: RowPickers;
  nodeIds: string[];
  onChange: (n: DialogueNode) => void;
  onRemove: () => void;
}) {
  const { node, where, depth, pickers, nodeIds, onChange } = props;
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
        <div style={{ flex: '2 1 140px' }}>
          <label className={styles.formLbl} htmlFor={`${where}-label`}>
            MENU LABEL
          </label>
          <input
            id={`${where}-label`}
            className={styles.formInp}
            style={inp}
            value={node.label}
            onChange={(ev) => set({ label: ev.target.value })}
          />
        </div>
        <div style={{ flex: '2 1 140px' }}>
          <label className={styles.formLbl} htmlFor={`${where}-say`}>
            SPOKEN LINE
          </label>
          <input
            id={`${where}-say`}
            aria-label={`${where} say`}
            className={styles.formInp}
            style={inp}
            placeholder="(speaks the label)"
            value={node.say ?? ''}
            onChange={(ev) => set({ say: ev.target.value || undefined })}
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
        <div>
          <label className={styles.formLbl} htmlFor={`${where}-goto`}>
            GOTO
          </label>
          <select
            id={`${where}-goto`}
            aria-label={`${where} goto`}
            className={styles.formInp}
            style={{ ...inp, cursor: 'pointer', maxWidth: 130 }}
            value={node.goto ?? ''}
            onChange={(ev) => set({ goto: ev.target.value || undefined })}
          >
            <option value="">— descend —</option>
            {nodeIds
              .filter((id) => id !== node.id)
              .map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            {node.goto && !nodeIds.includes(node.goto) && (
              <option value={node.goto}>{node.goto} (unknown)</option>
            )}
          </select>
        </div>
        {node.id && <span style={{ ...lbl, paddingBottom: 8 }}>id: {node.id}</span>}
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
                pickers={pickers}
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
                pickers={pickers}
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
          <ConditionRowsEditor
            value={node.condition}
            where={where}
            pickers={pickers}
            onChange={(condition) => set({ condition })}
          />
        </div>
        {!node.check && (
          <div>
            <p style={lbl}>EFFECTS</p>
            <EffectList
              effects={node.consequences ?? []}
              where={where}
              pickers={pickers}
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
          pickers={pickers}
          nodeIds={nodeIds}
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

export default function DialogueEditor(props: DialogueEditorProps) {
  const { value, onChange } = props;
  const pickers: RowPickers = {
    items: props.items,
    quests: props.quests,
    factions: props.factions,
    npcIds: props.npcIds,
  };
  const nodeIds = collectNodeIds(value);
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
          pickers={pickers}
          nodeIds={nodeIds}
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
