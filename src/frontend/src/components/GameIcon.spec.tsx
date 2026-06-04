import { describe, expect, it } from 'vitest';
import GameIcon from './GameIcon';
import { render } from '@testing-library/react';

describe('GameIcon', () => {
  it('renders the game-icon class pattern with the icon name', () => {
    const { container } = render(<GameIcon name="broadsword" />);
    const i = container.querySelector('i')!;
    expect(i.className).toBe('game-icon game-icon-broadsword');
  });

  it('exposes an accessible image when given an aria-label', () => {
    const { container } = render(<GameIcon name="health-potion" aria-label="Heal" />);
    const i = container.querySelector('i')!;
    expect(i.getAttribute('role')).toBe('img');
    expect(i.getAttribute('aria-label')).toBe('Heal');
    expect(i.getAttribute('aria-hidden')).toBeNull();
  });

  it('hides from assistive tech when purely decorative (no aria-label)', () => {
    const { container } = render(<GameIcon name="broadsword" />);
    expect(container.querySelector('i')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('appends an extra className and applies rotation', () => {
    const { container } = render(<GameIcon name="broadsword" className="big" rotate={90} />);
    const i = container.querySelector('i')!;
    expect(i.className).toBe('game-icon game-icon-broadsword big');
    expect(i.style.transform).toBe('rotate(90deg)');
  });
});
