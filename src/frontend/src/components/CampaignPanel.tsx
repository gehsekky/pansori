import type { CampaignMeta, Faction, GameState, Quest, QuestStatus } from '../types';
import styles from '../styles.module.css';
import { useState } from 'react';

type Tab = 'quests' | 'factions';

interface Props {
  state: GameState;
  meta: CampaignMeta;
}

interface ViewProps {
  state: GameState;
  meta: CampaignMeta;
}

function attitudeTier(rep: number, f: Faction): { tier: string; color: string } {
  const t = f.thresholds;
  if (rep >= t.exalted) return { tier: 'Exalted', color: 'var(--t-primary)' };
  if (rep >= t.friendly) return { tier: 'Friendly', color: 'var(--t-hp-high)' };
  if (rep >= t.neutral) return { tier: 'Neutral', color: 'var(--t-mid)' };
  if (rep >= t.unfriendly) return { tier: 'Unfriendly', color: 'var(--t-hp-mid)' };
  return { tier: 'Hostile', color: 'var(--t-hp-low)' };
}

function statusBadge(status: QuestStatus): { label: string; color: string } {
  switch (status) {
    case 'active':
      return { label: 'ACTIVE', color: 'var(--t-primary)' };
    case 'completed':
      return { label: 'DONE', color: 'var(--t-hp-high)' };
    case 'failed':
      return { label: 'FAILED', color: 'var(--t-hp-low)' };
    case 'available':
    default:
      return { label: 'AVAILABLE', color: 'var(--t-mid)' };
  }
}

function QuestRow({
  quest,
  status,
  completedSteps,
}: {
  quest: Quest;
  status: QuestStatus;
  completedSteps: string[];
}) {
  const badge = statusBadge(status);
  const currentStepIdx = quest.steps.findIndex((s) => !completedSteps.includes(s.id));
  return (
    <div className={styles.questRow}>
      <div className={styles.questHead}>
        <span className={styles.questTitle}>{quest.title}</span>
        <span className={styles.questStatus} style={{ color: badge.color }}>
          {badge.label}
        </span>
      </div>
      <div className={styles.questDesc}>{quest.desc}</div>
      {status === 'active' && currentStepIdx >= 0 && (
        <ol className={styles.questSteps}>
          {quest.steps.map((step, i) => {
            const done = completedSteps.includes(step.id);
            const current = !done && i === currentStepIdx;
            return (
              <li
                key={step.id}
                style={{
                  color: done ? 'var(--t-hp-high)' : current ? 'var(--t-primary)' : 'var(--t-dim)',
                  textDecoration: done ? 'line-through' : 'none',
                  fontWeight: current ? 600 : 400,
                }}
              >
                {done ? '✓ ' : current ? '▸ ' : '  '}
                {step.desc}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// QuestsView and FactionsView are the bodies of each campaign tab, exported
// so ContextPanel can render them as tab content without dragging in
// CampaignPanel's own tab switcher.

function sortedQuestsForView(state: GameState, meta: CampaignMeta) {
  const progressById = new Map((state.quest_progress ?? []).map((p) => [p.questId, p] as const));
  const order: Record<QuestStatus, number> = {
    active: 0,
    available: 1,
    completed: 2,
    failed: 3,
  };
  // Only show quests the player has actually discovered — those with a
  // progress entry (the opening quest starts active; others appear once their
  // first step fires). Undiscovered quests stay hidden from the log.
  const sorted = meta.quests
    .filter((q) => progressById.has(q.id))
    .sort((a, b) => {
      const sa = progressById.get(a.id)?.status ?? 'available';
      const sb = progressById.get(b.id)?.status ?? 'available';
      return order[sa] - order[sb];
    });
  return { sorted, progressById };
}

export function QuestsView({ state, meta }: ViewProps) {
  const { sorted, progressById } = sortedQuestsForView(state, meta);
  if (sorted.length === 0) {
    return (
      <p className={styles.campaignEmpty}>
        No quests yet — explore the world and talk to people to find them.
      </p>
    );
  }
  return (
    <>
      {sorted.map((q) => {
        const prog = progressById.get(q.id);
        return (
          <QuestRow
            key={q.id}
            quest={q}
            status={prog?.status ?? 'available'}
            completedSteps={prog?.completedSteps ?? []}
          />
        );
      })}
    </>
  );
}

export function FactionsView({ state, meta }: ViewProps) {
  if (meta.factions.length === 0) {
    return <p className={styles.campaignEmpty}>No factions in this campaign.</p>;
  }
  return (
    <>
      {meta.factions.map((f) => {
        const rep = state.faction_rep?.[f.id] ?? 0;
        const { tier, color } = attitudeTier(rep, f);
        return (
          <div key={f.id} className={styles.factionRow}>
            <div className={styles.factionHead}>
              <span className={styles.factionName}>{f.name}</span>
              <span style={{ color }} className={styles.factionTier}>
                {tier} ({rep >= 0 ? '+' : ''}
                {rep})
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function CampaignPanel({ state, meta }: Props) {
  const [tab, setTab] = useState<Tab>('quests');

  if (!meta || (meta.quests.length === 0 && meta.factions.length === 0)) return null;

  const progressById = new Map((state.quest_progress ?? []).map((p) => [p.questId, p] as const));

  // Categorize quests: active first, then available, then completed/failed
  const sortedQuests = [...meta.quests].sort((a, b) => {
    const sa = progressById.get(a.id)?.status ?? 'available';
    const sb = progressById.get(b.id)?.status ?? 'available';
    const order: Record<QuestStatus, number> = {
      active: 0,
      available: 1,
      completed: 2,
      failed: 3,
    };
    return order[sa] - order[sb];
  });

  return (
    <div className={styles.campaignPanel}>
      <div className={styles.campaignTabs}>
        <button
          className={`${styles.campaignTab} ${tab === 'quests' ? styles.campaignTabActive : ''}`}
          onClick={() => setTab('quests')}
        >
          QUESTS ({meta.quests.length})
        </button>
        <button
          className={`${styles.campaignTab} ${tab === 'factions' ? styles.campaignTabActive : ''}`}
          onClick={() => setTab('factions')}
        >
          FACTIONS ({meta.factions.length})
        </button>
      </div>

      {tab === 'quests' && (
        <div className={styles.campaignBody}>
          {sortedQuests.length === 0 ? (
            <p className={styles.campaignEmpty}>No quests defined for this campaign.</p>
          ) : (
            sortedQuests.map((q) => {
              const prog = progressById.get(q.id);
              return (
                <QuestRow
                  key={q.id}
                  quest={q}
                  status={prog?.status ?? 'available'}
                  completedSteps={prog?.completedSteps ?? []}
                />
              );
            })
          )}
        </div>
      )}

      {tab === 'factions' && (
        <div className={styles.campaignBody}>
          {meta.factions.length === 0 ? (
            <p className={styles.campaignEmpty}>No factions in this campaign.</p>
          ) : (
            meta.factions.map((f) => {
              const rep = state.faction_rep?.[f.id] ?? 0;
              const { tier, color } = attitudeTier(rep, f);
              return (
                <div key={f.id} className={styles.factionRow}>
                  <div className={styles.factionHead}>
                    <span className={styles.factionName}>{f.name}</span>
                    <span style={{ color }} className={styles.factionTier}>
                      {tier} ({rep >= 0 ? '+' : ''}
                      {rep})
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default CampaignPanel;
