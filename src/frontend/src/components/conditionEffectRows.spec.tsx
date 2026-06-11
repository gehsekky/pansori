// The shared effect editor — focused on the `adjust_flag` effect (a relative
// numeric bump to a flag/counter), the lever the branching primitive uses for
// countdowns + friction meters.

import { type DialogueConsequence, EffectList, type RowPickers } from './conditionEffectRows.tsx';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const pickers: RowPickers = { items: [], quests: [], factions: [], npcIds: [] };

describe('EffectList — adjust_flag', () => {
  it('adds an adjust_flag effect with a -1 default delta', () => {
    const onChange = vi.fn();
    render(<EffectList effects={[]} where="act 1 onStart" pickers={pickers} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Add act 1 onStart effect'), {
      target: { value: 'adjust_flag' },
    });
    expect(onChange).toHaveBeenCalledWith([{ type: 'adjust_flag', key: '', delta: -1 }]);
  });

  it('edits the flag key and delta', () => {
    const onChange = vi.fn();
    const effects: DialogueConsequence[] = [{ type: 'adjust_flag', key: '', delta: -1 }];
    render(
      <EffectList effects={effects} where="act 1 onStart" pickers={pickers} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText('act 1 onStart effect 1 flag key'), {
      target: { value: 'time_blocks' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'adjust_flag', key: 'time_blocks', delta: -1 },
    ]);
    fireEvent.change(screen.getByLabelText('act 1 onStart effect 1 delta'), {
      target: { value: '2' },
    });
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'adjust_flag', key: '', delta: 2 }]);
  });
});
