import type { ChoiceKind, GameChoice } from '../types';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import CombatActionBar from './CombatActionBar';
import React from 'react';

function makeChoice(kind: ChoiceKind, label: string, action: GameChoice['action']): GameChoice {
  return { label, action, kind };
}

const attack = makeChoice('attack', 'Attack Goblin (HP 8/10)', {
  type: 'attack',
  targetEnemyId: 'g1',
});
const grapple = makeChoice('grapple', 'Grapple the Goblin — STR vs STR/DEX contest', {
  type: 'grapple',
  targetEnemyId: 'g1',
});
const shove = makeChoice('shove', 'Shove the Goblin — knocks prone', {
  type: 'shove',
  targetEnemyId: 'g1',
});
const twf = makeChoice('two_weapon_attack', 'Two-weapon attack — off-hand dagger', {
  type: 'two_weapon_attack',
  targetEnemyId: 'g1',
});
const spiritWeapon = makeChoice(
  'recurring_spell_attack',
  'Spiritual Weapon: attack the Goblin (bonus action)',
  { type: 'recurring_spell_attack', targetEnemyId: 'g1' }
);

describe('CombatActionBar', () => {
  it('renders nothing when no matching combat choices are present', () => {
    const { container } = render(<CombatActionBar choices={[]} onChoose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows every combat button when all 4 kinds are offered', () => {
    const { getByTestId } = render(
      <CombatActionBar choices={[attack, grapple, shove, twf]} onChoose={() => {}} />
    );
    for (const kind of ['attack', 'grapple', 'shove', 'two_weapon_attack']) {
      const btn = getByTestId(`combat-${kind}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    }
  });

  it('disables buttons for kinds the engine did not surface this turn', () => {
    // Only attack + grapple available — shove + two_weapon_attack render
    // but disabled so the row layout stays stable across turns.
    const { getByTestId } = render(
      <CombatActionBar choices={[attack, grapple]} onChoose={() => {}} />
    );
    expect((getByTestId('combat-attack') as HTMLButtonElement).disabled).toBe(false);
    expect((getByTestId('combat-grapple') as HTMLButtonElement).disabled).toBe(false);
    expect((getByTestId('combat-shove') as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId('combat-two_weapon_attack') as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking a combat button dispatches the corresponding choice', () => {
    const onChoose = vi.fn();
    const { getByTestId } = render(
      <CombatActionBar choices={[attack, grapple]} onChoose={onChoose} />
    );
    fireEvent.click(getByTestId('combat-attack'));
    expect(onChoose).toHaveBeenCalledWith(attack);
  });

  it('keeps only the first choice per kind when duplicates slip through', () => {
    // The caller (App.tsx) filters by EnemySelector before this point —
    // but defensively, two attack choices targeting different enemies
    // should not duplicate the Attack button.
    const attackAlt = makeChoice('attack', 'Attack Other Goblin', {
      type: 'attack',
      targetEnemyId: 'g2',
    });
    const onChoose = vi.fn();
    const { getByTestId } = render(
      <CombatActionBar choices={[attack, attackAlt]} onChoose={onChoose} />
    );
    fireEvent.click(getByTestId('combat-attack'));
    expect(onChoose).toHaveBeenCalledWith(attack);
  });

  it('renders a recurring spell-attack button, captioned with the spell name', () => {
    const onChoose = vi.fn();
    const { getByTestId } = render(
      <CombatActionBar choices={[spiritWeapon]} onChoose={onChoose} />
    );
    const btn = getByTestId('combat-recurring_spell_attack') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    // Caption derives from the label prefix (before the colon), not "Spell Atk".
    expect(btn.textContent).toContain('Spiritual Weapon');
    // Full label still exposed for SR users.
    expect(btn.getAttribute('title')).toBe(spiritWeapon.label);
    fireEvent.click(btn);
    expect(onChoose).toHaveBeenCalledWith(spiritWeapon);
  });

  it('exposes the full original label via aria-label + title', () => {
    const { getByTestId } = render(<CombatActionBar choices={[attack]} onChoose={() => {}} />);
    const btn = getByTestId('combat-attack');
    expect(btn.getAttribute('aria-label')).toBe(attack.label);
    expect(btn.getAttribute('title')).toBe(attack.label);
  });
});
