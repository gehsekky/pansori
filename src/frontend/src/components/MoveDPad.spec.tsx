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
});
