import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import ClassAbilityBar from './ClassAbilityBar';
import type { GameChoice } from '../types';
import React from 'react';

function feature(featureId: string, label: string): GameChoice {
  return {
    label,
    action: { type: 'use_class_feature', featureId },
    kind: 'class_feature',
  };
}

describe('ClassAbilityBar', () => {
  it('renders nothing when no class-feature choices are present', () => {
    const { container } = render(<ClassAbilityBar choices={[]} onChoose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per featureId in order', () => {
    const { container } = render(
      <ClassAbilityBar
        choices={[
          feature('rage', 'Rage — bonus action (3 uses left)'),
          feature('second_wind', 'Second Wind — bonus action: heal 1d10+1 (1/1 left)'),
          feature('action_surge', 'Action Surge — gain an extra action (1/short rest)'),
        ]}
        onChoose={() => {}}
      />
    );
    const btns = container.querySelectorAll('[data-feature-id]');
    expect(btns).toHaveLength(3);
    expect(btns[0].getAttribute('data-feature-id')).toBe('rage');
    expect(btns[2].getAttribute('data-feature-id')).toBe('action_surge');
  });

  it('strips the verbose tail off the short label', () => {
    const { container } = render(
      <ClassAbilityBar
        choices={[
          feature('rage', 'Rage — bonus action (3 uses left)'),
          feature(
            'cunning_action_disengage',
            'Cunning Action: Disengage — no OA this turn as bonus action'
          ),
        ]}
        onChoose={() => {}}
      />
    );
    // Short labels preserve multi-clause names but cut at " — " or " (".
    expect(container.textContent ?? '').toContain('Rage');
    expect(container.textContent ?? '').toContain('Cunning Action: Disengage');
    // The verbose tail (the parenthesised counter, the em-dash detail)
    // doesn't render in the button caption.
    const captions = container.querySelectorAll(`.${'actionBtnLabel'}`);
    for (const cap of captions) {
      const text = cap.textContent ?? '';
      expect(text).not.toContain('(');
      expect(text).not.toContain('—');
    }
  });

  it('falls back to a generic glyph for unmapped featureIds', () => {
    // A previously-unknown featureId still renders a clickable button —
    // it just uses the fallback icon so the user can dispatch it. New
    // engine features show up in the bar immediately without needing
    // an icon-map change first.
    const { getByTestId } = render(
      <ClassAbilityBar
        choices={[feature('totally_new_feature_id', 'New Feature — does something')]}
        onChoose={() => {}}
      />
    );
    expect(getByTestId('feature-totally_new_feature_id')).toBeTruthy();
  });

  it('clicking a feature button dispatches that choice', () => {
    const onChoose = vi.fn();
    const rage = feature('rage', 'Rage — bonus action');
    const sw = feature('second_wind', 'Second Wind — heal 1d10');
    const { getByTestId } = render(
      <ClassAbilityBar choices={[rage, sw]} onChoose={onChoose} />
    );
    fireEvent.click(getByTestId('feature-second_wind'));
    expect(onChoose).toHaveBeenCalledWith(sw);
  });

  it('exposes the full original label via aria-label + title', () => {
    const rage = feature('rage', 'Rage — bonus action (3 uses left)');
    const { getByTestId } = render(<ClassAbilityBar choices={[rage]} onChoose={() => {}} />);
    const btn = getByTestId('feature-rage');
    expect(btn.getAttribute('aria-label')).toBe(rage.label);
    expect(btn.getAttribute('title')).toBe(rage.label);
  });
});
