import InventoryModal, { alphabeticalOrder, typeOrder } from './InventoryModal';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { makeChar, makeState, mockCtx } from './test-fixtures';

// The inventory storage grid: icons in squares, hover tooltip for details,
// drag to rearrange, A–Z / by-type sorts (order persists via onReorder).

const ITEMS = [
  { instance_id: 'p-1', id: 'healing_potion', name: 'Healing Potion', desc: 'Heals 2d4+2.' },
  { instance_id: 's-1', id: 'longsword', name: 'Longsword', damage: '1d8', weight: 3 },
  { instance_id: 'a-1', id: 'arrows', name: 'Arrows', count: 20 },
];

function renderModal(over: Partial<Parameters<typeof InventoryModal>[0]> = {}) {
  const char = makeChar({ id: 'c1', name: 'Anna', inventory: [...ITEMS] });
  const state = { ...makeState({}, {}), characters: [char], active_character_id: 'c1' };
  const props = {
    state,
    ctx: mockCtx,
    onClose: vi.fn(),
    onEquip: vi.fn(),
    onTransfer: vi.fn(),
    onDrop: vi.fn(),
    onReorder: vi.fn(),
    ...over,
  };
  render(<InventoryModal {...props} />);
  return props;
}

describe('InventoryModal — storage grid', () => {
  it('renders a grid of squares: items as icon cells + empty slots beyond them', () => {
    renderModal();
    // 3 items → at least one spare row; cell 0 is the first item, the last
    // rendered cell is empty padding.
    expect(screen.getByTestId('inv-grid')).toBeTruthy();
    expect(screen.getByTestId('inv-cell-0').getAttribute('aria-label')).toBe('Healing Potion');
    expect(screen.getByTestId('inv-cell-1').getAttribute('aria-label')).toBe('Longsword');
    expect(screen.getByTestId('inv-cell-23')).toBeTruthy(); // 24-slot floor
  });

  it('hovering an item cell opens the details tooltip', async () => {
    renderModal();
    fireEvent.mouseEnter(screen.getByTestId('inv-cell-1'));
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Longsword');
    expect(tip.textContent).toContain('Damage: 1d8');
    expect(tip.textContent).toContain('Weight: 3 lb');
  });

  it('clicking an item selects it and surfaces the action bar', () => {
    const props = renderModal();
    fireEvent.click(screen.getByTestId('inv-cell-1'));
    const bar = screen.getByTestId('inv-action-bar');
    expect(bar.textContent).toContain('Longsword');
    fireEvent.click(screen.getByText('Equip'));
    expect(props.onEquip).toHaveBeenCalledWith('s-1', 'c1');
  });

  it('Sort A–Z reorders by name', () => {
    const props = renderModal();
    fireEvent.click(screen.getByTestId('inv-sort-alpha'));
    expect(props.onReorder).toHaveBeenCalledWith('c1', ['a-1', 'p-1', 's-1']);
  });

  it('Sort by type groups weapons before consumables before ammo-gear', () => {
    const props = renderModal();
    fireEvent.click(screen.getByTestId('inv-sort-type'));
    // ITEM_ICONS bucket order: blade (weapon) < potion (consumable) < ammo.
    expect(props.onReorder).toHaveBeenCalledWith('c1', ['s-1', 'p-1', 'a-1']);
  });

  it('drag-and-drop moves the dragged item to the drop cell', () => {
    const props = renderModal();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(screen.getByTestId('inv-cell-0'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('inv-cell-2'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('inv-cell-2'), { dataTransfer });
    // Potion (index 0) lands at index 2: sword, arrows, potion.
    expect(props.onReorder).toHaveBeenCalledWith('c1', ['s-1', 'a-1', 'p-1']);
  });

  it('dropping on an empty trailing cell sends the item to the end', () => {
    const props = renderModal();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(screen.getByTestId('inv-cell-0'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('inv-cell-10'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('inv-cell-10'), { dataTransfer });
    expect(props.onReorder).toHaveBeenCalledWith('c1', ['s-1', 'a-1', 'p-1']);
  });
});

describe('sort order helpers', () => {
  it('alphabeticalOrder sorts by display name', () => {
    expect(alphabeticalOrder(ITEMS as never)).toEqual(['a-1', 'p-1', 's-1']);
  });

  it('typeOrder falls back to A–Z inside one bucket', () => {
    const twoBlades = [
      { instance_id: 'b', id: 'shortsword', name: 'Shortsword' },
      { instance_id: 'a', id: 'longsword', name: 'Longsword' },
    ];
    expect(typeOrder(twoBlades as never)).toEqual(['a', 'b']);
  });
});
