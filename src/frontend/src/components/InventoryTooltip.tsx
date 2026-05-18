import { useState, ReactNode } from 'react';
import styles from '../styles.module.css';

function InventoryTooltip({ text, children }: { text: string | null | undefined; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  if (!text) return <>{children}</>;
  return (
    <span
      className={styles.tooltipWrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && <span className={styles.tooltip}>{text}</span>}
    </span>
  );
}

export default InventoryTooltip;
