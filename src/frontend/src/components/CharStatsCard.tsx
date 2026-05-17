import { useState, useEffect } from 'react';
import { S } from '../App';
import InventoryTooltip from './InventoryTooltip';
import type { Character, FrontendContext, GameState, Seed } from '../types';

function CharStatsCard({
  char,
  state,
  ctx,
  seed,
  onEquip,
  inCombat,
  onOpenMap,
}: {
  char:      Character;
  state:     GameState;
  ctx:       FrontendContext;
  seed:      Seed | null;
  onEquip:   (instanceId: string) => void;
  inCombat:  boolean;
  onOpenMap: () => void;
}) {
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (activeItemIdx === null) return;
    function close() { setActiveItemIdx(null); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeItemIdx]);

  const hpPct         = Math.round((char.hp / char.max_hp) * 100);
  const hpColor       = hpPct > 50 ? 'var(--t-hp-high)' : hpPct > 25 ? 'var(--t-hp-mid)' : 'var(--t-hp-low)';
  const equippedWeapon = char.inventory?.find(i => i.instance_id === char.equipped_weapon) ?? null;
  const equippedArmor  = char.inventory?.find(i => i.instance_id === char.equipped_armor)  ?? null;

  return (
    <div style={S.statsRow}>
      <div style={S.stat}>
        <span style={S.statLbl}>HP</span>
        <span style={{ ...S.statVal, color: hpColor }}>{char.hp}/{char.max_hp}</span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>AC</span>
        <span style={S.statVal}>{char.ac}</span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>LVL</span>
        <span style={S.statVal}>{char.level}</span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>HIT DICE</span>
        <span
          style={{
            ...S.statVal,
            color: (char.hit_dice_remaining ?? 0) > 0 ? 'var(--t-primary)' : 'var(--t-dim)',
          }}
        >
          {char.hit_dice_remaining ?? 0}/{char.level} (d{char.hit_die ?? 8})
        </span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>XP</span>
        <span style={S.statVal}>{char.xp}</span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>GOLD</span>
        <span style={S.statVal}>{char.gold}cr</span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>ROOM</span>
        <span style={S.statVal}>
          {seed?.rooms?.find(r => r.id === state.current_room)?.name ?? state.current_room}
        </span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>VISITED</span>
        <span style={S.statVal}>{state.visited_rooms?.length ?? 0}</span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>&nbsp;</span>
        <button
          onClick={onOpenMap}
          style={{
            background: 'transparent',
            border: '1px solid var(--t-border)',
            color: 'var(--t-dim)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '0.75rem',
            letterSpacing: '0.12em',
            padding: '2px 8px',
          }}
        >
          MAP
        </button>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>WEAPON</span>
        <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
          {equippedWeapon
            ? <>{ctx.itemIcons[equippedWeapon.id] ?? null}{equippedWeapon.name}</>
            : <span style={{ color: 'var(--t-dim)' }}>unarmed</span>}
        </span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>ARMOR</span>
        <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
          {equippedArmor
            ? <>{ctx.itemIcons[equippedArmor.id] ?? null}{equippedArmor.name}</>
            : <span style={{ color: 'var(--t-dim)' }}>none</span>}
        </span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>INVENTORY</span>
        <span style={{ ...S.statVal, display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {char.inventory?.length
            ? char.inventory.map((item, idx) => {
                const equipped   = item.instance_id === char.equipped_weapon || item.instance_id === char.equipped_armor || item.instance_id === char.equipped_shield;
                const equippable = !!(item.damage || item.slot === 'armor' || item.slot === 'shield') && !inCombat;
                const popoverOpen = activeItemIdx === idx;
                return (
                  <InventoryTooltip
                    key={item.instance_id}
                    text={equippable ? null : (item.desc ?? ctx.itemDescs[item.id])}
                  >
                    <span
                      onMouseDown={e => {
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
                          onMouseDown={e => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 6px)',
                            left: 0,
                            background: 'var(--t-card)',
                            border: '1px solid var(--t-border)',
                            padding: '0.3rem 0.5rem',
                            zIndex: 20,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--t-dim)',
                              letterSpacing: '0.1em',
                              marginBottom: 2,
                            }}
                          >
                            {item.desc ?? ctx.itemDescs[item.id]}
                          </span>
                          <button
                            style={{ ...S.choiceBtn, padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => { onEquip(item.instance_id); setActiveItemIdx(null); }}
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
