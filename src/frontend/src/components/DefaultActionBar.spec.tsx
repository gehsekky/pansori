import type { ChoiceKind, GameChoice } from '../types';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import DefaultActionBar from './DefaultActionBar';
import React from 'react';

function makeChoice(kind: ChoiceKind, label: string, action: GameChoice['action']): GameChoice {
  return { label, action, kind };
}

const dash = makeChoice('dash', 'Dash — double movement this turn (30 extra ft)', {
  type: 'dash',
});
const disengage = makeChoice(
  'disengage',
  'Disengage — move without triggering opportunity attacks',
  {
    type: 'disengage',
  }
);
const dodge = makeChoice('dodge', 'Dodge — attacks against you have disadvantage', {
  type: 'dodge',
});
const ready = makeChoice('ready', 'Ready an action — set trigger and action to store', {
  type: 'ready',
  trigger: 'enemy attacks',
  action: { type: 'attack' },
});

describe('DefaultActionBar', () => {
  it('renders nothing when no matching choices are present', () => {
    const { container } = render(<DefaultActionBar choices={[]} onChoose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows all four action buttons when every kind is offered', () => {
    const { getByTestId } = render(
      <DefaultActionBar choices={[dash, disengage, dodge, ready]} onChoose={() => {}} />
    );
    for (const kind of ['dash', 'disengage', 'dodge', 'ready']) {
      const btn = getByTestId(`action-${kind}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    }
  });

  it('disables buttons for kinds the engine did not offer this turn', () => {
    // Only dash + dodge available — disengage + ready render but are
    // disabled so the row layout stays stable across turns.
    const { getByTestId } = render(
      <DefaultActionBar choices={[dash, dodge]} onChoose={() => {}} />
    );
    expect((getByTestId('action-dash') as HTMLButtonElement).disabled).toBe(false);
    expect((getByTestId('action-dodge') as HTMLButtonElement).disabled).toBe(false);
    expect((getByTestId('action-disengage') as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId('action-ready') as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking an enabled button dispatches the corresponding choice', () => {
    const onChoose = vi.fn();
    const { getByTestId } = render(
      <DefaultActionBar choices={[dash, dodge]} onChoose={onChoose} />
    );
    fireEvent.click(getByTestId('action-dash'));
    expect(onChoose).toHaveBeenCalledWith(dash);
  });

  it('exposes the full original label via aria-label + title', () => {
    const { getByTestId } = render(<DefaultActionBar choices={[dash]} onChoose={() => {}} />);
    const btn = getByTestId('action-dash');
    expect(btn.getAttribute('aria-label')).toBe(dash.label);
    expect(btn.getAttribute('title')).toBe(dash.label);
  });
});
