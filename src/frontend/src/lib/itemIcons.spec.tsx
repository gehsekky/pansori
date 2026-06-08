import { ItemIcon, PAINTED_ICON_BUCKETS } from './itemIcons';
import { describe, expect, it } from 'vitest';
import { ITEM_ICONS } from '../types';
import { render } from '@testing-library/react';

describe('ItemIcon', () => {
  it('renders a painted PNG for a covered bucket (a sword → blade.png)', () => {
    const { container } = render(<ItemIcon item={{ id: 'longsword', type: 'weapon' }} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/art/icons/blade.png');
  });

  it('renders a game-icons glyph for an uncovered bucket (a potion)', () => {
    const { container } = render(<ItemIcon item={{ id: 'healing_potion', type: 'consumable' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.game-icon-potion-ball')).toBeTruthy();
  });

  it('honors the per-item override', () => {
    const { container } = render(
      <ItemIcon item={{ id: 'longsword', type: 'weapon', icon: 'axe' }} />
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/art/icons/axe.png');
  });

  it('PAINTED_ICON_BUCKETS lists exactly the png-backed buckets, all valid', () => {
    expect(PAINTED_ICON_BUCKETS.length).toBe(10);
    for (const b of PAINTED_ICON_BUCKETS) expect(ITEM_ICONS).toContain(b);
  });
});
