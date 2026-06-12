import type { Character, EquipSlot, FrontendContext, GameState } from '../types';
import { EQUIP_SLOTS, ITEM_ICONS, iconForItem } from '../types';
import Dialog from './Dialog.tsx';
import HoverTooltip from './HoverTooltip.tsx';
import { ItemIcon } from '../lib/itemIcons.tsx';
import { formatClassLabel } from '../lib/characterFmt';
import styles from '../styles.module.css';
import { useState } from 'react';

interface Props {
  state: GameState;
  ctx: FrontendContext;
  initialCharId?: string;
  onClose: () => void;
  onEquip: (itemInstanceId: string, charId: string) => void;
  onTransfer: (itemInstanceId: string, fromCharId: string, toCharId: string) => void;
  onDrop: (itemInstanceId: string, charId: string) => void;
  onReorder: (charId: string, order: string[]) => void;
}

type InvItem = Character['inventory'][number];

// 5e carrying capacity: STR × 15 lbs (SRD).
// Variant encumbrance (informational only — not enforced):
//   STR × 5  = encumbered    (−10 ft speed)
//   STR × 10 = heavily encumbered (−20 ft speed, disadv on STR/DEX/CON checks/attacks/saves)
function carryingCapacity(str: number): number {
  return str * 15;
}

function totalWeight(char: Character): number {
  return (char.inventory ?? []).reduce((sum, i) => {
    const w = (i as { weight?: number }).weight ?? 0;
    const count = (i as { count?: number }).count ?? 1;
    return sum + w * count;
  }, 0);
}

// Display labels for each body slot.
const SLOT_LABELS: Record<EquipSlot, string> = {
  main_hand: 'WEAPON',
  off_hand: 'OFF-HAND',
  armor: 'ARMOR',
  shield: 'SHIELD',
  head: 'HEAD',
  neck: 'NECK',
  cloak: 'CLOAK',
  hands: 'HANDS',
  arms: 'ARMS',
  waist: 'WAIST',
  feet: 'FEET',
  ring_1: 'RING 1',
  ring_2: 'RING 2',
  quiver: 'QUIVER',
};
// Always-visible core combat slots; other slots appear only once filled, so the
// row stays compact for a lightly-equipped character.
const CORE_SLOTS: EquipSlot[] = ['main_hand', 'armor', 'shield'];

function encumbranceLabel(weight: number, str: number): { label: string; color: string } {
  const cap = carryingCapacity(str);
  if (weight <= str * 5) return { label: 'unencumbered', color: 'var(--t-dim)' };
  if (weight <= str * 10) return { label: 'encumbered (−10 ft)', color: 'var(--t-hp-mid)' };
  if (weight <= cap)
    return { label: 'heavily encumbered (−20 ft, disadv)', color: 'var(--t-hp-low)' };
  return { label: 'overloaded — cannot move', color: 'var(--t-hp-low)' };
}

// ─── Sort orders (exported for tests) ────────────────────────────────────────

/** A–Z by display name. */
export function alphabeticalOrder(items: InvItem[]): string[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => i.instance_id);
}

/**
 * Grouped by visual type — the ITEM_ICONS bucket sequence already reads
 * weapons → armor → consumables → gear/misc, so the icon vocabulary doubles
 * as the type order. A–Z within each bucket.
 */
export function typeOrder(items: InvItem[]): string[] {
  return [...items]
    .sort((a, b) => {
      const ta = ITEM_ICONS.indexOf(iconForItem(a as never));
      const tb = ITEM_ICONS.indexOf(iconForItem(b as never));
      return ta - tb || a.name.localeCompare(b.name);
    })
    .map((i) => i.instance_id);
}

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// Tooltip body — the item card a hover reveals.
function ItemDetails({
  item,
  desc,
  equipped,
  attuned,
}: {
  item: InvItem;
  desc: string;
  equipped: boolean;
  attuned: boolean;
}) {
  const damage = (item as { damage?: string }).damage;
  const ac = (item as { ac?: number }).ac;
  const w = (item as { weight?: number }).weight ?? 0;
  const count = (item as { count?: number }).count ?? 1;
  return (
    <>
      <div className={styles.tooltipTitle}>
        {item.name}
        {equipped ? ' — EQUIPPED' : ''}
        {attuned ? ' — ATTUNED' : ''}
      </div>
      {damage && <div>Damage: {damage}</div>}
      {ac != null && <div>AC: {ac}</div>}
      {w > 0 && <div>Weight: {w} lb</div>}
      {count > 1 && <div>Quantity: ×{count}</div>}
      {desc && <div style={{ marginTop: 4 }}>{desc}</div>}
    </>
  );
}

