import { type ReactNode, useEffect, useRef } from 'react';
import styles from '../styles.module.css';

// Accessible modal primitive. Wraps the visual `.mapOverlay` / `.mapBox`
// classes (kept for theme parity) with the WAI-ARIA dialog pattern:
//
//   - role="dialog", aria-modal="true" so SR users hear "dialog"
//   - aria-labelledby points to the visible title for naming
//   - Tab/Shift+Tab wrap inside the dialog (focus trap)
//   - Escape closes
//   - Click on the backdrop closes (clicks inside the dialog box do not)
//   - On open: dialog is focused; on close: focus returns to the trigger
//
// Both modals in the app (InventoryModal, WorldMap) compose this — there's
// no second visual style to maintain.

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Optional width override (InventoryModal uses 720px; WorldMap uses
  // intrinsic). Plain CSS string passed through to inline style.
  width?: string;
  // Test hook so specs can find a specific dialog instance.
  testId?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function Dialog({ title, onClose, children, width, testId }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = `dlg-${useRef(Math.random().toString(36).slice(2, 9)).current}`;

  // Focus management: capture the previously focused element on mount,
  // focus the dialog, restore on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Defer one frame so the dialog is in the layout tree before we focus.
    queueMicrotask(() => boxRef.current?.focus());
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  // Escape + Tab trap on a single keydown listener bound to the dialog
  // box, not the document — this way other modals layered on top don't
  // double-handle the event.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const box = boxRef.current;
    if (!box) return;
    const focusables = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || active === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.mapOverlay} onClick={onClose}>
      <div
        ref={boxRef}
        className={styles.mapBox}
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-testid={testId}
      >
        <div className={styles.mapHeader}>
          <h2 id={titleId} className={styles.mapTitle}>
            {title}
          </h2>
          <button className={styles.mapCloseBtn} onClick={onClose} aria-label={`Close ${title}`}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Dialog;
