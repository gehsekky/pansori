import type { CombatEntity, GameState, Seed } from '../types';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import EnemySelector from './EnemySelector';
import React from 'react';

function ent(id: string, hp: number, maxHp: number, isEnemy = true): CombatEntity {
  return {
    id,
    isEnemy,
    pos: { x: 0, y: 0 },
    hp,
    maxHp,
    conditions: [],
    condition_durations: {},
  };
}

function makeSeed(enemies: Array<{ id: string; name: string; hp: number; ac: number }>): Seed {
  return {
    context_id: 'sandbox',
    world_name: 'Test',
    ship_name: 'Test',
    intro: '',
    seed_id: 't',
    rooms: [{ id: 'r', name: 'Room', desc: '' }],
    connections: { r: [] },
    enemies: { r: enemies },
    loot: {},
    npcs: {},
  } as Seed;
}

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    characters: [],
    active_character_id: '',
    current_room: 'r',
    visited_rooms: ['r'],
    enemies_killed: [],
    loot_taken: [],
    combat_active: true,
    initiative_order: [],
    initiative_idx: 0,
    run_log: [],
    room_log: [],
    last_choices: [],
    short_rested_rooms: [],
    long_rested: false,
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
    ...over,
  };
}

describe('EnemySelector', () => {
  it('renders nothing out of combat', () => {
    const { container } = render(
      <EnemySelector
        state={makeState({ combat_active: false, entities: [ent('e1', 10, 10)] })}
        seed={makeSeed([{ id: 'e1', name: 'Goblin', hp: 10, ac: 12 }])}
        selectedId="e1"
        onSelect={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there are no living enemies', () => {
    const { container } = render(
      <EnemySelector
        state={makeState({ entities: [ent('e1', 0, 10)] })}
        seed={makeSeed([{ id: 'e1', name: 'Goblin', hp: 10, ac: 12 }])}
        selectedId={null}
        onSelect={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per living enemy with HP/AC readout', () => {
    const { container, getByTestId } = render(
      <EnemySelector
        state={makeState({ entities: [ent('e1', 8, 11), ent('e2', 11, 11)] })}
        seed={makeSeed([
          { id: 'e1', name: 'Bandit Ruffian', hp: 11, ac: 12 },
          { id: 'e2', name: 'Bandit Ruffian', hp: 11, ac: 12 },
        ])}
        selectedId="e1"
        onSelect={() => {}}
      />
    );
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect((getByTestId('enemy-selector-e1') as HTMLElement).getAttribute('data-selected')).toBe(
      'true'
    );
    expect((getByTestId('enemy-selector-e2') as HTMLElement).getAttribute('data-selected')).toBe(
      'false'
    );
    // Disambiguating suffixes appear when names collide.
    const text = container.textContent ?? '';
    expect(text).toContain('Bandit Ruffian #1');
    expect(text).toContain('Bandit Ruffian #2');
    expect(text).toContain('8/11');
    expect(text).toContain('AC 12');
  });

  it('clicking an enemy invokes onSelect with that id', () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <EnemySelector
        state={makeState({ entities: [ent('e1', 8, 11), ent('e2', 11, 11)] })}
        seed={makeSeed([
          { id: 'e1', name: 'Bandit', hp: 11, ac: 12 },
          { id: 'e2', name: 'Goblin', hp: 11, ac: 13 },
        ])}
        selectedId="e1"
        onSelect={onSelect}
      />
    );
    fireEvent.click(getByTestId('enemy-selector-e2'));
    expect(onSelect).toHaveBeenCalledWith('e2');
  });

  it('skips dead enemies from the list', () => {
    const { container } = render(
      <EnemySelector
        state={makeState({ entities: [ent('e1', 0, 10), ent('e2', 5, 10)] })}
        seed={makeSeed([
          { id: 'e1', name: 'Bandit', hp: 10, ac: 12 },
          { id: 'e2', name: 'Goblin', hp: 10, ac: 12 },
        ])}
        selectedId="e2"
        onSelect={() => {}}
      />
    );
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="enemy-selector-e1"]')).toBeNull();
  });
});