function InventoryModal({
  state,
  ctx,
  initialCharId,
  onClose,
  onEquip,
  onTransfer,
  onDrop,
  onReorder,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    initialCharId ?? state.active_character_id ?? state.characters[0]?.id ?? ''
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const char = state.characters.find((c) => c.id === selectedId) ?? state.characters[0];
  if (!char) return null;

  const otherChars = state.characters.filter((c) => c.id !== char.id && !c.dead);
  const weight = totalWeight(char);
  const cap = carryingCapacity(char.str);
  const enc = encumbranceLabel(weight, char.str);

  // Show the core combat slots always, plus any other slot the character has
  // something worn in — kept in canonical EQUIP_SLOTS order.
  const shownSlots = EQUIP_SLOTS.filter((s) => CORE_SLOTS.includes(s) || char.equipment[s]);
  const equippedSlots: Array<{ label: string; instId: string | null }> = shownSlots.map((s) => ({
    label: SLOT_LABELS[s],
    instId: char.equipment[s] ?? null,
  }));

  function nameOf(instId: string | null): string {
    if (!instId) return '—';
    return char?.inventory.find((i) => i.instance_id === instId)?.name ?? instId;
  }

  const items = char.inventory;
  // The storage grid — always at least 3 rows of 8 and always one spare row,
  // so there's visible empty space to drag into.
  const slotCount = Math.max(24, (Math.floor(items.length / 8) + 1) * 8);

  const selectedItem = items.find((i) => i.instance_id === selectedItemId) ?? null;
  const isEquipped = (i: InvItem) => Object.values(char.equipment).includes(i.instance_id);
  const isAttuned = (i: InvItem) => char.attuned_items?.includes(i.instance_id) ?? false;

  // Drop on cell `to`: the dragged item ends up at that index (a drop on an
  // empty trailing cell sends it to the end). Splice semantics — the rest of
  // the sequence shifts, it never swaps.
  function moveTo(from: number, to: number) {
    if (from === to) return;
    const ids = items.map((i) => i.instance_id);
    const [moved] = ids.splice(from, 1);
    ids.splice(Math.min(to, ids.length), 0, moved);
    onReorder(char!.id, ids);
  }

  function applySort(order: string[]) {
    if (
      !sameOrder(
        order,
        items.map((i) => i.instance_id)
      )
    )
      onReorder(char!.id, order);
  }

  function switchChar(id: string) {
    setSelectedId(id);
    setSelectedItemId(null);
    setTransferTarget('');
    setDragIdx(null);
    setOverIdx(null);
  }

  const target = transferTarget || otherChars[0]?.id || '';

  return (
    <Dialog
      title={`INVENTORY — ${char.name.toUpperCase()}`}
      onClose={onClose}
      width="min(720px, calc(100vw - 1.5rem))"
      testId="inventory-modal"
    >
      {/* Party tabs */}
      {state.characters.length > 1 && (
        <div className={styles.invTabs}>
          {state.characters.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => switchChar(c.id)}
                className={`${styles.invTab} ${active ? styles.invTabActive : ''}`}
                disabled={c.dead}
                title={c.dead ? `${c.name} is dead` : c.name}
              >
                {c.portrait_url && (
                  <img
                    src={c.portrait_url}
                    alt={`${c.name}'s portrait`}
                    className={styles.invTabPortrait}
                  />
                )}
                {c.name} [{formatClassLabel(c.character_class, c.subclass)}]
              </button>
            );
          })}
        </div>
      )}

      {/* Equipment slots */}
      <div className={styles.invEquipRow}>
        {equippedSlots.map((slot) => (
          <div key={slot.label} className={styles.invEquipSlot}>
            <span className={styles.invEquipLabel}>{slot.label}</span>
            <span className={styles.invEquipValue}>{nameOf(slot.instId)}</span>
          </div>
        ))}
        <div className={styles.invEquipSlot}>
          <span className={styles.invEquipLabel}>ATTUNED</span>
          <span className={styles.invEquipValue}>
            {char.attuned_items?.length ? `${char.attuned_items.length}/3` : '0/3'}
          </span>
        </div>
      </div>

      {/* Sort controls */}
      <div className={styles.invSortRow}>
        <button
          className={styles.invBtn}
          onClick={() => applySort(alphabeticalOrder(items))}
          disabled={items.length < 2}
          data-testid="inv-sort-alpha"
        >
          Sort A–Z
        </button>
        <button
          className={styles.invBtn}
          onClick={() => applySort(typeOrder(items))}
          disabled={items.length < 2}
          data-testid="inv-sort-type"
        >
          Sort by type
        </button>
        <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
          drag to rearrange · hover for details
        </span>
      </div>

      {/* Storage grid */}
      <div className={styles.invGrid} data-testid="inv-grid">
        {Array.from({ length: slotCount }, (_, idx) => {
          const item = items[idx] as InvItem | undefined;
          if (!item) {
            return (
              <div
                key={`empty-${idx}`}
                className={`${styles.invCell} ${overIdx === idx ? styles.invCellDragOver : ''}`}
                data-testid={`inv-cell-${idx}`}
                onDragOver={(e) => {
                  if (dragIdx !== null) {
                    e.preventDefault();
                    setOverIdx(idx);
                  }
                }}
                onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null) moveTo(dragIdx, idx);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
              />
            );
          }
          const count = (item as { count?: number }).count ?? 1;
          const desc = item.desc ?? ctx.itemDescs[item.id] ?? '';
          const selected = item.instance_id === selectedItemId;
          return (
            <HoverTooltip
              key={item.instance_id}
              className={styles.invCellWrap}
              content={
                <ItemDetails
                  item={item}
                  desc={desc}
                  equipped={isEquipped(item)}
                  attuned={isAttuned(item)}
                />
              }
            >
              <button
                className={[
                  styles.invCell,
                  styles.invCellItem,
                  selected ? styles.invCellSelected : '',
                  overIdx === idx ? styles.invCellDragOver : '',
                ].join(' ')}
                data-testid={`inv-cell-${idx}`}
                aria-label={item.name}
                draggable
                onDragStart={(e) => {
                  setDragIdx(idx);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.instance_id);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragOver={(e) => {
                  if (dragIdx !== null) {
                    e.preventDefault();
                    setOverIdx(idx);
                  }
                }}
                onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null) moveTo(dragIdx, idx);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onClick={() =>
                  setSelectedItemId((s) => (s === item.instance_id ? null : item.instance_id))
                }
              >
                <ItemIcon item={item as never} size={30} />
                {(isEquipped(item) || isAttuned(item)) && (
                  <span className={styles.invCellBadge}>
                    {isEquipped(item) ? 'E' : ''}
                    {isAttuned(item) ? 'A' : ''}
                  </span>
                )}
                {count > 1 && <span className={styles.invCellCount}>×{count}</span>}
              </button>
            </HoverTooltip>
          );
        })}
      </div>

      {/* Selected-item actions */}
      <div className={styles.invActionBar} data-testid="inv-action-bar">
        {selectedItem ? (
          <>
            <span className={styles.invItemName}>
              <ItemIcon item={selectedItem as never} /> {selectedItem.name}
            </span>
            {!!(
              (selectedItem as { damage?: string }).damage ||
              (selectedItem as { slot?: string }).slot
            ) && (
              <button
                className={styles.invBtn}
                onClick={() => onEquip(selectedItem.instance_id, char.id)}
              >
                {isEquipped(selectedItem) ? 'Unequip' : 'Equip'}
              </button>
            )}
            {otherChars.length > 0 && !isEquipped(selectedItem) && (
              <>
                <select
                  className={styles.invSelect}
                  value={target}
                  onChange={(e) => setTransferTarget(e.target.value)}
                >
                  {otherChars.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.invBtn}
                  onClick={() => onTransfer(selectedItem.instance_id, char.id, target)}
                  disabled={!target}
                >
                  Give →
                </button>
              </>
            )}
            <button
              className={styles.invBtn}
              onClick={() => {
                if (confirm(`Drop ${selectedItem.name}? It will be gone forever.`)) {
                  onDrop(selectedItem.instance_id, char.id);
                  setSelectedItemId(null);
                }
              }}
            >
              Drop
            </button>
          </>
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
            {items.length === 0 ? 'No items.' : 'Select an item to equip, give, or drop.'}
          </span>
        )}
      </div>

      {/* Encumbrance footer */}
      <div className={styles.invFooter}>
        <span>
          Carrying: <strong>{weight.toFixed(1)} lb</strong> / {cap} lb (STR {char.str} × 15)
        </span>
        <span style={{ color: enc.color }}>{enc.label}</span>
      </div>
    </Dialog>
  );
}

export default InventoryModal;
