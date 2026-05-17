import { useState, ReactNode } from 'react';

// ─── Inventory Tooltip ────────────────────────────────────────────────────────
function InventoryTooltip({
  text,
  children,
}: {
  text: string | null | undefined;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  if (!text) return <>{children}</>;
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--t-card)',
            border: '1px solid var(--t-border)',
            color: 'var(--t-mid)',
            fontSize: '0.75rem',
            lineHeight: 1.5,
            letterSpacing: '0.03em',
            padding: '0.3rem 0.5rem',
            whiteSpace: 'nowrap',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export default InventoryTooltip;
