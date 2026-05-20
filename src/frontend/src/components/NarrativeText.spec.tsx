import { describe, expect, it } from 'vitest';
import NarrativeText from './NarrativeText';
import React from 'react';
import { render } from '@testing-library/react';

describe('NarrativeText', () => {
  it('renders plain prose as a single text node', () => {
    const { container } = render(<NarrativeText text="Just some prose." />);
    expect(container.textContent).toBe('Just some prose.');
    expect(container.querySelectorAll('[data-token-kind]')).toHaveLength(0);
  });

  it('renders tokens as styled spans with data-token-kind', () => {
    const { container } = render(
      <NarrativeText text="Bjorn slashes the orc for {{dmg|8}} damage." />
    );
    const tokens = container.querySelectorAll('[data-token-kind]');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].getAttribute('data-token-kind')).toBe('dmg');
    expect(tokens[0].textContent).toBe('8');
    // Token text is still in the rendered output — full sentence preserved.
    expect(container.textContent).toBe('Bjorn slashes the orc for 8 damage.');
  });

  it('renders multiple back-to-back tokens of different kinds', () => {
    const { container } = render(
      <NarrativeText text="{{roll|18}} vs {{ac|AC 16}} — hits for {{dmg|7}}." />
    );
    const kinds = Array.from(container.querySelectorAll('[data-token-kind]')).map((el) =>
      el.getAttribute('data-token-kind')
    );
    expect(kinds).toEqual(['roll', 'ac', 'dmg']);
  });

  it('exposes accessible labels on tokens', () => {
    const { container } = render(<NarrativeText text="{{hp|23/45}}" />);
    const token = container.querySelector('[data-token-kind="hp"]');
    expect(token?.getAttribute('aria-label')).toBe('hit points: 23/45');
  });

  it('leaves unknown token kinds as raw text', () => {
    const { container } = render(<NarrativeText text="ignore {{xx|nope}} this" />);
    expect(container.querySelectorAll('[data-token-kind]')).toHaveLength(0);
    expect(container.textContent).toBe('ignore {{xx|nope}} this');
  });
});
