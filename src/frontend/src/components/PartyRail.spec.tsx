import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { makeState, mockCtx, mockSeed } from './test-fixtures';
import PartyRail from './PartyRail';

// The per-tile ⓘ opens the character sheet without touching the tile's
// select / set-active behavior (it's a sibling button, not nested).

describe('PartyRail — open-sheet (ⓘ) trigger', () => {
  it('clicking ⓘ calls onOpenSheet with the char id and not onSetActive', () => {
    const onOpenSheet = vi.fn();
    const onSetActive = vi.fn();
    const state = makeState({ id: 'h1', name: 'Buck' });
    const { getByTestId } = render(
      <PartyRail
        state={state}
        activeCharId="h1"
        ctx={mockCtx}
        seed={mockSeed}
        inCombat={false}
        onSetActive={onSetActive}
        onOpenSheet={onOpenSheet}
      />
    );
    fireEvent.click(getByTestId('open-sheet-btn'));
    expect(onOpenSheet).toHaveBeenCalledWith('h1');
    expect(onSetActive).not.toHaveBeenCalled();
  });

  it('omits the ⓘ when onOpenSheet is not provided', () => {
    const state = makeState({ id: 'h1' });
    const { queryByTestId } = render(
      <PartyRail state={state} activeCharId="h1" ctx={mockCtx} seed={mockSeed} inCombat={false} />
    );
    expect(queryByTestId('open-sheet-btn')).toBeNull();
  });
});
