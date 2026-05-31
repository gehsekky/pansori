import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import ConversationPanel from './ConversationPanel';
import type { GameChoice } from '../types';
import React from 'react';

const choices: GameChoice[] = [
  {
    label: '<To The Sage> Who built it?',
    action: { type: 'talk_response', responseIdx: 0 },
    kind: 'conversation',
  },
  {
    label: '<To The Sage> I have heard enough',
    action: { type: 'talk_response', responseIdx: 1 },
    kind: 'conversation',
  },
  { label: '↩ Back', action: { type: 'conversation_back' }, kind: 'conversation' },
  { label: '✕ End conversation', action: { type: 'end_conversation' }, kind: 'conversation' },
];

describe('ConversationPanel', () => {
  it('renders the NPC header, current prompt, response options, and Back/End controls', () => {
    const { getByText, getAllByTestId } = render(
      <ConversationPanel
        npcName="The Sage"
        prompt="It is old and cursed."
        choices={choices}
        onChoose={() => {}}
      />
    );
    expect(getByText(/Talking to THE SAGE/i)).toBeTruthy();
    expect(getByText('It is old and cursed.')).toBeTruthy();
    // Two response buttons + Back + End = 4 conversation choices.
    expect(getAllByTestId('conversation-choice')).toHaveLength(4);
    expect(getByText(/Who built it\?/)).toBeTruthy();
    expect(getByText('↩ Back')).toBeTruthy();
    expect(getByText('✕ End conversation')).toBeTruthy();
  });

  it('dispatches the chosen action on click', () => {
    const onChoose = vi.fn();
    const { getByText } = render(
      <ConversationPanel
        npcName="The Sage"
        prompt="It is old and cursed."
        choices={choices}
        onChoose={onChoose}
      />
    );
    fireEvent.click(getByText(/Who built it\?/));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'talk_response', responseIdx: 0 } })
    );
    fireEvent.click(getByText('✕ End conversation'));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'end_conversation' } })
    );
  });
});
