import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import LevelUpDialog from './LevelUpDialog';
import React from 'react';
import { makeChar } from './test-fixtures';

describe('LevelUpDialog', () => {
  it('renders every PHB class as a row', () => {
    const char = makeChar({ character_class: 'Fighter', str: 16, dex: 16 });
    const { getByTestId } = render(
      <LevelUpDialog char={char} onClose={() => {}} onChoose={() => {}} />
    );
    for (const cls of [
      'barbarian',
      'bard',
      'cleric',
      'druid',
      'fighter',
      'monk',
      'paladin',
      'ranger',
      'rogue',
      'sorcerer',
      'warlock',
      'wizard',
    ]) {
      expect(getByTestId(`level-up-class-${cls}`)).toBeTruthy();
    }
  });

  it('enables the primary class button regardless of stats', () => {
    const char = makeChar({ character_class: 'Fighter', str: 8, dex: 8 });
    const { getByTestId } = render(
      <LevelUpDialog char={char} onClose={() => {}} onChoose={() => {}} />
    );
    const fighterBtn = getByTestId('level-up-pick-fighter') as HTMLButtonElement;
    expect(fighterBtn.disabled).toBe(false);
  });

  it('disables classes whose multiclass prereq the PC fails', () => {
    // Wizard primary (INT-based) with low STR/CHA — can't enter Paladin
    // (needs STR 13 + CHA 13) or Barbarian (needs STR 13).
    const char = makeChar({ character_class: 'Wizard', str: 8, dex: 14, cha: 8, int: 16 });
    const { getByTestId } = render(
      <LevelUpDialog char={char} onClose={() => {}} onChoose={() => {}} />
    );
    expect((getByTestId('level-up-pick-paladin') as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId('level-up-pick-barbarian') as HTMLButtonElement).disabled).toBe(true);
    // Fighter has STR-or-DEX prereq, DEX 14 passes — still enabled.
    expect((getByTestId('level-up-pick-fighter') as HTMLButtonElement).disabled).toBe(false);
    // Wizard (primary) always enabled.
    expect((getByTestId('level-up-pick-wizard') as HTMLButtonElement).disabled).toBe(false);
  });

  it('dispatches onChoose with the lowercased className and closes', () => {
    const char = makeChar({ character_class: 'Fighter', str: 16, cha: 16 });
    const onChoose = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <LevelUpDialog char={char} onClose={onClose} onChoose={onChoose} />
    );
    fireEvent.click(getByTestId('level-up-pick-paladin'));
    expect(onChoose).toHaveBeenCalledWith('paladin');
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the primary class with a PRIMARY badge', () => {
    const char = makeChar({ character_class: 'Rogue' });
    const { getByTestId } = render(
      <LevelUpDialog char={char} onClose={() => {}} onChoose={() => {}} />
    );
    const row = getByTestId('level-up-class-rogue');
    expect(row.textContent).toMatch(/PRIMARY/);
  });
});
