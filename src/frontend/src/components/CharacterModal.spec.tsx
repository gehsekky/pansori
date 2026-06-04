import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { makeChar, mockCtx } from './test-fixtures';
import CharacterModal from './CharacterModal';
import type { FrontendContext } from '../types';

const ctx: FrontendContext = {
  ...mockCtx,
  backgrounds: [
    {
      id: 'acolyte',
      name: 'Acolyte',
      desc: 'You served at a temple.',
      skillProficiencies: ['Insight', 'Religion'],
      feature: 'Shelter of the Faithful',
      featureDesc: 'Temples will house you.',
    },
  ],
};

const hero = makeChar({
  id: 'h1',
  name: 'Brother Ansel',
  character_class: 'Cleric',
  level: 5,
  str: 14,
  dex: 9,
  con: 16,
  int: 10,
  wis: 18,
  cha: 12,
  hp: 33,
  max_hp: 40,
  ac: 18,
  species: 'elf',
  background_id: 'acolyte',
  skill_proficiencies: ['insight', 'religion'],
  spells_known: ['cure_wounds', 'guiding_bolt'],
  equipment: { main_hand: 'w1', armor: 'a1' },
  inventory: [
    { instance_id: 'w1', id: 'mace', name: 'Mace' },
    { instance_id: 'a1', id: 'chain', name: 'Chain Mail' },
  ],
});

describe('CharacterModal', () => {
  it('renders the title, ability scores with modifiers, and vitals', () => {
    const { getByTestId, getByText } = render(
      <CharacterModal char={hero} ctx={ctx} onClose={vi.fn()} />
    );
    // Title: name — class level.
    expect(getByText(/Brother Ansel — Cleric 5/)).toBeTruthy();
    // Abilities: WIS 18 → +4, DEX 9 → −1.
    const abilities = getByTestId('char-abilities');
    expect(abilities.textContent).toContain('18');
    expect(abilities.textContent).toContain('+4');
    expect(abilities.textContent).toContain('-1'); // DEX 9
    // Vitals: current/max HP + AC.
    const vitals = getByTestId('char-vitals');
    expect(vitals.textContent).toContain('33');
    expect(vitals.textContent).toContain('40');
    expect(vitals.textContent).toContain('18'); // AC
  });

  it('shows species traits, the background, and spells (no equipment section)', () => {
    const { getByText, queryByText } = render(
      <CharacterModal char={hero} ctx={ctx} onClose={vi.fn()} />
    );
    expect(getByText(/SPECIES — Elf/)).toBeTruthy();
    expect(getByText(/BACKGROUND — Acolyte/)).toBeTruthy();
    expect(getByText(/You served at a temple/)).toBeTruthy();
    // Prettified spell ids.
    expect(getByText(/Cure Wounds/)).toBeTruthy();
    // Equipment lives in the inventory screen, not the sheet.
    expect(queryByText('EQUIPMENT')).toBeNull();
  });

  it('closes on Escape via the Dialog shell', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<CharacterModal char={hero} ctx={ctx} onClose={onClose} />);
    fireEvent.keyDown(getByTestId('character-modal'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
