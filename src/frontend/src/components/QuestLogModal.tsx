// The QUEST LOG — the full journal, opened from the header (J), the way the
// inventory modal is. Shows every DISCOVERED quest grouped by act, with a
// HIDE-FINISHED toggle; the right-rail tracker shows only open quests, so this
// is where completed and failed ones live on. Composes the shared Dialog
// primitive and CampaignPanel's QuestRow so a quest renders identically in
// both surfaces.

import type { CampaignMeta, GameState, Quest, QuestStatus } from '../types';
import { QuestRow, sortedQuestsForView } from './CampaignPanel.tsx';
import Dialog from './Dialog.tsx';
import styles from '../styles.module.css';
import { useState } from 'react';

interface Props {
  state: GameState;
  meta: CampaignMeta;
  onClose: () => void;
}

const isFinished = (s: QuestStatus) => s === 'completed' || s === 'failed';

function QuestLogModal({ state, meta, onClose }: Props) {
  const [hideFinished, setHideFinished] = useState(false);
  const { sorted, progressById } = sortedQuestsForView(state, meta);
  const statusOf = (q: Quest): QuestStatus => progressById.get(q.id)?.status ?? 'available';
  const shown = hideFinished ? sorted.filter((q) => !isFinished(statusOf(q))) : sorted;

  // Group by act, in the campaign's act order; quests whose act isn't in the
  // meta (older payloads, missing actId) gather under a final OTHER group.
  const acts = meta.acts ?? [];
  const groups: Array<{ id: string; name: string; quests: Quest[] }> = [
    ...acts.map((a) => ({ id: a.id, name: a.name, quests: [] as Quest[] })),
    { id: '__other__', name: 'Other', quests: [] },
  ];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const groupIdOf = (q: Quest) => (q.actId && byId.has(q.actId) ? q.actId : '__other__');
  for (const q of shown) {
    byId.get(groupIdOf(q))!.quests.push(q);
  }
  const visibleGroups = groups.filter((g) => g.quests.length > 0);
  const finishedCount = sorted.filter((q) => isFinished(statusOf(q))).length;

  return (
    <Dialog title="Quest Log" onClose={onClose} width="720px" testId="quest-log-modal">
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.75rem',
          color: 'var(--t-mid)',
          cursor: 'pointer',
          marginBottom: '0.5rem',
        }}
      >
        <input
          type="checkbox"
          checked={hideFinished}
          onChange={(e) => setHideFinished(e.target.checked)}
          data-testid="quest-log-hide-finished"
        />
        HIDE FINISHED ({finishedCount})
      </label>
      {sorted.length === 0 ? (
        <p className={styles.campaignEmpty}>
          No quests yet — explore the world and talk to people to find them.
        </p>
      ) : visibleGroups.length === 0 ? (
        <p className={styles.campaignEmpty}>Everything still to do — nothing finished yet.</p>
      ) : (
        visibleGroups.map((g) => {
          const total = sorted.filter((q) => groupIdOf(q) === g.id).length;
          const done = sorted.filter(
            (q) => groupIdOf(q) === g.id && isFinished(statusOf(q))
          ).length;
          return (
            <div key={g.id} style={{ marginTop: '0.9rem' }} data-testid={`quest-act-${g.id}`}>
              <h3
                style={{
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  color: 'var(--t-dim)',
                  margin: '0 0 0.4rem',
                  borderBottom: '1px solid var(--t-separator)',
                  paddingBottom: 4,
                }}
              >
                {g.name.toUpperCase()}{' '}
                <span style={{ float: 'right' }}>
                  {done}/{total} DONE
                </span>
              </h3>
              {g.quests.map((q) => (
                <QuestRow
                  key={q.id}
                  quest={q}
                  status={statusOf(q)}
                  completedSteps={progressById.get(q.id)?.completedSteps ?? []}
                />
              ))}
            </div>
          );
        })
      )}
    </Dialog>
  );
}

export default QuestLogModal;
