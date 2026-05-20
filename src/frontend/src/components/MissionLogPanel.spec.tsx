import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MissionLogPanel from './MissionLogPanel';

// History stream is interleaved [user, assistant, user, assistant, ...]
// The panel renders every other entry starting at index 0 (the engine's
// assistant output) and the copy export covers the FULL chronological
// stream with a metadata header.

describe('MissionLogPanel', () => {
  it('renders the most recent 20 assistant entries with the > prefix', () => {
    const history: Array<{ content: string }> = [];
    for (let i = 0; i < 5; i++) {
      history.push({ content: `assistant ${i}` });
      history.push({ content: `user ${i}` });
    }
    render(<MissionLogPanel history={history} />);
    expect(screen.getByText(/assistant 0/)).toBeDefined();
    expect(screen.getByText(/assistant 4/)).toBeDefined();
    // User-side turns are filtered out.
    expect(screen.queryByText(/user 0/)).toBeNull();
  });

  it('shows the empty state when history is empty', () => {
    render(<MissionLogPanel history={[]} />);
    expect(screen.getByText(/No actions taken yet/i)).toBeDefined();
  });

  it('copies the FULL chronological log (with metadata header) to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const history = [
      { content: 'Combat begins.' },
      { content: '> attack' },
      { content: 'You hit for 5 damage.' },
      { content: '> end turn' },
    ];
    render(
      <MissionLogPanel
        history={history}
        worldName="Vale of Shadows"
        party={[{ name: 'Test', character_class: 'Fighter', hp: 12, max_hp: 20 }]}
        currentRoom="dungeon_throne"
      />
    );
    const btn = screen.getByTestId('mission-log-copy-btn');
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0] as string;
    // Header includes campaign + party + room.
    expect(text).toMatch(/=== Pansori Mission Log ===/);
    expect(text).toMatch(/Campaign: Vale of Shadows/);
    expect(text).toMatch(/Test \(Fighter\) 12\/20 HP/);
    expect(text).toMatch(/Current room: dungeon_throne/);
    // Chronological order — oldest first.
    const t1 = text.indexOf('Combat begins.');
    const t2 = text.indexOf('You hit for 5 damage.');
    expect(t1).toBeGreaterThan(-1);
    expect(t2).toBeGreaterThan(t1);
    // Turn separators.
    expect(text).toMatch(/--- Turn 1 ---/);
    expect(text).toMatch(/--- Turn 2 ---/);
  });

  it('shows "Copied!" after a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MissionLogPanel history={[{ content: 'event' }, { content: '> noop' }]} />);
    const btn = screen.getByTestId('mission-log-copy-btn');
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/Copied/));
  });
});
