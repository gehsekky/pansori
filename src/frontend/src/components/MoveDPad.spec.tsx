import type { ChoiceDirection, GameChoice } from '../types';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import MoveDPad from './MoveDPad';
import React from 'react';

function moveChoice(dir: ChoiceDirection, x: number, y: number, remainingFt = 25): GameChoice {
  return {
    label: `Move ${dir} → (${x},${y}) [${remainingFt}ft left]`,
    action: { type: 'grid_move', entityId: 'pc-1', to: { x, y } },
    kind: 'grid_move',
    direction: dir,
  };
}

describe('MoveDPad', () => {
  it('renders nothing when given no directional choices', () => {
    const { container } = render(<MoveDPad choices={[]} onChoose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders 8 directional cells (enabled where a choice exists, disabled otherwise)', () => {
    // Provide 4 of 8 directions — the others should render as disabled
    // placeholders so the grid stays 3x3.
    const choices = [
      moveChoice('N', 5, 4),
      moveChoice('E', 6, 5),
      moveChoice('S', 5, 6),
      moveChoice('W', 4, 5),
    ];
    const { container, getByTestId } = render(<MoveDPad choices={choices} onChoose={() => {}} />);
    const dpad = getByTestId('move-dpad');
    // 8 arrow cells + 1 center cell = 9 children
    expect(dpad.children).toHaveLength(9);
    // Cardinal directions have testids (enabled buttons)
    for (const dir of ['N', 'E', 'S', 'W']) {
      expect(container.querySelector(`[data-testid="move-dpad-${dir}"]`)).toBeTruthy();
    }
    // Diagonals are present as disabled buttons with the right data-direction
    for (const dir of ['NE', 'SE', 'SW', 'NW']) {
      const cell = container.querySelector(`[data-direction="${dir}"]`);
      expect(cell).toBeTruthy();
      expect((cell as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows the remaining-feet label in the center cell', () => {
    const choices = [moveChoice('N', 5, 4, 20)];
    const { getByTestId } = render(<MoveDPad choices={choices} onChoose={() => {}} />);
    expect(getByTestId('move-dpad').textContent).toContain('20 ft');
  });

  it('clicking an arrow dispatches the corresponding choice', () => {
    const onChoose = vi.fn();
    const east = moveChoice('E', 6, 5);
    const { getByTestId } = render(
      <MoveDPad choices={[east, moveChoice('N', 5, 4)]} onChoose={onChoose} />
    );
    fireEvent.click(getByTestId('move-dpad-E'));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(east);
  });

  it('roving tabindex: only the focused cell is reachable via Tab', () => {
    const choices = [
      moveChoice('NW', 4, 4),
      moveChoice('N', 5, 4),
      moveChoice('NE', 6, 4),
      moveChoice('E', 6, 5),
    ];
    const { container } = render(<MoveDPad choices={choices} onChoose={() => {}} />);
    const tabbables = container.querySelectorAll('button:not([disabled])[tabindex="0"]');
    // Exactly one cell holds tabindex=0 at any time.
    expect(tabbables.length).toBe(1);
    // Initial tabbable is the first available direction in iteration order
    // (NW comes first in our row-major check).
    expect((tabbables[0] as HTMLButtonElement).dataset.direction).toBe('NW');
  });

  it('arrow-key navigation moves focus between available cells', async () => {
    const choices = [
      moveChoice('NW', 4, 4),
      moveChoice('N', 5, 4),
      moveChoice('NE', 6, 4),
      moveChoice('W', 4, 5),
      moveChoice('E', 6, 5),
      moveChoice('SW', 4, 6),
      moveChoice('S', 5, 6),
      moveChoice('SE', 6, 6),
    ];
    const { container, getByTestId } = render(<MoveDPad choices={choices} onChoose={() => {}} />);
    const dpad = getByTestId('move-dpad');
    // Initial focus on NW. Press ArrowRight → N.
    fireEvent.keyDown(dpad, { key: 'ArrowRight' });
    const tabbableAfterRight = container.querySelector(
      'button:not([disabled])[tabindex="0"]'
    ) as HTMLButtonElement;
    expect(tabbableAfterRight.dataset.direction).toBe('N');
    // ArrowDown → S (skipping center).
    fireEvent.keyDown(dpad, { key: 'ArrowDown' });
    const tabbableAfterDown = container.querySelector(
      'button:not([disabled])[tabindex="0"]'
    ) as HTMLButtonElement;
    expect(tabbableAfterDown.dataset.direction).toBe('S');
  });

  it('arrow-key navigation skips over disabled cells', () => {
    // N and W are missing — pressing ArrowRight from NW should skip past
    // N (disabled) and land on NE.
    const choices = [moveChoice('NW', 4, 4), moveChoice('NE', 6, 4), moveChoice('E', 6, 5)];
    const { container, getByTestId } = render(<MoveDPad choices={choices} onChoose={() => {}} />);
    const dpad = getByTestId('move-dpad');
    fireEvent.keyDown(dpad, { key: 'ArrowRight' });
    const tabbable = container.querySelector(
      'button:not([disabled])[tabindex="0"]'
    ) as HTMLButtonElement;
    expect(tabbable.dataset.direction).toBe('NE');
  });

  it('disabled prop disables every arrow button', () => {
    const { container } = render(
      <MoveDPad
        choices={[moveChoice('N', 5, 4), moveChoice('E', 6, 5)]}
        onChoose={() => {}}
        disabled
      />
    );
    for (const btn of container.querySelectorAll('button')) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('rotates the layout with the diorama camera: the up arrow always moves away from it', () => {
    // Camera orbited one quadrant (sitting east, looking west): grid WEST is
    // now screen-up, so the W choice occupies the top cell — and clicking the
    // top cell dispatches the true grid-W move. NORTH appears screen-right.
    const onChoose = vi.fn();
    const west = moveChoice('W', 4, 5);
    const north = moveChoice('N', 5, 4);
    const { getByTestId } = render(
      <MoveDPad choices={[west, north]} onChoose={onChoose} cameraQuadrant={1} />
    );
    fireEvent.click(getByTestId('move-dpad-N')); // the visually-top button
    expect(onChoose).toHaveBeenCalledWith(west);
    fireEvent.click(getByTestId('move-dpad-E')); // visually right
    expect(onChoose).toHaveBeenCalledWith(north);
  });

  it('quadrant 0 (and the 2D grid) keeps the grid-aligned layout', () => {
    const onChoose = vi.fn();
    const north = moveChoice('N', 5, 4);
    const { getByTestId } = render(
      <MoveDPad choices={[north]} onChoose={onChoose} cameraQuadrant={0} />
    );
    fireEvent.click(getByTestId('move-dpad-N'));
    expect(onChoose).toHaveBeenCalledWith(north);
  });
});
