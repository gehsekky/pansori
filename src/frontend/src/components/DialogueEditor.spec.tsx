import { type CondRow, compileCondition, parseCondition } from './conditionEffectRows';
import DialogueEditor, { type DialogueNode } from './DialogueEditor';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const PICKERS = {
  items: [
    { id: 'dagger', name: 'Dagger' },
    { id: 'rope', name: 'Rope (50 ft)' },
  ],
  quests: [{ id: 'rat-problem', title: 'The Rat Problem' }],
  factions: [{ id: 'millers', name: "The Millers' Guild" }],
  npcIds: ['old-hob', 'rask'],
};

describe('condition rows ↔ condition JSON', () => {
  const cases: Array<{ row: CondRow; json: object }> = [
    {
      row: { kind: 'quest', questId: 'rat-problem', state: 'active' },
      json: { fact: 'quests_active', operator: 'contains', value: 'rat-problem' },
    },
    {
      row: { kind: 'quest', questId: 'rat-problem', state: 'completed' },
      json: { fact: 'quests_completed', operator: 'contains', value: 'rat-problem' },
    },
    {
      row: { kind: 'quest', questId: 'rat-problem', state: 'not-started' },
      json: {
        not: {
          any: [
            { fact: 'quests_active', operator: 'contains', value: 'rat-problem' },
            { fact: 'quests_completed', operator: 'contains', value: 'rat-problem' },
          ],
        },
      },
    },
    {
      row: { kind: 'flag', key: 'met_hob', value: 'true' },
      json: { fact: 'flags', path: '$.met_hob', operator: 'equal', value: true },
    },
    {
      row: { kind: 'faction', factionId: 'millers', tier: 'friendly' },
      json: {
        fact: 'faction_tier',
        path: '$.millers',
        operator: 'in',
        value: ['friendly', 'exalted'],
      },
    },
    {
      row: { kind: 'item', itemId: 'dagger' },
      json: { fact: 'party_items', operator: 'contains', value: 'dagger' },
    },
  ];

  it('each template row compiles to its JSON and parses back', () => {
    for (const c of cases) {
      expect(compileCondition([c.row])).toEqual(c.json);
      expect(parseCondition(c.json)).toEqual([c.row]);
    }
  });

  it('several rows AND up under {all}; flag values keep their JSON type', () => {
    const rows: CondRow[] = [
      { kind: 'flag', key: 'rumor_level', value: '3' },
      { kind: 'item', itemId: 'rope' },
    ];
    const json = compileCondition(rows);
    expect(json).toEqual({
      all: [
        { fact: 'flags', path: '$.rumor_level', operator: 'equal', value: 3 },
        { fact: 'party_items', operator: 'contains', value: 'rope' },
      ],
    });
    expect(parseCondition(json)).toEqual(rows);
    expect(compileCondition([])).toBeUndefined();
    expect(parseCondition(undefined)).toEqual([]);
  });

  it('hand-authored shapes the templates cannot express parse to null (custom)', () => {
    expect(parseCondition({ fact: 'active_level', operator: 'greaterThan', value: 4 })).toBeNull();
    expect(
      parseCondition({ any: [{ fact: 'party_items', operator: 'contains', value: 'x' }] })
    ).toBeNull();
    expect(
      parseCondition({
        fact: 'faction_tier',
        path: '$.millers',
        operator: 'in',
        value: ['neutral', 'exalted'],
      })
    ).toBeNull(); // not a contiguous tier-and-up set
  });
});

