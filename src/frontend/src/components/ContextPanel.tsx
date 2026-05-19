import { type ReactNode, useEffect, useRef, useState } from 'react';
import styles from '../styles.module.css';

// Right-rail tabbed container. Holds panels that don't need to be permanently
// on-screen (room art, quests, factions, combat log, mission log) and lets
// the player switch between them with one click.
//
// WAI-ARIA tablist pattern:
//   - The tabs row is role="tablist"
//   - Each tab button is role="tab" with aria-selected + aria-controls
//   - Each panel is role="tabpanel" with aria-labelledby
//   - Left/Right arrows move focus between tabs; Home/End jump to ends
//   - Enter/Space activates the focused tab (default button behavior)
//
// Tab visibility is the caller's responsibility — pass only the tabs that
// should be shown right now (e.g. omit "Quests" when there's no campaign).
// When the currently-selected tab disappears between renders, the panel
// falls back to the first remaining tab.

export interface ContextTab {
  id: string;
  label: string;
  // Optional render of the panel body. Receives no args; close over your
  // state in the caller.
  render: () => ReactNode;
}

interface Props {
  tabs: ContextTab[];
  // Initial tab id on first render. Ignored on later renders so the user's
  // manual selection isn't overridden.
  defaultTabId?: string;
}

function ContextPanel({ tabs, defaultTabId }: Props) {
  const [activeId, setActiveId] = useState<string>(defaultTabId ?? tabs[0]?.id ?? '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // If the active tab is removed (e.g. combat ended, combat-log tab unmounted),
  // fall back to the first available tab so we never render an empty panel.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeId) && tabs.length > 0) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  if (tabs.length === 0) return null;
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (idx < 0) return;
    let nextIdx: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        nextIdx = (idx - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
        nextIdx = (idx + 1) % tabs.length;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = tabs.length - 1;
        break;
    }
    if (nextIdx !== null) {
      e.preventDefault();
      const next = tabs[nextIdx];
      setActiveId(next.id);
      // Move focus to the newly-selected tab so SR users hear it
      tabRefs.current[next.id]?.focus();
    }
  }

  return (
    <section className={styles.campaignPanel} data-testid="context-panel" aria-label="Game context">
      <div
        role="tablist"
        className={styles.campaignTabs}
        aria-label="Context tabs"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              role="tab"
              id={`ctx-tab-${tab.id}`}
              aria-controls={`ctx-panel-${tab.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`${styles.campaignTab} ${active ? styles.campaignTabActive : ''}`}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`ctx-panel-${activeTab.id}`}
        aria-labelledby={`ctx-tab-${activeTab.id}`}
        className={styles.campaignBody}
      >
        {activeTab.render()}
      </div>
    </section>
  );
}

export default ContextPanel;
