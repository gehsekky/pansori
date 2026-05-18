import type { Character, FrontendContext, GameState, Seed } from '../types';
import { useEffect, useState } from 'react';
import InventoryTooltip from './InventoryTooltip';
import styles from '../styles.module.css';

function CharStatsCard({
  char,
  state,
  ctx,
  seed,
  onEquip,
  inCombat,
  onOpenMap,
}: {
  char: Character;
  state: GameState;
  ctx: FrontendContext;
  seed: Seed | null;
  onEquip: (instanceId: string) => void;
  inCombat: boolean;
  onOpenMap: () => void;
}) {
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (activeItemIdx === null) return;
    function close() {
      setActiveItemIdx(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeItemIdx]);

  const hpPct = Math.round((char.hp / char.max_hp) * 100);
  const hpColor =
    hpPct > 50 ? 'var(--t-hp-high)' : hpPct > 25 ? 'var(--t-hp-mid)' : 'var(--t-hp-low)';
  const equippedWeapon =
    char.inventory?.find((i) => i.instance_id === char.equipped_weapon) ?? null;
  const equippedArmor = char.inventory?.find((i) => i.instance_id === char.equipped_armor) ?? null;

  return (
    <div className={styles.statsRow}>
      <div className={styles.stat}>
        <span className={styles.statLbl}>HP</span>
        <span className={styles.statVal} style={{ color: hpColor }}>
          {char.hp}/{char.max_hp}
          {(char.temp_hp ?? 0) > 0 && (
            <span style={{ color: 'var(--t-primary)', marginLeft: 4 }}>+{char.temp_hp}</span>
          )}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>AC</span>
        <span className={styles.statVal}>{char.ac}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>LVL</span>
        <span className={styles.statVal}>{char.level}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>HIT DICE</span>
        <span
          className={styles.statVal}
          style={{
            color: (char.hit_dice_remaining ?? 0) > 0 ? 'var(--t-primary)' : 'var(--t-dim)',
          }}
        >
          {char.hit_dice_remaining ?? 0}/{char.level} (d{char.hit_die ?? 8})
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>XP</span>
        <span className={styles.statVal}>{char.xp}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>GOLD</span>
        <span className={styles.statVal}>{char.gold}cr</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>ROOM</span>
        <span className={styles.statVal}>
          {seed?.rooms?.find((r) => r.id === state.current_room)?.name ?? state.current_room}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>VISITED</span>
        <span className={styles.statVal}>{state.visited_rooms?.length ?? 0}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>&nbsp;</span>
        <button className={styles.mapBtn} onClick={onOpenMap}>
          MAP
        </button>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>WEAPON</span>
        <span className={styles.statVal} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {equippedWeapon ? (
            <>
              {ctx.itemIcons[equippedWeapon.id] ?? null}
              {equippedWeapon.name}
            </>
          ) : (
            <span style={{ color: 'var(--t-dim)' }}>unarmed</span>
          )}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>ARMOR</span>
        <span className={styles.statVal} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {equippedArmor ? (
            <>
              {ctx.itemIcons[equippedArmor.id] ?? null}
              {equippedArmor.name}
            </>
          ) : (
            <span style={{ color: 'var(--t-dim)' }}>none</span>
          )}
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLbl}>INVENTORY</span>
        <span
          className={styles.statVal}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}
        >
          {char.inventory?.length
            ? char.inventory.map((item, idx) => {
                const equipped =
                  item.instance_id === char.equipped_weapon ||
                  item.instance_id === char.equipped_armor ||
                  item.instance_id === char.equipped_shield;
                const equippable =
                  !!(item.damage || item.slot === 'armor' || item.slot === 'shield') && !inCombat;
                const popoverOpen = activeItemIdx === idx;
                return (
                  <InventoryTooltip
                    key={item.instance_id}
                    text={equippable ? null : (item.desc ?? ctx.itemDescs[item.id])}
                  >
                    <span
                      onMouseDown={(e) => {
                        if (!equippable) return;
                        e.stopPropagation();
                        setActiveItemIdx(popoverOpen ? null : idx);
                      }}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        cursor: equippable ? 'pointer' : 'default',
                        color: equipped ? 'var(--t-primary)' : 'var(--t-item)',
                        textShadow: equipped ? '0 0 6px var(--t-primary)' : 'none',
                        borderBottom: equippable ? '1px dotted var(--t-dim)' : 'none',
                      }}
                    >
                      {ctx.itemIcons[item.id] ?? null}
                      {item.name}
                      {popoverOpen && (
                        <span
                          className={styles.itemPopover}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span className={styles.itemPopoverMeta}>
                            {item.desc ?? ctx.itemDescs[item.id]}
                          </span>
                          <button
                            className={styles.choiceBtn}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              onEquip(item.instance_id);
                              setActiveItemIdx(null);
                            }}
                          >
                            {equipped ? 'UNEQUIP' : 'EQUIP'}
                          </button>
                        </span>
                      )}
                    </span>
                  </InventoryTooltip>
                );
              })
            : '—'}
        </span>
      </div>
    </div>
  );
}

export default CharStatsCard;
