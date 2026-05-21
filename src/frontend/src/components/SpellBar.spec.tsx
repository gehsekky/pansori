import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { GameChoice } from '../types';
import React from 'react';
import SpellBar from './SpellBar';

function spellChoice(
  spellId: string,
  label: string,
  slotLevel: number,
  targetEnemyId = 'g1'
): GameChoice {
  return {
    label,
    action: { type: 'cast_spell', spellId, slotLevel, targetEnemyId },
    kind: 'cast_spell',
  };
}

describe('SpellBar', () => {
  it('renders nothing when no cast_spell choices are present', () => {
    const { container } = render(<SpellBar choices={[]} onChoose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per unique spellId', () => {
    const { getByTestId } = render(
      <SpellBar
        choices={[
          spellChoice('sacred_flame', 'Cast Sacred Flame (cantrip) → Goblin', 0),
          spellChoice('guiding_bolt', 'Cast Guiding Bolt (Lvl 1) → Goblin', 1),
        ]}
        onChoose={() => {}}
      />
    );
    expect(getByTestId('spell-sacred_flame')).toBeTruthy();
    expect(getByTestId('spell-guiding_bolt')).toBeTruthy();
  });

  it('dedupes upcast variants — keeps the lowest slot per spell', () => {
    // Cleric with 3 L1 slots, 2 L2, 1 L3 of Cure-Wounds-style spell.
    // We only emit 3 buttons total (3 spells), or in this case 1 button
    // for guiding_bolt picking the L1 variant.
    const l1 = spellChoice('guiding_bolt', 'Cast Guiding Bolt (Lvl 1) → Goblin', 1);
    const l2 = spellChoice('guiding_bolt', 'Cast Guiding Bolt (2th slot) → Goblin', 2);
    const l3 = spellChoice('guiding_bolt', 'Cast Guiding Bolt (3th slot) → Goblin', 3);
    const onChoose = vi.fn();
    const { getByTestId, container } = render(
      <SpellBar choices={[l3, l1, l2]} onChoose={onChoose} />
    );
    // Only one button — lowest slot wins.
    expect(container.querySelectorAll('[data-spell-id]')).toHaveLength(1);
    fireEvent.click(getByTestId('spell-guiding_bolt'));
    expect(onChoose).toHaveBeenCalledWith(l1);
  });

  it('renders a short spell name pulled from the label', () => {
    const { container } = render(
      <SpellBar
        choices={[
          spellChoice('sacred_flame', 'Cast Sacred Flame (cantrip) → Bandit Ruffian #1', 0),
        ]}
        onChoose={() => {}}
      />
    );
    // The button text should mention "Sacred Flame" (extracted from the label).
    expect(container.textContent ?? '').toContain('Sacred Flame');
  });

  it('exposes the full original label via aria-label + title', () => {
    const choice = spellChoice('sacred_flame', 'Cast Sacred Flame (cantrip) → Goblin', 0);
    const { getByTestId } = render(<SpellBar choices={[choice]} onChoose={() => {}} />);
    const btn = getByTestId('spell-sacred_flame');
    expect(btn.getAttribute('aria-label')).toBe(choice.label);
    expect(btn.getAttribute('title')).toBe(choice.label);
  });

  it('clicking a spell button dispatches the chosen choice', () => {
    const onChoose = vi.fn();
    const sacred = spellChoice('sacred_flame', 'Cast Sacred Flame (cantrip) → Goblin', 0);
    const guiding = spellChoice('guiding_bolt', 'Cast Guiding Bolt (Lvl 1) → Goblin', 1);
    const { getByTestId } = render(<SpellBar choices={[sacred, guiding]} onChoose={onChoose} />);
    fireEvent.click(getByTestId('spell-guiding_bolt'));
    expect(onChoose).toHaveBeenCalledWith(guiding);
  });
});
