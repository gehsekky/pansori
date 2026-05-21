import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdventureLogPanel from './AdventureLogPanel';
import { makeChar, makeState, mockSeed } from './test-fixtures';

// History stream is interleaved [user, assistant, user, assistant, ...]
// The on-screen panel renders every other entry starting at index 0 (the
// engine's assistant output). The copy export interleaves BOTH sides
// with a rich state-snapshot header (round, party HP/conditions/
// concentration, enemies, etc.).

describe('AdventureLogPanel', () => {
  it('renders the most recent 20 assistant entries with the > prefix', () => {
    // History is interleaved [user, assistant, user, assistant, ...]
    // — user (button label) at even indices, assistant (engine
    // narrative) at odd indices. Only the engine output is useful for
    // the on-screen list.
    const history: Array<{ content: string }> = [];
    for (let i = 0; i < 5; i++) {
      history.push({ content: `user ${i}` });
      history.push({ content: `assistant ${i}` });
    }
    render(<AdventureLogPanel history={history} />);
    expect(screen.getByText(/assistant 0/)).toBeDefined();
    expect(screen.getByText(/assistant 4/)).toBeDefined();
    // User-side turns are filtered out of the on-screen list.
    expect(screen.queryByText(/user 0/)).toBeNull();
  });

  it('shows the empty state when history is empty', () => {
    render(<AdventureLogPanel history={[]} />);
    expect(screen.getByText(/No actions taken yet/i)).toBeDefined();
  });

  it('copies the FULL chronological log with state snapshot to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const history = [
      { content: '> begin adventure' },
      { content: 'Combat begins.' },
      { content: '> attack' },
      { content: 'You hit for 5 damage.' },
    ];
    const state = makeState(
      {
        name: 'Test',
        character_class: 'Fighter',
        hp: 12,
        max_hp: 20,
        ac: 16,
        level: 2,
        conditions: ['blessed'],
        condition_sources: { blessed: 'cleric-1' },
        concentrating_on: { spellId: 'bless', rounds_left: 7 },
      },
      { current_room: 'dungeon_throne', round: 3, combat_active: true }
    );
    render(
      <AdventureLogPanel
        history={history}
        worldName="Vale of Shadows"
        state={state}
        seed={mockSeed}
      />
    );
    const btn = screen.getByTestId('adventure-log-copy-btn');
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0] as string;
    // Header includes campaign + round + room + combat status.
    expect(text).toMatch(/=== Pansori Adventure Log ===/);
    expect(text).toMatch(/Campaign: Vale of Shadows/);
    expect(text).toMatch(/Round: 3/);
    expect(text).toMatch(/Current room: dungeon_throne/);
    expect(text).toMatch(/In combat: yes/);
    // Party snapshot includes class + level + HP + AC.
    expect(text).toMatch(/Test \(Fighter L2\) HP 12\/20  AC 16/);
    // Conditions surface with source attribution.
    expect(text).toMatch(/Conditions: blessed \(by cleric-1\)/);
    // Concentration surfaces with rounds_left.
    expect(text).toMatch(/Concentrating: bless \(rounds_left: 7\)/);
    // User + Engine sides both surface, interleaved by turn.
    expect(text).toMatch(/USER: > begin adventure/);
    expect(text).toMatch(/ENGINE: Combat begins\./);
    expect(text).toMatch(/USER: > attack/);
    expect(text).toMatch(/ENGINE: You hit for 5 damage\./);
    // Chronological order — oldest first.
    const t1 = text.indexOf('Combat begins.');
    const t2 = text.indexOf('You hit for 5 damage.');
    expect(t1).toBeGreaterThan(-1);
    expect(t2).toBeGreaterThan(t1);
    expect(text).toMatch(/--- Turn 1 ---/);
    expect(text).toMatch(/--- Turn 2 ---/);
  });

  it('surfaces death-save state when present in the snapshot', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const state = makeState(
      { hp: 0, death_saves: { successes: 1, failures: 2 } },
      { combat_active: true }
    );
    render(
      <AdventureLogPanel
        history={[{ content: '> down' }, { content: 'You fall.' }]}
        state={state}
        seed={mockSeed}
      />
    );
    fireEvent.click(screen.getByTestId('adventure-log-copy-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toMatch(/Death Saves: 1\/3 successes, 2\/3 failures/);
  });

  it('omits empty sections cleanly when no state is provided', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <AdventureLogPanel
        history={[{ content: '> noop' }, { content: 'something' }]}
      />
    );
    fireEvent.click(screen.getByTestId('adventure-log-copy-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0] as string;
    // No state → no Party/Enemies/Initiative blocks
    expect(text).not.toMatch(/Party:/);
    expect(text).not.toMatch(/Initiative:/);
    expect(text).not.toMatch(/Active enemies:/);
    // But the log still contains the user + engine pair
    expect(text).toMatch(/USER: > noop/);
    expect(text).toMatch(/ENGINE: something/);
  });

  it('shows "Copied!" after a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AdventureLogPanel history={[{ content: '> noop' }, { content: 'event' }]} />);
    const btn = screen.getByTestId('adventure-log-copy-btn');
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/Copied/));
  });
});

// Keep makeChar referenced so the import isn't pruned by tree-shaking
// when this spec is edited; the fixture import gives future tests a
// quick path to fabricate party variants.
void makeChar;
