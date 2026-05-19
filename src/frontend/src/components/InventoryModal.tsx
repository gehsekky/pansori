import type { Character, FrontendContext, GameState } from '../types';
import Dialog from './Dialog.tsx';
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
}

// 5e carrying capacity: STR × 15 lbs (PHB).
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

function encumbranceLabel(weight: number, str: number): { label: string; color: string } {
  const cap = carryingCapacity(str);
  if (weight <= str * 5) return { label: 'unencumbered', color: 'var(--t-dim)' };
  if (weight <= str * 10) return { label: 'encumbered (−10 ft)', color: 'var(--t-hp-mid)' };
  if (weight <= cap)
    return { label: 'heavily encumbered (−20 ft, disadv)', color: 'var(--t-hp-low)' };
  return { label: 'overloaded — cannot move', color: 'var(--t-hp-low)' };
}

function InventoryModal({
  state,
  ctx,
  initialCharId,
  onClose,
  onEquip,
  onTransfer,
  onDrop,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    initialCharId ?? state.active_character_id ?? state.characters[0]?.id ?? ''
  );
  const [transferTarget, setTransferTarget] = useState<Record<string, string>>({});

  const char = state.characters.find((c) => c.id === selectedId) ?? state.characters[0];
  if (!char) return null;

  const otherChars = state.characters.filter((c) => c.id !== char.id && !c.dead);
  const weight = totalWeight(char);
  const cap = carryingCapacity(char.str);
  const enc = encumbranceLabel(weight, char.str);

  const equippedSlots: Array<{ label: string; instId: string | null }> = [
    { label: 'WEAPON', instId: char.equipped_weapon },
    { label: 'ARMOR', instId: char.equipped_armor },
    { label: 'SHIELD', instId: char.equipped_shield },
  ];

  function nameOf(instId: string | null): string {
    if (!instId) return '—';
    return char?.inventory.find((i) => i.instance_id === instId)?.name ?? instId;
  }

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
                onClick={() => setSelectedId(c.id)}
                className={`${styles.invTab} ${active ? styles.invTabActive : ''}`}
                disabled={c.dead}
                title={c.dead ? `${c.name} is dead` : c.name}
              >
                {c.portrait_url && (
                  <img src={c.portrait_url} alt="" className={styles.invTabPortrait} />
                )}
                {c.name} [{c.character_class}]
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

      {/* Inventory list */}
      <div className={styles.invBody}>
        {char.inventory.length === 0 ? (
          <p className={styles.campaignEmpty}>No items.</p>
        ) : (
          char.inventory.map((item) => {
            const isEquipped =
              item.instance_id === char.equipped_weapon ||
              item.instance_id === char.equipped_armor ||
              item.instance_id === char.equipped_shield;
            const isAttuned = char.attuned_items?.includes(item.instance_id);
            const isEquippable = !!(
              (item as { damage?: string }).damage ||
              (item as { slot?: string }).slot === 'armor' ||
              (item as { slot?: string }).slot === 'shield'
            );
            const icon = ctx.itemIcons[item.id];
            const desc = item.desc ?? ctx.itemDescs[item.id] ?? '';
            const w = (item as { weight?: number }).weight ?? 0;
            const target = transferTarget[item.instance_id] ?? otherChars[0]?.id ?? '';
            return (
              <div key={item.instance_id} className={styles.invItem}>
                <div className={styles.invItemHeader}>
                  <span className={styles.invItemName}>
                    {icon} {item.name}
                    {isEquipped && (
                      <span className={styles.invBadge} style={{ color: 'var(--t-primary)' }}>
                        EQUIPPED
                      </span>
                    )}
                    {isAttuned && (
                      <span className={styles.invBadge} style={{ color: 'var(--t-primary)' }}>
                        ATTUNED
                      </span>
                    )}
                  </span>
                  <span className={styles.invItemMeta}>{w > 0 ? `${w} lb` : ''}</span>
                </div>
                {desc && <div className={styles.invItemDesc}>{desc}</div>}
                <div className={styles.invItemActions}>
                  {isEquippable && (
                    <button
                      className={styles.invBtn}
                      onClick={() => onEquip(item.instance_id, char.id)}
                    >
                      {isEquipped ? 'Unequip' : 'Equip'}
                    </button>
                  )}
                  {otherChars.length > 0 && !isEquipped && (
                    <>
                      <select
                        className={styles.invSelect}
                        value={target}
                        onChange={(e) =>
                          setTransferTarget((m) => ({ ...m, [item.instance_id]: e.target.value }))
                        }
                      >
                        {otherChars.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className={styles.invBtn}
                        onClick={() => onTransfer(item.instance_id, char.id, target)}
                        disabled={!target}
                      >
                        Give →
                      </button>
                    </>
                  )}
                  <button
                    className={styles.invBtn}
                    onClick={() => {
                      if (confirm(`Drop ${item.name}? It will be gone forever.`)) {
                        onDrop(item.instance_id, char.id);
                      }
                    }}
                  >
                    Drop
                  </button>
                </div>
              </div>
            );
          })
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