describe('DialogueEditor component', () => {
  function setup(value: DialogueNode[] = []) {
    const onChange = vi.fn();
    render(<DialogueEditor value={value} onChange={onChange} {...PICKERS} />);
    return onChange;
  }
  const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0];

  it('adds an option and edits its label/reply/once', () => {
    const onChange = setup();
    expect(screen.getByText(/No dialogue yet/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('add-dialogue-option'));
    expect(last(onChange)).toEqual([{ label: '' }]);
  });

  it('label, reply and ONCE edit through the controlled value', () => {
    const onChange = setup([{ label: 'Hello' }]);
    fireEvent.change(screen.getByLabelText('PLAYER LINE'), { target: { value: 'Hi there' } });
    expect(last(onChange)).toEqual([{ label: 'Hi there' }]);
    fireEvent.change(screen.getByLabelText('NPC REPLY'), { target: { value: 'Well met.' } });
    expect(last(onChange)).toEqual([{ label: 'Hello', reply: 'Well met.' }]);
    fireEvent.click(screen.getByLabelText('option 1 once'));
    expect(last(onChange)).toEqual([{ label: 'Hello', once: true }]);
  });

  it('condition rows compile into the node; effects fold in', () => {
    const onChange = setup([{ label: 'About that job…' }]);
    fireEvent.change(screen.getByLabelText('Add option 1 condition'), {
      target: { value: 'quest' },
    });
    expect(last(onChange)).toEqual([
      {
        label: 'About that job…',
        condition: { fact: 'quests_active', operator: 'contains', value: 'rat-problem' },
      },
    ]);
    fireEvent.change(screen.getByLabelText('Add option 1 effect'), {
      target: { value: 'start_quest' },
    });
    expect(last(onChange)).toEqual([
      { label: 'About that job…', consequences: [{ type: 'start_quest', questId: 'rat-problem' }] },
    ]);
  });

  it('a custom condition shows the locked chip and survives untouched', () => {
    const custom = { fact: 'active_level', operator: 'greaterThan', value: 4 };
    const onChange = setup([{ label: 'X', condition: custom }]);
    expect(screen.getByText(/custom condition/)).toBeTruthy();
    // Other edits leave the custom condition in place.
    fireEvent.change(screen.getByLabelText('PLAYER LINE'), { target: { value: 'Y' } });
    expect(last(onChange)).toEqual([{ label: 'Y', condition: custom }]);
  });

  it('+ CHECK swaps reply/effects for the check fields; − CHECK removes it', () => {
    const onChange = setup([{ label: 'Stand down', reply: 'No.', consequences: [] }]);
    fireEvent.click(screen.getByLabelText('option 1 toggle check'));
    expect(last(onChange)).toEqual([
      {
        label: 'Stand down',
        check: { skill: 'persuasion', dc: 12, successReply: '', failReply: '' },
      },
    ]);
  });

  it('check fields and outcome effects edit in place', () => {
    const onChange = setup([
      {
        label: 'Stand down',
        check: { skill: 'persuasion', dc: 12, successReply: '', failReply: '' },
      },
    ]);
    fireEvent.change(screen.getByLabelText('SKILL'), { target: { value: 'intimidation' } });
    expect(last(onChange)[0].check.skill).toBe('intimidation');
    fireEvent.change(screen.getByLabelText('ON SUCCESS, NPC SAYS'), {
      target: { value: 'Fine. Go.' },
    });
    expect(last(onChange)[0].check.successReply).toBe('Fine. Go.');
    fireEvent.change(screen.getByLabelText('Add option 1 success effect'), {
      target: { value: 'set_npc_attitude' },
    });
    expect(last(onChange)[0].check.onSuccess).toEqual([
      { type: 'set_npc_attitude', npcId: 'old-hob', attitude: 'indifferent' },
    ]);
  });

  it('+ NESTED adds a child; removing the last child drops the key', () => {
    const onChange = setup([{ label: 'Branch', responses: [{ label: 'Leaf' }] }]);
    fireEvent.click(screen.getByLabelText('option 1 add nested option'));
    expect(last(onChange)).toEqual([
      { label: 'Branch', responses: [{ label: 'Leaf' }, { label: '' }] },
    ]);
    fireEvent.click(screen.getByLabelText('Remove option 1.1'));
    expect(last(onChange)).toEqual([{ label: 'Branch' }]);
  });
});
